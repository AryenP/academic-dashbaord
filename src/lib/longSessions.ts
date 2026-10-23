// Hour three of a session. Nothing is said until the third hour; then one line, from the person's
// own sessions when there are enough of them, in "tends to", never "because". No imports, so it
// can be tested alone.

export const LONG_FROM_SEC = 3 * 3600;
const MIN_EACH = 3; // sessions on each side before a pattern is a pattern
const MIN_GAP = 5; // points of focus

export interface Measured {
  focusSec: number;
  focusPct: number | null;
}

export interface Pattern {
  longAvg: number;
  shortAvg: number;
  longN: number;
}

/** Average focus of sessions that ran three hours or more, against the rest. Null below the thresholds. */
export function longPattern(sessions: Measured[]): Pattern | null {
  const measured = sessions.filter((s) => s.focusPct != null && s.focusSec > 0);
  const long = measured.filter((s) => s.focusSec >= LONG_FROM_SEC);
  const short = measured.filter((s) => s.focusSec < LONG_FROM_SEC);
  if (long.length < MIN_EACH || short.length < MIN_EACH) return null;
  const avg = (xs: Measured[]) => Math.round(xs.reduce((a, s) => a + (s.focusPct ?? 0), 0) / xs.length);
  const p = { longAvg: avg(long), shortAvg: avg(short), longN: long.length };
  return Math.abs(p.longAvg - p.shortAvg) >= MIN_GAP ? p : null;
}

/** The line for a session that has passed three focused hours, or null before that. */
export function hourThree(focusSec: number, sessions: Measured[]): string | null {
  if (focusSec < LONG_FROM_SEC) return null;
  const p = longPattern(sessions);
  if (!p) return 'Three hours in. Ending here and starting fresh later is a fine way to spend the fourth.';
  if (p.longAvg < p.shortAvg)
    return `Three hours in. Your sessions this long tend to run at ${p.longAvg} % focus, against ${p.shortAvg} % for shorter ones (${p.longN} long sessions so far).`;
  return `Three hours in. Your sessions this long tend to hold up: ${p.longAvg} % focus, against ${p.shortAvg} % for shorter ones.`;
}
