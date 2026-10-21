// Claude reads calendar events the title rules were unsure about. One request per batch, with a
// long, stable system prompt (cached) and the events after it; structured output so the answer
// always fits the schema. Costs are computed from the usage block so every call is metered.
import Anthropic from 'npm:@anthropic-ai/sdk@0.135.0';
import type { EventKind } from './classify.ts';

export interface AiEvent {
  id: string;
  title: string;
  start: string; // local wall time with offset
  end: string;
  all_day: boolean;
  location: string;
  source_kind: 'ical' | 'canvas' | 'ics_upload';
  /** What the rules thought, so the model can agree cheaply. */
  rules: { kind: string; course_code: string | null };
}

export interface AiReading {
  id: string;
  kind: EventKind;
  course_code: string | null;
  course_name: string | null;
  confidence: number;
  weight: number | null;
  take_home: boolean;
  reason: string;
}

export interface AiUsage {
  input_tokens: number;
  cached_tokens: number;
  output_tokens: number;
  cents: number;
  model: string;
}

// $ per million tokens: input, cache read, output.
const PRICES: Record<string, [number, number, number]> = {
  'claude-opus-5-5': [4, 0.2, 20],
  'claude-haiku-5-5': [0.1, 0.01, 0.5],
  'claude-sonnet-5-5': [2, 0.2, 10],
};

export function cents(
  model: string,
  u: { input_tokens: number; cached_tokens: number; output_tokens: number },
) {
  const [i, c, o] = PRICES[model] ?? PRICES['claude-opus-5-5'];
  return ((u.input_tokens * i + u.cached_tokens * c + u.output_tokens * o) / 1_000_000) * 100;
}

export const SYSTEM_PROMPT = `You read a university student's calendar for Runway, a study app, and say what each event is.

For every event, decide its kind:
- "class": a scheduled meeting of a course: lecture, discussion, section, lab, seminar, recitation, studio, office hours.
- "exam": a midterm, final, quiz, or test. A take-home exam that spans a day or more is still an exam (take_home: true).
- "deadline": something due: homework, problem set, project, essay, lab report, checkpoint, peer review, a Canvas assignment. Due at the event's time.
- "study": time the student set aside to study, review, practice or prepare for a course. A "midterm review" is study, not an exam.
- "commitment": fixed non-course time: a job or shift, research, internship, a club, a standing meeting, volunteering, rehearsal, TA or tutoring hours.
- "personal": everything else: meals, friends, travel, appointments, holidays, "no class" days, reminders.

Find the course: a code like "DSC 140A", "CSE 12", "MATH 20C", "COGS 1". Normalize to uppercase letters, a space, then the number ("dsc140a" -> "DSC 140A"). Canvas puts the course in square brackets at the end of the title; use the code from inside the brackets and put the course's long name in course_name. If an event clearly belongs to a course but the title only has the number ("Midterm 1 (140A)", "📚 140A practice"), pick the code from the student's known courses whose number matches. If the course can't be told, set course_code to null. Never invent a department.

Weight: if the title or location states what fraction of the grade an exam is worth ("25%"), set weight to that number; else null.

Confidence is your own, 0 to 1: 0.95 when the title says it outright, lower when you're guessing.

Reason: at most ten words, for the student to see ("'lecture' in the title", "Canvas assignment").

Answer with one reading per event id, in the same order. Do not skip or add events.`;

const SCHEMA = {
  type: 'object',
  properties: {
    readings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          kind: { type: 'string', enum: ['class', 'exam', 'deadline', 'study', 'commitment', 'personal'] },
          course_code: { type: ['string', 'null'] },
          course_name: { type: ['string', 'null'] },
          confidence: { type: 'number' },
          weight: { type: ['number', 'null'] },
          take_home: { type: 'boolean' },
          reason: { type: 'string' },
        },
        required: ['id', 'kind', 'course_code', 'course_name', 'confidence', 'weight', 'take_home', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['readings'],
  additionalProperties: false,
} as const;

export const MAX_PER_CALL = 150;

export interface ClassifyOptions {
  model: string;
  apiKey: string;
  timezone: string;
  knownCourses: { code: string; name: string | null }[];
  fetchImpl?: typeof fetch;
}

/** One call: readings for up to MAX_PER_CALL events, plus what it cost. */
export async function classifyWithClaude(
  events: AiEvent[],
  opts: ClassifyOptions,
): Promise<{ readings: AiReading[]; usage: AiUsage }> {
  if (events.length === 0)
    return {
      readings: [],
      usage: { input_tokens: 0, cached_tokens: 0, output_tokens: 0, cents: 0, model: opts.model },
    };
  if (events.length > MAX_PER_CALL) throw new Error(`at most ${MAX_PER_CALL} events per call`);
  const client = new Anthropic({ apiKey: opts.apiKey, fetch: opts.fetchImpl, maxRetries: 2 });
  const user = JSON.stringify({
    timezone: opts.timezone,
    known_courses: opts.knownCourses,
    events,
  });
  const response = await client.messages.create({
    model: opts.model,
    max_tokens: 16000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
  });
  if (response.stop_reason === 'refusal') throw new Error('The model declined to read these events.');
  if (response.stop_reason === 'max_tokens')
    throw new Error('The reading was cut off; fewer events per call.');
  const text = response.content.find((b) => b.type === 'text')?.text ?? '';
  let parsed: { readings: AiReading[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('The model answered with something other than the expected JSON.');
  }
  const ids = new Set(events.map((e) => e.id));
  const readings = parsed.readings
    .filter((r) => ids.has(r.id))
    .map((r) => ({
      ...r,
      course_code: r.course_code ? normalizeCode(r.course_code) : null,
      confidence: Math.max(0, Math.min(1, Number(r.confidence) || 0)),
      weight: r.weight == null ? null : Math.max(0, Math.min(100, Number(r.weight))),
      reason: String(r.reason ?? '').slice(0, 120),
    }));
  const u = response.usage;
  const usage = {
    input_tokens: u.input_tokens,
    cached_tokens: u.cache_read_input_tokens ?? 0,
    output_tokens: u.output_tokens,
    cents: 0,
    model: response.model,
  };
  usage.cents = cents(opts.model, usage);
  return { readings, usage };
}

/** "dsc140a" / "DSC-140A" → "DSC 140A". Anything else is returned trimmed. */
export function normalizeCode(code: string): string {
  const m = code
    .trim()
    .toUpperCase()
    .match(/^([A-Z]{2,5})[\s-]?(\d{1,3}[A-Z]{0,2})$/);
  return m ? `${m[1]} ${m[2]}` : code.trim();
}
