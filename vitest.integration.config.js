import { defineConfig } from 'vitest/config'

// Integration tests run against a LOCAL Supabase stack (npx supabase start).
// They are kept out of the default `npm test` suite (which stays fast and needs
// no services) and run on their own with `npm run test:integration`. They share
// one database, so they run serially rather than in parallel.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.js'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
  },
})
