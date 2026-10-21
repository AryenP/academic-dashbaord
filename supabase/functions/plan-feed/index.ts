// Supabase Edge Function: the accepted plan as an iCalendar feed. GET ?t=<token>. The person makes
// the token in Settings (only its sha256 is stored) and subscribes once in Google, Apple or Outlook.
// Study blocks, exams and deadlines; nothing personal beyond that, and no notes.
import { json, serviceClient } from '../_shared/auth.ts';
import { toIcs, type Row } from './ics.ts';

const must = <T>({ data, error }: { data: T; error: unknown }): T => {
  if (error) throw error;
  return data;
};

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return json({ ok: false, code: 'method' }, 405);
  const token = new URL(req.url).searchParams.get('t') ?? '';
  if (!/^[0-9a-f]{48}$/.test(token)) return new Response('Not found', { status: 404 });
  const db = serviceClient();
  const owner = must(
    await db.rpc('token_owner', { p_purpose: 'feed', p_token_hash: await sha256(token) }),
  ) as string | null;
  if (!owner) return new Response('Not found', { status: 404 });
  const rows = must(await db.rpc('feed_items', { p_user: owner })) as Row[];
  const body = toIcs(rows ?? []);
  return new Response(req.method === 'HEAD' ? null : body, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'inline; filename="runway.ics"',
      'cache-control': 'private, max-age=300',
    },
  });
});
