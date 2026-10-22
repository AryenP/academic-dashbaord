import { expect, test } from '@playwright/test';
import { API_URL, resetDb, signIn } from './helpers';

// The iPhone Shortcut card: the drawn steps, a token made once, the address to post to, and what
// the phone sends showing up in "Received from your phone". The Shortcut itself is played by a
// fetch to the local signals function.

test.beforeEach(async () => {
  await resetDb();
});

test('settings: make a shortcut token, post a night, see it listed', async ({ page, request }) => {
  await signIn(page);
  await page.goto('./#/settings');
  const card = page.getByRole('region', { name: 'Sleep and exercise from your iPhone' });
  await expect(card.locator('.cn-steps li')).toHaveCount(3);
  await expect(card.locator('svg.gd')).toHaveCount(3);
  await expect(card.getByText(`${API_URL}/functions/v1/signals`)).toBeVisible();
  await expect(card.getByText('Nothing received yet')).toBeVisible();

  await card.getByRole('button', { name: 'Make a shortcut token' }).click();
  const token = await card.getByLabel('Shortcut token (shown once)').inputValue();
  expect(token).toMatch(/^[0-9a-f]{48}$/);

  // What the Shortcut does at 8 AM.
  const r = await request.post(`${API_URL}/functions/v1/signals`, {
    headers: { 'x-runway-token': token, 'content-type': 'application/json' },
    data: [
      { day: '2026-10-21', kind: 'sleep_h', value: 7.5 },
      { day: '2026-10-21', kind: 'steps', value: 8400 },
    ],
  });
  expect(r.ok()).toBeTruthy();
  expect(await r.json()).toEqual({ ok: true, saved: 2 });

  await card.getByRole('button', { name: 'Refresh' }).click();
  const list = card.getByRole('list', { name: 'Received from your phone' });
  await expect(list.locator('li')).toHaveCount(2);
  await expect(list).toContainText('Sleep');
  await expect(list).toContainText('7.5 h');
  await expect(list).toContainText('8,400');

  // A second night for the same day replaces the first; the extension token is not accepted here.
  const again = await request.post(`${API_URL}/functions/v1/signals`, {
    headers: { 'x-runway-token': token, 'content-type': 'application/json' },
    data: { day: '2026-10-21', kind: 'sleep_h', value: 6 },
  });
  expect(await again.json()).toEqual({ ok: true, saved: 1 });
  await card.getByRole('button', { name: 'Refresh' }).click();
  await expect(list.locator('li')).toHaveCount(2);
  await expect(list).toContainText('6 h');
  const wrong = await request.post(`${API_URL}/functions/v1/signals`, {
    headers: { 'x-runway-token': '0'.repeat(48), 'content-type': 'application/json' },
    data: { day: '2026-10-21', kind: 'sleep_h', value: 6 },
  });
  expect(wrong.status()).toBe(401);
});

test('connect: the card is there, folded, and opens to the same steps', async ({ page }) => {
  await signIn(page);
  await page.goto('./#/connect');
  const more = page.locator('details.cn-more');
  await expect(more).not.toHaveAttribute('open', '');
  await more.locator('summary').click();
  await expect(more).toHaveAttribute('open', '');
  await expect(more.locator('.cn-steps li')).toHaveCount(3);
  await expect(more.getByRole('button', { name: 'Make a shortcut token' })).toBeVisible();
});
