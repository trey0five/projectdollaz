import { defineConfig } from 'vitest/config'

// Unit tests for framework-free pure modules (e.g. the Scope × Lens transform).
// Scoped to *.spec.ts so it never tries to boot the Nest app or touch Prisma.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
})
