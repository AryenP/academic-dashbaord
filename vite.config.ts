/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Builds the service worker from src/sw/sw.js with this build's file list and a build id, so the
// whole app is cached on install (including views not opened yet) and each deploy replaces the
// previous cache instead of piling up next to it.
const serviceWorker = (): Plugin => ({
  name: 'runway-service-worker',
  apply: 'build',
  generateBundle(_, bundle) {
    const files = Object.keys(bundle)
      .filter((f) => !f.endsWith('.map') && f !== 'index.html')
      .sort();
    const id = createHash('sha256').update(files.join('|')).digest('hex').slice(0, 10);
    const source = readFileSync('src/sw/sw.js', 'utf8')
      .replace('__BUILD__', id)
      .replace('__PRECACHE__', JSON.stringify(files));
    this.emitFile({ type: 'asset', fileName: 'sw.js', source });
  },
});

export default defineConfig({
  base: '/academic-dashbaord/',
  plugins: [react(), serviceWorker()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
