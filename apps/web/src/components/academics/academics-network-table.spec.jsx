// ─────────────────────────────────────────────────────────────────────────────
// The Network view (board packet) — deltas at the scores' precision, and a peer
// line that is named for what it is.
//
// Pinned against the numbers the a7 take actually shows (ACT, scale scores to a
// tenth): Mangrove 25.6 → 25.2 is −0.4, NOT a red down-arrow beside "0"; Cedar
// Ridge's +0.7 reads +0.7 in the table, the chart and the band above it; the
// smallest subject lead of +0.58 reads +0.6, not +1. And the dashed line —
// kpis.average.peer, which EXCLUDES the selected school — is labelled as the
// peer average excluding that school, while each row's comparison column says
// it is against that row's own peers.
// ─────────────────────────────────────────────────────────────────────────────
import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen, within, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { BoardReportBars, ChangeBadge, ComparisonTable } from './AssessmentDashboard.jsx'
import { MeasureKey } from './MeasureNote.jsx'
import { AcademicsBand } from './AcademicsOverview.jsx'

const CEDAR = 'cedar'
const rows = [
  { schoolId: 'mangrove', schoolName: 'Mangrove Point Catholic High School', current: 25.2, prior: 25.6, change: 25.2 - 25.6, vsNetwork: 1.3, vsNational: null, tested: 140, rank: 1 },
  { schoolId: CEDAR, schoolName: 'Cedar Ridge Preparatory', current: 24.8, prior: 24.1, change: 24.8 - 24.1, vsNetwork: 0.7, vsNational: null, tested: 173, rank: 2 },
  { schoolId: 'bright', schoolName: 'Brightwater School', current: 22.4, prior: 21.6, change: 22.4 - 21.6, vsNetwork: -2.5, vsNational: null, tested: 99, rank: 3 },
]

const rowFor = (name) => screen.getByText(name).closest('tr')

describe('Network view — deltas at the precision of the scores', () => {
  afterEach(cleanup)

  it('prints each Change at one decimal for scale scores and sorts by movement', () => {
    render(<ComparisonTable rows={rows} scoreType="scale" focusId={CEDAR} focusName="Cedar Ridge Preparatory" />)
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    const body = screen.getAllByRole('row').slice(1)
    expect(body.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual([
      '3Brightwater School',
      '2Cedar Ridge Preparatory',
      '1Mangrove Point Catholic High School',
    ])
    const cells = (name) => within(rowFor(name)).getAllByRole('cell').map((c) => c.textContent)
    // [school, this year, last year, CHANGE, vs its peers, vs national, tested]
    expect(cells('Cedar Ridge Preparatory')[3]).toBe('+0.7')
    expect(cells('Brightwater School')[3]).toBe('+0.8')
    // The falling school says by how much — never "0" beside a down-arrow.
    const mangrove = rowFor('Mangrove Point Catholic High School')
    expect(within(mangrove).getByText('-0.4')).toBeTruthy()
    expect(within(mangrove).queryByText('0')).toBeNull()
  })

  it('never draws an arrow beside a change that prints as 0', () => {
    const { container } = render(<ChangeBadge value={0.04} dp={1} />)
    expect(container.textContent).toBe('0')
    expect(container.querySelector('svg')).toBeNull()
    cleanup()
    // A percentile is whole: −0.4 prints 0, so no arrow there either.
    const pct = render(<ChangeBadge value={-0.4} dp={0} />)
    expect(pct.container.textContent).toBe('0')
    expect(pct.container.querySelector('svg')).toBeNull()
    cleanup()
    const real = render(<ChangeBadge value={-0.4} dp={1} />)
    expect(real.container.textContent).toBe('-0.4')
    expect(real.container.querySelector('svg')).not.toBeNull()
  })

  it('labels the chart per school at the same precision, grey when a move prints as 0', () => {
    const flat = [...rows, { schoolId: 'level', schoolName: 'Level School', current: 23, prior: 23.02, change: -0.02, tested: 50 }]
    const { container } = render(
      <BoardReportBars rows={flat} peerAvg={24.06} focusId={CEDAR} focusName="Cedar Ridge Preparatory" scoreType="scale" reduce />,
    )
    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toEqual(expect.arrayContaining(['-0.4', '+0.7', '+0.8', '0']))
    expect(texts).not.toContain('+1')
    const zero = [...container.querySelectorAll('text')].find((t) => t.textContent === '0')
    expect(zero.getAttribute('fill')).toBe('#64748b')
  })
})

describe('Network view — the peer line and the row comparison reconcile', () => {
  afterEach(cleanup)

  it('names the dashed line as the peer average excluding the selected school', () => {
    const { container } = render(
      <BoardReportBars rows={rows} peerAvg={24.06} focusId={CEDAR} focusName="Cedar Ridge Preparatory" scoreType="scale" reduce />,
    )
    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('Peer average (excl. Cedar Ridge Preparatory) 24.1')
    expect(texts.some((t) => /^Network\b/.test(t))).toBe(false)
  })

  it('keys the line with the same words and number', () => {
    render(
      <MeasureKey
        ctx={{ scoreType: 'scale', peerCount: 2 }}
        peerAvg={24.06}
        refs={['network']}
        peerName="Peer average (excl. Cedar Ridge Preparatory)"
      />,
    )
    expect(screen.getByText('Peer average (excl. Cedar Ridge Preparatory) 24.1')).toBeTruthy()
  })

  it('says each row is against its OWN peers, and which row the line is', () => {
    render(<ComparisonTable rows={rows} scoreType="scale" focusId={CEDAR} focusName="Cedar Ridge Preparatory" />)
    expect(screen.getByRole('columnheader', { name: /vs its peers/i })).toBeTruthy()
    expect(screen.queryByRole('columnheader', { name: /vs network/i })).toBeNull()
    expect(screen.getByText(/Only Cedar Ridge Preparatory's row is measured against the dashed peer-average line/)).toBeTruthy()
    // The selected school's row IS score − line: 24.8 − 24.1.
    expect(within(rowFor('Cedar Ridge Preparatory')).getAllByRole('cell')[4].textContent).toBe('+0.7')
  })
})

describe('Academics band — the same deltas the table prints', () => {
  afterEach(cleanup)

  it('prints the smallest lead and the trend to a tenth', () => {
    const dashboard = {
      empty: false,
      context: { testType: 'act', year: 2026, scoreType: 'scale', peerCount: 2 },
      kpis: {
        average: { value: 24.8, peer: 24.06, variance: 0.74, standing: 'strong', label: 'Average score' },
        rank: { rank: 2, of: 3 },
        yoy: 0.7,
        participation: { rate: 0.95, comparable: false },
      },
      subjects: [
        { subject: 'reading', variance: 0.58, standing: 'average' },
        { subject: 'math', variance: 1.9, standing: 'strong' },
      ],
      trendDirection: 'improving',
    }
    render(
      <MemoryRouter>
        <AcademicsBand schoolName="Cedar Ridge Preparatory" dashboard={dashboard} status={{}} loading={false} tab="analytics" />
      </MemoryRouter>,
    )
    expect(screen.getByText('+0.6')).toBeTruthy()
    expect(screen.queryByText('+1')).toBeNull()
    expect(screen.getByText('+0.7 on last year')).toBeTruthy()
    // The band's peer figure is named as the same excluded-self average the
    // Network view's dashed line is.
    expect(screen.getByText('Peer avg 24.1 · +0.7')).toBeTruthy()
    expect(screen.queryByText(/^Network 24/)).toBeNull()
  })
})

describe('Network view — a selection the selected school has no score in', () => {
  afterEach(cleanup)
  const others = rows.filter((r) => r.schoolId !== CEDAR)

  it('calls the line the network average, since nothing was excluded from it', () => {
    const { container } = render(
      <BoardReportBars rows={others} peerAvg={23.9} focusId={CEDAR} focusName="Cedar Ridge Preparatory" scoreType="scale" reduce />,
    )
    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('Network average 23.9')
    expect(texts.some((t) => /excl\./.test(t))).toBe(false)
  })

  it('does not point the reader at a row that is not in the table', () => {
    render(<ComparisonTable rows={others} scoreType="scale" focusId={CEDAR} focusName="Cedar Ridge Preparatory" />)
    expect(screen.queryByText(/Only Cedar Ridge Preparatory's row/)).toBeNull()
    expect(screen.getByText(/none is exactly the dashed network-average line/)).toBeTruthy()
  })
})
