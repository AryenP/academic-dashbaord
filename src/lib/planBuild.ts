// Builds the runway's plan (src/lib/plan.ts shapes) from plan_items and courses rows. Times are
// formatted in the person's timezone as ISO strings with an offset, the same shape v1's calendar
// sync produced, so every component keeps reading wall-clock time straight from the string.

import type { CourseInfo } from './courses';
import type { ExamPrep, Kind, PlanData, PlanItem } from './plan';
import { round1 } from './plan';
import { localIso } from './tz';

export { localIso, todayIn } from './tz';

export interface ItemRow {
  id: string;
  course_id: string | null;
  kind: string;
  title: string;
  start_at: string;
  end_at: string;
  location: string;
  weight: number | string | null;
  take_home?: boolean;
  accepted?: boolean;
  reason?: string | null;
  for_item_id?: string | null;
  status?: string | null;
  submitted_at?: string | null;
  score?: number | string | null;
  max_score?: number | string | null;
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const dayLabel = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WD[wd]} ${MO[m - 1]} ${d}`;
};
const timeLabel = (s: string) => {
  const h = Number(s.slice(11, 13));
  const mi = s.slice(14, 16);
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return mi === '00' ? `${hh} ${ap}` : `${hh}:${mi} ${ap}`;
};

/** "Tue Oct 20, 12:45 PM–1:50 PM", or "Tue Nov 3 2 PM → Wed Nov 4 2 PM" across days. */
export function whenLabel(start: string, end: string): string {
  if (start.slice(0, 10) === end.slice(0, 10))
    return `${dayLabel(start)}, ${timeLabel(start)}–${timeLabel(end)}`;
  return `${dayLabel(start)} ${timeLabel(start)} → ${dayLabel(end)} ${timeLabel(end)}`;
}

const KIND: Record<string, Kind> = {
  study: 'Study',
  deadline: 'Deadline',
  exam: 'Exam',
  class: 'Class',
  commitment: 'Commitment',
};

export function toPlanItem(r: ItemRow, courses: Map<string, CourseInfo>, tz: string): PlanItem {
  const start = localIso(r.start_at, tz);
  const end = localIso(r.end_at, tz);
  const c = r.course_id ? courses.get(r.course_id) : undefined;
  return {
    id: r.id,
    course: c?.code ?? 'General',
    kind: KIND[r.kind] ?? 'Study',
    title: r.title,
    when: whenLabel(start, end),
    day: start.slice(0, 10),
    start,
    end,
    hours: round1((Date.parse(r.end_at) - Date.parse(r.start_at)) / 3_600_000),
    location: r.location ?? '',
    weight: r.weight == null ? null : Number(r.weight),
    proposed: r.accepted === false,
    reason: r.reason ?? null,
    forId: r.for_item_id ?? null,
    status: (r.status as PlanItem['status']) ?? 'open',
    submittedAt: r.submitted_at ?? null,
    score: r.score == null ? null : Number(r.score),
    maxScore: r.max_score == null ? null : Number(r.max_score),
  };
}

/** The whole PlanData: items sorted by start, totals, and prep hours per exam. */
export function buildPlan(
  rows: ItemRow[],
  courses: CourseInfo[],
  tz: string,
  updated = new Date(),
): PlanData {
  const byId = new Map(courses.map((c) => [c.id, c]));
  const plan = rows
    .map((r) => toPlanItem(r, byId, tz))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.course.localeCompare(b.course));
  const study = plan.filter((r) => r.kind === 'Study' && !r.proposed);
  const exams = plan.filter((r) => r.kind === 'Exam' && !r.proposed);
  const exam_prep: ExamPrep[] = exams.map((x) => ({
    id: x.id,
    course: x.course,
    title: x.title,
    when: x.when,
    day: x.day,
    start: x.start,
    end: x.end,
    location: x.location || (rows.find((r) => r.id === x.id)?.take_home ? 'Take-home' : ''),
    weight: x.weight,
    prep_hours: round1(
      study
        .filter((s) => s.course === x.course && Date.parse(s.end) <= Date.parse(x.start))
        .reduce((t, s) => t + s.hours, 0),
    ),
  }));
  return {
    plan,
    courses: courses.filter((c) => !c.hidden),
    totals: [
      {
        study_hours: round1(study.reduce((t, s) => t + s.hours, 0)),
        study_blocks: study.length,
        exams: exams.length,
        deadlines: plan.filter((r) => r.kind === 'Deadline' && !r.proposed).length,
      },
    ],
    exam_prep,
    updated: updated.toISOString(),
  };
}

export const EMPTY_PLAN: PlanData = {
  plan: [],
  courses: [],
  totals: [{ study_hours: 0, study_blocks: 0, exams: 0, deadlines: 0 }],
  exam_prep: [],
  updated: new Date(0).toISOString(),
};
