// Supabase Edge Function: reads a syllabus PDF and proposes its exams and dated deadlines as
// plan items (accepted = false), each with the page and quote it came from in `reason`. POST
// {pdf: <base64>, course?: "DSC 140A"} as the signed-in person. Nothing is stored but the proposals.
import { appSecret, caller, CORS, json, overLimit, serviceClient } from '../_shared/auth.ts';
import { MAX_PDF_BYTES, readSyllabus } from '../_shared/syllabus.ts';
import { normalizeCode } from '../_shared/ai.ts';
import { atWallTime } from '../../../src/lib/tz.ts';

const must = <T>({ data, error }: { data: T; error: unknown }): T => {
  if (error) throw error;
  return data;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);
  const who = await caller(req);
  if (!who) return json({ ok: false, code: 'auth', message: 'Sign in first.' }, 401);
  const db = serviceClient();
  if (await overLimit(db, `syllabus:${who.id}`, 4))
    return json({ ok: false, code: 'rate', message: 'Too many syllabi in a minute. Wait a moment.' }, 429);
  let body: { pdf?: string; course?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, code: 'body' }, 400);
  }
  const pdf = typeof body.pdf === 'string' ? body.pdf : '';
  if (!pdf || !/^[A-Za-z0-9+/=]+$/.test(pdf))
    return json({ ok: false, code: 'body', message: 'Send the PDF as base64.' }, 400);
  if ((pdf.length * 3) / 4 > MAX_PDF_BYTES)
    return json({ ok: false, code: 'too_large', message: 'That PDF is larger than 10 MB.' }, 413);

  try {
    const budget = (
      must(await db.rpc('ai_budget', { p_user: who.id })) as {
        enabled: boolean;
        user_left: number;
        global_left: number;
      }[]
    )[0];
    const apiKey = await appSecret(db, 'ANTHROPIC_API_KEY');
    if (!budget?.enabled || !apiKey)
      return json({ ok: false, code: 'no_ai', message: "Runway's AI isn't set up on this server yet." });
    if (Number(budget.user_left) <= 0 || Number(budget.global_left) <= 0)
      return json({ ok: false, code: 'budget', message: "This month's AI budget is used up." });
    const model = String(
      (
        must(await db.from('app_config').select('value').eq('key', 'ai_model_classify').maybeSingle()) as {
          value: unknown;
        } | null
      )?.value ?? 'claude-haiku-5-5',
    );
    const { reading, usage } = await readSyllabus(pdf, { model, apiKey, hint: body.course });
    must(
      await db.rpc('ai_record', {
        p_user: who.id,
        p_input: usage.input_tokens,
        p_cached: usage.cached_tokens,
        p_output: usage.output_tokens,
        p_cents: usage.cents,
      }),
    );

    const profile = must(await db.from('profiles').select('timezone').eq('id', who.id).single()) as {
      timezone: string;
    };
    const tz = profile.timezone || 'UTC';
    const code =
      (body.course && normalizeCode(body.course)) ||
      (reading.course_code && normalizeCode(reading.course_code)) ||
      null;
    let courseId: string | null = null;
    if (code) {
      const courses = must(
        await db.from('courses').select('id, code, color, name').eq('user_id', who.id),
      ) as { id: string; code: string; color: number; name: string | null }[];
      const found = courses.find((c) => c.code === code);
      if (found) {
        courseId = found.id;
        if (!found.name && reading.course_name)
          await db.from('courses').update({ name: reading.course_name }).eq('id', found.id);
      } else {
        const used = new Set(courses.map((c) => c.color));
        let color = 6;
        for (let n = 1; n < 6; n++)
          if (!used.has(n)) {
            color = n;
            break;
          }
        courseId = (
          must(
            await db
              .from('courses')
              .insert({ user_id: who.id, code, name: reading.course_name, color })
              .select('id')
              .single(),
          ) as { id: string }
        ).id;
      }
    }

    // Existing exams and deadlines of this course, so a date already on the runway isn't proposed twice.
    const existing = courseId
      ? (must(
          await db
            .from('plan_items')
            .select('title, start_at, kind')
            .eq('user_id', who.id)
            .eq('course_id', courseId)
            .in('kind', ['exam', 'deadline']),
        ) as {
          title: string;
          start_at: string;
          kind: string;
        }[])
      : [];
    const draftId = crypto.randomUUID();
    const rows = [];
    let undated = 0;
    for (const it of reading.items) {
      if (!it.date) {
        undated++;
        continue;
      }
      const [sh, sm] = (it.time ?? (it.kind === 'exam' ? '09:00' : '23:00')).split(':').map(Number);
      const start = atWallTime(it.date, sh, sm, tz);
      const end = it.end_time
        ? atWallTime(it.date, ...(it.end_time.split(':').map(Number) as [number, number]), tz)
        : new Date(Date.parse(start) + (it.kind === 'exam' ? 2 : 1) * 3_600_000).toISOString();
      const dup = existing.some(
        (e) =>
          e.kind === it.kind &&
          Math.abs(Date.parse(e.start_at) - Date.parse(start)) < 36 * 3_600_000 &&
          e.title.toLowerCase().includes(it.title.toLowerCase().slice(0, 8)),
      );
      if (dup) continue;
      rows.push({
        user_id: who.id,
        course_id: courseId,
        kind: it.kind,
        title: it.title,
        start_at: start,
        end_at: end > start ? end : new Date(Date.parse(start) + 3_600_000).toISOString(),
        location: it.location ?? '',
        weight: it.weight,
        take_home: it.take_home,
        reason: `Syllabus${it.page ? `, p. ${it.page}` : ''}: “${it.quote}”`,
        source: 'ai',
        accepted: false,
        draft_id: draftId,
      });
    }
    if (rows.length) must(await db.from('plan_items').insert(rows));
    return json({
      ok: true,
      course: code,
      course_name: reading.course_name,
      term: reading.term,
      proposed: rows.length,
      undated,
      grading: reading.grading,
      model,
      cents: Math.round(usage.cents * 100) / 100,
    });
  } catch (e) {
    return json(
      { ok: false, code: 'read', message: e instanceof Error ? e.message : 'The reading failed.' },
      502,
    );
  }
});
