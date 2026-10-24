import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearPending, loadPending, PENDING_KEY, PENDING_TTL_MS, savePending } from './pending';

const mem = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
});
afterEach(() => mem.clear());

const T = Date.parse('2026-10-23T18:00:00Z');
const P = { kind: 'ical' as const, label: 'Google Calendar', url: 'https://calendar.google.com/x/basic.ics' };

describe('the address waiting for sign-in', () => {
  it('is kept for a day, then forgotten', () => {
    expect(savePending(P, T)).toBe(true);
    expect(loadPending(T + 3600_000)).toEqual({ ...P, at: T });
    expect(loadPending(T + PENDING_TTL_MS + 1)).toBeNull();
    expect(mem.has(PENDING_KEY)).toBe(false); // an expired one is removed, not just ignored
  });

  it('is cleared on request, and anything malformed is dropped', () => {
    savePending(P, T);
    clearPending();
    expect(loadPending(T)).toBeNull();
    mem.set(PENDING_KEY, '{not json');
    expect(loadPending(T)).toBeNull();
    mem.set(PENDING_KEY, JSON.stringify({ ...P, url: 'javascript:alert(1)', at: T }));
    expect(loadPending(T)).toBeNull();
    mem.set(PENDING_KEY, JSON.stringify({ ...P, kind: 'ics_upload', at: T }));
    expect(loadPending(T)).toBeNull();
  });

  it('works without storage at all', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });
    expect(savePending(P, T)).toBe(false);
    expect(loadPending(T)).toBeNull();
    expect(() => clearPending()).not.toThrow();
  });
});
