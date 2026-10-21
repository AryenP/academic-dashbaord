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

/** Sessions with a focus %, oldest first, for the trend chart. */
export const focusTrend = (sessions: Session[], n = 30) =>
  sessions
    .filter((s) => s.focus_pct != null && s.ended_at)
    .sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at))
    .slice(-n)
    .map((s) => ({
      id: s.id,
      day: dayKey(new Date(s.started_at)),
      course: s.course,
      pct: Number(s.focus_pct),
    }));

/** Pickups per focused hour over sessions with phone tracking, started on or after `fromDay`. */
export function pickupsPerHour(sessions: Session[], fromDay: string): number | null {
  let pickups = 0;
  let sec = 0;
  for (const s of sessions)
    if (s.pickups != null && dayKey(new Date(s.started_at)) >= fromDay) {
      pickups += s.pickups;
      sec += focusSeconds(s);
    }
  return sec >= 600 ? Math.round((pickups / (sec / 3600)) * 10) / 10 : null;
}

export interface HeatCell {
  weekday: number; // 0 = Monday
  hour: number;
  pct: number | null; // average focus %, weighted by minutes
  minutes: number;
}

/**
 * Average focus % by weekday and hour of day, weighted by how many minutes of each session fell in
 * that hour. Only sessions with phone tracking count.
 */
export function bestHours(sessions: Session[], hours: number[]): HeatCell[] {
  const acc = new Map<string, { w: number; sum: number }>();
  for (const s of sessions) {
    if (s.focus_pct == null || !s.ended_at) continue;
    const pct = Number(s.focus_pct);
    let t = Date.parse(s.started_at);
    const end = Date.parse(s.ended_at);
    while (t < end) {
      const d = new Date(t);
      const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime();
      const stop = Math.min(next, end);
      const k = `${(d.getDay() + 6) % 7}|${d.getHours()}`;
      const a = acc.get(k) ?? { w: 0, sum: 0 };
      const min = (stop - t) / 60_000;
      a.w += min;
      a.sum += pct * min;
      acc.set(k, a);
      t = stop;
    }
  }
  const cells: HeatCell[] = [];
  for (let weekday = 0; weekday < 7; weekday++)
    for (const hour of hours) {
      const a = acc.get(`${weekday}|${hour}`);
      cells.push({
        weekday,
        hour,
        pct: a && a.w >= 1 ? Math.round(a.sum / a.w) : null,
        minutes: Math.round(a?.w ?? 0),
      });
    }
  return cells;
}
