import { expect, test } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { admin, OWNER_HANDLE, resetDb, signIn } from './helpers';

// Connecting a calendar, end to end: the guide, instant validation, the first sync, the runway,
// Settings → Calendars, and removal. The feed is served from this machine; the Edge Functions run
// in Docker and reach it as host.docker.internal.

const FIXTURES = new URL('../../supabase/functions/_shared/fixtures/', import.meta.url);
const PORT = 8766;
let server: Server;

test.beforeAll(async () => {
  server = createServer((req, res) => {
    const name = (req.url ?? '').replace(/^\//, '').split('?')[0];
    try {
      const body = readFileSync(new URL(name, FIXTURES), 'utf8');
      res.writeHead(200, { 'content-type': 'text/calendar' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(PORT, '0.0.0.0', r));
});
test.afterAll(async () => {
  await new Promise((r) => server.close(r));
});

const feed = (name: string) => `http://host.docker.internal:${PORT}/${name}`;

test.beforeEach(async () => {
  await resetDb();
});

test('a new account lands on connect; a Canvas feed is checked, added, synced and drawn', async ({
  page,
}) => {
  await admin.from('profiles').update({ onboarding: {} }).eq('handle', OWNER_HANDLE);
  await signIn(page);
  await page.goto('./');
  await expect(page).toHaveURL(/#\/connect$/);
  await expect(page.getByRole('heading', { name: 'Connect a calendar' })).toBeVisible();
  // The school is found from the email domain.
  await expect(page.getByText('Your school is UC San Diego')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open its Canvas calendar' })).toHaveAttribute(
    'href',
    'https://canvas.ucsd.edu/calendar',
  );
  await expect(page.locator('.cn-steps li')).toHaveCount(3);
  await expect(page.locator('svg.gd')).toHaveCount(3);

  const box = page.getByLabel('Paste the address');
  await box.fill(feed('canvas.ics'));
  await box.blur();
  await expect(page.getByText('Found 3 courses and 4 items')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.cn-chip')).toHaveText(['DSC 140A', 'DSC 102', 'DSC 106']);
  await page.getByRole('button', { name: 'Add this calendar' }).click();

  // The first sync done, the courses screen opens; the runway is one link away.
  await expect(page).toHaveURL(/#\/courses/, { timeout: 15_000 });
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Your runway' })).toBeVisible();
  await expect(page.locator('.rw-block.k-exam')).toHaveCount(1);
  await expect(page.locator('.rw-block.k-deadline')).toHaveCount(2);
  await expect(page.locator('.mc-foot')).toContainText('Synced from Canvas');

  const { data: src } = await admin.from('calendar_sources').select('status, event_count, kind').single();
  expect(src).toMatchObject({ status: 'ok', event_count: 4, kind: 'canvas' });
});

test('a bad address gets a specific message, and the troubleshooting list is there', async ({ page }) => {
  await signIn(page);
  await page.goto('./#/connect');
  await page.getByRole('radio', { name: /Google Calendar/ }).click();
  await expect(page.getByText('This works on the web, not in the phone app.')).toBeVisible();
  const box = page.getByLabel('Paste the address');
  await box.fill('https://calendar.google.com/calendar/ical/x%40gmail.com/private-abc/basic.ics…');
  await box.blur();
  await expect(page.getByText('The address is cut off')).toBeVisible({ timeout: 15_000 });
  await box.fill(feed('missing.ics'));
  await box.blur();
  await expect(page.getByText('Nothing was found at that address')).toBeVisible({ timeout: 15_000 });
  await page.getByText("This didn't work").click();
  await expect(
    page.getByText(/You copied it from a preview|The settings page shows a shortened preview/),
  ).toBeVisible();
  expect((await admin.from('calendar_sources').select('id')).data).toEqual([]);
});

test('Settings lists the calendar, syncs it again, and removes it with its items', async ({ page }) => {
  await signIn(page);
  await page.goto('./#/connect');
  await page.getByRole('radio', { name: /Google Calendar/ }).click();
  const box = page.getByLabel('Paste the address');
  await box.fill(feed('google.ics'));
  await box.blur();
  await expect(page.getByText(/Found 3 courses and \d+ items/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Add this calendar' }).click();
  await expect(page).toHaveURL(/#\/courses/, { timeout: 15_000 });
  await page.goto('./');
  // Class blocks draw quietly; the research meeting is a commitment; dinner is not drawn.
  await expect(page.locator('.rw-block.k-class').first()).toBeVisible();
  await expect(page.locator('.rw-block.k-commitment')).toHaveCount(1);
  await expect(page.locator('.rw-block', { hasText: 'Dinner' })).toHaveCount(0);

  await page.goto('./#/settings');
  const item = page.locator('.src-item');
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('Google Calendar');
  await expect(item).toContainText('host.docker.internal');
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByText(/Nothing changed\.|Synced \d+ items\./)).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Remove it and its items' }).click();
  await expect(page.locator('.src-item')).toHaveCount(0);
  await expect(page.getByText('No calendar connected yet.')).toBeVisible();
  expect((await admin.from('plan_items').select('id')).data).toEqual([]);
  expect((await admin.from('events').select('id')).data).toEqual([]);
});

test('an .ics upload is read once', async ({ page }) => {
  await signIn(page);
  await page.goto('./#/connect');
  await page.getByRole('radio', { name: /Upload an .ics file/ }).click();
  await page.getByLabel('Choose the file').setInputFiles({
    name: 'export.ics',
    mimeType: 'text/calendar',
    buffer: Buffer.from(readFileSync(new URL('google.ics', FIXTURES), 'utf8')),
  });
  await expect(page).toHaveURL(/#\/courses/, { timeout: 15_000 });
  await page.goto('./');
  await expect(page.locator('.cp')).toHaveCount(2); // two exams; the take-home one draws across two days
  await page.goto('./#/settings');
  await expect(page.locator('.src-item')).toContainText("A file doesn't stay in sync");
});
