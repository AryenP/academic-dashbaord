import { describe, expect, it } from 'vitest';
import { EXPORT_KEYS, exportFilename } from './export';

describe('download my data', () => {
  it('names the file after the handle and the day', () => {
    expect(exportFilename('aryen', new Date(2026, 9, 22, 23, 30))).toBe('runway-aryen-2026-10-22.json');
    expect(exportFilename(null, new Date(2026, 0, 5))).toBe('runway-me-2026-01-05.json');
    expect(exportFilename('../x y', new Date(2026, 0, 5))).toBe('runway-xy-2026-01-05.json');
  });
  it('covers every table that holds personal rows', () => {
    expect(EXPORT_KEYS).toContain('phone_events');
    expect(EXPORT_KEYS).toContain('signals');
    expect(EXPORT_KEYS).toContain('access_tokens');
    expect(EXPORT_KEYS).toContain('calendar_sources');
  });
});
