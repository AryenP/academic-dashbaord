// Renders public/og.png (the link-preview image) from the landing page's hero. Run with a preview
// server up: `npx vite preview` then `node scripts/og.mjs`.
import { chromium } from '@playwright/test';

const url = process.env.OG_URL ?? 'http://127.0.0.1:4173/academic-dashbaord/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.clock.setFixedTime(new Date('2026-10-22T11:00:00-07:00'));
await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
await page.goto(url);
await page.locator('.rw-block').first().waitFor();
await page.evaluate(() => document.fonts.ready);
// Just the headline and the board, tightened for the card.
await page.addStyleTag({
  content: `
    .ld { padding: 28px 40px; }
    .ld-top, .ld-lede, .ld-cta, .ld-board-note, .ld-how, .ld-proof, .ld-end, .ld-foot { display: none !important; }
    .ld-h1 { font-size: 72px; max-width: none; margin-bottom: 20px; }
    .ld-hero { gap: 0; }
  `,
});
await page.screenshot({ path: 'public/og.png', clip: { x: 0, y: 0, width: 1200, height: 630 } });
await browser.close();
console.log('wrote public/og.png');
