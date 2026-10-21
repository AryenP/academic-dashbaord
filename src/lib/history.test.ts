import { describe, expect, it } from 'vitest';
import { focusSeconds, sessionsCsv, totalsFromSessions } from './history';
import type { Session } from './supabase';

const base: Session = {
  id: 'a',
  user_id: 'u',
  course: 'DSC 140A',
  plan_block_id: null,
  mode: 'pomodoro',
  source: 'web',
  started_at: '2026-10-22T09:00:00-07:00',
  ended_at: '2026-10-22T10:00:00-07:00',
  paused_at: null,
  paused_seconds: 120,
  break_seconds: 300,
  focus_pct: null,
  phone_seconds: null,
  pickups: null,
  longest_stretch_seconds: null,
  rating: 4,
  note: null,
};

describe('history', () => {
  it('focus time leaves out pauses and breaks', () => {
    expect(focusSeconds(base)).toBe(3600 - 420);
    expect(focusSeconds({ ...base, ended_at: null })).toBe(0);
  });

  it('totals group by local day and course', () => {
    const t = totalsFromSessions([
      base,
      {
        ...base,
        id: 'b',
        started_at: '2026-10-22T20:00:00-07:00',
        ended_at: '2026-10-22T20:30:00-07:00',
        paused_seconds: 0,
        break_seconds: 0,
      },
      { ...base, id: 'c', course: 'DSC 102' },
    ]);
    expect(t).toEqual([
      { day: '2026-10-22', course: 'DSC 140A', minutes: 83 },
      { day: '2026-10-22', course: 'DSC 102', minutes: 53 },
    ]);
  });

  it('CSV quotes notes with commas, quotes and newlines', () => {
    const csv = sessionsCsv([{ ...base, note: 'chapter 3, "hard"\nredo' }]);
    const [head, row] = csv.split('\n', 2);
    expect(head.startsWith('date,start,end,course')).toBe(true);
    expect(csv).toContain('"chapter 3, ""hard""\nredo"');
    expect(row.startsWith('2026-10-22,09:00,10:00,DSC 140A,pomodoro,web,53,5,2,,,,4,')).toBe(true);
  });
});
