import { defineConfig } from 'vitest/config'

// This project keeps JSX in .js files (Next.js style). Vite's oxc transformer parses
// JSX by file extension and skips .js by default, so point it at .js too and parse as
// JSX. The codebase is all JavaScript (no TypeScript), so a blanket jsx lang is safe.
export default defineConfig({
  oxc: {
    include: /\.[jt]sx?$/,
    exclude: /node_modules/,
    lang: 'jsx',
    jsx: { runtime: 'automatic', importSource: 'react' },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.js'],
  },
})
