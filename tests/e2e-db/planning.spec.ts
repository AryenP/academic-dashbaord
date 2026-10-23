import { expect, test } from '@playwright/test';
import { admin, resetDb, seedPlan, seedSession, signIn } from './helpers';
import { atWallTime, localIso } from '../../src/lib/tz';

const TZ = 'America/Los_Angeles';

// The planner (the plain allocator here, since the AI isn't set up in tests), proposals on the
// runway, accepting them, ticking deadlines, and the plan as a calendar feed.

let userId: string;
test.afterEach(async () => {
  // Whatever a test did to the AI switch, the next one starts with it on.
  await admin.from('app_config').update({ value: true }).eq('key', 'ai_enabled');
});

test.beforeEach(async () => {
  userId = await resetDb();
  await seedPlan(userId);
});

test('draft a plan: proposals are drawn dashed with a reason, accept all puts them on the runway', async ({
  page,
}) => {
  // The plain allocator, not the model: deterministic and free. (The model path is covered in Deno.)
  await admin.from('app_config').update({ value: false }).eq('key', 'ai_enabled');
  // The demo plan already has enough prep for its exams; add a heavy one with none.
  const { data: c } = await admin
    .from('courses')
    .insert({ user_id: userId, code: 'PHYS 2A', color: 5 })
    .select('id')
    .single();
  const inDays = (d: number, h: number) => new Date(Date.now() + d * 864e5 + h * 3_600_000).toISOString();
  await admin.from('plan_items').insert({
    user_id: userId,
    course_id: c!.id,
    kind: 'exam',
    title: 'Final',
    start_at: inDays(12, 0),
    end_at: inDays(12, 2),
    weight: 40,
  });
  await signIn(page);
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Your runway' })).toBeVisible();
  const before = await page.locator('.rw-block.k-study').count();
  await page.getByRole('button', { name: 'Draft a plan' }).click();
  await expect(page.getByText(/Runway drafted \d+ study blocks?/)).toBeVisible({ timeout: 20_000 });
  const proposed = page.locator('.rw-block.is-proposed');
  expect(await proposed.count()).toBeGreaterThan(0);
  await proposed.first().hover();
  await expect(page.locator('.mc-tip')).toContainText('proposed');
  await expect(page.locator('.mc-tip .t3')).toContainText(/days? out/);
  // Proposals never overlap what's already there, and stay inside the study window.
  const { data: rows } = await admin
    .from('plan_items')
    .select('start_at, end_at, accepted, kind')
    .eq('user_id', userId);
  const accepted = rows!.filter((r) => r.accepted);
  for (const p of rows!.filter((r) => !r.accepted)) {
    for (const a of accepted)
      expect(
        Date.parse(p.start_at) < Date.parse(a.end_at) && Date.parse(p.end_at) > Date.parse(a.start_at),
      ).toBe(false);
  }
  // The agenda lists them as proposed with accept/drop; drop one.
  await page.getByRole('button', { name: 'Study' }).click();
  const prows = page.locator('.mc-table tr.is-proposed');
  const n = await prows.count();
  await expect(prows.first()).toContainText('Proposed');
  await prows.first().getByRole('button', { name: 'Drop' }).click();
  await expect(prows).toHaveCount(n - 1, { timeout: 10_000 });
  await expect(proposed).toHaveCount(n - 1);

  await page.getByRole('button', { name: 'Accept all' }).click();
  await expect(page.locator('.rw-block.is-proposed')).toHaveCount(0, { timeout: 10_000 });
  expect(await page.locator('.rw-block.k-study').count()).toBeGreaterThan(before);
  await expect(page.getByText(/Runway drafted/)).toHaveCount(0);
  const { count } = await admin
    .from('plan_items')
    .select('*', { count: 'exact', head: true })
    .eq('accepted', false);
  expect(count).toBe(0);
});

test('ticking a deadline marks it submitted everywhere, and the week counts it', async ({ page }) => {
  // A deadline due tonight, in the person's day (Pacific), not the test runner's: on a UTC runner
  // after 4 PM Pacific, "tonight" by the runner's clock is already tomorrow on the runway.
  const today = localIso(Date.now(), TZ).slice(0, 10);
  const tonight = Date.parse(atWallTime(today, 23, 0, TZ));
  await admin.from('plan_items').insert({
    user_id: userId,
    kind: 'deadline',
    title: 'Lab 9 due',
    start_at: new Date(tonight).toISOString(),
    end_at: new Date(tonight + 59 * 60_000).toISOString(),
  });
  await signIn(page);
  await page.goto('./');
  const tick = page.locator('#today .td-item', { hasText: 'Lab 9 due' }).locator('.td-tick input');
  await tick.check();
  await expect(page.locator('#today .td-item.is-submitted')).toHaveCount(1);
  await expect
    .poll(
      async () =>
        (await admin.from('plan_items').select('status, submitted_by').eq('status', 'submitted')).data?.[0],
    )
    .toEqual({ status: 'submitted', submitted_by: 'me' });
  await expect(page.locator('.rw-block.k-deadline.is-submitted')).toHaveCount(1);
  await page.goto('./#/review');
  await expect(page.getByText(/1 on time/)).toBeVisible();
});

test('the plan as a calendar: a link is made once and serves the accepted plan as iCalendar', async ({
  page,
  request,
}) => {
  await seedSession(userId, { startedMinAgo: 120, lengthMin: 30 });
  await signIn(page);
  await page.goto('./#/settings');
  await page.getByRole('button', { name: 'Make the link' }).click();
  const box = page.getByLabel('Subscribe link (shown once)');
  await expect(box).toHaveValue(/^webcal:\/\/.+plan-feed\?t=[0-9a-f]{48}$/);
  const url = (await box.inputValue()).replace(/^webcal:\/\//, 'http://');
  const r = await request.get(url);
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toContain('text/calendar');
  const ics = await r.text();
  expect(ics).toContain('BEGIN:VCALENDAR');
  expect(ics).toContain('SUMMARY:MATH 20C Midterm 1');
  expect(ics).toContain('📚 MATH 20C');
  // A wrong token is a 404, and a replaced token stops the old link.
  expect((await request.get(url.replace(/t=.*/, 't=' + '0'.repeat(48)))).status()).toBe(404);
  await page.reload();
  await page.getByRole('button', { name: /Make a new link/ }).click();
  await expect(page.getByLabel('Subscribe link (shown once)')).toHaveValue(/webcal/);
  expect((await request.get(url)).status()).toBe(404);
});

test('planning settings are saved', async ({ page }) => {
  await signIn(page);
  await page.goto('./#/settings');
  await page.getByLabel('Study hours per day, at most').fill('4');
  await page.getByLabel('Study hours per day, at most').blur();
  await page.getByRole('button', { name: 'Sun', pressed: false }).click();
  await expect
    .poll(
      async () => (await admin.from('profiles').select('settings').eq('id', userId).single()).data?.settings,
    )
    .toMatchObject({
      planning: { hours_per_day: 4, days_off: [0] },
    });
});
