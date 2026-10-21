import { useEffect, useState } from 'react';
import { useAuth } from './auth';
import { supabase, type PhoneEvent } from './supabase';

// Phone tracking: the personal token iPhone Shortcuts send, and live phone events.

export const SUGGESTED_APPS = [
  'Instagram',
  'TikTok',
  'YouTube',
  'Snapchat',
  'X',
  'Reddit',
  'Messages',
  'Safari',
];

export const PHONE_ENDPOINT = supabase
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/phone-event`
  : 'https://<your-project>.supabase.co/functions/v1/phone-event';

// The token is shown once, right after it's made. It lives only in memory for this tab, so the
// setup guide can fill it in; the database keeps only its hash.
let fresh: string | null = null;
export const freshToken = {
  get: () => fresh,
  set: (t: string | null) => {
    fresh = t;
  },
};

/** A new random token: 32 bytes, URL-safe. Only its sha256 is stored. */
export function newToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return (
    'rw_' +
    btoa(String.fromCharCode(...b))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  );
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** JSON body a Shortcut sends. `token` is shown as a placeholder unless the real one is known. */
export const shortcutBody = (kind: string, app: string | null, token: string | null) =>
  JSON.stringify(app ? { token: token ?? 'YOUR_TOKEN', app, kind } : { token: token ?? 'YOUR_TOKEN', kind });

/**
 * Phone events from `sinceIso` on, live: loads what's there, then appends inserts as they arrive.
 * Pass null to stay idle.
 */
export function usePhoneEvents(sinceIso: string | null): PhoneEvent[] {
  const { user } = useAuth();
  const [events, setEvents] = useState<PhoneEvent[]>([]);

  useEffect(() => {
    if (!supabase || !user || !sinceIso) return;
    const db = supabase;
    let alive = true;
    db.from('phone_events')
      .select('*')
      .gte('at', sinceIso)
      .order('at')
      .then(({ data }) => alive && setEvents(data ?? []));
    const ch = db
      .channel(`phone-${user.id}-${sinceIso}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'phone_events', filter: `user_id=eq.${user.id}` },
        (p) =>
          alive && setEvents((xs) => (xs.some((x) => x.id === p.new.id) ? xs : [...xs, p.new as PhoneEvent])),
      )
      .subscribe();
    return () => {
      alive = false;
      db.removeChannel(ch);
    };
  }, [user, sinceIso]);

  return sinceIso ? events : [];
}
