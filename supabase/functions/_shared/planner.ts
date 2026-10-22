// Drafts study blocks before each exam. The free time is computed here, deterministically, from
// everything already on the runway and the person's planning settings; the blocks are placed by
// Claude (with a reason each) or, when the AI isn't available, by a plain allocator. Either way
// every block is checked against the free slots before it's kept.
import Anthropic from 'npm:@anthropic-ai/sdk@0.135.0';
import { cents, type AiUsage } from './ai.ts';
import { atWallTime, localIso, offsetMinutes } from '../../../src/lib/tz.ts';

export interface PlanSettings {
  hours_per_day: number; // study hours the person wants at most per day
  earliest: string; // 'HH:MM' wall time
  latest: string;
  block_min: number; // typical block length, minutes
  days_off: number[]; // 0 = Sunday … 6 = Saturday
}

export const DEFAULT_SETTINGS: PlanSettings = {
  hours_per_day: 3,
  earliest: '09:00',
  latest: '22:00',
  block_min: 90,
  days_off: [],
};

export function settingsFrom(raw: unknown): PlanSettings {
  const p = ((raw as { planning?: Partial<PlanSettings> } | null)?.planning ?? {}) as Partial<PlanSettings>;
  const hhmm = (s: unknown, d: string) => (typeof s === 'string' && /^\d{2}:\d{2}$/.test(s) ? s : d);
  return {
    hours_per_day: clamp(Number(p.hours_per_day) || DEFAULT_SETTINGS.hours_per_day, 0.5, 12),
    earliest: hhmm(p.earliest, DEFAULT_SETTINGS.earliest),
    latest: hhmm(p.latest, DEFAULT_SETTINGS.latest),
    block_min: clamp(Number(p.block_min) || DEFAULT_SETTINGS.block_min, 30, 240),
    days_off: Array.isArray(p.days_off) ? p.days_off.map(Number).filter((d) => d >= 0 && d <= 6) : [],
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export interface Exam {
  id: string;
  course: string;
  title: string;
  start_at: string;
  weight: number | null;
  take_home: boolean;
  /** Accepted study hours already on the runway for this exam's course, before the exam. */
  planned_hours: number;
  /** Hours actually studied for the course so far. */
  studied_hours: number;
}

export interface Busy {
  start_at: string;
  end_at: string;
}

export interface Slot {
  day: string; // YYYY-MM-DD in tz
  start: string; // ISO instant
  end: string;
  minutes: number;
}

/** Free slots between `from` and `to`, inside the study window, minus busy time padded by 15 min. */
export function freeSlots(from: Date, to: Date, busy: Busy[], s: PlanSettings, tz: string): Slot[] {
  const [eh, em] = s.earliest.split(':').map(Number);
  const [lh, lm] = s.latest.split(':').map(Number);
  const pad = 15 * 60_000;
  const intervals = busy
    .map((b) => [Date.parse(b.start_at) - pad, Date.parse(b.end_at) + pad] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const slots: Slot[] = [];
  const startDay = localIso(from.getTime(), tz).slice(0, 10);
  for (let i = 0; i < 120; i++) {
    const [y, m, d] = startDay.split('-').map(Number);
    const noon = Date.UTC(y, m - 1, d + i, 12);
    const day = localIso(noon - offsetMinutes(noon, tz) * 60_000, tz).slice(0, 10);
    const wd = new Date(Date.UTC(y, m - 1, d + i)).getUTCDay();
    let a = Date.parse(atWallTime(day, eh, em, tz));
    const b = Date.parse(atWallTime(day, lh, lm, tz));
    if (a >= to.getTime()) break;
    if (s.days_off.includes(wd)) continue;
    a = Math.max(a, from.getTime());
    let cursor = a;
    for (const [bs, be] of intervals) {
      if (be <= cursor) continue;
      if (bs >= b) break;
      if (bs > cursor) pushSlot(slots, day, cursor, Math.min(bs, b), s.block_min);
      cursor = Math.max(cursor, be);
      if (cursor >= b) break;
    }
    if (cursor < b) pushSlot(slots, day, cursor, Math.min(b, to.getTime()), s.block_min);
  }
  return slots;
}

function pushSlot(slots: Slot[], day: string, a: number, b: number, minBlock: number) {
  // Round the start up to the next quarter hour.
  const q = 15 * 60_000;
  const start = Math.ceil(a / q) * q;
  const minutes = Math.floor((b - start) / 60_000);
  if (minutes >= Math.min(minBlock, 45))
    slots.push({ day, start: new Date(start).toISOString(), end: new Date(b).toISOString(), minutes });
}

export interface Block {
  exam_id: string;
  course: string;
  title: string;
  start_at: string;
  end_at: string;
  reason: string;
}

/** How many hours each exam still needs: weight-scaled, minus what's planned and studied. */
export function hoursNeeded(exams: Exam[], now: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const x of exams) {
    const w = x.weight ?? 20;
    // A 25 % exam gets about 12 hours of prep all told; scale from there.
    const target = Math.max(3, Math.round((w / 25) * 12));
    const have = x.planned_hours + x.studied_hours;
    const daysLeft = (Date.parse(x.start_at) - now) / 864e5;
    out.set(x.id, daysLeft <= 0 ? 0 : Math.max(0, target - have));
  }
  return out;
}

/** Hours of the day (local) that have worked for this student: at least two measured sessions in
 * the last two weeks starting in that hour, averaging 60 % focus or more. Empty when there is no
 * history, and the allocator then behaves exactly as before. */
export function preferredHours(
  sessions: { started_at: string; focus_pct: number | string | null }[],
  tz: string,
): Set<number> {
  const byHour = new Map<number, { n: number; sum: number }>();
  for (const x of sessions) {
    if (x.focus_pct == null) continue;
    const h = Number(localIso(x.started_at, tz).slice(11, 13));
    const e = byHour.get(h) ?? { n: 0, sum: 0 };
    e.n++;
    e.sum += Number(x.focus_pct);
    byHour.set(h, e);
  }
  const out = new Set<number>();
  for (const [h, e] of byHour) if (e.n >= 2 && e.sum / e.n >= 60) out.add(h);
  return out;
}

export interface Preference {
  hours: Set<number>;
  tz: string;
}

/** Deterministic placement: earlier exams first, spread across days, and within a day the slots
 * that start in one of the student's good hours first (a small bonus, never a constraint). */
export function allocate(
  exams: Exam[],
  slots: Slot[],
  s: PlanSettings,
  now: number,
  prefer?: Preference,
): Block[] {
  const good = (sl: Slot) =>
    !!prefer &&
    prefer.hours.size > 0 &&
    prefer.hours.has(Number(localIso(sl.start, prefer.tz).slice(11, 13)));
  const need = hoursNeeded(exams, now);
  const byDay = new Map<string, number>(); // minutes already placed that day
  const used: [number, number][] = [];
  const blocks: Block[] = [];
  const order = [...exams].sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at));
  const part = new Map<string, number>();
  for (const x of order) {
    let minutesLeft = Math.round((need.get(x.id) ?? 0) * 60);
    if (minutesLeft <= 0) continue;
    const examT = Date.parse(x.start_at);
    const candidates = slots
      .filter((sl) => Date.parse(sl.start) < examT)
      .sort(
        (a, b) =>
          a.day.localeCompare(b.day) ||
          Number(good(b)) - Number(good(a)) ||
          Date.parse(a.start) - Date.parse(b.start),
      );
    for (const sl of candidates) {
      if (minutesLeft <= 0) break;
      const dayUsed = byDay.get(sl.day) ?? 0;
      const dayRoom = Math.round(s.hours_per_day * 60) - dayUsed;
      if (dayRoom < 45) continue;
      // Find room inside the slot not already used by an earlier block.
      let a = Date.parse(sl.start);
      const b = Math.min(Date.parse(sl.end), examT - 30 * 60_000);
      for (const [ua, ub] of used) if (ua < b && ub > a && ub > a) a = Math.max(a, ub);
      const len = Math.min(s.block_min, minutesLeft, dayRoom, Math.floor((b - a) / 60_000));
      if (len < 45) continue;
      const end = a + len * 60_000;
      used.push([a, end]);
      byDay.set(sl.day, dayUsed + len);
      minutesLeft -= len;
      const n = (part.get(x.id) ?? 0) + 1;
      part.set(x.id, n);
      const daysOut = Math.round((examT - a) / 864e5);
      blocks.push({
        exam_id: x.id,
        course: x.course,
        title: `Study for ${x.title}${n > 1 ? ` (${n})` : ''}`,
        start_at: new Date(a).toISOString(),
        end_at: new Date(end).toISOString(),
        reason: `${x.weight != null ? `${x.weight} % of the grade, ` : ''}${daysOut} ${daysOut === 1 ? 'day' : 'days'} out, ${Math.round(((need.get(x.id) ?? 0) * 60 - minutesLeft + len) / 6) / 10} of ${need.get(x.id)} h placed${good(sl) ? ', an hour that has worked for you' : ''}`,
      });
    }
  }
  return blocks.sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at));
}

/** Keeps only blocks that sit inside a free slot, before their exam, don't overlap, and respect the day cap. */
export function validate(
  blocks: Block[],
  exams: Exam[],
  slots: Slot[],
  s: PlanSettings,
  tz: string,
): { kept: Block[]; dropped: number } {
  const examAt = new Map(exams.map((x) => [x.id, Date.parse(x.start_at)]));
  const byDay = new Map<string, number>();
  const used: [number, number][] = [];
  const kept: Block[] = [];
  let dropped = 0;
  for (const b of [...blocks].sort((x, y) => Date.parse(x.start_at) - Date.parse(y.start_at))) {
    const a = Date.parse(b.start_at);
    const e = Date.parse(b.end_at);
    const exam = examAt.get(b.exam_id);
    const len = (e - a) / 60_000;
    const ok =
      exam != null &&
      e <= exam &&
      len >= 30 &&
      len <= 240 &&
      slots.some((sl) => a >= Date.parse(sl.start) && e <= Date.parse(sl.end)) &&
      !used.some(([ua, ub]) => ua < e && ub > a);
    const day = localIso(a, tz).slice(0, 10);
    const dayUsed = byDay.get(day) ?? 0;
    if (!ok || dayUsed + len > s.hours_per_day * 60 + 1) {
      dropped++;
      continue;
    }
    used.push([a, e]);
    byDay.set(day, dayUsed + len);
    kept.push(b);
  }
  return { kept, dropped };
}

export const PLANNER_PROMPT = `You plan study time for a university student using Runway, a study app.

You get the student's upcoming exams (with the fraction of the grade each is worth, how many hours of study are already on the calendar for it, and how many hours they have already studied for that course), and a list of free time slots, each on a given day with a start and end. Place study blocks into the free slots.

Rules, all strict:
- Every block must lie entirely inside one of the given free slots, and end before its exam starts.
- Blocks must not overlap each other, and there must be at most hours_per_day of study on any day.
- Blocks are 30 to 240 minutes long; prefer about block_min minutes. Use the quarter hour.
- Weight the hours by what the exam is worth and how little is already planned or studied. An exam worth 25 % of the grade deserves about 12 hours of prep in total across planning and studying; scale from there, minimum 3. Don't over-plan: if an exam already has enough, give it little or nothing.
- Spread blocks across days rather than stacking one day; put the last block the day before the exam when possible; leave the hour before an exam free.
- Earlier exams first when slots are scarce.

Titles are short and concrete, from the student's point of view, and build up to the exam: first blocks cover material ("Lectures 1–4 into notes"), middle blocks practice ("Practice problems, set 2"), the last block reviews ("Final review and cheat sheet"). Never use the word "Study" alone as a title.

Reason: one line, at most twelve words, why this block is here ("25 % of the grade, 6 days out, 4 of 12 h placed").

Answer with blocks only, in time order. Use the exact exam ids and course codes given.`;

const SCHEMA = {
  type: 'object',
  properties: {
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          exam_id: { type: 'string' },
          course: { type: 'string' },
          title: { type: 'string' },
          start_at: { type: 'string' },
          end_at: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['exam_id', 'course', 'title', 'start_at', 'end_at', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['blocks'],
  additionalProperties: false,
} as const;

export interface DraftOptions {
  model: string;
  apiKey: string;
  timezone: string;
  fetchImpl?: typeof fetch;
}

/** Asks Claude to place blocks; returns raw blocks (validate them) and the usage. */
export async function draftWithClaude(
  exams: Exam[],
  slots: Slot[],
  s: PlanSettings,
  opts: DraftOptions,
): Promise<{ blocks: Block[]; usage: AiUsage }> {
  const client = new Anthropic({ apiKey: opts.apiKey, fetch: opts.fetchImpl, maxRetries: 2 });
  const tz = opts.timezone;
  const user = JSON.stringify({
    timezone: tz,
    hours_per_day: s.hours_per_day,
    block_min: s.block_min,
    exams: exams.map((x) => ({ ...x, start_at: localIso(x.start_at, tz) })),
    free_slots: slots.slice(0, 150).map((sl) => ({
      day: sl.day,
      start: localIso(sl.start, tz),
      end: localIso(sl.end, tz),
      minutes: sl.minutes,
    })),
  });
  const response = await client.messages.create({
    model: opts.model,
    max_tokens: 16000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: [{ type: 'text', text: PLANNER_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
  });
  if (response.stop_reason === 'refusal') throw new Error('The model declined to plan.');
  if (response.stop_reason === 'max_tokens') throw new Error('The plan was cut off.');
  const text = response.content.find((b) => b.type === 'text')?.text ?? '';
  let parsed: { blocks: Block[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('The model answered with something other than the expected JSON.');
  }
  const blocks = parsed.blocks.map((b) => ({
    ...b,
    start_at: toInstant(b.start_at),
    end_at: toInstant(b.end_at),
    title: String(b.title).slice(0, 120),
    reason: String(b.reason).slice(0, 120),
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
  return { blocks, usage };
}

const toInstant = (s: string) => {
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : 'invalid';
};
