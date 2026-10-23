import { expect, test } from '@playwright/test';
import { API_URL, resetDb, seedPlan, signIn } from './helpers';

// The glance: the shortcut token made in Settings also answers one line of plain text about now,
// from the local functions runtime.

test('the shortcut token fetches a one-line glance', async ({ page, request }) => {
  const userId = await resetDb();
  await seedPlan(userId);
  await signIn(page);
  await page.goto('./#/settings');
  const card = page.getByRole('region', { name: 'Sleep and exercise from your iPhone' });
  await expect(card.getByText('The same token answers a glance')).toBeVisible();
  await expect(card.getByText(`${API_URL}/functions/v1/glance`)).toBeVisible();
  await card.getByRole('button', { name: 'Make a shortcut token' }).click();
  const token = await card.getByLabel('Shortcut token (shown once)').inputValue();

  const r = await request.get(`${API_URL}/functions/v1/glance`, { headers: { 'x-runway-token': token } });
  expect(r.ok()).toBeTruthy();
  expect(r.headers()['content-type']).toContain('text/plain');
  const text = await r.text();
  expect(text).toMatch(/^(Now|Next|Nothing)/);
  expect(text).toContain('Midterm 1');
  const j = await request.get(`${API_URL}/functions/v1/glance?format=json&t=${token}`);
  expect(((await j.json()) as { exam: { title: string } }).exam.title).toBe('Midterm 1');
  const wrong = await request.get(`${API_URL}/functions/v1/glance?t=${'0'.repeat(48)}`);
  expect(wrong.status()).toBe(401);
});
