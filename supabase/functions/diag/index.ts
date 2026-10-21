// Diagnostics for the deployed runtime: which secrets are set (never their values) and whether the
// sync key header matches. Needs the anon key as a bearer, like any function.
Deno.serve((req) => {
  const key = Deno.env.get('SYNC_KEY') ?? '';
  const header = req.headers.get('x-sync-key') ?? '';
  return new Response(
    JSON.stringify({
      secrets: ['SYNC_KEY', 'ANTHROPIC_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY'].map((n) => [
        n,
        (Deno.env.get(n) ?? '').length,
      ]),
      headerLen: header.length,
      match: key.length > 0 && key === header,
    }),
    { headers: { 'content-type': 'application/json' } },
  );
});
