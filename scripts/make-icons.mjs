// Renders the app icons (the favicon's three runway bars) to PNG with Playwright's Chromium.
// Run once after changing the design: node scripts/make-icons.mjs
import { chromium } from '@playwright/test';

const bars = (pad) => `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="100%" height="100%">
    <rect width="32" height="32" fill="#15171c"/>
    <g transform="translate(${pad} ${pad}) scale(${(32 - 2 * pad) / 32})">
      <rect x="3" y="14" width="6" height="15" rx="2" fill="#7aa7ff"/>
      <rect x="13" y="8" width="6" height="21" rx="2" fill="#4fd1bd"/>
      <rect x="23" y="3" width="6" height="26" rx="2" fill="#ff5a50"/>
    </g>
  </svg>`;

const icons = [
  { file: 'icon-192.png', size: 192, pad: 3 },
  { file: 'icon-512.png', size: 512, pad: 3 },
  { file: 'icon-maskable-512.png', size: 512, pad: 7 }, // safe zone: the inner 80%
  { file: 'apple-touch-icon.png', size: 180, pad: 4 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const i of icons) {
  await page.setViewportSize({ width: i.size, height: i.size });
  await page.setContent(`<body style="margin:0">${bars(i.pad)}</body>`);
  await page.screenshot({ path: `public/icons/${i.file}`, omitBackground: false });
}
await browser.close();
console.log('wrote', icons.map((i) => i.file).join(', '));
