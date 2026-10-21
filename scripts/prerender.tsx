// Renders the landing page to static HTML inside dist/index.html after `vite build`, so crawlers
// and link previews get real markup and the first paint needs no JavaScript. The app takes over
// the same element when it loads (src/main.tsx). Run with `npm run build`.
import { readFileSync, writeFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { Landing } from '../src/landing/Landing';

const file = new URL('../dist/index.html', import.meta.url);
const html = readFileSync(file, 'utf8');
const marker = '<div id="root"></div>';
if (!html.includes(marker)) throw new Error('dist/index.html has no empty #root to fill');
const landing = renderToString(<Landing static />);
writeFileSync(file, html.replace(marker, `<div id="root">${landing}</div>`));
console.log(`prerendered the landing page (${landing.length} bytes)`);
