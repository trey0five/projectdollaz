import { readFileSync } from 'node:fs'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import UnrankedPanel, { COMPONENT_LABELS } from './UnrankedPanel.jsx'
import DriversList from './DriversList.jsx'
import PortfolioTable, { PeerCell } from './PortfolioTable.jsx'
import BulkAdoptFlow from './BulkAdoptFlow.jsx'
import VelocityPanel from './VelocityPanel.jsx'
import InterventionPriorities from './InterventionPriorities.jsx'
import { NAV_GROUPS, navGroupVisible } from '../nav/sidebarNav.js'
import { URGENCY_REASON_LABELS, humanizeToken } from './AttentionBandChip.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// AIC PHASE I — THE PORTFOLIO UI HONESTY INVARIANTS (frozen spec §7.3, WEB-1…5).
//
// Everything the API guards can be undone in a JSX file. The API can refuse to
// rank an unmeasured school, and one `?? 'steady'` in a chip renders it ranked
// anyway; the API can null a percentile over three peers, and one `?? computed`
// puts it back. These five are the invariants that, if they break, make the
// portfolio lie in exactly the way the whole program exists to prevent — an
// unmeasured school looking healthy.
//
// EVERY ASSERTION BELOW WAS SEEN RED. Each block names the one-line mutation that
// reddens it; a guard nobody has watched fail is a guard nobody should trust.
//
// Deliberately scoped to components taking PLAIN PROPS. Mounting PortfolioPage
// would need the scope/school/billing context stack plus a fetch layer, and a
// spec that fragile gets deleted the first time it reddens for an unrelated
// reason (the standing note in the house pattern file).
// ─────────────────────────────────────────────────────────────────────────────

// `globals: false` means testing-library registers no automatic cleanup, so
// renders would otherwise accumulate across tests in one file.
afterEach(cleanup)

const wrap = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>)

// The words a not-ranked school must never be described with. "steady", "clear"
// and "fine" are the vocabulary of a system that has decided nothing is wrong;
// the whole point of `insufficientData[]` is that we have not decided anything.
const REASSURING = /\bsteady\b|\bclear\b|\bfine\b|\bon track\b|\bhealthy\b|\bgood\b/i

/**
 * TEXT WITH ITS ELEMENT BOUNDARIES PRESERVED — and the reason this helper exists
 * is a caught bug, not tidiness.
 *
 * `container.textContent` concatenates adjacent elements with NO separator, so a
 * "Steady" badge rendered next to a school name becomes the single token
 * "St. Agnes AcademySteady" — against which `/\bsteady\b/i` does not match. The
 * first run of this file's own RED PROOF passed with the bug present for exactly
 * that reason: the guard existed, ran, and could not see the word it was written
 * to catch. Joining the TEXT NODES with a space restores the boundaries, and the
 * mutation reddens as it must.
 */
function spacedText(el) {
  const parts = []
  const walk = (node) => {
    if (node.nodeType === 3) parts.push(node.textContent)
    else node.childNodes.forEach(walk)
  }
  walk(el)
  return parts.join(' ')
}

describe('WEB-1 — a school we cannot rank is NOT RANKED, with its gaps NAMED', () => {
  const insufficient = {
    schoolId: 'sch-1',
    name: 'St. Agnes Academy',
    confidence: 0.38,
    knownComponents: ['evidenceCurrency', 'domainExposure', 'improvement', 'trajectory'],
    missingComponents: [
      { component: 'readinessLevel', reason: 'no_snapshot' },
      { component: 'earlyWarning', reason: 'read_failed' },
      { component: 'trajectory', reason: 'span_too_short' },
    ],
    reason: 'low_confidence',
  }

  it('names every missing component in words', () => {
    const { container } = wrap(<UnrankedPanel insufficientData={[insufficient]} />)
    expect(container.textContent).toContain('St. Agnes Academy')
    expect(container.textContent).toContain('Not ranked')
    // The three missing measures, by NAME — not as keys, not as a count, and in
    // the SERVER'S OWN vocabulary (see PORTFOLIO-LABELS below).
    expect(container.textContent).toContain('Evidence-backed coverage')
    expect(container.textContent).toContain('Open early warnings')
    expect(container.textContent).toContain('Movement since the baseline')
    // …and each one's stated reason.
    expect(container.textContent).toMatch(/no readiness snapshot/i)
    expect(container.textContent).toMatch(/too close together/i)
  })

  it('names the reasons the API ACTUALLY EMITS, not only the fixture aliases', () => {
    // RED PROOF: delete `no_readiness_snapshot` / `evidence_currency_not_in_force`
    // from MISSING_REASON_LABELS — the humanised fallback keeps the first
    // assertion alive but the second reddens ("evidence currency not in force" is
    // not the sentence).
    const { container } = wrap(
      <UnrankedPanel
        insufficientData={[
          {
            ...insufficient,
            missingComponents: [
              { component: 'readinessLevel', reason: 'no_readiness_snapshot' },
              { component: 'evidenceCurrency', reason: 'evidence_currency_not_in_force' },
              { component: 'earlyWarning', reason: 'findings_ledger_unreadable' },
            ],
          },
        ]}
      />,
    )
    expect(container.textContent).toMatch(/no readiness snapshot has been taken/i)
    expect(container.textContent).toMatch(/evidence currency has not been established/i)
    expect(container.textContent).toMatch(/findings ledger could not be read/i)
  })

  it('renders NO percentage, NO score and NO reassuring word', () => {
    // RED PROOF: add a `steady` fallback badge to InsufficientRow — this reddens.
    const { container } = wrap(<UnrankedPanel insufficientData={[insufficient]} />)
    expect(container.textContent).not.toContain('%')
    expect(spacedText(container)).not.toMatch(REASSURING)
    // `confidence` is on the payload and is deliberately NOT rendered: 0.38 on a
    // screen reads as a school's score rather than as our own ignorance.
    expect(container.textContent).not.toContain('0.38')
  })

  it('refuses to render an attentionScore/attentionBand even if one is smuggled onto the row', () => {
    // The API omits both keys entirely (spec §2.3 / PURE-10). This asserts the
    // COMPONENT would not render them either — the second line of defence, and
    // the one that survives an API refactor.
    const hostile = { ...insufficient, attentionScore: 12, attentionBand: 'clear' }
    const { container } = wrap(<UnrankedPanel insufficientData={[hostile]} />)
    expect(container.textContent).not.toContain('12')
    expect(spacedText(container)).not.toMatch(REASSURING)
  })

  it('an insufficient row with no named gap is reported as a defect, never rendered silently', () => {
    const { container } = wrap(
      <UnrankedPanel insufficientData={[{ ...insufficient, missingComponents: [] }]} />,
    )
    expect(screen.getByRole('alert').textContent).toMatch(/named no missing measure/i)
    expect(spacedText(container)).not.toMatch(REASSURING)
  })

  it('an unlicensed school shows its NAME and no readiness figure at all', () => {
    // Acceptance 3, defended at the UI: the API sends { schoolId, name } only, and
    // this panel must have nowhere to put anything else.
    // RED PROOF: render `row.verifiedPct` in NotLicensedRow — this reddens.
    const { container } = wrap(
      <UnrankedPanel
        notLicensed={[{ schoolId: 'sch-9', name: 'Holy Cross', verifiedPct: 88, attentionBand: 'clear' }]}
      />,
    )
    expect(container.textContent).toContain('Holy Cross')
    expect(container.textContent).not.toContain('88')
    expect(container.textContent).not.toContain('%')
    expect(spacedText(container)).not.toMatch(REASSURING)
  })

  it('renders nothing at all when there is nothing unranked', () => {
    const { container } = wrap(<UnrankedPanel insufficientData={[]} notLicensed={[]} />)
    expect(container.textContent).toBe('')
  })
})

describe('WEB-2 — a ranked row with no driver is a DEFECT, not an empty cell', () => {
  it('an empty drivers array renders a visible marker', () => {
    // RED PROOF: `if (rows.length === 0) return null` in DriversList — this reddens.
    const { container } = render(<DriversList drivers={[]} />)
    expect(container.textContent).not.toBe('')
    expect(screen.getByRole('alert').textContent).toMatch(/no driver stated/i)
  })

  it('a missing / malformed drivers prop is treated the same way', () => {
    for (const bad of [undefined, null, 'nonsense', [null]]) {
      cleanup()
      const { container } = render(<DriversList drivers={bad} />)
      expect(container.textContent).toMatch(/no driver stated/i)
    }
  })

  it('renders the SERVER’S sentences and adds no numeral of its own', () => {
    const drivers = [
      {
        component: 'readinessLevel',
        contributionBp: 2100,
        label: 'Evidence coverage',
        detail: 'Only 41% of standards are evidence-backed.',
      },
    ]
    const { container } = render(<DriversList drivers={drivers} />)
    expect(container.textContent).toContain('Evidence coverage')
    expect(container.textContent).toContain('Only 41% of standards are evidence-backed.')
    // The contributionBp (2100) is a weight, not a figure about the school. It is
    // rendered as a bar width, never as a number a reader could confuse with one.
    expect(container.textContent).not.toContain('2100')
    expect(container.textContent).not.toContain('21%')
  })
})

// ── A ranked fixture whose self-scores and evidence deliberately disagree ─────
const RANKED_ROW = {
  schoolId: 'sch-a',
  name: 'St. Bede',
  rank: 1,
  attentionScore: 63,
  attentionBand: 'elevated',
  confidence: 1,
  urgency: 3,
  urgencyReason: 'visit_imminent',
  frameworkCode: 'COGNIA',
  frameworkName: 'Cognia',
  snapshotDate: '2026-06-30',
  // THE DISAGREEMENT THAT MAKES WEB-3 MEAN SOMETHING: this school scored itself
  // 78 and can evidence 41. A tiebreak column showing 78 is the defect.
  verifiedPct: 41,
  readinessPct: 78,
  selfScoredPct: 90,
  demoData: false,
  drivers: [
    { component: 'readinessLevel', contributionBp: 1900, label: 'Evidence coverage', detail: 'Only 41% of standards are evidence-backed.' },
  ],
  peers: { peerCount: 8, matchTier: 'exact', activeDims: ['county'], relaxedDims: [], rank: 3, percentile: 0.62, sample: 'rich' },
}

/** The cell under the column whose header matches `header`, for row `rowIndex`. */
function cellUnder(container, header, rowIndex = 0) {
  const heads = [...container.querySelectorAll('thead th')].map((th) => th.textContent.trim())
  const idx = heads.findIndex((h) => new RegExp(header, 'i').test(h))
  expect(idx).toBeGreaterThan(-1)
  const row = container.querySelectorAll('tbody tr')[rowIndex]
  return row.querySelectorAll('td')[idx]
}

describe('WEB-3 — the tiebreak column is EVIDENCE-BACKED, never the self-score', () => {
  it('renders verifiedPct under the Evidence-backed header', () => {
    // RED PROOF: render `row.readinessPct` in that cell — this reddens on both
    // assertions, because the fixture's two figures deliberately differ.
    const { container } = render(<PortfolioTable rows={[RANKED_ROW]} />)
    const cell = cellUnder(container, 'evidence-backed')
    expect(cell.textContent).toContain('41%')
    expect(cell.textContent).not.toContain('78')
    expect(cell.textContent).not.toContain('90')
  })

  it('a school with no verified figure says so rather than showing a zero', () => {
    const { container } = render(
      <PortfolioTable rows={[{ ...RANKED_ROW, verifiedPct: null }]} />,
    )
    const cell = cellUnder(container, 'evidence-backed')
    expect(cell.textContent).toMatch(/not measured/i)
    expect(cell.textContent).not.toContain('0%')
  })

  it('every ranked row shows its drivers, and a driverless row shows the defect marker', () => {
    const { container } = render(
      <PortfolioTable rows={[RANKED_ROW, { ...RANKED_ROW, schoolId: 'sch-b', rank: 2, drivers: [] }]} />,
    )
    expect(cellUnder(container, 'why', 0).textContent).toContain('Evidence coverage')
    expect(cellUnder(container, 'why', 1).textContent).toMatch(/no driver stated/i)
  })

  it('renders the rows in the SERVER’S order and never re-sorts them', () => {
    // Acceptance 6 is a determinism claim about the server's frozen comparator. A
    // client-side sort — even a "stable" one — would make it unobservable.
    // RED PROOF: `rows.slice().sort((a,b)=>a.name<b.name?-1:1)` in PortfolioTable.
    const rows = [
      { ...RANKED_ROW, schoolId: 'z', name: 'Zebra College', rank: 1 },
      { ...RANKED_ROW, schoolId: 'a', name: 'Alpha School', rank: 2 },
    ]
    const { container } = render(<PortfolioTable rows={rows} />)
    expect(cellUnder(container, 'school', 0).textContent).toContain('Zebra College')
    expect(cellUnder(container, 'school', 1).textContent).toContain('Alpha School')
  })
})

describe('WEB-4 — fewer than four peers shows RANKS ONLY, no percentile', () => {
  it('a null percentile renders the rank and no percentile anywhere', () => {
    // RED PROOF: `percentile ?? (1 - (rank - 1) / peerCount)` in PeerCell — the
    // computed value renders "67th pctile" and both assertions redden.
    const { container } = render(
      <PeerCell peers={{ peerCount: 3, rank: 2, percentile: null, sample: 'small', relaxedDims: [] }} />,
    )
    expect(container.textContent).toContain('Rank 2')
    expect(container.textContent).toContain('3 peers')
    expect(container.textContent).not.toMatch(/pctile|percentile/i)
    expect(container.textContent).not.toMatch(/\d+(st|nd|rd|th)\b/i)
  })

  it('a percentile the API DID send is rendered', () => {
    const { container } = render(
      <PeerCell peers={{ peerCount: 8, rank: 3, percentile: 0.62, sample: 'rich', relaxedDims: [] }} />,
    )
    expect(container.textContent).toContain('Rank 3')
    expect(container.textContent).toContain('62nd pctile')
  })

  it('withholds a percentile the API should never have sent for a 3-peer school', () => {
    // Defence in depth. The API nulls `percentile` below four peers; if it ever
    // regressed, the screen would carry a statistic over three schools with the
    // server's authority behind it. The floor can only ever WITHHOLD — there is no
    // branch here that shows a percentile the API did not send.
    // RED PROOF: drop the `peers.peerCount >= MIN_PEERS_FOR_PERCENTILE` guard.
    const { container } = render(
      <PeerCell peers={{ peerCount: 3, rank: 1, percentile: 0.9, sample: 'small', relaxedDims: [] }} />,
    )
    expect(container.textContent).toContain('Rank 1')
    expect(container.textContent).not.toMatch(/pctile|percentile/i)
    expect(container.textContent).not.toContain('90')
  })

  it('a school with no peer group says so rather than showing rank 1 of 1', () => {
    const { container } = render(<PeerCell peers={null} />)
    expect(container.textContent).toMatch(/no peer group/i)
    expect(container.textContent).not.toMatch(/rank/i)
  })

  it('the peer cell inside the table obeys the same gate', () => {
    const { container } = render(
      <PortfolioTable
        rows={[{ ...RANKED_ROW, peers: { ...RANKED_ROW.peers, peerCount: 3, percentile: null } }]}
      />,
    )
    expect(cellUnder(container, 'peers').textContent).not.toMatch(/pctile|percentile/i)
  })
})

describe('WEB-5 — bulk adopt cannot be confirmed before it has been proposed', () => {
  const priority = {
    catalogStandardId: '11111111-1111-4111-8111-111111111111',
    code: 'COG-14',
    title: 'Continuous improvement process',
    headline: 'COG-14 is below the improvement threshold at 9 of 14 schools.',
  }
  const preview = [
    { schoolId: 's1', name: 'St. Agnes', standardId: 'st-1', existingInitiativeId: null, willCreate: true, status: 'will_create' },
    { schoolId: 's2', name: 'St. Bede', standardId: 'st-2', existingInitiativeId: 'i-9', willCreate: false, status: 'already_adopted' },
    { schoolId: 's3', name: 'Holy Cross', standardId: null, existingInitiativeId: null, willCreate: false, status: 'no_standard' },
  ]
  const HASH = 'a'.repeat(64)

  const confirmButton = () => screen.getByRole('button', { name: /confirm/i })

  it('confirm is disabled on mount and enabled only once a proposal has arrived', async () => {
    // RED PROOF: drop `!proposal ||` from confirmDisabled — the first assertion
    // reddens immediately.
    const onPropose = vi.fn().mockResolvedValue({ schools: preview, proposalHash: HASH })
    const onConfirm = vi.fn().mockResolvedValue({ schools: [] })
    render(<BulkAdoptFlow priority={priority} onPropose={onPropose} onConfirm={onConfirm} />)

    expect(confirmButton().disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: /^propose$/i }))
    await waitFor(() => expect(confirmButton().disabled).toBe(false))
    expect(onPropose).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('clicking confirm before proposing writes nothing', async () => {
    const onPropose = vi.fn().mockResolvedValue({ schools: preview, proposalHash: HASH })
    const onConfirm = vi.fn().mockResolvedValue({ schools: [] })
    render(<BulkAdoptFlow priority={priority} onPropose={onPropose} onConfirm={onConfirm} />)
    fireEvent.click(confirmButton())
    await waitFor(() => expect(onConfirm).not.toHaveBeenCalled())
  })

  it('the preview lists EVERY school with its own status, including the skipped ones', async () => {
    const onPropose = vi.fn().mockResolvedValue({ schools: preview, proposalHash: HASH })
    const { container } = render(
      <BulkAdoptFlow priority={priority} onPropose={onPropose} onConfirm={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^propose$/i }))
    await waitFor(() => expect(container.textContent).toContain('St. Agnes'))
    // RED PROOF: filter the preview to `willCreate` rows — the last two redden.
    expect(container.textContent).toContain('St. Bede')
    expect(container.textContent).toContain('Holy Cross')
    expect(container.textContent).toMatch(/will create an initiative/i)
    expect(container.textContent).toMatch(/already adopted/i)
    expect(container.textContent).toMatch(/no matching standard/i)
  })

  it('confirm sends back the SERVER’S proposalHash, never one this component minted', async () => {
    const onPropose = vi.fn().mockResolvedValue({ schools: preview, proposalHash: HASH })
    const onConfirm = vi.fn().mockResolvedValue({ schools: preview })
    render(<BulkAdoptFlow priority={priority} onPropose={onPropose} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole('button', { name: /^propose$/i }))
    await waitFor(() => expect(confirmButton().disabled).toBe(false))
    fireEvent.click(confirmButton())
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
    expect(onConfirm.mock.calls[0][0].proposalHash).toBe(HASH)
  })

  it('a 409 PROPOSAL_STALE says the list moved and forces a re-propose', async () => {
    const onPropose = vi.fn().mockResolvedValue({ schools: preview, proposalHash: HASH })
    const onConfirm = vi
      .fn()
      .mockRejectedValue({ response: { status: 409, data: { code: 'PROPOSAL_STALE' } } })
    render(<BulkAdoptFlow priority={priority} onPropose={onPropose} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole('button', { name: /^propose$/i }))
    await waitFor(() => expect(confirmButton().disabled).toBe(false))
    fireEvent.click(confirmButton())
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/list changed/i))
    // …and the flow is back behind the gate: no confirming a list nobody saw.
    expect(confirmButton().disabled).toBe(true)
  })

  it('a viewer is offered no write at all', () => {
    render(
      <BulkAdoptFlow priority={priority} canWrite={false} onPropose={vi.fn()} onConfirm={vi.fn()} />,
    )
    expect(confirmButton().disabled).toBe(true)
    expect(screen.getByRole('button', { name: /^propose$/i }).disabled).toBe(true)
  })
})

describe('WEB-7 — the applied panel says what DID happen, and names what failed', () => {
  const priority = { catalogStandardId: 'cat-1', code: 'COG-14' }
  const HASH = 'b'.repeat(64)
  const preview = [
    { schoolId: 's1', name: 'St. Agnes', status: 'will_create' },
    { schoolId: 's2', name: 'St. Bede', status: 'will_create' },
  ]
  const confirmButton = () => screen.getByRole('button', { name: /confirm/i })

  const driveToApplied = async (confirmPayload) => {
    const onPropose = vi.fn().mockResolvedValue({ schools: preview, proposalHash: HASH })
    const onConfirm = vi.fn().mockResolvedValue(confirmPayload)
    const view = render(
      <BulkAdoptFlow priority={priority} onPropose={onPropose} onConfirm={onConfirm} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^propose$/i }))
    await waitFor(() => expect(confirmButton().disabled).toBe(false))
    fireEvent.click(confirmButton())
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(view.container.textContent).toContain('Applied'))
    return view
  }

  it('a completed write is never described in the future tense', async () => {
    // RED PROOF: send the PREVIEW vocabulary back from confirm (which is what the
    // server used to do) — "Will create an initiative" appears under "Applied"
    // and the first two assertions redden.
    const { container } = await driveToApplied({
      schools: [
        { schoolId: 's1', name: 'St. Agnes', status: 'created', applied: true },
        { schoolId: 's2', name: 'St. Bede', status: 'reused', applied: true },
      ],
      createdCount: 1,
      reusedCount: 1,
      skippedCount: 0,
      failedCount: 0,
      failures: [],
    })
    expect(container.textContent).not.toMatch(/will create an initiative/i)
    expect(container.textContent).toMatch(/initiative created/i)
    expect(container.textContent).toMatch(/the existing initiative was kept/i)
    // …and the tallies are on screen, not only in the JSON.
    expect(container.textContent).toMatch(/1 initiative created/i)
    expect(container.textContent).toMatch(/1 already adopted/i)
  })

  it('a school where the write FAILED does not render identically to one that succeeded', async () => {
    // RED PROOF: drop the `failures`/`applied === false` reconciliation in
    // `confirm` and the `failureMessage` line in PreviewList — the two rows
    // render as the same sentence and every assertion below reddens. This is the
    // 14-school push that landed at 11 and said nothing.
    const { container } = await driveToApplied({
      schools: [
        { schoolId: 's1', name: 'St. Agnes', status: 'created', applied: true },
        // The hostile shape: a server that regressed to the PREVIEW word while
        // still flagging the row as not applied.
        { schoolId: 's2', name: 'St. Bede', status: 'will_create', applied: false },
      ],
      createdCount: 1,
      reusedCount: 0,
      skippedCount: 0,
      failedCount: 1,
      failures: [{ schoolId: 's2', message: 'initiative limit reached at this school' }],
    })
    const rows = [...container.querySelectorAll('li')]
    const bede = rows.find((li) => li.textContent.includes('St. Bede'))
    const agnes = rows.find((li) => li.textContent.includes('St. Agnes'))
    expect(bede.textContent).toMatch(/failed/i)
    expect(bede.textContent).toMatch(/initiative limit reached/i)
    expect(agnes.textContent).not.toMatch(/failed/i)
    expect(bede.textContent).not.toBe(agnes.textContent)
    // …and the count of what did not land is stated, not left to be counted.
    expect(container.textContent).toMatch(/1 school could not be applied/i)
  })

  it('editing the title after proposing blames the TITLE, not the school list', async () => {
    // RED PROOF: drop `inputsChanged` from confirmDisabled and from the sentence —
    // confirm stays live, the server 409s on the recomputed hash and the component
    // says "The list changed since you were shown it" about a list that did not
    // change. Both assertions redden.
    const onPropose = vi.fn().mockResolvedValue({ schools: preview, proposalHash: HASH })
    const onConfirm = vi.fn()
    const { container } = render(
      <BulkAdoptFlow priority={priority} onPropose={onPropose} onConfirm={onConfirm} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^propose$/i }))
    await waitFor(() => expect(confirmButton().disabled).toBe(false))

    const input = container.querySelector('input[type="text"]')
    fireEvent.change(input, { target: { value: 'COG-14 workshop, spring term' } })

    await waitFor(() => expect(confirmButton().disabled).toBe(true))
    expect(container.textContent).toMatch(/you changed the title after proposing/i)
    expect(container.textContent).not.toMatch(/list changed since you were shown it/i)
    fireEvent.click(confirmButton())
    await waitFor(() => expect(onConfirm).not.toHaveBeenCalled())
  })
})

describe('WEB-8 — a TRUNCATED priorities list says how many it withheld', () => {
  const priorities = Array.from({ length: 10 }, (_, i) => ({
    catalogStandardId: `cat-${i}`,
    code: `COG-${i}`,
    title: 'Continuous improvement',
    headline: `COG-${i} is below the improvement threshold at 9 of 14 schools.`,
    schoolsBelowThreshold: 9,
    schoolsInScope: 14,
    sharePct: 64,
    medianRubricScore: 2,
  }))

  it('states "the top 10 of 47" rather than reading as the complete answer', () => {
    // RED PROOF: drop the `withheld` block from InterventionPriorities — a
    // superintendent plans against 10 priorities believing that is all of them,
    // and both assertions redden.
    const { container } = render(
      <InterventionPriorities data={{ priorities, totalPriorities: 47, thresholdScore: 2, notes: [] }} />,
    )
    expect(container.textContent).toMatch(/showing the top 10 of 47/i)
    expect(container.textContent).toMatch(/37 further standards/i)
  })

  it('says nothing when nothing was withheld', () => {
    const { container } = render(
      <InterventionPriorities
        data={{ priorities, totalPriorities: 10, thresholdScore: 2, notes: [] }}
      />,
    )
    expect(container.textContent).not.toMatch(/showing the top/i)
  })
})

/** Relative to the vitest cwd (apps/web) — see the note in the first test. */
const COMPLIANCE_SRC = '../../packages/compliance/src/portfolio-priority.ts'

describe('PORTFOLIO-LABELS — the web mirror matches the package it mirrors', () => {
  // The SERVER puts `COMPONENT_LABELS` into `drivers[].label` on every ranked
  // row; UnrankedPanel names the SAME six keys underneath. Two vocabularies meant
  // a ranked school showed "Evidence-backed coverage" while the panel below named
  // the identical measure "Readiness level", and nothing on the page connected
  // them. apps/web cannot import @finrep/compliance, so the guard reads the
  // package SOURCE — the house pattern from apps/api/src/twin/twin.controller.spec.ts.
  //
  // RED PROOF: change any one label in UnrankedPanel.jsx (e.g. `readinessLevel:
  // 'Readiness level'`) — this reddens naming the key.
  it('every key and every string is identical to portfolio-priority.ts', () => {
    // A path RELATIVE TO THE RUNNER'S CWD (apps/web). `import.meta.url` is an
    // http: URL under the jsdom environment, and `process` is not a global the
    // browser eslint config allows in this directory.
    const src = readFileSync(COMPLIANCE_SRC, 'utf8')
    const block = src.match(
      /export const COMPONENT_LABELS: Record<PortfolioComponentKey, string> = \{([\s\S]*?)\n\}/,
    )
    expect(block).toBeTruthy()
    const canonical = {}
    for (const line of block[1].split('\n')) {
      const m = line.match(/^\s*(\w+):\s*'([^']*)',/)
      if (m) canonical[m[1]] = m[2]
    }
    // The parse itself must have worked, or this guard proves nothing.
    expect(Object.keys(canonical)).toHaveLength(6)
    expect(COMPONENT_LABELS).toEqual(canonical)
  })

  it('every urgency reason the engine can emit has its own sentence here', () => {
    // The two reasons this phase's fixes ADDED — `review_overdue` (a lapsed
    // review, urgency 3) and `review_beyond_horizon` (a scheduled visit past two
    // years, urgency 0) — reached the screen through the humanised-token
    // fallback, which is readable but is not a sentence anyone wrote.
    //
    // RED PROOF: drop `review_overdue` from URGENCY_REASON_LABELS — this reddens
    // naming the token.
    const src = readFileSync(COMPLIANCE_SRC, 'utf8')
    const union = src.match(/export type PortfolioUrgencyReason =([\s\S]*?)\n\n/)
    expect(union).toBeTruthy()
    const tokens = [...union[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect(tokens.length).toBeGreaterThanOrEqual(7)
    for (const token of tokens) {
      expect(URGENCY_REASON_LABELS[token], `no label for urgencyReason '${token}'`).toBeTruthy()
    }
    // The two this phase added — a written sentence, not the token wearing a
    // capital letter. (`no_scheduled_review` legitimately reads the same either
    // way, which is why the check is on these two rather than on all of them.)
    expect(URGENCY_REASON_LABELS.review_overdue).not.toBe(humanizeToken('review_overdue'))
    expect(URGENCY_REASON_LABELS.review_beyond_horizon).not.toBe(
      humanizeToken('review_beyond_horizon'),
    )
  })
})

describe('WEB-9 — the org portfolio is reachable from the sidebar at every school', () => {
  const group = NAV_GROUPS.find((g) => g.id === 'portfolio')

  it('the group exists and is not gated on the ACTIVE SCHOOL’s licence', () => {
    expect(group).toBeTruthy()
    // RED PROOF: put `module: 'accreditation'` back on the group — both
    // assertions redden. `hasModule` reads the active school's billing only, so a
    // module gate on an ORG route hides the whole surface whenever the selected
    // school is the one school in the diocese without the licence.
    expect(group.module).toBeUndefined()
    expect(group.orgOnly).toBe(true)
  })

  it('renders for a superintendent whose ACTIVE school licenses nothing', () => {
    const hasModule = vi.fn(() => false)
    expect(navGroupVisible(group, { hasModule, hasOrg: true })).toBe(true)
    // …and the licence of the active school was never even consulted.
    expect(hasModule).not.toHaveBeenCalled()
  })

  it('does not render for an account with no organization', () => {
    expect(navGroupVisible(group, { hasModule: () => true, hasOrg: false })).toBe(false)
  })

  it('leaves every OTHER group on the per-school licence rule', () => {
    const accreditation = NAV_GROUPS.find((g) => g.id === 'accreditation')
    expect(accreditation.module).toBe('accreditation')
    expect(navGroupVisible(accreditation, { hasModule: () => false, hasOrg: true })).toBe(false)
    const core = NAV_GROUPS.find((g) => g.module === null)
    expect(navGroupVisible(core, { hasModule: () => false, hasOrg: false })).toBe(true)
  })
})

describe('WEB-10 — the unlicensed-schools panel points at a control that can reach them', () => {
  it('does not send the reader to the ACTIVE school’s billing page', () => {
    // RED PROOF: restore `<Link to="/settings/billing">Review modules & billing</Link>`
    // — the first assertion reddens. That page is bound to the active school,
    // which (to be reading this page at all) already licenses accreditation, so
    // it carries no control that touches the schools just named.
    const { container } = wrap(
      <UnrankedPanel notLicensed={[{ schoolId: 'sch-9', name: 'St. Bede' }]} />,
    )
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).not.toContain('/settings/billing')
    // …and it states where the change is actually made.
    expect(container.textContent).toMatch(/per school/i)
    expect(container.textContent).toMatch(/modules/i)
    // Still no readiness figure anywhere on this panel (acceptance 3).
    expect(container.textContent).not.toContain('%')
  })
})

describe('WEB-6 — an unmeasurable velocity prints the REASON, never a zero', () => {
  it('basis:insufficient renders the literal reason instead of a delta', () => {
    // RED PROOF: `deltaText(row.deltaPctPoints ?? 0)` in SchoolRow — "±0.0 pts"
    // appears and the assertion reddens. A school we cannot measure has not
    // "stayed level"; those are different facts.
    const { container } = render(
      <VelocityPanel
        data={{
          windowDays: 180,
          org: { initiatives: 4, initiativesWithObservations: 1, improved: 1, flat: 0, declined: 0, unresponded: 2, basis: 'observed' },
          schools: [
            { schoolId: 's1', name: 'St. Agnes', initiatives: 2, observations: 1, deltaPctPoints: null, basis: 'insufficient', reason: 'span_too_short' },
            { schoolId: 's2', name: 'St. Bede', initiatives: 2, observations: 4, deltaPctPoints: 6.25, basis: 'observed', reason: null },
          ],
          notes: [],
        }}
      />,
    )
    const rows = container.querySelectorAll('li')
    expect(within(rows[0]).getByText(/not measurable yet/i)).toBeTruthy()
    expect(rows[0].textContent).toMatch(/span too short/i)
    expect(rows[0].textContent).not.toContain('0.0 pts')
    expect(rows[1].textContent).toContain('+6.3 pts')
  })
})
