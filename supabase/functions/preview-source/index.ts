// Supabase Edge Function: the signed-out preview. POST {url, kind, tz}; answers the next three weeks
// of a calendar as the runway would draw them, read with the title rules. Nothing is stored, and no
// account is needed. The logic and its guards are in handler.ts.
import { serviceClient } from '../_shared/auth.ts';
import { handle } from './handler.ts';

Deno.serve((req) => {
  const db = serviceClient();
  return handle(req, {
    rateHit: async (key) => {
      const { data } = await db.rpc('phone_rate_hit', { p_token_hash: key });
      return typeof data === 'number' ? data : 0;
    },
  });
});
