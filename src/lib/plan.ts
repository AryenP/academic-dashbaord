// Plan data: what the runway draws (built from plan_items by src/lib/planBuild.ts) and date helpers over it.

import type { CourseInfo } from './courses';

// Study, Deadline and Exam come from v1. Class and Commitment (work, research, a club) are fixed
// time the planner works around; they draw as neutral blocks and never count as study.
export type Kind = 'Study' | 'Deadline' | 'Exam' | 'Class' | 'Commitment';

export interface PlanItem {
  id: string;
  course: string;
  kind: Kind;
  title: string;
  when: string;
  day: string; // YYYY-MM-DD, local
  start: string; // ISO with offset, local wall time
  end: string;
  hours: number;
  location: string;
  weight: number | null;
  /** A planner proposal the person hasn't accepted yet. Not counted in totals or prep hours. */
  proposed?: boolean;
  reason?: string | null;
  /** The exam a study block prepares for. */
  forId?: string | null;
  status?: 'open' | 'submitted' | 'missed';
  submittedAt?: string | null;
  score?: number | null;
  maxScore?: number | null;
}

export interface ExamPrep {
  id: string;
  course: string;
  title: string;
  when: string;
  day: string;
  start: string;
  end: string;
  location: string;
  weight: number | null;
  prep_hours: number;
}

export interface Totals {
  study_hours: number;
  study_blocks: number;
  exams: number;
  deadlines: number;
}

export interface PlanData {
  plan: PlanItem[];
  courses: CourseInfo[];
  totals: Totals[];
  exam_prep: ExamPrep[];
  updated: string;
}

export const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The runway's vertical axis: 8 AM to midnight, in minutes.
export const H0 = 8 * 60;
export const H1 = 24 * 60;

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const utc = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
export const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
export const daysUntil = (k: string, now = new Date()) => Math.round((utc(k) - utc(dayKey(now))) / 864e5);
export const isPast = (r: { end: string }, now = Date.now()) => Date.parse(r.end) < now;
export const isNow = (r: { start: string; end: string }, now = Date.now()) =>
  Date.parse(r.start) <= now && !isPast(r, now);
/** Minutes past local midnight, read straight from the ISO string's wall time. */
export const mins = (s: string) => Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16));
/** The number part of a course code when it's distinctive ("140A"), else the whole code ("COGS 1"). */
export const shortCourse = (c: string) => {
  const n = c.split(' ')[1];
  return n && n.length >= 2 ? n : c;
};
export const round1 = (x: number) => Math.round(x * 10) / 10;

export function dayName(k: string, now = new Date()) {
  const n = daysUntil(k, now);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  const d = new Date(utc(k));
  return `${WD[d.getUTCDay()]} ${MO[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** The time part of `when` for single-day items ("5 PM–6 PM"); the whole `when` for multi-day ones. */
export const timePart = (r: PlanItem) =>
  r.start.slice(0, 10) === r.end.slice(0, 10) ? r.when.split(', ').slice(1).join(', ') : r.when;

export interface Segment {
  day: string;
  a: number;
  b: number;
  first?: boolean;
}

/** Splits an item into per-day pieces, so a 24-hour exam draws across two columns. */
export function segmentsOf(r: { start: string; end: string }): Segment[] {
  const sD = r.start.slice(0, 10);
  const eD = r.end.slice(0, 10);
  if (sD === eD) return [{ day: sD, a: mins(r.start), b: mins(r.end), first: true }];
  const out: Segment[] = [{ day: sD, a: mins(r.start), b: H1, first: true }];
  for (let t = utc(sD) + 864e5; t < utc(eD); t += 864e5) out.push({ day: iso(t), a: 0, b: H1 });
  out.push({ day: eD, a: 0, b: mins(r.end) });
  return out;
}

/** Every calendar day from the first item to the last item's end. */
export function planDays(plan: PlanItem[]): string[] {
  if (!plan.length) return [];
  let first = plan[0].day;
  let last = plan[0].end.slice(0, 10);
  for (const r of plan) {
    if (r.day < first) first = r.day;
    if (r.end.slice(0, 10) > last) last = r.end.slice(0, 10);
  }
  const days: string[] = [];
  for (let t = utc(first); t <= utc(last); t += 864e5) days.push(iso(t));
  return days;
}

/** Study blocks for an exam's course that end before it starts: the exam's planned prep. */
export const prepBlocks = (plan: PlanItem[], x: ExamPrep) =>
  plan.filter(
    (r) =>
      r.kind === 'Study' && !r.proposed && r.course === x.course && Date.parse(r.end) <= Date.parse(x.start),
  );

/** The block you should be doing now, else the next one today or later. Used to default a new session. */
export function currentOrNextStudy(plan: PlanItem[], now = Date.now()): PlanItem | undefined {
  const study = plan.filter((r) => r.kind === 'Study' && !r.proposed);
  return study.find((r) => isNow(r, now)) ?? study.find((r) => Date.parse(r.start) > now);
}
