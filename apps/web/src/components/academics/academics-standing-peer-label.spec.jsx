// ─────────────────────────────────────────────────────────────────────────────
// Standing names its reference line as Over time and Network do.
//
// Review-caught on the demo film (v4, a1 vs a3): the org console's "network
// average 60.9" (every school) and Standing's dashed line "Network 60" (every
// OTHER school — kpis.average.peer excludes the selected one) were two figures
// under one name. Pinned: Standing's line and key say "Peer average (excl. …)"
// when the selected school is scored, and "Network average" when it is not.
// ─────────────────────────────────────────────────────────────────────────────
import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AssessmentDashboard from './AssessmentDashboard.jsx'

afterEach(cleanup)

const AURELIA = 'aurelia'
const schools = [
  { schoolId: 'odile', schoolName: 'St. Odile School', value: 67.1 },
  { schoolId: AURELIA, schoolName: 'St. Aurelia Academy', value: 61.4 },
  { schoolId: 'brendan', schoolName: 'St. Brendan School', value: 49.9 },
]
const data = (over = {}) => ({
  empty: false,
  school: { id: AURELIA, name: 'St. Aurelia Academy' },
  context: { testType: 'terranova', year: 2026, scoreType: 'percentile', peerCount: 2, subjects: [], grade: 'all', nationalReference: 50 },
  kpis: { average: { value: 61.4, peer: 60.02 }, rank: { rank: 2, of: 3 } },
  schools,
  ...over,
})
const renderStanding = (d) =>
  render(
    <MemoryRouter initialEntries={['/academics']}>
      <Routes>
        <Route path="/academics" element={<AssessmentDashboard data={d} />} />
      </Routes>
    </MemoryRouter>,
  )

describe('Standing — the dashed line is the peer average, named', () => {
  it('says "Peer average (excl. …)" in the chart and the key, never "Network 60"', () => {
    const { container } = renderStanding(data())
    expect(container.textContent).toContain('Peer average (excl. St. Aurelia) 60')
    expect(container.textContent).not.toMatch(/Network 60/)
  })

  it('calls it the network average when the selected school has no score', () => {
    const { container } = renderStanding(
      data({
        schools: schools.map((s) => (s.schoolId === AURELIA ? { ...s, value: null } : s)),
        kpis: { average: { value: null, peer: 58.5 }, rank: null },
      }),
    )
    expect(container.textContent).not.toMatch(/excl\./)
    expect(container.textContent).toContain('Network average')
  })
})

describe('Standing — the network strip prints at the scores’ precision', () => {
  it('whole percentiles, and a spread that is the difference of the two printed', () => {
    const { container } = renderStanding(
      data({
        insights: {
          top: { value: 67.1, schoolName: 'St. Odile School' },
          bottom: { value: 49.9, schoolName: 'St. Brendan School' },
          spread: 17.2,
        },
      }),
    )
    const t = container.textContent
    expect(t).not.toMatch(/67\.1|49\.9|17\.2/)
    expect(t).toMatch(/Highest\s*67/)
    expect(t).toMatch(/Lowest\s*50/)
    expect(t).toMatch(/Spread\s*17/)
  })
})
