import { assertEquals } from 'jsr:@std/assert@1';
import { classify, cleanTitle, findCourse, placeByContext } from './classify.ts';

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
  // "final" as a date word, not an exam
  assertEquals(k('DSC 106 Final project proposal'), 'deadline');
  assertEquals(k('Final draft due'), 'deadline');
  assertEquals(
    classify({
      title: 'Final project proposal [DSC 106 - Data Visualization (A00)]',
      uid: 'event-assignment-9',
      sourceKind: 'canvas',
    }).kind,
    'deadline',
  );
  assertEquals(k('Final exam'), 'exam');
  assertEquals(k('DSC 106 final'), 'exam');
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

Deno.test('context: a Canvas feed that names one course places its course-less events', () => {
  const placed = placeByContext([
    {
      key: 'a',
      start: '2026-11-06T07:59:00Z',
      kind: 'deadline',
      course: 'DSC 106',
      confidence: 0.9,
      sourceId: 'c1',
      sourceKind: 'canvas',
    },
    {
      key: 'b',
      start: '2026-11-07T07:59:00Z',
      kind: 'deadline',
      course: null,
      confidence: 0.5,
      sourceId: 'c1',
      sourceKind: 'canvas',
    },
    {
      key: 'c',
      start: '2026-11-04T18:00:00-08:00',
      kind: 'class',
      course: null,
      confidence: 0.5,
      sourceId: 'c1',
      sourceKind: 'canvas',
    },
    {
      key: 'd',
      start: '2026-11-04T19:00:00-08:00',
      kind: 'personal',
      course: null,
      confidence: 0.5,
      sourceId: 'c1',
      sourceKind: 'canvas',
    },
    // another feed with two courses: nothing to say
    {
      key: 'e',
      start: '2026-11-06T07:59:00Z',
      kind: 'deadline',
      course: 'DSC 102',
      confidence: 0.9,
      sourceId: 'c2',
      sourceKind: 'canvas',
    },
    {
      key: 'f',
      start: '2026-11-08T07:59:00Z',
      kind: 'deadline',
      course: 'DSC 140A',
      confidence: 0.9,
      sourceId: 'c2',
      sourceKind: 'canvas',
    },
    {
      key: 'g',
      start: '2026-11-09T07:59:00Z',
      kind: 'deadline',
      course: null,
      confidence: 0.5,
      sourceId: 'c2',
      sourceKind: 'canvas',
    },
    // a Google calendar with one course so far: not a course feed
    {
      key: 'h',
      start: '2026-11-06T07:59:00Z',
      kind: 'deadline',
      course: 'DSC 106',
      confidence: 0.9,
      sourceId: 'g1',
      sourceKind: 'ical',
    },
    {
      key: 'i',
      start: '2026-11-12T07:59:00Z',
      kind: 'deadline',
      course: null,
      confidence: 0.5,
      sourceId: 'g1',
      sourceKind: 'ical',
    },
  ]);
  assertEquals(placed.get('b'), { kind: 'deadline', course: 'DSC 106', confidence: 0.5 });
  assertEquals(placed.get('c'), { kind: 'class', course: 'DSC 106', confidence: 0.5 });
  assertEquals(placed.has('d'), false);
  assertEquals(placed.has('g'), false);
  assertEquals(placed.has('i'), false);
});

Deno.test('context: an exam at the same time as a known exam is that exam', () => {
  const placed = placeByContext([
    { key: 'g', start: '2026-10-28T14:00:00-07:00', kind: 'exam', course: null, confidence: 0.6 },
    { key: 'c', start: '2026-10-28T21:00:00Z', kind: 'exam', course: 'DSC 102', confidence: 0.85 },
    { key: 'other', start: '2026-10-28T16:00:00-07:00', kind: 'exam', course: null, confidence: 0.6 },
    { key: 'due', start: '2026-10-25T23:59:00-07:00', kind: 'deadline', course: null, confidence: 0.5 },
    { key: 'hw', start: '2026-10-26T06:59:00Z', kind: 'deadline', course: 'DSC 140A', confidence: 0.9 },
  ]);
  assertEquals(placed.get('g'), { kind: 'exam', course: 'DSC 102', confidence: 0.7 });
  assertEquals(placed.get('due'), { kind: 'deadline', course: 'DSC 140A', confidence: 0.7 });
  assertEquals(placed.has('other'), false);
  // two known exams at that time: ambiguous, left alone
  const two = placeByContext([
    { key: 'g', start: '2026-10-28T14:00:00-07:00', kind: 'exam', course: null, confidence: 0.6 },
    { key: 'a', start: '2026-10-28T14:00:00-07:00', kind: 'exam', course: 'DSC 102', confidence: 0.9 },
    { key: 'b', start: '2026-10-28T14:00:00-07:00', kind: 'exam', course: 'CSE 151A', confidence: 0.9 },
  ]);
  assertEquals(two.has('g'), false);
});

Deno.test('context: a study block goes to the nearest exam within a week, at low confidence', () => {
  const placed = placeByContext([
    { key: 'early', start: '2026-10-18T09:00:00-07:00', kind: 'study', course: null, confidence: 0.6 },
    { key: 'week', start: '2026-10-20T09:00:00-07:00', kind: 'study', course: null, confidence: 0.6 },
    { key: 'dayof', start: '2026-10-26T09:30:00-07:00', kind: 'study', course: null, confidence: 0.6 },
    { key: 'after', start: '2026-10-26T20:15:00-07:00', kind: 'study', course: null, confidence: 0.6 },
    { key: 'named', start: '2026-10-27T09:00:00-07:00', kind: 'study', course: 'CSE 151A', confidence: 0.9 },
    { key: 'mt1', start: '2026-10-26T17:00:00-07:00', kind: 'exam', course: null, confidence: 0.6 },
    { key: 'mt1k', start: '2026-10-26T17:00:00-07:00', kind: 'exam', course: 'DSC 140A', confidence: 0.9 },
    { key: 'mt2', start: '2026-10-28T14:00:00-07:00', kind: 'exam', course: 'DSC 102', confidence: 0.9 },
    { key: 'far', start: '2026-11-20T09:00:00-08:00', kind: 'study', course: null, confidence: 0.6 },
    { key: 'final', start: '2026-12-10T15:00:00-08:00', kind: 'exam', course: 'MATH 20C', confidence: 0.9 },
  ]);
  assertEquals(placed.has('early'), false); // 8 days out
  assertEquals(placed.get('week'), { kind: 'study', course: 'DSC 140A', confidence: 0.4 });
  assertEquals(placed.get('dayof'), { kind: 'study', course: 'DSC 140A', confidence: 0.4 });
  assertEquals(placed.get('after'), { kind: 'study', course: 'DSC 102', confidence: 0.4 });
  assertEquals(placed.has('named'), false);
  assertEquals(placed.has('far'), false); // the final is 20 days out
  // the untitled exam was placed first, so it counts as known
  assertEquals(placed.get('mt1'), { kind: 'exam', course: 'DSC 140A', confidence: 0.7 });
});
