import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { admin, resetDb, seedPlan, seedSession, signIn } from './helpers';
import { EXPORT_KEYS } from '../../src/lib/export';

// Settings → Account → Download my data: one JSON file with the person's own rows and nothing of
// anyone else's. User B has rows in the same tables; none of them may appear.

test.beforeEach(async () => {
  await resetDb();
});

test('download my data: every key, only my rows, no secrets', async ({ page }) => {
  const me = await (async () => {
    const { data } = await admin.auth.admin.listUsers();
    return data.users[0].id;
  })();
  await seedPlan(me);
  const mine = await seedSession(me, { startedMinAgo: 90, lengthMin: 50, note: 'library, no laptop' });
  await admin.from('signals').insert({ user_id: me, day: '2026-10-21', kind: 'sleep_h', value: 7.5 });
  await admin.from('access_tokens').insert({ user_id: me, purpose: 'feed', token_hash: 'a'.repeat(64) });

  const { data: b } = await admin.auth.admin.createUser({
    email: 'b@ucsd.edu',
    password: 'test-password-123',
    email_confirm: true,
  });
  const other = b.user!.id;
  await admin.from('courses').insert({ user_id: other, code: 'HIST 2A', color: 3 });
  await seedSession(other, { course: 'HIST 2A', startedMinAgo: 60, lengthMin: 30, note: 'secret of B' });
  await admin.from('signals').insert({ user_id: other, day: '2026-10-21', kind: 'steps', value: 9000 });

  await signIn(page);
  await page.goto('./#/settings');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download my data' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^runway-owner-\d{4}-\d{2}-\d{2}\.json$/);
  const text = readFileSync((await file.path())!, 'utf8');
  const data = JSON.parse(text);

  for (const k of EXPORT_KEYS) expect(data, k).toHaveProperty(k);
  expect(data.profile.handle).toBe('owner');
  expect(data.profile.phone_token_hash).toBeUndefined();
  expect(data.courses.map((c: { code: string }) => c.code).sort()).toEqual(
    ['MATH 20C', 'CSE 12', 'COGS 1', 'HIST 10'].sort(),
  );
  expect(data.courses.every((c: { user_id: string }) => c.user_id === me)).toBe(true);
  expect(data.plan_items.length).toBeGreaterThan(0);
  expect(data.plan_items.every((p: { user_id: string }) => p.user_id === me)).toBe(true);
  expect(data.sessions.map((s: { id: string }) => s.id)).toEqual([mine.id]);
  expect(data.signals).toHaveLength(1);
  expect(data.signals[0].kind).toBe('sleep_h');
  expect(data.access_tokens).toEqual([
    expect.objectContaining({ purpose: 'feed', created_at: expect.any(String) }),
  ]);
  expect(data.access_tokens[0].token_hash).toBeUndefined();
  expect(text).not.toContain('HIST 2A');
  expect(text).not.toContain('secret of B');
  expect(text).not.toContain('a'.repeat(64));
  await expect(page.getByText('Saved as runway-owner-')).toBeVisible();
});
