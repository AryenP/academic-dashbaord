import { describe, expect, it } from 'vitest';
import { term, termSpan, type TermItem, type TermSession } from './term';

const TZ = 'America/Los_Angeles';
const at = (day: string, h = 10) => `${day}T${String(h).padStart(2, '0')}:00:00-07:00`;
const session = (day: string, hours: number, course = 'MATH 20C', pct: number | null = 80): TermSession => ({
  course,
  started_at: at(day),
  ended_at: new Date(Date.parse(at(day)) + hours * 3_600_000).toISOString(),
  paused_seconds: 0,
  break_seconds: 0,
  focus_pct: pct,
});
const item = (
  id: string,
  kind: string,
  day: string,
  hours: number,
  course = 'MATH 20C',
  extra = {},
): TermItem => ({
  id,
  kind,
  course,
  title: kind === 'exam' ? 'Midterm' : 'Practice',
  start_at: at(day, 17),
  end_at: new Date(Date.parse(at(day, 17)) + hours * 3_600_000).toISOString(),
  ...extra,
});

describe('the term', () => {
  it('is the run of activity since the last three-week gap', () => {
    expect(
      termSpan(['2026-06-01', '2026-06-20', '2026-09-28', '2026-10-05', '2026-12-10'], '2026-10-23'),
    ).toEqual({
      start: '2026-09-28',
      end: '2026-10-05',
    }); // Dec 10 is more than three weeks after Oct 5: next term, not this one
    expect(termSpan(['2026-09-28', '2026-10-12', '2026-10-30'], '2026-10-23')).toEqual({
      start: '2026-09-28',
      end: '2026-10-30',
    });
    expect(termSpan([], '2026-10-23')).toBeNull();
  });

  it('counts hours, the best week, each course and each exam against its plan', () => {
    const sessions = [
      session('2026-09-29', 2),
      session('2026-10-06', 3),
      session('2026-10-07', 2, 'CSE 12', null),
      session('2026-10-08', 1.5),
      session('2026-10-20', 1),
      { ...session('2026-10-21', 1), ended_at: null }, // still running: not counted
    ];
    const items = [
      item('s1', 'study', '2026-10-05', 2),
      item('s2', 'study', '2026-10-09', 3),
      item('x1', 'exam', '2026-10-15', 1, 'MATH 20C', { score: 88, max_score: 100 }),
      item('x2', 'exam', '2026-10-22', 1, 'CSE 12'),
    ];
    const t = term(items, sessions, TZ, Date.parse('2026-10-24T12:00:00-07:00'))!;
    expect(t.start).toBe('2026-09-29');
    expect(t.end).toBe('2026-10-22');
    expect(t.weeks).toBe(4);
    expect(t.hours).toBe(9.5);
    expect(t.sessions).toBe(5);
    expect(t.focusPct).toBe(80); // CSE 12's unmeasured session doesn't pull the average down
    expect(t.bestWeek).toEqual({ start: '2026-10-05', hours: 6.5 });
    expect(t.courses).toEqual([
      { course: 'MATH 20C', hours: 7.5 },
      { course: 'CSE 12', hours: 2 },
    ]);
    expect(t.exams).toEqual([
      {
        id: 'x1',
        course: 'MATH 20C',
        title: 'Midterm',
        day: '2026-10-15',
        studied: 6.5,
        planned: 5,
        score: '88 / 100',
      },
      {
        id: 'x2',
        course: 'CSE 12',
        title: 'Midterm',
        day: '2026-10-22',
        studied: 2,
        planned: 0,
        score: null,
      },
    ]);
    expect(t.over).toBe(true);
  });

  it('is not over while anything is still ahead, or before any exam has passed', () => {
    const items = [item('x1', 'exam', '2026-10-15', 1), item('s9', 'study', '2026-10-26', 2)];
    expect(term(items, [session('2026-10-01', 1)], TZ, Date.parse('2026-10-24T12:00:00-07:00'))!.over).toBe(
      false,
    );
    expect(
      term(
        [item('x1', 'exam', '2026-10-30', 1)],
        [session('2026-10-20', 1)],
        TZ,
        Date.parse('2026-10-24T12:00:00-07:00'),
      )!.over,
    ).toBe(false);
  });
});
