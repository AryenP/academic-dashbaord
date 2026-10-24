import { assert, assertEquals } from 'jsr:@std/assert@1';
import { preview, safeZone } from './preview.ts';

const google = Deno.readTextFileSync(new URL('./fixtures/google.ics', import.meta.url));
const canvas = Deno.readTextFileSync(new URL('./fixtures/canvas.ics', import.meta.url));
const NOW = new Date('2026-10-21T18:00:00Z');
const TZ = 'America/Los_Angeles';

Deno.test('a Google calendar becomes the events the runway would draw, in the person’s time', () => {
  const p = preview(google, 'ical', TZ, NOW);
  const titles = p.events.map((e) => e.title);
  assert(!titles.includes('Dinner with Sam'), 'personal events are not drawn');
  const mt = p.events.find((e) => e.title === 'DSC 140A Midterm 1')!;
  assertEquals(mt.kind, 'exam');
  assertEquals(mt.course, 'DSC 140A');
  assertEquals(mt.start, '2026-10-26T17:00:00-07:00');
  // "📚 140A practice …" names only the number: the feed's own "DSC 140A" places it.
  assertEquals(p.events.find((e) => e.title.startsWith('📚 140A'))?.course, 'DSC 140A');
  // The all-day homework is due at the end of its day.
  const hw = p.events.find((e) => /HW 2 due/i.test(e.title))!;
  assertEquals(hw.kind, 'deadline');
  assertEquals(hw.start.slice(11, 16), '23:00');
  assertEquals(p.counts.personal, 1);
  assert(p.courses.some((c) => c.code === 'DSC 140A'));
  // Sorted, and nothing beyond three weeks.
  for (let i = 1; i < p.events.length; i++) assert(p.events[i - 1].start <= p.events[i].start);
  assert(p.events.every((e) => Date.parse(e.start) < NOW.getTime() + 22 * 864e5));
});

Deno.test('a Canvas feed reads its bracketed courses and drops the brackets from the titles', () => {
  const p = preview(canvas, 'canvas', TZ, NOW);
  assertEquals(p.courses.map((c) => c.code).sort(), ['DSC 102', 'DSC 106', 'DSC 140A']);
  assert(p.events.some((e) => e.title === 'HW 2' && e.kind === 'deadline' && e.course === 'DSC 140A'));
  assert(p.events.some((e) => e.title === 'Midterm' && e.kind === 'exam' && e.course === 'DSC 102'));
  assert(p.events.every((e) => !e.title.includes('[')));
});

Deno.test('an unknown timezone falls back to UTC', () => {
  assertEquals(safeZone('America/Los_Angeles'), 'America/Los_Angeles');
  assertEquals(safeZone('Mars/Olympus'), 'UTC');
  assertEquals(safeZone(42), 'UTC');
  assertEquals(safeZone('x'.repeat(100)), 'UTC');
});
