// Supabase Edge Function: the AI's weekly review. POST {week?: 'YYYY-MM-DD'} (a Monday; default
// this week) as the signed-in person. Written once per week per person and kept; POST
// {week, again: true} rewrites it. The facts come from the database; the model never sees notes.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { appSecret, caller, CORS, json, overLimit, serviceClient } from '../_shared/auth.ts';
import { writeWeekly, type WeekFacts } from '../_shared/weekly.ts';
import { localIso } from '../../../src/lib/tz.ts';

const must = <T>({ data, error }: { data: T; error: unknown }): T => {
  if (error) throw error;
  return data;
};

/** Monday of the week containing `day` (YYYY-MM-DD). */
function monday(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wd = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - wd);
  return dt.toISOString().slice(0, 10);
}
const addDays = (day: string, n: number) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

export async function weekFacts(
  db: SupabaseClient,
  userId: string,
  week: string,
  tz: string,
  now: Date,
): Promise<WeekFacts> {
  const weekEnd = addDays(week, 6);
  const dayOf = (iso: string) => localIso(iso, tz).slice(0, 10);
  const sessions = must(
    await db
      .from('sessions')
      .select('course, started_at, ended_at, paused_seconds, break_seconds, focus_pct')
      .eq('user_id', userId)
      .not('ended_at', 'is', null)
      .gte('started_at', new Date(Date.parse(`${week}T00:00:00Z`) - 864e5).toISOString())
      .lte('started_at', new Date(Date.parse(`${weekEnd}T23:59:59Z`) + 864e5).toISOString()),
  ) as {
    course: string;
    started_at: string;
    ended_at: string;
    paused_seconds: number;
    break_seconds: number;
    focus_pct: number | null;
  }[];
  const inWeek = sessions.filter((s) => {
    const d = dayOf(s.started_at);
    return d >= week && d <= weekEnd;
  });
  const minutes = (s: (typeof sessions)[number]) =>
    Math.max(
      0,
      (Date.parse(s.ended_at) - Date.parse(s.started_at)) / 1000 - s.paused_seconds - s.break_seconds,
    ) / 60;
  const items = must(
    await db
      .from('plan_items')
      .select('kind, title, start_at, end_at, status, submitted_at, accepted, courses(code)')
      .eq('user_id', userId)
      .eq('accepted', true)
      .gte('end_at', `${week}T00:00:00Z`)
      .lte('start_at', new Date(now.getTime() + 21 * 864e5).toISOString()),
  ) as unknown as {
    kind: string;
    title: string;
    start_at: string;
    end_at: string;
    status: string;
    submitted_at: string | null;
    courses: { code: string } | null;
  }[];
  const planned = new Map<string, number>();
  const actual = new Map<string, number>();
  for (const i of items) {
    const d = dayOf(i.start_at);
    if (i.kind === 'study' && d >= week && d <= weekEnd) {
      const c = i.courses?.code ?? 'General';
      planned.set(c, (planned.get(c) ?? 0) + (Date.parse(i.end_at) - Date.parse(i.start_at)) / 60_000);
    }
  }
  for (const s of inWeek) actual.set(s.course, (actual.get(s.course) ?? 0) + minutes(s));
  const courses = [...new Set([...planned.keys(), ...actual.keys()])];
  const measured = inWeek
    .filter((s) => s.focus_pct != null && minutes(s) >= 15)
    .sort((a, b) => Number(b.focus_pct) - Number(a.focus_pct));
  const deadlines = { on_time: 0, late: 0, missed: 0 };
  for (const i of items) {
    const d = dayOf(i.end_at);
    if (i.kind !== 'deadline' || d < week || d > weekEnd) continue;
    if (i.status === 'submitted') {
      if (i.submitted_at && Date.parse(i.submitted_at) > Date.parse(i.end_at)) deadlines.late++;
      else deadlines.on_time++;
    } else if (i.status === 'missed' || Date.parse(i.end_at) < now.getTime()) deadlines.missed++;
  }
  const studiedAll = must(await db.rpc('prep_hours_by_course', { p_user: userId })) as {
    course: string;
    hours: number;
  }[];
  const upcoming = items
    .filter((i) => i.kind === 'exam' && Date.parse(i.start_at) > now.getTime())
    .slice(0, 4)
    .map((x) => ({
      course: x.courses?.code ?? 'General',
      title: x.title,
      days_away: Math.round((Date.parse(x.start_at) - now.getTime()) / 864e5),
      studied_hours: Number(studiedAll.find((s) => s.course === x.courses?.code)?.hours ?? 0),
      planned_hours:
        Math.round(
          items
            .filter(
              (i) =>
                i.kind === 'study' &&
                i.courses?.code === x.courses?.code &&
                Date.parse(i.end_at) <= Date.parse(x.start_at),
            )
            .reduce((t, i) => t + (Date.parse(i.end_at) - Date.parse(i.start_at)) / 3_600_000, 0) * 10,
        ) / 10,
    }));
  const streak = (must(await db.rpc('streak_days', { p_user: userId })) as number) ?? 0;
  const signals = must(
    await db
      .from('signals')
      .select('day, kind, value')
      .eq('user_id', userId)
      .gte('day', week)
      .lte('day', weekEnd),
  ) as { day: string; kind: string; value: number | string | null }[];
  const sleeps = signals.filter((x) => x.kind === 'sleep_h' && x.value != null).map((x) => Number(x.value));
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const pick = (s: (typeof sessions)[number] | undefined) =>
    s
      ? {
          course: s.course,
          minutes: Math.round(minutes(s)),
          focus_pct: s.focus_pct == null ? null : Number(s.focus_pct),
        }
      : null;
  return {
    week_start: week,
    week_end: weekEnd,
    planned_minutes: Math.round([...planned.values()].reduce((a, b) => a + b, 0)),
    actual_minutes: Math.round([...actual.values()].reduce((a, b) => a + b, 0)),
    by_course: courses.map((c) => ({
      course: c,
      planned_min: Math.round(planned.get(c) ?? 0),
      actual_min: Math.round(actual.get(c) ?? 0),
    })),
    sessions: inWeek.length,
    avg_focus_pct: measured.length
      ? r1(measured.reduce((t, s) => t + Number(s.focus_pct), 0) / measured.length)
      : null,
    best_session: pick(measured[0]),
    worst_session: measured.length > 1 ? pick(measured[measured.length - 1]) : null,
    streak_days: streak,
    deadlines,
    upcoming_exams: upcoming,
    late_night_minutes: Math.round(
      inWeek
        .filter((s) => Number(localIso(s.started_at, tz).slice(11, 13)) >= 23)
        .reduce((t, s) => t + minutes(s), 0),
    ),
    sleep_avg_h: sleeps.length ? r1(sleeps.reduce((a, b) => a + b, 0) / sleeps.length) : null,
    exercise_days: signals.filter((x) => x.kind === 'exercise_min' && Number(x.value) >= 30).length,
    signal_days: new Set(signals.map((x) => x.day)).size,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);
  const who = await caller(req);
  if (!who) return json({ ok: false, code: 'auth', message: 'Sign in first.' }, 401);
  const db = serviceClient();
  if (await overLimit(db, `weekly:${who.id}`, 4))
    return json({ ok: false, code: 'rate', message: 'Too many reviews in a minute.' }, 429);
  let body: { week?: string; again?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // empty is fine
  }
  try {
    const profile = must(await db.from('profiles').select('timezone').eq('id', who.id).single()) as {
      timezone: string;
    };
    const tz = profile.timezone || 'UTC';
    const now = new Date();
    const week = monday(
      body.week && /^\d{4}-\d{2}-\d{2}$/.test(body.week)
        ? body.week
        : localIso(now.getTime(), tz).slice(0, 10),
    );
    if (!body.again) {
      const kept = must(
        await db
          .from('weekly_reviews')
          .select('text, model, created_at')
          .eq('user_id', who.id)
          .eq('week', week)
          .maybeSingle(),
      ) as {
        text: string;
        model: string;
        created_at: string;
      } | null;
      if (kept) return json({ ok: true, week, ...kept, cached: true });
    }
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
    const facts = await weekFacts(db, who.id, week, tz, now);
    if (facts.sessions === 0 && facts.planned_minutes === 0)
      return json({
        ok: false,
        code: 'empty',
        message: 'Nothing happened this week yet, so there is nothing to review.',
      });
    const { text, usage } = await writeWeekly(facts, { model, apiKey });
    must(
      await db.rpc('ai_record', {
        p_user: who.id,
        p_input: usage.input_tokens,
        p_cached: usage.cached_tokens,
        p_output: usage.output_tokens,
        p_cents: usage.cents,
      }),
    );
    must(
      await db
        .from('weekly_reviews')
        .upsert({ user_id: who.id, week, text, model, created_at: now.toISOString() }),
    );
    return json({ ok: true, week, text, model, created_at: now.toISOString(), cached: false });
  } catch (e) {
    return json(
      { ok: false, code: 'review', message: e instanceof Error ? e.message : 'The review failed.' },
      502,
    );
  }
});
