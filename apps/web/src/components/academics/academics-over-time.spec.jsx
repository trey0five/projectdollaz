// ─────────────────────────────────────────────────────────────────────────────
// The Over time view — the Network view's treatment, carried over.
//
// Live-caught (demo v4, a5): on ACT the trend dots, the quadrant labels, the
// "ranked by movement" list and the highlight cards all rounded to whole
// points, so 25.6 → 25.2 read as a red "0", and the quadrant's dashed line was
// "Network 24" beside a "24.1" in the key — while the number it carries
// EXCLUDES the selected school. Pinned: deltas and labels at scoreDp precision,
// no colour on a change that prints as 0, and the line named exactly as the
// Network view names it.
// ─────────────────────────────────────────────────────────────────────────────
import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AssessmentDashboard, {
  GrowthQuadrant,
  MovementHighlights,
  MovementRanking,
  TrendChart,
} from './AssessmentDashboard.jsx'

const CEDAR = 'cedar'
const movements = [
  { schoolId: 'bright', schoolName: 'Brightwater School', prior: 21.6, current: 22.4, change: 22.4 - 21.6, direction: 'improved', tested: 99 },
  { schoolId: CEDAR, schoolName: 'Cedar Ridge Preparatory', prior: 24.1, current: 24.8, change: 24.8 - 24.1, direction: 'improved', tested: 173 },
  { schoolId: 'level', schoolName: 'Level School', prior: 23.02, current: 23, change: -0.02, direction: 'declined', tested: 50 },
  { schoolId: 'mangrove', schoolName: 'Mangrove Point Catholic High School', prior: 25.6, current: 25.2, change: 25.2 - 25.6, direction: 'stable', tested: 140 },
]
const texts = (c) => [...c.querySelectorAll('text')].map((t) => t.textContent)

describe('Over time — changes at the precision of the scores', () => {
  afterEach(cleanup)

  it('ranks movement to a tenth for scale scores, with no colour on a move that prints as 0', () => {
    const { container } = render(<MovementRanking movements={movements} dp={1} reduce />)
    const body = container.textContent
    expect(body).toContain('24.1 → 24.8')
    expect(body).toContain('+0.7')
    expect(body).toContain('25.6 → 25.2')
    expect(body).toContain('-0.4')
    const zero = [...container.querySelectorAll('span')].find((s) => s.textContent === '0')
    expect(zero).toBeTruthy()
    // 'declined' underneath, but it prints as 0 — slate, not rose.
    expect(zero.style.color).toBe('rgb(148, 163, 184)')
  })

  it('headlines the real moves at the same precision and never a "+0"', () => {
    render(<MovementHighlights movements={movements} national={null} dp={1} />)
    expect(screen.getByText('+0.8')).toBeTruthy()
    expect(screen.getByText('21.6 → 22.4')).toBeTruthy()
    expect(screen.getByText('-0.4')).toBeTruthy()
    cleanup()
    const tiny = [
      { schoolId: 'a', schoolName: 'A', prior: 23, current: 23.02, change: 0.02 },
      { schoolId: 'b', schoolName: 'B', prior: 23, current: 22.97, change: -0.03 },
    ]
    const { container } = render(<MovementHighlights movements={tiny} national={null} dp={1} />)
    expect(container.textContent).not.toMatch(/Most improved|Steepest decline/)
  })

  it('labels the quadrant to a tenth, slate where a move prints as 0', () => {
    const { container } = render(
      <GrowthQuadrant
        movements={movements.map((m) => ({ ...m, isFocus: m.schoolId === CEDAR }))}
        peerAvg={24.06}
        peerName="Peer average (excl. Cedar Ridge Preparatory)"
        dp={1}
        reduce
      />,
    )
    const t = texts(container)
    expect(t.some((s) => s.startsWith('+0.7'))).toBe(true)
    expect(t.some((s) => s.startsWith('-0.4'))).toBe(true)
    expect(t.some((s) => /^\+1( |$)/.test(s))).toBe(false)
    const zero = [...container.querySelectorAll('text')].find((n) => /^0 ·/.test(n.textContent))
    expect(zero.getAttribute('fill')).toBe('#64748b')
  })

  it('prints the trend dots to a tenth for scale scores, whole for percentiles', () => {
    const points = [
      { schoolYear: 2025, school: 24.1, peer: 23.8 },
      { schoolYear: 2026, school: 24.8, peer: 24.06 },
    ]
    const scale = render(<TrendChart points={points} national={null} dp={1} reduce />)
    expect(texts(scale.container)).toEqual(expect.arrayContaining(['24.1', '24.8']))
    cleanup()
    const pct = render(<TrendChart points={[{ schoolYear: 2025, school: 59.01, peer: 60 }, { schoolYear: 2026, school: 63.01, peer: 60 }]} national={50} dp={0} reduce />)
    expect(texts(pct.container)).toEqual(expect.arrayContaining(['59', '63', 'Nat 50']))
  })
})

describe('Over time — the dashed line is named as the Network view names it', () => {
  afterEach(cleanup)

  it('the quadrant line is the peer average excluding the selected school, at the key precision', () => {
    const { container } = render(
      <GrowthQuadrant movements={movements} peerAvg={24.06} peerName="Peer average (excl. Cedar Ridge Preparatory)" dp={1} reduce />,
    )
    const t = texts(container)
    expect(t).toContain('Peer average (excl. Cedar Ridge Preparatory) 24.1')
    expect(t.some((s) => /^Network \d/.test(s))).toBe(false)
  })

  const dashboard = (over = {}) => ({
    empty: false,
    school: { id: CEDAR, name: 'Cedar Ridge Preparatory' },
    context: { testType: 'act', year: 2026, scoreType: 'scale', peerCount: 3, subjects: [] },
    kpis: { average: { value: 24.8, peer: 24.06 }, rank: { rank: 2, of: 4 } },
    trend: [
      { schoolYear: 2025, school: 24.1, peer: 23.8 },
      { schoolYear: 2026, school: 24.8, peer: 24.06 },
    ],
    movements,
    table: movements,
    ...over,
  })
  const renderTime = (data) =>
    render(
      <MemoryRouter initialEntries={['/academics?view=time']}>
        <Routes>
          <Route path="/academics" element={<AssessmentDashboard data={data} />} />
        </Routes>
      </MemoryRouter>,
    )

  it('wires the view: key, line and legend all say "Peer average (excl. …)" when the school is scored', () => {
    const { container } = renderTime(dashboard())
    expect(screen.getAllByText('Peer average (excl. Cedar Ridge Preparatory) 24.1').length).toBeGreaterThan(0)
    expect(texts(container)).toContain('Peer average (excl. Cedar Ridge Preparatory) 24.1')
    expect(screen.getByText('Peer average (excl. Cedar Ridge Preparatory)')).toBeTruthy()
    expect(container.textContent).not.toMatch(/Network 24/)
    expect(container.textContent).toContain('+0.7')
  })

  it('calls it the network average when the selected school has no score to exclude', () => {
    const others = movements.filter((m) => m.schoolId !== CEDAR)
    const { container } = renderTime(
      dashboard({
        trend: [
          { schoolYear: 2025, school: null, peer: 23.5 },
          { schoolYear: 2026, school: null, peer: 23.5 },
        ],
        movements: others,
        table: others,
        kpis: { average: { value: null, peer: 23.53 }, rank: null },
      }),
    )
    expect(container.textContent).not.toMatch(/excl\./)
    expect(texts(container)).toContain('Network average 23.5')
  })
})
