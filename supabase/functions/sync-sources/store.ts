// The database behind the sync: supabase-js with the service role, shaped as the Store the
// pure sync logic (../_shared/sync.ts) expects. Shared with classify-events.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { EventRow, Store } from '../_shared/sync.ts';

const must = <T>({ data, error }: { data: T; error: unknown }): T => {
  if (error) throw error;
  return data;
};

export function dbStore(db: SupabaseClient): Store {
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
          .select(
            'id, uid, recurrence_id, hash, title, start_at, end_at, all_day, location, kind, course_code, confidence, override, ai_hash, ai_kind, ai_course_code, plan_item_id, deleted_at',
          )
          .eq('source_id', sourceId)
          .limit(5000),
      ) as EventRow[],
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
    linkEvents: async (links) => {
      for (const l of links)
        must(await db.from('events').update({ plan_item_id: l.plan_item_id }).eq('id', l.id));
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
