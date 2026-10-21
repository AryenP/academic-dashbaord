import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CALLBACK_KEY,
  SpotifyError,
  api,
  challengeFor,
  finishConnect,
  isConnected,
  playlistId,
} from './spotify';

const tokens = (over = {}) =>
  localStorage.setItem(
    'runway.spotify.tokens',
    JSON.stringify({ access_token: 'A', refresh_token: 'R', expires_at: Date.now() + 3_600_000, ...over }),
  );
const res = (status: number, body?: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('PKCE', () => {
  it('challenge is the base64url sha256 of the verifier, with no padding', async () => {
    const v = 'dBjftJeZ4CVP-mJ92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const expected = createHash('sha256').update(v).digest('base64url');
    expect(await challengeFor(v)).toBe(expected);
    expect(expected).not.toMatch(/[+/=]/);
  });

  it('finishConnect rejects a mismatched state and exchanges a good code', async () => {
    localStorage.setItem('runway.spotify.verifier', 'v');
    localStorage.setItem('runway.spotify.state', 's1');
    localStorage.setItem(CALLBACK_KEY, 'code=c&state=WRONG');
    await expect(finishConnect()).rejects.toBeInstanceOf(SpotifyError);
    expect(isConnected()).toBe(false);

    localStorage.setItem('runway.spotify.verifier', 'v');
    localStorage.setItem('runway.spotify.state', 's1');
    localStorage.setItem(CALLBACK_KEY, 'code=c&state=s1');
    fetchMock.mockResolvedValueOnce(res(200, { access_token: 'A', refresh_token: 'R', expires_in: 3600 }));
    expect(await finishConnect()).toBe(true);
    expect(isConnected()).toBe(true);
    const body = String(fetchMock.mock.calls[0][1].body);
    expect(body).toContain('grant_type=authorization_code');
    expect(body).toContain('code_verifier=v');
  });

  it('nothing to finish without a callback', async () => {
    expect(await finishConnect()).toBe(false);
  });
});

describe('api errors', () => {
  it('refreshes on 401 and retries once', async () => {
    tokens();
    fetchMock
      .mockResolvedValueOnce(res(401, { error: { status: 401 } }))
      .mockResolvedValueOnce(res(200, { access_token: 'B', expires_in: 3600 }))
      .mockResolvedValueOnce(res(200, { is_playing: true }));
    expect(await api('/me/player')).toEqual({ is_playing: true });
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer B');
  });

  it('refreshes an expired token before calling', async () => {
    tokens({ expires_at: Date.now() - 1 });
    fetchMock
      .mockResolvedValueOnce(res(200, { access_token: 'C', refresh_token: 'R2', expires_in: 3600 }))
      .mockResolvedValueOnce(res(204));
    expect(await api('/me/player/pause', { method: 'PUT' })).toBeNull();
    expect(JSON.parse(localStorage.getItem('runway.spotify.tokens')!).refresh_token).toBe('R2');
  });

  it('403 PREMIUM_REQUIRED says Premium is needed', async () => {
    tokens();
    fetchMock.mockResolvedValueOnce(res(403, { error: { status: 403, reason: 'PREMIUM_REQUIRED' } }));
    await expect(api('/me/player/play', { method: 'PUT' })).rejects.toMatchObject({
      kind: 'premium',
      message: 'Spotify control needs Premium.',
    });
  });

  it('404 NO_ACTIVE_DEVICE asks you to open Spotify', async () => {
    tokens();
    fetchMock.mockResolvedValueOnce(res(404, { error: { status: 404, reason: 'NO_ACTIVE_DEVICE' } }));
    await expect(api('/me/player/play', { method: 'PUT' })).rejects.toMatchObject({
      kind: 'no_device',
      message: 'Open Spotify on your phone or laptop, then tap retry.',
    });
  });

  it('429 waits for Retry-After, then retries', async () => {
    vi.useFakeTimers();
    tokens();
    fetchMock.mockResolvedValueOnce(res(429, {}, { 'Retry-After': '2' })).mockResolvedValueOnce(res(204));
    const p = api('/me/player/next', { method: 'POST' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(await p).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('not connected is an auth error', async () => {
    await expect(api('/me/player')).rejects.toMatchObject({ kind: 'auth' });
  });
});

it('playlistId reads links and URIs', () => {
  expect(playlistId('https://open.spotify.com/playlist/37i9dQZF1DX8Uebhn9wzrS?si=abc')).toBe(
    '37i9dQZF1DX8Uebhn9wzrS',
  );
  expect(playlistId('spotify:playlist:37i9dQZF1DX8Uebhn9wzrS')).toBe('37i9dQZF1DX8Uebhn9wzrS');
  expect(playlistId('lofi beats')).toBeNull();
});
