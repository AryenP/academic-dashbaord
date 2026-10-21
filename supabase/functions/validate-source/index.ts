// Supabase Edge Function: checks a calendar address before it's saved. POST {url, kind} as the signed-in
// person; answers what the feed contains ("4 courses, 37 items") or a specific, fixable error.
// Nothing is stored.
import { caller, CORS, json, overLimit, serviceClient } from '../_shared/auth.ts';
import { NotACalendar } from '../_shared/ical.ts';
import { checkUrl, fetchFeed, HttpError, TooLarge } from '../_shared/net.ts';
import { summarize } from '../_shared/sync.ts';

type Kind = 'ical' | 'canvas';

const MESSAGES: Record<string, string> = {
  not_a_url: "That isn't a web address. Paste the whole link, starting with https:// or webcal://.",
  truncated: 'The address is cut off (it ends in "…"). Copy it again from the page, not from a preview.',
  not_https: 'The address has to start with https:// or webcal://.',
  private_host: "That address points inside a private network, so Runway can't reach it.",
  html: 'That address returns a web page, not a calendar. For Google, use the secret address in iCal format (it ends in basic.ics), not the embed link.',
  not_calendar: "That address doesn't return a calendar file.",
  http_404:
    'Nothing was found at that address (HTTP 404). For Google, the public address only works when the calendar is public; use the secret one.',
  http_401: 'The calendar refused the request. Try copying the address again.',
  too_large: 'That feed is larger than 5 MB.',
  timeout: "The calendar's server didn't answer in 15 seconds. Try again in a minute.",
  empty: 'The feed is valid but has no events in the next six months.',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);
  const who = await caller(req);
  if (!who) return json({ ok: false, code: 'auth', message: 'Sign in first.' }, 401);
  const service = serviceClient();
  if (await overLimit(service, `validate:${who.id}`, 20))
    return json({ ok: false, code: 'rate', message: 'Too many checks in a minute. Wait a moment.' }, 429);

  let body: { url?: string; kind?: Kind };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, code: 'body', message: MESSAGES.not_a_url }, 400);
  }
  const kind: Kind = body.kind === 'canvas' ? 'canvas' : 'ical';
  const c = checkUrl(String(body.url ?? ''));
  if ('error' in c) return json({ ok: false, code: c.error, message: MESSAGES[c.error] });

  const hints: string[] = [];
  const host = c.url.hostname;
  if (/calendar\.google\.com/.test(host) && /\/public\//.test(c.url.pathname)) hints.push('google_public');
  if (/instructure|canvas/i.test(host) && kind !== 'canvas') hints.push('looks_like_canvas');

  try {
    const r = await fetchFeed(c.url);
    if (/text\/html/i.test(r.contentType) && !/BEGIN:VCALENDAR/i.test(r.text.slice(0, 4000)))
      return json({ ok: false, code: 'html', message: MESSAGES.html, hints });
    const s = summarize(r.text, kind);
    if (/instructure/i.test(s.prodId ?? '') && kind !== 'canvas') hints.push('looks_like_canvas');
    if (s.events === 0) return json({ ok: false, code: 'empty', message: MESSAGES.empty, hints, summary: s });
    return json({ ok: true, host, summary: s, hints });
  } catch (e) {
    if (e instanceof NotACalendar)
      return json({ ok: false, code: 'not_calendar', message: MESSAGES.not_calendar, hints });
    if (e instanceof HttpError) {
      const code = e.status === 404 ? 'http_404' : e.status === 401 || e.status === 403 ? 'http_401' : 'http';
      return json({
        ok: false,
        code,
        message: MESSAGES[code] ?? `The calendar's server answered HTTP ${e.status}.`,
        hints,
      });
    }
    if (e instanceof TooLarge) return json({ ok: false, code: 'too_large', message: MESSAGES.too_large });
    if (e instanceof DOMException && e.name === 'TimeoutError')
      return json({ ok: false, code: 'timeout', message: MESSAGES.timeout });
    return json({ ok: false, code: 'fetch', message: "Runway couldn't reach that address." });
  }
});
