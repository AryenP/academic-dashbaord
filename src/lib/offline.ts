// Offline queue for session actions. Without a connection, each action is applied to the local
// session right away (mirroring the SQL functions in 0001_init.sql) and saved in a queue. When the
// connection comes back, the queue replays in order with the original timestamps (the functions
// take p_at), so the server ends up exactly where the device already is.
import type { Session, SessionBreak } from './supabase';

export type Op =
  | { op: 'start'; id: string; course: string; plan_item_id: string | null; mode: string; at: string }
  | { op: 'pause' | 'resume' | 'endBreak' | 'end'; session: string; at: string }
  | { op: 'startBreak'; session: string; kind: 'short' | 'long'; at: string };

export interface LocalState {
  session: Session | null;
  breaks: SessionBreak[];
  ended: Session | null;
}

const secs = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 1000));

function resume(s: Session, at: string): Session {
  return s.paused_at
    ? { ...s, paused_seconds: s.paused_seconds + secs(s.paused_at, at), paused_at: null }
    : s;
}

function endBreak(s: Session, breaks: SessionBreak[], at: string) {
  const open = breaks.find((b) => !b.ended_at);
  if (!open) return { s, breaks };
  return {
    s: { ...s, break_seconds: s.break_seconds + secs(open.started_at, at) },
    breaks: breaks.map((b) => (b === open ? { ...b, ended_at: at } : b)),
  };
}

/** The state after `op`, computed on the device. */
export function apply(st: LocalState, op: Op, userId: string): LocalState {
  if (op.op === 'start') {
    if (st.session) return st;
    return {
      ended: null,
      breaks: [],
      session: {
        id: op.id,
        user_id: userId,
        course: op.course,
        plan_item_id: op.plan_item_id,
        mode: op.mode,
        source: 'web',
        started_at: op.at,
        ended_at: null,
        paused_at: null,
        paused_seconds: 0,
        break_seconds: 0,
        focus_pct: null,
        phone_seconds: null,
        pickups: null,
        longest_stretch_seconds: null,
        rating: null,
        note: null,
      },
    };
  }
  const s = st.session;
  if (!s || s.id !== op.session) return st;
  switch (op.op) {
    case 'pause':
      return s.paused_at ? st : { ...st, session: { ...s, paused_at: op.at } };
    case 'resume':
      return { ...st, session: resume(s, op.at) };
    case 'startBreak': {
      const r = resume(s, op.at);
      if (st.breaks.some((b) => !b.ended_at)) return { ...st, session: r };
      const b: SessionBreak = {
        id: `local-${op.at}`,
        session_id: s.id,
        kind: op.kind,
        started_at: op.at,
        ended_at: null,
        paused_before: r.paused_seconds,
      };
      return { ...st, session: r, breaks: [...st.breaks, b] };
    }
    case 'endBreak': {
      const e = endBreak(s, st.breaks, op.at);
      return { ...st, session: e.s, breaks: e.breaks };
    }
    case 'end': {
      const e = endBreak(s, st.breaks, op.at);
      const done = { ...resume(e.s, op.at), ended_at: op.at };
      return { session: null, breaks: [], ended: done };
    }
  }
}

const KEY = 'runway.queue';

export const queue = {
  read(): Op[] {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? '[]');
    } catch {
      return [];
    }
  },
  write(ops: Op[]) {
    try {
      if (ops.length) localStorage.setItem(KEY, JSON.stringify(ops));
      else localStorage.removeItem(KEY);
    } catch {
      // storage blocked: the queue lives only as long as the page
    }
  },
};

/** True for errors that mean "no connection", as opposed to the server saying no. */
export const isNetworkError = (msg: string | undefined) =>
  !!msg && /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(msg);
