import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './auth';
import { useLiveSession } from './liveSession';
import { dayKey } from './plan';
import { supabase, type Session } from './supabase';

// Finished sessions for the signed-in person. Every view that shows "actual" time (runway,
// checkpoints, log, stats) reads from here. Share pages fetch their totals themselves (views/Share).

export interface DayCourseMinutes {
  day: string;
  course: string;
  minutes: number;
}

interface HistoryValue {
  loading: boolean;
  /** Your finished sessions, newest first. Empty when signed out. */
  sessions: Session[];
  /** Minutes per day and course, from sessions. */
  totals: DayCourseMinutes[];
  refresh(): Promise<void>;
  update(id: string, patch: Partial<Session>): Promise<void>;
  remove(id: string): Promise<void>;
  addManual(e: { start: Date; minutes: number; course: string; note: string | null }): Promise<void>;
}

const HistoryContext = createContext<HistoryValue | null>(null);

/** Focused seconds of a finished session: wall time minus pauses and breaks. */
export const focusSeconds = (
  s: Pick<Session, 'started_at' | 'ended_at' | 'paused_seconds' | 'break_seconds'>,
) =>
  s.ended_at
    ? Math.max(
        0,
        (Date.parse(s.ended_at) - Date.parse(s.started_at)) / 1000 - s.paused_seconds - s.break_seconds,
      )
    : 0;

export function totalsFromSessions(sessions: Session[]): DayCourseMinutes[] {
  const m = new Map<string, DayCourseMinutes>();
  for (const s of sessions) {
    const day = dayKey(new Date(s.started_at));
    const k = `${day}|${s.course}`;
    const row = m.get(k) ?? { day, course: s.course, minutes: 0 };
    row.minutes += focusSeconds(s) / 60;
    m.set(k, row);
  }
  return [...m.values()].map((r) => ({ ...r, minutes: Math.round(r.minutes) }));
}

export function HistoryProvider({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const live = useLiveSession();
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [totals, setTotals] = useState<DayCourseMinutes[]>([]);

  // Fetching returns data; applying it sets state. Kept apart so the effect below only sets state
  // in the promise callback, after checking it's still current.
  const load = useCallback(async () => {
    if (!supabase || !ready) return null;
    if (user) {
      const { data } = await supabase
        .from('sessions')
        .select('*')
        .not('ended_at', 'is', null)
        .order('started_at', { ascending: false })
        .limit(2000);
      const rows = data ?? [];
      return { sessions: rows, totals: totalsFromSessions(rows) };
    }
    return { sessions: [] as Session[], totals: [] as DayCourseMinutes[] };
  }, [user, ready]);

  const apply = useCallback((r: Awaited<ReturnType<typeof load>>) => {
    if (!r) return;
    setSessions(r.sessions);
    setTotals(r.totals);
    setLoading(false);
  }, []);

  const refresh = useCallback(async () => apply(await load()), [load, apply]);

  // Reload when sign-in changes and when the live session changes (one just ended or was discarded).
  const liveId = live.session?.id;
  const endedId = live.ended?.id;
  useEffect(() => {
    let alive = true;
    load().then((r) => alive && apply(r));
    return () => {
      alive = false;
    };
  }, [load, apply, liveId, endedId]);

  const must = (r: { error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message);
  };

  const value: HistoryValue = {
    loading: loading && !!supabase,
    sessions,
    totals,
    refresh,
    update: async (id, patch) => {
      must(await supabase!.from('sessions').update(patch).eq('id', id));
      await refresh();
    },
    remove: async (id) => {
      must(await supabase!.from('sessions').delete().eq('id', id));
      await refresh();
    },
    addManual: async ({ start, minutes, course, note }) => {
      must(
        await supabase!.from('sessions').insert({
          course,
          note,
          mode: 'custom',
          source: 'manual',
          started_at: start.toISOString(),
          ended_at: new Date(start.getTime() + minutes * 60_000).toISOString(),
        }),
      );
      await refresh();
    },
  };

  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
}

export function useHistory(): HistoryValue {
  const v = useContext(HistoryContext);
  if (!v) throw new Error('useHistory needs <HistoryProvider>');
  return v;
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function sessionsCsv(sessions: Session[]): string {
  const head = [
    'date',
    'start',
    'end',
    'course',
    'mode',
    'source',
    'focus_min',
    'break_min',
    'paused_min',
    'focus_pct',
    'phone_min',
    'pickups',
    'rating',
    'note',
  ];
  const time = (iso: string) => new Date(iso).toTimeString().slice(0, 5);
  const rows = [...sessions]
    .sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at))
    .map((s) => [
      dayKey(new Date(s.started_at)),
      time(s.started_at),
      s.ended_at ? time(s.ended_at) : '',
      s.course,
      s.mode,
      s.source,
      Math.round(focusSeconds(s) / 60),
      Math.round(s.break_seconds / 60),
      Math.round(s.paused_seconds / 60),
      s.focus_pct ?? '',
      s.phone_seconds == null ? '' : Math.round(s.phone_seconds / 60),
      s.pickups ?? '',
      s.rating ?? '',
      s.note ?? '',
    ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

/**
 * On a share page: that person's prep minutes before each exam, if they share readiness. Keyed by
 * `${course}|${exam start}`. Empty when they share only the runway.
 */
export function usePublicPrep(
  handle: string | null,
  exams: { course: string; start: string }[],
): Map<string, number> {
  const enabled = !!handle;
  const [prep, setPrep] = useState<Map<string, number>>(new Map());
  const key = exams.map((x) => `${x.course}|${x.start}`).join(',');
  useEffect(() => {
    if (!supabase || !enabled || !exams.length) return;
    let alive = true;
    supabase
      .rpc('public_prep_minutes', {
        p_handle: handle!,
        p_exams: exams.map((x) => ({ course: x.course, before: x.start })),
      })
      .then(({ data }) => {
        if (!alive) return;
        const m = new Map<string, number>();
        // Match rows back to exams by course and instant (the server normalizes the time zone).
        for (const r of data ?? []) {
          const x = exams.find((e) => e.course === r.course && Date.parse(e.start) === Date.parse(r.before));
          if (x) m.set(`${x.course}|${x.start}`, r.minutes);
        }
        setPrep(m);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands in for `exams`
  }, [key, enabled]);
  return enabled ? prep : new Map();
}
