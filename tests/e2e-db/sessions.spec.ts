import { expect, test } from '@playwright/test';
import { admin, resetDb, seedSession, signIn } from './helpers';

let userId: string;
test.beforeEach(async () => {
  userId = await resetDb();
});

test('visitors see the runway, no app nav, and a sign-in prompt on private pages', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Midterm runway' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await page.goto('./#/focus');
  await expect(page.getByRole('heading', { name: 'Sign in to run study sessions.' })).toBeVisible();
});

test('one tap starts a session; pause, break and end work; a short one can be discarded', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('./');
  await page.getByRole('button', { name: 'Start session' }).click();
  await expect(page).toHaveURL(/#\/focus$/);
  const timer = page.getByRole('timer');
  await expect(timer).toHaveText(/^2[45]:\d\d$/);

  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByText(/^Paused\./)).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click();

  await page.getByRole('button', { name: 'Break', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Back to work' })).toBeVisible();
  await expect(page.getByRole('timer')).toHaveText(/^[45]:\d\d$/);
  await page.getByRole('button', { name: 'Back to work' }).click();

  await page.getByRole('button', { name: 'End' }).click();
  await expect(page.getByRole('heading', { name: 'That was short.' })).toBeVisible();
  await page.getByRole('button', { name: 'Discard it' }).click();
  await expect(page.getByRole('heading', { name: 'What are you studying?' })).toBeVisible();
  const { count } = await admin.from('sessions').select('*', { count: 'exact', head: true });
  expect(count).toBe(0);
});

test('the break nudge appears when a break is due and starts the break', async ({ page }) => {
  await seedSession(userId, { startedMinAgo: 26 });
  await signIn(page);
  await page.goto('./#/focus');
  await expect(page.getByText('Time for a 5-minute break.')).toBeVisible();
  await page.getByRole('button', { name: 'Start break' }).click();
  await expect(page.getByRole('button', { name: 'Back to work' })).toBeVisible();
  // The screen updates before the save lands, so wait for the row.
  await expect
    .poll(async () => (await admin.from('session_breaks').select('kind')).data)
    .toEqual([{ kind: 'short' }]);
});

test('ending a real session saves the rating and note, and the log shows it', async ({ page }) => {
  await seedSession(userId, { startedMinAgo: 50, course: 'DSC 102', mode: 'flow' });
  await signIn(page);
  await page.goto('./#/focus');
  await page.getByRole('button', { name: 'End' }).click();
  await expect(page.getByRole('heading', { name: 'Session done.' })).toBeVisible();
  await page.getByRole('button', { name: '4 out of 5' }).click();
  await page.getByRole('textbox').fill('Went through lectures 5–7');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'What are you studying?' })).toBeVisible();

  await page.getByRole('link', { name: 'Log' }).click();
  const item = page.locator('.log-item').first();
  await expect(item).toContainText('DSC 102');
  await expect(item).toContainText('50 min');
  await expect(item).toContainText('rated 4/5');
  await expect(item).toContainText('Went through lectures 5–7');
});

test('log: add time by hand, edit it, export CSV, delete it', async ({ page }) => {
  await signIn(page);
  await page.goto('./#/log');
  await expect(page.getByText('No sessions yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Add time' }).first().click();
  const form = page.getByRole('form', { name: 'Add study time' });
  await form.getByLabel('Course').selectOption('CSE 151A');
  await form.getByLabel('Minutes').fill('45');
  await form.getByLabel('Note (optional)').fill('library, no laptop');
  await form.getByRole('button', { name: 'Add' }).click();
  const item = page.locator('.log-item').first();
  await expect(item).toContainText('CSE 151A');
  await expect(item).toContainText('45 min');
  await expect(item).toContainText('Added by hand');

  await item.getByRole('button', { name: /Edit/ }).click();
  await page.getByLabel('Focused (min)').fill('70');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.log-item').first()).toContainText('1 h 10 min');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV' }).click();
  const file = await (await download).path();
  const csv = (await import('node:fs')).readFileSync(file, 'utf8');
  expect(csv).toContain('CSE 151A,custom,manual,70');
  expect(csv).toContain('library, no laptop');

  page.once('dialog', (d) => d.accept());
  await page.locator('.log-item').first().getByRole('button', { name: /Edit/ }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('No sessions yet.')).toBeVisible();
});

test('a session started on one device shows up live on another', async ({ browser }) => {
  const a = await browser.newPage();
  const b = await browser.newPage();
  await signIn(a);
  await signIn(b);
  await b.goto('./#/log');
  await a.goto('./');
  await a.getByRole('button', { name: 'Start session' }).click();
  await expect(a.getByRole('timer')).toBeVisible();
  // No reload on b: Realtime brings the session over.
  await expect(b.locator('.live-chip')).toBeVisible({ timeout: 10_000 });
  await a.getByRole('button', { name: 'Pause' }).click();
  await expect(b.locator('.live-chip')).toContainText('Paused', { timeout: 10_000 });
});

test('runway shows studied time and readiness for the owner, and totals for visitors', async ({
  page,
  browser,
}) => {
  await seedSession(userId, { startedMinAgo: 90, lengthMin: 60, course: 'DSC 140A' });
  await signIn(page);
  await page.goto('./');
  await expect(page.locator('.rw-day.is-today .rw-actual').first()).toBeVisible();
  await expect(page.locator('.cp-ready').first()).toContainText('h actually studied');

  const visitor = await browser.newPage();
  await visitor.goto('./');
  await expect(visitor.locator('.rw-day.is-today .rw-actual.is-total')).toBeVisible();
  await expect(visitor.locator('.cp-ready').first()).toContainText('h actually studied');

  await admin.from('profiles').update({ public_level: 'readiness' }).eq('id', userId);
  await visitor.reload();
  await expect(visitor.locator('.cp-ready').first()).toContainText('h actually studied');
  await expect(visitor.locator('.rw-actual')).toHaveCount(0);

  await admin.from('profiles').update({ public_level: 'runway' }).eq('id', userId);
  await visitor.reload();
  await expect(visitor.locator('.rw-actual')).toHaveCount(0);
  await expect(visitor.locator('.cp-ready')).toHaveCount(0);
});
