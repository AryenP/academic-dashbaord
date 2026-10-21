// Supabase Edge Function: POST {token, app, kind, at?} from iPhone Shortcuts. See handler.ts.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handle, type PlanBlock, type Store } from './handler.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
const PLAN_URL = Deno.env.get('PLAN_URL') ?? 'https://aryenp.github.io/academic-dashbaord/data.json';

const must = <T>({ data, error }: { data: T; error: unknown }): T => {
  if (error) throw error;
  return data;
};

const store: Store = {
  rateHit: async (hash) => must(await db.rpc('phone_rate_hit', { p_token_hash: hash })) as number,
  profileByTokenHash: async (hash) =>
    must(await db.from('profiles').select('id, settings').eq('phone_token_hash', hash).maybeSingle()),
  insertEvent: async (e) => {
    must(await db.from('phone_events').insert(e));
  },
  openSession: async (userId) =>
    must(await db.from('sessions').select('id').eq('user_id', userId).is('ended_at', null).maybeSingle()),
  startSession: async (s) => {
    must(await db.from('sessions').insert({ ...s, source: 'phone' }));
  },
  endSession: async (id, endedAt) => {
    must(await db.rpc('end_session', { p_session: id, p_at: endedAt }));
  },
  plan: async () => {
    const r = await fetch(PLAN_URL, { signal: AbortSignal.timeout(3000) });
    return ((await r.json()) as { plan: PlanBlock[] }).plan;
  },
};

Deno.serve(async (req) => {
  try {
    return await handle(req, store);
  } catch (e) {
    console.error(e);
    return new Response(null, { status: 500 });
  }
});
