// The signals logic, separate from Deno.serve so it can be tested with a fake database.
//
// The "Runway nightly" iPhone Shortcut POSTs one coarse summary of the day (hours slept, exercise
// minutes, steps, or a place label) with the shortcut token from Settings in the x-runway-token
// header. A small array is accepted too, so the Shortcut can send the night's summaries in one call.
// One row per person, day and kind: posting the same day again updates it. No raw samples, no
// coordinates; the ranges below are also check constraints on the table (migration 0012).
import { CORS, json } from '../_shared/auth.ts';

export type Kind = 'sleep_h' | 'exercise_min' | 'steps' | 'place';
export const KINDS: Kind[] = ['sleep_h', 'exercise_min', 'steps', 'place'];
export const RATE_LIMIT = 30; // requests per person per minute
export const MAX_ROWS = 8; // one night's summaries, with room for a resend
const MAX_LABEL = 80;
const MAX_SOURCE = 40;
const DAY_MS = 864e5;

export interface Row {
  day: string;
  kind: Kind;
  value: number | null;
  label: string | null;
  source: string;
}

/** What the handler needs from the database. The real one wraps supabase-js with the service role. */
export interface Store {
  /** The owner of an extension token, by its sha256, or null. */
  ownerByTokenHash(tokenHash: string): Promise<string | null>;
  /** Counts a call for this person this minute and returns the count. */
  rateHit(key: string): Promise<number>;
  /** Insert or update on (user_id, day, kind). */
  upsert(rows: (Row & { user_id: string })[]): Promise<void>;
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const RANGE: Record<Exclude<Kind, 'place'>, { max: number; whole?: boolean; unit: string }> = {
  sleep_h: { max: 24, unit: 'hours' },
  exercise_min: { max: 1440, unit: 'minutes' },
  steps: { max: 200000, whole: true, unit: 'steps' },
};

// Shortcuts sometimes sends numbers as text ("7.5"); take those too.
function number(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v)) return Number(v);
  return null;
}

/** A calendar day 'YYYY-MM-DD' that exists, no later than tomorrow and no earlier than a year ago. */
function validDay(v: unknown, now: Date): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== v) return false;
  // "Tomorrow" leaves room for any timezone; a year back covers a late backfill.
  return t <= now.getTime() + DAY_MS && t >= now.getTime() - 366 * DAY_MS;
}

export function parseRow(input: unknown, now: Date): Row | { error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Send a JSON object.' };
  const b = input as Record<string, unknown>;
  if (typeof b.kind !== 'string' || !KINDS.includes(b.kind as Kind))
    return { error: `kind must be one of ${KINDS.join(', ')}.` };
  const kind = b.kind as Kind;
  if (!validDay(b.day, now)) return { error: 'day must be a date like 2026-10-22, not in the future.' };
  const source =
    typeof b.source === 'string' && b.source.trim() ? b.source.trim().slice(0, MAX_SOURCE) : 'shortcut';
  if (kind === 'place') {
    const label = typeof b.label === 'string' ? b.label.trim() : '';
    if (!label || label.length > MAX_LABEL)
      return { error: `A place needs a label of at most ${MAX_LABEL} characters.` };
    return { day: b.day, kind, value: null, label, source };
  }
  const r = RANGE[kind];
  const value = number(b.value);
  if (value === null || value < 0 || value > r.max || (r.whole && !Number.isInteger(value)))
    return { error: `${kind} must be ${r.whole ? 'a whole number ' : ''}from 0 to ${r.max} ${r.unit}.` };
  return { day: b.day, kind, value, label: null, source };
}

export async function handle(req: Request, store: Store, now = new Date()): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);
  const token = req.headers.get('x-runway-token') ?? '';
  if (!/^[0-9a-f]{48}$/.test(token))
    return json(
      { ok: false, code: 'token', message: 'Add your Runway token as the x-runway-token header.' },
      401,
    );
  const owner = await store.ownerByTokenHash(await sha256Hex(token));
  if (!owner)
    return json(
      {
        ok: false,
        code: 'token',
        message:
          "That token isn't valid any more. Make a new one in Settings, under “Sleep and exercise from your iPhone”.",
      },
      401,
    );
  if ((await store.rateHit(`signals:${owner}`)) > RATE_LIMIT)
    return json({ ok: false, code: 'rate', message: 'Too many sends in a minute.' }, 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, code: 'body', message: 'Send a JSON body.' }, 400);
  }
  const list = Array.isArray(body) ? body : [body];
  if (list.length === 0 || list.length > MAX_ROWS)
    return json({ ok: false, code: 'body', message: `Send 1 to ${MAX_ROWS} summaries.` }, 400);
  // All or nothing: a bad summary rejects the whole send, so a half-saved night can't hide a mistake.
  const rows = new Map<string, Row>();
  for (const item of list) {
    const r = parseRow(item, now);
    if ('error' in r) return json({ ok: false, code: 'invalid', message: r.error }, 400);
    rows.set(`${r.day}|${r.kind}`, r); // the last of a duplicate wins, as a second send would
  }
  await store.upsert([...rows.values()].map((r) => ({ ...r, user_id: owner })));
  return json({ ok: true, saved: rows.size });
}
