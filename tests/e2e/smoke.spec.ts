import { expect, test } from '@playwright/test';
import { freezeTime } from './fixtures';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('home draws the runway, checkpoints, today and agenda', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Midterm runway' })).toBeVisible();
  await expect(page.locator('.mc-lede')).toContainText('4 days until DSC 140A Midterm 1');
  await expect(page.locator('.rw-day')).toHaveCount(16);
  await expect(page.locator('.rw-day.is-today .rw-wd')).toHaveText('Today');
  await expect(page.locator('.rw-block.is-now')).toHaveCount(1);
  await expect(page.locator('.cp')).toHaveCount(3);
  await expect(page.locator('#today h2')).toHaveText('Today');
  await expect(page.locator('.td-item.is-now')).toContainText('practice problems + cheat sheet #1');
  expect(errors).toEqual([]);
});

test('agenda filters by kind', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Exams' }).click();
  await expect(page.locator('.mc-table tbody tr')).toHaveCount(3);
  await page.getByRole('button', { name: 'All' }).click();
  await expect(page.locator('.mc-table tbody tr')).toHaveCount(34);
});

test('hovering a block shows its details', async ({ page }) => {
  await page.goto('./');
  await page.locator('.rw-block.is-now').hover();
  await expect(page.locator('.mc-tip')).toContainText('DSC 140A study');
});
