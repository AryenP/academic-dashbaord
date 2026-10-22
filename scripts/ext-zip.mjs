// Packs the browser extension for the Chrome Web Store: extension/dist/runway-extension-<version>.zip
// with only the files the extension runs (no tests, types or README), named from manifest.json.
// Run with `npm run ext:zip`. Uses the system `zip`, present on macOS and Linux.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../extension/', import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const FILES = [
  'manifest.json',
  'background.js',
  'content.js',
  'parsers.js',
  'popup.html',
  'popup.js',
  'icon-128.png',
];
for (const f of FILES) if (!existsSync(join(root, f))) throw new Error(`extension/${f} is missing`);

const out = join(root, 'dist');
mkdirSync(out, { recursive: true });
const zip = join(out, `runway-extension-${manifest.version}.zip`);
rmSync(zip, { force: true });
execFileSync('zip', ['-q', '-X', zip, ...FILES], { cwd: root, stdio: 'inherit' });
console.log(`extension/dist/runway-extension-${manifest.version}.zip (${FILES.length} files)`);
