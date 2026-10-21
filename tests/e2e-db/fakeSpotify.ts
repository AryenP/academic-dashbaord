import type { Page, Route } from '@playwright/test';

// A fake Spotify at the network layer: PKCE redirect, token exchange and the player API.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
};
const PLAYLISTS = [
  { id: 'focus1', name: 'Deep Focus', uri: 'spotify:playlist:focus1', images: [] },
  { id: 'break1', name: 'Lofi Break', uri: 'spotify:playlist:break1', images: [] },
];

export interface Fake {
  calls: { method: string; path: string; body: unknown }[];
  playing: boolean;
  failNext: { status: number; reason: string } | null;
  tokenBodies: string[];
}

export async function fakeSpotify(page: Page): Promise<Fake> {
  const f: Fake = { calls: [], playing: false, failNext: null, tokenBodies: [] };
  const json = (route: Route, status: number, body?: unknown) =>
    route.fulfill({
      status,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: body === undefined ? '' : JSON.stringify(body),
    });

  await page.route('https://accounts.spotify.com/authorize?**', (route) => {
    const u = new URL(route.request().url());
    const back = `${u.searchParams.get('redirect_uri')}?code=fake-code&state=${u.searchParams.get('state')}`;
    return route.fulfill({ status: 302, headers: { location: back } });
  });
  await page.route('https://accounts.spotify.com/api/token', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    f.tokenBodies.push(route.request().postData() ?? '');
    return json(route, 200, { access_token: 'tok', refresh_token: 'ref', expires_in: 3600 });
  });
  await page.route('https://api.spotify.com/v1/**', (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const path = new URL(req.url()).pathname.replace('/v1', '');
    const body = req.postData() ? JSON.parse(req.postData()!) : null;
    if (!(req.method() === 'GET' && path === '/me/player'))
      f.calls.push({ method: req.method(), path, body });
    if (f.failNext && req.method() !== 'GET') {
      const e = f.failNext;
      f.failNext = null;
      return json(route, e.status, { error: { status: e.status, message: 'x', reason: e.reason } });
    }
    if (path === '/me/player' && req.method() === 'GET')
      return json(route, 200, {
        is_playing: f.playing,
        device: { id: 'mac', name: "Aryen's MacBook", type: 'Computer', is_active: true, volume_percent: 60 },
        item: { name: 'Weightless', artists: [{ name: 'Marconi Union' }], album: { images: [] } },
        context: null,
      });
    if (path === '/me/player/devices')
      return json(route, 200, {
        devices: [
          { id: 'mac', name: "Aryen's MacBook", type: 'Computer', is_active: true, volume_percent: 60 },
          { id: 'iph', name: "Aryen's iPhone", type: 'Smartphone', is_active: false, volume_percent: 80 },
        ],
      });
    if (path === '/me/playlists') return json(route, 200, { items: PLAYLISTS });
    if (path === '/me/player/play') f.playing = true;
    if (path === '/me/player/pause') f.playing = false;
    return route.fulfill({ status: 204, headers: CORS });
  });
  return f;
}

/** Marks this browser as already connected to (fake) Spotify. */
export async function connectedSpotify(page: Page) {
  const f = await fakeSpotify(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      'runway.spotify.tokens',
      JSON.stringify({ access_token: 'tok', refresh_token: 'ref', expires_at: Date.now() + 3_600_000 }),
    ),
  );
  f.playing = true;
  return f;
}
