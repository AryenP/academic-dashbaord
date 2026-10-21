import { expect, test } from '@playwright/test';
import { freezeTime } from './fixtures';

test('installable: manifest and icons are served', async ({ page, request }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await request.get(href!)).json();
  expect(manifest).toMatchObject({ name: 'Runway', display: 'standalone', start_url: './' });
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
});

test('after one visit, the app opens offline with the last plan', async ({ page, context }) => {
  await freezeTime(page);
  await page.goto('./');
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    // wait until the worker controls this page and has finished precaching
    if (!navigator.serviceWorker.controller)
      await new Promise((r) =>
        navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }),
      );
    return reg.active?.state;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Midterm runway' })).toBeVisible();
  await expect(page.locator('.rw-day')).toHaveCount(16);
  // A view that was never opened still loads: its chunk was precached.
  await page.goto('./#/log');
  await expect(page.getByRole('heading', { name: /Sign in to see your study log|Log/ })).toBeVisible();
});
