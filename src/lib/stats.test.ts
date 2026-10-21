import { describe, expect, it } from 'vitest';
import type { PlanItem } from './plan';
import {
  bestHours,
  focusTrend,
  lastNDays,
  minutesByCourse,
  pickupsPerHour,
  plannedVsActual,
  streak,
  weekStart,
} from './stats';
import type { Session } from './supabase';

const sess = (start: string, min: number): Session =>
  ({
    id: start,
    course: 'DSC 140A',
    started_at: start,
    ended_at: new Date(Date.parse(start) + min * 60_000).toISOString(),
    paused_seconds: 0,
    break_seconds: 0,
  }) as Session;

describe('stats', () => {
  it('weeks start on Monday', () => {
    expect(weekStart('2026-10-22')).toBe('2026-10-19'); // Thu → Mon
    expect(weekStart('2026-10-19')).toBe('2026-10-19');
    expect(weekStart('2026-10-25')).toBe('2026-10-19'); // Sun → Mon before
  });

  it('sums minutes per course within the range', () => {
    const t = [
      { day: '2026-10-20', course: 'A', minutes: 30 },
      { day: '2026-10-21', course: 'A', minutes: 30 },
      { day: '2026-10-21', course: 'B', minutes: 90 },
      { day: '2026-10-25', course: 'A', minutes: 999 },
    ];
    expect(minutesByCourse(t, '2026-10-20', '2026-10-21')).toEqual([
      { course: 'B', minutes: 90 },
      { course: 'A', minutes: 60 },
    ]);
  });

  it('planned vs actual counts only study blocks', () => {
    const plan = [
      { kind: 'Study', day: '2026-10-21', hours: 2 },
      { kind: 'Deadline', day: '2026-10-21', hours: 1 },
    ] as PlanItem[];
    expect(plannedVsActual(plan, [{ day: '2026-10-21', course: 'A', minutes: 75 }], ['2026-10-21'])).toEqual([
      { day: '2026-10-21', plannedMin: 120, actualMin: 75 },
    ]);
  });

  it('streak counts back from today, or from yesterday if today is empty', () => {
    const s = [sess('2026-10-20T10:00:00-07:00', 30), sess('2026-10-21T10:00:00-07:00', 30)];
    expect(streak(s, '2026-10-21')).toBe(2);
    expect(streak(s, '2026-10-22')).toBe(2);
    expect(streak(s, '2026-10-23')).toBe(0);
  });

  it('lastNDays ends today', () => {
    expect(lastNDays('2026-10-22', 3)).toEqual(['2026-10-20', '2026-10-21', '2026-10-22']);
  });
});

describe('focus stats', () => {
  const tracked = (start: string, min: number, pct: number, pickups: number): Session =>
    ({ ...sess(start, min), focus_pct: pct, pickups }) as Session;

  it('pickups per focused hour, from a day on', () => {
    const s = [
      tracked('2026-10-20T10:00:00-07:00', 60, 90, 4),
      tracked('2026-10-21T10:00:00-07:00', 30, 80, 2),
    ];
    expect(pickupsPerHour(s, '2026-10-20')).toBe(4);
    expect(pickupsPerHour(s, '2026-10-21')).toBe(4);
    expect(pickupsPerHour(s, '2026-10-22')).toBeNull();
  });

  it('best hours weights by minutes in each hour', () => {
    // Thu Oct 22: 10:30–11:30 at 80%, 11:00–12:00 at 100%
    const s = [
      tracked('2026-10-22T10:30:00-07:00', 60, 80, 0),
      tracked('2026-10-22T11:00:00-07:00', 60, 100, 0),
    ];
    const cells = bestHours(s, [10, 11, 12]);
    const thu = (h: number) => cells.find((c) => c.weekday === 3 && c.hour === h)!;
    expect(thu(10)).toMatchObject({ pct: 80, minutes: 30 });
    expect(thu(11)).toMatchObject({ pct: 93, minutes: 90 }); // (30×80 + 60×100) / 90
    expect(thu(12)).toMatchObject({ pct: null, minutes: 0 });
    expect(cells).toHaveLength(21);
  });

  it('trend keeps only tracked sessions, oldest first', () => {
    const s = [
      tracked('2026-10-21T10:00:00-07:00', 30, 70, 1),
      sess('2026-10-20T10:00:00-07:00', 30),
      tracked('2026-10-20T09:00:00-07:00', 30, 90, 0),
    ];
    expect(focusTrend(s).map((p) => p.pct)).toEqual([90, 70]);
  });
});
