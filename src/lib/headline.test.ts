import { describe, expect, it } from 'vitest';
import { demoPlan } from '../landing/demo';
import { headline, plain } from './headline';

// The demo plan, anchored to Thursday Oct 22 2026. MATH 20C Midterm 1 is Sunday 5–6 PM.
const at = (s: string) => Date.parse(s);
// One fixed plan; only the clock moves.
const d = demoPlan(at('2026-10-22T11:00:00-07:00'));
const say = (iso: string) => plain(headline(d.plan, d.exam_prep, at(iso)));

describe('the headline knows the hour', () => {
  it('by day it counts down and says what is on the calendar', () => {
    expect(say('2026-10-22T11:00:00-07:00')).toBe(
      '3 days until MATH 20C Midterm 1, Sun Oct 25, 5 PM–6 PM. You have 12 hours of prep on the calendar for it.',
    );
  });

  it('early in the morning it says when today starts', () => {
    expect(say('2026-10-22T07:00:00-07:00')).toBe(
      'Today starts at 9:30 AM with MATH 20C Series: lectures 8–10; 4.5 hours in 3 blocks. MATH 20C Midterm 1 is in 3 days.',
    );
  });

  it('at night it says whether anything is left and when tomorrow starts', () => {
    expect(say('2026-10-22T21:30:00-07:00')).toBe(
      'Tonight: CSE 12 PA 3 due, 11 PM–11:58 PM. Tomorrow starts at 10 AM with MATH 20C. MATH 20C Midterm 1 is in 3 days.',
    );
    expect(say('2026-10-23T23:59:30-07:00')).toBe(
      'Tonight is done. Tomorrow starts at 9 AM with CSE 12. MATH 20C Midterm 1 is in 2 days.',
    );
  });

  it('on exam day it gives the room and what is left before it, then goes quiet about prep', () => {
    expect(say('2026-10-25T08:00:00-07:00')).toBe(
      'Today: MATH 20C Midterm 1, 5 PM–6 PM, Center Hall 115. 8 of 12 prep hours done. 2 things before it, the first at 9:30 AM.',
    );
    expect(say('2026-10-25T16:30:00-07:00')).toBe(
      'Today: MATH 20C Midterm 1, 5 PM–6 PM, Center Hall 115. 12 of 12 prep hours done. Nothing else before it.',
    );
    expect(say('2026-10-25T17:20:00-07:00')).toBe(
      'Happening now: MATH 20C Midterm 1, Sun Oct 25, 5 PM–6 PM. 12 of 12 prep hours on the calendar ran before it.',
    );
  });

  it('after the last exam the term is over, unless blocks remain', () => {
    expect(say('2026-11-05T12:00:00-08:00')).toBe(
      'The term is over: every exam and every block on the runway is behind you.',
    );
    // The last exam passed at 11:48 AM on Nov 1; a HIST 10 block is still ahead that afternoon.
    expect(say('2026-11-01T12:30:00-08:00')).toBe('Every exam on the runway is behind you.');
  });
});
