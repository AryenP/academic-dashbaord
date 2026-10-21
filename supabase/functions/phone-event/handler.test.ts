// deno test supabase/functions/phone-event
import { assertEquals } from 'jsr:@std/assert@1';
import { RATE_LIMIT, currentBlock, handle, parse, sha256Hex, type Store } from './handler.ts';

const TOKEN = 'tok_0123456789abcdefghijklmnop';
const NOW = new Date('2026-10-22T18:00:00Z'); // 11 AM Pacific, inside a DSC 140A block
const PLAN = [
  {
    id: 'blk1',
    course: 'DSC 140A',
    kind: 'Study',
    start: '2026-10-22T09:45:00-07:00',
    end: '2026-10-22T13:45:00-07:00',
  },
];

function fakeStore(opts: { hits?: number; open?: boolean } = {}) {
  const calls: { events: unknown[]; started: unknown[]; ended: string[] } = {
    events: [],
    started: [],
    ended: [],
  };
  let hash = '';
  const store: Store = {
    rateHit: async () => opts.hits ?? 1,
    profileByTokenHash: async (h) =>
      h === hash ? { id: 'user1', settings: { break_mode: 'fifty_ten' } } : null,
    insertEvent: async (e) => void calls.events.push(e),
    openSession: async () => (opts.open ? { id: 'sess1' } : null),
    startSession: async (s) => void calls.started.push(s),
    endSession: async (id) => void calls.ended.push(id),
    plan: async () => PLAN,
  };
  return { store, calls, ready: sha256Hex(TOKEN).then((h) => (hash = h)) };
}

const post = (body: unknown) =>
  new Request('http://x/phone-event', { method: 'POST', body: JSON.stringify(body) });

Deno.test('open event is stored for the token owner', async () => {
  const f = fakeStore();
  await f.ready;
  const r = await handle(post({ token: TOKEN, app: 'Instagram', kind: 'open' }), f.store, NOW);
  assertEquals(r.status, 204);
  assertEquals(f.calls.events, [{ user_id: 'user1', app: 'Instagram', kind: 'open', at: NOW.toISOString() }]);
});

Deno.test('unknown token is rejected and nothing is stored', async () => {
  const f = fakeStore();
  await f.ready;
  const r = await handle(post({ token: 'x'.repeat(30), app: 'Instagram', kind: 'open' }), f.store, NOW);
  assertEquals(r.status, 401);
  assertEquals(f.calls.events.length, 0);
});

Deno.test('rate limit returns 429 past the limit', async () => {
  const f = fakeStore({ hits: RATE_LIMIT + 1 });
  await f.ready;
  const r = await handle(post({ token: TOKEN, app: 'TikTok', kind: 'close' }), f.store, NOW);
  assertEquals(r.status, 429);
  assertEquals(f.calls.events.length, 0);
});

Deno.test('session_start starts a session on the current block with the saved break mode', async () => {
  const f = fakeStore();
  await f.ready;
  const r = await handle(post({ token: TOKEN, kind: 'session_start' }), f.store, NOW);
  assertEquals(r.status, 204);
  assertEquals(f.calls.started, [
    {
      user_id: 'user1',
      course: 'DSC 140A',
      plan_block_id: 'blk1',
      mode: 'fifty_ten',
      started_at: NOW.toISOString(),
    },
  ]);
});

Deno.test('session_start keeps a session that is already running', async () => {
  const f = fakeStore({ open: true });
  await f.ready;
  await handle(post({ token: TOKEN, kind: 'session_start' }), f.store, NOW);
  assertEquals(f.calls.started.length, 0);
});

Deno.test('session_end ends the open session', async () => {
  const f = fakeStore({ open: true });
  await f.ready;
  await handle(post({ token: TOKEN, kind: 'session_end' }), f.store, NOW);
  assertEquals(f.calls.ended, ['sess1']);
});

Deno.test('input validation', () => {
  assertEquals(parse(null, NOW), { error: 400 });
  assertEquals(parse({ token: 'short', app: 'a', kind: 'open' }, NOW), { error: 401 });
  assertEquals(parse({ token: TOKEN, app: 'a', kind: 'launch' }, NOW), { error: 400 });
  assertEquals(parse({ token: TOKEN, app: '  ', kind: 'open' }, NOW), { error: 400 });
  assertEquals(parse({ token: TOKEN, app: 'a', kind: 'open', at: 'yesterday-ish' }, NOW), { error: 400 });
  assertEquals(parse({ token: TOKEN, app: 'a', kind: 'open', at: '2026-10-25T00:00:00Z' }, NOW), {
    error: 400,
  });
  const long = parse({ token: TOKEN, app: 'A'.repeat(60), kind: 'open' }, NOW);
  assertEquals('app' in long && long.app.length, 40);
  const timed = parse({ token: TOKEN, app: 'X', kind: 'close', at: '2026-10-22T17:59:30Z' }, NOW);
  assertEquals('at' in timed && timed.at.toISOString(), '2026-10-22T17:59:30.000Z');
});

Deno.test('only POST is accepted', async () => {
  const f = fakeStore();
  assertEquals((await handle(new Request('http://x/', { method: 'GET' }), f.store, NOW)).status, 405);
  const bad = new Request('http://x/', { method: 'POST', body: '{not json' });
  assertEquals((await handle(bad, f.store, NOW)).status, 400);
});

Deno.test('currentBlock ignores blocks that are over or not study', () => {
  assertEquals(currentBlock(PLAN, NOW)?.id, 'blk1');
  assertEquals(currentBlock(PLAN, new Date('2026-10-22T21:00:00Z')), undefined);
  assertEquals(currentBlock([{ ...PLAN[0], kind: 'Exam' }], NOW), undefined);
});
