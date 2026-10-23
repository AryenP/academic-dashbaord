import { expect, test } from '@playwright/test';
import { admin, resetDb, seedPlan, signIn } from './helpers';

// A calendar that hasn't been read for hours changes the runway footer's voice and offers a read.

test('the footer says when the sync went quiet', async ({ page }) => {
  const userId = await resetDb();
  await seedPlan(userId);
  const threeHoursAgo = new Date(Date.now() - 3 * 3600_000).toISOString();
  await admin.from('calendar_sources').insert({
    user_id: userId,
    kind: 'ical',
    label: 'School',
    status: 'ok',
    last_synced_at: threeHoursAgo,
    next_sync_at: new Date().toISOString(),
  });
  await signIn(page);
  await page.goto('./');
  const foot = page.locator('.mc-foot-warn');
  await expect(foot).toContainText("Your calendars haven't been read for 3 h");
  await expect(foot.getByRole('button', { name: 'Read them now' })).toBeVisible();

  // A fresh read restores the calm footer.
  await admin
    .from('calendar_sources')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('user_id', userId);
  await page.reload();
  await expect(page.locator('.mc-foot')).toContainText('Synced from School');
  await expect(page.locator('.mc-foot-warn')).toHaveCount(0);
});
