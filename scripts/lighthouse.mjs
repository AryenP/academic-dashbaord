// Lighthouse on the built site, mobile, for the landing page and the sign-in screen. Fails below
// performance 90 or accessibility 100 (the spec's bar). Run `npm run build` first, then
// `npm run lighthouse`. Uses Playwright's Chromium, so nothing else needs installing.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import lighthouse from 'lighthouse';
import { chromium } from 'playwright';

const PORT = 4175;
const BASE = `http://127.0.0.1:${PORT}/academic-dashbaord/`;
const PAGES = [
  { name: 'landing', url: BASE },
  { name: 'sign-in', url: `${BASE}#/signin` },
];
const BAR = { performance: 0.9, accessibility: 1 };

if (!existsSync(new URL('../dist/index.html', import.meta.url))) {
  console.error('dist/ is missing: run `npm run build` first.');
  process.exit(2);
}

const preview = spawn(
  'npx',
  ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
  {
    stdio: 'ignore',
  },
);
const stop = () => preview.kill();
process.on('exit', stop);
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(BASE)).ok) break;
  } catch {
    // not up yet
  }
  await new Promise((r) => setTimeout(r, 200));
}

const browser = await chromium.launch({ args: ['--remote-debugging-port=9222'] });
let failed = false;
try {
  for (const p of PAGES) {
    const result = await lighthouse(
      p.url,
      { port: 9222, output: 'json', logLevel: 'error', onlyCategories: Object.keys(BAR) },
      // Mobile defaults; 'simulate' throttling needs no special network setup.
      { extends: 'lighthouse:default', settings: { formFactor: 'mobile', throttlingMethod: 'simulate' } },
    );
    const cats = result.lhr.categories;
    const line = Object.keys(BAR)
      .map((k) => `${k} ${Math.round(cats[k].score * 100)}`)
      .join(', ');
    const bad = Object.entries(BAR).filter(([k, min]) => cats[k].score < min);
    console.log(`${bad.length ? '✗' : '✓'} ${p.name}: ${line}`);
    if (bad.length) {
      failed = true;
      for (const a of Object.values(result.lhr.audits))
        if (a.score != null && a.score < 1 && a.scoreDisplayMode !== 'informative')
          console.log(`    ${a.id}: ${a.title}${a.displayValue ? ` (${a.displayValue})` : ''}`);
    }
  }
} finally {
  await browser.close();
  stop();
}
process.exit(failed ? 1 : 0);
