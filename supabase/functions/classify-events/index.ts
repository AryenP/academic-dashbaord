// Supabase Edge Function: Claude reads the events the title rules were unsure about.
//
//   POST with the person's JWT, {} or {all: true}: their own pending events (all: every live
//        event, for a fresh read), then their plan is rebuilt. Answers counts for the review screen.
//   POST with x-sync-key: the nightly pass over everyone with pending events, within a time budget.
//
// Each call is metered in ai_usage against the caps in app_config, and nothing is written until
// the model has answered. Readings go on the event row; override > AI > rules when the plan is built.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { classifyWithClaude, MAX_PER_CALL, type AiEvent } from '../_shared/ai.ts';
import { appSecret, caller, CORS, json, overLimit, serviceClient } from '../_shared/auth.ts';
import { rebuildPlan, type EventRow, type Source } from '../_shared/sync.ts';
import { dbStore } from '../sync-sources/store.ts';
import { localIso } from '../../../src/lib/tz.ts';

const BUDGET_MS = 50_000;
const UNSURE_BELOW = 0.85;

const must = <T>({ data, error }: { data: T; error: unknown }): T => {
  if (error) throw error;
  return data;
};

type Pending = EventRow & { source_id: string; source_kind: Source['kind']; calendar: string | null };

async function pendingFor(db: SupabaseClient, userId: string, all: boolean): Promise<Pending[]> {
  let q = db
    .from('events')
    .select(
      'id, uid, recurrence_id, hash, title, start_at, end_at, all_day, location, kind, course_code, confidence, override, ai_hash, ai_kind, ai_course_code, plan_item_id, deleted_at, source_id, calendar_sources(kind, label)',
    )
    .eq('user_id', userId)
    .is('deleted_at', null)
    .gte('end_at', new Date(Date.now() - 7 * 864e5).toISOString())
    .order('start_at')
    .limit(1000);
  if (!all) q = q.lt('confidence', UNSURE_BELOW);
  const rows = must(await q) as unknown as (EventRow & {
    source_id: string;
    calendar_sources: { kind: Source['kind']; label: string } | null;
  })[];
  return rows
    .filter((r) => all || r.ai_hash !== r.hash)
    .map((r) => ({
      ...r,
      source_kind: r.calendar_sources?.kind ?? 'ical',
      calendar: r.calendar_sources?.label ?? null,
    }));
}

/** Reads one person's pending events. Returns what was read and spent. */
async function readFor(db: SupabaseClient, userId: string, all: boolean, deadline: number) {
  const budget = (
    must(await db.rpc('ai_budget', { p_user: userId })) as {
      enabled: boolean;
      user_left: number;
      global_left: number;
    }[]
  )[0];
  if (!budget?.enabled) return { read: 0, skipped: 'off' as const };
  if (Number(budget.user_left) <= 0) return { read: 0, skipped: 'user_budget' as const };
  if (Number(budget.global_left) <= 0) return { read: 0, skipped: 'global_budget' as const };
  const model = String(
    (
      must(await db.from('app_config').select('value').eq('key', 'ai_model_classify').maybeSingle()) as {
        value: unknown;
      } | null
    )?.value ?? 'claude-opus-5-5',
  );
  const apiKey = await appSecret(db, 'ANTHROPIC_API_KEY');
  if (!apiKey) return { read: 0, skipped: 'no_key' as const };
  const tz =
    (
      must(await db.from('profiles').select('timezone').eq('id', userId).maybeSingle()) as {
        timezone: string;
      } | null
    )?.timezone ?? 'UTC';
  const courses = must(await db.from('courses').select('code, name').eq('user_id', userId)) as {
    code: string;
    name: string | null;
  }[];
  const pending = await pendingFor(db, userId, all);
  let read = 0;
  let spent = 0;
  const touched = new Set<string>();
  for (let i = 0; i < pending.length && Date.now() < deadline; i += MAX_PER_CALL) {
    const batch = pending.slice(i, i + MAX_PER_CALL);
    const events: AiEvent[] = batch.map((e) => ({
      id: e.id,
      title: e.title,
      start: localIso(e.start_at, tz),
      end: localIso(e.end_at, tz),
      all_day: e.all_day,
      location: e.location,
      source_kind: e.source_kind,
      calendar: e.calendar ?? undefined,
      rules: { kind: e.kind, course_code: e.course_code, confidence: Number(e.confidence) },
    }));
    const { readings, usage } = await classifyWithClaude(events, {
      model,
      apiKey,
      timezone: tz,
      knownCourses: courses,
    });
    must(
      await db.rpc('ai_record', {
        p_user: userId,
        p_input: usage.input_tokens,
        p_cached: usage.cached_tokens,
        p_output: usage.output_tokens,
        p_cents: usage.cents,
      }),
    );
    spent += usage.cents;
    const byId = new Map(batch.map((e) => [e.id, e]));
    const now = new Date().toISOString();
    for (const r of readings) {
      const e = byId.get(r.id);
      if (!e) continue;
      must(
        await db
          .from('events')
          .update({
            ai_hash: e.hash,
            ai_kind: r.kind,
            ai_course_code: r.course_code,
            ai_course_name: r.course_name,
            ai_confidence: r.confidence,
            ai_weight: r.weight,
            ai_take_home: r.take_home,
            ai_reason: r.reason,
            ai_at: now,
          })
          .eq('id', e.id),
      );
      touched.add(e.source_id);
      read++;
      // A course the AI named gets its long name, if the course exists and has none.
      if (r.course_code && r.course_name) {
        const c = courses.find((x) => x.code === r.course_code);
        if (c && !c.name) {
          await db
            .from('courses')
            .update({ name: r.course_name })
            .eq('user_id', userId)
            .eq('code', r.course_code)
            .is('name', null);
          c.name = r.course_name;
        }
      }
    }
    if (spent >= Number(budget.user_left)) break;
  }
  // Rebuild the plan for every source that got a reading.
  const store = dbStore(db);
  for (const sourceId of touched) {
    const src = must(
      await db
        .from('calendar_sources')
        .select('id, user_id, kind, etag, last_modified')
        .eq('id', sourceId)
        .single(),
    ) as Source;
    await rebuildPlan(store, src);
  }
  return {
    read,
    pending: pending.length,
    spent: Math.round(spent * 100) / 100,
    model,
    touched: touched.size,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);
  const service = serviceClient();
  const deadline = Date.now() + BUDGET_MS;

  const key = await appSecret(service, 'SYNC_KEY');
  if (key && req.headers.get('x-sync-key') === key) {
    // Everyone with something pending, until the time budget runs out.
    const users = must(
      await service
        .from('events')
        .select('user_id')
        .is('deleted_at', null)
        .lt('confidence', UNSURE_BELOW)
        .gte('end_at', new Date(Date.now() - 7 * 864e5).toISOString())
        .limit(2000),
    ) as { user_id: string }[];
    const ids = [...new Set(users.map((u) => u.user_id))];
    const results: Record<string, unknown>[] = [];
    for (const id of ids) {
      if (Date.now() > deadline) break;
      try {
        results.push({ user: id, ...(await readFor(service, id, false, deadline)) });
      } catch (e) {
        results.push({ user: id, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return json({ ok: true, users: ids.length, results });
  }

  const who = await caller(req);
  if (!who) return json({ ok: false, code: 'auth', message: 'Sign in first.' }, 401);
  if (await overLimit(service, `classify:${who.id}`, 6))
    return json({ ok: false, code: 'rate', message: 'Too many reads in a minute. Wait a moment.' }, 429);
  let body: { all?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // an empty body is fine
  }
  try {
    const r = await readFor(service, who.id, body.all === true, deadline);
    return json({ ok: true, ...r });
  } catch (e) {
    return json(
      { ok: false, code: 'ai', message: e instanceof Error ? e.message : 'The reading failed.' },
      502,
    );
  }
});
