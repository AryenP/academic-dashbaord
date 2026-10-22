import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { cents, classifyWithClaude, normalizeCode, SYSTEM_PROMPT, type AiEvent } from './ai.ts';

const EVENTS: AiEvent[] = [
  {
    id: 'e1',
    title: '📚 140A practice problems',
    start: '2026-10-22T09:45:00-07:00',
    end: '2026-10-22T13:45:00-07:00',
    all_day: false,
    location: '',
    source_kind: 'ical',
    calendar: 'School',
    rules: { kind: 'study', course_code: null, confidence: 0.6 },
  },
  {
    id: 'e2',
    title: 'Dinner with Sam',
    start: '2026-10-24T19:00:00-07:00',
    end: '2026-10-24T22:00:00-07:00',
    all_day: false,
    location: '',
    source_kind: 'ical',
    rules: { kind: 'personal', course_code: null },
  },
];

/** A fake Messages API that records the request and answers with readings. */
function fakeApi(
  answer: unknown,
  usage = { input_tokens: 1200, cache_read_input_tokens: 1000, output_tokens: 80 },
) {
  const calls: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const body = JSON.parse(String(init?.body ?? '{}'));
    calls.push({ url, headers: new Headers(init?.headers), body });
    return new Response(
      JSON.stringify({
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: body.model,
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify(answer) }],
        usage,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const OPTS = {
  model: 'claude-opus-5-5',
  apiKey: 'sk-test',
  timezone: 'America/Los_Angeles',
  knownCourses: [{ code: 'DSC 140A', name: null }],
};

Deno.test('sends the stable prompt cached, the events after it, and asks for the schema', async () => {
  const api = fakeApi({
    readings: [
      {
        id: 'e1',
        kind: 'study',
        course_code: 'dsc140a',
        course_name: null,
        confidence: 0.9,
        weight: null,
        take_home: false,
        reason: 'books emoji, 140A matches a known course',
      },
      {
        id: 'e2',
        kind: 'personal',
        course_code: null,
        course_name: null,
        confidence: 0.95,
        weight: null,
        take_home: false,
        reason: 'dinner',
      },
    ],
  });
  const { readings, usage } = await classifyWithClaude(EVENTS, { ...OPTS, fetchImpl: api.fetchImpl });
  assertEquals(api.calls.length, 1);
  const body = api.calls[0].body as {
    model: string;
    system: { text: string; cache_control?: unknown }[];
    messages: { content: string }[];
    output_config: { format: { type: string }; effort: string };
    max_tokens: number;
  };
  assertEquals(body.model, 'claude-opus-5-5');
  assertEquals(body.system[0].text, SYSTEM_PROMPT);
  assertEquals(body.system[0].cache_control, { type: 'ephemeral' });
  assertEquals(body.output_config.format.type, 'json_schema');
  assertEquals(body.output_config.effort, 'low');
  const sent = JSON.parse(body.messages[0].content);
  assertEquals(sent.known_courses, [{ code: 'DSC 140A', name: null }]);
  assertEquals(
    sent.events.map((e: AiEvent) => e.id),
    ['e1', 'e2'],
  );
  // The calendar's name and the rules' confidence travel with each event.
  assertEquals(sent.events[0].calendar, 'School');
  assertEquals(sent.events[0].rules, { kind: 'study', course_code: null, confidence: 0.6 });
  assertEquals(api.calls[0].headers.get('x-api-key'), 'sk-test');
  // Readings come back normalized.
  assertEquals(readings[0].course_code, 'DSC 140A');
  assertEquals(readings[1].kind, 'personal');
  assertEquals(usage.cached_tokens, 1000);
  assert(usage.cents > 0 && usage.cents < 1);
});

Deno.test('ignores readings for ids it did not send, and clamps numbers', async () => {
  const api = fakeApi({
    readings: [
      {
        id: 'nope',
        kind: 'exam',
        course_code: null,
        course_name: null,
        confidence: 1,
        weight: null,
        take_home: false,
        reason: '',
      },
      {
        id: 'e1',
        kind: 'exam',
        course_code: 'DSC 140A',
        course_name: 'Prob',
        confidence: 7,
        weight: 250,
        take_home: true,
        reason: 'x'.repeat(300),
      },
    ],
  });
  const { readings } = await classifyWithClaude(EVENTS, { ...OPTS, fetchImpl: api.fetchImpl });
  assertEquals(readings.length, 1);
  assertEquals(readings[0].confidence, 1);
  assertEquals(readings[0].weight, 100);
  assertEquals(readings[0].reason.length, 120);
});

Deno.test('a refusal or junk answer is an error, never a silent empty reading', async () => {
  const fetchImpl = (async () =>
    new Response(
      JSON.stringify({
        id: 'm',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5-5',
        stop_reason: 'refusal',
        content: [],
        usage: { input_tokens: 1, output_tokens: 0 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch;
  await assertRejects(() => classifyWithClaude(EVENTS, { ...OPTS, fetchImpl }), Error, 'declined');
  const junk = fakeApi('not json');
  const junkFetch = (async (i: RequestInfo | URL, init?: RequestInit) => {
    const r = await junk.fetchImpl(i, init);
    const j = await r.json();
    j.content = [{ type: 'text', text: 'oops' }];
    return new Response(JSON.stringify(j), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  await assertRejects(() => classifyWithClaude(EVENTS, { ...OPTS, fetchImpl: junkFetch }), Error, 'JSON');
});

Deno.test('pricing: cache reads are a tenth of input; Haiku is forty times cheaper', () => {
  const u = { input_tokens: 1_000_000, cached_tokens: 0, output_tokens: 0 };
  assertEquals(cents('claude-opus-5-5', u), 400);
  assertEquals(cents('claude-opus-5-5', { ...u, input_tokens: 0, cached_tokens: 1_000_000 }), 20);
  assertEquals(cents('claude-haiku-5-5', u), 10);
  assertEquals(normalizeCode('dsc-140a'), 'DSC 140A');
  assertEquals(normalizeCode('Intro to Cognitive Science'), 'Intro to Cognitive Science');
});
