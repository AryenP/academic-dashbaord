// Supabase Edge Function: checks a calendar address before it's saved. POST {url, kind} as the signed-in
// person; answers what the feed contains ("4 courses, 37 items") or a specific, fixable error.
// Nothing is stored.
import { caller, CORS, json, overLimit, serviceClient } from '../_shared/auth.ts';
import { NotACalendar } from '../_shared/ical.ts';
import { FEED_MESSAGES } from '../_shared/feedMessages.ts';
import { checkUrl, fetchFeed, HttpError, TooLarge } from '../_shared/net.ts';
import { summarize } from '../_shared/sync.ts';

type Kind = 'ical' | 'canvas';

const MESSAGES = FEED_MESSAGES;

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
