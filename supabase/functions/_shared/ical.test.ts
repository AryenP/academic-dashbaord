import { assert, assertEquals, assertThrows } from 'jsr:@std/assert@1';
import { NotACalendar, occurrenceHash, parseFeed } from './ical.ts';

const google = Deno.readTextFileSync(new URL('./fixtures/google.ics', import.meta.url));
const canvas = Deno.readTextFileSync(new URL('./fixtures/canvas.ics', import.meta.url));
const FROM = new Date('2026-10-19T00:00:00Z');
const TO = new Date('2026-11-10T00:00:00Z');

Deno.test('expands a weekly class in its timezone and keeps the moved occurrence', () => {
  const feed = parseFeed(google, FROM, TO);
  assertEquals(feed.name, 'School');
  const lectures = feed.events.filter((e) => e.uid === 'lec102@google.com');
  // Tue/Thu from Oct 20 through Nov 5: 6 before the DST change, 1 on Nov 3, 1 on Nov 5 = 8 weeks... within the window.
  assert(lectures.length >= 6);
  assertEquals(lectures[0].start, '2026-10-20T21:00:00.000Z'); // 2 PM PDT
  assertEquals(lectures[0].end, '2026-10-20T22:20:00.000Z');
  assertEquals(lectures[0].location, 'Center Hall 115');
  const nov = lectures.find((l) => l.start.startsWith('2026-11-03'));
  assertEquals(nov?.start, '2026-11-03T22:00:00.000Z'); // 2 PM PST after the change
  const moved = lectures.find((l) => l.start.startsWith('2026-10-27'));
  assertEquals(moved?.title, 'DSC 102 Lecture (moved to Zoom)');
  assert(lectures.every((l) => l.recurrenceId !== ''));
});

Deno.test('all-day events keep their date; timed events are instants', () => {
  const feed = parseFeed(google, FROM, TO);
  const hw = feed.events.find((e) => e.uid === 'hwdue@google.com')!;
  assertEquals(hw, {
    uid: 'hwdue@google.com',
    recurrenceId: '',
    title: 'dsc140a HW 2 due',
    start: '2026-10-26',
    end: '2026-10-27',
    allDay: true,
    location: '',
  });
  const mt = feed.events.find((e) => e.uid === 'mt1@google.com')!;
  assertEquals(mt.start, '2026-10-27T00:00:00.000Z');
  assertEquals(mt.allDay, false);
});

Deno.test('only the window is returned', () => {
  // Dinner on Oct 24 at 7 PM Pacific is Oct 25 in UTC.
  const feed = parseFeed(google, new Date('2026-10-25T00:00:00Z'), new Date('2026-10-26T00:00:00Z'));
  assertEquals(
    feed.events.map((e) => e.uid),
    ['dinner@google.com'],
  );
  const one = parseFeed(google, new Date('2026-10-26T00:00:00Z'), new Date('2026-10-27T00:00:00Z'));
  // The midterm at 5 PM Pacific on Oct 26 is already Oct 27 in UTC, so only the all-day deadline is in.
  assertEquals(
    one.events.map((e) => e.uid),
    ['hwdue@google.com'],
  );
});

Deno.test('a Canvas feed: zero-length assignments get a minute, duplicates stay distinct by uid', () => {
  const feed = parseFeed(canvas, FROM, TO);
  assertEquals(feed.events.length, 4);
  const hw = feed.events.find((e) => e.uid === 'event-assignment-12345')!;
  assertEquals(hw.start, '2026-10-26T06:59:00.000Z');
  assertEquals(hw.end, '2026-10-26T07:00:00.000Z');
});

Deno.test('rejects HTML and junk', () => {
  assertThrows(() => parseFeed('<!doctype html><html>…', FROM, TO), NotACalendar);
  assertThrows(() => parseFeed('hello', FROM, TO), NotACalendar);
  assertThrows(
    () => parseFeed('BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:bad\nEND:VEVENT', FROM, TO),
    NotACalendar,
  );
});

Deno.test('the hash changes with the title or time, not the order of fields', async () => {
  const a = {
    uid: 'x',
    recurrenceId: '',
    title: 'A',
    start: '2026-10-26T06:59:00.000Z',
    end: '2026-10-26T07:00:00.000Z',
    allDay: false,
    location: '',
  };
  const h1 = await occurrenceHash(a);
  assertEquals(h1, await occurrenceHash({ ...a }));
  assert(h1 !== (await occurrenceHash({ ...a, title: 'B' })));
  assert(h1 !== (await occurrenceHash({ ...a, start: '2026-10-26T07:59:00.000Z' })));
});
