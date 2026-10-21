// Spotify remote control: Authorization Code with PKCE (no client secret, so it works on a static
// site) and the Web API player endpoints, which control the Spotify app already running on your
// phone or laptop. No Web Playback SDK: it's unreliable for Development Mode apps (docs/RESEARCH.md).
//
// Tokens are per device and live in localStorage, behind try/catch.

export const CLIENT_ID = (import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined) ?? '';
export const SCOPES =
  'user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private';
const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API = 'https://api.spotify.com/v1';

/** Spotify sends you back here (public/spotify.html), not to the site root, which Supabase sign-in uses. */
export const redirectUri = () => `${location.origin}${import.meta.env.BASE_URL}spotify.html`;

const KEY = {
  tokens: 'runway.spotify.tokens',
  verifier: 'runway.spotify.verifier',
  state: 'runway.spotify.state',
};
export const CALLBACK_KEY = 'runway.spotify.callback'; // written by public/spotify.html

const storage = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string | null) {
    try {
      if (v == null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      // storage blocked: Spotify stays disconnected on this device
    }
  },
};

interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // ms
}

const readTokens = (): Tokens | null => {
  try {
    return JSON.parse(storage.get(KEY.tokens) ?? 'null');
  } catch {
    return null;
  }
};
const writeTokens = (t: Tokens | null) => storage.set(KEY.tokens, t ? JSON.stringify(t) : null);

export const isConnected = () => !!readTokens();
export const disconnect = () => writeTokens(null);

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

export function randomVerifier(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(48)));
}

export async function challengeFor(verifier: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(d));
}

/** Sends the browser to Spotify's consent screen. */
export async function connect() {
  const verifier = randomVerifier();
  const state = randomVerifier().slice(0, 16);
  storage.set(KEY.verifier, verifier);
  storage.set(KEY.state, state);
  const q = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: await challengeFor(verifier),
    scope: SCOPES,
    state,
  });
  location.assign(`${AUTH_URL}?${q}`);
}

async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...body }),
  });
  if (!r.ok) throw new SpotifyError('auth', 'Spotify sign-in failed. Connect again.');
  const j = await r.json();
  const old = readTokens();
  const t: Tokens = {
    access_token: j.access_token,
    // Spotify may or may not rotate the refresh token; keep the old one if it doesn't.
    refresh_token: j.refresh_token ?? old?.refresh_token ?? '',
    expires_at: Date.now() + (j.expires_in ?? 3600) * 1000 - 60_000,
  };
  writeTokens(t);
  return t;
}

/**
 * Finishes the sign-in if public/spotify.html left a code for us. Returns true if it connected,
 * throws a plain-language SpotifyError if Spotify said no.
 */
export async function finishConnect(): Promise<boolean> {
  const raw = storage.get(CALLBACK_KEY);
  if (!raw) return false;
  storage.set(CALLBACK_KEY, null);
  const p = new URLSearchParams(raw);
  const expected = storage.get(KEY.state);
  const verifier = storage.get(KEY.verifier);
  storage.set(KEY.state, null);
  storage.set(KEY.verifier, null);
  if (p.get('error')) throw new SpotifyError('auth', 'Spotify connection was cancelled.');
  if (!p.get('code') || !verifier || p.get('state') !== expected)
    throw new SpotifyError('auth', 'Spotify connection expired. Try connecting again.');
  await tokenRequest({
    grant_type: 'authorization_code',
    code: p.get('code')!,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
  });
  return true;
}

export type SpotifyErrorKind = 'auth' | 'premium' | 'no_device' | 'rate' | 'other';

export class SpotifyError extends Error {
  constructor(
    public kind: SpotifyErrorKind,
    message: string,
    public retryAfterSec?: number,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Calls the Web API. Refreshes the token on 401 and backs off on 429, then maps what's left to
 * a plain-language error.
 */
export async function api<T = unknown>(path: string, init: RequestInit = {}, attempt = 0): Promise<T | null> {
  let t = readTokens();
  if (!t) throw new SpotifyError('auth', 'Spotify is not connected on this device.');
  if (Date.now() > t.expires_at)
    t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${t.access_token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  if (r.status === 204 || r.status === 202) return null;
  if (r.ok) {
    const text = await r.text();
    return text ? (JSON.parse(text) as T) : null;
  }
  if (r.status === 401 && attempt === 0) {
    await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
    return api<T>(path, init, 1);
  }
  if (r.status === 429) {
    const wait = Math.min(30, Number(r.headers.get('Retry-After')) || 1);
    if (attempt < 2) {
      await sleep(wait * 1000);
      return api<T>(path, init, attempt + 1);
    }
    throw new SpotifyError('rate', `Spotify asked us to slow down. Try again in ${wait} s.`, wait);
  }
  let reason = '';
  try {
    reason = (await r.json())?.error?.reason ?? '';
  } catch {
    // no JSON body
  }
  if (r.status === 401) {
    writeTokens(null);
    throw new SpotifyError('auth', 'Spotify signed you out. Connect again.');
  }
  if (r.status === 403 && reason === 'PREMIUM_REQUIRED')
    throw new SpotifyError('premium', 'Spotify control needs Premium.');
  if (r.status === 403)
    throw new SpotifyError(
      'other',
      "Spotify refused. Development Mode apps only work for accounts added in the app's Spotify dashboard.",
    );
  if (r.status === 404 && (reason === 'NO_ACTIVE_DEVICE' || path.startsWith('/me/player')))
    throw new SpotifyError('no_device', 'Open Spotify on your phone or laptop, then tap retry.');
  throw new SpotifyError('other', `Spotify returned an error (${r.status}).`);
}

// ── Player ────────────────────────────────────────────────────────────────────

export interface Device {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  volume_percent: number | null;
}

export interface PlayerState {
  is_playing: boolean;
  device: Device;
  item: {
    name: string;
    artists?: { name: string }[];
    show?: { name: string };
    album?: { images: { url: string; width: number }[] };
    images?: { url: string; width: number }[];
  } | null;
  context: { uri: string } | null;
}

export interface Playlist {
  id: string;
  name: string;
  uri: string;
  images: { url: string }[] | null;
}

const dev = (id?: string) => (id ? `?device_id=${encodeURIComponent(id)}` : '');

export const player = {
  state: () => api<PlayerState>('/me/player'),
  devices: async () => (await api<{ devices: Device[] }>('/me/player/devices'))?.devices ?? [],
  play: (opts: { context_uri?: string; device_id?: string } = {}) =>
    api(`/me/player/play${dev(opts.device_id)}`, {
      method: 'PUT',
      body: opts.context_uri ? JSON.stringify({ context_uri: opts.context_uri }) : undefined,
    }),
  pause: () => api('/me/player/pause', { method: 'PUT' }),
  next: () => api('/me/player/next', { method: 'POST' }),
  previous: () => api('/me/player/previous', { method: 'POST' }),
  volume: (pct: number) =>
    api(`/me/player/volume?volume_percent=${Math.round(Math.max(0, Math.min(100, pct)))}`, { method: 'PUT' }),
  transfer: (deviceId: string, play = true) =>
    api('/me/player', { method: 'PUT', body: JSON.stringify({ device_ids: [deviceId], play }) }),
  playlists: async () => (await api<{ items: Playlist[] }>('/me/playlists?limit=50'))?.items ?? [],
};

/** "https://open.spotify.com/playlist/37i9…?si=…" or "spotify:playlist:37i9…" → the playlist id. */
export function playlistId(input: string): string | null {
  const m = input.trim().match(/playlist[/:]([A-Za-z0-9]{10,})/);
  return m ? m[1] : null;
}
