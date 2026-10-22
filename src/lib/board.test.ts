import { describe, expect, it } from 'vitest';
import { demoPlan } from '../landing/demo';
import { boardAt, countdown } from './board';

// The demo plan at Thursday Oct 22 2026, 11 AM Pacific: a MATH 20C block runs 9:30–11:30.
const NOW = Date.parse('2026-10-22T11:00:00-07:00');
const data = demoPlan(NOW);

describe('boardAt', () => {
  it('shows the running block, the time left in it, and the next one', () => {
    const b = boardAt(data.plan, data.exam_prep, NOW);
    expect(b.current?.title).toBe('Series: lectures 8–10');
    expect(b.seconds).toBe(30 * 60);
    expect(b.next?.title).toBe('Reading: perception');
    expect(b.exam?.title).toBe('Midterm 1');
    expect(b.daysToExam).toBe(3);
  });

  it('between blocks it counts down to the next one', () => {
    const t = Date.parse('2026-10-22T12:00:00-07:00');
    const b = boardAt(data.plan, data.exam_prep, t);
    expect(b.current).toBeNull();
    expect(b.next?.title).toBe('Reading: perception');
    expect(b.seconds).toBe(6 * 3600);
  });

  it('ignores proposals, and prefers study when two things overlap', () => {
    const plan = data.plan.map((r) => (r.title === 'Series: lectures 8–10' ? { ...r, proposed: true } : r));
    expect(boardAt(plan, data.exam_prep, NOW).current).toBeNull();
    const overlap = [
      ...data.plan,
      {
        ...data.plan[0],
        id: 'c',
        kind: 'Class' as const,
        title: 'Lecture',
        start: data.plan[0].start,
        end: data.plan[0].end,
      },
    ];
    expect(boardAt(overlap, data.exam_prep, NOW).current?.kind).toBe('Study');
  });

  it('after the last item there is nothing to count', () => {
    const b = boardAt(data.plan, data.exam_prep, Date.parse('2027-01-01T00:00:00-08:00'));
    expect(b).toMatchObject({ current: null, next: null, seconds: null, exam: null });
  });
});

describe('countdown', () => {
  it('reads like a clock, then like a calendar', () => {
    expect(countdown(0)).toBe('0:00');
    expect(countdown(65)).toBe('1:05');
    expect(countdown(30 * 60)).toBe('30:00');
    expect(countdown(3600 + 5 * 60 + 9)).toBe('1:05:09');
    expect(countdown(2 * 86400 + 3 * 3600)).toBe('2 d 3 h');
  });
});
