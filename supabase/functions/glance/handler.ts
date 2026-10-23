// The glance: one line of plain text for a lock screen, a watch face, a menu bar or a Tasker
// notification. "Now: MATH 20C Series: lectures 8–10, 30 min left. Next: COGS 1 at 6 PM. MATH 20C
// Midterm 1 in 3 days, Sun 5 PM." The same shortcut token as the signals function, so a student
// who set up the Shortcut has nothing new to make. Separate from Deno.serve so it runs against a
// fake database in tests.
import { CORS, json } from '../_shared/auth.ts';
import { boardAt, countdown } from '../../../src/lib/board.ts';
import type { CourseInfo } from '../../../src/lib/courses.ts';
import { timePart, utc } from '../../../src/lib/plan.ts';
import { buildPlan, type ItemRow } from '../../../src/lib/planBuild.ts';
import { localIso } from '../../../src/lib/tz.ts';

export const RATE_LIMIT = 60; // requests per person per minute

export interface Store {
  ownerByTokenHash(tokenHash: string): Promise<string | null>;
  rateHit(key: string): Promise<number>;
  plan(userId: string): Promise<{ rows: ItemRow[]; courses: CourseInfo[]; timezone: string }>;
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface Glance {
  now: { course: string; title: string; left: string } | null;
  next: { course: string; title: string; at: string; in: string } | null;
  exam: { course: string; title: string; days: number; when: string; location: string } | null;
  text: string;
}

/** The sentence, from the plan, in the person's timezone. Pure. */
export function glanceAt(rows: ItemRow[], courses: CourseInfo[], tz: string, now: number): Glance {
  const data = buildPlan(rows, courses, tz, new Date(now));
  const b = boardAt(data.plan, data.exam_prep, now);
  const today = localIso(now, tz).slice(0, 10);
  const parts: string[] = [];
  const g: Glance = { now: null, next: null, exam: null, text: '' };
  if (b.current) {
    g.now = { course: b.current.course, title: b.current.title, left: countdown(b.seconds ?? 0) };
    parts.push(`Now: ${b.current.course} ${b.current.title}, ${plainLeft(b.seconds ?? 0)} left.`);
  }
  if (b.next) {
    const at = timePart(b.next).split('–')[0];
    const secs = Math.max(0, Math.round((Date.parse(b.next.start) - now) / 1000));
    g.next = { course: b.next.course, title: b.next.title, at, in: countdown(secs) };
    parts.push(
      b.next.day === today
        ? `Next: ${b.next.course} ${b.next.title} at ${at}.`
        : `Next: ${b.next.course} ${b.next.title}, ${b.next.when}.`,
    );
  }
  if (!b.current && !b.next)
    parts.push(data.plan.length ? 'Nothing left on the runway.' : 'Nothing on the runway yet.');
  if (b.exam) {
    const days = Math.round((utc(b.exam.day) - utc(today)) / 864e5);
    g.exam = {
      course: b.exam.course,
      title: b.exam.title,
      days,
      when: b.exam.when,
      location: b.exam.location,
    };
    const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
    parts.push(
      `${b.exam.course} ${b.exam.title} ${when}, ${b.exam.when}${b.exam.location ? `, ${b.exam.location}` : ''}.`,
    );
  }
  g.text = parts.join(' ');
  return g;
}

/** "30 min", "1 h 05", "2 d" for the sentence (countdown() keeps the clock form for the JSON). */
function plainLeft(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} h ${String(m % 60).padStart(2, '0')}` : `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

export async function handle(req: Request, store: Store, now = new Date()): Promise<Response> {
  if (req.method === 'OPTIONS')
    return new Response(null, {
      status: 204,
      headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET, OPTIONS' },
    });
  if (req.method !== 'GET' && req.method !== 'HEAD') return json({ ok: false, code: 'method' }, 405);
  const url = new URL(req.url);
  // The token in the header (Shortcuts) or in the query (a watch face, a Tasker task, a bookmark).
  const token = req.headers.get('x-runway-token') ?? url.searchParams.get('t') ?? '';
  if (!/^[0-9a-f]{48}$/.test(token))
    return json(
      { ok: false, code: 'token', message: 'Add your shortcut token as the x-runway-token header or ?t=.' },
      401,
    );
  const owner = await store.ownerByTokenHash(await sha256Hex(token));
  if (!owner)
    return json(
      {
        ok: false,
        code: 'token',
        message:
          "That token isn't valid any more. Make a new one in Settings, under “Sleep and exercise from your iPhone”.",
      },
      401,
    );
  if ((await store.rateHit(`glance:${owner}`)) > RATE_LIMIT)
    return json({ ok: false, code: 'rate', message: 'Too many looks in a minute.' }, 429);
  const { rows, courses, timezone } = await store.plan(owner);
  const g = glanceAt(rows, courses, timezone, now.getTime());
  const headers = { ...CORS, 'cache-control': 'private, max-age=60' };
  if (url.searchParams.get('format') === 'json')
    return new Response(req.method === 'HEAD' ? null : JSON.stringify(g), {
      headers: { ...headers, 'content-type': 'application/json' },
    });
  return new Response(req.method === 'HEAD' ? null : g.text + '\n', {
    headers: { ...headers, 'content-type': 'text/plain; charset=utf-8' },
  });
}
