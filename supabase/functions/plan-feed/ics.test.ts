import { assert, assertEquals } from 'jsr:@std/assert@1';
import { toIcs } from './ics.ts';

Deno.test('the feed is valid iCalendar with folded lines and escaped text', () => {
  const ics = toIcs(
    [
      {
        id: 'a1',
        course: 'DSC 140A',
        kind: 'study',
        title:
          'Practice problems; set 2, a long title that keeps going well past seventy-five characters to test folding',
        start_at: '2026-10-22T16:45:00Z',
        end_at: '2026-10-22T18:15:00Z',
        location: 'Geisel, 2nd floor',
        status: 'open',
        updated_at: '2026-10-21T00:00:00Z',
      },
      {
        id: 'b2',
        course: 'DSC 102',
        kind: 'deadline',
        title: 'HW 2',
        start_at: '2026-10-26T06:59:00Z',
        end_at: '2026-10-26T07:00:00Z',
        location: '',
        status: 'submitted',
        updated_at: '2026-10-21T00:00:00Z',
      },
    ],
    new Date('2026-10-21T12:00:00Z'),
  );
  assert(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert(ics.endsWith('END:VCALENDAR\r\n'));
  assert(ics.includes('DTSTART:20261022T164500Z'));
  assert(ics.includes('UID:runway-a1@runway'));
  assert(ics.includes('SUMMARY:📚 DSC 140A Practice problems\\; set 2\\, a long title'));
  assert(ics.includes('SUMMARY:DSC 102 HW 2 due'));
  assert(ics.includes('· submitted'));
  assert(ics.includes('LOCATION:Geisel\\, 2nd floor'));
  for (const line of ics.split('\r\n')) assert(new TextEncoder().encode(line).byteLength <= 75, line);
});
