// Course order sets the color: the first course gets --course-1, and so on. Unknown courses are gray.
// Each color comes in three parts (src/styles/tokens.css): the fill, an "ink" shade for course-colored
// text that meets 4.5:1 contrast, and the label color to use on top of the fill.
export const COURSES = ['DSC 140A', 'DSC 102', 'CSE 151A', 'DSC 106'];

const slot = (course: string) => {
  const i = COURSES.indexOf(course);
  return i >= 0 ? i + 1 : 5;
};

export const colorOf = (course: string) => `var(--course-${slot(course)})`;
export const inkOf = (course: string) => `var(--course-${slot(course)}-ink)`;

/** CSS variables for a course: --c (fill), --c-ink (text), --c-on (text on the fill). */
export function courseVars(course: string): Record<string, string> {
  const n = slot(course);
  return {
    '--c': `var(--course-${n})`,
    '--c-ink': `var(--course-${n}-ink)`,
    '--c-on': `var(--course-${n}-on)`,
  };
}
