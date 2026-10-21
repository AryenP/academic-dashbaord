import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './auth';
import { freezeSession } from './freeze';
import { apply, isNetworkError, queue, type Op } from './offline';
import type { TablesInsert } from './database.types';
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
  start(input: { course: string; plan_item_id: string | null; mode: Mode }): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  startBreak(kind: BreakKind): Promise<void>;
  endBreak(): Promise<void>;
  end(): Promise<void>;
  /** Session actions waiting for a connection. */
  pending: number;
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
  const { user, profile } = useAuth();
  const tracked = !!profile?.phone_token_hash;
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [breaks, setBreaks] = useState<SessionBreak[]>([]);
  const [ended, setEnded] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skewMs, setSkewMs] = useState(0);
  const [pending, setPending] = useState(() => queue.read().length);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    if (!supabase || !user) return;
    // While offline actions are waiting, this device is ahead of the server: keep its state.
    if (queue.read().length) return;
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

  /**
   * Sends one session action to the server. Live actions let the database stamp the time; replayed
   * offline actions carry the time they happened. Returns the ended session for 'end'.
   */
  const send = async (op: Op, replay: boolean): Promise<Session | null> => {
    const db = supabase!;
    const p_at = replay ? op.at : undefined;
    const sentAt = Date.now();
    switch (op.op) {
      case 'start': {
        const row: TablesInsert<'sessions'> = {
          id: op.id,
          course: op.course,
          plan_item_id: op.plan_item_id,
          mode: op.mode,
        };
        if (replay) row.started_at = op.at;
        const s = mustRow(await db.from('sessions').insert(row).select().single());
        if (!replay) learnSkew(s.started_at, sentAt);
        return null;
      }
      case 'startBreak': {
        const b = mustRow(await db.rpc('start_break', { p_session: op.session, p_kind: op.kind, p_at }));
        if (!replay) learnSkew(b.started_at, sentAt);
        return null;
      }
      case 'pause':
        must(await db.rpc('pause_session', { p_session: op.session, p_at }));
        return null;
      case 'resume':
        must(await db.rpc('resume_session', { p_session: op.session, p_at }));
        return null;
      case 'endBreak':
        must(await db.rpc('end_break', { p_session: op.session, p_at }));
        return null;
      case 'end': {
        const e = mustRow(await db.rpc('end_session', { p_session: op.session, p_at }));
        return freezeSession(db, e, tracked);
      }
    }
  };

  // Replays queued offline actions in order. Stops at the first one that still can't connect;
  // drops (and reports) one the server rejects, so a bad action can't block the queue forever.
  const flushing = useRef(false);
  const flush = useCallback(async () => {
    if (flushing.current || !supabase || !user) return;
    flushing.current = true;
    let ops = queue.read();
    try {
      while (ops.length) {
        try {
          const done = await send(ops[0], true);
          if (done) setEnded((cur) => (cur?.id === done.id ? done : cur));
        } catch (e) {
          const msg = e instanceof Error ? e.message : '';
          if (isNetworkError(msg)) break;
          setError(`An offline change couldn't be saved: ${msg}`);
        }
        ops = ops.slice(1);
        queue.write(ops);
        setPending(ops.length);
      }
    } finally {
      flushing.current = false;
    }
    if (!ops.length) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- send reads current state via refs/closures
  }, [user, refresh]);

  useEffect(() => {
    const onOnline = () => void flush();
    window.addEventListener('online', onOnline);
    // Anything left from last time goes out as soon as the page is up.
    const t = setTimeout(onOnline, 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener('online', onOnline);
    };
  }, [flush]);

  /** Applies a session action on this device at once, then saves it now or queues it for later. */
  const transition = async (op: Op) => {
    if (!user) return;
    setError(null);
    const next = apply({ session, breaks, ended }, op, user.id);
    setSession(next.session);
    setBreaks(next.breaks);
    if (op.op === 'end' && next.ended) {
      setEnded(next.ended);
      store.set(ENDED_KEY, next.ended.id);
    }
    const enqueue = () => {
      const ops = [...queue.read(), op];
      queue.write(ops);
      setPending(ops.length);
    };
    // Keep order: once anything is queued, later actions queue behind it.
    if (queue.read().length || !navigator.onLine) return enqueue();
    try {
      const done = await send(op, false);
      if (done) setEnded(done);
      refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (isNetworkError(msg)) enqueue();
      else {
        setError(msg || 'Something went wrong. Try again.');
        refresh();
      }
    }
  };

  const now = () => new Date(Date.now() + skewMs).toISOString();

  // For the rating/note and discard, which need the server: say so plainly when offline.
  const online = async (fn: () => Promise<void>) => {
    setError(null);
    if (queue.read().length) await flush();
    if (queue.read().length || !navigator.onLine) {
      setError("You're offline. Your session is kept on this device; save it when you're back online.");
      return;
    }
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      refresh();
    }
  };

  // Signed out: no session, nothing loading. Derived rather than reset, so stale rows never show.
  const value: LiveValue = {
    loading: user ? loading && !pending : false,
    session: user ? session : null,
    breaks: user ? breaks : [],
    ended: user ? ended : null,
    error,
    skewMs,
    pending,
    start: (input) => transition({ op: 'start', id: crypto.randomUUID(), ...input, at: now() }),
    pause: () => transition({ op: 'pause', session: session!.id, at: now() }),
    resume: () => transition({ op: 'resume', session: session!.id, at: now() }),
    startBreak: (kind) => transition({ op: 'startBreak', session: session!.id, kind, at: now() }),
    endBreak: () => transition({ op: 'endBreak', session: session!.id, at: now() }),
    end: async () => {
      await transition({ op: 'end', session: session!.id, at: now() });
    },
    finish: ({ rating, note, metrics }) =>
      online(async () => {
        if (!ended) return;
        must(
          await supabase!
            .from('sessions')
            .update({ rating, note, ...metrics })
            .eq('id', ended.id),
        );
        setEnded(null);
        store.set(ENDED_KEY, null);
      }),
    discard: () =>
      online(async () => {
        const id = ended?.id ?? session?.id;
        if (!id) return;
        must(await supabase!.from('sessions').delete().eq('id', id));
        setEnded(null);
        setSession(null);
        store.set(ENDED_KEY, null);
      }),
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
