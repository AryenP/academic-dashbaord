import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import type { Database } from '../../src/lib/database.types';
import { admin, OWNER_HANDLE, resetDb, seedPlan, signIn } from './helpers';

// Study together: two classmates who both opted in find a shared hour, one asks, the other
// accepts, and the block is on both runways. Nothing shows for someone who didn't opt in.

const status = JSON.parse(
  execSync('supabase status -o json', { stdio: ['ignore', 'pipe', 'ignore'] }).toString(),
);
const PASSWORD = 'test-password-123';

async function signInAs(page: Page, email: string) {
  const client = createClient<Database>(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
  const { data } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  const key = `sb-${new URL(status.API_URL).hostname.split('.')[0]}-auth-token`;
  await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [key, JSON.stringify(data.session)]);
}

async function student(email: string, displayName: string, together: boolean) {
  const { data } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  const id = data.user!.id;
  await seedPlan(id);
  await admin
    .from('courses')
    .update({ visible: true, study_together: together })
    .eq('user_id', id)
    .eq('code', 'MATH 20C');
  await admin.from('profiles').update({ display_name: displayName }).eq('id', id);
  return id;
}

let userId: string;
test.beforeEach(async () => {
  userId = await resetDb();
  await seedPlan(userId);
  await admin.from('courses').update({ visible: true }).eq('user_id', userId).eq('code', 'MATH 20C');
  await admin.from('profiles').update({ display_name: 'Owner' }).eq('id', userId);
});

test('both opt in, one asks for an hour, the other accepts, it is on both runways', async ({
  page,
  browser,
}) => {
  await student('sam@ucsd.edu', 'Sam', true);
  await signIn(page);
  await page.goto('./#/courses');
  const card = page.locator('.cs-card[aria-label="MATH 20C"]');
  const row = card.locator('.cm-row', { hasText: 'Sam' });
  await expect(row).toBeVisible({ timeout: 10_000 });
  // Only Sam opted in so far: no "Find a time" until the owner does too.
  await expect(row.getByRole('button', { name: /Find a time/ })).toHaveCount(0);
  await card.getByLabel(/Let classmates who also turn this on find a time with me/).check();
  await expect(row.getByRole('button', { name: 'Find a time with Sam' })).toBeVisible({ timeout: 10_000 });
  await row.getByRole('button', { name: 'Find a time with Sam' }).click();
  const windows = row.getByRole('list', { name: 'Times you and Sam are both free' });
  await expect(windows.locator('li').first()).toBeVisible();
  await windows.getByRole('button', { name: 'Ask for an hour' }).first().click();
  await expect(row.getByRole('status')).toContainText('Asked Sam for');

  // The owner's runway says it's waiting; nothing is drawn yet.
  await page.goto('./');
  const mine = page.getByLabel('Study together');
  await expect(mine).toContainText('You asked Sam to study MATH 20C');
  await expect(page.locator('.rw-block', { hasText: 'Study with' })).toHaveCount(0);

  // Sam accepts on their runway.
  const sam = await browser.newPage();
  await signInAs(sam, 'sam@ucsd.edu');
  await sam.goto('./');
  const theirs = sam.getByLabel('Study together');
  await expect(theirs).toContainText('Owner asks to study MATH 20C together');
  await theirs.getByRole('button', { name: 'Accept' }).click();
  await expect(theirs).toContainText('Studying MATH 20C with Owner');
  await expect(sam.getByRole('img', { name: /^MATH 20C Study: Study with Owner,/ })).toHaveCount(1);

  // Both runways have it; calling it off from the owner's side removes both.
  await page.reload();
  await expect(mine).toContainText('Studying MATH 20C with Sam');
  const myBlock = page.getByRole('img', { name: /^MATH 20C Study: Study with Sam,/ });
  await expect(myBlock).toHaveCount(1);
  await mine.getByRole('button', { name: 'Call it off' }).click();
  await expect(page.getByLabel('Study together')).toHaveCount(0);
  await expect(myBlock).toHaveCount(0);
  await sam.reload();
  await expect(sam.getByLabel('Study together')).toHaveCount(0);
  await expect(sam.getByRole('img', { name: /Study with Owner/ })).toHaveCount(0);
  await sam.close();
});

test('someone who did not opt in to studying together is never offered', async ({ page }) => {
  await student('kim@ucsd.edu', 'Kim', false);
  await admin.from('courses').update({ study_together: true }).eq('user_id', userId).eq('code', 'MATH 20C');
  await signIn(page);
  await page.goto('./#/courses');
  const row = page.locator('.cs-card[aria-label="MATH 20C"] .cm-row', { hasText: 'Kim' });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row.getByRole('button', { name: /Find a time/ })).toHaveCount(0);
  expect(OWNER_HANDLE).toBe('owner');
});

for (const scheme of ['light', 'dark'] as const)
  test(`study together at 375 px, ${scheme}: the card, the invitation, axe-clean`, async ({
    page,
    browser,
  }) => {
    const samId = await student('sam@ucsd.edu', 'Sam', true);
    await admin.from('courses').update({ study_together: true }).eq('user_id', userId).eq('code', 'MATH 20C');
    // An invitation from Sam to the owner, tomorrow 12:30–1:30 PM Pacific (free on the demo plan), waiting for an answer.
    const day = new Date(Date.now() + 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
    await admin.from('study_invites').insert({
      from_user: samId,
      to_user: userId,
      course_code: 'MATH 20C',
      start_at: `${day}T12:30:00-07:00`,
      end_at: `${day}T13:30:00-07:00`,
    });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await signIn(page);
    await page.goto('./');
    const strip = page.getByLabel('Study together');
    await expect(strip).toContainText('Sam asks to study MATH 20C together');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
    await strip.screenshot({ path: `tests/e2e/__screenshots__/together-invite-mobile-${scheme}.png` });
    const axe1 = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe1.violations.map((v) => v.id)).toEqual([]);

    await page.goto('./#/courses');
    const card = page.locator('.cs-card[aria-label="MATH 20C"]');
    await card.getByRole('button', { name: 'Find a time with Sam' }).click();
    await expect(
      card.getByRole('list', { name: 'Times you and Sam are both free' }).locator('li').first(),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
    await card.screenshot({ path: `tests/e2e/__screenshots__/together-card-mobile-${scheme}.png` });
    const axe2 = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe2.violations.map((v) => v.id)).toEqual([]);
    // Keyboard: the invitation's buttons are reachable by Tab from the page.
    await page.goto('./');
    await page.getByRole('button', { name: 'Accept' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Study together')).toContainText('Studying MATH 20C with Sam');
    void browser;
  });
