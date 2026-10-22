import { describe, expect, it } from 'vitest';
import { demoPlan } from '../landing/demo';
import { forecast, loads } from './weather';

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
});
