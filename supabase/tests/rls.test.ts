// Database tests against a local Supabase (`supabase start`), run with `npm run test:db`.
// They prove the privacy rules with real Row Level Security: each person sees only their own rows,
// a second account sees nothing of the first's, and share pages return only what was turned on.
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

let a: { db: DB; id: string }; // "alice"
let b: { db: DB; id: string }; // "bob"

beforeAll(async () => {
  // Start from an empty database every run.
  const { data } = await admin.auth.admin.listUsers();
  for (const u of data.users) await admin.auth.admin.deleteUser(u.id);
  a = await signedIn('alice@ucsd.edu');
  b = await signedIn('bob@ucsd.edu');
});

describe('sign-up', () => {
  it('needs a school email', async () => {
    const r = await admin.auth.admin.createUser({ email: 'someone@gmail.com', password: 'x'.repeat(12) });
    expect(r.error).not.toBeNull();
    const ok = await admin.auth.admin.createUser({ email: 'c@cam.ac.uk', password: 'x'.repeat(12) });
    expect(ok.error).toBeNull();
    await admin.auth.admin.deleteUser(ok.data.user!.id);
  });

  it('gives everyone a handle, a school domain and private sharing', async () => {
    const { data } = await admin.from('profiles').select('*').eq('id', a.id).single();
    expect(data).toMatchObject({ handle: 'alice', school_domain: 'ucsd.edu', share_level: 'off' });
    const bob = await admin.from('profiles').select('handle').eq('id', b.id).single();
    expect(bob.data?.handle).toBe('bob');
  });

  it("nobody reads someone else's profile, and the handle is validated", async () => {
    const { data } = await b.db.from('profiles').select('*');
    expect(data?.map((p) => p.id)).toEqual([b.id]);
    expect((await anon.from('profiles').select('*')).data).toEqual([]);
    const bad = await b.db.from('profiles').update({ handle: 'No Spaces!' }).eq('id', b.id);
    expect(bad.error).not.toBeNull();
    const taken = await b.db.from('profiles').update({ handle: 'alice' }).eq('id', b.id);
    expect(taken.error).not.toBeNull();
    const ok = await b.db
      .from('profiles')
      .update({ handle: 'bobby', timezone: 'America/New_York' })
      .eq('id', b.id);
    expect(ok.error).toBeNull();
  });
});

describe('courses and plan items', () => {
  let courseA: string;
  let examA: string;

  it('a person adds a course and items; defaults set the owner', async () => {
    const c = await a.db.from('courses').insert({ code: 'DSC 140A', color: 1 }).select().single();
    expect(c.error).toBeNull();
    courseA = c.data!.id;
    const x = await a.db
      .from('plan_items')
      .insert({
        course_id: courseA,
        kind: 'exam',
        title: 'Midterm 1',
        start_at: '2026-10-26T17:00:00-07:00',
        end_at: '2026-10-26T18:00:00-07:00',
        weight: 25,
      })
      .select()
      .single();
    expect(x.error).toBeNull();
    examA = x.data!.id;
    expect(x.data!.user_id).toBe(a.id);
    const s = await a.db.from('plan_items').insert({
      course_id: courseA,
      kind: 'study',
      title: 'Practice problems',
      start_at: '2026-10-25T09:00:00-07:00',
      end_at: '2026-10-25T11:00:00-07:00',
    });
    expect(s.error).toBeNull();
  });

  it("user B can't see, change or delete user A's courses or items", async () => {
    expect((await b.db.from('courses').select('*')).data).toEqual([]);
    expect((await b.db.from('plan_items').select('*')).data).toEqual([]);
    expect((await anon.from('plan_items').select('*')).data).toEqual([]);
    const upd = await b.db.from('plan_items').update({ title: 'hacked' }).eq('id', examA).select();
    expect(upd.data).toEqual([]);
    const del = await b.db.from('plan_items').delete().eq('id', examA).select();
    expect(del.data).toEqual([]);
    const still = await admin.from('plan_items').select('title').eq('id', examA).single();
    expect(still.data?.title).toBe('Midterm 1');
  });

  it("user B can't attach an item to user A's course", async () => {
    const r = await b.db.from('plan_items').insert({
      course_id: courseA,
      kind: 'study',
      title: 'x',
      start_at: '2026-10-25T09:00:00Z',
      end_at: '2026-10-25T10:00:00Z',
    });
    expect(r.error).not.toBeNull();
  });

  it('a session links to a plan item of its own', async () => {
    const r = await a.db
      .from('sessions')
      .insert({
        course: 'DSC 140A',
        mode: 'pomodoro',
        plan_item_id: examA,
        started_at: '2026-10-25T16:00:00Z',
        ended_at: '2026-10-25T17:00:00Z',
      })
      .select()
      .single();
    expect(r.error).toBeNull();
    expect(r.data!.plan_item_id).toBe(examA);
  });
});

describe('sessions', () => {
  let sid: string;

  it('the owner runs a session through pause, break and end', async () => {
    const t0 = Date.parse('2026-10-22T17:00:00Z');
    const at = (min: number) => new Date(t0 + min * 60_000).toISOString();
    const { data: s, error } = await a.db
      .from('sessions')
      .insert({ course: 'DSC 140A', mode: 'pomodoro', started_at: at(0), note: 'private note' })
      .select()
      .single();
    expect(error).toBeNull();
    sid = s!.id;
    expect(s!.user_id).toBe(a.id);

    await a.db.rpc('pause_session', { p_session: sid, p_at: at(10) });
    await a.db.rpc('resume_session', { p_session: sid, p_at: at(13) });
    await a.db.rpc('start_break', { p_session: sid, p_kind: 'short', p_at: at(25) });
    await a.db.rpc('end_break', { p_session: sid, p_at: at(30) });
    const { data: done } = await a.db.rpc('end_session', { p_session: sid, p_at: at(60) });
    expect(done).toMatchObject({ paused_seconds: 180, break_seconds: 300, paused_at: null });
    expect(Date.parse(done!.ended_at!)).toBe(t0 + 60 * 60_000);
  });

  it('ending a session closes an open break and folds a pause', async () => {
    const t0 = Date.parse('2026-10-23T17:00:00Z');
    const at = (min: number) => new Date(t0 + min * 60_000).toISOString();
    const { data: s } = await a.db
      .from('sessions')
      .insert({ course: 'DSC 102', mode: 'flow', started_at: at(0) })
      .select()
      .single();
    await a.db.rpc('start_break', { p_session: s!.id, p_at: at(50) });
    const { data: done } = await a.db.rpc('end_session', { p_session: s!.id, p_at: at(55) });
    expect(done!.break_seconds).toBe(300);
    const { data: breaks } = await a.db.from('session_breaks').select('ended_at').eq('session_id', s!.id);
    expect(breaks!.every((b) => b.ended_at)).toBe(true);
  });

  it('only one live session at a time', async () => {
    const first = await a.db.from('sessions').insert({ course: 'X', mode: 'flow' });
    expect(first.error).toBeNull();
    const second = await a.db.from('sessions').insert({ course: 'Y', mode: 'flow' });
    expect(second.error?.code).toBe('23505');
    await a.db.from('sessions').delete().is('ended_at', null);
  });

  it("another account can't see, change or add to the owner's sessions", async () => {
    expect((await b.db.from('sessions').select('*')).data).toEqual([]);
    expect((await b.db.from('session_breaks').select('*')).data).toEqual([]);
    const upd = await b.db.from('sessions').update({ note: 'hacked' }).eq('id', sid).select();
    expect(upd.data).toEqual([]);
    const brk = await b.db.from('session_breaks').insert({ session_id: sid, kind: 'short' });
    expect(brk.error).not.toBeNull();
    const spoof = await b.db.from('sessions').insert({ user_id: a.id, course: 'X', mode: 'flow' });
    expect(spoof.error).not.toBeNull();
    const { data } = await a.db.from('sessions').select('note').eq('id', sid).single();
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

describe('sharing by handle', () => {
  it('shares nothing while sharing is off', async () => {
    expect((await anon.rpc('share_profile', { p_handle: 'alice' })).data).toEqual([]);
    expect((await anon.rpc('share_plan', { p_handle: 'alice' })).data).toEqual([]);
    expect((await anon.rpc('public_daily_totals', { p_handle: 'alice', days: 30 })).data).toEqual([]);
  });

  it("'runway' shares the plan only", async () => {
    await a.db.from('profiles').update({ share_level: 'runway' }).eq('id', a.id);
    const p = await anon.rpc('share_profile', { p_handle: 'Alice' });
    expect(p.data?.[0]).toMatchObject({ handle: 'alice', share_level: 'runway' });
    const plan = await anon.rpc('share_plan', { p_handle: 'alice' });
    expect(plan.data?.map((r) => r.title).sort()).toEqual(['Midterm 1', 'Practice problems']);
    expect(plan.data?.[0]).toMatchObject({ course: 'DSC 140A', color: 1 });
    expect((await anon.rpc('public_daily_totals', { p_handle: 'alice', days: 30 })).data).toEqual([]);
    const prep = await anon.rpc('public_prep_minutes', {
      p_handle: 'alice',
      p_exams: [{ course: 'DSC 140A', before: '2026-10-26T17:00:00-07:00' }],
    });
    expect(prep.data).toEqual([]);
  });

  it("'readiness' adds prep minutes, 'totals' adds daily totals in the person's timezone", async () => {
    await a.db.from('profiles').update({ share_level: 'readiness' }).eq('id', a.id);
    const prep = await anon.rpc('public_prep_minutes', {
      p_handle: 'alice',
      p_exams: [{ course: 'DSC 140A', before: '2026-10-26T17:00:00-07:00' }],
    });
    expect(prep.data?.[0]).toMatchObject({ course: 'DSC 140A', minutes: 112 }); // 60 + (60 − 3 paused − 5 break)
    expect((await anon.rpc('public_daily_totals', { p_handle: 'alice', days: 366 })).data).toEqual([]);

    await a.db.from('profiles').update({ share_level: 'totals', timezone: 'Asia/Tokyo' }).eq('id', a.id);
    const t = await anon.rpc('public_daily_totals', { p_handle: 'alice', days: 366 });
    // Days in Tokyo: 17:00Z on Oct 22 and 23 are the 23rd and 24th there; 16:00Z on Oct 25 is the 26th.
    expect(t.data).toEqual([
      { day: '2026-10-23', course: 'DSC 140A', minutes: 52 },
      { day: '2026-10-24', course: 'DSC 102', minutes: 50 },
      { day: '2026-10-26', course: 'DSC 140A', minutes: 60 },
    ]);
    await a.db.from('profiles').update({ share_level: 'off' }).eq('id', a.id);
  });

  it('never returns notes, phone data or other people', async () => {
    const fns = ['share_profile', 'share_plan'] as const;
    for (const fn of fns) {
      const r = await anon.rpc(fn, { p_handle: 'bobby' });
      expect(r.data).toEqual([]);
    }
  });
});

describe('deleting an account', () => {
  it('removes the person and everything they had', async () => {
    const c = await signedIn('carol@ucsd.edu');
    await c.db.from('courses').insert({ code: 'CSE 12', color: 2 });
    await c.db.from('sessions').insert({ course: 'CSE 12', mode: 'flow', note: 'secret' });
    const r = await c.db.rpc('delete_my_account');
    expect(r.error).toBeNull();
    const users = await admin.auth.admin.listUsers();
    expect(users.data.users.find((u) => u.id === c.id)).toBeUndefined();
    expect((await admin.from('courses').select('*').eq('user_id', c.id)).data).toEqual([]);
    expect((await admin.from('sessions').select('*').eq('user_id', c.id)).data).toEqual([]);
    expect((await admin.from('profiles').select('*').eq('id', c.id)).data).toEqual([]);
  });

  it('anonymous callers cannot delete anything', async () => {
    const r = await anon.rpc('delete_my_account');
    expect(r.error).not.toBeNull();
  });
});

describe('phone events', () => {
  it('only the service role writes them; the owner reads their own', async () => {
    const forged = await b.db
      .from('phone_events')
      .insert({ user_id: a.id, app: 'Instagram', kind: 'open' } as never);
    expect(forged.error).not.toBeNull();
    const ownInsert = await a.db
      .from('phone_events')
      .insert({ user_id: a.id, app: 'Instagram', kind: 'open' } as never);
    expect(ownInsert.error).not.toBeNull();
    await admin.from('phone_events').insert({ user_id: a.id, app: 'Instagram', kind: 'open' });
    expect((await a.db.from('phone_events').select('app')).data).toEqual([{ app: 'Instagram' }]);
    expect((await b.db.from('phone_events').select('app')).data).toEqual([]);
  });

  it('the rate counter is off limits to clients', async () => {
    const key = `test-${Date.now()}`; // fresh counter each run
    expect((await anon.rpc('phone_rate_hit', { p_token_hash: key })).error).not.toBeNull();
    expect((await a.db.rpc('phone_rate_hit', { p_token_hash: key })).error).not.toBeNull();
    expect((await admin.rpc('phone_rate_hit', { p_token_hash: key })).data).toBe(1);
    expect((await admin.rpc('phone_rate_hit', { p_token_hash: key })).data).toBe(2);
  });
});

describe('calendar sources', () => {
  let sourceA: string;

  it('schools are readable by anyone, and found by email domain', async () => {
    const { data } = await anon.from('schools').select('name, canvas_url').contains('domains', ['ucsd.edu']);
    expect(data).toEqual([{ name: 'UC San Diego', canvas_url: 'https://canvas.ucsd.edu' }]);
  });

  it('adding a source puts the address in Vault and never in a column', async () => {
    const r = await a.db.rpc('add_calendar_source', {
      p_kind: 'canvas',
      p_label: 'Canvas',
      p_url: 'webcal://canvas.ucsd.edu/feeds/calendars/user_abc123.ics',
    });
    expect(r.error).toBeNull();
    sourceA = r.data!.id;
    expect(r.data).toMatchObject({ kind: 'canvas', host: 'canvas.ucsd.edu', status: 'pending' });
    expect(JSON.stringify(r.data)).not.toContain('abc123');
    // The client can't read secret_id at all.
    const cols = await a.db.from('calendar_sources').select('id, host').eq('id', sourceA);
    expect(cols.data).toEqual([{ id: sourceA, host: 'canvas.ucsd.edu' }]);
    const secret = await a.db
      .from('calendar_sources')
      .select('secret_id' as never)
      .eq('id', sourceA);
    expect(secret.error).not.toBeNull();
    // The service role gets the address back, with webcal:// turned into https://.
    const url = await admin.rpc('source_url', { p_source: sourceA });
    expect(url.data).toBe('https://canvas.ucsd.edu/feeds/calendars/user_abc123.ics');
    expect((await a.db.rpc('source_url', { p_source: sourceA })).error).not.toBeNull();
  });

  it('rejects addresses that are cut off, not https, or not an address', async () => {
    for (const bad of [
      'https://calendar.google.com/calendar/ical/x%40gmail.com/private-abc/basic.ics…',
      'https://calendar.google.com/calendar/ical/x/private-abc/basic...',
      'ftp://x.example/a.ics',
      'not a url',
      'https://calendar.google.com/calendar/ical/x/pri vate/basic.ics',
    ]) {
      const r = await a.db.rpc('add_calendar_source', { p_kind: 'ical', p_label: 'x', p_url: bad });
      expect(r.error, bad).not.toBeNull();
    }
  });

  it("user B can't see, rename, sync or remove user A's source", async () => {
    expect((await b.db.from('calendar_sources').select('id, label')).data).toEqual([]);
    const upd = await b.db
      .from('calendar_sources')
      .update({ label: 'hacked' })
      .eq('id', sourceA)
      .select('id');
    expect(upd.data).toEqual([]);
    await b.db.rpc('request_sync', { p_source: sourceA });
    const del = await b.db.from('calendar_sources').delete().eq('id', sourceA).select('id');
    expect(del.data).toEqual([]);
    const still = await admin.from('calendar_sources').select('label').eq('id', sourceA).single();
    expect(still.data?.label).toBe('Canvas');
  });

  it('the person can rename it, but not change anything else', async () => {
    const ok = await a.db.from('calendar_sources').update({ label: 'My Canvas' }).eq('id', sourceA);
    expect(ok.error).toBeNull();
    const bad = await a.db
      .from('calendar_sources')
      .update({ status: 'ok' } as never)
      .eq('id', sourceA);
    expect(bad.error).not.toBeNull();
  });

  it('events from a sync are private, and only the override column is editable', async () => {
    const ev = await admin
      .from('events')
      .insert({
        user_id: a.id,
        source_id: sourceA,
        uid: 'e1',
        hash: 'h',
        title: 'HW 2 due [DSC 140A]',
        start_at: '2026-10-26T06:59:00Z',
        end_at: '2026-10-26T07:00:00Z',
        kind: 'deadline',
        course_code: 'DSC 140A',
        confidence: 0.9,
      })
      .select()
      .single();
    expect(ev.error).toBeNull();
    expect((await b.db.from('events').select('*')).data).toEqual([]);
    expect((await anon.from('events').select('id')).data ?? []).toEqual([]);
    const own = await a.db.from('events').select('title').eq('id', ev.data!.id);
    expect(own.data).toEqual([{ title: 'HW 2 due [DSC 140A]' }]);
    const ok = await a.db
      .from('events')
      .update({ override: { kind: 'personal' } })
      .eq('id', ev.data!.id);
    expect(ok.error).toBeNull();
    const bad = await a.db
      .from('events')
      .update({ kind: 'exam' } as never)
      .eq('id', ev.data!.id);
    expect(bad.error).not.toBeNull();
    const forged = await b.db.from('events').insert({
      user_id: a.id,
      source_id: sourceA,
      uid: 'x',
      hash: 'h',
      title: 'x',
      start_at: '2026-10-26T06:59:00Z',
      end_at: '2026-10-26T07:00:00Z',
    } as never);
    expect(forged.error).not.toBeNull();
  });

  it('finish_sync schedules the next run and backs off on failure', async () => {
    await admin.rpc('finish_sync', {
      p_source: sourceA,
      p_ok: false,
      p_error: 'HTTP 404',
      p_count: null as never,
      p_etag: null as never,
      p_last_modified: null as never,
    });
    let s = (await admin.from('calendar_sources').select('*').eq('id', sourceA).single()).data!;
    expect(s).toMatchObject({ status: 'error', last_error: 'HTTP 404', backoff_minutes: 30 });
    await admin.rpc('finish_sync', {
      p_source: sourceA,
      p_ok: true,
      p_error: null as never,
      p_count: 37,
      p_etag: 'W/"1"',
      p_last_modified: null as never,
    });
    s = (await admin.from('calendar_sources').select('*').eq('id', sourceA).single()).data!;
    expect(s).toMatchObject({
      status: 'ok',
      last_error: null,
      backoff_minutes: 15,
      event_count: 37,
      etag: 'W/"1"',
    });
    expect(Date.parse(s.next_sync_at)).toBeGreaterThan(Date.now() + 10 * 60_000);
    // Only due sources come back, and only to the service role.
    expect((await admin.rpc('due_sources', { p_limit: 10 })).data).toEqual([]);
    await a.db.rpc('request_sync', { p_source: sourceA });
    expect((await admin.rpc('due_sources', { p_limit: 10 })).data?.map((r) => r.id)).toEqual([sourceA]);
    expect((await a.db.rpc('due_sources', { p_limit: 10 })).error).not.toBeNull();
  });

  it('removing a source removes its events, plan items and Vault secret', async () => {
    const { data: secrets } = await admin.rpc('source_url', { p_source: sourceA });
    expect(secrets).toBeTruthy();
    const del = await a.db.from('calendar_sources').delete().eq('id', sourceA).select('id');
    expect(del.data).toHaveLength(1);
    expect((await admin.from('events').select('*').eq('source_id', sourceA)).data).toEqual([]);
    expect((await admin.rpc('source_url', { p_source: sourceA })).data).toBeNull();
  });

  it('an .ics upload source needs no address', async () => {
    const r = await a.db.rpc('add_calendar_source', {
      p_kind: 'ics_upload',
      p_label: 'export.ics',
      p_url: '',
    });
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ kind: 'ics_upload', status: 'ok', host: null });
    await a.db.from('calendar_sources').delete().eq('id', r.data!.id);
  });
});

describe('AI reading and budget', () => {
  it('readings are private; a person edits only the override', async () => {
    const src = await a.db.rpc('add_calendar_source', {
      p_kind: 'ical',
      p_label: 'G',
      p_url: 'https://x.example/a.ics',
    });
    const ev = await admin
      .from('events')
      .insert({
        user_id: a.id,
        source_id: src.data!.id,
        uid: 'ai1',
        hash: 'h',
        title: '📚 140A practice',
        start_at: '2026-10-22T16:00:00Z',
        end_at: '2026-10-22T18:00:00Z',
        kind: 'study',
        confidence: 0.6,
        ai_hash: 'h',
        ai_kind: 'study',
        ai_course_code: 'DSC 140A',
        ai_reason: 'books emoji',
      })
      .select('id')
      .single();
    expect(ev.error).toBeNull();
    const own = await a.db
      .from('events')
      .select('ai_kind, ai_course_code, ai_reason')
      .eq('id', ev.data!.id)
      .single();
    expect(own.data).toEqual({ ai_kind: 'study', ai_course_code: 'DSC 140A', ai_reason: 'books emoji' });
    expect((await b.db.from('events').select('ai_kind').eq('id', ev.data!.id)).data).toEqual([]);
    const bad = await a.db
      .from('events')
      .update({ ai_kind: 'exam' } as never)
      .eq('id', ev.data!.id);
    expect(bad.error).not.toBeNull();
    await a.db.from('calendar_sources').delete().eq('id', src.data!.id);
  });

  it('config and usage are off limits; the budget functions run as the service role only', async () => {
    expect((await a.db.from('app_config').select('*')).data ?? []).toEqual([]);
    expect((await anon.from('app_config').select('*')).data ?? []).toEqual([]);
    expect((await a.db.rpc('ai_budget', { p_user: a.id })).error).not.toBeNull();
    expect(
      (await a.db.rpc('ai_record', { p_user: a.id, p_input: 1, p_cached: 0, p_output: 1, p_cents: 1 })).error,
    ).not.toBeNull();
    const budget = (await admin.rpc('ai_budget', { p_user: a.id })).data![0];
    expect(budget).toMatchObject({ enabled: true });
    expect(Number(budget.user_left)).toBe(200);
    await admin.rpc('ai_record', {
      p_user: a.id,
      p_input: 1000,
      p_cached: 500,
      p_output: 100,
      p_cents: 0.75,
    });
    await admin.rpc('ai_record', {
      p_user: a.id,
      p_input: 1000,
      p_cached: 500,
      p_output: 100,
      p_cents: 0.25,
    });
    const after = (await admin.rpc('ai_budget', { p_user: a.id })).data![0];
    expect(Number(after.user_left)).toBe(199);
    expect(Number(after.global_left)).toBe(4999);
    // The person sees their own total and the cap, and nobody else's.
    const mine = (await a.db.rpc('my_ai_usage')).data![0];
    expect(mine).toMatchObject({ calls: 2 });
    expect(Number(mine.cents)).toBe(1);
    expect(Number(mine.cap_cents)).toBe(200);
    expect((await b.db.from('ai_usage').select('*')).data).toEqual([]);
    expect(Number((await b.db.rpc('my_ai_usage')).data![0].cents)).toBe(0);
  });

  it("a person can rename and recolor their courses, but not someone else's", async () => {
    const c = await a.db.from('courses').insert({ code: 'COGS 1', color: 3 }).select('id').single();
    const ok = await a.db
      .from('courses')
      .update({ name: 'Intro to Cognitive Science', color: 4 })
      .eq('id', c.data!.id);
    expect(ok.error).toBeNull();
    const other = await b.db.from('courses').update({ name: 'x' }).eq('id', c.data!.id).select('id');
    expect(other.data).toEqual([]);
  });
});

describe('app secrets', () => {
  it('only the service role can set or read them, and they live in Vault', async () => {
    expect((await a.db.rpc('set_app_secret', { p_name: 'SYNC_KEY', p_value: 'x' })).error).not.toBeNull();
    expect((await anon.rpc('app_secret', { p_name: 'SYNC_KEY' })).error).not.toBeNull();
    expect((await admin.rpc('set_app_secret', { p_name: 'TEST_KEY', p_value: 'first' })).error).toBeNull();
    expect((await admin.rpc('app_secret', { p_name: 'TEST_KEY' })).data).toBe('first');
    expect((await admin.rpc('set_app_secret', { p_name: 'TEST_KEY', p_value: 'second' })).error).toBeNull();
    expect((await admin.rpc('app_secret', { p_name: 'TEST_KEY' })).data).toBe('second');
    expect((await admin.rpc('app_secret', { p_name: 'NOPE' })).data).toBeNull();
    expect((await admin.rpc('set_app_secret', { p_name: 'bad name', p_value: 'x' })).error).not.toBeNull();
  });
});
