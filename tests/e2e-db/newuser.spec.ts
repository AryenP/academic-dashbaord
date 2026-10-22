import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { admin, OWNER_HANDLE, resetDb, signIn } from './helpers';

// A brand-new account, start to finish: lands on Connect, uploads a calendar, is shown its courses,
// drafts a plan, accepts it, and has a runway. And the one way in that fails on purpose: a Google
// sign-in rejected by the school-email rule comes back to the sign-in screen with the reason.

const FIXTURES = new URL('../../supabase/functions/_shared/fixtures/', import.meta.url);

test.beforeEach(async () => {
  await resetDb();
});
test.afterEach(async () => {
  await admin.from('app_config').update({ value: true }).eq('key', 'ai_enabled');
});

test('first sign-in to a planned runway', async ({ page }) => {
  // The plain allocator, not the model: deterministic and free.
  await admin.from('app_config').update({ value: false }).eq('key', 'ai_enabled');
  await admin.from('profiles').update({ onboarding: {} }).eq('handle', OWNER_HANDLE);
  await signIn(page);

  // 1. Nothing connected yet: straight to Connect, once.
  await page.goto('./');
  await expect(page).toHaveURL(/#\/connect$/);
  await expect(page.getByRole('heading', { name: 'Connect a calendar' })).toBeVisible();

  // 2. A calendar export.
  await page.getByRole('radio', { name: /Upload an .ics file/ }).click();
  await page.getByLabel('Choose the file').setInputFiles({
    name: 'export.ics',
    mimeType: 'text/calendar',
    buffer: Buffer.from(readFileSync(new URL('google.ics', FIXTURES), 'utf8')),
  });

  // 3. The courses it found, then the runway.
  await expect(page).toHaveURL(/#\/courses/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Your courses' })).toBeVisible();
  await expect(page.locator('.cs-card').first()).toBeVisible();
  await page.goto('./');
  await expect(page).toHaveURL(/academic-dashbaord\/$/); // not sent back to Connect
  await expect(page.getByRole('heading', { name: 'Your runway' })).toBeVisible();
  await expect(page.locator('.cp')).toHaveCount(2);

  // 4. A plan, accepted.
  await page.getByRole('button', { name: 'Draft a plan' }).click();
  await expect(page.getByText(/Runway drafted \d+ study blocks?/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Accept all' }).click();
  await expect(page.locator('.rw-block.is-proposed')).toHaveCount(0, { timeout: 10_000 });
  expect(await page.locator('.rw-block.k-study').count()).toBeGreaterThan(0);
  const { count } = await admin
    .from('plan_items')
    .select('*', { count: 'exact', head: true })
    .eq('accepted', false);
  expect(count).toBe(0);
});

test('a rejected Google sign-in explains itself on the sign-in screen', async ({ page }) => {
  await page.goto(
    './?error=server_error&error_code=unexpected_failure&error_description=Database+error+saving+new+user',
  );
  await expect(page).toHaveURL(/#\/signin$/);
  await expect(page.getByText('Runway is for students: use your school email')).toBeVisible();
  // The message is shown once; a reload gives a clean form.
  await page.reload();
  await expect(page.getByText('Runway is for students: use your school email')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Email me a link' })).toBeVisible();
});
