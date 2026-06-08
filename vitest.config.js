import { defineConfig, configDefaults } from 'vitest/config'

// This project keeps JSX in .js files (Next.js style). Vite's oxc transformer parses
// JSX by file extension and skips .js by default, so point it at .js too. The codebase
// is migrating to TypeScript, so parse everything as tsx -- a superset that handles both
// the legacy JSX-in-.js files and the new .ts/.tsx files.
export default defineConfig({
  oxc: {
    include: /\.[jt]sx?$/,
    exclude: /node_modules/,
    lang: 'tsx',
    jsx: { runtime: 'automatic', importSource: 'react' },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.js'],
    // Integration tests need a live Supabase stack; they run via their own config
    // (npm run test:integration), not the default fast suite.
    exclude: [...configDefaults.exclude, 'tests/integration/**'],
  },
})
