import { describe, expect, it } from 'vitest';
import { apply, isNetworkError, type LocalState, type Op } from './offline';
import { timerState } from './timer';

const T0 = Date.parse('2026-10-22T17:00:00Z');
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();
const empty: LocalState = { session: null, breaks: [], ended: null };

const run = (ops: Op[]) => ops.reduce((st, op) => apply(st, op, 'u1'), empty);
const start: Op = {
  op: 'start',
  id: 's1',
  course: 'DSC 140A',
  plan_item_id: null,
  mode: 'pomodoro',
  at: at(0),
};

describe('offline apply', () => {
  it('start creates a running session at the given time', () => {
    const st = run([start]);
    expect(st.session).toMatchObject({ id: 's1', user_id: 'u1', started_at: at(0), paused_seconds: 0 });
  });

  it('pause, resume, break and end match the database functions', () => {
    const st = run([
      start,
      { op: 'pause', session: 's1', at: at(10) },
      { op: 'resume', session: 's1', at: at(13) },
      { op: 'startBreak', session: 's1', kind: 'short', at: at(25) },
      { op: 'endBreak', session: 's1', at: at(30) },
      { op: 'end', session: 's1', at: at(60) },
    ]);
    // Same numbers the RLS test gets from the real functions.
    expect(st.ended).toMatchObject({
      paused_seconds: 180,
      break_seconds: 300,
      paused_at: null,
      ended_at: at(60),
    });
    expect(st.session).toBeNull();
  });

  it('a break started while paused resumes first, and records pauses so far', () => {
    const st = run([
      start,
      { op: 'pause', session: 's1', at: at(5) },
      { op: 'startBreak', session: 's1', kind: 'short', at: at(8) },
    ]);
    expect(st.session).toMatchObject({ paused_at: null, paused_seconds: 180 });
    expect(st.breaks[0]).toMatchObject({ started_at: at(8), ended_at: null, paused_before: 180 });
    expect(timerState(st.session!, st.breaks, Date.parse(at(9))).phase).toBe('break');
  });

  it('ending during a break closes it', () => {
    const st = run([
      start,
      { op: 'startBreak', session: 's1', kind: 'long', at: at(50) },
      { op: 'end', session: 's1', at: at(55) },
    ]);
    expect(st.ended!.break_seconds).toBe(300);
  });

  it('ops for another session or a second start are ignored', () => {
    const st = run([start, { op: 'pause', session: 'other', at: at(1) }, { ...start, id: 's2' }]);
    expect(st.session).toMatchObject({ id: 's1', paused_at: null });
  });

  it('knows a dropped connection from a server error', () => {
    expect(isNetworkError('TypeError: Failed to fetch')).toBe(true);
    expect(isNetworkError('Load failed')).toBe(true);
    expect(isNetworkError('duplicate key value violates unique constraint')).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
  });
});
