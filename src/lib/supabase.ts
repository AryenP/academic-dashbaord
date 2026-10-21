import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// Both values are public by design: what visitors can read is decided by Row Level Security.
// Without them (a fresh clone, or before the backend is set up) the app runs read-only: the runway
// still works, and sign-in, sessions and stats say they need the backend.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient<Database> | null =
  url && anonKey
    ? createClient<Database>(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
      })
    : null;

export const hasBackend = supabase !== null;

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type Session = Tables<'sessions'>;
export type SessionBreak = Tables<'session_breaks'>;
export type PhoneEvent = Tables<'phone_events'>;
export type Profile = Tables<'profiles'>;
