import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { admin, resetDb, signIn } from './helpers';

// The last day: a term whose exams have all passed. The runway says the term is over and points to
// the term page, which gives the student their own numbers.

const DAY = 864e5;
const ago = (days: number, hour = 17) => {
  const d = new Date(Date.now() - days * DAY);
  const day = d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  return `${day}T${String(hour).padStart(2, '0')}:00:00-07:00`;
};
const plus = (iso: string, hours: number) => new Date(Date.parse(iso) + hours * 3_600_000).toISOString();

async function seedTerm(userId: string) {
  const { data: courses } = await admin
    .from('courses')
    .insert([
      { user_id: userId, code: 'MATH 20C', name: 'Calculus III', color: 1 },
      { user_id: userId, code: 'CSE 12', name: 'Data structures', color: 2 },
    ])
    .select('id, code');
  const id = (code: string) => courses!.find((c) => c.code === code)!.id;
  await admin.from('plan_items').insert([
    {
      user_id: userId,
      course_id: id('MATH 20C'),
      kind: 'study',
      title: 'Practice',
      start_at: ago(20, 10),
      end_at: plus(ago(20, 10), 3),
    },
    {
      user_id: userId,
      course_id: id('MATH 20C'),
      kind: 'exam',
      title: 'Final',
      start_at: ago(10),
      end_at: plus(ago(10), 3),
      score: 91,
      max_score: 100,
    },
    {
      user_id: userId,
      course_id: id('CSE 12'),
      kind: 'study',
      title: 'Trees',
      start_at: ago(9, 10),
      end_at: plus(ago(9, 10), 2),
    },
    {
      user_id: userId,
      course_id: id('CSE 12'),
      kind: 'exam',
      title: 'Final',
      start_at: ago(5),
      end_at: plus(ago(5), 3),
    },
  ]);
  const session = (days: number, hours: number, course: string, pct: number) => ({
    user_id: userId,
    course,
    mode: 'flow',
    started_at: ago(days, 9),
    ended_at: plus(ago(days, 9), hours),
    focus_pct: pct,
  });
  await admin
    .from('sessions')
    .insert([
      session(30, 2, 'MATH 20C', 80),
      session(19, 3, 'MATH 20C', 90),
      session(18, 1.5, 'MATH 20C', 70),
      session(8, 2, 'CSE 12', 85),
    ]);
}

test('after the last exam the runway points to the term, which has the student’s own numbers', async ({
  page,
}) => {
  const userId = await resetDb();
  await seedTerm(userId);
  await signIn(page);
  await page.goto('./');
  await expect(page.locator('.mc-lede')).toContainText('The term is over');
  await page.getByRole('link', { name: 'See your term in numbers.' }).click();
  await expect(page.getByRole('heading', { name: 'Your term', exact: true })).toBeVisible();
  const tiles = page.getByRole('region', { name: 'The term in numbers' });
  await expect(tiles).toContainText('8.5 h');
  await expect(tiles).toContainText('in 4 sessions');
  await expect(tiles).toContainText('83%'); // (2×80 + 3×90 + 1.5×70 + 2×85) ÷ 8.5 h
  const courses = page.getByRole('region', { name: 'By course' });
  await expect(courses.locator('li').first()).toContainText('MATH 20C');
  await expect(courses.locator('li').first()).toContainText('6.5 h');
  const exams = page.getByRole('region', { name: 'Exams' });
  await expect(exams.locator('li')).toHaveCount(2);
  await expect(exams.locator('li').first()).toContainText('6.5 h studied of 3 h planned. Scored 91 / 100.');
  await expect(exams.locator('li').nth(1)).toContainText('2 h studied of 2 h planned.');
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
});

for (const scheme of ['light', 'dark'] as const)
  test(`the term page at 375 px, ${scheme}`, async ({ page }) => {
    const userId = await resetDb();
    await seedTerm(userId);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await signIn(page);
    await page.goto('./#/term');
    await expect(page.getByRole('region', { name: 'Exams' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations.map((v) => v.id)).toEqual([]);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `tests/e2e/__screenshots__/term-mobile-${scheme}.png`, fullPage: true });
  });

test('mid-term, Stats links to the term so far', async ({ page }) => {
  const userId = await resetDb();
  await seedTerm(userId);
  // One more exam ahead: the term isn't over.
  const { data: c } = await admin
    .from('courses')
    .select('id')
    .eq('user_id', userId)
    .eq('code', 'CSE 12')
    .single();
  const later = new Date(Date.now() + 4 * DAY).toISOString();
  await admin.from('plan_items').insert({
    user_id: userId,
    course_id: c!.id,
    kind: 'exam',
    title: 'Retake',
    start_at: later,
    end_at: plus(later, 2),
  });
  await signIn(page);
  await page.goto('./#/stats');
  await page.getByRole('link', { name: 'Your term so far' }).click();
  await expect(page.getByRole('heading', { name: 'Your term so far' })).toBeVisible();
});
