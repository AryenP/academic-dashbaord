import { expect, test } from '@playwright/test';
import { admin, resetDb, seedPlan, seedSession, signIn } from './helpers';

// Settings → "What Runway holds about you": the person's own counts, with download and delete
// beside them. The numbers come through RLS, so a second person's rows never move them.

test('the panel counts my rows and not anyone else’s', async ({ page }) => {
  const me = await resetDb();
  await seedPlan(me);
  await seedSession(me, { startedMinAgo: 90, lengthMin: 50 });
  await admin.from('signals').insert({ user_id: me, day: '2026-10-21', kind: 'sleep_h', value: 7 });
  const { data: b } = await admin.auth.admin.createUser({
    email: 'b@ucsd.edu',
    password: 'test-password-123',
    email_confirm: true,
  });
  await admin.from('courses').insert({ user_id: b.user!.id, code: 'HIST 2A', color: 3 });
  await seedSession(b.user!.id, { course: 'HIST 2A', startedMinAgo: 60, lengthMin: 30 });

  await signIn(page);
  await page.goto('./#/settings');
  const panel = page.getByRole('region', { name: 'What Runway holds about you' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('4 courses')).toBeVisible();
  await expect(panel.getByText('1 session')).toBeVisible();
  await expect(panel.getByText('1 phone signal')).toBeVisible();
  await expect(panel.getByText('no calendars connected')).toBeVisible();
  await expect(panel.getByText('Nobody can see your runway')).toBeVisible();
  await expect(panel.getByText('The model has read nothing this month')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Download my data' })).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Delete my account' })).toBeVisible();
});
