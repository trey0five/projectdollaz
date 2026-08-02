import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// ─────────────────────────────────────────────────────────────────────────────
// apps/web had NO test runner, so every UI honesty invariant this program relies
// on was enforced by code review alone. The two the Phase E reviewer called out as
// highest-risk — an ordinal likelihood quietly becoming a percentage, and the
// Improvement tab growing a plausible-looking control that does nothing — are
// exactly the kind of change that looks correct in a diff.
//
// DELIBERATELY SEPARATE from vite.config.ts: that file is on the frozen list (it
// carries a local dev-proxy edit) and three fix passes have reverted it. A second
// config file cannot collide with it.
// ─────────────────────────────────────────────────────────────────────────────
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.spec.{js,jsx}'],
    restoreMocks: true,
  },
})
