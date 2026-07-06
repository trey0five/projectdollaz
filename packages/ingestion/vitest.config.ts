import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Legacy adapter suites live in __tests__; co-located *.spec.ts (Phase 2
    // OneRoster parser) ship next to their source.
    include: ['__tests__/**/*.test.ts', 'src/**/*.spec.ts'],
  },
})
