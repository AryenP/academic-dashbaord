// A calendar address tried before the account existed (#/try), waiting in this browser for the
// sign-in to finish. At most a day; then it is added to the account the way Connect adds one (the
// address goes into Vault) and leaves the browser. Storage can be missing or refuse writes (private
// windows, blocked site data): every access is guarded and the app works without it.

export const PENDING_KEY = 'runway:pending-source';
export const PENDING_TTL_MS = 24 * 3600_000;
/** Session storage: why a waiting calendar couldn't be added, for Connect to say once. */
export const PENDING_ERROR_KEY = 'runway:pending-error';

export interface PendingSource {
  kind: 'ical' | 'canvas';
  label: string;
  url: string;
  at: number;
}

export function savePending(p: Omit<PendingSource, 'at'>, now = Date.now()): boolean {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ ...p, at: now }));
    return true;
  } catch {
    return false;
  }
}

export function clearPending() {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    // nothing to clear
  }
}

/** The waiting address, or null when there is none, it is malformed, or it is more than a day old. */
export function loadPending(now = Date.now()): PendingSource | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<PendingSource>;
    const ok =
      (p.kind === 'ical' || p.kind === 'canvas') &&
      typeof p.label === 'string' &&
      typeof p.url === 'string' &&
      /^(https?|webcal):\/\//i.test(p.url) &&
      typeof p.at === 'number' &&
      now - p.at >= 0 &&
      now - p.at < PENDING_TTL_MS;
    if (!ok) {
      clearPending();
      return null;
    }
    return p as PendingSource;
  } catch {
    clearPending();
    return null;
  }
}
