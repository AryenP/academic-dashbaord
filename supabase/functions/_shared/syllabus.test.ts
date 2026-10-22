import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { readSyllabus } from './syllabus.ts';
import { writeWeekly, type WeekFacts } from './weekly.ts';

function fakeApi(answer: unknown) {
  const calls: Record<string, unknown>[] = [];
  const fetchImpl = (async (_i: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    calls.push(body);
    return new Response(
      JSON.stringify({
        id: 'm',
        type: 'message',
        role: 'assistant',
        model: body.model,
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify(answer) }],
        usage: { input_tokens: 9000, cache_read_input_tokens: 600, output_tokens: 300 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
  return { calls, fetchImpl };
}

Deno.test('a syllabus goes in as a PDF document; exams come back dated with a page and a quote', async () => {
  const api = fakeApi({
    course_code: 'dsc140a',
    course_name: 'Probabilistic Modeling and Machine Learning',
    term: 'Fall 2026',
    items: [
      {
        kind: 'exam',
        title: 'Midterm 1',
        date: '2026-10-26',
        time: '17:00',
        end_time: '18:00',
        weight: 25,
        location: 'Mandeville B-202',
        take_home: false,
        page: 3,
        quote: 'Midterm 1: Oct 26, 5–6 PM, 25%',
      },
      {
        kind: 'exam',
        title: 'Final',
        date: 'TBA',
        time: null,
        end_time: null,
        weight: 40,
        location: null,
        take_home: false,
        page: 3,
        quote: 'Final exam: date TBA',
      },
      {
        kind: 'deadline',
        title: 'Project proposal',
        date: '2026-11-03',
        time: '23:59',
        end_time: null,
        weight: 5,
        location: null,
        take_home: false,
        page: 4,
        quote: 'Proposal due Nov 3',
      },
    ],
    grading: [
      { component: 'Midterms', weight: 50 },
      { component: 'Final', weight: 40 },
    ],
  });
  const { reading, usage } = await readSyllabus('JVBERi0xLjQK', {
    model: 'claude-haiku-5-5',
    apiKey: 'k',
    fetchImpl: api.fetchImpl,
    hint: 'DSC 140A',
  });
  const content = (
    api.calls[0].messages as { content: { type: string; source?: { media_type: string }; text?: string }[] }[]
  )[0].content;
  assertEquals(content[0].type, 'document');
  assertEquals(content[0].source?.media_type, 'application/pdf');
  assert(content[1].text?.includes('DSC 140A'));
  assertEquals((api.calls[0].output_config as { format: { type: string } }).format.type, 'json_schema');
  assertEquals(reading.items.length, 3);
  assertEquals(reading.items[0].date, '2026-10-26');
  assertEquals(reading.items[1].date, null); // "TBA" is not a date
  assertEquals(reading.items[2].time, '23:59');
  assert(usage.cents > 0);
});

Deno.test('the weekly review is one short paragraph from the facts', async () => {
  const api = fakeApi({
    review:
      'You studied 6.5 h of the 8 h planned. CSE 12 got nothing. Put one block before the Thursday midterm.',
  });
  const facts: WeekFacts = {
    week_start: '2026-10-19',
    week_end: '2026-10-25',
    planned_minutes: 480,
    actual_minutes: 390,
    by_course: [
      { course: 'DSC 140A', planned_min: 300, actual_min: 390 },
      { course: 'CSE 12', planned_min: 180, actual_min: 0 },
    ],
    sessions: 5,
    avg_focus_pct: 84,
    best_session: { course: 'DSC 140A', minutes: 90, focus_pct: 96 },
    worst_session: { course: 'DSC 140A', minutes: 40, focus_pct: 61 },
    streak_days: 3,
    deadlines: { on_time: 2, late: 0, missed: 1 },
    upcoming_exams: [
      { course: 'CSE 12', title: 'Midterm', days_away: 4, studied_hours: 0, planned_hours: 3 },
    ],
    late_night_minutes: 45,
    sleep_avg_h: null,
    exercise_days: 0,
    signal_days: 0,
  };
  const { text } = await writeWeekly(facts, {
    model: 'claude-haiku-5-5',
    apiKey: 'k',
    fetchImpl: api.fetchImpl,
  });
  assert(text.startsWith('You studied'));
  const sent = JSON.parse((api.calls[0].messages as { content: string }[])[0].content);
  assertEquals(sent.deadlines, { on_time: 2, late: 0, missed: 1 });
  assertEquals((api.calls[0].max_tokens as number) <= 2000, true);
  const refuse = (async () =>
    new Response(
      JSON.stringify({
        id: 'm',
        type: 'message',
        role: 'assistant',
        model: 'x',
        stop_reason: 'refusal',
        content: [],
        usage: { input_tokens: 1, output_tokens: 0 },
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    )) as typeof fetch;
  await assertRejects(() =>
    writeWeekly(facts, { model: 'claude-haiku-5-5', apiKey: 'k', fetchImpl: refuse }),
  );
});
