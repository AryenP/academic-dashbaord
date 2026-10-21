import { describe, expect, it } from 'vitest';
import snapshot from '../../public/data.json';
import {
  currentOrNextStudy,
  dayName,
  daysUntil,
  planDays,
  prepBlocks,
  segmentsOf,
  timePart,
  type PlanData,
} from './plan';

const data = snapshot as PlanData;
const at = (s: string) => new Date(s);

describe('segmentsOf', () => {
  it('keeps a same-day block in one piece', () => {
    expect(segmentsOf({ start: '2026-10-26T17:00:00-07:00', end: '2026-10-26T18:00:00-07:00' })).toEqual([
      { day: '2026-10-26', a: 1020, b: 1080, first: true },
    ]);
  });

  it('splits a 24-hour exam across two days', () => {
    expect(segmentsOf({ start: '2026-11-03T14:00:00-08:00', end: '2026-11-04T14:00:00-08:00' })).toEqual([
      { day: '2026-11-03', a: 840, b: 1440, first: true },
      { day: '2026-11-04', a: 0, b: 840 },
    ]);
  });

  it('fills whole days in between for longer items', () => {
    const s = segmentsOf({ start: '2026-10-20T20:00:00-07:00', end: '2026-10-22T09:00:00-07:00' });
    expect(s.map((x) => x.day)).toEqual(['2026-10-20', '2026-10-21', '2026-10-22']);
    expect(s[1]).toEqual({ day: '2026-10-21', a: 0, b: 1440 });
  });
});

describe('dates', () => {
  it('counts calendar days, not 24-hour periods', () => {
    expect(daysUntil('2026-10-26', at('2026-10-25T23:59:00-07:00'))).toBe(1);
    expect(daysUntil('2026-10-26', at('2026-10-26T00:01:00-07:00'))).toBe(0);
  });

  it('names nearby days', () => {
    const now = at('2026-10-22T11:00:00-07:00');
    expect(dayName('2026-10-22', now)).toBe('Today');
    expect(dayName('2026-10-23', now)).toBe('Tomorrow');
    expect(dayName('2026-10-26', now)).toBe('Mon Oct 26');
  });

  it('lists every day from the first item to the last end', () => {
    const days = planDays(data.plan);
    expect(days[0]).toBe('2026-10-20');
    expect(days.at(-1)).toBe('2026-11-04');
    expect(days).toHaveLength(16);
  });
});

describe('plan helpers', () => {
  it('shows just the time for single-day items', () => {
    const r = data.plan.find((x) => x.title === 'Midterm 1')!;
    expect(timePart(r)).toBe('5 PM–6 PM');
    const take = data.plan.find((x) => x.course === 'CSE 151A' && x.kind === 'Exam')!;
    expect(timePart(take)).toBe(take.when);
  });

  it('finds prep blocks that add up to the planned prep hours', () => {
    for (const x of data.exam_prep) {
      const sum = prepBlocks(data.plan, x).reduce((s, r) => s + r.hours, 0);
      expect(Math.round(sum * 10) / 10).toBeCloseTo(x.prep_hours, 1);
    }
  });

  it('defaults a session to the current block, else the next one', () => {
    const during = currentOrNextStudy(data.plan, Date.parse('2026-10-22T11:00:00-07:00'));
    expect(during?.title).toBe('practice problems + cheat sheet #1');
    const between = currentOrNextStudy(data.plan, Date.parse('2026-10-22T15:00:00-07:00'));
    expect(between?.title).toBe('cheat sheet #2 + weak spots');
    expect(currentOrNextStudy(data.plan, Date.parse('2026-12-01T00:00:00-08:00'))).toBeUndefined();
  });
});
