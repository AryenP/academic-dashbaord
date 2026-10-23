// The honest readiness: not an adjective, the arithmetic a student would do on paper. Hours
// actually studied for the course so far, the pace of the last seven days, and where that pace
// lands by exam day, next to what the plan still holds. Never on share pages.
import { focusSeconds } from './history';
import { dayName, isPast, prepBlocks, round1, type ExamPrep, type PlanItem } from './plan';
import type { Session } from './supabase';

export const PACE_DAYS = 7;

export interface Pace {
  /** Focused hours for the course before the exam, so far. */
  done: number;
  /** Focused hours per day over the last seven days. */
  perDay: number;
  /** `done` plus the pace carried to the exam. */
  projected: number;
  /** Hours of accepted study blocks for the exam that haven't run yet. */
  left: number;
  /** Hours on the plan in total (the checkpoint's own number). */
  planned: number;
  daysLeft: number;
}

export function pace(exam: ExamPrep, plan: PlanItem[], sessions: Session[], now: number): Pace | null {
  const examStart = Date.parse(exam.start);
  if (isPast(exam, now)) return null;
  let doneSec = 0;
  let recentSec = 0;
  const since = now - PACE_DAYS * 864e5;
  for (const s of sessions) {
    if (s.course !== exam.course || !s.ended_at) continue;
    const t = Date.parse(s.started_at);
    if (t >= examStart) continue;
    const f = focusSeconds(s);
    doneSec += f;
    if (t >= since && t < now) recentSec += f;
  }
  const daysLeft = Math.max(0, (examStart - now) / 864e5);
  const perDay = recentSec / 3600 / PACE_DAYS;
  const done = round1(doneSec / 3600);
  const left = round1(
    prepBlocks(plan, exam)
      .filter((r) => !isPast(r, now))
      .reduce((a, r) => a + r.hours, 0),
  );
  return {
    done,
    perDay: round1(perDay),
    projected: Math.round((doneSec / 3600 + perDay * daysLeft) * 2) / 2,
    left,
    planned: exam.prep_hours,
    daysLeft: Math.round(daysLeft * 10) / 10,
  };
}

/** One sentence, the inputs showing, no verdict. */
export function paceWords(p: Pace, exam: ExamPrep, now: number): string {
  const day = dayName(exam.day, new Date(now));
  const by = day === 'Today' ? 'today' : day === 'Tomorrow' ? 'by tomorrow' : `by ${day}`;
  if (p.done === 0 && p.perDay === 0)
    return p.left > 0
      ? `Nothing logged for ${exam.course} yet; ${p.left} h of blocks still ahead ${by}.`
      : `Nothing logged for ${exam.course} yet, and no blocks ahead ${by}.`;
  if (p.daysLeft < 1) return `${p.done} h logged for ${exam.course}. Nothing to add today but the exam.`;
  const atPace = `At this pace, about ${p.projected} of ${p.planned} h ${by}`;
  if (p.left === 0) return `${atPace}; no blocks left on the plan.`;
  return `${atPace}; ${p.left} h of blocks still ahead.`;
}
