import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import type { Database } from '../../src/lib/database.types';
import { admin, OWNER_HANDLE, resetDb, seedPlan, seedSession, signIn } from './helpers';

// Classmates and friends: opt-in per course, stats at each person's share level.

const status = JSON.parse(
  execSync('supabase status -o json', { stdio: ['ignore', 'pipe', 'ignore'] }).toString(),
);
const PASSWORD = 'test-password-123';

/** A second student at the same school, with the demo plan, visible in MATH 20C. */
async function classmate(email: string) {
  const { data } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  const id = data.user!.id;
  await seedPlan(id);
  await admin.from('courses').update({ visible: true }).eq('user_id', id).eq('code', 'MATH 20C');
  await admin.from('profiles').update({ share_level: 'totals', display_name: 'Sam' }).eq('id', id);
  await seedSession(id, { startedMinAgo: 90, lengthMin: 45, course: 'MATH 20C' });
  return id;
}

async function signInAs(page: Page, email: string) {
  const client = createClient<Database>(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
  const { data } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  const key = `sb-${new URL(status.API_URL).hostname.split('.')[0]}-auth-token`;
  await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [key, JSON.stringify(data.session)]);
}

let userId: string;
test.beforeEach(async () => {
  userId = await resetDb();
  await seedPlan(userId);
});

test('a course card shows classmates only after you opt in; their stats follow their sharing', async ({
  page,
}) => {
  await classmate('sam@ucsd.edu');
  await signIn(page);
  await page.goto('./#/courses');
  const card = page.locator('.cs-card[aria-label="MATH 20C"]');
  await expect(card).toBeVisible();
  await expect(card.locator('.cm-rows')).toHaveCount(0);
  await card.getByLabel(/Show me to classmates in MATH 20C/).check();
  await expect(card.getByText('1 classmate on Runway')).toBeVisible({ timeout: 10_000 });
  const row = card.locator('.cm-row');
  await expect(row).toContainText('Sam');
  await expect(row).toContainText('@sam');
  await expect(row).toContainText('45 min this week');
  await expect(row).toContainText('1-day streak');
  await expect(row.locator('.cm-ready')).toBeVisible();
  // The runway says a classmate studied today.
  await page.goto('./');
  await expect(page.getByText('1 classmate studied today.')).toBeVisible();
  // Not opted in for CSE 12: nothing there.
  await page.goto('./#/courses');
  await expect(page.locator('.cs-card[aria-label="CSE 12"] .cm-rows')).toHaveCount(0);
});

test('add a friend from a course card; they accept; both see each other', async ({ page, browser }) => {
  await classmate('sam@ucsd.edu');
  await admin.from('courses').update({ visible: true }).eq('user_id', userId).eq('code', 'MATH 20C');
  await signIn(page);
  await page.goto('./#/courses');
  const row = page.locator('.cs-card[aria-label="MATH 20C"] .cm-row');
  await row.getByRole('button', { name: 'Add friend' }).click();
  await expect(row.getByRole('button', { name: 'Asked' })).toBeDisabled();

  const sam = await browser.newPage();
  await signInAs(sam, 'sam@ucsd.edu');
  await sam.goto('./#/friends');
  await expect(sam.getByRole('heading', { name: 'Requests' })).toBeVisible();
  await expect(sam.locator('.cm-row')).toContainText(`@${OWNER_HANDLE}`);
  await sam.getByRole('button', { name: 'Accept' }).click();
  await expect(sam.getByRole('heading', { name: 'Requests' })).toHaveCount(0);
  await expect(sam.locator('.cm-row')).toContainText('shares nothing yet'); // the owner is private

  await page.goto('./#/friends');
  await expect(page.locator('.cm-row')).toContainText('Sam');
  await expect(page.locator('.cm-row')).toContainText('45 min this week');
  await expect(page.locator('.cm-row')).toContainText('MATH 20C');
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('No friends yet.')).toBeVisible();
  await sam.close();
});

test('adding by handle, and a wrong handle', async ({ page }) => {
  await classmate('sam@ucsd.edu');
  await signIn(page);
  await page.goto('./#/friends');
  await page.getByLabel('Handle').fill('@nobody_here');
  await page.getByRole('button', { name: 'Add friend' }).click();
  await expect(page.getByText('No one with that handle.')).toBeVisible();
  await page.getByLabel('Handle').fill('sam');
  await page.getByRole('button', { name: 'Add friend' }).click();
  await expect(page.getByText('Waiting on: @sam')).toBeVisible();
});
