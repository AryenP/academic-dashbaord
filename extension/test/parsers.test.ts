/// <reference lib="dom" />
import { assertEquals } from 'jsr:@std/assert@1';
import { parseHTML } from 'npm:linkedom@0.18.12';
import { parseDue, parsePage, parseScore } from '../parsers.js';

const dom = (html: string) => (parseHTML(html) as unknown as { document: Document }).document;

const NOW = new Date('2026-10-21T18:00:00Z');
const read = (f: string) => Deno.readTextFileSync(new URL(`./fixtures/${f}`, import.meta.url));

Deno.test('due dates in the forms Gradescope and Canvas show', () => {
  assertEquals(parseDue('2026-10-26 23:59:00 -0700'), '2026-10-27T06:59:00.000Z');
  assertEquals(parseDue('Due Nov 4 at 11:59pm', NOW), new Date(2026, 10, 4, 23, 59).toISOString());
  assertEquals(parseDue('Oct 26 at 11:59PM', NOW), new Date(2026, 9, 26, 23, 59).toISOString());
  assertEquals(parseDue('Jan 12', NOW), new Date(2027, 0, 12, 23, 59).toISOString()); // next year
  assertEquals(parseDue(''), null);
  assertEquals(parseDue('whenever'), null);
  assertEquals(parseScore('18.0 / 20.0'), { score: 18, max_score: 20 });
  assertEquals(parseScore('—'), { score: null, max_score: null });
});

Deno.test('a Gradescope course page: course from the header, status and score per row', () => {
  const document = dom(read('gradescope-course.html'));
  const rows = parsePage(document, 'https://www.gradescope.com/courses/9001', NOW);
  assertEquals(rows.length, 3);
  assertEquals(rows[0], {
    source: 'gradescope',
    course: 'DSC 140A',
    title: 'HW 1',
    due: '2026-10-13T06:59:00.000Z',
    status: 'submitted',
    score: 18,
    max_score: 20,
    url: 'https://www.gradescope.com/courses/9001/assignments/1001/submissions/5',
  });
  assertEquals(rows[1].status, 'submitted');
  assertEquals(rows[1].score, null);
  assertEquals(rows[2], {
    source: 'gradescope',
    course: 'DSC 140A',
    title: 'HW 3',
    due: '2026-11-10T07:59:00.000Z',
    status: 'open',
    score: null,
    max_score: null,
    url: null,
  });
});

Deno.test('a Canvas assignments page: course from the breadcrumb, due from the screen-reader text', () => {
  const document = dom(read('canvas-assignments.html'));
  const rows = parsePage(document, 'https://canvas.ucsd.edu/courses/555/assignments', NOW);
  assertEquals(
    rows.map((r) => r.title),
    ['Project 3 due (Interactive Viz)', 'Lab 5', 'Reading survey'],
  );
  assertEquals(rows[0].course, 'DSC 106 - Data Visualization (A00)');
  assertEquals(rows[0].due, new Date(2026, 10, 4, 23, 59).toISOString());
  assertEquals(rows[0].status, 'open');
  assertEquals(rows[1], {
    source: 'canvas',
    course: 'DSC 106 - Data Visualization (A00)',
    title: 'Lab 5',
    due: new Date(2026, 9, 30, 23, 59).toISOString(),
    status: 'submitted',
    score: 9,
    max_score: 10,
    url: 'https://canvas.ucsd.edu/courses/555/assignments/2',
  });
  assertEquals(rows[2].due, null);
});

Deno.test('other pages read nothing', () => {
  const document = dom('<html><body><h1>Hi</h1></body></html>');
  assertEquals(parsePage(document, 'https://www.gradescope.com/', NOW), []);
  assertEquals(parsePage(document, 'https://canvas.ucsd.edu/courses/555/grades', NOW), []);
});
