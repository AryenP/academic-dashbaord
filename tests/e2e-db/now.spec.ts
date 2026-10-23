import { expect, test } from '@playwright/test';
import { admin, resetDb, seedPlan, signIn } from './helpers';

// The second screen: no navigation, a countdown to or through the block, the next exam, a way back.

test('the second screen shows the block, the countdown and the next exam, without the nav', async ({
  page,
}) => {
  const userId = await resetDb();
  await seedPlan(userId);
  await signIn(page);
  await page.goto('./#/now');
  await expect(page.locator('.ks')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  await expect(page.locator('.ks-num')).toHaveText(/^\d+:\d\d(:\d\d)?$|^\d+ d \d+ h$/);
  await expect(page.locator('.ks-exam')).toContainText('Midterm 1');
  await expect(page.locator('.ks-exam')).toContainText('Center Hall 115');
  await expect(page).toHaveTitle(/· (MATH 20C|CSE 12|COGS 1|HIST 10)$/);
  await page.getByRole('link', { name: 'Back to the runway' }).click();
  await expect(page.getByRole('heading', { name: 'Your runway' })).toBeVisible();
  // The runway page carries the forecast line and the week in words.
  await expect(page.locator('.mc-forecast')).toContainText('The week:');
  await page.getByText('The week in words').click();
  await expect(page.locator('.mc-words dt').first()).toHaveText('Today');
  await expect(page.locator('.mc-words dd').first()).toContainText('MATH 20C');
  // The pace line on the first checkpoint, in the person's own numbers.
  await expect(page.locator('.cp-pace').first()).toContainText('Nothing logged for MATH 20C yet');
  await expect(page.locator('.cp-pace').first()).toContainText('h of blocks still ahead');
});

test('a day with more study than room says so, in the forecast and in the words', async ({ page }) => {
  const userId = await resetDb();
  await seedPlan(userId);
  // A 9-to-5 shift this Saturday and a short evening window: Saturday's 4 h of study won't fit.
  const sat = new Date();
  sat.setDate(sat.getDate() + ((6 - sat.getDay() + 7) % 7 || 7));
  const day = sat.toISOString().slice(0, 10);
  await admin.from('plan_items').insert({
    user_id: userId,
    kind: 'commitment',
    title: 'Work shift',
    start_at: `${day}T09:00:00-07:00`,
    end_at: `${day}T17:00:00-07:00`,
  });
  await admin
    .from('profiles')
    .update({ settings: { planning: { earliest: '18:00', latest: '21:00' } } })
    .eq('id', userId);
  await signIn(page);
  await page.goto('./');
  await expect(page.locator('.mc-forecast')).toContainText(/overfull (Saturday|tomorrow|today) \(/);
  await page.getByText('The week in words').click();
  await expect(page.locator('.mc-words')).toContainText('Overfull:');
});
