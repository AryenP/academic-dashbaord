import { expect, test } from '@playwright/test';
import { freezeTime } from './fixtures';

// The public site with no backend: the landing page and its demo runway.

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('the landing page draws the demo runway with no errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Your runway to every exam.' })).toBeVisible();
  await expect(page.locator('.rw-day')).toHaveCount(12);
  await expect(page.locator('.rw-day.is-today .rw-wd')).toHaveText('Today');
  await expect(page.locator('.rw-block.is-now')).toHaveCount(1);
  await expect(page.locator('.ld-board-note')).toContainText('in 3 days, MATH 20C Midterm 1');
  await expect(page.getByRole('link', { name: 'Sign up with your school email' }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How it works' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the prerendered page has the headline before any script runs', async ({ request }) => {
  const html = await (await request.get('./')).text();
  expect(html).toContain('Your runway to every exam.');
  expect(html).toContain('ld-board-static');
});

test('the privacy page exists at a plain URL, styled, without JavaScript', async ({ page }) => {
  await page.goto('./privacy.html');
  await expect(page.getByRole('heading', { name: 'Privacy' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Deleting everything' })).toBeVisible();
  const font = await page.locator('h1').evaluate((el) => getComputedStyle(el).fontFamily);
  expect(font).toContain('Big Shoulders');
  await page.getByRole('link', { name: 'Back to Runway' }).click();
  await expect(page.getByRole('heading', { name: 'Your runway to every exam.' })).toBeVisible();
});

test('hovering a demo block shows its details', async ({ page }) => {
  await page.goto('./');
  await page.locator('.rw-block.is-now').hover();
  await expect(page.locator('.mc-tip')).toContainText('MATH 20C study');
});

test('sign-in and privacy pages load from the landing page', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('link', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.goto('./#/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy' })).toBeVisible();
});

test('how it works has four steps, the last one for the phone signals', async ({ page, request }) => {
  await page.goto('./');
  const steps = page.locator('.ld-steps li');
  await expect(steps).toHaveCount(4);
  await expect(steps.nth(3)).toContainText('sleep');
  await expect(steps.nth(3)).toContainText('tends to');
  // The step is in the prerendered HTML too.
  const html = await (await request.get('./')).text();
  expect(html).toContain('Let your phone fill in the rest.');
  // Google is mentioned exactly when the build has it wired.
  const google = process.env.VITE_GOOGLE_SIGNIN === 'true';
  await expect(page.getByRole('link', { name: 'or continue with Google' })).toHaveCount(google ? 2 : 0);
});

test('the landing page does not scroll sideways on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./');
  await expect(page.locator('.rw-day')).toHaveCount(12);
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(w).toBe(375);
});
