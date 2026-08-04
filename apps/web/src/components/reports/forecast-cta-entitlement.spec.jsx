import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// ─────────────────────────────────────────────────────────────────────────────
// A CTA MUST NEVER LAND ON A WALL.
//
// ForecastView's empty state used to render an unconditional
// "Enter the forecast in Planning →" pill pointing at /planning. But /planning
// is client-side gated on the 'planning' module and a NEW SCHOOL IS LICENSED TO
// 'finance' ONLY (POST /schools → licensedModules: [{ key: 'finance' }]) — so on
// the default plan the single anchor on that panel led straight to
// "Planning & Forecasting isn't on your plan yet", with no forecast input
// anywhere else in the product (wizardConfigs.finance offers tb / monthly /
// budget and no forecast). Verified end-to-end in the browser during review.
//
// The rule this pins: the destination is GATED ON ENTITLEMENT, not assumed.
// Licensed → the real input surface. Not licensed → name the add-on and link
// the place that sells it, never a pill whose only outcome is a paywall.
//
// Render-style (accreditation-honesty.spec.jsx house pattern) so it asserts what
// the user can actually click, and it exercises BOTH billing states.
//
// Proven RED against the pre-fix component: with hasModule('planning') false it
// still rendered href="/planning" and the label "Enter the forecast in
// Planning →" (both "unlicensed" assertions failed).
// ─────────────────────────────────────────────────────────────────────────────

// `globals: false` — register testing-library cleanup explicitly (house pattern).
afterEach(cleanup)

// No forecast saved → the empty state, which is the panel that carries the CTA.
vi.mock('../../hooks/useAnalytics.js', () => ({
  useForecast: () => ({ forecast: null, hasBudget: false, loading: false }),
}))

const hasModuleMock = vi.fn()
vi.mock('../../context/BillingContext.jsx', () => ({
  useBilling: () => ({ hasModule: hasModuleMock }),
}))

const { default: ForecastView } = await import('./ForecastView.jsx')

function renderWith({ planning }) {
  hasModuleMock.mockImplementation((key) => (key === 'planning' ? planning : true))
  return render(
    <MemoryRouter>
      <ForecastView schoolId="s1" periodId="p1" />
    </MemoryRouter>,
  )
}

const hrefs = (container) => [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))

describe('ForecastView CTA never sends an unlicensed school to the Planning paywall', () => {
  it('LICENSED: links the real input surface at /planning', () => {
    const { container } = renderWith({ planning: true })
    expect(hrefs(container)).toContain('/planning')
    expect(screen.getByText(/Enter the forecast in Planning/i)).toBeTruthy()
  })

  it('UNLICENSED: does NOT link /planning — that destination is a module gate', () => {
    const { container } = renderWith({ planning: false })
    expect(
      hrefs(container),
      'the empty-state CTA still points at /planning for a finance-only school — it lands on "Planning & Forecasting isn\'t on your plan yet" and the user can never enter a forecast',
    ).not.toContain('/planning')
  })

  it('UNLICENSED: says it is an add-on and links where it can be added', () => {
    const { container } = renderWith({ planning: false })
    expect(hrefs(container)).toContain('/settings/billing#modules')
    // Honest framing: the panel must not instruct an action the plan forbids.
    expect(screen.queryByText(/Enter the forecast in Planning/i)).toBeNull()
    expect(screen.getByText(/add-on/i)).toBeTruthy()
  })

  it('every anchor on the panel is reachable — no CTA is a dead end in either state', () => {
    for (const planning of [true, false]) {
      cleanup()
      const { container } = renderWith({ planning })
      const links = hrefs(container)
      expect(links.length).toBeGreaterThan(0)
      // The gated route may only appear when it is actually licensed.
      if (!planning) expect(links).not.toContain('/planning')
    }
  })
})
