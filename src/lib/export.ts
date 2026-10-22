// "Download my data": everything Runway holds about the signed-in person, as one JSON file, read
// from the browser under Row Level Security. Secrets stay out: no token hashes, no calendar
// addresses (those never come back to the browser anyway).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export const EXPORT_KEYS = [
  'profile',
  'courses',
  'calendar_sources',
  'events',
  'plan_items',
  'sessions',
  'session_breaks',
  'phone_events',
  'signals',
  'weekly_reviews',
  'friends',
  'access_tokens',
  'ai_usage',
] as const;

export type Export = { exported_at: string; app: 'runway'; version: 1 } & Record<
  (typeof EXPORT_KEYS)[number],
  unknown
>;

type Db = SupabaseClient<Database>;

/** Every row that is the person's own, table by table. Throws on the first error. */
export async function collectMyData(db: Db, userId: string): Promise<Export> {
  const must = <T>(r: { data: T | null; error: { message: string } | null }): T => {
    if (r.error) throw new Error(r.error.message);
    return r.data as T;
  };
  const all = async <T extends keyof Database['public']['Tables']>(table: T, columns = '*') =>
    must(await db.from(table).select(columns).limit(10000));
  const profile = must(
    await db
      .from('profiles')
      .select(
        'id, display_name, handle, timezone, share_level, school_domain, settings, onboarding, created_at',
      )
      .eq('id', userId)
      .maybeSingle(),
  );
  return {
    exported_at: new Date().toISOString(),
    app: 'runway',
    version: 1,
    profile,
    courses: await all('courses'),
    calendar_sources: await all(
      'calendar_sources',
      'id, kind, label, host, status, last_synced_at, last_error, event_count, created_at',
    ),
    events: await all(
      'events',
      'id, source_id, title, start_at, end_at, all_day, location, kind, course_code, confidence, override, ai_kind, ai_course_code, ai_course_name, ai_confidence, ai_reason, first_seen_at, deleted_at',
    ),
    plan_items: await all('plan_items'),
    sessions: await all('sessions'),
    session_breaks: await all('session_breaks'),
    phone_events: await all('phone_events'),
    signals: await all('signals'),
    weekly_reviews: await all('weekly_reviews'),
    friends: await all('friends', 'user_id, friend_id, status, created_at'),
    access_tokens: await all('access_tokens', 'purpose, created_at, last_used_at'),
    ai_usage: await all('ai_usage'),
  };
}

/** `runway-<handle>-<YYYY-MM-DD>.json`, the date in the person's own day. */
export function exportFilename(handle: string | null | undefined, now = new Date()): string {
  const d = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  const who = (handle ?? '').replace(/[^a-z0-9_]/gi, '') || 'me';
  return `runway-${who}-${d}.json`;
}

/** Hands the browser a file to save. */
export function saveJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
