import { defineConfig } from 'vitest/config';

// Database tests: need a local Supabase (`supabase start`). Run with `npm run test:db`.
export default defineConfig({
  test: { environment: 'node', include: ['supabase/tests/**/*.test.ts'], testTimeout: 20_000 },
});
