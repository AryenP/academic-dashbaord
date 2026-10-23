// A sync that stops is worse than one that fails: a failed source says so in Settings, a stopped
// cron leaves every source quietly saying "synced 3 days ago". After this long without a read,
// the runway changes voice. No imports, so it can be tested alone and shared.

export const STALE_AFTER_MS = 2 * 3600_000;

export interface SyncedSource {
  id: string;
  kind: string;
  status: string;
  last_synced_at: string | null;
}

export interface Staleness {
  /** The sources that should be read on a schedule (not uploads). */
  scheduled: SyncedSource[];
  /** The most recent read across them, or null when none has been read. */
  latest: string | null;
  /** True when every scheduled source is older than the limit (or never read) and none is erroring. */
  stale: boolean;
}

export function staleness(sources: SyncedSource[], now: number, after = STALE_AFTER_MS): Staleness {
  const scheduled = sources.filter((s) => s.kind !== 'ics_upload');
  const reads = scheduled.map((s) => s.last_synced_at).filter((t): t is string => !!t);
  const latest = reads.length ? reads.sort().at(-1)! : null;
  // An erroring source already explains itself in Settings; this is about silence.
  const erroring = scheduled.some((s) => s.status === 'error');
  const stale = scheduled.length > 0 && !erroring && (latest === null || now - Date.parse(latest) > after);
  return { scheduled, latest, stale };
}

/** "3 h", "2 days": how long the silence has lasted. */
export function silence(latest: string | null, now: number): string {
  if (!latest) return 'ever';
  const h = Math.round((now - Date.parse(latest)) / 3600_000);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} days`;
}
