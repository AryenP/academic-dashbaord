// Supabase Edge Function: the "Runway nightly" iPhone Shortcut posts the day's coarse summary with
// header x-runway-token (the token from Settings → Extension). The logic is in handler.ts.
import { serviceClient } from '../_shared/auth.ts';
import { handle } from './handler.ts';

Deno.serve((req) => {
  const db = serviceClient();
  return handle(req, {
    ownerByTokenHash: async (hash) => {
      const { data, error } = await db.rpc('token_owner', { p_purpose: 'extension', p_token_hash: hash });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
    rateHit: async (key) => {
      const { data } = await db.rpc('phone_rate_hit', { p_token_hash: key });
      return typeof data === 'number' ? data : 0;
    },
    upsert: async (rows) => {
      const now = new Date().toISOString();
      const { error } = await db.from('signals').upsert(
        rows.map((r) => ({ ...r, updated_at: now })),
        { onConflict: 'user_id,day,kind' },
      );
      if (error) throw error;
    },
  });
});
