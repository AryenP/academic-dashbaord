// Supabase Edge Function: the browser extension posts what it read on Gradescope or Canvas.
// POST {items: [...]} with header x-runway-token (made in Settings → Extension). Deadlines are
// created or updated on the runway; scores land only if the extension sent them.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { CORS, json, overLimit, serviceClient } from '../_shared/auth.ts';
import { importItems, type ImportStore, type Incoming } from '../_shared/importer.ts';

const must = <T>({ data, error }: { data: T; error: unknown }): T => {
  if (error) throw error;
  return data;
};

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function dbStore(db: SupabaseClient): ImportStore {
  return {
    courses: async (userId) =>
      must(await db.from('courses').select('id, code, name, color').eq('user_id', userId)) as never,
    addCourse: async (userId, code, name, color) =>
      must(
        await db
          .from('courses')
          .insert({ user_id: userId, code, name, color })
          .select('id, code, name, color')
          .single(),
      ) as never,
    items: async (userId) =>
      must(
        await db
          .from('plan_items')
          .select('id, course_id, kind, title, start_at, end_at, status, source')
          .eq('user_id', userId)
          .in('kind', ['deadline', 'exam'])
          .gte('end_at', new Date(Date.now() - 60 * 864e5).toISOString())
          .limit(2000),
      ) as never,
    extensionSource: async (userId) => {
      const found = must(
        await db
          .from('calendar_sources')
          .select('id')
          .eq('user_id', userId)
          .eq('kind', 'extension')
          .maybeSingle(),
      ) as { id: string } | null;
      if (found) return found.id;
      const made = must(
        await db
          .from('calendar_sources')
          .insert({
            user_id: userId,
            kind: 'extension',
            label: 'Browser extension',
            status: 'ok',
            next_sync_at: '2999-01-01',
          })
          .select('id')
          .single(),
      ) as { id: string };
      return made.id;
    },
    insert: async (row) =>
      (must(await db.from('plan_items').insert(row).select('id').single()) as { id: string }).id,
    update: async (id, patch) => {
      must(await db.from('plan_items').update(patch).eq('id', id));
    },
  };
}

const KINDS = new Set(['gradescope', 'canvas']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);
  const token = req.headers.get('x-runway-token') ?? '';
  if (!/^[0-9a-f]{48}$/.test(token))
    return json(
      { ok: false, code: 'token', message: 'Paste your Runway token in the extension first.' },
      401,
    );
  const db = serviceClient();
  const owner = must(
    await db.rpc('token_owner', { p_purpose: 'extension', p_token_hash: await sha256(token) }),
  ) as string | null;
  if (!owner)
    return json(
      {
        ok: false,
        code: 'token',
        message: "That token isn't valid any more. Make a new one in Settings → Extension.",
      },
      401,
    );
  if (await overLimit(db, `import:${owner}`, 30))
    return json({ ok: false, code: 'rate', message: 'Too many sends in a minute.' }, 429);
  let body: { items?: Incoming[] };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, code: 'body' }, 400);
  }
  const items = (Array.isArray(body.items) ? body.items : [])
    .filter((i) => i && typeof i.title === 'string' && KINDS.has(i.source))
    .map((i) => ({
      source: i.source,
      course: typeof i.course === 'string' ? i.course.slice(0, 200) : null,
      title: i.title.slice(0, 200),
      due:
        typeof i.due === 'string' && Number.isFinite(Date.parse(i.due))
          ? new Date(i.due).toISOString()
          : null,
      status: i.status === 'submitted' || i.status === 'open' ? i.status : null,
      score: typeof i.score === 'number' ? i.score : null,
      max_score: typeof i.max_score === 'number' ? i.max_score : null,
      url: typeof i.url === 'string' ? i.url.slice(0, 500) : null,
    }));
  try {
    const r = await importItems(dbStore(db), owner, items);
    return json({ ok: true, ...r });
  } catch (e) {
    return json(
      { ok: false, code: 'import', message: e instanceof Error ? e.message : 'Import failed.' },
      500,
    );
  }
});
