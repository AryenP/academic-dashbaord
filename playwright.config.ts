import { defineConfig, devices } from '@playwright/test';

// Runs against the production build (vite preview), so what's tested is what Pages serves.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173/academic-dashbaord/',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'npx vite preview',
    url: 'http://127.0.0.1:4173/academic-dashbaord/',
    reuseExistingServer: !process.env.CI,
  },
});
