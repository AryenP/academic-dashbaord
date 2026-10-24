// The signed-out preview's request handling, separate from Deno.serve so it runs against a fake
// rate counter and a fake network in tests. Anyone can call it, so it is the most careful door in
// the app: per-address and global rate limits, https only, no private hosts, every redirect hop
// checked, a size cap and a timeout, and an answer of parsed events, never the raw file.
import { CORS, json } from '../_shared/auth.ts';
import { FEED_MESSAGES } from '../_shared/feedMessages.ts';
import { NotACalendar } from '../_shared/ical.ts';
import { checkUrl, fetchFeed, HttpError, RedirectRefused, TooLarge } from '../_shared/net.ts';
import { preview, safeZone } from '../_shared/preview.ts';

export const PER_ADDRESS = 6; // previews a minute from one network address
export const GLOBAL = 120; // previews a minute from everyone

export interface Store {
  /** Counts a call for this key this minute and returns the count. */
  rateHit(key: string): Promise<number>;
}

/** The caller's address as the gateway saw it; one bucket for anyone it can't tell apart. */
export function clientAddress(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (fwd || req.headers.get('x-real-ip') || 'unknown').slice(0, 64);
}

export async function handle(
  req: Request,
  store: Store,
  fetchImpl: typeof fetch = fetch,
  now = new Date(),
): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);
  if ((await store.rateHit('preview:all')) > GLOBAL)
    return json(
      {
        ok: false,
        code: 'rate',
        message: 'Runway is reading a lot of calendars right now. Try again in a minute.',
      },
      429,
    );
  if ((await store.rateHit(`preview:${clientAddress(req)}`)) > PER_ADDRESS)
    return json({ ok: false, code: 'rate', message: 'Too many tries in a minute. Wait a moment.' }, 429);

  let body: { url?: unknown; kind?: unknown; tz?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, code: 'body', message: FEED_MESSAGES.not_a_url }, 400);
  }
  const kind = body.kind === 'canvas' ? 'canvas' : 'ical';
  const tz = safeZone(body.tz);
  const c = checkUrl(String(body.url ?? '').slice(0, 2000));
  if ('error' in c) return json({ ok: false, code: c.error, message: FEED_MESSAGES[c.error] });

  try {
    const r = await fetchFeed(c.url, {}, fetchImpl, { checkHops: true });
    if (/text\/html/i.test(r.contentType) && !/BEGIN:VCALENDAR/i.test(r.text.slice(0, 4000)))
      return json({ ok: false, code: 'html', message: FEED_MESSAGES.html });
    const p = preview(r.text, kind, tz, now);
    if (p.events.length === 0 && Object.keys(p.counts).length === 0)
      return json({
        ok: false,
        code: 'empty',
        message: 'The calendar is valid but has nothing in the next three weeks.',
      });
    return json({ ok: true, host: c.url.hostname, tz, ...p });
  } catch (e) {
    if (e instanceof NotACalendar)
      return json({ ok: false, code: 'not_calendar', message: FEED_MESSAGES.not_calendar });
    if (e instanceof RedirectRefused)
      return json({ ok: false, code: 'redirect', message: FEED_MESSAGES.redirect });
    if (e instanceof HttpError) {
      const code = e.status === 404 ? 'http_404' : e.status === 401 || e.status === 403 ? 'http_401' : 'http';
      return json({
        ok: false,
        code,
        message: FEED_MESSAGES[code] ?? `The calendar's server answered HTTP ${e.status}.`,
      });
    }
    if (e instanceof TooLarge)
      return json({ ok: false, code: 'too_large', message: FEED_MESSAGES.too_large });
    if (e instanceof DOMException && e.name === 'TimeoutError')
      return json({ ok: false, code: 'timeout', message: FEED_MESSAGES.timeout });
    return json({ ok: false, code: 'fetch', message: "Runway couldn't reach that address." });
  }
}
