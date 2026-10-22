// deno test supabase/functions/signals
import { assertEquals } from 'jsr:@std/assert@1';
import { RATE_LIMIT, handle, sha256Hex, type Row, type Store } from './handler.ts';

const TOKEN = '0123456789abcdef0123456789abcdef0123456789abcdef';
const NOW = new Date('2026-10-22T14:00:00Z');

// A fake table keyed like the real one, so a second send for the same day shows up as an update.
function fakeStore(opts: { hits?: number } = {}) {
  const table = new Map<string, Row & { user_id: string }>();
  let hash = '';
  const store: Store = {
    ownerByTokenHash: async (h) => (h === hash ? 'user1' : null),
    rateHit: async () => opts.hits ?? 1,
    upsert: async (rows) => {
      for (const r of rows) table.set(`${r.user_id}|${r.day}|${r.kind}`, r);
    },
  };
  return { store, table, ready: sha256Hex(TOKEN).then((h) => (hash = h)) };
}

const post = (body: unknown, token = TOKEN) =>
  new Request('http://x/signals', {
    method: 'POST',
    headers: { 'x-runway-token': token, 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

Deno.test('a summary is stored for the token owner', async () => {
  const f = fakeStore();
  await f.ready;
  const r = await handle(post({ day: '2026-10-21', kind: 'sleep_h', value: 7.5 }), f.store, NOW);
  assertEquals(r.status, 200);
  assertEquals(await r.json(), { ok: true, saved: 1 });
  assertEquals(
    [...f.table.values()],
    [{ user_id: 'user1', day: '2026-10-21', kind: 'sleep_h', value: 7.5, label: null, source: 'shortcut' }],
  );
});

Deno.test('a second send for the same day updates the row instead of adding one', async () => {
  const f = fakeStore();
  await f.ready;
  await handle(post({ day: '2026-10-21', kind: 'steps', value: 4000 }), f.store, NOW);
  await handle(post({ day: '2026-10-21', kind: 'steps', value: '8123' }), f.store, NOW);
  assertEquals(
    [...f.table.values()].map((r) => [r.kind, r.value]),
    [['steps', 8123]],
  );
});

Deno.test("a night's summaries can come in one array", async () => {
  const f = fakeStore();
  await f.ready;
  const r = await handle(
    post([
      { day: '2026-10-21', kind: 'sleep_h', value: 6 },
      { day: '2026-10-21', kind: 'exercise_min', value: 35 },
      { day: '2026-10-21', kind: 'place', label: '  Geisel Library ', source: 'Runway nightly' },
    ]),
    f.store,
    NOW,
  );
  assertEquals(await r.json(), { ok: true, saved: 3 });
  assertEquals(f.table.get('user1|2026-10-21|place')?.label, 'Geisel Library');
  assertEquals(f.table.get('user1|2026-10-21|place')?.source, 'Runway nightly');
});

Deno.test('a missing, malformed or unknown token is 401 and nothing is stored', async () => {
  const f = fakeStore();
  await f.ready;
  const body = { day: '2026-10-21', kind: 'sleep_h', value: 7 };
  for (const t of ['', 'nope', 'f'.repeat(48)])
    assertEquals((await handle(post(body, t), f.store, NOW)).status, 401);
  assertEquals(f.table.size, 0);
});

Deno.test('a bad kind, range, day or body is 400 and nothing is stored', async () => {
  const f = fakeStore();
  await f.ready;
  const bad: unknown[] = [
    { day: '2026-10-21', kind: 'heart_rate', value: 60 },
    { day: '2026-10-21', kind: 'sleep_h', value: 25 },
    { day: '2026-10-21', kind: 'sleep_h', value: -1 },
    { day: '2026-10-21', kind: 'sleep_h' },
    { day: '2026-10-21', kind: 'exercise_min', value: 1441 },
    { day: '2026-10-21', kind: 'steps', value: 1200.5 },
    { day: '2026-10-21', kind: 'steps', value: 200001 },
    { day: '2026-10-21', kind: 'steps', value: 'lots' },
    { day: '2026-10-21', kind: 'place' },
    { day: '2026-10-21', kind: 'place', label: 'x'.repeat(81) },
    { day: '2026-02-30', kind: 'sleep_h', value: 7 },
    { day: '2026-10-25', kind: 'sleep_h', value: 7 },
    { day: '21/10/2026', kind: 'sleep_h', value: 7 },
    [],
    [
      { day: '2026-10-21', kind: 'sleep_h', value: 7 },
      { day: '2026-10-21', kind: 'steps', value: -5 },
    ],
    'not json',
  ];
  for (const b of bad) assertEquals((await handle(post(b), f.store, NOW)).status, 400, JSON.stringify(b));
  assertEquals(f.table.size, 0);
});

Deno.test('too many sends in a minute is 429', async () => {
  const f = fakeStore({ hits: RATE_LIMIT + 1 });
  await f.ready;
  assertEquals(
    (await handle(post({ day: '2026-10-21', kind: 'steps', value: 1 }), f.store, NOW)).status,
    429,
  );
});

Deno.test('preflight is allowed with the token header, other methods are 405', async () => {
  const f = fakeStore();
  const pre = await handle(new Request('http://x/signals', { method: 'OPTIONS' }), f.store, NOW);
  assertEquals(pre.status, 204);
  assertEquals(pre.headers.get('access-control-allow-headers')?.includes('x-runway-token'), true);
  assertEquals((await handle(new Request('http://x/signals'), f.store, NOW)).status, 405);
});
