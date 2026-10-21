// The phone-event logic, separate from Deno.serve so it can be tested with a fake database.
//
// iPhone Shortcuts automations POST {token, app, kind, at?} here whenever a distracting app opens or
// closes, or when the "Start studying" Shortcut runs. The token identifies the person; only its
// sha256 is stored. Responses carry no body: Shortcuts ignores them, and they reveal nothing.

export type Kind = 'open' | 'close' | 'session_start' | 'session_end';
const KINDS: Kind[] = ['open', 'close', 'session_start', 'session_end'];
export const RATE_LIMIT = 120; // requests per token per minute
const MAX_SKEW_MS = 24 * 60 * 60 * 1000; // an `at` further than a day from now is a broken clock

export interface PlanBlock {
  id: string;
  course: string;
  kind: string;
  start: string;
  end: string;
}

export interface Profile {
  id: string;
  settings: { break_mode?: string } | null;
}

/** What the handler needs from the database. The real one wraps supabase-js with the service role. */
export interface Store {
  rateHit(tokenHash: string): Promise<number>;
  profileByTokenHash(tokenHash: string): Promise<Profile | null>;
  insertEvent(e: { user_id: string; app: string; kind: Kind; at: string }): Promise<void>;
  openSession(userId: string): Promise<{ id: string } | null>;
  startSession(s: {
    user_id: string;
    course: string;
    plan_block_id: string | null;
    mode: string;
    started_at: string;
  }): Promise<void>;
  endSession(id: string, endedAt: string): Promise<void>;
  plan(): Promise<PlanBlock[]>;
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Shortcuts doesn't need CORS, but the setup page's "send a test from this browser" does. Nothing here
// uses cookies, and every request needs the token, so allowing any origin exposes nothing.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
};
const status = (code: number) => new Response(null, { status: code, headers: CORS });

type Parsed = { token: string; app: string; kind: Kind; at: Date } | { error: number };

export function parse(body: unknown, now: Date): Parsed {
  if (!body || typeof body !== 'object') return { error: 400 };
  const b = body as Record<string, unknown>;
  if (typeof b.token !== 'string' || b.token.length < 20 || b.token.length > 200) return { error: 401 };
  if (typeof b.kind !== 'string' || !KINDS.includes(b.kind as Kind)) return { error: 400 };
  const kind = b.kind as Kind;
  const sessionKind = kind === 'session_start' || kind === 'session_end';
  // App names come from the Shortcut's text field: trim, cap at 40 characters.
  const app = typeof b.app === 'string' ? b.app.trim().slice(0, 40) : '';
  if (!app && !sessionKind) return { error: 400 };
  let at = now;
  if (b.at != null) {
    const t = typeof b.at === 'string' || typeof b.at === 'number' ? new Date(b.at) : new Date(NaN);
    if (Number.isNaN(t.getTime()) || Math.abs(t.getTime() - now.getTime()) > MAX_SKEW_MS)
      return { error: 400 };
    at = t;
  }
  return { token: b.token, app: app || 'Shortcuts', kind, at };
}

/** The study block happening now, if any: a phone-started session takes its course from it. */
export function currentBlock(plan: PlanBlock[], now: Date): PlanBlock | undefined {
  const t = now.getTime();
  return plan.find((r) => r.kind === 'Study' && Date.parse(r.start) <= t && t < Date.parse(r.end));
}

export async function handle(req: Request, store: Store, now = new Date()): Promise<Response> {
  if (req.method === 'OPTIONS') return status(204);
  if (req.method !== 'POST') return status(405);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return status(400);
  }
  const p = parse(body, now);
  if ('error' in p) return status(p.error);

  const hash = await sha256Hex(p.token);
  if ((await store.rateHit(hash)) > RATE_LIMIT) return status(429);
  const profile = await store.profileByTokenHash(hash);
  if (!profile) return status(401);

  const at = p.at.toISOString();
  await store.insertEvent({ user_id: profile.id, app: p.app, kind: p.kind, at });

  if (p.kind === 'session_start') {
    // Starting twice is harmless: keep the session that's already running.
    if (!(await store.openSession(profile.id))) {
      let block: PlanBlock | undefined;
      try {
        block = currentBlock(await store.plan(), p.at);
      } catch {
        block = undefined; // plan unavailable: still start the session
      }
      const mode = profile.settings?.break_mode;
      await store.startSession({
        user_id: profile.id,
        course: block?.course ?? 'General',
        plan_block_id: block?.id ?? null,
        mode: mode && ['pomodoro', 'fifty_ten', 'custom', 'flow'].includes(mode) ? mode : 'pomodoro',
        started_at: at,
      });
    }
  } else if (p.kind === 'session_end') {
    const open = await store.openSession(profile.id);
    if (open) await store.endSession(open.id, at);
  }
  return status(204);
}
