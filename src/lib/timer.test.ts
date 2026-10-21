import { describe, expect, it } from 'vitest';
import { breakIdea, clock, duration, planFor, timerState, type BreakTimes, type SessionTimes } from './timer';

const T0 = Date.parse('2026-10-22T17:00:00Z');
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();
const now = (min: number) => T0 + min * 60_000;

const session = (over: Partial<SessionTimes> = {}): SessionTimes => ({
  started_at: at(0),
  ended_at: null,
  paused_at: null,
  paused_seconds: 0,
  break_seconds: 0,
  mode: 'pomodoro',
  ...over,
});
const brk = (start: number, end: number | null, over: Partial<BreakTimes> = {}): BreakTimes => ({
  kind: 'short',
  started_at: at(start),
  ended_at: end == null ? null : at(end),
  paused_before: 0,
  ...over,
});

describe('timerState', () => {
  it('counts focus time and time to the first break', () => {
    const s = timerState(session(), [], now(10));
    expect(s).toMatchObject({
      phase: 'focus',
      focusSec: 600,
      intervalSec: 600,
      toBreakSec: 900,
      breakDue: false,
    });
  });

  it('flags a due break once the interval is over, and keeps counting', () => {
    const s = timerState(session(), [], now(27));
    expect(s.breakDue).toBe(true);
    expect(s.toBreakSec).toBe(-120);
    expect(s.focusSec).toBe(27 * 60);
  });

  it('a running break pauses focus and counts down', () => {
    const s = timerState(session(), [brk(25, null)], now(27));
    expect(s.phase).toBe('break');
    expect(s.focusSec).toBe(25 * 60);
    expect(s.breakLeftSec).toBe(3 * 60);
    expect(s.breakDue).toBe(false);
  });

  it('after a break the interval restarts', () => {
    const s = timerState(session({ break_seconds: 300 }), [brk(25, 30)], now(40));
    expect(s.focusSec).toBe(35 * 60);
    expect(s.intervalSec).toBe(10 * 60);
    expect(s.breaksTaken).toBe(1);
  });

  it('pauses before the last break do not shorten the current interval', () => {
    // paused 3 min in the first interval, then a break 25–30, now at 40
    const s = timerState(
      session({ paused_seconds: 180, break_seconds: 300 }),
      [brk(28, 33, { paused_before: 180 })],
      now(40),
    );
    expect(s.intervalSec).toBe(7 * 60);
    expect(s.focusSec).toBe(40 * 60 - 180 - 300);
  });

  it('pauses since the last break do', () => {
    const s = timerState(
      session({ paused_seconds: 240, break_seconds: 300 }),
      [brk(25, 30, { paused_before: 60 })],
      now(40),
    );
    expect(s.intervalSec).toBe(10 * 60 - 180);
  });

  it('a running pause stops the clock', () => {
    const s = timerState(session({ paused_at: at(10) }), [], now(15));
    expect(s.phase).toBe('paused');
    expect(s.focusSec).toBe(600);
    expect(s.intervalSec).toBe(600);
  });

  it('every fourth pomodoro break is long', () => {
    const three = [brk(25, 30), brk(55, 60), brk(85, 90)];
    expect(timerState(session(), three.slice(0, 2), now(80)).nextBreak).toBe('short');
    expect(timerState(session(), three, now(110)).nextBreak).toBe('long');
    const long = timerState(session(), [...three, brk(115, null, { kind: 'long' })], now(116));
    expect(long.breakLeftSec).toBe(14 * 60);
  });

  it('flow mode has no countdown, only a nudge at 90 minutes', () => {
    expect(timerState(session({ mode: 'flow' }), [], now(60))).toMatchObject({
      toBreakSec: null,
      breakDue: false,
    });
    expect(timerState(session({ mode: 'flow' }), [], now(91)).breakDue).toBe(true);
  });

  it('custom lengths come from settings', () => {
    const s = timerState(session({ mode: 'custom' }), [], now(10), { custom_work_min: 30 });
    expect(s.toBreakSec).toBe(20 * 60);
    expect(planFor('custom', { custom_break_min: 12 }).breakSec('short')).toBe(720);
    expect(planFor('custom', { custom_work_min: -5 }).workSec).toBe(60);
  });

  it('an ended session freezes at its end time', () => {
    const s = timerState(session({ ended_at: at(50), break_seconds: 300 }), [brk(25, 30)], now(500));
    expect(s.phase).toBe('ended');
    expect(s.focusSec).toBe(45 * 60);
  });

  it('a zero-length session is zero, not negative', () => {
    expect(timerState(session({ ended_at: at(0) }), [], now(0)).focusSec).toBe(0);
    expect(timerState(session(), [], now(-1)).focusSec).toBe(0);
  });
});

describe('formatting', () => {
  it('clock', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(25 * 60)).toBe('25:00');
    expect(clock(3909)).toBe('1:05:09');
    expect(clock(-75)).toBe('−1:15');
  });

  it('duration', () => {
    expect(duration(40 * 60)).toBe('40 min');
    expect(duration(85 * 60)).toBe('1 h 25 min');
    expect(duration(120 * 60)).toBe('2 h');
  });

  it('break ideas rotate', () => {
    expect(breakIdea(0)).not.toBe(breakIdea(1));
    expect(breakIdea(7)).toBe(breakIdea(0));
  });
});
