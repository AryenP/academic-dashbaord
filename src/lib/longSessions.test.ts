import { describe, expect, it } from 'vitest';
import { hourThree, longPattern } from './longSessions';

const s = (hours: number, pct: number | null) => ({ focusSec: hours * 3600, focusPct: pct });

describe('hour three', () => {
  it('says nothing before three hours', () => {
    expect(hourThree(2.9 * 3600, [])).toBeNull();
  });

  it('with too little history it offers the plain line', () => {
    expect(hourThree(3 * 3600, [s(3.5, 60), s(1, 90)])).toMatch(/^Three hours in\. Ending here/);
    expect(longPattern([s(3.5, 60), s(3.2, 55), s(1, 90), s(1, 85)])).toBeNull(); // two long, not three
  });

  it('with three sessions on each side and a real gap it speaks in tends-to', () => {
    const history = [s(3.5, 62), s(3.2, 58), s(4, 60), s(1, 85), s(1.5, 80), s(2, 84), s(0.5, null)];
    expect(longPattern(history)).toEqual({ longAvg: 60, shortAvg: 83, longN: 3 });
    expect(hourThree(3 * 3600, history)).toBe(
      'Three hours in. Your sessions this long tend to run at 60 % focus, against 83 % for shorter ones (3 long sessions so far).',
    );
    const steady = [s(3.5, 82), s(3.2, 84), s(4, 86), s(1, 70), s(1.5, 72), s(2, 74)];
    expect(hourThree(4 * 3600, steady)).toMatch(/tend to hold up: 84 % focus, against 72 %/);
  });

  it('stays quiet below a five-point gap', () => {
    expect(longPattern([s(3.5, 80), s(3.2, 82), s(4, 81), s(1, 84), s(1.5, 83), s(2, 85)])).toBeNull();
  });
});
