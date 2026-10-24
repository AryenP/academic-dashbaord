// The term in the student's own numbers: when it ran, how much focused time went in, the week that
// went best, each course's hours and each exam's prep next to what was planned. A term is the run
// of activity since the last gap of three weeks with nothing on the runway and no sessions, so a
// quarter, a semester and a summer session all come out right without knowing the school's
// calendar. Pure: the page fetches, this counts.
import { iso, utc } from './plan.ts';
import { localIso } from './tz.ts';

export const TERM_GAP_DAYS = 21;

export interface TermSession {
  course: string;
  started_at: string;
  ended_at: string | null;
  paused_seconds: number;
  break_seconds: number;
  focus_pct: number | string | null;
}

export interface TermItem {
  id: string;
  kind: string; // 'exam' | 'study' | ...
  course: string | null;
  title: string;
  start_at: string;
  end_at: string;
  score?: number | string | null;
  max_score?: number | string | null;
}

export interface TermExam {
  id: string;
  course: string;
  title: string;
  day: string;
  studied: number;
  planned: number;
  score: string | null;
}

export interface Term {
  start: string;
  end: string;
  weeks: number;
  /** The last exam has passed and nothing is ahead on the runway. */
  over: boolean;
  hours: number;
  sessions: number;
  /** Focus % weighted by length, over the sessions the phone measured; null when none were. */
  focusPct: number | null;
  bestWeek: { start: string; hours: number } | null;
  courses: { course: string; hours: number }[];
  exams: TermExam[];
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const focusSec = (s: TermSession) =>
  s.ended_at
    ? Math.max(
        0,
        (Date.parse(s.ended_at) - Date.parse(s.started_at)) / 1000 - s.paused_seconds - s.break_seconds,
      )
    : 0;
const monday = (day: string) => iso(utc(day) - ((new Date(utc(day)).getUTCDay() + 6) % 7) * 864e5);

/** First and last day of the current (or just finished) term, from the days anything happened. */
export function termSpan(days: string[], today: string): { start: string; end: string } | null {
  const uniq = [...new Set(days)].sort();
  if (!uniq.length) return null;
  // Work back from the activity nearest today: the term is what joins up to it without a long gap.
  let i = uniq.findLastIndex((d) => d <= today);
  if (i < 0) i = 0;
  // Forward: everything ahead belongs to the same term while it keeps joining up.
  let j = i;
  while (j + 1 < uniq.length && (utc(uniq[j + 1]) - utc(uniq[j])) / 864e5 < TERM_GAP_DAYS) j++;
  let k = i;
  while (k > 0 && (utc(uniq[k]) - utc(uniq[k - 1])) / 864e5 < TERM_GAP_DAYS) k--;
  return { start: uniq[k], end: uniq[j] };
}

export function term(items: TermItem[], sessions: TermSession[], tz: string, now: number): Term | null {
  const day = (t: string | number) => localIso(t, tz).slice(0, 10);
  const today = day(now);
  const finished = sessions.filter((s) => s.ended_at);
  const span = termSpan(
    [...items.map((i) => day(i.start_at)), ...finished.map((s) => day(s.started_at))],
    today,
  );
  if (!span) return null;
  const inTerm = (d: string) => d >= span.start && d <= span.end;
  const ss = finished.filter((s) => inTerm(day(s.started_at)));
  const its = items.filter((i) => inTerm(day(i.start_at)));

  const totalSec = ss.reduce((a, s) => a + focusSec(s), 0);
  const measured = ss.filter((s) => s.focus_pct != null && focusSec(s) > 0);
  const mSec = measured.reduce((a, s) => a + focusSec(s), 0);
  const focusPct =
    mSec > 0 ? Math.round(measured.reduce((a, s) => a + Number(s.focus_pct) * focusSec(s), 0) / mSec) : null;

  const byWeek = new Map<string, number>();
  const byCourse = new Map<string, number>();
  for (const s of ss) {
    const w = monday(day(s.started_at));
    byWeek.set(w, (byWeek.get(w) ?? 0) + focusSec(s));
    byCourse.set(s.course, (byCourse.get(s.course) ?? 0) + focusSec(s));
  }
  const best = [...byWeek.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];

  const exams: TermExam[] = its
    .filter((i) => i.kind === 'exam' && i.course)
    .sort((a, b) => (a.start_at < b.start_at ? -1 : 1))
    .map((x) => {
      const t = Date.parse(x.start_at);
      const studied = ss
        .filter((s) => s.course === x.course && Date.parse(s.started_at) < t)
        .reduce((a, s) => a + focusSec(s), 0);
      const planned = its
        .filter((i) => i.kind === 'study' && i.course === x.course && Date.parse(i.end_at) <= t)
        .reduce((a, i) => a + (Date.parse(i.end_at) - Date.parse(i.start_at)) / 1000, 0);
      const score =
        x.score != null && x.score !== ''
          ? `${Number(x.score)}${x.max_score != null ? ` / ${Number(x.max_score)}` : ''}`
          : null;
      return {
        id: x.id,
        course: x.course!,
        title: x.title,
        day: day(x.start_at),
        studied: r1(studied / 3600),
        planned: r1(planned / 3600),
        score,
      };
    });

  const pastExam = exams.some((x) => x.day <= today);
  const ahead = its.some((i) => Date.parse(i.end_at) > now);
  return {
    ...span,
    weeks: Math.max(1, Math.ceil((utc(span.end) - utc(span.start) + 864e5) / (7 * 864e5))),
    over: pastExam && !ahead,
    hours: r1(totalSec / 3600),
    sessions: ss.length,
    focusPct,
    bestWeek: best ? { start: best[0], hours: r1(best[1] / 3600) } : null,
    courses: [...byCourse.entries()]
      .map(([course, sec]) => ({ course, hours: r1(sec / 3600) }))
      .sort((a, b) => b.hours - a.hours),
    exams,
  };
}
