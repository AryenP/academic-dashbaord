// Fetching a calendar feed safely: only public hosts, a size cap, a timeout, and conditional
// requests so an unchanged feed costs one round trip.

export const MAX_BYTES = 5 * 1024 * 1024;
export const TIMEOUT_MS = 15_000;

const PRIVATE_HOST =
  /^(localhost|.*\.local|.*\.internal|10\.\d+\.\d+\.\d+|127\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|0\.0\.0\.0|\[?::1\]?|\[?f[cd][0-9a-f]{2}:.*)$/i;

/** Local development: the stack runs on 127.0.0.1 and test feeds come from the host machine. */
export const isLocalDev = () => /127\.0\.0\.1|localhost|kong/.test(Deno.env.get('SUPABASE_URL') ?? '');

export function checkUrl(raw: string): { url: URL } | { error: string } {
  let url: URL;
  try {
    url = new URL(raw.trim().replace(/^webcal:\/\//i, 'https://'));
  } catch {
    return { error: 'not_a_url' };
  }
  if (/…|\.\.\.$/.test(raw)) return { error: 'truncated' };
  if (url.protocol !== 'https:' && !(isLocalDev() && url.protocol === 'http:')) return { error: 'not_https' };
  if (!isLocalDev() && PRIVATE_HOST.test(url.hostname)) return { error: 'private_host' };
  if (url.username || url.password) return { error: 'not_a_url' };
  return { url };
}

export interface Fetched {
  status: number; // 304 when unchanged
  text: string;
  etag: string | null;
  lastModified: string | null;
  contentType: string;
}

export const MAX_HOPS = 3;

export async function fetchFeed(
  url: URL,
  cond: { etag?: string | null; lastModified?: string | null } = {},
  fetchImpl: typeof fetch = fetch,
  opts: { checkHops?: boolean } = {},
): Promise<Fetched> {
  const headers: Record<string, string> = {
    'user-agent': 'Runway calendar sync (+https://aryenp.github.io/academic-dashbaord/)',
    accept: 'text/calendar, text/plain;q=0.8, */*;q=0.1',
  };
  if (cond.etag) headers['if-none-match'] = cond.etag;
  if (cond.lastModified) headers['if-modified-since'] = cond.lastModified;
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  // With checkHops, redirects are followed by hand and every hop passes checkUrl, so a public
  // address can't bounce the fetch to a private one. Anything anyone can call uses it.
  let target = url;
  let r: Response;
  for (let hop = 0; ; hop++) {
    r = await fetchImpl(target, { headers, redirect: opts.checkHops ? 'manual' : 'follow', signal });
    if (!opts.checkHops || r.status < 300 || r.status >= 400 || r.status === 304) break;
    const location = r.headers.get('location');
    await r.body?.cancel();
    if (!location || hop >= MAX_HOPS) throw new HttpError(r.status);
    const next = checkUrl(new URL(location, target).toString());
    if ('error' in next) throw new RedirectRefused(next.error);
    target = next.url;
  }
  const contentType = r.headers.get('content-type') ?? '';
  if (r.status === 304)
    return {
      status: 304,
      text: '',
      etag: cond.etag ?? null,
      lastModified: cond.lastModified ?? null,
      contentType,
    };
  if (!r.ok) {
    await r.body?.cancel();
    throw new HttpError(r.status);
  }
  const len = Number(r.headers.get('content-length') ?? 0);
  if (len > MAX_BYTES) {
    await r.body?.cancel();
    throw new TooLarge();
  }
  const reader = r.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new TooLarge();
      }
      chunks.push(value);
    }
  }
  const all = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.byteLength;
  }
  return {
    status: r.status,
    text: new TextDecoder().decode(all),
    etag: r.headers.get('etag'),
    lastModified: r.headers.get('last-modified'),
    contentType,
  };
}

export class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}
export class TooLarge extends Error {
  constructor() {
    super('feed larger than 5 MB');
  }
}
export class NotACalendarLike extends Error {
  constructor() {
    super('the address returned a web page, not a calendar');
  }
}
export class RedirectRefused extends Error {
  constructor(public reason: string) {
    super(`a redirect went somewhere Runway won't fetch (${reason})`);
  }
}
