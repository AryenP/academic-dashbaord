// Supabase Edge Function: syncs calendar sources.
//
//   POST with header x-sync-key (the scheduled run): every source that's due, oldest first, within
//        a time budget. The key lives in Supabase secrets and the scheduler's secrets, nowhere else.
//   POST with the person's JWT and {source_id} ("Sync now", or right after connecting), or
//        {source_id, ics} for an uploaded .ics file.
//
// The logic is in ../_shared/sync.ts; this file is the database store and the request handling.
import { appSecret, caller, CORS, json, overLimit, serviceClient } from '../_shared/auth.ts';
import { rebuildPlan, syncSource, type Source } from '../_shared/sync.ts';
import { dbStore } from './store.ts';

const BUDGET_MS = 50_000;
const OVERDUE_MS = 2 * 3600_000;

const must = <T>({ data, error }: { data: T; error: unknown }): T => {
  if (error) throw error;
  return data;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);
  const service = serviceClient();
  const store = dbStore(service);

  // The scheduled run.
  const key = await appSecret(service, 'SYNC_KEY');
  if (key && req.headers.get('x-sync-key') === key) {
    const started = Date.now();
    const due = must(await service.rpc('due_sources', { p_limit: 50 })) as Source[];
    const results: Record<string, unknown>[] = [];
    for (const src of due) {
      if (Date.now() - started > BUDGET_MS) break;
      const r = await syncSource(store, src);
      results.push({ id: src.id, ...r });
    }
    // Silence is the failure nobody sees: sources that should have been read two hours ago and
    // weren't. The scheduler fails its run when this isn't zero, so the failure reaches a person.
    const { count: overdue } = await service
      .from('calendar_sources')
      .select('id', { count: 'exact', head: true })
      .neq('kind', 'ics_upload')
      .in('status', ['ok', 'pending'])
      .lt('next_sync_at', new Date(Date.now() - OVERDUE_MS).toISOString());
    return json({ ok: true, due: due.length, done: results.length, overdue: overdue ?? 0, results });
  }

  // A person syncing their own source.
  const who = await caller(req);
  if (!who) return json({ ok: false, code: 'auth', message: 'Sign in first.' }, 401);
  if (await overLimit(service, `sync:${who.id}`, 10))
    return json({ ok: false, code: 'rate', message: 'Too many syncs in a minute. Wait a moment.' }, 429);
  let body: { source_id?: string; ics?: string; force?: boolean; rebuild?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, code: 'body' }, 400);
  }
  // Read through the caller's client, so RLS proves the source is theirs.
  const own = must(
    await who.client
      .from('calendar_sources')
      .select('id, user_id, kind')
      .eq('id', String(body.source_id ?? ''))
      .maybeSingle(),
  ) as { id: string; user_id: string; kind: Source['kind'] } | null;
  if (!own) return json({ ok: false, code: 'missing', message: 'No such calendar.' }, 404);
  const full = must(
    await service
      .from('calendar_sources')
      .select('id, user_id, kind, etag, last_modified')
      .eq('id', own.id)
      .single(),
  ) as Source;
  // After a review: rebuild the plan from what's stored, no fetch.
  if (body.rebuild === true) {
    const planned = await rebuildPlan(store, full);
    return json({ ok: true, planned });
  }
  if (full.kind === 'ics_upload' && typeof body.ics !== 'string')
    return json({ ok: false, code: 'body', message: 'An .ics upload needs the file contents.' }, 400);
  if (typeof body.ics === 'string' && body.ics.length > 5 * 1024 * 1024)
    return json({ ok: false, code: 'too_large', message: 'That file is larger than 5 MB.' }, 413);
  const r = await syncSource(store, full, {
    text: typeof body.ics === 'string' ? body.ics : undefined,
    force: body.force === true,
  });
  return json(r, r.ok ? 200 : 422);
});
