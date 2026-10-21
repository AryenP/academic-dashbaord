// The weekly review: one week's plan vs. what happened.
import { readiness, type Readiness } from './actuals';
import { focusSeconds, totalsFromSessions } from './history';
import { dayKey, iso, utc, type ExamPrep, type PlanItem } from './plan';
import { streak, weekStart } from './stats';
import type { Session } from './supabase';

export interface CourseWeek {
  course: string;
  plannedMin: number;
  actualMin: number;
}

export interface WeekReview {
  from: string; // Monday
  to: string; // Sunday
  plannedMin: number;
  actualMin: number;
  byCourse: CourseWeek[];
  best: Session[];
  worst: Session[];
  readiness: { exam: ExamPrep; before: Readiness; after: Readiness }[];
  streak: number;
  sessions: number;
}

export function weekReview(
  plan: PlanItem[],
  exams: ExamPrep[],
  allSessions: Session[],
  anyDay: string,
  now: number,
): WeekReview {
  const today = dayKey(new Date(now));
  const from = weekStart(anyDay);
  const to = iso(utc(from) + 6 * 864e5);
  const inWeek = (day: string) => day >= from && day <= to;
  const sessions = allSessions.filter((s) => s.ended_at && inWeek(dayKey(new Date(s.started_at))));

  const planned = new Map<string, number>();
  for (const r of plan)
    if (r.kind === 'Study' && inWeek(r.day))
      planned.set(r.course, (planned.get(r.course) ?? 0) + r.hours * 60);
  const actual = new Map<string, number>();
  for (const t of totalsFromSessions(sessions)) actual.set(t.course, (actual.get(t.course) ?? 0) + t.minutes);
  const courses = [...new Set([...planned.keys(), ...actual.keys()])];
  const byCourse = courses
    .map((course) => ({
      course,
      plannedMin: Math.round(planned.get(course) ?? 0),
      actualMin: Math.round(actual.get(course) ?? 0),
    }))
    .sort((a, b) => b.plannedMin + b.actualMin - (a.plannedMin + a.actualMin));

  // Best and worst focus: measured sessions of at least 15 minutes, so a 2-minute blip isn't "best".
  const measured = sessions
    .filter((s) => s.focus_pct != null && focusSeconds(s) >= 15 * 60)
    .sort((a, b) => Number(b.focus_pct) - Number(a.focus_pct));
  const best = measured.slice(0, 3);
  const worst = measured.length > 3 ? measured.slice(-3).reverse() : [];

  // Readiness at the start of the week vs. at its end (or now), for exams not over by the week's start.
  const weekStartMs = Date.parse(`${from}T00:00:00`);
  const weekEndMs = Math.min(Date.parse(`${to}T23:59:59`), now);
  const until = (ms: number) => allSessions.filter((s) => s.ended_at && Date.parse(s.started_at) < ms);
  const upcoming = exams.filter((x) => Date.parse(x.end) > weekStartMs);
  const readinessRows = upcoming.map((exam) => ({
    exam,
    before: readiness(exam, until(weekStartMs), []),
    after: readiness(exam, until(weekEndMs), []),
  }));

  const sum = (xs: CourseWeek[], k: 'plannedMin' | 'actualMin') => xs.reduce((s, x) => s + x[k], 0);
  return {
    from,
    to,
    plannedMin: sum(byCourse, 'plannedMin'),
    actualMin: sum(byCourse, 'actualMin'),
    byCourse,
    best,
    worst,
    readiness: readinessRows,
    streak: streak(allSessions, to < today ? to : today),
    sessions: sessions.length,
  };
}
