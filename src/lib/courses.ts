// Course colors. Each course has a color slot (1–6, from the `courses` table); the slot picks
// --course-N in tokens.css, which comes in three parts: the fill, an "ink" shade for course-colored
// text that meets 4.5:1 contrast, and the label color to use on top of the fill. Slot 6 is gray,
// for anything without a course ("General") and for overflow.

export interface CourseInfo {
  id: string;
  code: string;
  name: string | null;
  color: number;
  hidden: boolean;
  /** Shown to classmates in this course (opt-in). */
  visible?: boolean;
  /** Classmates who also opted in can find a time to study with you (a second opt-in). */
  study_together?: boolean;
}

export const SLOTS = 6;
export const GRAY = 6;

// Sessions store the course code as text, so lookups go by code. The plan provider fills this in;
// before it does (or for a course that isn't in the plan) everything is gray.
let slots = new Map<string, number>();

export function setCourseSlots(courses: { code: string; color: number }[]) {
  slots = new Map(courses.map((c) => [c.code, c.color]));
}

export const slotOf = (course: string) => slots.get(course) ?? GRAY;

export const colorOf = (course: string) => `var(--course-${slotOf(course)})`;
export const inkOf = (course: string) => `var(--course-${slotOf(course)}-ink)`;

/** CSS variables for a course: --c (fill), --c-ink (text), --c-on (text on the fill). */
export function courseVars(course: string): Record<string, string> {
  const n = slotOf(course);
  return {
    '--c': `var(--course-${n})`,
    '--c-ink': `var(--course-${n}-ink)`,
    '--c-on': `var(--course-${n}-on)`,
  };
}

/** The first color slot no course uses yet (gray last). */
export function nextSlot(courses: { color: number }[]): number {
  const used = new Set(courses.map((c) => c.color));
  for (let n = 1; n < GRAY; n++) if (!used.has(n)) return n;
  return GRAY;
}
