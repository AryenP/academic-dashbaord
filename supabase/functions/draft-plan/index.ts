// Supabase Edge Function: drafts study blocks before the person's exams. POST {} as the signed-in
// person (optionally {exam_id} to focus on one exam). Free time comes from everything accepted on
// the runway; Claude places the blocks when the AI is set up and within budget, else the plain
// allocator does. Proposals are plan_items with accepted = false; the runway shows them dashed.
import { appSecret, caller, CORS, json, overLimit, serviceClient } from '../_shared/auth.ts';
import {
  allocate,
  draftWithClaude,
  freeSlots,
  hoursNeeded,
  preferredHours,
  settingsFrom,
  validate,
  type Block,
  type Exam,
} from '../_shared/planner.ts';

const must = <T>({ data, error }: { data: T; error: unknown }): T => {
  if (error) throw error;
  return data;
};

const HORIZON_DAYS = 45;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);
  const who = await caller(req);
  if (!who) return json({ ok: false, code: 'auth', message: 'Sign in first.' }, 401);
  const db = serviceClient();
  if (await overLimit(db, `draft:${who.id}`, 6))
    return json({ ok: false, code: 'rate', message: 'Too many drafts in a minute. Wait a moment.' }, 429);
  let body: { exam_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    // empty is fine
  }

  try {
    const now = Date.now();
    const profile = must(
      await db.from('profiles').select('timezone, settings').eq('id', who.id).single(),
    ) as {
      timezone: string;
      settings: unknown;
    };
    const tz = profile.timezone || 'UTC';
    const settings = settingsFrom(profile.settings);
    const to = new Date(now + HORIZON_DAYS * 864e5);

    // Everything accepted on the runway in the horizon: exams to plan for, and busy time.
    const items = must(
      await db
        .from('plan_items')
        .select('id, kind, title, start_at, end_at, weight, take_home, accepted, for_item_id, courses(code)')
        .eq('user_id', who.id)
        .gte('end_at', new Date(now).toISOString())
        .lte('start_at', to.toISOString())
        .limit(3000),
    ) as unknown as {
      id: string;
      kind: string;
      title: string;
      start_at: string;
      end_at: string;
      weight: number | null;
      take_home: boolean;
      accepted: boolean;
      for_item_id: string | null;
      courses: { code: string } | null;
    }[];
    const accepted = items.filter((i) => i.accepted);
    const studied = new Map(
      (
        (must(await db.rpc('prep_hours_by_course', { p_user: who.id })) as {
          course: string;
          hours: number;
        }[]) ?? []
      ).map((r) => [r.course, Number(r.hours)]),
    );
    let exams: Exam[] = accepted
      .filter((i) => i.kind === 'exam' && Date.parse(i.start_at) > now)
      .map((x) => ({
        id: x.id,
        course: x.courses?.code ?? 'General',
        title: x.title,
        start_at: x.start_at,
        weight: x.weight == null ? null : Number(x.weight),
        take_home: x.take_home,
        planned_hours:
          Math.round(
            accepted
              .filter(
                (s) =>
                  s.kind === 'study' &&
                  s.courses?.code === x.courses?.code &&
                  Date.parse(s.end_at) <= Date.parse(x.start_at),
              )
              .reduce((t, s) => t + (Date.parse(s.end_at) - Date.parse(s.start_at)) / 3_600_000, 0) * 10,
          ) / 10,
        studied_hours: studied.get(x.courses?.code ?? '') ?? 0,
      }));
    if (body.exam_id) exams = exams.filter((x) => x.id === body.exam_id);
    if (!exams.length)
      return json({ ok: true, blocks: 0, message: 'No upcoming exam to plan for. Add one first.' });

    const busy = accepted.map((i) => ({ start_at: i.start_at, end_at: i.end_at }));
    const slots = freeSlots(new Date(now), to, busy, settings, tz);
    const need = hoursNeeded(exams, now);
    if ([...need.values()].every((h) => h <= 0))
      return json({ ok: true, blocks: 0, message: 'Every exam already has enough study time planned.' });

    // Claude places the blocks when it can; otherwise the plain allocator.
    let blocks: Block[] = [];
    let by: 'ai' | 'rules' = 'rules';
    let model: string | null = null;
    const budget = (
      must(await db.rpc('ai_budget', { p_user: who.id })) as {
        enabled: boolean;
        user_left: number;
        global_left: number;
      }[]
    )[0];
    const apiKey = await appSecret(db, 'ANTHROPIC_API_KEY');
    // Hours that have worked for this student in the last two weeks: a hint to the model, first
    // pick within a day for the allocator.
    const recent = must(
      await db
        .from('sessions')
        .select('started_at, focus_pct')
        .eq('user_id', who.id)
        .not('ended_at', 'is', null)
        .not('focus_pct', 'is', null)
        .gte('started_at', new Date(now - 14 * 864e5).toISOString()),
    ) as { started_at: string; focus_pct: number | string | null }[];
    const preferred = preferredHours(recent, tz);
    if (budget?.enabled && Number(budget.user_left) > 0 && Number(budget.global_left) > 0 && apiKey) {
      model = String(
        (
          must(await db.from('app_config').select('value').eq('key', 'ai_model_classify').maybeSingle()) as {
            value: unknown;
          } | null
        )?.value ?? 'claude-haiku-5-5',
      );
      try {
        const r = await draftWithClaude(exams, slots, settings, {
          model,
          apiKey,
          timezone: tz,
          preferredHours: preferred,
        });
        must(
          await db.rpc('ai_record', {
            p_user: who.id,
            p_input: r.usage.input_tokens,
            p_cached: r.usage.cached_tokens,
            p_output: r.usage.output_tokens,
            p_cents: r.usage.cents,
          }),
        );
        blocks = r.blocks;
        by = 'ai';
      } catch (e) {
        console.error('draft via Claude failed, using the allocator:', e instanceof Error ? e.message : e);
      }
    }
    let dropped = 0;
    if (by === 'ai') {
      const v = validate(blocks, exams, slots, settings, tz);
      blocks = v.kept;
      dropped = v.dropped;
    }
    if (!blocks.length) {
      blocks = allocate(exams, slots, settings, now, { hours: preferred, tz });
      by = 'rules';
    }

    // Replace any earlier proposals that were never accepted.
    must(await db.from('plan_items').delete().eq('user_id', who.id).eq('accepted', false));
    const courses = must(await db.from('courses').select('id, code').eq('user_id', who.id)) as {
      id: string;
      code: string;
    }[];
    const draftId = crypto.randomUUID();
    const rows = blocks.map((b) => ({
      user_id: who.id,
      course_id: courses.find((c) => c.code === b.course)?.id ?? null,
      kind: 'study',
      title: b.title,
      start_at: b.start_at,
      end_at: b.end_at,
      reason: b.reason,
      source: 'ai',
      accepted: false,
      for_item_id: b.exam_id,
      draft_id: draftId,
    }));
    if (rows.length) must(await db.from('plan_items').insert(rows));
    const hours =
      Math.round(
        blocks.reduce((t, b) => t + (Date.parse(b.end_at) - Date.parse(b.start_at)) / 3_600_000, 0) * 10,
      ) / 10;
    return json({
      ok: true,
      draft_id: draftId,
      blocks: blocks.length,
      hours,
      by,
      model,
      dropped,
      exams: exams.length,
    });
  } catch (e) {
    return json(
      { ok: false, code: 'draft', message: e instanceof Error ? e.message : 'The draft failed.' },
      500,
    );
  }
});
