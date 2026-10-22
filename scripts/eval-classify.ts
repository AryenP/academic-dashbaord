// Scores the title rules, and optionally Claude, on eval/classify.json. See eval/README.md.
import { classify, placeByContext, type ContextEvent } from '../supabase/functions/_shared/classify.ts';
import { classifyWithClaude, type AiEvent } from '../supabase/functions/_shared/ai.ts';

interface Labeled {
  title: string;
  start: string;
  end: string;
  all_day: boolean;
  location: string;
  source_kind: 'ical' | 'canvas' | 'ics_upload';
  /** Which calendar it came from; events without one share a calendar per source kind. */
  calendar?: string;
  expect: { kind: string; course: string | null };
}
const set = JSON.parse(await Deno.readTextFile(new URL('../eval/classify.json', import.meta.url))) as {
  timezone: string;
  known_courses: { code: string; name: string | null }[];
  events: Labeled[];
};
const args = Deno.args;
const useAi = args.includes('--ai');
const model =
  args[args.indexOf('--model') + 1] && args.includes('--model')
    ? args[args.indexOf('--model') + 1]
    : 'claude-opus-5-5';

function score(name: string, got: { kind: string; course: string | null }[]) {
  let kindOk = 0;
  let courseOk = 0;
  const misses: string[] = [];
  set.events.forEach((e, i) => {
    const g = got[i];
    const k = g.kind === e.expect.kind;
    const c = (g.course ?? null) === (e.expect.course ?? null);
    if (k) kindOk++;
    if (c) courseOk++;
    if (!k || !c)
      misses.push(
        `  ${e.title}  → ${g.kind}/${g.course ?? '-'}  (want ${e.expect.kind}/${e.expect.course ?? '-'})`,
      );
  });
  const n = set.events.length;
  console.log(
    `${name}: kind ${((100 * kindOk) / n).toFixed(1)} %, course ${((100 * courseOk) / n).toFixed(1)} % (${n} events)`,
  );
  if (misses.length) console.log(misses.join('\n'));
}

// The title rules, then the context pass over the whole set, as the sync runs them: every event of
// a source kind counts as one calendar here.
const CALENDARS: Record<Labeled['source_kind'], string> = {
  ical: 'School',
  canvas: 'Canvas',
  ics_upload: 'Upload',
};
const rules = set.events.map((e) => {
  const r = classify({
    title: e.title,
    allDay: e.all_day,
    sourceKind: e.source_kind,
    knownCourses: set.known_courses.map((c) => c.code),
    uid:
      e.source_kind === 'canvas' && !/midterm|section|lecture/i.test(e.title)
        ? 'event-assignment-1'
        : 'event-1',
  });
  return { kind: r.kind, course: r.course, confidence: r.confidence };
});
const ctx: ContextEvent[] = set.events.map((e, i) => ({
  key: String(i),
  start: e.start,
  kind: rules[i].kind,
  course: rules[i].course,
  confidence: rules[i].confidence,
  sourceId: e.calendar ?? e.source_kind,
  sourceKind: e.source_kind,
}));
for (const [key, r] of placeByContext(ctx)) rules[Number(key)] = r;

score(
  'rules',
  rules.map((r) => ({ kind: r.kind, course: r.course })),
);

if (useAi) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is not set.');
    Deno.exit(2);
  }
  const events: AiEvent[] = set.events.map((e, i) => ({
    id: String(i),
    title: e.title,
    start: e.start,
    end: e.end,
    all_day: e.all_day,
    location: e.location,
    source_kind: e.source_kind,
    calendar: e.calendar ?? CALENDARS[e.source_kind],
    rules: { kind: rules[i].kind, course_code: rules[i].course, confidence: rules[i].confidence },
  }));
  const t0 = Date.now();
  const { readings, usage } = await classifyWithClaude(events, {
    model,
    apiKey,
    timezone: set.timezone,
    knownCourses: set.known_courses,
  });
  const byId = new Map(readings.map((r) => [r.id, r]));
  score(
    model,
    set.events.map((_, i) => {
      const r = byId.get(String(i));
      return { kind: r?.kind ?? 'missing', course: r?.course_code ?? null };
    }),
  );
  console.log(
    `${model}: ${usage.input_tokens} in (${usage.cached_tokens} cached), ${usage.output_tokens} out, ${usage.cents.toFixed(3)} ¢, ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  );
}
