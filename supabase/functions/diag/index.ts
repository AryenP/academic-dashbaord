// Diagnostics for the deployed runtime: which secrets are set (never their values), in Vault and
// in the environment, and whether the sync key header matches. Needs the anon key as a bearer.
import { appSecret, serviceClient } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  const service = serviceClient();
  const names = ['SYNC_KEY', 'ANTHROPIC_API_KEY'];
  const vault = await Promise.all(names.map(async (n) => [n, (await appSecret(service, n))?.length ?? 0]));
  const key = (await appSecret(service, 'SYNC_KEY')) ?? '';
  const header = req.headers.get('x-sync-key') ?? '';
  return new Response(
    JSON.stringify({
      effective: vault,
      env: names.map((n) => [n, (Deno.env.get(n) ?? '').length]),
      headerLen: header.length,
      match: key.length > 0 && key === header,
    }),
    { headers: { 'content-type': 'application/json' } },
  );
});
