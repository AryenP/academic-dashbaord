import { describe, expect, it } from 'vitest';
import { footprintLines, type Footprint } from './Footprint';

const NOW = Date.parse('2026-10-22T18:00:00-07:00');
const base: Footprint = {
  since: '2026-10-01T00:00:00Z',
  share_level: 'off',
  timezone: 'America/Los_Angeles',
  courses: 4,
  calendar_sources: 0,
  last_synced_at: null,
  events: 0,
  plan_items: 31,
  sessions: 1,
  session_breaks: 0,
  phone_events: 0,
  signals: 1,
  weekly_reviews: 0,
  friends: 0,
  tokens: [],
  phone_tracking: false,
  ai_calls_month: 0,
  ai_events_month: 0,
};

describe('what Runway holds about you', () => {
  it('says the counts in plain words, singular and plural', () => {
    const lines = footprintLines(base, NOW);
    expect(lines[0]).toBe('4 courses, 31 plan items, 0 calendar events and 1 session (0 breaks).');
    expect(lines[1]).toBe('There are no calendars connected.');
    expect(lines[2]).toBe('The model has read nothing this month.');
    expect(lines[3]).toBe('0 phone events and 1 phone signal, phone tracking off.');
    expect(lines[5]).toBe('No tokens made.');
    expect(lines[6]).toBe('Nobody can see your runway.');
  });

  it('names the calendars, the model’s reads, the tokens and the share level when they exist', () => {
    const lines = footprintLines(
      {
        ...base,
        calendar_sources: 2,
        last_synced_at: new Date(NOW - 12 * 60_000).toISOString(),
        events: 312,
        ai_calls_month: 3,
        ai_events_month: 48,
        tokens: ['feed', 'shortcut'],
        phone_tracking: true,
        share_level: 'readiness',
      },
      NOW,
    );
    expect(lines[1]).toContain('2 calendars connected, last read 12 min ago.');
    expect(lines[2]).toBe(
      'This month the model was sent 48 event titles with times and places, in 3 calls, and nothing else.',
    );
    expect(lines[3]).toContain('phone tracking on');
    expect(lines[5]).toBe('Tokens for the plan feed, the iPhone Shortcut; only their hashes are stored.');
    expect(lines[6]).toBe('Your share page shows your runway and exam readiness.');
  });
});
