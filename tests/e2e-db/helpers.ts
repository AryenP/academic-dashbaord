import type { Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import type { Database } from '../../src/lib/database.types';

const status = JSON.parse(
  execSync('supabase status -o json', { stdio: ['ignore', 'pipe', 'ignore'] }).toString(),
);
export const API_URL: string = status.API_URL;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
export const admin = createClient<Database>(API_URL, status.SERVICE_ROLE_KEY, opts);

export const OWNER = 'owner@runway.test';
const PASSWORD = 'test-password-123';

/** A clean database with one owner account. Returns the owner's id. */
export async function resetDb(): Promise<string> {
  const { data } = await admin.auth.admin.listUsers();
  for (const u of data.users) await admin.auth.admin.deleteUser(u.id);
  const { data: c } = await admin.auth.admin.createUser({
    email: OWNER,
    password: PASSWORD,
    email_confirm: true,
  });
  return c.user!.id;
}

/** Signs the browser in as the owner by placing a real session where supabase-js keeps it. */
export async function signIn(page: Page) {
  const client = createClient<Database>(API_URL, status.ANON_KEY, opts);
  const { data, error } = await client.auth.signInWithPassword({ email: OWNER, password: PASSWORD });
  if (error) throw error;
  const key = `sb-${new URL(API_URL).hostname.split('.')[0]}-auth-token`;
  await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [key, JSON.stringify(data.session)]);
}

const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

/** Inserts a session as the service role, e.g. one that started 26 minutes ago. */
export async function seedSession(
  userId: string,
  over: Partial<Database['public']['Tables']['sessions']['Insert']> & {
    startedMinAgo?: number;
    lengthMin?: number;
  },
) {
  const { startedMinAgo = 30, lengthMin, ...rest } = over;
  const { data, error } = await admin
    .from('sessions')
    .insert({
      user_id: userId,
      course: 'DSC 140A',
      mode: 'pomodoro',
      started_at: minsAgo(startedMinAgo),
      ended_at: lengthMin == null ? null : minsAgo(startedMinAgo - lengthMin),
      ...rest,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
