// Supabase Edge Function: syncs calendar sources.
//
//   POST with header x-sync-key (the scheduled run): every source that's due, oldest first, within
//        a time budget. The key lives in Supabase secrets and the scheduler's secrets, nowhere else.
//   POST with the person's JWT and {source_id} ("Sync now", or right after connecting), or
//        {source_id, ics} for an uploaded .ics file.
//
// The logic is in ../_shared/sync.ts; this file is the database store and the request handling.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { caller, CORS, json, overLimit, serviceClient } from '../_shared/auth.ts';
import { syncSource, type Source, type Store } from '../_shared/sync.ts';

const BUDGET_MS = 50_000;

const must = <T>({ data, error }: { data: T; error: unknown }): T => {
  if (error) throw error;
  return data;
};

function dbStore(db: SupabaseClient): Store {
  return {
    sourceUrl: async (id) => must(await db.rpc('source_url', { p_source: id })) as string | null,
    timezone: async (userId) =>
      (
        must(await db.from('profiles').select('timezone').eq('id', userId).maybeSingle()) as {
          timezone: string;
        } | null
      )?.timezone ?? 'UTC',
    events: async (sourceId) =>
      must(
        await db
          .from('events')
          .select('id, uid, recurrence_id, hash, kind, course_code, override, plan_item_id, deleted_at')
          .eq('source_id', sourceId)
          .limit(5000),
      ) as Store extends { events(s: string): Promise<infer R> } ? R : never,
    upsertEvents: async (rows) => {
      if (!rows.length) return [];
      const out: string[] = [];
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const got = must(
          await db
            .from('events')
            .upsert(chunk, { onConflict: 'source_id,uid,recurrence_id' })
            .select('id, uid, recurrence_id'),
        ) as { id: string; uid: string; recurrence_id: string }[];
        const byKey = new Map(got.map((g) => [`${g.uid}\u0001${g.recurrence_id}`, g.id]));
        for (const r of chunk) out.push(byKey.get(`${r.uid}\u0001${r.recurrence_id}`) ?? '');
      }
      return out;
    },
    markDeleted: async (ids) => {
      for (let i = 0; i < ids.length; i += 500)
        must(
          await db
            .from('events')
            .update({ deleted_at: new Date().toISOString() })
            .in('id', ids.slice(i, i + 500)),
        );
    },
    courses: async (userId) =>
      must(await db.from('courses').select('id, code, color').eq('user_id', userId)) as {
        id: string;
        code: string;
        color: number;
      }[],
    addCourse: async (userId, code, color) =>
      must(
        await db.from('courses').insert({ user_id: userId, code, color }).select('id, code, color').single(),
      ) as {
        id: string;
        code: string;
        color: number;
      },
    duplicate: async (userId, title, startAt) => {
      const t = Date.parse(startAt);
      const rows = must(
        await db
          .from('plan_items')
          .select('id')
          .eq('user_id', userId)
          .eq('title', title)
          .gte('start_at', new Date(t - 5 * 60_000).toISOString())
          .lte('start_at', new Date(t + 5 * 60_000).toISOString())
          .limit(1),
      ) as { id: string }[];
      return rows[0]?.id ?? null;
    },
    insertPlanItem: async (row) =>
      (must(await db.from('plan_items').insert(row).select('id').single()) as { id: string }).id,
    updatePlanItem: async (id, row) => {
      must(await db.from('plan_items').update(row).eq('id', id));
    },
    pruneOrphans: async (sourceId) => {
      const live = must(
        await db
          .from('events')
          .select('plan_item_id')
          .eq('source_id', sourceId)
          .is('deleted_at', null)
          .not('plan_item_id', 'is', null),
      ) as { plan_item_id: string }[];
      const keep = new Set(live.map((r) => r.plan_item_id));
      const mine = must(await db.from('plan_items').select('id').eq('source_id', sourceId)) as {
        id: string;
      }[];
      const gone = mine.map((r) => r.id).filter((id) => !keep.has(id));
      for (let i = 0; i < gone.length; i += 500)
        must(
          await db
            .from('plan_items')
            .delete()
            .in('id', gone.slice(i, i + 500)),
        );
      return gone.length;
    },
    finish: async (sourceId, ok, error, count, etag, lastModified) => {
      must(
        await db.rpc('finish_sync', {
          p_source: sourceId,
          p_ok: ok,
          p_error: error,
          p_count: count,
          p_etag: etag,
          p_last_modified: lastModified,
        }),
      );
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);
  const service = serviceClient();
  const store = dbStore(service);

  // The scheduled run.
  const key = Deno.env.get('SYNC_KEY');
  if (key && req.headers.get('x-sync-key') === key) {
    const started = Date.now();
    const due = must(await service.rpc('due_sources', { p_limit: 50 })) as Source[];
    const results: Record<string, unknown>[] = [];
    for (const src of due) {
      if (Date.now() - started > BUDGET_MS) break;
      const r = await syncSource(store, src);
      results.push({ id: src.id, ...r });
    }
    return json({ ok: true, due: due.length, done: results.length, results });
  }

  // A person syncing their own source.
  const who = await caller(req);
  if (!who) return json({ ok: false, code: 'auth', message: 'Sign in first.' }, 401);
  if (await overLimit(service, `sync:${who.id}`, 10))
    return json({ ok: false, code: 'rate', message: 'Too many syncs in a minute. Wait a moment.' }, 429);
  let body: { source_id?: string; ics?: string };
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
  if (full.kind === 'ics_upload' && typeof body.ics !== 'string')
    return json({ ok: false, code: 'body', message: 'An .ics upload needs the file contents.' }, 400);
  if (typeof body.ics === 'string' && body.ics.length > 5 * 1024 * 1024)
    return json({ ok: false, code: 'too_large', message: 'That file is larger than 5 MB.' }, 413);
  const r = await syncSource(store, full, { text: typeof body.ics === 'string' ? body.ics : undefined });
  return json(r, r.ok ? 200 : 422);
});
