import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { admin, OWNER_HANDLE, resetDb, signIn } from './helpers';

// The first minute: a visitor pastes a calendar address on #/try, sees their own runway, keeps it,
// signs in, and lands on that runway with the calendar connected and the address gone from the
// browser. The feed is made here, relative to today, and served to the functions runtime in Docker
// as host.docker.internal.

const PORT = 8767;
const TZ = 'America/Los_Angeles';
const feedUrl = `http://host.docker.internal:${PORT}/cal.ics`;
let server: Server;

/** YYYYMMDD of today + n, in Pacific time. */
const day = (n: number) =>
  new Date(Date.now() + n * 864e5).toLocaleDateString('en-CA', { timeZone: TZ }).replace(/-/g, '');
const ev = (uid: string, d: number, from: string, to: string, title: string, location = '') =>
  [
    'BEGIN:VEVENT',
    `UID:${uid}@try.test`,
    `DTSTART;TZID=${TZ}:${day(d)}T${from}00`,
    `DTEND;TZID=${TZ}:${day(d)}T${to}00`,
    `SUMMARY:${title}`,
    location ? `LOCATION:${location}` : '',
    'END:VEVENT',
  ]
    .filter(Boolean)
    .join('\r\n');
const FEED = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Runway//try test//EN',
  'X-WR-CALNAME:School',
  // Real feeds define their zones; without this block a TZID reads as UTC.
  'BEGIN:VTIMEZONE',
  'TZID:America/Los_Angeles',
  'BEGIN:STANDARD',
  'DTSTART:19701101T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'TZOFFSETFROM:-0700',
  'TZOFFSETTO:-0800',
  'TZNAME:PST',
  'END:STANDARD',
  'BEGIN:DAYLIGHT',
  'DTSTART:19700308T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'TZOFFSETFROM:-0800',
  'TZOFFSETTO:-0700',
  'TZNAME:PDT',
  'END:DAYLIGHT',
  'END:VTIMEZONE',
  ev('lec', 1, '1400', '1520', 'DSC 140A Lecture', 'Center Hall 101'),
  ev('prac', 2, '1000', '1200', '📚 140A practice problems'),
  ev('mt', 4, '1700', '1800', 'DSC 140A Midterm 1', 'Center Hall 115'),
  ev('din', 1, '1900', '2100', 'Dinner with Sam'),
  'END:VCALENDAR',
].join('\r\n');

test.beforeAll(async () => {
  server = createServer((req, res) => {
    if ((req.url ?? '').startsWith('/cal.ics'))
      res.writeHead(200, { 'content-type': 'text/calendar' }).end(FEED);
    else res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(PORT, '0.0.0.0', r));
});
test.afterAll(async () => {
  await new Promise((r) => server.close(r));
});

let userId: string;
test.beforeEach(async () => {
  userId = await resetDb();
  // A brand-new account: without a waiting calendar it would be sent to Connect.
  await admin.from('profiles').update({ onboarding: {} }).eq('id', userId);
});

async function drawPreview(page: Page) {
  await page.goto('./#/try');
  await expect(page.getByRole('heading', { name: 'See your runway first' })).toBeVisible();
  await page.getByRole('radio', { name: /Google Calendar/ }).click();
  await page.getByLabel('Paste the address').fill(feedUrl);
  await page.getByRole('button', { name: 'Draw my runway' }).click();
  await expect(page.getByRole('heading', { name: 'Your next three weeks' })).toBeVisible({ timeout: 20_000 });
}

test('paste, see your runway, keep it, sign in, and it is yours', async ({ page }) => {
  await drawPreview(page);
  await expect(page.getByRole('status').filter({ hasText: 'Runway found' })).toContainText(
    '1 course and 3 items',
  );
  const exam = page.getByRole('img', { name: /^DSC 140A Exam: DSC 140A Midterm 1, .* 5 PM–6 PM$/ });
  await expect(exam).toHaveCount(1); // in the calendar's own time
  // Drawn, not just listed: the strip has its scale and the blocks have height.
  // (after the intro animation, which grows blocks from nothing)
  await expect.poll(async () => (await exam.boundingBox())?.height ?? 0).toBeGreaterThan(10);
  await expect(page.locator('.try-board .rw-block')).toHaveCount(3);
  await expect(page.getByRole('img', { name: /Dinner/ })).toHaveCount(0); // personal events aren't drawn
  await expect(page.locator('.cp').first()).toContainText('Midterm 1');

  await page.getByRole('button', { name: 'Keep this runway' }).click();
  await expect(page).toHaveURL(/#\/signin$/);
  await expect(page.locator('.signin-waiting')).toContainText('Your calendar is waiting');
  const waiting = await page.evaluate(() => localStorage.getItem('runway:pending-source'));
  expect(JSON.parse(waiting!)).toMatchObject({ kind: 'ical', label: 'Google Calendar', url: feedUrl });

  // The magic link, played by placing a real session in this browser.
  await signIn(page);
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Your runway' })).toBeVisible({ timeout: 30_000 });
  const note = page.locator('.mc-joined');
  await expect(note).toContainText('Your calendar is connected');
  await expect(note.getByRole('link', { name: 'Check how Runway read your courses' })).toHaveAttribute(
    'href',
    '#/courses?read=1',
  );
  await expect(page.getByRole('img', { name: /^DSC 140A Exam: DSC 140A Midterm 1,/ })).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem('runway:pending-source'))).toBeNull();
  const { data: sources } = await admin
    .from('calendar_sources')
    .select('label, kind, status')
    .eq('user_id', userId);
  expect(sources).toEqual([{ label: 'Google Calendar', kind: 'ical', status: 'ok' }]);
  // Reloading doesn't add it twice.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your runway' })).toBeVisible();
  expect((await admin.from('calendar_sources').select('id').eq('user_id', userId)).data).toHaveLength(1);
  expect(OWNER_HANDLE).toBe('owner');
});

test('a waiting address that can’t be added sends the new account to Connect with the reason', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'runway:pending-source',
      JSON.stringify({
        kind: 'ical',
        label: 'Google Calendar',
        url: 'https://calendar.example.com/x…',
        at: Date.now(),
      }),
    ),
  );
  await signIn(page);
  await page.goto('./');
  await expect(page).toHaveURL(/#\/connect$/, { timeout: 30_000 });
  await expect(page.getByText(/The calendar you tried before signing up couldn't be added/)).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const)
  test(`the try page at 375 px, ${scheme}: the guide and the preview, axe-clean`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto('./#/try');
    await expect(page.getByRole('heading', { name: 'See your runway first' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
    const a = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(a.violations.map((v) => v.id)).toEqual([]);
    await page.screenshot({ path: `tests/e2e/__screenshots__/try-mobile-${scheme}.png`, fullPage: true });
    await drawPreview(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
    const b = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(b.violations.map((v) => v.id)).toEqual([]);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `tests/e2e/__screenshots__/try-preview-mobile-${scheme}.png`,
      fullPage: true,
    });
  });
