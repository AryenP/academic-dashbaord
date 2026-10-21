// "Actual" study time for the runway and checkpoints: what was logged, next to what was planned.
import { focusSeconds, type DayCourseMinutes } from './history';
import { dayKey, type ExamPrep } from './plan';
import type { Session } from './supabase';

export interface ActualSpan {
  id: string;
  course: string;
  a: number; // minutes past local midnight
  b: number;
  live?: boolean;
}

export interface Actuals {
  /** Time-accurate spans per day (owner only). */
  spans: Map<string, ActualSpan[]>;
  /** Focused minutes per day (owner and visitors). */
  dayMinutes: Map<string, number>;
}

const localMins = (iso: string) => {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
};

/** Splits sessions at midnight into per-day spans, including the live one up to `now`. */
export function buildActuals(
  sessions: Session[],
  totals: DayCourseMinutes[],
  live: Session | null,
  now: number,
): Actuals {
  const spans = new Map<string, ActualSpan[]>();
  const push = (day: string, s: ActualSpan) => spans.set(day, [...(spans.get(day) ?? []), s]);
  for (const s of live ? [...sessions, live] : sessions) {
    const endIso = s.ended_at ?? new Date(now).toISOString();
    const sd = dayKey(new Date(s.started_at));
    const ed = dayKey(new Date(endIso));
    const isLive = !s.ended_at;
    if (sd === ed)
      push(sd, {
        id: s.id,
        course: s.course,
        a: localMins(s.started_at),
        b: localMins(endIso),
        live: isLive,
      });
    else {
      push(sd, { id: s.id, course: s.course, a: localMins(s.started_at), b: 24 * 60, live: isLive });
      push(ed, { id: `${s.id}-2`, course: s.course, a: 0, b: localMins(endIso), live: isLive });
    }
  }
  const dayMinutes = new Map<string, number>();
  for (const t of totals) dayMinutes.set(t.day, (dayMinutes.get(t.day) ?? 0) + t.minutes);
  return { spans, dayMinutes };
}

export interface Readiness {
  actualHours: number;
  plannedHours: number;
  pct: number; // 0–100+, uncapped so "ahead of plan" shows
}

/**
 * Exam readiness = actual prep hours for that course before the exam ÷ planned prep hours.
 * With sessions (owner), "before" is exact; with daily totals (visitors), it's days up to and
 * including the exam day.
 */
export function readiness(exam: ExamPrep, sessions: Session[], totals: DayCourseMinutes[]): Readiness {
  const examStart = Date.parse(exam.start);
  let minutes = 0;
  if (sessions.length) {
    for (const s of sessions)
      if (s.course === exam.course && Date.parse(s.started_at) < examStart) minutes += focusSeconds(s) / 60;
  } else {
    for (const t of totals) if (t.course === exam.course && t.day <= exam.day) minutes += t.minutes;
  }
  const actualHours = Math.round((minutes / 60) * 10) / 10;
  const plannedHours = exam.prep_hours;
  return {
    actualHours,
    plannedHours,
    pct: plannedHours > 0 ? Math.round((actualHours / plannedHours) * 100) : 0,
  };
}
