import { describe, expect, it } from 'vitest';
import { demoPlan } from '../landing/demo';
import { forecast, loads, overfull } from './weather';

const NOW = Date.parse('2026-10-22T11:00:00-07:00');
const data = demoPlan(NOW);

describe('the week as a forecast', () => {
  it('measures each day in study and class hours and marks exam days', () => {
    const week = loads(data.plan, NOW);
    expect(week.map((d) => d.name)).toEqual([
      'today',
      'tomorrow',
      'Saturday',
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
    ]);
    expect(week[0].hours).toBe(3.5);
    expect(week[3].exam).toBe(true);
  });

  it('reads as one line: heavy days, clear days, exam days', () => {
    expect(forecast(data.plan, NOW)).toBe(
      'The week: heavy tomorrow, Saturday, Monday and Tuesday, exams Sunday and Wednesday.',
    );
  });

  it('says nothing about an even week, and names a clear weekend', () => {
    const light = data.plan.filter((r) => r.kind === 'Deadline');
    expect(forecast(light, NOW)).toBe(
      'The week: clear today, tomorrow, the weekend, Monday, Tuesday and Wednesday.',
    );
    const even = data.plan.map((r) => ({ ...r, hours: 2 })).filter((r) => r.kind === 'Study');
    const one = even.filter((r, i, a) => a.findIndex((x) => x.day === r.day) === i);
    expect(forecast(one, NOW)).toBe('');
  });

  it('finds a day with more study than the window has room for', () => {
    // Saturday Oct 24 holds 4 h of study; add a 9–5 shift and the day has 4 free hours of 13 minus 8.
    const sat = data.plan.filter((r) => r.day === '2026-10-24');
    const shift = {
      ...sat[0],
      id: 'shift',
      kind: 'Commitment' as const,
      title: 'Work shift',
      start: '2026-10-24T09:00:00-07:00',
      end: '2026-10-24T17:00:00-07:00',
      hours: 8,
    };
    const plan = [...data.plan, shift];
    expect(overfull(data.plan, NOW)).toEqual([]);
    // 9 AM to 10 PM minus the shift leaves 5 free hours: 4 h of study still fits.
    expect(overfull(plan, NOW)).toEqual([]);
    // A narrower window makes Saturday (and other heavy days) overfull; a day off is left alone.
    const sat24 = (w: Parameters<typeof overfull>[2]) =>
      overfull(plan, NOW, w).find((o) => o.day === '2026-10-24');
    expect(sat24({ earliest: '18:00', latest: '22:00' })).toBeUndefined(); // 4 h in 4 free still fits
    expect(sat24({ earliest: '18:00', latest: '21:00' })).toEqual({
      day: '2026-10-24',
      name: 'Saturday',
      planned: 4,
      free: 3,
    });
    expect(sat24({ earliest: '18:00', latest: '21:00', days_off: [6] })).toBeUndefined();
    expect(forecast(plan, NOW, { earliest: '18:00', latest: '21:00' })).toContain(
      'overfull Saturday (4 h of study in 3 free)',
    );
  });
});
