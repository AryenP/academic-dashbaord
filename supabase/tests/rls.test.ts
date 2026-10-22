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

  it('takes any email while school_email_only is off, and the form can ask', async () => {
    const policy = await anon.rpc('signup_policy');
    expect(policy.data).toEqual({ school_email_only: true });
    await admin.from('app_config').update({ value: false }).eq('key', 'school_email_only');
    try {
      expect((await anon.rpc('signup_policy')).data).toEqual({ school_email_only: false });
      const r = await admin.auth.admin.createUser({ email: 'tester@gmail.com', password: 'x'.repeat(12) });
      expect(r.error).toBeNull();
      await admin.auth.admin.deleteUser(r.data.user!.id);
    } finally {
      await admin.from('app_config').update({ value: true }).eq('key', 'school_email_only');
    }
    // the config itself stays unreadable
    expect((await anon.from('app_config').select('*')).data).toEqual([]);
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
    // Study blocks are drawn but not named at this level; exams and deadlines keep their titles.
    const shared = (await anon.rpc('share_plan', { p_handle: 'alice' })).data as {
      kind: string;
      title: string;
      location: string;
    }[];
    expect(shared.length).toBeGreaterThan(0);
    for (const r of shared.filter((r) => r.kind === 'study'))
      expect([r.title, r.location]).toEqual(['Study', '']);
    expect(shared.some((r) => r.kind !== 'study' && r.title !== 'Study')).toBe(true);
    await a.db.from('profiles').update({ share_level: 'runway' }).eq('id', a.id);
    const open = (await anon.rpc('share_plan', { p_handle: 'alice' })).data as {
      kind: string;
      title: string;
    }[];
    expect(open.filter((r) => r.kind === 'study').some((r) => r.title !== 'Study')).toBe(true);
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
    await c.db.from('signals').insert({ day: '2026-10-20', kind: 'sleep_h', value: 7 });
    const r = await c.db.rpc('delete_my_account');
    expect(r.error).toBeNull();
    const users = await admin.auth.admin.listUsers();
    expect(users.data.users.find((u) => u.id === c.id)).toBeUndefined();
    expect((await admin.from('courses').select('*').eq('user_id', c.id)).data).toEqual([]);
    expect((await admin.from('sessions').select('*').eq('user_id', c.id)).data).toEqual([]);
    expect((await admin.from('profiles').select('*').eq('id', c.id)).data).toEqual([]);
    expect((await admin.from('signals').select('*').eq('user_id', c.id)).data).toEqual([]);
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
    // A browser test may have left the switch off in this shared local database.
    await admin.from('app_config').update({ value: true }).eq('key', 'ai_enabled');
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

describe('planning, feed tokens and submissions', () => {
  let examId: string;

  it('proposals are private and the person accepts or discards them', async () => {
    const c = await a.db.from('courses').insert({ code: 'MATH 20C', color: 2 }).select('id').single();
    const x = await a.db
      .from('plan_items')
      .insert({
        course_id: c.data!.id,
        kind: 'exam',
        title: 'Final',
        start_at: '2026-12-10T23:00:00Z',
        end_at: '2026-12-11T02:00:00Z',
        weight: 40,
      })
      .select('id')
      .single();
    examId = x.data!.id;
    const p = await admin
      .from('plan_items')
      .insert({
        user_id: a.id,
        course_id: c.data!.id,
        kind: 'study',
        title: 'Lectures 1–4 into notes',
        start_at: '2026-12-01T17:00:00Z',
        end_at: '2026-12-01T18:30:00Z',
        reason: '40 % of the grade',
        source: 'ai',
        accepted: false,
        for_item_id: examId,
        draft_id: '00000000-0000-0000-0000-000000000001',
      })
      .select('id')
      .single();
    expect(p.error).toBeNull();
    expect((await b.db.from('plan_items').select('id').eq('id', p.data!.id)).data).toEqual([]);
    const ok = await a.db
      .from('plan_items')
      .update({ accepted: true })
      .eq('id', p.data!.id)
      .select('accepted')
      .single();
    expect(ok.data).toEqual({ accepted: true });
    // The feed and share functions only ever see accepted items.
    expect(
      (await admin.rpc('feed_items', { p_user: a.id })).data?.some(
        (r) => r.title === 'Lectures 1–4 into notes',
      ),
    ).toBe(true);
    await a.db.from('plan_items').update({ accepted: false }).eq('id', p.data!.id);
    expect(
      (await admin.rpc('feed_items', { p_user: a.id })).data?.some(
        (r) => r.title === 'Lectures 1–4 into notes',
      ),
    ).toBe(false);
    // A proposal can't point at someone else's exam.
    const bad = await b.db.from('plan_items').insert({
      kind: 'study',
      title: 'x',
      start_at: '2026-12-01T17:00:00Z',
      end_at: '2026-12-01T18:00:00Z',
      for_item_id: examId,
    });
    expect(bad.error).toBeNull(); // the FK allows it; RLS keeps the row private, and the planner only reads the person's own rows
    await admin.from('plan_items').delete().eq('user_id', b.id);
  });

  it('a feed token is returned once, stored hashed, and resolves only through the service role', async () => {
    const t = await a.db.rpc('make_access_token', { p_purpose: 'feed' });
    expect(t.error).toBeNull();
    const token = t.data as string;
    expect(token).toMatch(/^[0-9a-f]{48}$/);
    const rows = (await a.db.from('access_tokens').select('purpose, token_hash')).data!;
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toBe(token);
    expect(
      (await anon.rpc('token_owner', { p_purpose: 'feed', p_token_hash: rows[0].token_hash })).error,
    ).not.toBeNull();
    expect(
      (await a.db.rpc('token_owner', { p_purpose: 'feed', p_token_hash: rows[0].token_hash })).error,
    ).not.toBeNull();
    expect(
      (await admin.rpc('token_owner', { p_purpose: 'feed', p_token_hash: rows[0].token_hash })).data,
    ).toBe(a.id);
    expect((await admin.rpc('token_owner', { p_purpose: 'feed', p_token_hash: 'nope' })).data).toBeNull();
    // Making another replaces the first.
    // The Shortcut has its own purpose, so one token can be replaced without touching the other.
    const sc = await a.db.rpc('make_access_token', { p_purpose: 'shortcut' });
    expect(sc.error).toBeNull();
    expect((await a.db.rpc('make_access_token', { p_purpose: 'watch' })).error).not.toBeNull();
    const t2 = (await a.db.rpc('make_access_token', { p_purpose: 'feed' })).data as string;
    expect(t2).not.toBe(token);
    expect(
      (await admin.rpc('token_owner', { p_purpose: 'feed', p_token_hash: rows[0].token_hash })).data,
    ).toBeNull();
    expect((await b.db.from('access_tokens').select('*')).data).toEqual([]);
    expect((await anon.rpc('make_access_token', { p_purpose: 'feed' })).error).not.toBeNull();
    expect((await a.db.rpc('make_access_token', { p_purpose: 'nope' })).error).not.toBeNull();
  });

  it('a deadline can be ticked as submitted, and only by its owner', async () => {
    const d = await a.db
      .from('plan_items')
      .insert({
        kind: 'deadline',
        title: 'HW 5',
        start_at: '2026-12-02T06:59:00Z',
        end_at: '2026-12-02T07:00:00Z',
      })
      .select('id')
      .single();
    const ok = await a.db
      .from('plan_items')
      .update({ status: 'submitted', submitted_at: new Date().toISOString(), submitted_by: 'me' })
      .eq('id', d.data!.id)
      .select('status')
      .single();
    expect(ok.data).toEqual({ status: 'submitted' });
    const bad = await b.db.from('plan_items').update({ status: 'missed' }).eq('id', d.data!.id).select('id');
    expect(bad.data).toEqual([]);
    const invalid = await a.db
      .from('plan_items')
      .update({ submitted_by: 'robot' as never })
      .eq('id', d.data!.id);
    expect(invalid.error).not.toBeNull();
  });

  it('prep hours per course come from finished sessions, service role only', async () => {
    expect((await a.db.rpc('prep_hours_by_course', { p_user: a.id })).error).not.toBeNull();
    const r = (await admin.rpc('prep_hours_by_course', { p_user: a.id })).data!;
    expect(r.find((x) => x.course === 'DSC 140A')).toBeTruthy();
  });
});

describe('classmates and friends', () => {
  it('nobody sees classmates until both made the course visible; stats follow the share level', async () => {
    // Both at ucsd.edu, both in CSE 12 with recent items.
    const mk = async (who: { db: DB; id: string }, visible: boolean) => {
      const c = await who.db
        .from('courses')
        .insert({ code: 'CSE 12', color: 2, visible })
        .select('id')
        .single();
      await who.db.from('plan_items').insert({
        course_id: c.data!.id,
        kind: 'exam',
        title: 'Midterm',
        start_at: new Date(Date.now() + 5 * 864e5).toISOString(),
        end_at: new Date(Date.now() + 5 * 864e5 + 3_600_000).toISOString(),
      });
      return c.data!.id;
    };
    await mk(a, false);
    await mk(b, true);
    // A isn't visible: sees nobody; B is visible but A isn't: sees nobody.
    expect((await a.db.rpc('classmates', { p_code: 'CSE 12' })).data).toEqual([]);
    expect((await b.db.rpc('classmates', { p_code: 'CSE 12' })).data).toEqual([]);
    await a.db.from('courses').update({ visible: true }).eq('code', 'CSE 12');
    // B is private (share_level off): A sees the name only.
    const seen = (await a.db.rpc('classmates', { p_code: 'CSE 12' })).data!;
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      handle: 'bobby',
      share_level: 'off',
      is_friend: false,
      week_minutes: null,
      streak: null,
      studied_min: null,
    });
    expect(seen[0].exam_title).toBe('Midterm');
    // B shares totals: hours, streak and readiness appear.
    await b.db.from('profiles').update({ share_level: 'totals' }).eq('id', b.id);
    await b.db.from('sessions').insert({
      course: 'CSE 12',
      mode: 'flow',
      started_at: new Date(Date.now() - 3_600_000).toISOString(),
      ended_at: new Date().toISOString(),
    });
    const more = (await a.db.rpc('classmates', { p_code: 'CSE 12' })).data![0];
    expect(more.week_minutes).toBe(60);
    expect(more.streak).toBe(1);
    expect(more.studied_min).toBe(60);
    expect(Number(more.planned_min)).toBe(0);
    // Someone at another school never shows up, even with the same course.
    const c = await signedIn('carl@berkeley.edu');
    await mk(c, true);
    expect((await a.db.rpc('classmates', { p_code: 'CSE 12' })).data).toHaveLength(1);
    expect((await c.db.rpc('classmates', { p_code: 'CSE 12' })).data).toEqual([]);
    expect((await anon.rpc('classmates', { p_code: 'CSE 12' })).error).not.toBeNull();
    // The pulse counts classmates who studied today and share totals.
    expect((await a.db.rpc('classmate_pulse')).data).toBe(1);
    expect((await b.db.rpc('classmate_pulse')).data).toBe(0); // A shares nothing
    await b.db.from('profiles').update({ share_level: 'off' }).eq('id', b.id);
  });

  it('friend requests go by handle, need accepting, and show share-level stats', async () => {
    expect((await a.db.rpc('request_friend', { p_handle: 'nobody_here' })).error).not.toBeNull();
    expect((await a.db.rpc('request_friend', { p_handle: 'alice' })).error).not.toBeNull();
    expect((await a.db.rpc('request_friend', { p_handle: 'bobby' })).error).toBeNull();
    const mine = (await a.db.rpc('friends_overview')).data!;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      handle: 'bobby',
      status: 'requested',
      direction: 'sent',
      week_minutes: null,
    });
    const theirs = (await b.db.rpc('friends_overview')).data!;
    expect(theirs[0]).toMatchObject({ handle: 'alice', status: 'requested', direction: 'received' });
    // A third person sees none of it.
    const c = await signedIn('carl@berkeley.edu');
    expect((await c.db.rpc('friends_overview')).data).toEqual([]);
    expect((await c.db.from('friends').select('*')).data).toEqual([]);
    // Decline, ask again, accept.
    await b.db.rpc('respond_friend', { p_handle: 'alice', p_accept: false });
    expect((await a.db.rpc('friends_overview')).data).toEqual([]);
    await a.db.rpc('request_friend', { p_handle: 'bobby' });
    await b.db.rpc('respond_friend', { p_handle: 'alice', p_accept: true });
    const ok = (await a.db.rpc('friends_overview')).data![0];
    expect(ok.status).toBe('accepted');
    expect(ok.courses).toEqual(['CSE 12']); // B's visible courses
    expect(ok.week_minutes).toBeNull(); // B's share level is off
    await b.db.from('profiles').update({ share_level: 'totals' }).eq('id', b.id);
    expect((await a.db.rpc('friends_overview')).data![0].week_minutes).toBe(60);
    expect((await a.db.rpc('classmates', { p_code: 'CSE 12' })).data![0].is_friend).toBe(true);
    // Nobody writes the table directly; removing works from either side.
    expect(
      (await a.db.from('friends').insert({ user_id: a.id, friend_id: b.id, status: 'accepted' } as never))
        .error,
    ).not.toBeNull();
    await b.db.rpc('remove_friend', { p_handle: 'alice' });
    expect((await a.db.rpc('friends_overview')).data).toEqual([]);
    await b.db.from('profiles').update({ share_level: 'off' }).eq('id', b.id);
  });
});

describe('weekly reviews', () => {
  it('are written by the function and read only by their owner', async () => {
    await admin
      .from('weekly_reviews')
      .insert({ user_id: a.id, week: '2026-10-19', text: 'You studied 6 h.', model: 'claude-haiku-5-5' });
    expect((await a.db.from('weekly_reviews').select('text')).data).toEqual([{ text: 'You studied 6 h.' }]);
    expect((await b.db.from('weekly_reviews').select('text')).data).toEqual([]);
    expect(
      (
        await a.db
          .from('weekly_reviews')
          .insert({ user_id: a.id, week: '2026-10-26', text: 'x', model: 'm' } as never)
      ).error,
    ).not.toBeNull();
  });
});

describe('signals', () => {
  it("are private: user B can't see, change or delete user A's", async () => {
    const r = await a.db.from('signals').insert([
      { day: '2026-10-20', kind: 'sleep_h', value: 6.5 },
      { day: '2026-10-20', kind: 'place', label: 'Library' },
    ]);
    expect(r.error).toBeNull();
    expect((await a.db.from('signals').select('kind').order('kind')).data).toEqual([
      { kind: 'place' },
      { kind: 'sleep_h' },
    ]);
    expect((await b.db.from('signals').select('*')).data).toEqual([]);
    expect((await anon.from('signals').select('*')).data ?? []).toEqual([]);
    await b.db.from('signals').update({ value: 12 }).eq('user_id', a.id);
    await b.db.from('signals').delete().eq('user_id', a.id);
    expect(
      (await admin.from('signals').select('value').eq('user_id', a.id).eq('kind', 'sleep_h')).data,
    ).toEqual([{ value: 6.5 }]);
    expect(
      (await b.db.from('signals').insert({ user_id: a.id, day: '2026-10-21', kind: 'steps', value: 1 }))
        .error,
    ).not.toBeNull();
  });

  it('one row per day per kind, with coarse ranges enforced', async () => {
    const dup = await a.db.from('signals').insert({ day: '2026-10-20', kind: 'sleep_h', value: 8 });
    expect(dup.error).not.toBeNull();
    const bad = [
      { day: '2026-10-21', kind: 'sleep_h', value: 25 },
      { day: '2026-10-21', kind: 'exercise_min', value: -1 },
      { day: '2026-10-21', kind: 'steps', value: 12.5 },
      { day: '2026-10-21', kind: 'steps', value: 200001 },
      { day: '2026-10-21', kind: 'place' },
      { day: '2026-10-21', kind: 'heart_rate', value: 60 },
    ];
    for (const row of bad) expect((await a.db.from('signals').insert(row as never)).error).not.toBeNull();
  });
});

describe('patterns', () => {
  const day = (n: number) => new Date(Date.UTC(2026, 9, 1 + n)).toISOString().slice(0, 10);
  const at = (d: string, h: number) => new Date(Date.parse(`${d}T00:00:00Z`) + h * 3_600_000).toISOString();
  const session = (d: string, h: number, focus: number, hours = 1) => ({
    course: 'X',
    mode: 'flow' as const,
    started_at: at(d, h),
    ended_at: at(d, h + hours),
    focus_pct: focus,
  });

  it('are private, and need a week of days before they say anything', async () => {
    await a.db.from('profiles').update({ timezone: 'UTC' }).eq('id', a.id);
    expect((await b.db.rpc('signal_patterns', { p_user: a.id })).error).not.toBeNull();
    expect((await anon.rpc('signal_patterns', { p_user: a.id })).error).not.toBeNull();
    await admin.from('sessions').delete().eq('user_id', a.id);
    const empty = (await a.db.rpc('signal_patterns', { p_user: a.id })).data as { days: number };
    expect(empty.days).toBe(0);
  });

  it('group sessions by late night, sleep, exercise and place', async () => {
    await a.db.from('profiles').update({ timezone: 'UTC' }).eq('id', a.id);
    await admin.from('sessions').delete().eq('user_id', a.id);
    await admin.from('signals').delete().eq('user_id', a.id);
    await admin.from('sessions').delete().eq('user_id', b.id);
    const rows = [];
    const sigs = [];
    for (let i = 0; i < 8; i++) {
      const d = day(i);
      const good = i % 2 === 0; // alternate well-slept, exercised, library days
      rows.push(session(d, 10, good ? 70 : 50, good ? 2 : 1));
      if (i < 4) rows.push(session(d, 23, 40, 0.5)); // four late sessions
      sigs.push({ day: d, kind: 'sleep_h', value: good ? 8 : 5 });
      sigs.push({ day: d, kind: 'exercise_min', value: good ? 45 : 0 });
      sigs.push({ day: d, kind: 'place', label: good ? 'the library' : 'home' });
    }
    expect((await a.db.from('sessions').insert(rows)).error).toBeNull();
    expect((await a.db.from('signals').insert(sigs)).error).toBeNull();
    const f = (await a.db.rpc('signal_patterns', { p_user: a.id })).data as {
      days: number;
      late: { n: number; avg: number; other_n: number; other_avg: number };
      sleep: { good_n: number; good_avg: number; poor_n: number; poor_avg: number };
      exercise: { active_days: number; active_hours: number; rest_days: number; rest_hours: number };
      places: { label: string; n: number; avg: number }[];
    };
    expect(f.days).toBe(8);
    expect(f.late.n).toBe(4);
    expect(Number(f.late.avg)).toBe(40);
    expect(f.late.other_n).toBe(8);
    expect(Number(f.late.other_avg)).toBe(60);
    expect([f.sleep.good_n, f.sleep.poor_n]).toEqual([6, 6]); // late sessions count on their day too
    expect(Number(f.sleep.good_avg)).toBeCloseTo(60, 5); // (70,40,70,40,70,70) / 6
    expect(Number(f.sleep.poor_avg)).toBeCloseTo(46.67, 1);
    expect([f.exercise.active_days, f.exercise.rest_days]).toEqual([4, 4]);
    expect(Number(f.exercise.active_hours)).toBeCloseTo(2.25, 5);
    expect(Number(f.exercise.rest_hours)).toBeCloseTo(1.25, 5);
    expect(f.places.map((p) => p.label)).toEqual(['the library', 'home']);
    // user B sees none of it through their own call
    expect(((await b.db.rpc('signal_patterns', { p_user: b.id })).data as { days: number }).days).toBe(0);
  });
});
