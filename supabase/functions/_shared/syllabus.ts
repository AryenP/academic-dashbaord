// Reads a syllabus PDF: the course, its exams (date, time, weight, place) and the other graded
// deadlines, each with the page and the words it came from, so the review screen can show where
// a date came from. Structured output; the PDF goes in as a document block.
import Anthropic from 'npm:@anthropic-ai/sdk@0.135.0';
import { cents, type AiUsage } from './ai.ts';

export interface SyllabusItem {
  kind: 'exam' | 'deadline';
  title: string;
  date: string | null; // YYYY-MM-DD
  time: string | null; // HH:MM, 24h
  end_time: string | null;
  weight: number | null; // % of the grade
  location: string | null;
  take_home: boolean;
  page: number | null;
  quote: string; // the words on the page this came from
}

export interface SyllabusReading {
  course_code: string | null;
  course_name: string | null;
  term: string | null;
  items: SyllabusItem[];
  grading: { component: string; weight: number }[];
}

export const SYLLABUS_PROMPT = `You read a university course syllabus for Runway, a study app, and pull out what a student needs on their calendar.

Find:
- The course code ("DSC 140A": uppercase letters, a space, the number) and its name, and the term if stated.
- Every exam: midterms, finals, quizzes with a fixed date. Give the date as YYYY-MM-DD (use the term's year; if only a weekday and week are given, say so in the quote and leave date null), the start time and end time as HH:MM in 24-hour time when stated, the weight as a percentage of the grade when stated, the location, and whether it's take-home.
- Graded deadlines with a fixed date: projects, papers, problem sets with dates listed. Not weekly recurring homework with no dates.
- The grading breakdown: each component and its percentage.

For every item, give the page number it appears on and a short quote (at most 20 words) copied from the page, so the student can check it. Do not invent dates: when the syllabus says "TBA" or gives no date, leave date null and keep the quote.`;

const SCHEMA = {
  type: 'object',
  properties: {
    course_code: { type: ['string', 'null'] },
    course_name: { type: ['string', 'null'] },
    term: { type: ['string', 'null'] },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['exam', 'deadline'] },
          title: { type: 'string' },
          date: { type: ['string', 'null'] },
          time: { type: ['string', 'null'] },
          end_time: { type: ['string', 'null'] },
          weight: { type: ['number', 'null'] },
          location: { type: ['string', 'null'] },
          take_home: { type: 'boolean' },
          page: { type: ['integer', 'null'] },
          quote: { type: 'string' },
        },
        required: [
          'kind',
          'title',
          'date',
          'time',
          'end_time',
          'weight',
          'location',
          'take_home',
          'page',
          'quote',
        ],
        additionalProperties: false,
      },
    },
    grading: {
      type: 'array',
      items: {
        type: 'object',
        properties: { component: { type: 'string' }, weight: { type: 'number' } },
        required: ['component', 'weight'],
        additionalProperties: false,
      },
    },
  },
  required: ['course_code', 'course_name', 'term', 'items', 'grading'],
  additionalProperties: false,
} as const;

export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export async function readSyllabus(
  pdfBase64: string,
  opts: { model: string; apiKey: string; fetchImpl?: typeof fetch; hint?: string },
): Promise<{ reading: SyllabusReading; usage: AiUsage }> {
  const client = new Anthropic({ apiKey: opts.apiKey, fetch: opts.fetchImpl, maxRetries: 2 });
  const response = await client.messages.create({
    model: opts.model,
    max_tokens: 16000,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    system: [{ type: 'text', text: SYLLABUS_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
          {
            type: 'text',
            text: opts.hint
              ? `Read this syllabus. The student says it is for ${opts.hint}.`
              : 'Read this syllabus.',
          },
        ],
      },
    ],
  });
  if (response.stop_reason === 'refusal') throw new Error('The model declined to read this file.');
  if (response.stop_reason === 'max_tokens') throw new Error('The reading was cut off.');
  const text = response.content.find((b) => b.type === 'text')?.text ?? '';
  let reading: SyllabusReading;
  try {
    reading = JSON.parse(text);
  } catch {
    throw new Error('The model answered with something other than the expected JSON.');
  }
  reading.items = (reading.items ?? [])
    .filter((i) => i && typeof i.title === 'string')
    .map((i) => ({
      ...i,
      title: i.title.slice(0, 120),
      date: i.date && /^\d{4}-\d{2}-\d{2}$/.test(i.date) ? i.date : null,
      time: i.time && /^\d{2}:\d{2}$/.test(i.time) ? i.time : null,
      end_time: i.end_time && /^\d{2}:\d{2}$/.test(i.end_time) ? i.end_time : null,
      weight: i.weight == null ? null : Math.max(0, Math.min(100, Number(i.weight))),
      quote: String(i.quote ?? '').slice(0, 200),
    }));
  const u = response.usage;
  const usage: AiUsage = {
    input_tokens: u.input_tokens,
    cached_tokens: u.cache_read_input_tokens ?? 0,
    output_tokens: u.output_tokens,
    cents: 0,
    model: response.model,
  };
  usage.cents = cents(opts.model, usage);
  return { reading, usage };
}
