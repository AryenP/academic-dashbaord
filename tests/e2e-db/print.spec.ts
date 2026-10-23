import { expect, test } from '@playwright/test';
import { resetDb, seedPlan, signIn } from './helpers';

// The runway on paper: no navigation or buttons, the week in words open, the strip at page width.

test('printing the runway hides the chrome and opens the week in words', async ({ page }) => {
  const userId = await resetDb();
  await seedPlan(userId);
  await signIn(page);
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Your runway' })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.top')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Draft a plan' })).toBeHidden();
  await expect(page.locator('.mc-words')).toHaveAttribute('open', '');
  await expect(page.locator('.mc-words dt').first()).toBeVisible();
  const width = await page.locator('.rw-grid').evaluate((el) => el.getBoundingClientRect().width);
  const page_ = await page.evaluate(() => document.documentElement.clientWidth);
  expect(width).toBeLessThanOrEqual(page_);
  await page.setViewportSize({ width: 816, height: 1056 }); // US Letter at 96 dpi
  await page.screenshot({ path: 'tests/e2e/__screenshots__/home-print.png', fullPage: true });
});
