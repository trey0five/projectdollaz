import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'

// ─────────────────────────────────────────────────────────────────────────────
// Review round 4: the students/aggregate route can now WITHHOLD a filtered read
// whole (`withheld: 'all'` — the filters narrow to a group a wider view hides)
// or just its breakdowns (`'breakdown'` — several statuses chosen), and every
// breakdown counts ONE status group (`breakdown.status`). The roster analytics
// block must say so in words, never draw empty charts that read as "nobody",
// and never print a number the server did not send.
// ─────────────────────────────────────────────────────────────────────────────
globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const aggregate = vi.fn()
vi.mock('../../lib/api.js', () => ({
  enrollmentApi: { students: { aggregate: (...a) => aggregate(...a) } },
  apiErrorMessage: (_e, fallback) => fallback,
}))

const { default: RosterAnalyticsSection } = await import('./RosterAnalyticsSection.jsx')

afterEach(() => {
  cleanup()
  aggregate.mockReset()
})

const W = { suppressed: true, reason: 'complementary' }
const base = {
  source: 'roster',
  total: 233,
  minCell: 5,
  kpis: { enrolled: 204, waitlist: 6, flagged: W, newThisYear: 23 },
  facets: { grade: ['K'], status: ['enrolled'], gender: ['female', 'male'], race: ['white'], ethnicity: [], ageBand: ['5to10'] },
}

describe('RosterAnalyticsSection — withheld reads', () => {
  it('a read withheld WHOLE says why, prints "withheld" for the filtered total, and draws no chart', async () => {
    aggregate.mockResolvedValue({
      ...base,
      filteredTotal: W,
      withheld: 'all',
      breakdown: { status: null },
      counts: { grade: {}, status: { enrolled: W, waitlist: W, withdrawn: W, graduated: W }, gender: {}, race: {}, ethnicity: {}, ageBand: {}, flags: { iep: W, plan504: W, ell: W, any: W } },
    })
    const { container } = render(<RosterAnalyticsSection schoolId="s1" />)
    expect(await screen.findByText(/too small to show without identifying students/)).toBeTruthy()
    expect(container.textContent).toMatch(/withheld of 233 students/)
    expect(container.textContent).not.toMatch(/No students match/)
    expect(container.querySelector('[aria-label="Race"]')).toBeNull()
  })

  it('a COMBINATION of filters, or a name search, says why in its own words (the server’s withheldReason)', async () => {
    const whole = {
      ...base,
      filteredTotal: W,
      withheld: 'all',
      breakdown: { status: null },
      counts: { grade: {}, status: { enrolled: W, waitlist: W, withdrawn: W, graduated: W }, gender: {}, race: {}, ethnicity: {}, ageBand: {}, flags: { iep: W, plan504: W, ell: W, any: W } },
    }
    aggregate.mockResolvedValue({ ...whole, withheldReason: 'combination' })
    const first = render(<RosterAnalyticsSection schoolId="s1" />)
    expect(await screen.findByText(/one filter at a time/)).toBeTruthy()
    expect(first.container.textContent).not.toMatch(/too small to show/)
    cleanup()
    aggregate.mockReset()
    aggregate.mockResolvedValue({ ...whole, withheldReason: 'nameSearch' })
    const second = render(<RosterAnalyticsSection schoolId="s1" />)
    expect(await screen.findByText(/never follow a name search/)).toBeTruthy()
    expect(second.container.querySelector('[aria-label="Race"]')).toBeNull()
  })

  it('withheld zero categories draw as "withheld", visible zeros draw nothing', async () => {
    aggregate.mockResolvedValue({
      ...base,
      filteredTotal: 6,
      withheld: null,
      withheldReason: null,
      breakdown: { status: 'enrolled' },
      counts: {
        grade: { K: 6 },
        status: { enrolled: 6, waitlist: 0, withdrawn: 0, graduated: 0 },
        gender: { female: 3, male: 3 },
        race: { white: 6, black: 0 },
        ethnicity: { hispanic: W, nonHispanic: W },
        ageBand: { under5: 0, '5to10': 6, '11to13': 0, '14to18': 0, '19plus': 0, unknown: 0 },
        flags: { iep: W, plan504: W, ell: W, any: W },
      },
    })
    const { container } = render(<RosterAnalyticsSection schoolId="s1" />)
    await screen.findByText(/The breakdowns below count enrolled students/)
    const eth = container.querySelector('[aria-label="Ethnicity"]')
    expect(eth?.textContent ?? '').toMatch(/withheld/)
    // The listed zero (black: 0) never draws a column or a share.
    expect(container.querySelector('[aria-label="Race"]')?.textContent ?? '').not.toMatch(/Black/)
  })

  it('a multi-status read with withheld breakdowns says breakdowns count one status at a time', async () => {
    aggregate.mockResolvedValue({
      ...base,
      filteredTotal: 29,
      withheld: 'breakdown',
      breakdown: { status: null },
      counts: { grade: {}, status: { enrolled: 0, waitlist: 6, withdrawn: 5, graduated: 18 }, gender: {}, race: {}, ethnicity: {}, ageBand: {}, flags: { iep: W, plan504: W, ell: W, any: W } },
    })
    render(<RosterAnalyticsSection schoolId="s1" />)
    expect(await screen.findByText(/one status group at a time/)).toBeTruthy()
  })

  it('an ordinary read names the group its breakdowns count', async () => {
    aggregate.mockResolvedValue({
      ...base,
      filteredTotal: 233,
      withheld: null,
      breakdown: { status: 'enrolled' },
      counts: {
        grade: { K: 23 },
        status: { enrolled: 204, waitlist: 6, withdrawn: 5, graduated: 18 },
        gender: { female: 101, male: 103 },
        race: { white: 108, mena: { suppressed: true }, asian: W },
        ethnicity: {},
        ageBand: { under5: 0, '5to10': 204, '11to13': 0, '14to18': 0, '19plus': 0, unknown: 0 },
        flags: { iep: 14, plan504: { suppressed: true }, ell: 9, any: W },
      },
    })
    const { container } = render(<RosterAnalyticsSection schoolId="s1" />)
    expect(await screen.findByText(/The breakdowns below count enrolled students/)).toBeTruthy()
    expect(container.textContent).toMatch(/233 of 233 students/)
  })

  it('★ round 6: a grade read whose all-status total is withheld shows its PUBLISHED enrolled count, not "withheld of 233"', async () => {
    aggregate.mockResolvedValue({
      ...base,
      filteredTotal: W,
      withheld: null,
      withheldReason: null,
      breakdown: { status: 'enrolled' },
      counts: {
        grade: { K: 20 },
        status: { enrolled: 20, waitlist: W, withdrawn: W, graduated: W },
        gender: { female: 10, male: 10 },
        race: { white: 20 },
        ethnicity: {},
        ageBand: { under5: W, '5to10': W, '11to13': W, '14to18': W, '19plus': W, unknown: W },
        flags: { iep: W, plan504: W, ell: W, any: W },
      },
    })
    const { container } = render(<RosterAnalyticsSection schoolId="s1" />)
    await screen.findByText(/The breakdowns below count enrolled students/)
    expect(container.textContent).toMatch(/20 enrolled/)
    expect(container.textContent).not.toMatch(/withheld of 233/)
    // The copy says how filtered views label hidden figures.
    expect(container.textContent).toMatch(/With a filter on, every hidden figure shows as withheld/)
    // A withheld flag says nothing about its size, so it is not lit as present.
    const stats = [...container.querySelectorAll('.stat')]
    expect(stats.length).toBe(4)
    for (const st of stats) expect(st.querySelector('.stat-mark')).toBeNull()
  })
})
