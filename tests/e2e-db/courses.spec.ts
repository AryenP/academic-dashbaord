import { expect, test } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { admin, resetDb, signIn } from './helpers';

// "Your courses": the review screen after a sync. The AI isn't set up in tests (no key), so the
// title rules do the reading and the screen says so; fixing a reading rebuilds the runway.

const FIXTURES = new URL('../../supabase/functions/_shared/fixtures/', import.meta.url);
const PORT = 8767;
let server: Server;
test.beforeAll(async () => {
  server = createServer((req, res) => {
    try {
      res
        .writeHead(200, { 'content-type': 'text/calendar' })
        .end(readFileSync(new URL((req.url ?? '').slice(1), FIXTURES), 'utf8'));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(PORT, '0.0.0.0', r));
});
test.afterAll(async () => {
  await new Promise((r) => server.close(r));
});

test.beforeEach(async () => {
  await resetDb();
});

test('after connecting, the courses screen shows what was read, and a fix changes the runway', async ({
  page,
}) => {
  // The title rules alone, so the readings are deterministic whether or not a key is set locally.
  await admin.from('app_config').update({ value: false }).eq('key', 'ai_enabled');
  await signIn(page);
  await page.goto('./#/connect');
  await page.getByRole('radio', { name: /Google Calendar/ }).click();
  const box = page.getByLabel('Paste the address');
  await box.fill(`http://host.docker.internal:${PORT}/google.ics`);
  await box.blur();
  await expect(page.getByText(/Found 3 courses/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Add this calendar' }).click();

  // Lands on the courses screen, which tries the AI once and says it isn't set up here.
  await expect(page).toHaveURL(/#\/courses/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Your courses' })).toBeVisible();
  await expect(page.getByText(/turned off right now/)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.cs-card[aria-label="DSC 102"]')).toBeVisible();
  await expect(page.locator('.cs-card[aria-label="DSC 140A"]')).toContainText('Midterm 1');
  // The 📚 block with no department is flagged, under "Which course?".
  const unsure = page.locator('.cs-row.is-unsure', { hasText: 'practice problems' });
  await expect(unsure).toBeVisible();
  await expect(unsure).toContainText('Is this right?');

  // Give it its course: it moves into the DSC 140A card and the runway draws it in that color.
  await unsure.getByLabel(/Course of/).selectOption('DSC 140A');
  await expect(page.locator('.cs-card[aria-label="DSC 140A"]')).toContainText('practice problems', {
    timeout: 10_000,
  });
  await expect
    .poll(
      async () =>
        (
          await admin
            .from('plan_items')
            .select('title, courses(code)')
            .ilike('title', '%practice problems%')
            .single()
        ).data?.courses?.code,
      {
        timeout: 15_000,
      },
    )
    .toBe('DSC 140A');

  // Dinner is not on the runway; making it a commitment draws it.
  await page.locator('summary', { hasText: 'Not on the runway' }).click();
  const dinner = page.locator('.cs-row', { hasText: 'Dinner with Sam' });
  await dinner.getByLabel(/Kind of/).selectOption('commitment');
  await expect(page.locator('.cs-card', { hasText: 'Work, research and other commitments' })).toContainText(
    'Dinner with Sam',
  );
  await expect
    .poll(
      async () =>
        (await admin.from('plan_items').select('kind').eq('title', 'Dinner with Sam').maybeSingle()).data
          ?.kind,
      { timeout: 15_000 },
    )
    .toBe('commitment');

  // "Not a course" takes a whole course off the runway.
  const card = page.locator('.cs-card[aria-label="CSE 151A"]');
  await card.getByRole('button', { name: 'Not a course' }).click();
  await card.getByRole('button', { name: /Take \d+ off the runway/ }).click();
  await expect(page.locator('.cs-card[aria-label="CSE 151A"]')).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await admin.from('plan_items').select('id, courses!inner(code)').eq('courses.code', 'CSE 151A')).data
          ?.length,
      { timeout: 15_000 },
    )
    .toBe(0);

  // Course name and color stick.
  await page.getByLabel('DSC 140A name').fill('Probabilistic Modeling');
  await page.getByLabel('DSC 140A name').blur();
  await page.locator('.cs-card[aria-label="DSC 140A"]').getByRole('radio', { name: 'Color 5' }).click();
  await expect
    .poll(
      async () => (await admin.from('courses').select('name, color').eq('code', 'DSC 140A').single()).data,
    )
    .toEqual({
      name: 'Probabilistic Modeling',
      color: 5,
    });
  await page.getByRole('link', { name: 'Show my runway' }).click();
  await expect(page.getByRole('heading', { name: 'Your runway' })).toBeVisible();
  await admin.from('app_config').update({ value: true }).eq('key', 'ai_enabled');
});
