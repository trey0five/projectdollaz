import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync, readdirSync, statSync } from 'node:fs'
// Explicitly imported rather than taken off the global: `apps/web/src` lints
// under the browser env, where `process` is (correctly) not defined.
import process from 'node:process'
import VisitPrintFooter from './VisitPrintFooter.jsx'
import ExecutiveSummary from '../ExecutiveSummary.jsx'
import { SUMMARY_KEYS, summarySpeech, summaryDomText } from '../visitSummary.js'
import BoardReadinessOnePagerPrintPage from '../../../pages/BoardReadinessOnePagerPrintPage.jsx'
import VisitPreviewPrintPage from '../../../pages/VisitPreviewPrintPage.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// AIC PHASE H — THE PRINT HONESTY INVARIANTS (SPEC-WEB-4 / 5 / 6).
//
// Three things about a printed readiness document can go wrong in a way that
// looks completely fine in a diff, and all three have precedent in this repo:
//
//   4. THE SPOKEN SUMMARY AND THE PRINTED SUMMARY DRIFT. Phase E shipped a
//      briefing item and a rail chip that disagreed; Phase G nearly shipped a
//      recommendation quoting a different consequence than the briefing. The
//      executive summary now has FOUR consumers, and the cheapest way for two of
//      them to part company is for one to add a helpful heading or drop a
//      segment with nothing to say. So the printed DOM is compared, sentence for
//      sentence, against the exact array handed to TTS.
//
//   5. THE DISCLAIMER DISAPPEARS. Phase H found it FORKED — a server constant
//      saying "Cognia, MSA-CESS or WCEA" and a client constant saying "Cognia /
//      MSA / WCEA", both printed on the Evidence Index, one after the other. One
//      string now exists, it lives on the server, and the web declares it
//      nowhere. A repo scan keeps it that way, and the footer THROWS rather than
//      quietly rendering a document that claims accreditation purpose and
//      disclaims nothing.
//
//   6. A PRINT PAGE RENDERS AN UNENTITLED SCHOOL A DOCUMENT ANYWAY, or drops the
//      `.ui-v1` wrapper and lets the v2 typography scale reflow a paginated page.
//
// The fixture below is a hand-built `VisitResult` shaped to the landed contract
// in `packages/compliance/src/accreditation-visit.ts` (§2.2). SEAM D calls for a
// JSON copy of `packages/compliance/__tests__/fixtures.ts`, but that fixture is
// the composer's INPUT, and `@finrep/compliance` is aliased in `vite.config.ts`
// (frozen) and NOT in `vitest.config.ts` — so it cannot be imported here to
// compose the output. This fixture is therefore field-for-field against the
// interfaces, and a reviewer should check it against them.
// ─────────────────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({ getVisit: vi.fn() }))

vi.mock('../../../lib/api.js', () => ({
  accreditationApi: { getVisit: (...args) => mocks.getVisit(...args) },
  // The real predicates read an axios error shape; these read a flag the tests
  // set, so a test never has to fabricate an axios error to reach a branch.
  isModuleNotLicensed: (e) => e?.kind === 'module',
  isPaymentRequired: (e) => e?.kind === 'module' || e?.kind === 'paused',
}))

const schoolMocks = vi.hoisted(() => ({ setActiveSchool: vi.fn() }))

vi.mock('../../../context/SchoolContext.jsx', () => ({
  useSchools: () => ({
    activeSchool: { id: 'school-1', name: 'St. Example Academy' },
    schools: [
      { id: 'school-1', name: 'St. Example Academy' },
      { id: 'school-2', name: 'Holy Name Academy' },
    ],
    setActiveSchool: schoolMocks.setActiveSchool,
  }),
}))

// EntitlementPausedPanel is rendered FOR REAL (that is the point of SPEC-WEB-6),
// and it reads billing context. Only the context is stubbed.
vi.mock('../../../context/BillingContext.jsx', () => ({
  useBilling: () => ({ billing: { status: 'past_due' }, isOwner: true }),
}))

// `globals: false` means testing-library's automatic cleanup is never registered.
afterEach(cleanup)

// The server's READINESS_DISCLAIMER, character for character. It appears in this
// file BECAUSE the scan below forbids it everywhere else under apps/web/src.
const DISCLAIMER =
  "Self-assessment produced by KYRO from school-entered and integrated data. Not an accreditation product; not affiliated with, endorsed by, or a submission to Cognia, MSA-CESS or WCEA. The accreditor's portal remains the authoritative repository."

const SEGMENTS = [
  { key: 'opening', text: 'St. Example Academy is preparing under Cognia.' },
  { key: 'strengths', text: 'Two standards are defensible on all three tests.' },
  { key: 'findings', text: 'Three findings would likely be raised.' },
  { key: 'evidence', text: 'Nine of twelve required artifacts are current.' },
  { key: 'unanswered', text: 'Four named holes remain in what we can see.' },
  { key: 'plan', text: 'Two commitments are drafted and none is yet owned.' },
]

const basis = (over) => ({
  key: 'gov.policy_review_age',
  label: 'Oldest policy review',
  value: 1461,
  display: '4 years',
  asOf: '2026-06-30',
  lineage: null,
  ...over,
})

const finding = (over) => ({
  ruleId: 'ACC-POLICY-STALE',
  scopeKey: 'standard:s1',
  findingKey: 'ACC-POLICY-STALE:standard:s1',
  title: 'The policy register has not been reviewed',
  rationale: 'The oldest policy on the register was last reviewed four years ago.',
  consequence: 'A visiting team would read the policy register as unmaintained.',
  evidence: [basis()],
  basis: [basis()],
  standardTags: ['COG-1'],
  alsoServes: [],
  domainKeys: ['governance'],
  severity: 'critical',
  likelihood: 'likely',
  confidence: 'medium',
  horizon: 'now',
  initiativeId: null,
  findingCleared: false,
  worked: false,
  ...over,
})

const signal = (over) => ({
  key: 'fin.operating_margin',
  label: 'Operating margin',
  availability: 'available',
  unavailableReason: null,
  reasonText: null,
  moduleKey: null,
  observedOn: '2026-06-30',
  ageDays: 31,
  changeState: 'steady',
  domainKeys: ['finance'],
  ...over,
})

const NO_REASON_GIVEN =
  'This signal could not be read, and the collector recorded no reason.'

function visitFixture(over = {}) {
  return {
    version: '1.0.0',
    generatedAt: '2026-07-31T12:00:00.000Z',
    framework: { code: 'COGNIA', name: 'Cognia' },
    demoData: false,
    snapshotAsOf: '2026-06-30',
    disclaimer: DISCLAIMER,
    executiveSummary: { segments: SEGMENTS, allowedNumerals: [] },
    acts: {
      arrival: {
        frameworkLabel: 'Cognia',
        documented: 62,
        defensible: 41,
        readinessPct: 55,
        projectedIndex: 283,
        band: 'Approaching',
        confidence: {
          coveragePct: 50,
          measuredDomains: 5,
          caveat: 'Five of ten domains carry enough scored standards to band.',
        },
        asOfLine: 'Figures are read from the snapshot recorded on June 30, 2026.',
        evaluableLine: 'Thirty-one of thirty-six rules could be evaluated.',
        demoData: false,
        unavailableReason: null,
      },
      commendations: {
        commendations: [
          {
            standardId: 's9',
            code: 'COG-9',
            title: 'Financial resources support the program',
            rubricScore: 3,
            rubricLabel: 'Improving',
            evidence: [{ tag: 'audit', label: 'Independent audit', expiresOn: null }],
            signals: [
              { key: 'fin.days_cash', label: 'Days cash', formattedValue: '84 days', asOf: '2026-06-30' },
            ],
            strength: 0.82,
            narrative: 'A strong self-score, a current audit and a favorable cash position.',
          },
        ],
        exclusions: {
          eligible: 1,
          noScore: 12,
          lowScore: 4,
          noRequirements: 20,
          noCurrentEvidence: 3,
          noFavorableSignal: 2,
        },
        caveat: 'Strengths we can defend: all three tests. 1 of 42 standards qualify.',
        signalsUnavailable: null,
        unavailableReason: null,
      },
      findings: {
        groups: [
          { code: 'COG-1', worstSeverity: 'critical', findings: [finding()] },
          {
            code: 'COG-3',
            worstSeverity: 'warn',
            findings: [
              finding({
                findingKey: 'FIN-MARGIN:standard:s3',
                ruleId: 'FIN-MARGIN',
                title: 'Operating margin has fallen in each of three years',
                consequence: 'A visiting team would question financial sustainability.',
                standardTags: ['COG-3', 'COG-7'],
                alsoServes: ['COG-7'],
                severity: 'warn',
                worked: true,
                initiativeId: 'init-1',
                evidence: [basis({ key: 'fin.operating_margin', label: 'Operating margin', display: '-3.2%' })],
                basis: [basis({ key: 'fin.operating_margin', label: 'Operating margin', display: '-3.2%' })],
              }),
            ],
          },
        ],
        schoolLevel: [
          finding({
            findingKey: 'ACC-UNSCORED:school',
            ruleId: 'ACC-UNSCORED',
            scopeKey: 'school',
            title: 'Standards carry no rubric score',
            consequence: 'A visiting team would have nothing current to read.',
            standardTags: [],
            severity: 'info',
          }),
        ],
        schoolLevelNote:
          'This finding is not scoped to a single standard. A visiting team would raise it with the head of school rather than under a standard code.',
        severityCounts: { critical: 1, warn: 1, info: 1, total: 3 },
        standardCount: 2,
      },
      requests: {
        indexRoute: '/accreditation/evidence/print',
        groups: [],
        health: { evidenceHealthPct: 75, basis: '9 of 12 required artifacts are current.' },
        counts: {
          artifacts: 12,
          artifactsTracked: 9,
          requirements: 12,
          requiredTracked: 9,
          standardsWithRequirements: 8,
          standardsLegacy: 34,
        },
        unavailableReason: null,
      },
      unanswered: {
        namedHoles: [
          {
            ruleId: 'ACC-NO-PRIOR-VISIT',
            intake: 'Add your last visiting-team report',
            copy: 'We cannot see your prior visit findings, so nothing is checked against them.',
          },
          {
            ruleId: 'ACC-NO-SURVEY',
            intake: 'Add a stakeholder survey',
            copy: 'No stakeholder perception data is tracked in KYRO.',
          },
        ],
        signalRows: {
          available: [signal()],
          notLicensed: [
            signal({
              key: 'hr.student_teacher_ratio',
              label: 'Student-teacher ratio',
              availability: 'not_licensed',
              unavailableReason: 'The HR module is not on this plan.',
              reasonText: 'The HR module is not on this plan.',
              moduleKey: 'hr',
              observedOn: null,
            }),
          ],
          noData: [
            signal({
              key: 'enr.retention',
              label: 'Retention rate',
              availability: 'no_data',
              // NULL reason, non-null reasonText: the composer's guarantee that a
              // roster row is never printed blank. Rendering `unavailableReason`
              // here instead of `reasonText` would print an empty cell.
              unavailableReason: null,
              reasonText: NO_REASON_GIVEN,
              observedOn: null,
            }),
          ],
          notTracked: [
            signal({
              key: 'fac.deferred_maintenance',
              label: 'Deferred maintenance',
              availability: 'not_tracked',
              unavailableReason: 'Nothing in KYRO tracks this yet.',
              reasonText: 'Nothing in KYRO tracks this yet.',
              observedOn: null,
            }),
          ],
        },
        rosterCounts: { available: 1, notLicensed: 1, noData: 1, notTracked: 1, total: 4 },
        rules: [
          {
            ruleId: 'FIN-BUDGET-DETERIORATING',
            title: 'Budget deterioration across years',
            reason: 'signal_no_data',
            blockingSignalKey: 'fin.operating_margin',
            blockingSignalLabel: 'Operating margin',
            message: 'Two annual readings are needed and only one is on file.',
            moduleKey: null,
            unlock: null,
          },
        ],
        signalsUnavailable: null,
        upsell: [{ moduleKey: 'hr', ruleIds: ['HR-RATIO'] }],
        unlockableByYears: {
          signalKey: 'fin.operating_margin',
          ruleIds: ['FIN-BUDGET-DETERIORATING'],
          yearsNeeded: 2,
          fyLabels: ['FY2023–24', 'FY2022–23'],
        },
      },
      plan: {
        items: [
          {
            templateId: 'raise_rubric_with_evidence',
            originType: 'gap',
            originRef: 's1',
            findingKey: null,
            title: 'Attach current evidence to COG-1 and re-score it',
            rationale: 'COG-1 is self-scored at 2 with no current artifact attached.',
            suggestedOwnerRole: 'accreditation_lead',
            suggestedMetricKey: null,
            suggestedTargetRubricScore: 3,
            estimatedLift: { points: 4, basis: 'one leaf of forty-two' },
            estimatedLiftReason: null,
            standardTags: ['COG-1'],
          },
        ],
        moreAvailable: 3,
        limit: 5,
        basis: { accreditationLicensed: true, frameworkAdopted: true },
        emptyReason: null,
        unavailableReason: null,
      },
    },
    ...over,
  }
}

const wrap = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>)

beforeEach(() => {
  // jsdom does not implement window.print, and the pages fire it on a 400ms
  // timer once data is ready. Stubbed rather than fake-timed so nothing else in
  // the render path has to care.
  window.print = vi.fn()
  mocks.getVisit.mockImplementation(() => Promise.resolve({ data: visitFixture() }))
})

// ─────────────────────────────────────────────────────────────────────────────
// SPEC-WEB-4 — ACCEPTANCE 3. The spoken executive summary and the printed one
// are provably the same content.
// ─────────────────────────────────────────────────────────────────────────────
describe('SPEC-WEB-4 — the spoken summary and the printed summary are the same sentences', () => {
  it('the print component renders exactly the array handed to TTS, in order', () => {
    const { container } = wrap(<ExecutiveSummary segments={SEGMENTS} variant="print" />)
    expect(summaryDomText(container)).toEqual(summarySpeech(SEGMENTS))
  })

  it('the ONE-PAGER PAGE prints exactly the array handed to TTS — no sentence added, none dropped', async () => {
    // The page-level assertion is the one that matters: a page is free to render
    // its own <p> beside <ExecutiveSummary>, and the component-level test above
    // would never notice. `summaryDomText` reads only the segment paragraphs, so
    // a hard-coded line INSIDE the summary shows up as an extra entry and a
    // dropped segment shows up as a missing one.
    const { container } = wrap(<BoardReadinessOnePagerPrintPage />)
    await screen.findByTestId('board-one-pager')
    expect(summaryDomText(container)).toEqual(summarySpeech(SEGMENTS))
    expect(summaryDomText(container)).toHaveLength(6)
  })

  it('all six segment keys are printed, in SUMMARY_KEYS order', async () => {
    const { container } = wrap(<BoardReadinessOnePagerPrintPage />)
    await screen.findByTestId('board-one-pager')
    const keys = [...container.querySelectorAll('[data-summary-segment]')].map((el) =>
      el.getAttribute('data-summary-segment'),
    )
    expect(keys).toEqual([...SUMMARY_KEYS])
  })

  it('IS NOT VACUOUS: an UNTAGGED extra line inside the summary makes the comparison fail', () => {
    // THE RED PROOF, and it is deliberately a plain <p> with NO
    // `data-summary-segment`. The first cut of this case added the attribute,
    // which meant it only proved the comparison could catch drift that
    // volunteered to be caught: `summaryDomText` collected tagged nodes only, so
    // inserting exactly this paragraph into ExecutiveSummary's segment container
    // left the whole suite green while the printed one-pager rendered SEVEN
    // sentences and the narration player spoke SIX. That is acceptance 3 broken
    // with its own spec passing.
    function DriftedSummary({ segments }) {
      return (
        <div data-testid="executive-summary">
          <p className="text-[11.5px]">The board should act on this immediately.</p>
          {segments.map((s) => (
            <p key={s.key} data-summary-segment={s.key}>
              {s.text}
            </p>
          ))}
        </div>
      )
    }
    const { container } = wrap(<DriftedSummary segments={SEGMENTS} />)
    expect(summaryDomText(container)).not.toEqual(summarySpeech(SEGMENTS))
    expect(summaryDomText(container)).toHaveLength(7)
  })

  it('IS NOT VACUOUS: a tagged extra line still makes the comparison fail', () => {
    function DriftedSummary({ segments }) {
      return (
        <div>
          <ExecutiveSummary segments={segments} variant="print" />
          <p data-summary-segment="extra">The board should act on this immediately.</p>
        </div>
      )
    }
    const { container } = wrap(<DriftedSummary segments={SEGMENTS} />)
    // Scoped to the summary section, so the stray line outside it is invisible —
    // and that is correct: a page may render its own paragraphs BESIDE the
    // summary. What it may not do is add one INSIDE it, which the case above
    // covers. The tagged line is still caught if it lands inside.
    const inside = container.querySelector('[data-testid="executive-summary"]')
    inside.appendChild(container.querySelector('[data-summary-segment="extra"]'))
    expect(summaryDomText(container)).not.toEqual(summarySpeech(SEGMENTS))
  })

  it('IS NOT VACUOUS: one dropped segment makes the comparison fail', () => {
    const { container } = wrap(<ExecutiveSummary segments={SEGMENTS.slice(0, 5)} variant="print" />)
    expect(summaryDomText(container)).not.toEqual(summarySpeech(SEGMENTS))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SPEC-WEB-5 — ACCEPTANCE 9. One disclaimer string exists in the product, and
// every print surface renders it.
// ─────────────────────────────────────────────────────────────────────────────
describe('SPEC-WEB-5 — the non-affiliation footer', () => {
  it('renders the disclaimer prop VERBATIM', () => {
    const { container } = wrap(
      <VisitPrintFooter disclaimer={DISCLAIMER} generatedAt="2026-07-31T12:00:00.000Z" />,
    )
    expect(screen.getByTestId('visit-print-disclaimer').textContent).toBe(DISCLAIMER)
    expect(container.textContent).toContain('Generated Jul 31, 2026')
  })

  it('is NEVER `no-print` — the whole point is that it survives window.print()', () => {
    const { container } = wrap(<VisitPrintFooter disclaimer={DISCLAIMER} />)
    expect(container.querySelector('.no-print')).toBeNull()
    const footer = screen.getByTestId('visit-print-footer')
    expect(footer.className).not.toContain('no-print')
    expect(footer.className).not.toContain('print:hidden')
  })

  it('says so when the payload is demonstration data', () => {
    const { container } = wrap(
      <VisitPrintFooter disclaimer={DISCLAIMER} generatedAt="2026-07-31" demoData />,
    )
    expect(container.textContent).toContain('demonstration data')
  })

  it('THROWS on a missing or empty disclaimer rather than rendering silently', () => {
    // `return null` here would mean a print page whose disclaimer prop resolved
    // to undefined published an undisclaimed accreditation document and looked
    // completely fine doing it.
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => wrap(<VisitPrintFooter disclaimer={undefined} />)).toThrow(/disclaimer/i)
    cleanup()
    expect(() => wrap(<VisitPrintFooter disclaimer="   " />)).toThrow(/disclaimer/i)
    quiet.mockRestore()
  })

  it('the sentence is declared NOWHERE in apps/web/src', () => {
    // §0.4: the disclaimer was forked because the web had its own copy of it. One
    // string now exists and it lives on the server; every print surface renders
    // the payload field. Re-adding a constant anywhere under apps/web/src — a
    // component, a meta file, a "temporary" fallback — turns this red.
    // `import.meta.url` under the vite transform is a served path, not a file
    // URL, so the roots are taken from the runner's cwd (always `apps/web`).
    const root = `${process.cwd()}/src`
    const self = `${root}/components/accreditation/print/visit-print.spec.jsx`
    const FRAGMENTS = [
      'Self-assessment produced by KYRO',
      'not affiliated with, endorsed by',
      'remains the authoritative repository',
    ]
    const offenders = []
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const full = `${dir}/${name}`
        if (statSync(full).isDirectory()) {
          walk(full)
          continue
        }
        if (!/\.(js|jsx|ts|tsx)$/.test(name)) continue
        if (full === self) continue // this spec quotes it in order to forbid it
        const src = readFileSync(full, 'utf8')
        if (FRAGMENTS.some((f) => src.includes(f))) offenders.push(full)
      }
    }
    walk(root)
    expect(offenders).toEqual([])
  })

  it('all four accreditation print surfaces render the SHARED footer component', () => {
    // Source-reading, deliberately. Mounting GovernanceReportPrintPage would drag
    // in the governance payload, its context stack and a second fetch layer, and
    // a spec that fragile gets deleted the first time it goes red for an
    // unrelated reason. What matters here is that no page kept a footer of its
    // own — which is how GovernanceReportPrintPage came to claim accreditation
    // purpose while disclaiming nothing.
    const pages = `${process.cwd()}/src/pages/`
    for (const file of [
      'BoardReadinessOnePagerPrintPage.jsx',
      'VisitPreviewPrintPage.jsx',
      'EvidenceIndexPrintPage.jsx',
      'GovernanceReportPrintPage.jsx',
    ]) {
      const src = readFileSync(`${pages}${file}`, 'utf8')
      expect(src, file).toContain('VisitPrintFooter')
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SPEC-WEB-6 — ACCEPTANCE 4. Print pages render with `.ui-v1` and 402 panels for
// unlicensed modules. Plus acceptance 5 and the Act-5 / disclaimer obligations
// that are specific to these two pages.
// ─────────────────────────────────────────────────────────────────────────────
const PAGES = [
  { name: 'Board Readiness One-Pager', Page: BoardReadinessOnePagerPrintPage, testId: 'board-one-pager' },
  { name: 'Visiting-Team Preview', Page: VisitPreviewPrintPage, testId: 'visit-preview' },
]

describe('SPEC-WEB-6 — both new print pages', () => {
  for (const { name, Page, testId } of PAGES) {
    it(`${name} wraps the document in .ui-v1`, async () => {
      const { container } = wrap(<Page />)
      const doc = await screen.findByTestId(testId)
      expect(doc.className).toContain('ui-v1')
      expect(container.querySelector('.ui-v1')).not.toBeNull()
    })

    it(`${name} renders the module panel on MODULE_NOT_LICENSED, and no document`, async () => {
      mocks.getVisit.mockImplementation(() => Promise.reject({ kind: 'module' }))
      const { container } = wrap(<Page />)
      await screen.findByText(/Accreditation isn't on your plan yet/i)
      expect(container.querySelector(`[data-testid="${testId}"]`)).toBeNull()
      expect(container.querySelector('.ui-v1')).toBeNull()
    })

    it(`${name} renders EntitlementPausedPanel on a plain 402, and no document`, async () => {
      mocks.getVisit.mockImplementation(() => Promise.reject({ kind: 'paused' }))
      const { container } = wrap(<Page />)
      // The real panel — its paused copy, not the module copy.
      await screen.findByRole('heading', { name: /Insights are paused/i })
      await screen.findByRole('link', { name: /subscribe|billing/i })
      expect(container.querySelector(`[data-testid="${testId}"]`)).toBeNull()
    })

    it(`${name} prints the server's disclaimer and never invents one`, async () => {
      const { container } = wrap(<Page />)
      await screen.findByTestId(testId)
      expect(screen.getByTestId('visit-print-disclaimer').textContent).toBe(DISCLAIMER)
      expect(container.textContent).toContain(DISCLAIMER)
    })

    it(`${name} refuses to publish a document whose payload carried no disclaimer`, async () => {
      mocks.getVisit.mockImplementation(() =>
        Promise.resolve({ data: visitFixture({ disclaimer: '' }) }),
      )
      const { container } = wrap(<Page />)
      await screen.findByText(/readiness disclaimer was missing/i)
      expect(container.querySelector(`[data-testid="${testId}"]`)).toBeNull()
      // And it must not have opened the print dialog on the un-rendered page.
      await waitFor(() => expect(window.print).not.toHaveBeenCalled())
    })

    it(`${name} honours prefers-reduced-motion by having no motion to reduce`, async () => {
      // Acceptance 5. These are paper: no framer-motion, no transform, and above
      // all no zero-opacity/zero-height initial state that a reduced-motion user
      // (or a print driver) would capture mid-animation.
      wrap(<Page />)
      const doc = await screen.findByTestId(testId)
      expect(doc.querySelector('[style*="opacity: 0"]')).toBeNull()
      expect(doc.querySelector('[style*="transform"]')).toBeNull()
    })
  }

  it('the one-pager states no percentage anywhere in its findings section (acceptance 2)', async () => {
    // Phase E's likelihood is an ordinal WORD. Converting it to a number is a
    // one-line change that reads as an improvement, and a board reading "72%
    // likely" would be reading a fabricated statistic wearing the engine's
    // authority. The one-pager prints WHAT and SO WHAT; the evidence — which
    // legitimately carries figures — lives on the visiting-team preview.
    const { container } = wrap(<BoardReadinessOnePagerPrintPage />)
    await screen.findByTestId('board-one-pager')
    const heads = [...container.querySelectorAll('h2')]
    const findingsHead = heads.find((h) => /would likely find/i.test(h.textContent))
    expect(findingsHead).toBeTruthy()
    // The BODY of the section, not the section: the heading itself contains the
    // word "likely" by design, and asserting over it would be asserting nothing.
    const body = findingsHead.nextElementSibling
    expect(body).toBeTruthy()
    expect(body.textContent).not.toContain('%')
    expect(body.textContent).not.toMatch(/\b(likely|possible)\b/i)
  })

  // ── The one-pager's SUBJECT is the link's, never the reader's scope ─────────
  // The scheduled board email links here with `?school=<id>`. Unqualified, this
  // page resolved its subject purely from the reader's persisted scope, so a
  // diocesan member of A and B, scoped to A, could open B's email and be handed
  // A's readiness document — valid-looking, disclaimed, correctly footered, and
  // about the wrong tenant, stating different numbers from the email that carried
  // it. The only tell was the school name in the header.
  describe('the one-pager refuses to resolve to a school the link did not ask for', () => {
    const atSchool = (id) =>
      render(
        <MemoryRouter initialEntries={[`/accreditation/board/print?school=${id}`]}>
          <BoardReadinessOnePagerPrintPage />
        </MemoryRouter>,
      )

    it('renders NO document when ?school= names a different school', async () => {
      const { container } = atSchool('school-2')
      await screen.findByTestId('board-one-pager-wrong-school')
      expect(container.querySelector('[data-testid="board-one-pager"]')).toBeNull()
      // It names the school the document was prepared for, so the reader knows
      // which one they are being kept away from.
      expect(container.textContent).toContain('Holy Name Academy')
      // It did not even ask the server for the wrong school's payload…
      expect(mocks.getVisit).not.toHaveBeenCalled()
      // …and it did not open the print dialog on a page with no document.
      await waitFor(() => expect(window.print).not.toHaveBeenCalled())
    })

    it('offers the switch rather than silently changing the reader’s scope', async () => {
      atSchool('school-2')
      await screen.findByTestId('board-one-pager-wrong-school')
      // Nothing has been mutated just by opening the link.
      expect(schoolMocks.setActiveSchool).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: /switch to holy name academy/i }))
      expect(schoolMocks.setActiveSchool).toHaveBeenCalledWith('school-2')
    })

    it('renders the document normally when ?school= MATCHES the active school', async () => {
      const { container } = atSchool('school-1')
      await screen.findByTestId('board-one-pager')
      expect(container.querySelector('[data-testid="board-one-pager-wrong-school"]')).toBeNull()
      expect(summaryDomText(container)).toEqual(summarySpeech(SEGMENTS))
    })

    it('with NO ?school= it behaves exactly as it did before — active school', async () => {
      const { container } = wrap(<BoardReadinessOnePagerPrintPage />)
      await screen.findByTestId('board-one-pager')
      expect(container.querySelector('[data-testid="board-one-pager-wrong-school"]')).toBeNull()
    })
  })

  it('the visiting-team preview prints the disclaimer TWICE — header and footer', async () => {
    const { container } = wrap(<VisitPreviewPrintPage />)
    await screen.findByTestId('visit-preview')
    expect(screen.getByTestId('visit-preview-header-disclaimer').textContent).toBe(DISCLAIMER)
    const hits = container.textContent.split(DISCLAIMER).length - 1
    expect(hits).toBe(2)
  })

  it('the visiting-team preview prints every basis row with its value AND its date', async () => {
    // Acceptance 1, on paper. On screen a basis deep-links; here it carries its
    // rendered value and the date it was observed, because a finding a visiting
    // team can read but not trace is an assertion.
    const { container } = wrap(<VisitPreviewPrintPage />)
    await screen.findByTestId('visit-preview')
    expect(container.textContent).toContain('Oldest policy review')
    expect(container.textContent).toContain('4 years')
    expect(container.textContent).toContain('Jun 30, 2026')
    expect(container.textContent).toContain('-3.2%')
  })

  it('ACT 5 PRINTS IN FULL — open, untruncated, every row with its own reason (acceptance 6)', async () => {
    // This act will be proposed for cutting in review. It is what makes Acts 3
    // and 6 believable, and every unmeasured domain on it is a module or an
    // intake we can sell. A build that renders it collapsed, behind a tab, or
    // with the roster truncated fails acceptance — so all three sources are
    // asserted present, and so is the absence of a <details> wrapper.
    const { container } = wrap(<VisitPreviewPrintPage />)
    await screen.findByTestId('visit-preview')
    const act5 = screen.getByTestId('visit-preview-unanswered')
    // 1. the named holes, with the intake that closes each
    expect(act5.textContent).toContain('ACC-NO-PRIOR-VISIT')
    expect(act5.textContent).toContain('Add your last visiting-team report')
    expect(act5.textContent).toContain('No stakeholder perception data is tracked in KYRO.')
    // 2. every roster partition, every row, each reason in its OWN words
    for (const label of [
      'Operating margin',
      'Student-teacher ratio',
      'Retention rate',
      'Deferred maintenance',
    ]) {
      expect(act5.textContent, label).toContain(label)
    }
    expect(act5.textContent).toContain('The HR module is not on this plan.')
    expect(act5.textContent).toContain('Nothing in KYRO tracks this yet.')
    // A row whose collector gave no reason renders the frozen fallback, NEVER a
    // blank cell — and it must read `reasonText`, not `unavailableReason`.
    expect(act5.textContent).toContain(NO_REASON_GIVEN)
    // 3. the rules that could not run, each naming its blocking signal
    expect(act5.textContent).toContain('Budget deterioration across years')
    expect(act5.textContent).toContain('Two annual readings are needed and only one is on file.')
    // and no collapse of any kind
    expect(container.querySelector('details')).toBeNull()
    expect(act5.textContent).not.toMatch(/show more|see all|\+\d+ more/i)
  })

  it('the preview prints the composer’s frozen sentence when the plan is empty', async () => {
    const empty = visitFixture()
    empty.acts.plan = {
      items: [],
      moreAvailable: 0,
      limit: 5,
      basis: { accreditationLicensed: true, frameworkAdopted: false },
      emptyReason: 'No framework has been adopted yet, so there is nothing to plan against.',
      unavailableReason: null,
    }
    mocks.getVisit.mockImplementation(() => Promise.resolve({ data: empty }))
    const { container } = wrap(<VisitPreviewPrintPage />)
    await screen.findByTestId('visit-preview')
    expect(container.textContent).toContain(
      'No framework has been adopted yet, so there is nothing to plan against.',
    )
    // NEVER the good-news sentence for a bad-news state. (Scoped to the plan's
    // own frozen wording — "already being worked" also appears, correctly, as
    // the Phase-G back-link badge on a finding card.)
    expect(container.textContent).not.toContain(
      'Every gap, unmet assurance and open finding we can act on is already being worked.',
    )
  })
})
