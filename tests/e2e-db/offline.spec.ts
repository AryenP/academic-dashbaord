import { expect, test } from '@playwright/test';
import { admin, resetDb, signIn } from './helpers';

test.beforeEach(async () => {
  await resetDb();
});

test('a whole session works offline and syncs with the right times when the connection returns', async ({
  page,
  context,
}) => {
  await signIn(page);
  await page.goto('./#/focus');
  await expect(page.getByRole('heading', { name: 'What are you studying?' })).toBeVisible();

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('timer')).toBeVisible();
  await expect(page.getByText(/Offline\. 1 change will sync/)).toBeVisible();
  await page.getByRole('button', { name: 'Break', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Back to work' })).toBeVisible();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Back to work' }).click();
  await page.getByRole('button', { name: 'End' }).click();
  await expect(page.getByRole('heading', { name: /That was short|Session done/ })).toBeVisible();
  await expect(page.getByText(/Offline\. 4 changes will sync/)).toBeVisible();
  expect((await admin.from('sessions').select('*')).data).toEqual([]);

  await context.setOffline(false);
  await expect(page.getByText(/Offline\./)).toHaveCount(0, { timeout: 10_000 });
  const { data } = await admin.from('sessions').select('*').single();
  expect(data!.ended_at).not.toBeNull();
  expect(data!.break_seconds).toBeGreaterThanOrEqual(1);
  const { data: breaks } = await admin.from('session_breaks').select('*');
  expect(breaks).toHaveLength(1);
  expect(breaks![0].ended_at).not.toBeNull();

  // Saving the rating works once back online.
  await page.getByRole('button', { name: '3 out of 5' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'What are you studying?' })).toBeVisible();
  expect((await admin.from('sessions').select('rating').single()).data!.rating).toBe(3);
});
