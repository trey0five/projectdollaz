import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { healthStatus, bandsFor } from '@finrep/analytics'

// ─────────────────────────────────────────────────────────────────────────────
// The Overview's "Look deeper" Grades tile wears the SAME verdict the band's
// "Gap to plan" card wears for the same gap. Verifier 2026-10-15 (All Souls):
// the band said "At risk" for −11 / −7.1% while this tile said a grey
// "Behind plan". Both now come from healthStatus over the canonical
// enrollment_vs_plan bands.
// ─────────────────────────────────────────────────────────────────────────────
const hookMock = vi.hoisted(() => ({ useEnrollmentAnalytics: vi.fn() }))
vi.mock('../../hooks/useEnrollmentAnalytics.js', () => ({
  useEnrollmentAnalytics: (...a) => hookMock.useEnrollmentAnalytics(...a),
}))
globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
afterEach(cleanup)

const fixture = (gap, gapPct) => ({
  data: {
    trend: { points: [{ total: 140 }, { total: 144 }], planTotal: 155 },
    vsPlan: { totals: { actual: 155 + gap, plan: 155, gap, gapPct, agreesWithTile: true } },
    gradeByYear: { grades: [], years: [] },
    cohortSize: { cohorts: [] },
  },
  loading: false,
  error: null,
  notLicensed: false,
  notEntitled: false,
})

async function gradesPill(gap, gapPct) {
  hookMock.useEnrollmentAnalytics.mockReturnValue(fixture(gap, gapPct))
  const { default: Preview } = await import('./EnrollmentAnalyticsPreview.jsx')
  const { container } = render(
    <MemoryRouter>
      <Preview schoolId="s1" periodId="p1" />
    </MemoryRouter>,
  )
  const tile = [...container.querySelectorAll('.au-tile')].find((t) => /Grades/.test(t.textContent))
  return tile.querySelector('.au-pill')
}

describe('Look deeper › Grades — the band’s verdict, not a second word', () => {
  it('−11 / −7.1% is "At risk", exactly as the band judges it', async () => {
    expect(healthStatus(-0.071, bandsFor('enrollment_vs_plan'), true)).toBe('risk')
    const pill = await gradesPill(-11, -0.071)
    expect(pill.textContent).toMatch(/At risk/)
    expect(pill.textContent).not.toMatch(/Behind plan/)
  })

  it('a small shortfall inside the watch band is "Watch"', async () => {
    const expected = healthStatus(-0.03, bandsFor('enrollment_vs_plan'), true)
    expect(expected).toBe('watch')
    const pill = await gradesPill(-5, -0.03)
    expect(pill.textContent).toMatch(/Watch/)
  })

  it('no share on the totals → no pill (never a guessed verdict)', async () => {
    const pill = await gradesPill(-11, null)
    expect(pill).toBeNull()
  })
})
