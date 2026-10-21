import { defineConfig, devices } from '@playwright/test';
import { execSync } from 'node:child_process';

// Browser tests for the signed-in app, against a local Supabase (`supabase start`).
// Run with `npm run test:e2e:db`. The build points at the local stack.
const status = JSON.parse(
  execSync('supabase status -o json', { stdio: ['ignore', 'pipe', 'ignore'] }).toString(),
);

export default defineConfig({
  testDir: 'tests/e2e-db',
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4174/academic-dashbaord/',
    timezoneId: 'America/Los_Angeles',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'npx vite build --outDir dist-db && npx vite preview --outDir dist-db --port 4174',
    url: 'http://127.0.0.1:4174/academic-dashbaord/',
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_SUPABASE_URL: status.API_URL,
      VITE_SUPABASE_ANON_KEY: status.ANON_KEY,
      VITE_SPOTIFY_CLIENT_ID: 'test-client-id',
    },
    timeout: 120_000,
  },
});
