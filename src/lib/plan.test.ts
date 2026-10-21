import { describe, expect, it } from 'vitest';
import { demoPlan } from '../landing/demo';
import { buildPlan, localIso, whenLabel } from './planBuild';
import { currentOrNextStudy, dayName, daysUntil, planDays, prepBlocks, segmentsOf, timePart } from './plan';

// The demo plan, anchored to Thursday Oct 22 2026, 11 AM Pacific (a MATH 20C block is running).
const NOW = Date.parse('2026-10-22T11:00:00-07:00');
const data = demoPlan(NOW);
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
    expect(days[0]).toBe('2026-10-22');
    expect(days.at(-1)).toBe('2026-11-02');
    expect(days).toHaveLength(12);
  });
});

describe('plan helpers', () => {
  it('shows just the time for single-day items', () => {
    const r = data.plan.find((x) => x.title === 'Midterm 1')!;
    expect(timePart(r)).toBe('5 PM–6 PM');
    const take = {
      ...r,
      start: '2026-11-03T14:00:00-08:00',
      end: '2026-11-04T14:00:00-08:00',
      when: whenLabel('2026-11-03T14:00:00-08:00', '2026-11-04T14:00:00-08:00'),
    };
    expect(take.when).toBe('Tue Nov 3 2 PM → Wed Nov 4 2 PM');
    expect(timePart(take)).toBe(take.when);
  });

  it('finds prep blocks that add up to the planned prep hours', () => {
    for (const x of data.exam_prep) {
      const sum = prepBlocks(data.plan, x).reduce((s, r) => s + r.hours, 0);
      expect(Math.round(sum * 10) / 10).toBeCloseTo(x.prep_hours, 1);
    }
  });

  it('defaults a session to the current block, else the next one', () => {
    const during = currentOrNextStudy(data.plan, NOW);
    expect(during?.title).toBe('Series: lectures 8–10');
    const between = currentOrNextStudy(data.plan, Date.parse('2026-10-22T15:00:00-07:00'));
    expect(between?.title).toBe('Reading: perception');
    expect(currentOrNextStudy(data.plan, Date.parse('2026-12-01T00:00:00-08:00'))).toBeUndefined();
  });
});

describe('buildPlan', () => {
  it('formats times in the given timezone with an offset, and DST changes the offset', () => {
    expect(localIso('2026-10-22T18:00:00Z', 'America/Los_Angeles')).toBe('2026-10-22T11:00:00-07:00');
    expect(localIso('2026-11-03T22:00:00Z', 'America/Los_Angeles')).toBe('2026-11-03T14:00:00-08:00');
    expect(localIso('2026-10-22T18:00:00Z', 'Asia/Tokyo')).toBe('2026-10-23T03:00:00+09:00');
    expect(whenLabel('2026-10-20T12:45:00-07:00', '2026-10-20T13:50:00-07:00')).toBe(
      'Tue Oct 20, 12:45 PM–1:50 PM',
    );
  });

  it('builds totals and prep hours per exam from rows', () => {
    const courses = [{ id: 'c', code: 'DSC 140A', name: null, color: 1, hidden: false }];
    const d = buildPlan(
      [
        {
          id: '1',
          course_id: 'c',
          kind: 'study',
          title: 'a',
          start_at: '2026-10-25T16:00:00Z',
          end_at: '2026-10-25T18:00:00Z',
          location: '',
          weight: null,
        },
        {
          id: '2',
          course_id: 'c',
          kind: 'study',
          title: 'after',
          start_at: '2026-10-27T16:00:00Z',
          end_at: '2026-10-27T17:00:00Z',
          location: '',
          weight: null,
        },
        {
          id: '3',
          course_id: 'c',
          kind: 'exam',
          title: 'Midterm',
          start_at: '2026-10-27T00:00:00Z',
          end_at: '2026-10-27T01:00:00Z',
          location: '',
          weight: '25',
          take_home: true,
        },
        {
          id: '4',
          course_id: null,
          kind: 'deadline',
          title: 'd',
          start_at: '2026-10-26T06:00:00Z',
          end_at: '2026-10-26T06:59:00Z',
          location: '',
          weight: null,
        },
      ],
      courses,
      'America/Los_Angeles',
    );
    expect(d.totals[0]).toEqual({ study_hours: 3, study_blocks: 2, exams: 1, deadlines: 1 });
    expect(d.exam_prep[0]).toMatchObject({
      course: 'DSC 140A',
      prep_hours: 2,
      weight: 25,
      location: 'Take-home',
      day: '2026-10-26',
    });
    expect(d.plan.find((r) => r.id === '4')?.course).toBe('General');
    expect(d.plan.map((r) => r.id)).toEqual(['1', '4', '3', '2']);
  });
});
