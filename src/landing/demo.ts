// The landing page's demo runway: four made-up courses and three exams, laid out relative to today
// so the countdowns are always live. Nothing here is anyone's real schedule.

import type { CourseInfo } from '../lib/courses.ts';
import type { PlanData } from '../lib/plan.ts';
import { buildPlan, localIso, type ItemRow } from '../lib/planBuild.ts';

export const DEMO_COURSES: CourseInfo[] = [
  { id: 'c1', code: 'MATH 20C', name: 'Calculus III', color: 1, hidden: false },
  { id: 'c2', code: 'CSE 12', name: 'Data structures', color: 2, hidden: false },
  { id: 'c3', code: 'COGS 1', name: 'Intro to cognitive science', color: 3, hidden: false },
  { id: 'c4', code: 'HIST 10', name: 'World history', color: 4, hidden: false },
];

// [day offset, course index, kind, title, start hour, end hour, weight?]
type Row = [number, number, ItemRow['kind'], string, number, number, number?];
const ROWS: Row[] = [
  [0, 0, 'study', 'Series: lectures 8–10', 9.5, 11.5],
  [0, 1, 'deadline', 'PA 3 due', 23, 23.98],
  [0, 2, 'study', 'Reading: perception', 18, 19.5],
  [1, 0, 'study', 'Practice set 4', 10, 12],
  [1, 3, 'class', 'Lecture', 14, 15.3],
  [1, 0, 'study', 'Cheat sheet, first pass', 19, 21],
  [2, 1, 'study', 'Linked lists, review', 9, 11],
  [2, 0, 'study', 'Past midterm, timed', 13, 15],
  [2, 3, 'deadline', 'Response paper 2 due', 23, 23.98],
  [3, 0, 'study', 'Weak spots + cheat sheet', 9.5, 12.5],
  [3, 0, 'study', 'Final read-through', 15, 16],
  [3, 0, 'exam', 'Midterm 1', 17, 18, 25],
  [3, 1, 'study', 'Trees and recursion', 19.5, 21.5],
  [4, 1, 'study', 'PA 4: finish', 10, 13],
  [4, 2, 'class', 'Lecture', 14, 15.3],
  [4, 1, 'deadline', 'PA 4 due', 23, 23.98],
  [5, 1, 'study', 'Practice problems', 10, 13.5],
  [5, 2, 'study', 'Lectures 5–8 into notes', 17, 19],
  [6, 1, 'study', 'Past midterm, timed', 9.5, 11.5],
  [6, 1, 'study', 'Review the misses', 13, 14.5],
  [6, 1, 'exam', 'Midterm', 14, 14.8, 20],
  [6, 2, 'study', 'Reading: memory', 19, 20.5],
  [7, 2, 'study', 'Lectures 9–12 into notes', 10, 13],
  [7, 3, 'study', 'Essay outline', 15, 17],
  [8, 2, 'study', 'Practice questions', 10, 12.5],
  [8, 3, 'deadline', 'Essay 1 due', 23, 23.98],
  [9, 2, 'study', 'Flashcards, full deck', 9.5, 12],
  [9, 2, 'study', 'Final review', 18, 20],
  [10, 2, 'exam', 'Midterm', 11, 11.8, 20],
  [10, 3, 'study', 'Reading: chapters 6–7', 15, 16.5],
  [11, 3, 'study', 'Lecture notes, weeks 3–5', 10, 12],
];

/** The demo's rows, with times relative to today in `tz`. */
export function demoRows(now = Date.now(), tz = 'America/Los_Angeles'): ItemRow[] {
  const today = localIso(now, tz).slice(0, 10);
  const [y, m, d] = today.split('-').map(Number);
  const at = (offset: number, hour: number) => {
    // Build a wall-clock time in tz: start from local midnight of that day in tz, add hours.
    const dayIso = localIso(Date.UTC(y, m - 1, d + offset, 12), tz).slice(0, 10);
    const midnight = Date.parse(
      `${dayIso}T00:00:00${localIso(Date.UTC(y, m - 1, d + offset, 12), tz).slice(19)}`,
    );
    return new Date(midnight + hour * 3_600_000).toISOString();
  };
  const rows: ItemRow[] = ROWS.map((r, i) => ({
    id: `demo-${i}`,
    course_id: DEMO_COURSES[r[1]].id,
    kind: r[2],
    title: r[3],
    start_at: at(r[0], r[4]),
    end_at: at(r[0], r[5]),
    location: r[2] === 'exam' ? ['Center Hall 115', 'Peterson 108', 'Mandeville B-210'][r[1] % 3] : '',
    weight: r[6] ?? null,
  }));
  return rows;
}

export function demoPlan(now = Date.now(), tz = 'America/Los_Angeles'): PlanData {
  return buildPlan(demoRows(now, tz), DEMO_COURSES, tz, new Date(now));
}
