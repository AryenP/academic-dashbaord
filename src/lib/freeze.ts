import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { OPEN_CAP_MS, computeFocus, frozenMetrics } from './focus';
import type { Session } from './supabase';

/**
 * Computes focus metrics for an ended session and stores them on its row, so history never depends
 * on recomputing. Phone fields stay empty if phone tracking isn't set up.
 */
export async function freezeSession(
  db: SupabaseClient<Database>,
  s: Session,
  tracked: boolean,
): Promise<Session> {
  if (!s.ended_at) return s;
  const [{ data: breaks }, { data: events }] = await Promise.all([
    db.from('session_breaks').select('started_at, ended_at').eq('session_id', s.id),
    db
      .from('phone_events')
      .select('app, kind, at, received_at')
      .gte('at', new Date(Date.parse(s.started_at) - OPEN_CAP_MS).toISOString())
      .lte('at', s.ended_at)
      .order('at'),
  ]);
  const r = computeFocus(
    { start: Date.parse(s.started_at), end: Date.parse(s.ended_at) },
    (breaks ?? []).map((b) => ({
      start: Date.parse(b.started_at),
      end: b.ended_at ? Date.parse(b.ended_at) : null,
    })),
    events ?? [],
    Date.parse(s.ended_at),
  );
  const patch = frozenMetrics(r, tracked);
  const { data } = await db.from('sessions').update(patch).eq('id', s.id).select().single();
  return data ?? { ...s, ...patch };
}
