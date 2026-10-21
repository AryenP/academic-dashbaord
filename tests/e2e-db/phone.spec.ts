import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { API_URL, admin, resetDb, seedSession, signIn } from './helpers';

// Phone tracking end to end: token, setup check, live meter, frozen metrics, and the phone ending a
// session. Needs the Edge Function served locally (`supabase functions serve`, or `supabase start`).

const FN = `${API_URL}/functions/v1/phone-event`;
const TOKEN = 'rw_test_token_0123456789abcdef';
const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const post = (body: object) =>
  fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

let userId: string;
test.beforeEach(async () => {
  userId = await resetDb();
});

async function useToken() {
  const hash = createHash('sha256').update(TOKEN).digest('hex');
  await admin.from('profiles').update({ phone_token_hash: hash }).eq('id', userId);
}

test('make a token in settings; the setup guide fills it in and turns green on the first event', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('./#/settings');
  await page.getByRole('button', { name: 'Make a token' }).click();
  const token = (await page.locator('.token-box code').textContent())!;
  expect(token).toMatch(/^rw_[\w-]{40,}$/);
  const { data } = await admin.from('profiles').select('phone_token_hash').eq('id', userId).single();
  expect(data!.phone_token_hash).toBe(createHash('sha256').update(token).digest('hex'));
  await expect(page.getByText('Instagram', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'setup guide' }).first().click();
  await expect(page.getByRole('heading', { name: 'Set up your iPhone' })).toBeVisible();
  await expect(page.locator('.copy-field code').first()).toHaveText(token);
  await expect(page.getByText('Waiting for the first event from your phone…')).toBeVisible();
  const r = await post({ token, app: 'Instagram', kind: 'open' });
  expect(r.status).toBe(204);
  await expect(page.getByText(/Got it: Instagram opened/)).toBeVisible({ timeout: 10_000 });
});

test('the browser test button reaches the function (CORS) and turns the check green', async ({ page }) => {
  await signIn(page);
  await page.goto('./#/settings');
  await page.getByRole('button', { name: 'Make a token' }).click();
  await page.getByRole('link', { name: 'setup guide' }).first().click();
  await page.getByRole('button', { name: 'Send a test from this browser' }).click();
  await expect(page.getByText(/Got it: Instagram closed/)).toBeVisible({ timeout: 10_000 });
});

test('the focus screen shows live phone time, and ending freezes the metrics', async ({ page }) => {
  await useToken();
  const s = await seedSession(userId, { startedMinAgo: 20 });
  await admin.from('phone_events').insert([
    { user_id: userId, app: 'Instagram', kind: 'open', at: minsAgo(10), received_at: minsAgo(10) },
    { user_id: userId, app: 'Instagram', kind: 'close', at: minsAgo(7), received_at: minsAgo(7) },
  ]);
  await signIn(page);
  await page.goto('./#/focus');
  const meter = page.locator('.fx-phone');
  await expect(meter).toContainText('Phone 3:00');
  await expect(meter).toContainText('1 pickup');
  await expect(meter).toContainText('85% focus');

  // A new open arrives live.
  await post({ token: TOKEN, app: 'TikTok', kind: 'open' });
  await expect(meter).toContainText('TikTok open', { timeout: 10_000 });
  await post({ token: TOKEN, app: 'TikTok', kind: 'close' });
  await expect(meter).toContainText('2 pickups', { timeout: 10_000 });

  await page.getByRole('button', { name: 'How focus is measured' }).click();
  await expect(page.getByRole('note')).toContainText('1 − phone time ÷ focus time');

  await page.getByRole('button', { name: 'End' }).click();
  await expect(page.getByRole('heading', { name: 'Session done.' })).toBeVisible();
  await expect(page.getByText('Pickups', { exact: true })).toBeVisible();
  // The end screen shows before the frozen metrics are saved, so wait for them.
  await expect
    .poll(async () => (await admin.from('sessions').select('pickups').eq('id', s.id).single()).data?.pickups)
    .toBe(2);
  const { data } = await admin.from('sessions').select('*').eq('id', s.id).single();
  expect(data!.phone_seconds).toBeGreaterThanOrEqual(180);
  expect(Number(data!.focus_pct)).toBeGreaterThan(80);
  expect(Number(data!.focus_pct)).toBeLessThan(86);
});

test('the phone can start and end a session; ending from the phone freezes metrics too', async ({ page }) => {
  await useToken();
  await signIn(page);
  await page.goto('./');
  expect((await post({ token: TOKEN, kind: 'session_start' })).status).toBe(204);
  await expect(page.locator('.live-chip')).toBeVisible({ timeout: 10_000 });
  await post({ token: TOKEN, app: 'Reddit', kind: 'open' });
  await post({ token: TOKEN, app: 'Reddit', kind: 'close' });
  expect((await post({ token: TOKEN, kind: 'session_end' })).status).toBe(204);
  await expect(page.locator('.live-chip')).toHaveCount(0, { timeout: 10_000 });
  const { data } = await admin.from('sessions').select('*').single();
  expect(data).toMatchObject({ source: 'phone', pickups: 1 });
  expect(data!.ended_at).not.toBeNull();
  expect(data!.focus_pct).not.toBeNull();
});

test('a visitor never sees phone data', async ({ page }) => {
  await useToken();
  await post({ token: TOKEN, app: 'Instagram', kind: 'open' });
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Your runway to every exam.' })).toBeVisible();
  await expect(page.getByText('Instagram')).toHaveCount(0);
  await page.goto('./#/setup/phone');
  await expect(page.getByRole('heading', { name: 'Sign in to set up phone tracking.' })).toBeVisible();
});
