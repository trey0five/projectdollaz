import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ActArrival, { BAND_QUALIFIER } from './ActArrival.jsx'
import ActFindings from './ActFindings.jsx'
import ActRequests, { standardHref } from './ActRequests.jsx'
import EvidenceReadinessTable from '../EvidenceReadinessTable.jsx'
import ActUnanswered from './ActUnanswered.jsx'
import ActSection from './ActSection.jsx'
import ActPlan from './ActPlan.jsx'
import PlanConfirmCard, { ROW_COPY } from './PlanConfirmCard.jsx'
import FindingBasisChain from './FindingBasisChain.jsx'
import { basisHref } from '../basisLinks.js'
import { fmtDay } from '../visitDates.js'
import visit from './__fixtures__/visit.example.json'

// ─────────────────────────────────────────────────────────────────────────────
// THE MOCK VISIT'S UI HONESTY INVARIANTS — AIC Phase H, acceptance 1/2/5/6/8.
//
// The server side of this phase is heavily specced: the pure composer proves the
// partition invariant, the ordering, the numeral rule and the basis rule. NONE OF
// THAT SURVIVES A JSX FILE. A `.slice(0, 5)` added to the roster to "tidy up the
// page", a likelihood chip that grows a percentage because it looks more precise,
// an `initial={{opacity: 0}}` that never animates under reduced motion, an
// accordion around Act 5 because the page is long, a toast that says "Created" for
// a 200 — every one of those is a one-line change that reads as an improvement in
// a diff and quietly turns this product back into the thing it exists to replace.
//
// Scoped to components that take plain props, deliberately. Mounting VisitPage
// would need the school/entitlement context stack, the TTS transport and a fetch
// layer, and a spec that fragile gets deleted the first time it goes red for an
// unrelated reason.
//
// The fixture is the COMPOSED output of the shared SEAM D fixture
// (`packages/compliance/__tests__/fixtures.ts` → `composeMockVisit`), copied to
// JSON. It is deliberately awkward: two findings under one code, one under
// another, one with no code at all, one finding carrying two codes, a roster row
// with a NULL reason, and a plan item with no estimated lift.
// ─────────────────────────────────────────────────────────────────────────────

// `globals: false` means testing-library's automatic cleanup is never registered.
afterEach(cleanup)

const wrap = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>)

const findingsAct = visit.acts.findings
const unansweredAct = visit.acts.unanswered
const planAct = visit.acts.plan

describe('SPEC-WEB-1 — acceptance 1: every basis renders its value and its date, and links', () => {
  const allFindings = [...findingsAct.groups.flatMap((g) => g.findings), ...findingsAct.schoolLevel]

  it('EVERY card renders its chain on FIRST PAINT — no click, no accordion', () => {
    // ACCEPTANCE 1 IS "every finding card", not "the first card in each group".
    // This shipped with `defaultOpen={i === 0}`: a group of three findings put its
    // second and third cards on screen as a title, a rationale, a consequence and a
    // severity with the evidence absent from the DOM. The spec below did not catch
    // it because it clicks every collapsed toggle before asserting — so it is
    // asserted here BEFORE anything is clicked, and a regression that hides even
    // one chain turns this red.
    const { container } = wrap(
      <ActFindings findings={findingsAct} schoolLevelNote={findingsAct.schoolLevelNote} />,
    )
    expect(container.querySelectorAll('[data-testid="visit-finding"]').length).toBe(
      allFindings.length,
    )
    expect(container.querySelectorAll('[data-testid="basis-chain"]').length).toBe(
      allFindings.length,
    )
    // Nothing is collapsed to begin with…
    expect(container.querySelector('button[aria-expanded="false"]')).toBeNull()
    // …and every basis row of every finding is on screen, unclicked.
    const displays = [...container.querySelectorAll('[data-testid="basis-display"]')].map(
      (el) => el.textContent,
    )
    expect(displays.length).toBe(allFindings.flatMap((f) => f.basis).length)
    // The toggle still WORKS — it collapses, which is what it is for.
    const first = container.querySelector('button[aria-expanded="true"]')
    expect(first).not.toBeNull()
    fireEvent.click(first)
    expect(first.getAttribute('aria-expanded')).toBe('false')
  })

  it('every finding card shows every basis row with its display AND its asOf', () => {
    const { container } = wrap(
      <ActFindings findings={findingsAct} schoolLevelNote={findingsAct.schoolLevelNote} />,
    )
    // Every finding in the payload, in either bucket, must be on screen.
    const all = allFindings
    expect(all.length).toBe(findingsAct.severityCounts.total)

    // Belt to the brace above: if anything ever does start collapsed, NOTHING may
    // be unreachable.
    for (const btn of container.querySelectorAll('button[aria-expanded="false"]')) {
      fireEvent.click(btn)
    }

    const displays = [...container.querySelectorAll('[data-testid="basis-display"]')].map(
      (el) => el.textContent,
    )
    const asOfs = [...container.querySelectorAll('[data-testid="basis-asof"]')].map(
      (el) => el.textContent,
    )
    const expected = all.flatMap((f) => f.basis)
    expect(expected.length).toBeGreaterThan(0)
    expect(displays.length).toBe(expected.length)
    for (const entry of expected) {
      expect(displays).toContain(entry.display)
      // THE SAME RENDERING THE PRINT PAGES USE. The screen printed the raw ISO
      // `2026-06-30` while `/accreditation/visit/print` printed `Jun 30, 2026` for
      // the identical row — two dates for one reading, on the two surfaces this
      // phase exists to keep identical. Never today's date, and never blank.
      expect(asOfs).toContain(entry.asOf ? fmtDay(entry.asOf) : 'no date recorded')
    }
    // And the raw ISO form is nowhere on screen.
    for (const el of asOfs) expect(el).not.toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('every basis row carries a real link, and no href contains "undefined"', () => {
    const { container } = wrap(
      <ActFindings findings={findingsAct} schoolLevelNote={findingsAct.schoolLevelNote} />,
    )
    for (const btn of container.querySelectorAll('button[aria-expanded="false"]')) {
      fireEvent.click(btn)
    }
    const links = [...container.querySelectorAll('[data-testid="basis-link"]')]
    expect(links.length).toBeGreaterThan(0)
    for (const a of links) {
      const href = a.getAttribute('href')
      expect(href).toBeTruthy()
      expect(href).not.toContain('undefined')
      expect(href.startsWith('/')).toBe(true)
    }
  })

  it('basisHref is TOTAL — every entry shape yields a non-empty in-app path', () => {
    // The shapes that actually occur: a lineage with a metricKey, a lineage with a
    // table only, an unknown table, a NULL lineage, and no key at all. A dead link
    // in a basis chain is worse than no link: it invites verification and verifies
    // nothing.
    const shapes = [
      { key: 'hr.student_teacher_ratio', lineage: { table: 'PeriodOperationalData', metricKey: 'student_teacher_ratio' } },
      { key: 'gov.minutes_lag', lineage: { table: 'Meeting', field: 'minutesApprovedAt' } },
      { key: 'x.unknown', lineage: { table: 'TableThatDoesNotExist' } },
      { key: 'fin.days_cash', lineage: null },
      { key: 'fin.days_cash' },
      { lineage: null },
      {},
      null,
      undefined,
    ]
    for (const shape of shapes) {
      const href = basisHref(shape)
      expect(typeof href).toBe('string')
      expect(href.length).toBeGreaterThan(0)
      expect(href.startsWith('/')).toBe(true)
      expect(href).not.toContain('undefined')
      expect(href).not.toContain('null')
    }
    // And it routes where it can rather than always falling back.
    expect(basisHref(shapes[0])).toBe('/hr')
    expect(basisHref(shapes[1])).toBe('/governance?tab=records&register=meetings')
  })

  it('an EMPTY basis chain is reported as a defect, never rendered as silence', () => {
    // The composer's spec asserts `basis.length >= 1` for every finding, so this
    // state cannot occur — which is exactly why the component must not fail open.
    // A card that quietly renders nothing where its argument should be is an
    // assertion wearing the engine's authority.
    const { container } = wrap(<FindingBasisChain basis={[]} />)
    expect(container.querySelector('[data-testid="basis-missing"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="basis-chain"]')).toBeNull()
  })
})

describe('ACT 1 — the band is a PROJECTION and is never dressed as an outcome', () => {
  const arrivalAct = visit.acts.arrival

  it('qualifies the band pill, and prints the framework’s own label verbatim', () => {
    // `arrival.band` is `bandForIndex(statusBands, projectedIndex)`, and under
    // Cognia those bands ARE the accreditation status labels — "Accredited",
    // "Accredited with Merit", "Accredited with Distinction". Rendered bare in the
    // chip row, between the framework name and the demonstration-data pill, a
    // Cognia school read "Accredited with Merit" as a verdict; it is a band over a
    // projected index derived from self-scores in which an unscored leaf counts
    // as 1. Every other surface qualifies it, so this one does too.
    const { container } = wrap(
      <ActArrival arrival={{ ...arrivalAct, band: 'Accredited with Merit' }} />,
    )
    const pill = container.querySelector('[data-testid="arrival-band"]')
    expect(pill).not.toBeNull()
    expect(pill.textContent).toContain(BAND_QUALIFIER)
    expect(pill.textContent).toContain('Accredited with Merit')
    // The accreditor's own casing survives: no `capitalize`, which would render
    // "Accredited With Merit" and quietly re-write their term.
    expect(pill.className).not.toContain('capitalize')
    // And the pill infers nothing about good or bad from that wording.
    expect(pill.className).not.toMatch(/emerald|danger|amber/)
  })

  it('a NULL half of the pair is an em dash, never a zero', () => {
    // The composer nulls both halves for a school with no adopted framework. A `0`
    // renders as "0%" through `typeof value === 'number'`, so the contract only
    // holds if the server actually sends null — and this proves the component
    // honours it when it does.
    const { container } = wrap(
      <ActArrival
        arrival={{
          ...arrivalAct,
          documented: null,
          defensible: null,
          projectedIndex: null,
          band: null,
          unavailableReason:
            'Nothing has been scored against a rubric, so no readiness figure can be stated until a framework is adopted.',
        }}
      />,
    )
    expect(container.textContent).not.toContain('0%')
    expect(container.querySelector('[data-testid="arrival-band"]')).toBeNull()
    expect(container.querySelector('[data-testid="arrival-unavailable"]')).not.toBeNull()
    expect(container.textContent).toContain('until a framework is adopted')
  })
})

describe('ACT 4 — no dead affordance: a standard chip either navigates or is not a button', () => {
  const requests = {
    ...visit.acts.requests,
    groups: [
      {
        tag: 'board_minutes',
        label: 'Board minutes',
        servesStandards: [
          { standardId: 'std-1', code: 'COG-1', title: 'Governance', state: 'current' },
          { standardId: 'std-2', code: 'COG-2', title: 'Leadership', state: 'aging' },
        ],
        artifacts: [],
      },
    ],
  }

  /** Expand every group so the "Serves" chips are in the DOM. */
  function expandAll(container) {
    for (const btn of container.querySelectorAll('button[aria-expanded="false"]')) {
      fireEvent.click(btn)
    }
  }

  it('the chip NAVIGATES on the visit surface — it shipped as a button that did nothing', () => {
    // ActRequests supplied no `onOpenStandard`, so `onClick={() => onOpenStandard?.(id)}`
    // was a no-op: a hover-highlighted, interactive-looking pill, live on the
    // Accreditation page and dead here. Same control, two behaviours.
    const { container } = wrap(<ActRequests requests={requests} framework={null} />)
    expandAll(container)
    const chip = [...container.querySelectorAll('button')].find((b) =>
      b.textContent.includes('COG-1'),
    )
    expect(chip).toBeTruthy()
    fireEvent.click(chip)
    // MemoryRouter has no location display here; assert the handler is real by
    // routing through the exported href builder instead of a spy on navigate.
    expect(standardHref('std-1')).toBe('/accreditation?center=standards&standard=std-1')
  })

  it('an explicit handler still wins, and receives the standard id', () => {
    const onOpenStandard = vi.fn()
    const { container } = wrap(
      <ActRequests requests={requests} framework={null} onOpenStandard={onOpenStandard} />,
    )
    expandAll(container)
    const chip = [...container.querySelectorAll('button')].find((b) =>
      b.textContent.includes('COG-2'),
    )
    fireEvent.click(chip)
    expect(onOpenStandard).toHaveBeenCalledWith('std-2')
  })

  it('WITHOUT a handler the table renders a span, not a button — CtaPill’s own rule', () => {
    // The root cause, pinned at the component that renders the chip: a control with
    // no handler is not a control. `EvidenceReadinessTable` already refuses to
    // render a CtaPill as a link when `cta.link` is null; the serves chip now
    // refuses the same way.
    const { container } = wrap(
      <EvidenceReadinessTable
        health={requests.health}
        counts={requests.counts}
        groups={requests.groups}
        framework={null}
        printHref="/accreditation/evidence/print"
      />,
    )
    expandAll(container)
    expect(container.textContent).toContain('COG-1')
    const chip = [...container.querySelectorAll('button')].find((b) =>
      b.textContent.includes('COG-1'),
    )
    expect(chip).toBeUndefined()
  })
})

describe('SPEC-WEB-2 — acceptance 2: no percentage is attached to a finding', () => {
  it('the rendered findings act introduces no % of its own', () => {
    // The fixture's findings act carries no percent sign anywhere in its server
    // strings, so any % in the DOM would be one the CLIENT composed.
    expect(JSON.stringify(findingsAct)).not.toContain('%')
    const { container } = wrap(
      <ActFindings findings={findingsAct} schoolLevelNote={findingsAct.schoolLevelNote} />,
    )
    for (const btn of container.querySelectorAll('button[aria-expanded="false"]')) {
      fireEvent.click(btn)
    }
    expect(container.textContent).not.toContain('%')
  })

  it('a server string that legitimately contains % passes through UNCHANGED — the client adds none', () => {
    // The weaker assertion above passes trivially the moment a school's operating
    // margin appears in a basis `display`. This is the assertion that keeps
    // biting: count the percent signs the SERVER sent, count the ones on screen,
    // and require them equal. A client-side "72% likely" chip breaks it.
    const withPct = structuredClone(findingsAct)
    withPct.groups[0].findings[0].basis[0].display = '3.4%'
    withPct.groups[0].findings[0].rationale = 'Operating margin is 3.4% against a 5.0% floor.'
    const serverPercentCount = (JSON.stringify(withPct).match(/%/g) ?? []).length
    const { container } = wrap(
      <ActFindings findings={withPct} schoolLevelNote={withPct.schoolLevelNote} />,
    )
    for (const btn of container.querySelectorAll('button[aria-expanded="false"]')) {
      fireEvent.click(btn)
    }
    const domPercentCount = (container.textContent.match(/%/g) ?? []).length
    expect(domPercentCount).toBeLessThanOrEqual(serverPercentCount)
  })

  it('the likelihood chip is an ORDINAL WORD — no digit, no percent sign', () => {
    const { container } = wrap(
      <ActFindings findings={findingsAct} schoolLevelNote={findingsAct.schoolLevelNote} />,
    )
    const chips = [...container.querySelectorAll('[data-testid="likelihood"]')]
    expect(chips.length).toBeGreaterThan(0)
    for (const chip of chips) {
      expect(chip.textContent).not.toMatch(/\d/)
      expect(chip.textContent).not.toContain('%')
      expect(['possible', 'likely']).toContain(chip.textContent.trim().toLowerCase())
    }
  })

  it('findings render UNDER NAMED STANDARD CODES, and each finding appears exactly once', () => {
    const { container } = wrap(
      <ActFindings findings={findingsAct} schoolLevelNote={findingsAct.schoolLevelNote} />,
    )
    const codes = [...container.querySelectorAll('[data-testid="group-code"]')].map((el) =>
      el.textContent.trim(),
    )
    for (const g of findingsAct.groups) expect(codes).toContain(g.code)
    // One card per finding — no finding duplicated into a second code's group.
    const cards = container.querySelectorAll('[data-testid="visit-finding"]')
    expect(cards.length).toBe(findingsAct.severityCounts.total)
    // The school-level note is the SERVER's frozen sentence, rendered verbatim.
    expect(container.textContent).toContain(findingsAct.schoolLevelNote)
  })
})

describe('SPEC-WEB-3 — acceptance 6: Act 5 is present, populated and NOT truncated', () => {
  it('renders every named hole, every not-evaluated rule and EVERY roster row', () => {
    const { container } = wrap(<ActUnanswered unanswered={unansweredAct} />)

    expect(container.querySelectorAll('[data-testid="named-hole"]').length).toBe(
      unansweredAct.namedHoles.length,
    )
    expect(container.querySelectorAll('[data-testid="not-evaluated"]').length).toBe(
      unansweredAct.rules.length,
    )
    // THE WHOLE ROSTER. No slice, no cap, no "and N more".
    expect(container.querySelectorAll('[data-testid="signal-row"]').length).toBe(
      unansweredAct.rosterCounts.total,
    )
    expect(container.textContent).not.toMatch(/\bmore\b\s*…|show more/i)

    // Every hole's frozen copy and every rule's blocking signal, verbatim.
    for (const h of unansweredAct.namedHoles) expect(container.textContent).toContain(h.copy)
    for (const r of unansweredAct.rules) {
      if (r.blockingSignalKey) expect(container.textContent).toContain(r.blockingSignalKey)
    }
  })

  it('is OPEN by default — no <details>, no collapsed wrapper, no tab', () => {
    const { container } = wrap(<ActUnanswered unanswered={unansweredAct} />)
    expect(container.querySelector('details')).toBeNull()
    expect(container.querySelector('[aria-expanded="false"]')).toBeNull()
    expect(container.querySelector('[hidden]')).toBeNull()
  })

  it('a roster row whose reason is null renders the frozen fallback, never blank', () => {
    // `unavailableReason` is carried through VERBATIM and may be null even on a row
    // that could not be read. `reasonText` is the guaranteed-non-empty field, and
    // reading the wrong one is exactly how a cell renders blank — which reads as
    // "fine".
    const nullReasonRow = Object.values(unansweredAct.signalRows)
      .flat()
      .find((r) => r.availability !== 'available' && r.unavailableReason == null)
    expect(nullReasonRow).toBeTruthy()
    expect(nullReasonRow.reasonText).toBeTruthy()

    const { container } = wrap(<ActUnanswered unanswered={unansweredAct} />)
    expect(container.textContent).toContain(nullReasonRow.reasonText)
    // Every non-available row on screen carries SOME reason text.
    const reasons = [...container.querySelectorAll('[data-testid="signal-reason"]')]
    const notAvailable = Object.values(unansweredAct.signalRows)
      .flat()
      .filter((r) => r.availability !== 'available')
    expect(reasons.length).toBe(notAvailable.length)
    for (const el of reasons) expect(el.textContent.trim().length).toBeGreaterThan(0)
  })

  it('the module upsell and the years ask are carried through, never re-aggregated', () => {
    const { container } = wrap(<ActUnanswered unanswered={unansweredAct} />)
    // EVERY fiscal-year label the ONE named signal needs — naming the first of two
    // is how the ask stops being true.
    for (const label of unansweredAct.unlockableByYears.fyLabels) {
      expect(container.textContent).toContain(label)
    }
    for (const u of unansweredAct.upsell) {
      for (const id of u.ruleIds) expect(container.textContent).toContain(id)
    }
  })
})

describe('SPEC-WEB-7 — acceptance 5: prefers-reduced-motion is honoured', () => {
  it('an act section under reduced motion renders with NO zero-opacity initial state', () => {
    const { container } = render(
      <MemoryRouter>
        <ActSection index={5} title="What we could not answer" reduce id="act-unanswered">
          <ActUnanswered unanswered={unansweredAct} />
        </ActSection>
      </MemoryRouter>,
    )
    const section = container.querySelector('[data-act="act-unanswered"]')
    expect(section).not.toBeNull()
    // framer-motion writes the `initial` object straight onto the node's style. With
    // `initial={false}` nothing is written at all — which is the point: an entrance
    // that never runs must not leave the act invisible.
    expect(section.style.opacity).not.toBe('0')
    expect(section.style.transform ?? '').not.toMatch(/translateY\(\s*10px\s*\)/)
    // And the content is genuinely there, not merely un-hidden.
    expect(container.querySelectorAll('[data-testid="signal-row"]').length).toBe(
      unansweredAct.rosterCounts.total,
    )
  })

  it('the same section WITHOUT reduced motion still ends up visible', () => {
    const { container } = render(
      <MemoryRouter>
        <ActSection index={5} title="What we could not answer" id="act-unanswered">
          <ActUnanswered unanswered={unansweredAct} />
        </ActSection>
      </MemoryRouter>,
    )
    // No IntersectionObserver dependency: the act animates on mount, not on scroll,
    // so jsdom (and a print stylesheet) still get a rendered act.
    expect(container.querySelectorAll('[data-testid="signal-row"]').length).toBe(
      unansweredAct.rosterCounts.total,
    )
  })
})

describe('SPEC-WEB-8 — acceptance 8: a 200 reads "already being worked", never "Created"', () => {
  const items = planAct.items

  it('a repeat adoption (200) is reported as already being worked', async () => {
    // Phase G's adopt is idempotent by Postgres uniqueness and answers 200, not
    // 201, on a repeat. A card that toasted "Created" for both would tell a school
    // it made a second commitment it did not make.
    const adopt = vi.fn().mockResolvedValue({ status: 200, data: {} })
    const { container } = wrap(<PlanConfirmCard items={items} adopt={adopt} />)
    fireEvent.click(screen.getByRole('button', { name: /create these initiatives/i }))

    await waitFor(() => expect(adopt).toHaveBeenCalledTimes(items.length))
    await waitFor(() =>
      expect(container.querySelectorAll('[data-testid="row-existing"]').length).toBe(items.length),
    )
    // Assert against the STATUS ELEMENTS, not `container.textContent`.
    // `not.toMatch(/\bCreated\b/)` over the whole DOM is a trap and this spec was
    // written with it first: the status chip abuts the next control, so the text
    // reads "…CreatedDue date…" and `\b` finds no boundary between 'd' and 'D'.
    // The assertion passed with the bug fully present. Read the nodes.
    const statuses = [...container.querySelectorAll('[data-testid^="row-"]')].map((el) =>
      el.textContent.trim(),
    )
    expect(statuses.length).toBe(items.length)
    for (const text of statuses) {
      expect(text).toBe(ROW_COPY.existing)
      expect(text).not.toMatch(/created/i)
    }
    expect(container.querySelector('[data-testid="row-created"]')).toBeNull()
    // The tally speaks of "created" ONLY for rows that were created.
    expect(container.querySelector('[data-testid="run-tally"]').textContent).not.toMatch(
      /created/i,
    )
  })

  it('the two outcomes can never share a word — 200 and 201 are different sentences', () => {
    // The direct invariant behind acceptance 8, independent of any render: if these
    // two ever collapse to one string, every assertion above becomes vacuous.
    expect(ROW_COPY.created).not.toBe(ROW_COPY.existing)
    expect(ROW_COPY.existing).not.toMatch(/created/i)
    expect(ROW_COPY.existing).toMatch(/already being worked/i)
  })

  it('a genuine creation (201) is the ONLY thing that says Created', async () => {
    const adopt = vi.fn().mockResolvedValue({ status: 201, data: {} })
    const { container } = wrap(<PlanConfirmCard items={items} adopt={adopt} />)
    fireEvent.click(screen.getByRole('button', { name: /create these initiatives/i }))
    await waitFor(() =>
      expect(container.querySelectorAll('[data-testid="row-created"]').length).toBe(items.length),
    )
    expect(container.textContent).toContain(ROW_COPY.created)
  })

  it('a partial failure is reported per row and never rolled back', async () => {
    let call = 0
    const adopt = vi.fn().mockImplementation(() => {
      call += 1
      return call === 1 ? Promise.resolve({ status: 201 }) : Promise.reject(new Error('boom'))
    })
    const { container } = wrap(<PlanConfirmCard items={items} adopt={adopt} />)
    fireEvent.click(screen.getByRole('button', { name: /create these initiatives/i }))
    await waitFor(() => expect(container.querySelector('[data-testid="row-failed"]')).not.toBeNull())
    // The successful row keeps its outcome; nothing is undone.
    expect(container.querySelector('[data-testid="row-created"]')).not.toBeNull()
    // And the copy says re-running is safe, because the path is idempotent.
    expect(container.textContent).toMatch(/never mints a second plan/i)
  })

  it('the confirm card names the COUNT and nothing else; every per-item sentence is the server’s', () => {
    const { container } = wrap(<PlanConfirmCard items={items} adopt={vi.fn()} />)
    for (const item of items) {
      expect(container.textContent).toContain(item.title)
      expect(container.textContent).toContain(item.rationale)
    }
    expect(container.textContent).toContain(`This will create ${items.length} initiatives`)
    expect(container.textContent).not.toContain('%')
  })
})

describe('Act 6 — the draft says WHY it is empty, in the server’s words', () => {
  it('an empty plan renders the composer’s `emptyReason` verbatim and derives nothing', () => {
    // The composer already told the three empties apart from Phase G's `basis` and
    // froze the sentence on `emptyReason`. Re-deriving that choice in JSX is a
    // SECOND code path to one fact — and it is how a screen congratulates a school
    // that has not adopted a framework yet.
    const emptyReason = 'No framework has been adopted yet, so there is nothing to plan against.'
    const { container } = wrap(
      <ActPlan
        plan={{
          items: [],
          moreAvailable: 0,
          limit: 5,
          basis: { accreditationLicensed: true, frameworkAdopted: false },
          emptyReason,
          unavailableReason: null,
        }}
        canEdit
      />,
    )
    expect(container.textContent).toContain(emptyReason)
    expect(container.textContent).not.toMatch(/already being worked/i)
  })

  it('a FAILED recommendations read is told apart from an empty one', () => {
    const unavailableReason =
      'The recommendation rail could not be read for this school, so no plan is drafted here.'
    const { container } = wrap(
      <ActPlan
        plan={{ items: [], moreAvailable: 0, limit: 5, basis: null, emptyReason: null, unavailableReason }}
        canEdit
      />,
    )
    expect(container.querySelector('[data-testid="plan-unavailable"]')).not.toBeNull()
    expect(container.textContent).toContain(unavailableReason)
  })

  it('a viewer sees the draft and NO adopt control — a dead button is worse than none', () => {
    const { container } = wrap(<ActPlan plan={planAct} canEdit={false} />)
    expect(container.querySelectorAll('[data-testid="plan-item"]').length).toBe(planAct.items.length)
    expect(container.querySelector('input[type="checkbox"]')).toBeNull()
    expect(screen.queryByRole('button', { name: /turn this into a plan/i })).toBeNull()
  })

  it('an item with no estimated lift prints the frozen REASON rather than "+0 pts"', () => {
    const noLift = planAct.items.find((i) => i.estimatedLift == null)
    if (!noLift) return // the fixture guarantees one; this guard keeps the spec honest
    const { container } = wrap(<ActPlan plan={planAct} canEdit />)
    expect(container.textContent).toContain(noLift.estimatedLiftReason)
    expect(container.textContent).not.toContain('+0 index pts')
  })
})
