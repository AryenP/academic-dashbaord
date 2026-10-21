// Database tests against a local Supabase (`supabase start`), run with `npm run test:db`.
// They prove the privacy rules with real Row Level Security: the owner sees only their own rows,
// a second account sees nothing of the owner's, and visitors get daily totals and nothing else.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../../src/lib/database.types';

type DB = SupabaseClient<Database>;

const status = JSON.parse(
  execSync('supabase status -o json', { stdio: ['ignore', 'pipe', 'ignore'] }).toString(),
);
const URL: string = status.API_URL;
const ANON: string = status.ANON_KEY;
const SERVICE: string = status.SERVICE_ROLE_KEY;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const admin: DB = createClient<Database>(URL, SERVICE, opts);
const anon: DB = createClient<Database>(URL, ANON, opts);

async function signedIn(email: string): Promise<{ db: DB; id: string }> {
  const password = 'test-password-123';
  const existing = await admin.auth.admin.listUsers();
  let user = existing.data.users.find((u) => u.email === email);
  if (!user) user = (await admin.auth.admin.createUser({ email, password, email_confirm: true })).data.user!;
  const db = createClient<Database>(URL, ANON, opts);
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { db, id: user.id };
}

let owner: { db: DB; id: string };
let other: { db: DB; id: string };

beforeAll(async () => {
  // Start from an empty database every run.
  const { data } = await admin.auth.admin.listUsers();
  for (const u of data.users) await admin.auth.admin.deleteUser(u.id);
  owner = await signedIn('owner@runway.test');
  other = await signedIn('other@runway.test');
});

describe('profiles', () => {
  it('the first sign-up becomes the owner, later ones do not', async () => {
    const { data } = await admin.from('profiles').select('id, is_owner');
    expect(data?.find((p) => p.id === owner.id)?.is_owner).toBe(true);
    expect(data?.find((p) => p.id === other.id)?.is_owner).toBe(false);
  });

  it('people can edit their settings but not make themselves owner', async () => {
    const ok = await other.db.from('profiles').update({ public_totals: false }).eq('id', other.id);
    expect(ok.error).toBeNull();
    const bad = await other.db
      .from('profiles')
      .update({ is_owner: true } as never)
      .eq('id', other.id);
    expect(bad.error).not.toBeNull();
  });

  it("nobody reads someone else's profile", async () => {
    const { data } = await other.db.from('profiles').select('*');
    expect(data?.map((p) => p.id)).toEqual([other.id]);
    expect((await anon.from('profiles').select('*')).data).toEqual([]);
  });
});

describe('sessions', () => {
  let sid: string;

  it('the owner runs a session through pause, break and end', async () => {
    const t0 = Date.parse('2026-10-22T17:00:00Z');
    const at = (min: number) => new Date(t0 + min * 60_000).toISOString();
    const { data: s, error } = await owner.db
      .from('sessions')
      .insert({ course: 'DSC 140A', mode: 'pomodoro', started_at: at(0), note: 'private note' })
      .select()
      .single();
    expect(error).toBeNull();
    sid = s!.id;
    expect(s!.user_id).toBe(owner.id);

    await owner.db.rpc('pause_session', { p_session: sid, p_at: at(10) });
    await owner.db.rpc('resume_session', { p_session: sid, p_at: at(13) });
    await owner.db.rpc('start_break', { p_session: sid, p_kind: 'short', p_at: at(25) });
    await owner.db.rpc('end_break', { p_session: sid, p_at: at(30) });
    const { data: done } = await owner.db.rpc('end_session', { p_session: sid, p_at: at(60) });
    expect(done).toMatchObject({ paused_seconds: 180, break_seconds: 300, paused_at: null });
    expect(Date.parse(done!.ended_at!)).toBe(t0 + 60 * 60_000);
  });

  it('ending a session closes an open break and folds a pause', async () => {
    const t0 = Date.parse('2026-10-23T17:00:00Z');
    const at = (min: number) => new Date(t0 + min * 60_000).toISOString();
    const { data: s } = await owner.db
      .from('sessions')
      .insert({ course: 'DSC 102', mode: 'flow', started_at: at(0) })
      .select()
      .single();
    await owner.db.rpc('start_break', { p_session: s!.id, p_at: at(50) });
    const { data: done } = await owner.db.rpc('end_session', { p_session: s!.id, p_at: at(55) });
    expect(done!.break_seconds).toBe(300);
    const { data: breaks } = await owner.db.from('session_breaks').select('ended_at').eq('session_id', s!.id);
    expect(breaks!.every((b) => b.ended_at)).toBe(true);
  });

  it('only one live session at a time', async () => {
    const a = await owner.db.from('sessions').insert({ course: 'X', mode: 'flow' });
    expect(a.error).toBeNull();
    const b = await owner.db.from('sessions').insert({ course: 'Y', mode: 'flow' });
    expect(b.error?.code).toBe('23505');
    await owner.db.from('sessions').delete().is('ended_at', null);
  });

  it("another account can't see, change or add to the owner's sessions", async () => {
    expect((await other.db.from('sessions').select('*')).data).toEqual([]);
    expect((await other.db.from('session_breaks').select('*')).data).toEqual([]);
    const upd = await other.db.from('sessions').update({ note: 'hacked' }).eq('id', sid).select();
    expect(upd.data).toEqual([]);
    const brk = await other.db.from('session_breaks').insert({ session_id: sid, kind: 'short' });
    expect(brk.error).not.toBeNull();
    const spoof = await other.db.from('sessions').insert({ user_id: owner.id, course: 'X', mode: 'flow' });
    expect(spoof.error).not.toBeNull();
    const { data } = await owner.db.from('sessions').select('note').eq('id', sid).single();
    expect(data!.note).toBe('private note');
  });

  it('visitors read no tables directly', async () => {
    expect((await anon.from('sessions').select('*')).data).toEqual([]);
    expect((await anon.from('session_breaks').select('*')).data).toEqual([]);
    expect((await anon.from('phone_events').select('*')).data).toEqual([]);
    const ins = await anon.from('sessions').insert({ course: 'X', mode: 'flow' });
    expect(ins.error).not.toBeNull();
  });
});

describe('public totals', () => {
  it("visitors get the owner's daily minutes per course, nothing else", async () => {
    const { data, error } = await anon.rpc('public_daily_totals', { days: 3650 });
    expect(error).toBeNull();
    expect(data).toEqual([
      { day: '2026-10-22', course: 'DSC 140A', minutes: 52 }, // 60 − 3 paused − 5 break
      { day: '2026-10-23', course: 'DSC 102', minutes: 50 },
    ]);
  });

  it('turning public totals off hides them', async () => {
    await owner.db.from('profiles').update({ public_totals: false }).eq('id', owner.id);
    expect((await anon.rpc('public_daily_totals', { days: 3650 })).data).toEqual([]);
    await owner.db.from('profiles').update({ public_totals: true }).eq('id', owner.id);
  });
});

describe('phone events', () => {
  it('only the service role writes them; the owner reads their own', async () => {
    const forged = await other.db
      .from('phone_events')
      .insert({ user_id: owner.id, app: 'Instagram', kind: 'open' } as never);
    expect(forged.error).not.toBeNull();
    const ownInsert = await owner.db
      .from('phone_events')
      .insert({ user_id: owner.id, app: 'Instagram', kind: 'open' } as never);
    expect(ownInsert.error).not.toBeNull();
    await admin.from('phone_events').insert({ user_id: owner.id, app: 'Instagram', kind: 'open' });
    expect((await owner.db.from('phone_events').select('app')).data).toEqual([{ app: 'Instagram' }]);
    expect((await other.db.from('phone_events').select('app')).data).toEqual([]);
  });

  it('the rate counter is off limits to clients', async () => {
    const key = `test-${Date.now()}`; // fresh counter each run
    expect((await anon.rpc('phone_rate_hit', { p_token_hash: key })).error).not.toBeNull();
    expect((await owner.db.rpc('phone_rate_hit', { p_token_hash: key })).error).not.toBeNull();
    expect((await admin.rpc('phone_rate_hit', { p_token_hash: key })).data).toBe(1);
    expect((await admin.rpc('phone_rate_hit', { p_token_hash: key })).data).toBe(2);
  });
});
