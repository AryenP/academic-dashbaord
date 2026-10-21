// Course order sets the color: the first course gets --course-1, and so on. Unknown courses are gray.
export const COURSES = ['DSC 140A', 'DSC 102', 'CSE 151A', 'DSC 106'];

export function colorOf(course: string) {
  const i = COURSES.indexOf(course);
  return `var(--course-${i >= 0 ? i + 1 : 5})`;
}
