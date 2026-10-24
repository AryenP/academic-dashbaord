// deno test supabase/functions/preview-source
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { clientAddress, GLOBAL, handle, PER_ADDRESS, type Store } from './handler.ts';

const google = Deno.readTextFileSync(new URL('../_shared/fixtures/google.ics', import.meta.url));
const NOW = new Date('2026-10-21T18:00:00Z');

function counter(start: Record<string, number> = {}) {
  const hits = new Map(Object.entries(start));
  const store: Store = {
    rateHit: async (key) => {
      hits.set(key, (hits.get(key) ?? 0) + 1);
      return hits.get(key)!;
    },
  };
  return { store, hits };
}

/** A fake network: a map from URL to a response, recording what was asked. */
function net(routes: Record<string, () => Response>) {
  const asked: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof URL ? input.toString() : String(input);
    asked.push(`${url} ${init?.redirect ?? ''}`);
    const r = routes[url];
    return r ? r() : new Response('nope', { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, asked };
}

const ics =
  (body = google) =>
  () =>
    new Response(body, { headers: { 'content-type': 'text/calendar' } });
const post = (body: unknown, ip = '203.0.113.7') =>
  new Request('http://x/preview-source', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `${ip}, 10.0.0.1` },
    body: JSON.stringify(body),
  });

Deno.test('a public calendar is read into events, with nothing but the events in the answer', async () => {
  const { store } = counter();
  const n = net({ 'https://calendar.example.com/a.ics': ics() });
  const r = await handle(
    post({ url: 'webcal://calendar.example.com/a.ics', kind: 'ical', tz: 'America/Los_Angeles' }),
    store,
    n.fetchImpl,
    NOW,
  );
  const body = await r.json();
  assertEquals(body.ok, true);
  assertEquals(body.tz, 'America/Los_Angeles');
  assert(body.events.some((e: { title: string }) => e.title === 'DSC 140A Midterm 1'));
  assertEquals(Object.keys(body).sort(), [
    'counts',
    'courses',
    'events',
    'host',
    'name',
    'ok',
    'truncated',
    'tz',
  ]);
  assert(!JSON.stringify(body).includes('BEGIN:VCALENDAR'), 'never the raw file');
  assertEquals(n.asked, ['https://calendar.example.com/a.ics manual']); // redirects are followed by hand
});

Deno.test('a redirect is followed only when its target passes the same checks', async () => {
  const { store } = counter();
  const hop = (to: string) => () => new Response(null, { status: 302, headers: { location: to } });
  const ok = net({
    'https://short.example.com/x': hop('https://calendar.example.com/a.ics'),
    'https://calendar.example.com/a.ics': ics(),
  });
  assertEquals(
    (await (await handle(post({ url: 'https://short.example.com/x' }), store, ok.fetchImpl, NOW)).json()).ok,
    true,
  );
  const bad = net({ 'https://evil.example.com/x': hop('http://169.254.169.254/latest/meta-data') });
  const r = await (
    await handle(post({ url: 'https://evil.example.com/x' }), store, bad.fetchImpl, NOW)
  ).json();
  assertEquals(r.code, 'redirect');
  assertEquals(bad.asked.length, 1, 'the private address is never fetched');
  const loop = net({ 'https://a.example.com/': hop('https://a.example.com/') });
  assertEquals(
    (await (await handle(post({ url: 'https://a.example.com/' }), store, loop.fetchImpl, NOW)).json()).ok,
    false,
  );
  assertEquals(loop.asked.length, 4); // the first request and three hops, then it stops
});

Deno.test('addresses that are not calendars, or not reachable, get the same words as Connect', async () => {
  const n = net({
    'https://calendar.example.com/page': () =>
      new Response('<html>hi</html>', { headers: { 'content-type': 'text/html' } }),
    'https://calendar.example.com/text': () =>
      new Response('hello', { headers: { 'content-type': 'text/plain' } }),
  });
  // A fresh counter for each address checked, so the per-address limit doesn't interfere.
  const code = async (url: string) =>
    (await (await handle(post({ url }), counter().store, n.fetchImpl, NOW)).json()).code;
  assertEquals(await code('https://calendar.example.com/page'), 'html');
  assertEquals(await code('https://calendar.example.com/text'), 'not_calendar');
  assertEquals(await code('https://calendar.example.com/missing'), 'http_404');
  assertEquals(await code('http://calendar.example.com/a.ics'), 'not_https');
  assertEquals(await code('https://192.168.1.4/a.ics'), 'private_host');
  assertEquals(await code('https://calendar.example.com/abc…'), 'truncated');
  assertEquals(await code('not a url'), 'not_a_url');
});

Deno.test(
  'one address gets six tries a minute, and everyone together gets a hundred and twenty',
  async () => {
    const n = net({ 'https://calendar.example.com/a.ics': ics() });
    const busy = counter({ 'preview:203.0.113.7': PER_ADDRESS });
    assertEquals(
      (await handle(post({ url: 'https://calendar.example.com/a.ics' }), busy.store, n.fetchImpl, NOW))
        .status,
      429,
    );
    const other = await handle(
      post({ url: 'https://calendar.example.com/a.ics' }, '198.51.100.2'),
      busy.store,
      n.fetchImpl,
      NOW,
    );
    assertEquals(other.status, 200);
    const full = counter({ 'preview:all': GLOBAL });
    assertEquals(
      (
        await handle(
          post({ url: 'https://calendar.example.com/a.ics' }, '198.51.100.9'),
          full.store,
          n.fetchImpl,
          NOW,
        )
      ).status,
      429,
    );
    assertEquals(n.asked.length, 1, 'refused calls never reach the network');
  },
);

Deno.test('only POST, and the caller is told apart by the first forwarded address', async () => {
  const { store } = counter();
  assertEquals((await handle(new Request('http://x/preview-source'), store)).status, 405);
  assertEquals(
    (await handle(new Request('http://x/preview-source', { method: 'OPTIONS' }), store)).status,
    204,
  );
  assertEquals(clientAddress(post({}, '203.0.113.7')), '203.0.113.7');
  assertEquals(clientAddress(new Request('http://x/')), 'unknown');
});
