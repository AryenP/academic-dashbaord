import type { User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase, type Profile } from './supabase';

export interface Settings {
  break_mode?: string;
  custom_work_min?: number;
  custom_break_min?: number;
  auto_break?: boolean;
  break_notify?: boolean;
  distracting_apps?: string[];
  focus_playlist?: { uri: string; name: string } | null;
  break_playlist?: { uri: string; name: string } | null;
  cues?: {
    start?: boolean;
    break?: boolean;
    resume?: boolean;
    end?: boolean;
    break_action?: 'playlist' | 'pause';
  };
  embed_playlist?: string | null;
  planning?: {
    hours_per_day?: number;
    earliest?: string;
    latest?: string;
    block_min?: number;
    days_off?: number[];
  };
}

interface AuthValue {
  ready: boolean;
  user: User | null;
  profile: Profile | null;
  settings: Settings;
  signIn(email: string): Promise<string | null>;
  signOut(): Promise<void>;
  updateProfile(
    patch: Partial<
      Pick<
        Profile,
        'display_name' | 'handle' | 'timezone' | 'share_level' | 'onboarding' | 'phone_token_hash'
      >
    >,
  ): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!supabase);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!supabase) return;
    // getSession can hang: a refresh that never returns, or the cross-tab lock held by a stuck
    // tab. The app must not wait on it forever, so after a few seconds it opens as signed out and
    // catches up through onAuthStateChange if the session turns up later.
    const giveUp = setTimeout(() => {
      console.warn('Runway: the session check is taking too long; opening signed out for now.');
      setReady(true);
    }, 4000);
    supabase.auth
      .getSession()
      .then(({ data }) => setUser(data.session?.user ?? null))
      .catch(() => setUser(null))
      .finally(() => {
        clearTimeout(giveUp);
        setReady(true);
      });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => {
      clearTimeout(giveUp);
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !user) return;
    let alive = true;
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
      .then(({ data }) => alive && setProfile(data));
    return () => {
      alive = false;
    };
  }, [user]);

  const signIn = useCallback(async (email: string) => {
    if (!supabase) return 'The backend is not set up yet.';
    // Back to the site root after the link is clicked; PKCE puts the code in the query string,
    // which leaves the hash route alone.
    const emailRedirectTo = `${location.origin}${import.meta.env.BASE_URL}`;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } });
    return error ? error.message : null;
  }, []);

  const signOut = useCallback(async () => {
    // This device only: signing out here must not kill the session in another browser.
    await supabase?.auth.signOut({ scope: 'local' });
  }, []);

  const updateProfile = useCallback<AuthValue['updateProfile']>(
    async (patch) => {
      if (!supabase || !user) return;
      const { data, error } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', user.id)
        .select()
        .single();
      if (error) throw error;
      setProfile(data);
    },
    [user],
  );

  const updateSettings = useCallback<AuthValue['updateSettings']>(
    async (patch) => {
      if (!supabase || !user) return;
      const next = { ...((profile?.settings as Settings) ?? {}), ...patch };
      setProfile((p) => (p ? { ...p, settings: next as unknown as Profile['settings'] } : p)); // optimistic
      const { error } = await supabase
        .from('profiles')
        .update({ settings: next as unknown as Profile['settings'] })
        .eq('id', user.id);
      if (error) throw error;
    },
    [user, profile],
  );

  // A profile left over from a previous sign-in never shows for the next one.
  const current = user && profile?.id === user.id ? profile : null;
  const settings = (current?.settings as Settings) ?? {};
  return (
    <AuthContext.Provider
      value={{ ready, user, profile: current, settings, signIn, signOut, updateProfile, updateSettings }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth needs <AuthProvider>');
  return v;
}
