import { expect, test } from '@playwright/test';
import { fakeSpotify, type Fake } from './fakeSpotify';
import { admin, resetDb, signIn } from './helpers';

// Spotify against a fake Spotify: the PKCE redirect, token exchange and player API are all mocked
// at the network layer, so this checks Runway's side of every call without a real account.

const lastPlay = (f: Fake) =>
  [...f.calls].reverse().find((c) => c.path === '/me/player/play' || c.path === '/me/player/pause');

test.beforeEach(async () => {
  await resetDb();
});

test('connect with PKCE, pick playlists, and music follows the session', async ({ page }) => {
  const f = await fakeSpotify(page);
  await signIn(page);
  await page.goto('./#/settings');
  await page.getByRole('button', { name: 'Connect Spotify' }).click();
  await expect(page.getByText('Spotify is connected')).toBeVisible();
  expect(f.tokenBodies[0]).toContain('grant_type=authorization_code');
  expect(f.tokenBodies[0]).toContain('code=fake-code');
  expect(f.tokenBodies[0]).toMatch(/code_verifier=[\w-]{40,}/);
  expect(f.tokenBodies[0]).toContain(encodeURIComponent('/academic-dashbaord/spotify.html'));

  await page.getByRole('combobox', { name: 'Focus playlist' }).selectOption({ label: 'Deep Focus' });
  await page.getByRole('combobox', { name: 'Break playlist' }).selectOption({ label: 'Lofi Break' });

  await page.getByRole('button', { name: 'Start session' }).click();
  await expect
    .poll(() => lastPlay(f))
    .toMatchObject({ path: '/me/player/play', body: { context_uri: 'spotify:playlist:focus1' } });
  await expect(page.getByText('Weightless')).toBeVisible();
  await expect(page.getByText('Marconi Union')).toBeVisible();

  await page.getByRole('button', { name: 'Break', exact: true }).click();
  await expect.poll(() => lastPlay(f)).toMatchObject({ body: { context_uri: 'spotify:playlist:break1' } });
  await page.getByRole('button', { name: 'Back to work' }).click();
  await expect.poll(() => lastPlay(f)).toMatchObject({ body: { context_uri: 'spotify:playlist:focus1' } });
  await page.getByRole('button', { name: 'End' }).click();
  await expect.poll(() => lastPlay(f)?.path).toBe('/me/player/pause');
});

test('controls, device picker, and plain-language errors with retry', async ({ page }) => {
  const f = await fakeSpotify(page);
  await signIn(page);
  await page.goto('./#/settings');
  await page.getByRole('button', { name: 'Connect Spotify' }).click();
  await expect(page.getByText('Spotify is connected')).toBeVisible();
  await page.goto('./#/focus');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByText('Weightless')).toBeVisible();

  await page.getByRole('button', { name: 'Next track' }).click();
  await expect.poll(() => f.calls.some((c) => c.path === '/me/player/next')).toBe(true);

  await page.getByRole('button', { name: "Aryen's MacBook" }).click();
  await page.getByRole('button', { name: /Aryen's iPhone/ }).click();
  await expect
    .poll(() => f.calls.find((c) => c.path === '/me/player' && c.method === 'PUT')?.body)
    .toEqual({ device_ids: ['iph'], play: true });

  f.failNext = { status: 404, reason: 'NO_ACTIVE_DEVICE' };
  await page.getByRole('button', { name: 'Previous track' }).click();
  await expect(page.getByRole('alert')).toHaveText(/Open Spotify on your phone or laptop, then tap retry\./);
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(f.calls.filter((c) => c.path === '/me/player/previous')).toHaveLength(2);

  f.failNext = { status: 403, reason: 'PREMIUM_REQUIRED' };
  await page.getByRole('button', { name: 'Next track' }).click();
  await expect(page.getByRole('alert')).toContainText('Spotify control needs Premium.');
});

test('without Spotify connected, an embedded playlist plays on the focus screen', async ({ page }) => {
  await signIn(page);
  await page.goto('./#/settings');
  const field = page.getByLabel("Playlist to embed when Spotify isn't connected (optional)");
  await field.fill('https://open.spotify.com/playlist/37i9dQZF1DX8Uebhn9wzrS?si=x');
  await field.blur();
  await expect
    .poll(async () => (await admin.from('profiles').select('settings').single()).data?.settings)
    .toMatchObject({ embed_playlist: expect.stringContaining('37i9dQZF1DX8Uebhn9wzrS') });
  await page.goto('./#/focus');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('iframe[title="Spotify playlist"]')).toHaveAttribute(
    'src',
    /open\.spotify\.com\/embed\/playlist\/37i9dQZF1DX8Uebhn9wzrS/,
  );
});
