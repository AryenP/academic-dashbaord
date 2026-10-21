// The AI's weekly review: three plain sentences from the week's numbers. What went to plan, what
// didn't, one change for next week. No judgement words, no exclamation marks.
import Anthropic from 'npm:@anthropic-ai/sdk@0.135.0';
import { cents, type AiUsage } from './ai.ts';

export interface WeekFacts {
  week_start: string; // YYYY-MM-DD
  week_end: string;
  planned_minutes: number;
  actual_minutes: number;
  by_course: { course: string; planned_min: number; actual_min: number }[];
  sessions: number;
  avg_focus_pct: number | null;
  best_session: { course: string; minutes: number; focus_pct: number | null } | null;
  worst_session: { course: string; minutes: number; focus_pct: number | null } | null;
  streak_days: number;
  deadlines: { on_time: number; late: number; missed: number };
  upcoming_exams: {
    course: string;
    title: string;
    days_away: number;
    studied_hours: number;
    planned_hours: number;
  }[];
  late_night_minutes: number; // sessions starting after 11 PM
}

export const WEEKLY_PROMPT = `You write a three-sentence weekly review for a university student using Runway, a study app, from the numbers they give you.

Sentence 1: what went to plan this week, with the one number that shows it.
Sentence 2: what didn't, with its number. If nothing went wrong, say what was thin instead.
Sentence 3: one concrete change for next week, tied to an upcoming exam or a pattern in the numbers (a course that got nothing, a late-night habit, a streak to keep).

Rules: exactly three sentences, under 70 words total, second person, plain words, no exclamation marks, no praise words like "great" or "amazing", no emoji, no bullet points. Use hours ("4.5 h") and course codes as given. Never invent a number that isn't in the input.`;

const SCHEMA = {
  type: 'object',
  properties: { review: { type: 'string' } },
  required: ['review'],
  additionalProperties: false,
} as const;

export async function writeWeekly(
  facts: WeekFacts,
  opts: { model: string; apiKey: string; fetchImpl?: typeof fetch },
): Promise<{ text: string; usage: AiUsage }> {
  const client = new Anthropic({ apiKey: opts.apiKey, fetch: opts.fetchImpl, maxRetries: 2 });
  const response = await client.messages.create({
    model: opts.model,
    max_tokens: 1000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: [{ type: 'text', text: WEEKLY_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: JSON.stringify(facts) }],
  });
  if (response.stop_reason === 'refusal') throw new Error('The model declined.');
  const text = response.content.find((b) => b.type === 'text')?.text ?? '';
  let parsed: { review: string };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('The model answered with something other than the expected JSON.');
  }
  const u = response.usage;
  const usage: AiUsage = {
    input_tokens: u.input_tokens,
    cached_tokens: u.cache_read_input_tokens ?? 0,
    output_tokens: u.output_tokens,
    cents: 0,
    model: response.model,
  };
  usage.cents = cents(opts.model, usage);
  return { text: String(parsed.review).trim().slice(0, 600), usage };
}
