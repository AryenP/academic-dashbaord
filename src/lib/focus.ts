// Focus % from phone events. Pure, with no imports, so the phone-event Edge Function (Deno) can import
// this same file to freeze metrics when a session is ended from the phone.
//
//   focus time   = session wall time − break time
//   phone time   = time distracting apps were open, overlapping focus time
//                  (an open with no close counts until the session end or for 10 min, whichever
//                   comes first)
//   focus %      = 100 × (1 − phone time ÷ focus time), clamped to 0–100
//   pickups      = times you opened a distracting app while none was already open
//   longest run  = longest stretch of focus time with no distracting app open
//
// Event times come from the phone, so each is clamped to within 2 minutes of when the server got it.

export interface FocusEvent {
  app: string;
  kind: string; // 'open' | 'close' (others are ignored)
  at: string;
  received_at: string;
}

export interface Span {
  start: number; // ms
  end: number | null; // null = still running
}

export interface FocusResult {
  focusSec: number;
  phoneSec: number;
  /** Null when there's no focus time to measure against. */
  focusPct: number | null;
  pickups: number;
  longestStretchSec: number;
  /** A distracting app that's open right now, if any. */
  openApp: { app: string; since: number } | null;
}

export const OPEN_CAP_MS = 10 * 60 * 1000;
export const SKEW_MS = 2 * 60 * 1000;

type Iv = [number, number];

/** Sorted, non-overlapping union of intervals. */
function union(ivs: Iv[]): Iv[] {
  const s = ivs.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: Iv[] = [];
  for (const [a, b] of s) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** Parts of `base` not covered by `cut` (both unions). */
function subtract(base: Iv[], cut: Iv[]): Iv[] {
  const out: Iv[] = [];
  for (const [a, b] of base) {
    let cur = a;
    for (const [c, d] of cut) {
      if (d <= cur || c >= b) continue;
      if (c > cur) out.push([cur, c]);
      cur = Math.max(cur, d);
      if (cur >= b) break;
    }
    if (cur < b) out.push([cur, b]);
  }
  return out;
}

function intersect(x: Iv[], y: Iv[]): Iv[] {
  const out: Iv[] = [];
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    const a = Math.max(x[i][0], y[j][0]);
    const b = Math.min(x[i][1], y[j][1]);
    if (b > a) out.push([a, b]);
    if (x[i][1] < y[j][1]) i++;
    else j++;
  }
  return out;
}

const total = (ivs: Iv[]) => ivs.reduce((s, [a, b]) => s + (b - a), 0);

/** The phone's `at`, kept within 2 minutes of when the server received it. */
export function eventTime(e: FocusEvent): number {
  const at = Date.parse(e.at);
  const rx = Date.parse(e.received_at);
  if (Number.isNaN(at)) return rx;
  return Math.min(rx + SKEW_MS, Math.max(rx - SKEW_MS, at));
}

/**
 * @param session  the session's start and end (end null while running)
 * @param breaks   its breaks (end null for one in progress)
 * @param events   phone events (any order; only open/close are used)
 * @param now      current time in ms, used for anything still running
 */
export function computeFocus(session: Span, breaks: Span[], events: FocusEvent[], now: number): FocusResult {
  const end = session.end ?? now;
  const win: Iv[] = end > session.start ? [[session.start, end]] : [];
  const brk = union(breaks.map((b) => [b.start, b.end ?? end] as Iv));
  const focus = subtract(win, brk);
  const focusMs = total(focus);

  // Pair each app's opens with its next close. A second open before a close doesn't start a new
  // interval; a close without an open is ignored.
  const evs = events
    .filter((e) => e.kind === 'open' || e.kind === 'close')
    .map((e) => ({ app: e.app, kind: e.kind, t: eventTime(e) }))
    .sort((a, b) => a.t - b.t);
  const openSince = new Map<string, number>();
  const ivs: Iv[] = [];
  for (const e of evs) {
    if (e.kind === 'open') {
      if (!openSince.has(e.app)) openSince.set(e.app, e.t);
    } else if (openSince.has(e.app)) {
      const s = openSince.get(e.app)!;
      ivs.push([s, Math.min(e.t, s + OPEN_CAP_MS)]);
      openSince.delete(e.app);
    }
  }
  // Still open: until now (or the session end), capped at 10 minutes.
  let openApp: FocusResult['openApp'] = null;
  for (const [app, s] of openSince) {
    const stop = Math.min(end, s + OPEN_CAP_MS);
    ivs.push([s, stop]);
    if (!session.end && now < s + OPEN_CAP_MS && (!openApp || s > openApp.since)) openApp = { app, since: s };
  }

  const phone = intersect(union(ivs), focus);
  const phoneMs = total(phone);

  // A pickup is an open that begins a phone episode inside focus time.
  const episodes = union(ivs);
  const pickups = episodes.filter(([a]) => focus.some(([f0, f1]) => a >= f0 && a < f1)).length;

  const clean = subtract(focus, phone);
  const longest = clean.reduce((m, [a, b]) => Math.max(m, b - a), 0);

  const focusSec = Math.round(focusMs / 1000);
  const phoneSec = Math.round(phoneMs / 1000);
  const focusPct =
    focusMs > 0 ? Math.round(Math.min(100, Math.max(0, 100 * (1 - phoneMs / focusMs))) * 100) / 100 : null;
  return { focusSec, phoneSec, focusPct, pickups, longestStretchSec: Math.round(longest / 1000), openApp };
}

/**
 * The fields frozen onto a session row when it ends. Breaks are excluded from focus; pauses are not
 * timestamped individually, so phone use during a pause counts like any other (rare in practice).
 */
export function frozenMetrics(r: FocusResult, tracked: boolean) {
  return tracked
    ? {
        focus_pct: r.focusPct,
        phone_seconds: r.phoneSec,
        pickups: r.pickups,
        longest_stretch_seconds: r.longestStretchSec,
      }
    : { focus_pct: null, phone_seconds: null, pickups: null, longest_stretch_seconds: r.longestStretchSec };
}
