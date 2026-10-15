import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// ─────────────────────────────────────────────────────────────────────────────
// Strategic Planning on the Aurora band (2026-10-15). The populated page is the
// one no seed login reaches, so it is pinned here on behaviour:
//   • the band's sentence is built from the plan's real figures, worst first
//   • a plan with NO goals judges nothing (no pills, a next-step sentence)
//   • the plan's arc sits in an Aurora section, not a bare Section
// ─────────────────────────────────────────────────────────────────────────────
afterEach(cleanup)

const school = { id: 's1', name: 'Test School', role: 'owner' }
vi.mock('../../context/SchoolContext.jsx', () => ({
  useSchools: () => ({ activeSchool: school }),
  useOptionalSchools: () => ({ activeSchool: school }),
}))
vi.mock('../../context/UiFlagContext.jsx', () => ({ useUiV2: () => false }))
vi.mock('../BillingBanner.jsx', () => ({ default: () => null }))

let state = null
vi.mock('../../hooks/useStrategy.js', () => ({ useStrategy: () => state }))

const { default: StrategyPage } = await import('../../pages/StrategyPage.jsx')

function strat({ goalCounts, overallPaceStatus = 'on_track', summary = {} }) {
  return {
    plan: {
      id: 'p1',
      name: 'Vision 2030',
      status: 'adopted',
      fyStartYear: 2026,
      fyEndYear: 2030,
      overallProgressPct: 0.42,
      overallPaceStatus,
      goalCounts,
    },
    pillars: [{ id: 'pl1', name: 'Finances', paceStatus: 'on_track', progressPct: 0.42, goalCounts }],
    goals: [],
    initiatives: [],
    members: [],
    summary: { behindPaceGoals: [], staleInitiatives: [], ...summary },
    hasPlan: true,
    loading: false,
    error: null,
    notLicensed: false,
    notEntitled: false,
  }
}

const page = () =>
  render(
    <MemoryRouter>
      <StrategyPage />
    </MemoryRouter>,
  )

describe('Strategic Planning — the Aurora band', () => {
  it('says how far the plan is and names the worst thing first', () => {
    state = strat({
      goalCounts: { total: 5, onTrack: 2, achieved: 0, behind: 2, atRisk: 1 },
      overallPaceStatus: 'behind',
      summary: { behindPaceGoalCount: 2, atRiskGoalCount: 1 },
    })
    const { container } = page()
    const verdict = container.querySelector('.au-hero').textContent
    expect(verdict).toContain('The plan is 42% of the way across 5 goals.')
    expect(verdict).toContain('2 goals are behind pace.')
    expect(container.querySelectorAll('.au-kpis .au-kpi')).toHaveLength(4)
    // The arc lives in an Aurora section strip.
    const titles = [...container.querySelectorAll('.au-ribbon-title')].map((n) => n.textContent)
    expect(titles).toContain('The plan')
  })

  it('a plan with no goals judges nothing: no pills, a next-step sentence', () => {
    state = strat({ goalCounts: { total: 0, onTrack: 0, achieved: 0, behind: 0, atRisk: 0 } })
    const { container } = page()
    expect(container.querySelector('.au-hero').textContent).toContain(
      'Link a goal to a number you already track',
    )
    expect(container.querySelectorAll('.au-kpis .au-pill:not(.au-pill-ghost)')).toHaveLength(0)
  })

  it('all goals on pace reads as healthy', () => {
    state = strat({ goalCounts: { total: 3, onTrack: 3, achieved: 0, behind: 0, atRisk: 0 } })
    const { container } = page()
    expect(container.querySelector('.au-hero').textContent).toContain('Every goal is on pace.')
  })

  it('goals with no data yet are never judged: no pills, no "on pace"', () => {
    state = strat({
      goalCounts: { total: 3, onTrack: 0, achieved: 0, behind: 0, atRisk: 0, noData: 3 },
      overallPaceStatus: 'on_track',
    })
    const { container } = page()
    const hero = container.querySelector('.au-hero').textContent
    expect(hero).toContain('None of the 3 goals has data yet.')
    expect(hero).not.toMatch(/on pace/i)
    expect(container.querySelectorAll('.au-kpis .au-pill:not(.au-pill-ghost)')).toHaveLength(0)
  })

  it('the at-risk pace tier reads "slipping", never "at risk" (red is the risk tier)', () => {
    state = strat({
      goalCounts: { total: 4, onTrack: 3, achieved: 0, behind: 0, atRisk: 1 },
      overallPaceStatus: 'at_risk',
      summary: { behindPaceGoalCount: 0, atRiskGoalCount: 1 },
    })
    const { container } = page()
    expect(container.querySelector('.au-hero').textContent).toContain('1 goal is slipping.')
    expect(container.querySelector('.au-kpis').textContent).toContain('slipping overall')
    expect(container.querySelector('.au-kpis').textContent).not.toMatch(/at risk overall/)
  })
})
