import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { SCHEMES } from '../e2e/fixtures';
import { connectedSpotify } from './fakeSpotify';
import { admin, resetDb, seedSession, signIn } from './helpers';

// Automated accessibility check (axe, WCAG 2.1 AA) of every view, signed in, in light and dark.
const VIEWS = ['./', './#/focus', './#/log', './#/stats', './#/settings', './#/setup/phone'];

for (const scheme of SCHEMES)
  test(`no WCAG A/AA violations, ${scheme}`, async ({ page }) => {
    const userId = await resetDb();
    await seedSession(userId, {
      startedMinAgo: 200,
      lengthMin: 50,
      focus_pct: 88,
      pickups: 2,
      phone_seconds: 120,
    });
    await admin
      .from('profiles')
      .update({ phone_token_hash: 'x'.repeat(64) })
      .eq('id', userId);
    await signIn(page);
    await connectedSpotify(page);
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const problems: string[] = [];
    const check = async (where: string) => {
      const r = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      for (const v of r.violations)
        problems.push(
          `${where}: ${v.id} (${v.impact}) ${v.nodes
            .map((n) => n.target.join(' '))
            .slice(0, 3)
            .join(' | ')}`,
        );
    };
    for (const v of VIEWS) {
      await page.goto(v);
      await page.waitForLoadState('networkidle');
      await check(v);
    }
    // The running session and the break screen.
    await seedSession(userId, { startedMinAgo: 10 });
    await page.goto('./#/focus');
    await page.getByRole('timer').waitFor();
    await check('focus running');
    await page.getByRole('button', { name: 'Break', exact: true }).click();
    await page.getByRole('button', { name: 'Back to work' }).waitFor();
    await check('break');
    expect(problems).toEqual([]);
  });
