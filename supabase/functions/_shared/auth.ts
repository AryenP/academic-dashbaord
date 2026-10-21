// Who is calling an Edge Function, and the two database clients a function needs.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info, x-sync-key',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });

const URL_ = () => Deno.env.get('SUPABASE_URL')!;

/** A client that acts as the service role. Never handed to callers. */
export const serviceClient = (): SupabaseClient =>
  createClient(URL_(), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

/** The signed-in person behind a request, or null. The client runs as them, so RLS applies. */
export async function caller(req: Request): Promise<{ id: string; client: SupabaseClient } | null> {
  const auth = req.headers.get('authorization') ?? '';
  if (!/^bearer /i.test(auth)) return null;
  const client = createClient(URL_(), Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: auth } },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, client };
}

/** Counts a call for `key` this minute and says whether it's over `limit`. */
export async function overLimit(service: SupabaseClient, key: string, limit: number): Promise<boolean> {
  const { data } = await service.rpc('phone_rate_hit', { p_token_hash: key });
  return typeof data === 'number' && data > limit;
}
