// ─────────────────────────────────────────────────────────────────────────────
// Cohort net change, as printed.
//
// Live-caught (demo v4, a6): TerraNova cohort averages print as whole
// percentiles, but the chip and the "Net change by cohort and subject" table
// printed the server's exact netChange — so a panel drawn "56 → 58 → 62" wore
// "+7" (55.6 → 62.4 is 6.8). Pinned: the printed change is the difference of
// the printed endpoints; the shade/direction still come from the server.
// ─────────────────────────────────────────────────────────────────────────────
import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { printedChange } from './cohortKit.js'
import CohortMatrix from './CohortMatrix.jsx'

afterEach(cleanup)

describe('printedChange', () => {
  it('subtracts the endpoints at the printed precision', () => {
    expect(printedChange(62.4 - 55.6, 55.6, 62.4, 0)).toBe(6)
    expect(printedChange(62.4 - 55.6, 55.6, 62.4, 1)).toBe(6.8)
    expect(printedChange(-0.4, 25.6, 25.2, 1)).toBe(-0.4)
  })
  it('falls back to the server figure when an endpoint is missing', () => {
    expect(printedChange(3.2, null, 60, 0)).toBe(3.2)
    expect(printedChange(null, 50, 60, 0)).toBe(null)
  })
})

describe('CohortMatrix', () => {
  it('prints a change that matches its own start → end', () => {
    const matrix = {
      cohorts: [{ key: 'k1', cohortId: 1, label: 'Grades 4 → 6', startGrade: '4', endGrade: '6', startYear: 2024, endYear: 2026 }],
      series: [{ key: 'total', label: 'Total Battery' }],
      cells: [
        {
          cohortKey: 'k1',
          series: 'total',
          netChange: 62.4 - 55.6,
          netChangeUnavailable: null,
          direction: 'gained',
          startValue: 55.6,
          endValue: 62.4,
          startState: 'observed',
          endState: 'observed',
          observedChange: null,
        },
      ],
    }
    const { container } = render(
      <CohortMatrix matrix={matrix} unit={{ decimals: 0, points: 'percentile points', label: 'percentile' }} gap={5} reduce />,
    )
    const text = container.textContent
    expect(text).toContain('+6')
    expect(text).not.toContain('+7')
  })
})
