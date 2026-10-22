import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { WEEKLY_PROMPT, writeWeekly, type WeekFacts } from './weekly.ts';

const FACTS: WeekFacts = {
  week_start: '2026-10-19',
  week_end: '2026-10-25',
  planned_minutes: 600,
  actual_minutes: 420,
  by_course: [
    { course: 'DSC 140A', planned_min: 360, actual_min: 300 },
    { course: 'DSC 102', planned_min: 240, actual_min: 120 },
  ],
  sessions: 6,
  avg_focus_pct: 71.5,
  best_session: { course: 'DSC 140A', minutes: 85, focus_pct: 92 },
  worst_session: { course: 'DSC 102', minutes: 40, focus_pct: 48 },
  streak_days: 4,
  deadlines: { on_time: 2, late: 0, missed: 1 },
  upcoming_exams: [
    { course: 'DSC 140A', title: 'Midterm 1', days_away: 3, studied_hours: 5, planned_hours: 4 },
  ],
  late_night_minutes: 95,
  sleep_avg_h: 6.4,
  exercise_days: 2,
  signal_days: 5,
};

function fakeApi(answer: unknown) {
  const calls: { body: Record<string, unknown> }[] = [];
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    calls.push({ body });
    return new Response(
      JSON.stringify({
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: body.model,
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify(answer) }],
        usage: { input_tokens: 900, cache_read_input_tokens: 700, output_tokens: 60 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
  return { calls, fetchImpl };
}

Deno.test('the week review sends the facts, signals included, under the cached prompt', async () => {
  const api = fakeApi({
    review:
      'Plan held on DSC 140A with 5 h of 6 h done. DSC 102 got 2 h of 4 h. With 6.4 h of sleep on average, late nights tend to cost focus: move the 95 late-night minutes earlier before Midterm 1.',
  });
  const { text, usage } = await writeWeekly(FACTS, {
    model: 'claude-haiku-5-5',
    apiKey: 'k',
    fetchImpl: api.fetchImpl,
  });
  assertEquals(api.calls.length, 1);
  const body = api.calls[0].body as {
    system: { text: string; cache_control?: unknown }[];
    messages: { content: string }[];
    output_config: { format: { type: string } };
  };
  assertEquals(body.system[0].text, WEEKLY_PROMPT);
  assert(body.system[0].cache_control);
  assertEquals(body.output_config.format.type, 'json_schema');
  const sent = JSON.parse(body.messages[0].content) as WeekFacts;
  assertEquals(sent.sleep_avg_h, 6.4);
  assertEquals(sent.exercise_days, 2);
  assertEquals(sent.signal_days, 5);
  assert(text.startsWith('Plan held'));
  assert(usage.cents > 0);
  assertEquals(usage.cached_tokens, 700);
});

Deno.test('the prompt keeps signals a pattern, and silent without them', () => {
  assert(/tends to/.test(WEEKLY_PROMPT));
  assert(/never "because"/.test(WEEKLY_PROMPT));
  assert(/signal_days is 0/.test(WEEKLY_PROMPT));
  assert(/exactly three sentences/.test(WEEKLY_PROMPT));
});

Deno.test('a non-JSON answer is an error, not an empty review', async () => {
  const fetchImpl = (async () =>
    new Response(
      JSON.stringify({
        id: 'msg_2',
        type: 'message',
        role: 'assistant',
        model: 'm',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'not json' }],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch;
  await assertRejects(() => writeWeekly(FACTS, { model: 'm', apiKey: 'k', fetchImpl }), Error, 'JSON');
});
