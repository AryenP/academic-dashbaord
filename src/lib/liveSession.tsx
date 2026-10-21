import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './auth';
import { supabase, type Session, type SessionBreak } from './supabase';
import type { BreakKind, Mode } from './timer';

// The live session, shared by every view (focus screen, header, runway). The database is the source
// of truth: actions call the session functions, and Realtime pushes changes made on other devices
// (or by the phone's "Start studying" Shortcut) so the phone and laptop always show the same thing.

interface LiveValue {
  loading: boolean;
  session: Session | null; // the unfinished session, if any
  breaks: SessionBreak[];
  ended: Session | null; // just ended, waiting for rating/note on the end screen
  error: string | null;
  /** Server clock minus this device's clock, in ms. Timers add it to Date.now(). */
  skewMs: number;
  start(input: { course: string; plan_block_id: string | null; mode: Mode }): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  startBreak(kind: BreakKind): Promise<void>;
  endBreak(): Promise<void>;
  end(): Promise<Session | null>;
  finish(patch: { rating: number | null; note: string | null; metrics?: Partial<Session> }): Promise<void>;
  discard(): Promise<void>;
  clearEnded(): void;
}

const LiveContext = createContext<LiveValue | null>(null);
const ENDED_KEY = 'runway.endedSession';

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v == null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      // storage blocked: the end screen just won't survive a reload
    }
  },
};

export function LiveSessionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [breaks, setBreaks] = useState<SessionBreak[]>([]);
  const [ended, setEnded] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skewMs, setSkewMs] = useState(0);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    if (!supabase || !user) return;
    const n = ++seq.current;
    const { data: s } = await supabase
      .from('sessions')
      .select('*')
      .eq('user_id', user.id)
      .is('ended_at', null)
      .maybeSingle();
    const { data: b } = s
      ? await supabase.from('session_breaks').select('*').eq('session_id', s.id).order('started_at')
      : { data: [] as SessionBreak[] };
    if (n !== seq.current) return; // a newer refresh already landed
    setSession(s);
    setBreaks(b ?? []);
    setLoading(false);
  }, [user]);

  // Restore an end screen that was open before a reload.
  useEffect(() => {
    const id = store.get(ENDED_KEY);
    if (!supabase || !user || !id) return;
    supabase
      .from('sessions')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.ended_at && data.rating == null) setEnded(data);
        else store.set(ENDED_KEY, null);
      });
  }, [user]);

  useEffect(() => {
    refresh();
    if (!supabase || !user) return;
    const ch = supabase
      .channel(`live-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions', filter: `user_id=eq.${user.id}` },
        () => refresh(),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_breaks' }, () => refresh())
      .subscribe();
    const onVis = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      supabase?.removeChannel(ch);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [user, refresh]);

  // Wraps an action: clear the error, run it, show a plain error if it fails, then resync.
  const act = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      setError(null);
      try {
        return await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
        return null;
      } finally {
        refresh();
      }
    },
    [refresh],
  );

  type Res = { data: unknown; error: { message: string } | null };
  const must = <R extends Res>(r: R): R['data'] => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };
  // For calls that must hand back a row (the new session, break or ended session).
  const mustRow = <R extends Res>(r: R): NonNullable<R['data']> => {
    const d = must(r);
    if (d == null) throw new Error('Nothing came back from the server. Try again.');
    return d as NonNullable<R['data']>;
  };

  // Learn the server-vs-device clock difference from a timestamp the server just wrote.
  const learnSkew = (serverIso: string, sentAt: number) => {
    const mid = (sentAt + Date.now()) / 2;
    const skew = Date.parse(serverIso) - mid;
    if (Math.abs(skew) > 1500) setSkewMs(skew);
  };

  // Signed out: no session, nothing loading. Derived rather than reset, so stale rows never show.
  const value: LiveValue = {
    loading: user ? loading : false,
    session: user ? session : null,
    breaks: user ? breaks : [],
    ended: user ? ended : null,
    error,
    skewMs,
    start: async (input) =>
      void (await act(async () => {
        const sentAt = Date.now();
        const s = mustRow(await supabase!.from('sessions').insert(input).select().single());
        learnSkew(s.started_at, sentAt);
        setSession(s);
        setBreaks([]);
      })),
    pause: async () =>
      void (await act(async () => must(await supabase!.rpc('pause_session', { p_session: session!.id })))),
    resume: async () =>
      void (await act(async () => must(await supabase!.rpc('resume_session', { p_session: session!.id })))),
    startBreak: async (kind) =>
      void (await act(async () => {
        const sentAt = Date.now();
        const b = mustRow(await supabase!.rpc('start_break', { p_session: session!.id, p_kind: kind }));
        learnSkew(b.started_at, sentAt);
      })),
    endBreak: async () =>
      void (await act(async () => must(await supabase!.rpc('end_break', { p_session: session!.id })))),
    end: async () =>
      act(async () => {
        const s = mustRow(await supabase!.rpc('end_session', { p_session: session!.id }));
        setEnded(s);
        store.set(ENDED_KEY, s.id);
        return s;
      }),
    finish: async ({ rating, note, metrics }) =>
      void (await act(async () => {
        if (!ended) return;
        must(
          await supabase!
            .from('sessions')
            .update({ rating, note, ...metrics })
            .eq('id', ended.id),
        );
        setEnded(null);
        store.set(ENDED_KEY, null);
      })),
    discard: async () =>
      void (await act(async () => {
        const id = ended?.id ?? session?.id;
        if (!id) return;
        must(await supabase!.from('sessions').delete().eq('id', id));
        setEnded(null);
        store.set(ENDED_KEY, null);
      })),
    clearEnded: () => {
      setEnded(null);
      store.set(ENDED_KEY, null);
    },
  };

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLiveSession(): LiveValue {
  const v = useContext(LiveContext);
  if (!v) throw new Error('useLiveSession needs <LiveSessionProvider>');
  return v;
}
