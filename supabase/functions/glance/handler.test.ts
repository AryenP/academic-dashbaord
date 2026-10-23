// deno test supabase/functions/glance
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { DEMO_COURSES, demoRows } from '../../../src/landing/demo.ts';
import { glanceAt, handle, RATE_LIMIT, sha256Hex, type Store } from './handler.ts';

const TOKEN = '0123456789abcdef0123456789abcdef0123456789abcdef';
const TZ = 'America/Los_Angeles';
// Thursday Oct 22 2026, 11 AM Pacific: a MATH 20C block runs 9:30–11:30; the midterm is Sunday.
const NOW = Date.parse('2026-10-22T11:00:00-07:00');
const rows = demoRows(NOW, TZ);

function fakeStore(opts: { hits?: number; tz?: string } = {}) {
  let hash = '';
  const store: Store = {
    ownerByTokenHash: async (h) => (h === hash ? 'user1' : null),
    rateHit: async () => opts.hits ?? 1,
    plan: async () => ({ rows, courses: DEMO_COURSES, timezone: opts.tz ?? TZ }),
  };
  return { store, ready: sha256Hex(TOKEN).then((h) => (hash = h)) };
}

const get = (q = '', headers: Record<string, string> = { 'x-runway-token': TOKEN }) =>
  new Request(`http://x/glance${q}`, { headers });

Deno.test('the sentence: now, next, and the exam, in the person’s timezone', () => {
  const g = glanceAt(rows, DEMO_COURSES, TZ, NOW);
  assertEquals(
    g.text,
    'Now: MATH 20C Series: lectures 8–10, 30 min left. Next: COGS 1 Reading: perception at 6 PM. MATH 20C Midterm 1 in 3 days, Sun Oct 25, 5 PM–6 PM, Center Hall 115.',
  );
  assertEquals(g.now?.left, '30:00');
  assertEquals(g.exam?.days, 3);
});

Deno.test('between blocks it says when the next one is; on another day it gives the day', () => {
  const g = glanceAt(rows, DEMO_COURSES, TZ, Date.parse('2026-10-22T12:00:00-07:00'));
  assert(g.text.startsWith('Next: COGS 1 Reading: perception at 6 PM.'));
  const late = glanceAt(rows, DEMO_COURSES, TZ, Date.parse('2026-10-22T23:59:00-07:00'));
  assert(late.text.startsWith('Next: MATH 20C Practice set 4, Fri Oct 23, 10 AM–12 PM.'), late.text);
  // Days to the exam follow the person's day, not the server's: 11 PM Pacific is still Thursday.
  assert(late.text.includes('in 3 days'), late.text);
});

Deno.test('after the plan it says so, and with no plan at all it says that', () => {
  assertEquals(
    glanceAt(rows, DEMO_COURSES, TZ, Date.parse('2027-01-01T12:00:00-08:00')).text,
    'Nothing left on the runway.',
  );
  assertEquals(glanceAt([], [], TZ, NOW).text, 'Nothing on the runway yet.');
});

Deno.test('GET with the token answers plain text; ?format=json the structure; HEAD no body', async () => {
  const f = fakeStore();
  await f.ready;
  const r = await handle(get(), f.store, new Date(NOW));
  assertEquals(r.status, 200);
  assertEquals(r.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert((await r.text()).startsWith('Now: MATH 20C'));
  const j = await handle(get('?format=json'), f.store, new Date(NOW));
  assertEquals(j.headers.get('content-type'), 'application/json');
  assertEquals(((await j.json()) as { now: { left: string } }).now.left, '30:00');
  const q = await handle(get(`?t=${TOKEN}`, {}), f.store, new Date(NOW));
  assertEquals(q.status, 200);
  const h = await handle(
    new Request('http://x/glance', { method: 'HEAD', headers: { 'x-runway-token': TOKEN } }),
    f.store,
    new Date(NOW),
  );
  assertEquals(h.status, 200);
  assertEquals(await h.text(), '');
});

Deno.test('a missing, malformed or unknown token is refused; POST is not a glance', async () => {
  const f = fakeStore();
  await f.ready;
  assertEquals((await handle(get('', {}), f.store)).status, 401);
  assertEquals((await handle(get('', { 'x-runway-token': 'short' }), f.store)).status, 401);
  assertEquals((await handle(get('', { 'x-runway-token': 'f'.repeat(48) }), f.store)).status, 401);
  assertEquals(
    (
      await handle(
        new Request('http://x/glance', { method: 'POST', headers: { 'x-runway-token': TOKEN } }),
        f.store,
      )
    ).status,
    405,
  );
});

Deno.test('too many looks in a minute are refused', async () => {
  const f = fakeStore({ hits: RATE_LIMIT + 1 });
  await f.ready;
  assertEquals((await handle(get(), f.store)).status, 429);
});
