// Renders the landing page to static HTML inside dist/index.html after `vite build`, so crawlers
// and link previews get real markup and the first paint needs no JavaScript. The app takes over
// the same element when it loads (src/main.tsx). Run with `npm run build`.
import { readFileSync, writeFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { Landing } from '../src/landing/Landing';
import { PrivacyText } from '../src/views/PrivacyText';

const file = new URL('../dist/index.html', import.meta.url);
const html = readFileSync(file, 'utf8');
const marker = '<div id="root"></div>';
if (!html.includes(marker)) throw new Error('dist/index.html has no empty #root to fill');
const landing = renderToString(<Landing static />);
writeFileSync(file, html.replace(marker, `<div id="root">${landing}</div>`));
console.log(`prerendered the landing page (${landing.length} bytes)`);

// A plain-URL privacy page (privacy.html) with the same styles, for crawlers and app reviews that
// can't read a hash route. The app's own #/privacy keeps working.
const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
const keep = head
  .split('\n')
  .filter((l) =>
    /<link rel="stylesheet"|<meta (charset|name="viewport"|name="color-scheme"|name="theme-color")|<link rel="icon"/.test(
      l,
    ),
  )
  .join('\n');
const privacy = renderToString(<PrivacyText home="./" />);
const page = `<!doctype html>
<html lang="en">
  <head>
    ${keep}
    <title>Privacy · Runway</title>
    <meta name="description" content="What Runway reads, who can see it, where it's stored, and how to delete everything." />
  </head>
  <body>
    <div class="app-root"><main><div class="page page-narrow prose">${privacy}</div></main></div>
  </body>
</html>
`;
writeFileSync(new URL('../dist/privacy.html', import.meta.url), page);
console.log('prerendered privacy.html');
