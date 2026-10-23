import { describe, expect, it } from 'vitest';
import { demoPlan } from '../landing/demo';
import { pace, paceWords } from './pace';
import type { Session } from './supabase';

// The demo plan at Thursday Oct 22 2026, 11 AM Pacific; MATH 20C Midterm 1 is Sunday 5 PM.
const NOW = Date.parse('2026-10-22T11:00:00-07:00');
const data = demoPlan(NOW);
const exam = data.exam_prep.find((x) => x.title === 'Midterm 1')!;

const session = (daysAgo: number, min: number, course = 'MATH 20C'): Session =>
  ({
    id: `s${daysAgo}-${min}`,
    user_id: 'u',
    course,
    mode: 'pomodoro',
    started_at: new Date(NOW - daysAgo * 864e5 - min * 60_000).toISOString(),
    ended_at: new Date(NOW - daysAgo * 864e5).toISOString(),
    break_seconds: 0,
    paused_seconds: 0,
    paused_at: null,
    focus_pct: null,
    phone_seconds: 0,
    pickups: 0,
    longest_stretch_seconds: null,
    rating: null,
    note: null,
    plan_item_id: null,
    source: 'web',
  }) as unknown as Session;

describe('pace', () => {
  it('carries the last week’s pace to the exam and counts the blocks still ahead', () => {
    // 2 h a day for the last 6 days (12 h), plus 3 h a month ago that counts as done but not pace.
    const sessions = [...Array.from({ length: 6 }, (_, i) => session(i + 0.5, 120)), session(30, 180)];
    const p = pace(exam, data.plan, sessions, NOW)!;
    expect(p.done).toBe(15);
    expect(p.perDay).toBe(1.7); // 12 h / 7 days
    expect(p.daysLeft).toBe(3.3);
    expect(p.projected).toBe(20.5); // 15 + 1.71 × 3.25, to the half hour
    expect(p.planned).toBe(12);
    expect(p.left).toBe(12); // the running block hasn't ended, so it still counts as ahead
    expect(paceWords(p, exam, NOW)).toBe(
      'At this pace, about 20.5 of 12 h by Sun Oct 25; 12 h of blocks still ahead.',
    );
  });

  it('says plainly when nothing is logged, and skips exams that passed', () => {
    const p = pace(exam, data.plan, [], NOW)!;
    expect(p).toMatchObject({ done: 0, perDay: 0, projected: 0, left: 12 });
    expect(paceWords(p, exam, NOW)).toBe(
      'Nothing logged for MATH 20C yet; 12 h of blocks still ahead by Sun Oct 25.',
    );
    expect(pace(exam, data.plan, [], Date.parse('2026-10-26T09:00:00-07:00'))).toBeNull();
  });

  it('only counts that course, finished sessions, and time before the exam', () => {
    const sessions = [
      session(1, 60, 'CSE 12'),
      { ...session(1, 60), ended_at: null } as Session,
      session(-1, 60), // after now: tomorrow's session isn't pace
    ];
    const p = pace(exam, data.plan, sessions, NOW)!;
    expect(p.done).toBe(1); // tomorrow's counts as "before the exam", not as pace
    expect(p.perDay).toBe(0);
  });

  it('on exam day it says what was logged and stops projecting', () => {
    const t = Date.parse('2026-10-25T09:00:00-07:00');
    const p = pace(exam, data.plan, [session(0.5, 90)], t)!;
    expect(paceWords(p, exam, t)).toBe('1.5 h logged for MATH 20C. Nothing to add today but the exam.');
  });
});
