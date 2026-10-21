import { test } from '@playwright/test';
import { SCHEMES, SIZES } from '../e2e/fixtures';
import { connectedSpotify } from './fakeSpotify';
import { admin, resetDb, seedSession, signIn } from './helpers';

// Screenshots of the signed-in views with a week of realistic sessions, for review after each phase.
// Written to tests/e2e/__screenshots__/ (git-ignored).

const COURSES = ['DSC 140A', 'DSC 102', 'CSE 151A', 'DSC 106'];

async function seedWeek(userId: string) {
  const rows = [];
  for (let d = 1; d <= 6; d++)
    for (let k = 0; k < 2; k++) {
      const start = d * 24 * 60 + (k ? 420 : 180);
      rows.push({
        user_id: userId,
        course: COURSES[(d + k) % 4],
        mode: 'pomodoro',
        started_at: new Date(Date.now() - start * 60_000).toISOString(),
        ended_at: new Date(Date.now() - (start - 55 - k * 30) * 60_000).toISOString(),
        break_seconds: 300,
        rating: 3 + ((d + k) % 3),
        focus_pct: 70 + ((d * 7 + k * 11) % 29),
        pickups: (d + k * 2) % 5,
        phone_seconds: ((d + k * 2) % 5) * 90,
        note: k ? null : 'Practice set, then cheat sheet',
      });
    }
  await admin.from('sessions').insert(rows);
  await seedSession(userId, { startedMinAgo: 150, lengthMin: 50, course: 'DSC 140A' });
  await admin
    .from('profiles')
    .update({ phone_token_hash: 'x'.repeat(64) })
    .eq('id', userId);
  const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
  await admin.from('phone_events').insert([
    { user_id: userId, app: 'Instagram', kind: 'open', at: ago(9), received_at: ago(9) },
    { user_id: userId, app: 'Instagram', kind: 'close', at: ago(7), received_at: ago(7) },
  ]);
}

const VIEWS = [
  { name: 'home-owner', path: './' },
  { name: 'log', path: './#/log' },
  { name: 'stats', path: './#/stats' },
  { name: 'review', path: './#/review' },
  { name: 'settings', path: './#/settings' },
  { name: 'setup-phone', path: './#/setup/phone' },
  { name: 'focus-start', path: './#/focus' },
];

for (const s of SIZES)
  for (const scheme of SCHEMES)
    test(`signed-in screens ${s.name} ${scheme}`, async ({ page }) => {
      const userId = await resetDb();
      await seedWeek(userId);
      await signIn(page);
      await connectedSpotify(page);
      await page.setViewportSize({ width: s.width, height: s.height });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      const shot = async (name: string) => {
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(300);
        await page.screenshot({
          path: `tests/e2e/__screenshots__/${name}-${s.name}-${scheme}.png`,
          fullPage: true,
        });
      };
      for (const v of VIEWS) {
        await page.goto(v.path);
        await page.waitForLoadState('networkidle');
        await shot(v.name);
      }
      // A running session, its break due, and a break.
      await seedSession(userId, { startedMinAgo: 18, course: 'DSC 140A' });
      await page.goto('./#/focus');
      await page.getByRole('timer').waitFor();
      await shot('focus-running');
      await page.getByRole('button', { name: 'Break', exact: true }).click();
      await page.getByRole('button', { name: 'Back to work' }).waitFor();
      await shot('focus-break');
      await page.getByRole('button', { name: 'Back to work' }).click();
      await page.getByRole('button', { name: 'End' }).click();
      await page.getByRole('heading', { name: 'Session done.' }).waitFor();
      await shot('focus-end');
    });
