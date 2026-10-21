// Numbers for the stats page. Each is a plain sum or ratio that the page explains in one line.
import { focusSeconds, type DayCourseMinutes } from './history';
import { dayKey, iso, utc, type PlanItem } from './plan';
import type { Session } from './supabase';

export interface CourseHours {
  course: string;
  minutes: number;
}

/** Minutes per course for days in [from, to] (inclusive, YYYY-MM-DD), biggest first. */
export function minutesByCourse(totals: DayCourseMinutes[], from: string, to: string): CourseHours[] {
  const m = new Map<string, number>();
  for (const t of totals)
    if (t.day >= from && t.day <= to) m.set(t.course, (m.get(t.course) ?? 0) + t.minutes);
  return [...m.entries()]
    .map(([course, minutes]) => ({ course, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
}

/** Monday of the week containing `day`. */
export function weekStart(day: string): string {
  const d = new Date(utc(day));
  const back = (d.getUTCDay() + 6) % 7;
  return iso(utc(day) - back * 864e5);
}

export interface PlannedActual {
  day: string;
  plannedMin: number;
  actualMin: number;
}

/** Planned study minutes (calendar) vs logged minutes, for each day in the range. */
export function plannedVsActual(
  plan: PlanItem[],
  totals: DayCourseMinutes[],
  days: string[],
): PlannedActual[] {
  return days.map((day) => ({
    day,
    plannedMin: Math.round(
      plan.filter((r) => r.kind === 'Study' && r.day === day).reduce((s, r) => s + r.hours * 60, 0),
    ),
    actualMin: totals.filter((t) => t.day === day).reduce((s, t) => s + t.minutes, 0),
  }));
}

/** Days in a row, ending today (or yesterday, if today has nothing yet), with at least one finished session. */
export function streak(sessions: Session[], today: string): number {
  const days = new Set(
    sessions.filter((s) => s.ended_at && focusSeconds(s) > 0).map((s) => dayKey(new Date(s.started_at))),
  );
  let t = utc(today);
  if (!days.has(today)) t -= 864e5;
  let n = 0;
  while (days.has(iso(t))) {
    n++;
    t -= 864e5;
  }
  return n;
}

export const lastNDays = (today: string, n: number) =>
  Array.from({ length: n }, (_, i) => iso(utc(today) - (n - 1 - i) * 864e5));
