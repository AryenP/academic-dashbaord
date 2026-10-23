import { assert, assertEquals } from 'jsr:@std/assert@1';
import { CORS, json } from './auth.ts';

// The shared preflight must allow every header a client sends, or browsers refuse the request
// before it leaves (curl never notices, which is how the extension's "Failed to fetch" happened).
const SENT_BY_CLIENTS = [
  'content-type',
  'authorization',
  'apikey',
  'x-client-info',
  'x-sync-key',
  'x-runway-token',
];

Deno.test('the shared CORS preflight allows every header the clients send', () => {
  const allowed = CORS['Access-Control-Allow-Headers'].split(',').map((h) => h.trim().toLowerCase());
  for (const h of SENT_BY_CLIENTS) assert(allowed.includes(h), `${h} is not allowed by the preflight`);
  assert(CORS['Access-Control-Allow-Methods'].includes('POST'));
  assert(CORS['Access-Control-Allow-Methods'].includes('OPTIONS'));
});

Deno.test('json() answers carry the CORS headers and the status', async () => {
  const r = json({ ok: false, code: 'x' }, 418);
  assertEquals(r.status, 418);
  assertEquals(r.headers.get('content-type'), 'application/json');
  assertEquals(r.headers.get('Access-Control-Allow-Origin'), '*');
  assertEquals(await r.json(), { ok: false, code: 'x' });
});
