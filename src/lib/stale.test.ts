import { describe, expect, it } from 'vitest';
import { silence, staleness } from './stale';

const NOW = Date.parse('2026-10-22T18:00:00-07:00');
const ago = (h: number) => new Date(NOW - h * 3600_000).toISOString();
const src = (over: Partial<Parameters<typeof staleness>[0][number]>) => ({
  id: 's',
  kind: 'ical',
  status: 'ok',
  last_synced_at: ago(0.2),
  ...over,
});

describe('a sync that went quiet', () => {
  it('is fine within two hours, stale after', () => {
    expect(staleness([src({})], NOW).stale).toBe(false);
    expect(staleness([src({ last_synced_at: ago(1.9) })], NOW).stale).toBe(false);
    expect(staleness([src({ last_synced_at: ago(2.1) })], NOW).stale).toBe(true);
    expect(staleness([src({ last_synced_at: null })], NOW).stale).toBe(true);
  });

  it('takes the freshest source, ignores uploads, and defers to an error that already explains itself', () => {
    expect(
      staleness([src({ last_synced_at: ago(5) }), src({ id: 't', last_synced_at: ago(0.5) })], NOW).stale,
    ).toBe(false);
    expect(staleness([src({ kind: 'ics_upload', last_synced_at: ago(9) })], NOW).stale).toBe(false);
    expect(staleness([], NOW).stale).toBe(false);
    expect(staleness([src({ last_synced_at: ago(9), status: 'error' })], NOW).stale).toBe(false);
    expect(staleness([src({ last_synced_at: ago(9) })], NOW).latest).toBe(ago(9));
  });

  it('says how long', () => {
    expect(silence(ago(3), NOW)).toBe('3 h');
    expect(silence(ago(50), NOW)).toBe('2 days');
    expect(silence(null, NOW)).toBe('ever');
  });
});
