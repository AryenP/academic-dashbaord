import { expect, test } from '@playwright/test';
import { resetDb, seedSession, signIn } from './helpers';

// Hour three of a session: one line on the focus screen, and nothing before that.

test('the focus screen says one thing after three hours, nothing before', async ({ page }) => {
  const userId = await resetDb();
  await seedSession(userId, { startedMinAgo: 40, course: 'MATH 20C', mode: 'flow' });
  await signIn(page);
  await page.goto('./#/focus');
  await expect(page.locator('.fx-timer')).toBeVisible();
  await expect(page.locator('.fx-hour3')).toHaveCount(0);
  await page.getByRole('button', { name: 'End' }).click();
  await page.getByRole('heading', { name: 'Session done.' }).waitFor();
  await page.getByRole('button', { name: 'Discard' }).click(); // the end screen stays until rated or discarded

  await seedSession(userId, { startedMinAgo: 185, course: 'MATH 20C', mode: 'flow' });
  await page.goto('./#/focus');
  await page.reload();
  await expect(page.locator('.fx-timer')).toBeVisible();
  await expect(page.locator('.fx-hour3')).toContainText('Three hours in.');
});
