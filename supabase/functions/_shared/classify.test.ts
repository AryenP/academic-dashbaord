import { assertEquals } from 'jsr:@std/assert@1';
import { classify, cleanTitle, findCourse } from './classify.ts';

const k = (title: string, extra: Parameters<typeof classify>[0] = { title }) =>
  classify({ ...extra, title }).kind;
const c = (title: string) => classify({ title }).course;

Deno.test('finds course codes in any spacing or case, not in look-alikes', () => {
  assertEquals(findCourse('DSC 140A Lecture'), 'DSC 140A');
  assertEquals(findCourse('dsc140a hw'), 'DSC 140A');
  assertEquals(findCourse('Midterm 1 (140A)'), null); // no department: Phase 2's AI can group it
  assertEquals(findCourse('CSE-151A Discussion'), 'CSE 151A');
  assertEquals(findCourse('MATH 20C'), 'MATH 20C');
  assertEquals(findCourse('HW 2 due'), null);
  assertEquals(findCourse('Week 5 reading'), null);
  assertEquals(findCourse('Lab 4 due'), null);
  assertEquals(findCourse('Room 115'), null);
  assertEquals(findCourse('Oct 26 dinner'), null);
  assertEquals(findCourse('COGS 1 Lecture'), 'COGS 1');
});

Deno.test(
  "v1's rules: 📚 is study, midterm is exam, course + anything else is a deadline, meetings are class",
  () => {
    assertEquals(classify({ title: '📚 140A practice problems' }), {
      kind: 'study',
      course: null,
      confidence: 0.6,
    });
    assertEquals(k('📚 DSC 140A practice problems + cheat sheet #1'), 'study');
    assertEquals(k('DSC 140A Midterm 1'), 'exam');
    assertEquals(k('CSE 151A Midterm (take-home, 24 hr)'), 'exam');
    assertEquals(k('DSC 102 Lecture'), 'class');
    assertEquals(k('CSE 151A Discussion'), 'class');
    assertEquals(k('CSE 151A'), 'class');
    assertEquals(k('dsc140a HW 2 due'), 'deadline');
    assertEquals(k('DSC 106 Project 2 due (Deceptive Viz)'), 'deadline');
    assertEquals(k('DSC 140A midterm review session'), 'study');
  },
);

Deno.test('Canvas titles carry the course in brackets, and assignments are deadlines', () => {
  const r = classify({
    title: 'HW 2 [DSC 140A - Probabilistic Modeling and Machine Learning (A00)]',
    uid: 'event-assignment-12345',
    sourceKind: 'canvas',
  });
  assertEquals(r, { kind: 'deadline', course: 'DSC 140A', confidence: 0.9 });
  assertEquals(cleanTitle('HW 2 [DSC 140A - Probabilistic Modeling (A00)]'), 'HW 2');
  const mt = classify({
    title: 'Midterm [DSC 102 - Systems (A00)]',
    uid: 'event-calendar-event-7',
    sourceKind: 'canvas',
  });
  assertEquals(mt.kind, 'exam');
  assertEquals(mt.course, 'DSC 102');
  const named = classify({
    title: 'Reading quiz [Intro to Cognitive Science]',
    uid: 'event-assignment-1',
    sourceKind: 'canvas',
  });
  assertEquals(named.kind, 'deadline');
  assertEquals(named.course, 'Intro to Cognitive Science');
});

Deno.test('life outside class: work and research are commitments, the rest is personal', () => {
  assertEquals(k('Research lab meeting'), 'commitment');
  assertEquals(k('Work shift'), 'commitment');
  assertEquals(k('Internship standup'), 'commitment');
  assertEquals(k('Dinner with Sam'), 'personal');
  assertEquals(k('Dentist'), 'personal');
  assertEquals(k('Thanksgiving', { title: 'Thanksgiving', allDay: true }), 'personal');
});

Deno.test('exams without a course still read as exams, with low confidence', () => {
  const r = classify({ title: 'Final exam' });
  assertEquals(r.kind, 'exam');
  assertEquals(r.course, null);
  assertEquals(r.confidence, 0.6);
  assertEquals(c('MATH 20C final'), 'MATH 20C');
});

Deno.test('known courses place number-only titles; course-less due items are deadlines', () => {
  const known = ['DSC 140A', 'DSC 102', 'CSE 151A'];
  assertEquals(classify({ title: 'Midterm 1 (140A)', knownCourses: known }), {
    kind: 'exam',
    course: 'DSC 140A',
    confidence: 0.9,
  });
  assertEquals(classify({ title: '📚 140A practice problems', knownCourses: known }).course, 'DSC 140A');
  assertEquals(classify({ title: 'office hours (151A)', knownCourses: known }).kind, 'class');
  assertEquals(classify({ title: 'Lab 4 due' }), { kind: 'deadline', course: null, confidence: 0.5 });
  assertEquals(classify({ title: 'HW 2: finish + submit' }).kind, 'deadline');
  assertEquals(classify({ title: 'Midterm 1 (140A)', knownCourses: ['DSC 140A', 'MATH 140A'] }).course, null); // ambiguous
  assertEquals(classify({ title: 'Dinner at 7', knownCourses: known }).kind, 'personal');
});
