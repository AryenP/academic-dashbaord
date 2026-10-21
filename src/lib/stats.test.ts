import { describe, expect, it } from 'vitest';
import type { PlanItem } from './plan';
import { lastNDays, minutesByCourse, plannedVsActual, streak, weekStart } from './stats';
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
