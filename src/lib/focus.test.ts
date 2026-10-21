import { describe, expect, it } from 'vitest';
import { computeFocus, eventTime, frozenMetrics, type FocusEvent } from './focus';

const T0 = Date.parse('2026-10-22T17:00:00Z');
const m = (min: number) => T0 + min * 60_000;
const iso = (min: number) => new Date(m(min)).toISOString();
const ev = (kind: string, min: number, app = 'Instagram', rxMin = min): FocusEvent => ({
  app,
  kind,
  at: iso(min),
  received_at: iso(rxMin),
});
const hour = { start: m(0), end: m(60) };

describe('computeFocus', () => {
  it('no phone use is 100%', () => {
    const r = computeFocus(hour, [], [], m(60));
    expect(r).toMatchObject({
      focusSec: 3600,
      phoneSec: 0,
      focusPct: 100,
      pickups: 0,
      longestStretchSec: 3600,
    });
  });

  it('one 6-minute open/close in an hour is 90%', () => {
    const r = computeFocus(hour, [], [ev('open', 10), ev('close', 16)], m(60));
    expect(r).toMatchObject({ phoneSec: 360, focusPct: 90, pickups: 1, longestStretchSec: 44 * 60 });
  });

  it('overlapping opens of different apps count once, as one pickup', () => {
    const r = computeFocus(
      hour,
      [],
      [ev('open', 10), ev('open', 12, 'TikTok'), ev('close', 14), ev('close', 18, 'TikTok')],
      m(60),
    );
    expect(r.phoneSec).toBe(8 * 60);
    expect(r.pickups).toBe(1);
  });

  it('a repeated open of the same app does not restart it', () => {
    const r = computeFocus(hour, [], [ev('open', 10), ev('open', 12), ev('close', 15)], m(60));
    expect(r.phoneSec).toBe(5 * 60);
  });

  it('an open with no close is capped at 10 minutes', () => {
    const r = computeFocus(hour, [], [ev('open', 10)], m(60));
    expect(r.phoneSec).toBe(600);
    const closedLate = computeFocus(hour, [], [ev('open', 10), ev('close', 40)], m(60));
    expect(closedLate.phoneSec).toBe(600);
  });

  it('an open with no close is capped at the session end', () => {
    const r = computeFocus(hour, [], [ev('open', 55)], m(90));
    expect(r.phoneSec).toBe(300);
  });

  it('while running, an open app counts up to now and is reported', () => {
    const r = computeFocus({ start: m(0), end: null }, [], [ev('open', 20)], m(23));
    expect(r.phoneSec).toBe(180);
    expect(r.openApp).toEqual({ app: 'Instagram', since: m(20) });
    expect(computeFocus({ start: m(0), end: null }, [], [ev('open', 20)], m(31)).openApp).toBeNull();
  });

  it('phone use during a break is ignored, and is not a pickup', () => {
    const r = computeFocus(hour, [{ start: m(25), end: m(30) }], [ev('open', 26), ev('close', 29)], m(60));
    expect(r.focusSec).toBe(55 * 60);
    expect(r).toMatchObject({ phoneSec: 0, pickups: 0, focusPct: 100 });
  });

  it('use that runs from a break into focus counts only the focus part', () => {
    const r = computeFocus(hour, [{ start: m(25), end: m(30) }], [ev('open', 28), ev('close', 33)], m(60));
    expect(r.phoneSec).toBe(180);
    expect(r.pickups).toBe(0);
  });

  it('a break still running excludes time up to now', () => {
    const r = computeFocus({ start: m(0), end: null }, [{ start: m(25), end: null }], [], m(28));
    expect(r.focusSec).toBe(25 * 60);
  });

  it('a close without an open is ignored', () => {
    const r = computeFocus(hour, [], [ev('close', 10), ev('open', 20, 'X'), ev('close', 22, 'Y')], m(60));
    expect(r.phoneSec).toBe(600); // X never closes → capped at 10 min
  });

  it('events outside the session do not count', () => {
    const r = computeFocus(
      hour,
      [],
      [ev('open', -5), ev('close', -2), ev('open', 61), ev('close', 62)],
      m(70),
    );
    expect(r).toMatchObject({ phoneSec: 0, pickups: 0 });
  });

  it('phone clock skew is clamped to ±2 min of when the server got it', () => {
    // phone says minute 5, server got it at minute 20 → treated as minute 18
    expect(eventTime(ev('open', 5, 'Instagram', 20))).toBe(m(18));
    expect(eventTime(ev('open', 30, 'Instagram', 20))).toBe(m(22));
    expect(eventTime(ev('open', 21, 'Instagram', 20))).toBe(m(21));
    expect(eventTime({ app: 'x', kind: 'open', at: 'garbage', received_at: iso(20) })).toBe(m(20));
    const r = computeFocus(hour, [], [ev('open', 5, 'Instagram', 20), ev('close', 23)], m(60));
    expect(r.phoneSec).toBe(300);
  });

  it('a zero-length session has no focus % instead of dividing by zero', () => {
    const r = computeFocus({ start: m(0), end: m(0) }, [], [ev('open', 0)], m(0));
    expect(r).toMatchObject({ focusSec: 0, phoneSec: 0, focusPct: null, pickups: 0, longestStretchSec: 0 });
  });

  it('all phone is 0%, never negative', () => {
    const r = computeFocus({ start: m(0), end: m(5) }, [], [ev('open', 0), ev('close', 5)], m(5));
    expect(r.focusPct).toBe(0);
  });

  it('frozen metrics leave phone fields empty when tracking is not set up', () => {
    const r = computeFocus(hour, [], [], m(60));
    expect(frozenMetrics(r, false)).toEqual({
      focus_pct: null,
      phone_seconds: null,
      pickups: null,
      longest_stretch_seconds: 3600,
    });
    expect(frozenMetrics(r, true).focus_pct).toBe(100);
  });
});
