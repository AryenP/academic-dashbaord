// Supabase Edge Function: POST {token, app, kind, at?} from iPhone Shortcuts. See handler.ts.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { OPEN_CAP_MS, computeFocus, frozenMetrics } from '../../../src/lib/focus.ts';
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
    const s = must(await db.rpc('end_session', { p_session: id, p_at: endedAt })) as {
      id: string;
      user_id: string;
      started_at: string;
      ended_at: string;
    };
    await freeze(s);
  },
  plan: async () => {
    const r = await fetch(PLAN_URL, { signal: AbortSignal.timeout(3000) });
    return ((await r.json()) as { plan: PlanBlock[] }).plan;
  },
};

// Same metrics the web app stores when you end a session there (src/lib/freeze.ts).
async function freeze(s: { id: string; user_id: string; started_at: string; ended_at: string }) {
  const [{ data: breaks }, { data: events }] = await Promise.all([
    db.from('session_breaks').select('started_at, ended_at').eq('session_id', s.id),
    db
      .from('phone_events')
      .select('app, kind, at, received_at')
      .eq('user_id', s.user_id)
      .gte('at', new Date(Date.parse(s.started_at) - OPEN_CAP_MS).toISOString())
      .lte('at', s.ended_at),
  ]);
  const end = Date.parse(s.ended_at);
  const r = computeFocus(
    { start: Date.parse(s.started_at), end },
    (breaks ?? []).map((b: { started_at: string; ended_at: string | null }) => ({
      start: Date.parse(b.started_at),
      end: b.ended_at ? Date.parse(b.ended_at) : null,
    })),
    events ?? [],
    end,
  );
  // Ended from the phone, so phone tracking is set up by definition.
  must(await db.from('sessions').update(frozenMetrics(r, true)).eq('id', s.id));
}

Deno.serve(async (req) => {
  try {
    return await handle(req, store);
  } catch (e) {
    console.error(e);
    return new Response(null, { status: 500 });
  }
});
