import { describe, expect, it } from 'vitest';
import { patternSentences, type PatternFacts } from './patterns';

const base: PatternFacts = {
  days: 12,
  late: { n: 0, avg: null, other_n: 0, other_avg: null },
  sleep: { good_n: 0, good_avg: null, poor_n: 0, poor_avg: null },
  exercise: { active_days: 0, active_hours: null, rest_days: 0, rest_hours: null },
  places: [],
};

describe('patternSentences', () => {
  it('says nothing before a week of days, or with nothing to compare', () => {
    expect(patternSentences(null)).toEqual([]);
    expect(patternSentences({ ...base, days: 6 })).toEqual([]);
    expect(patternSentences(base)).toEqual([]);
  });

  it('needs a few sessions on both sides and a real difference', () => {
    const thin = { ...base, late: { n: 2, avg: 40, other_n: 9, other_avg: 62 } };
    expect(patternSentences(thin)).toEqual([]);
    const flat = { ...base, late: { n: 4, avg: 60, other_n: 9, other_avg: 62 } };
    expect(patternSentences(flat)).toEqual([]);
    const real = { ...base, late: { n: 4, avg: 40.4, other_n: 9, other_avg: 61.6 } };
    expect(patternSentences(real)).toEqual([
      'Focus after 11 PM tends to average 40 %, against 62 % earlier in the day.',
    ]);
  });

  it('phrases sleep as points and exercise as hours, always "tends to"', () => {
    const f: PatternFacts = {
      ...base,
      sleep: { good_n: 5, good_avg: 71.2, poor_n: 3, poor_avg: 58.9 },
      exercise: { active_days: 4, active_hours: 3.26, rest_days: 6, rest_hours: 1.9 },
    };
    const s = patternSentences(f);
    expect(s).toEqual([
      'After 7 hours of sleep or more, focus tends to run 12 points higher than after less.',
      'Days with 30 minutes of exercise or more tend to get 3.3 h of study, against 1.9 h on other days.',
    ]);
    for (const line of s) expect(line).toMatch(/tends? to/);
    for (const line of s) expect(line).not.toMatch(/because/i);
    // the other direction reads naturally too
    expect(
      patternSentences({ ...base, sleep: { good_n: 3, good_avg: 50, poor_n: 3, poor_avg: 62 } })[0],
    ).toBe('After 7 hours of sleep or more, focus tends to run 12 points lower than after less.');
  });

  it('compares places when there are two, and names one only when there is nothing else to say', () => {
    const two = {
      ...base,
      places: [
        { label: 'the library', n: 6, avg: 71 },
        { label: 'home', n: 8, avg: 55 },
        { label: 'the gym', n: 2, avg: 90 },
      ],
    };
    expect(patternSentences(two)).toEqual([
      'Sessions at the library tend to average 71 %, ahead of home at 55 %.',
    ]);
    const one = { ...base, places: [{ label: 'the library', n: 4, avg: 68 }] };
    expect(patternSentences(one)).toEqual(['Sessions at the library tend to average 68 %.']);
    // close places aren't ranked
    const close = {
      ...base,
      places: [
        { label: 'a', n: 4, avg: 60 },
        { label: 'b', n: 4, avg: 57 },
      ],
    };
    expect(patternSentences(close)).toEqual([]);
  });
});
