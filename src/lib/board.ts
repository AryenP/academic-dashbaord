// The second screen: what is happening now, what comes next, and the next exam, from the plan the
// runway already draws. Pure, so the kiosk page is a thin view over it.
import { daysUntil, isNow, isPast, type ExamPrep, type PlanItem } from './plan';

export interface Board {
  /** The block happening now, study first if two overlap. */
  current: PlanItem | null;
  /** The next block after now (or after the current one). */
  next: PlanItem | null;
  /** Seconds until the current block ends, else until the next one starts; null with nothing ahead. */
  seconds: number | null;
  /** The next exam that hasn't finished. */
  exam: ExamPrep | null;
  daysToExam: number;
}

const rank = (r: PlanItem) => (r.kind === 'Study' ? 0 : r.kind === 'Exam' ? 1 : 2);

export function boardAt(plan: PlanItem[], exams: ExamPrep[], now: number): Board {
  const live = plan.filter((r) => !r.proposed && isNow(r, now)).sort((a, b) => rank(a) - rank(b));
  const current = live[0] ?? null;
  const after = current ? Date.parse(current.end) : now;
  const next =
    plan
      .filter((r) => !r.proposed && Date.parse(r.start) >= after && r.id !== current?.id)
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0] ?? null;
  const seconds = current
    ? Math.max(0, Math.round((Date.parse(current.end) - now) / 1000))
    : next
      ? Math.max(0, Math.round((Date.parse(next.start) - now) / 1000))
      : null;
  const exam = exams.find((x) => !isPast(x, now)) ?? null;
  return { current, next, seconds, exam, daysToExam: exam ? daysUntil(exam.day, new Date(now)) : 0 };
}

/** "42:10" under an hour, "1:05:00" above, "2 d 3 h" above a day: the numerals the board shows. */
export function countdown(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d >= 1) return `${d} d ${h} h`;
  if (h >= 1) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
