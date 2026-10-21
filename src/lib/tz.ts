// Timezone helpers with no imports, so Edge Functions (Deno) share them with the browser.

const pad = (n: number) => String(n).padStart(2, '0');
const fmtCache = new Map<string, Intl.DateTimeFormat>();

function parts(t: number, tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    fmtCache.set(tz, f);
  }
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date(t))) p[x.type] = x.value;
  return {
    y: Number(p.year),
    mo: Number(p.month),
    d: Number(p.day),
    h: Number(p.hour) % 24,
    mi: Number(p.minute),
    s: Number(p.second),
  };
}

/** Minutes east of UTC for `tz` at instant `t`. */
export function offsetMinutes(t: number, tz: string): number {
  const p = parts(t, tz);
  return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - t) / 60_000);
}

/** `2026-10-20T17:30:00-07:00`: wall time in `tz` with that moment's UTC offset. */
export function localIso(iso: string | number, tz: string): string {
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  const p = parts(t, tz);
  const off = offsetMinutes(t, tz);
  const sign = off < 0 ? '-' : '+';
  const a = Math.abs(off);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

/** Today's date (YYYY-MM-DD) in `tz`. */
export const todayIn = (tz: string, now = Date.now()) => localIso(now, tz).slice(0, 10);

/** The instant of `YYYY-MM-DD` at `hh:mm` wall time in `tz`, as an ISO string. */
export function atWallTime(day: string, hh: number, mm: number, tz: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // Two passes handle a DST change between the guess and the real offset.
  let t = guess - offsetMinutes(guess, tz) * 60_000;
  t = guess - offsetMinutes(t, tz) * 60_000;
  return new Date(t).toISOString();
}
