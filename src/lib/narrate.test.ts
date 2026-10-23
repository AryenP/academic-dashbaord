import { describe, expect, it } from 'vitest';
import { demoPlan } from '../landing/demo';
import { dayWords, narrate } from './narrate';

const NOW = Date.parse('2026-10-22T11:00:00-07:00');
const data = demoPlan(NOW);

describe('the runway in words', () => {
  it('tells a day as one sentence, exams first, study grouped by course, deadlines last', () => {
    const sun = data.plan.filter((r) => r.day === '2026-10-25');
    expect(dayWords(sun)).toBe(
      'MATH 20C Midterm 1 at 5 PM–6 PM in Center Hall 115; two study blocks for MATH 20C, 9:30 AM–12:30 PM and 3 PM–4 PM; one study block for CSE 12, 7:30 PM–9:30 PM.',
    );
    const today = data.plan.filter((r) => r.day === '2026-10-22');
    expect(dayWords(today)).toBe(
      'One study block for MATH 20C, 9:30 AM–11:30 AM; one study block for COGS 1, 6 PM–7:30 PM; CSE 12 PA 3 due 11:58 PM.',
    );
  });

  it('says so when nothing is planned, and skips proposals', () => {
    expect(dayWords([])).toBe('Nothing planned.');
    expect(
      dayWords(data.plan.filter((r) => r.day === '2026-10-22').map((r) => ({ ...r, proposed: true }))),
    ).toBe('Nothing planned.');
  });

  it('covers the next seven days with their names', () => {
    const week = narrate(data.plan, NOW);
    expect(week.map((d) => d.heading)).toEqual([
      'Today',
      'Tomorrow',
      'Sat Oct 24',
      'Sun Oct 25',
      'Mon Oct 26',
      'Tue Oct 27',
      'Wed Oct 28',
    ]);
    expect(week[1].text).toContain('one class: HIST 10 2 PM–3:18 PM');
  });

  it('appends a note to a day when given one', () => {
    const notes = new Map([['2026-10-22', 'Overfull: 5 h of study in 3 free.']]);
    expect(narrate(data.plan, NOW, 2, notes)[0].text).toMatch(/\. Overfull: 5 h of study in 3 free\.$/);
    expect(narrate(data.plan, NOW, 2, notes)[1].text).not.toContain('Overfull');
  });
});
