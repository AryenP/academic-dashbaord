import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  allocate,
  DEFAULT_SETTINGS,
  draftWithClaude,
  freeSlots,
  hoursNeeded,
  preferredHours,
  settingsFrom,
  validate,
  type Block,
  type Exam,
} from './planner.ts';

const TZ = 'America/Los_Angeles';
const NOW = Date.parse('2026-10-21T16:00:00Z'); // Wed 9 AM Pacific
const FROM = new Date(NOW);
const TO = new Date('2026-10-27T07:00:00Z'); // through Monday Oct 26 Pacific
const EXAMS: Exam[] = [
  {
    id: 'x1',
    course: 'DSC 140A',
    title: 'Midterm 1',
    start_at: '2026-10-27T00:00:00Z',
    weight: 25,
    take_home: false,
    planned_hours: 2,
    studied_hours: 1,
  },
  {
    id: 'x2',
    course: 'DSC 102',
    title: 'Midterm',
    start_at: '2026-10-28T21:00:00Z',
    weight: 15,
    take_home: false,
    planned_hours: 0,
    studied_hours: 0,
  },
];
const BUSY = [
  { start_at: '2026-10-21T21:00:00Z', end_at: '2026-10-21T22:20:00Z' }, // Wed 2–3:20 PM class
  { start_at: '2026-10-22T18:00:00Z', end_at: '2026-10-22T22:00:00Z' }, // Thu 11–3 work
];

Deno.test('settings come from profile.settings.planning with sane bounds', () => {
  assertEquals(settingsFrom(null), DEFAULT_SETTINGS);
  const s = settingsFrom({
    planning: { hours_per_day: 40, earliest: '7:00', latest: '23:30', block_min: 10, days_off: [0, 9] },
  });
  assertEquals(s, { hours_per_day: 12, earliest: '09:00', latest: '23:30', block_min: 30, days_off: [0] });
});

Deno.test('free slots respect the window, days off, busy time with padding, and the quarter hour', () => {
  const slots = freeSlots(FROM, TO, BUSY, { ...DEFAULT_SETTINGS, days_off: [6] }, TZ);
  const wed = slots.filter((s) => s.day === '2026-10-21');
  // Wed: from 9 AM (now) to 1:45 PM (class 2 PM minus padding), then 3:35 PM rounded up to 3:45 → 10 PM.
  assertEquals(
    wed.map((s) => [s.start, s.end]),
    [
      ['2026-10-21T16:00:00.000Z', '2026-10-21T20:45:00.000Z'],
      ['2026-10-21T22:45:00.000Z', '2026-10-22T05:00:00.000Z'],
    ],
  );
  assertEquals(slots.filter((s) => s.day === '2026-10-24').length, 0); // Saturday off
  const thu = slots.filter((s) => s.day === '2026-10-22');
  assertEquals(thu.length, 2);
  assert(thu[0].minutes < 120); // 9:00 to 10:45
});

Deno.test('hours needed scale with weight and shrink with what is planned and studied', () => {
  const need = hoursNeeded(EXAMS, NOW);
  assertEquals(need.get('x1'), 9); // 12 − 2 planned − 1 studied
  assertEquals(need.get('x2'), 7); // round(15/25 × 12) = 7
  assertEquals(hoursNeeded([{ ...EXAMS[0], start_at: '2026-10-20T00:00:00Z' }], NOW).get('x1'), 0);
});

Deno.test(
  'the plain allocator fills free slots before each exam within the daily cap and never overlaps',
  () => {
    const slots = freeSlots(FROM, TO, BUSY, DEFAULT_SETTINGS, TZ);
    const blocks = allocate(EXAMS, slots, DEFAULT_SETTINGS, NOW);
    assert(blocks.length >= 6);
    const { kept, dropped } = validate(blocks, EXAMS, slots, DEFAULT_SETTINGS, TZ);
    assertEquals(dropped, 0);
    assertEquals(kept.length, blocks.length);
    for (const b of blocks)
      assert(Date.parse(b.end_at) <= Date.parse(EXAMS.find((x) => x.id === b.exam_id)!.start_at));
    const perDay = new Map<string, number>();
    for (const b of blocks) {
      const d = b.start_at.slice(0, 10);
      perDay.set(d, (perDay.get(d) ?? 0) + (Date.parse(b.end_at) - Date.parse(b.start_at)) / 3_600_000);
    }
    for (const h of perDay.values()) assert(h <= DEFAULT_SETTINGS.hours_per_day + 1e-9);
    assert(blocks[0].title.startsWith('Study for Midterm 1'));
    assert(/of 9 h placed/.test(blocks[0].reason));
  },
);

Deno.test(
  'validate drops blocks outside free time, after the exam, overlapping, or over the daily cap',
  () => {
    const slots = freeSlots(FROM, TO, BUSY, DEFAULT_SETTINGS, TZ);
    const good: Block = {
      exam_id: 'x1',
      course: 'DSC 140A',
      title: 'ok',
      start_at: '2026-10-21T16:00:00.000Z',
      end_at: '2026-10-21T17:30:00.000Z',
      reason: '',
    };
    const inClass: Block = {
      ...good,
      start_at: '2026-10-21T21:15:00.000Z',
      end_at: '2026-10-21T22:00:00.000Z',
    };
    const afterExam: Block = {
      ...good,
      start_at: '2026-10-27T02:00:00.000Z',
      end_at: '2026-10-27T03:00:00.000Z',
    };
    const overlap: Block = {
      ...good,
      start_at: '2026-10-21T17:00:00.000Z',
      end_at: '2026-10-21T18:00:00.000Z',
    };
    const tooLong: Block = {
      ...good,
      start_at: '2026-10-22T23:00:00.000Z',
      end_at: '2026-10-23T04:30:00.000Z',
    };
    const r = validate(
      [good, inClass, afterExam, overlap, tooLong, { ...good, exam_id: 'nope' }],
      EXAMS,
      slots,
      DEFAULT_SETTINGS,
      TZ,
    );
    assertEquals(r.kept, [good]);
    assertEquals(r.dropped, 5);
  },
);

Deno.test('draftWithClaude sends exams and slots in local time and parses the blocks back', async () => {
  let body: Record<string, unknown> = {};
  const fetchImpl = (async (_i: RequestInfo | URL, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        id: 'm',
        type: 'message',
        role: 'assistant',
        model: 'claude-haiku-5-5',
        stop_reason: 'end_turn',
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              blocks: [
                {
                  exam_id: 'x1',
                  course: 'DSC 140A',
                  title: 'Lectures 1–4 into notes',
                  start_at: '2026-10-21T09:00:00-07:00',
                  end_at: '2026-10-21T10:30:00-07:00',
                  reason: '25 % of the grade, 5 days out',
                },
              ],
            }),
          },
        ],
        usage: { input_tokens: 3000, cache_read_input_tokens: 2500, output_tokens: 200 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
  const slots = freeSlots(FROM, TO, BUSY, DEFAULT_SETTINGS, TZ);
  const { blocks, usage } = await draftWithClaude(EXAMS, slots, DEFAULT_SETTINGS, {
    model: 'claude-haiku-5-5',
    apiKey: 'k',
    timezone: TZ,
    fetchImpl,
  });
  const sent = JSON.parse((body.messages as { content: string }[])[0].content);
  assertEquals(sent.exams[0].start_at, '2026-10-26T17:00:00-07:00');
  assertEquals(sent.free_slots[0].start, '2026-10-21T09:00:00-07:00');
  assertEquals((body.output_config as { effort: string }).effort, 'low');
  assertEquals(blocks[0].start_at, '2026-10-21T16:00:00.000Z');
  assert(usage.cents > 0);
  assertEquals(validate(blocks, EXAMS, slots, DEFAULT_SETTINGS, TZ).kept.length, 1);
});

Deno.test('preferred hours need two measured sessions averaging 60 % or more, in local time', () => {
  const at = (iso: string, focus: number | null) => ({ started_at: iso, focus_pct: focus });
  const sessions = [
    at('2026-10-15T16:05:00Z', 72), // 9 AM Pacific
    at('2026-10-16T16:40:00Z', 65), // 9 AM
    at('2026-10-17T16:10:00Z', null), // unmeasured: ignored
    at('2026-10-15T04:00:00Z', 90), // 9 PM, only once
    at('2026-10-16T20:00:00Z', 40), // 1 PM
    at('2026-10-17T20:30:00Z', 70), // 1 PM: average 55
  ];
  assertEquals([...preferredHours(sessions, TZ)], [9]);
  assertEquals(preferredHours([], TZ).size, 0);
});

Deno.test('a good hour gets first pick within its day; without history nothing changes', () => {
  const slots = freeSlots(FROM, TO, BUSY, DEFAULT_SETTINGS, TZ);
  const plain = allocate(EXAMS, slots, DEFAULT_SETTINGS, NOW);
  assertEquals(allocate(EXAMS, slots, DEFAULT_SETTINGS, NOW, { hours: new Set(), tz: TZ }), plain);
  // One block a day, so the slot chosen first is the one that shows. Thursday has a morning slot
  // (9–10:45) and an afternoon one (3:15 PM on); prefer 3 PM.
  const oneADay = { ...DEFAULT_SETTINGS, hours_per_day: 1.5 };
  const thu = (bs: Block[]) => bs.filter((b) => b.start_at.startsWith('2026-10-22'));
  assertEquals(
    thu(allocate(EXAMS, slots, oneADay, NOW)).map((b) => b.start_at),
    ['2026-10-22T16:00:00.000Z'],
  );
  const tuned = allocate(EXAMS, slots, oneADay, NOW, { hours: new Set([15]), tz: TZ });
  assertEquals(
    thu(tuned).map((b) => b.start_at),
    ['2026-10-22T22:15:00.000Z'],
  );
  assert(thu(tuned)[0].reason.endsWith('an hour that has worked for you'));
  const { dropped } = validate(tuned, EXAMS, slots, oneADay, TZ);
  assertEquals(dropped, 0);
});
