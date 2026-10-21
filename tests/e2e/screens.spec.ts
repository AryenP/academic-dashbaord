import { test } from '@playwright/test';
import { SCHEMES, SIZES, freezeTime } from './fixtures';

// Screenshots of every view at phone and laptop sizes, light and dark, for review after each phase.
// They're written to tests/e2e/__screenshots__/ (git-ignored), not compared pixel-for-pixel.
const ROUTES = [{ name: 'home', path: './' }];

for (const r of ROUTES)
  for (const s of SIZES)
    for (const scheme of SCHEMES)
      test(`screen ${r.name} ${s.name} ${scheme}`, async ({ page }) => {
        await freezeTime(page);
        await page.setViewportSize({ width: s.width, height: s.height });
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
        await page.goto(r.path);
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          path: `tests/e2e/__screenshots__/${r.name}-${s.name}-${scheme}.png`,
          fullPage: true,
        });
      });
