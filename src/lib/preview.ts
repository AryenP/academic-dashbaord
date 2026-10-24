// The signed-out preview, drawn: preview-source's events become the same PlanData the runway draws,
// with course colors given by how often each course appears.
import type { CourseInfo } from './courses';
import type { PlanData } from './plan';
import { buildPlan, type ItemRow } from './planBuild';

export interface PreviewEvent {
  title: string;
  start: string;
  end: string;
  kind: 'study' | 'deadline' | 'exam' | 'class' | 'commitment';
  course: string | null;
  location: string;
}

export interface PreviewResult {
  ok: boolean;
  code?: string;
  message?: string;
  name?: string | null;
  host?: string;
  tz?: string;
  events?: PreviewEvent[];
  courses?: { code: string; events: number }[];
  counts?: Record<string, number>;
  truncated?: boolean;
}

export function previewPlan(
  r: PreviewResult,
  tz: string,
  now = new Date(),
): { data: PlanData; courses: CourseInfo[] } {
  const codes = (r.courses ?? []).map((c) => c.code);
  for (const e of r.events ?? []) if (e.course && !codes.includes(e.course)) codes.push(e.course);
  const courses: CourseInfo[] = codes.map((code, i) => ({
    id: `p-${code}`,
    code,
    name: null,
    color: i < 5 ? i + 1 : 6,
    hidden: false,
  }));
  const rows: ItemRow[] = (r.events ?? []).map((e, i) => ({
    id: `p${i}`,
    course_id: e.course ? `p-${e.course}` : null,
    kind: e.kind,
    title: e.title,
    start_at: e.start,
    end_at: e.end,
    location: e.location,
    weight: null,
  }));
  return { data: buildPlan(rows, courses, tz, now), courses };
}
