import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ReadinessHero from '../accreditation/ReadinessHero.jsx'
import InitiativeDrawer from './InitiativeDrawer.jsx'
import InitiativeList from './InitiativeList.jsx'
import ProgressSparkline from './ProgressSparkline.jsx'
import RecommendationRail from './RecommendationRail.jsx'
import {
  ADOPT_KEYS,
  CREATE_KEYS,
  PATCH_KEYS,
  adoptBody,
  buildImprovementFlow,
  createBody,
  isAdoption,
  measurementPatch,
  milestonesFromLines,
  milestonesWithToggle,
} from './improvementFlow.jsx'
import {
  seedFromDeepLink,
  seedFromRecommendation,
  matchOwnerId,
  pctLabel,
} from './improvementMeta.js'
import { NAV_GROUPS } from '../nav/sidebarNav.js'
import { V2_NAV } from '../nav/AppShell.jsx'
import { MODULE_ANATOMY } from '../module/moduleAnatomy.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC PHASE G — THE WEB HONESTY INVARIANTS.
//
// Phase G's worst failure mode is not a crash: it is a PROJECTION quietly
// becoming the headline. The API side is pinned by a differential spec that runs
// getReadiness twice and asserts the whole payload is byte-identical apart from
// the advisory keys — but a correct API and a careless JSX file part company at
// exactly one line, and until this file existed nothing failed when they did.
//
// Four families here, each guarding one thing the diff would look fine doing:
//   1. the readiness hero renders the REAL index as the headline;
//   2. a status-only initiative reports status only — never "0%";
//   3. riskSignal (computed) and riskLevel (human) are two chips, never merged;
//   4. the seeded flow can only ever POST keys its endpoint whitelists.
//
// CountUp animates from 0 via requestAnimationFrame, which no jsdom test flushes,
// so the headline would read "0" here for reasons that have nothing to do with
// correctness. Reduced motion makes it render its final value synchronously — and
// mocking only that hook keeps every real `motion.*` element intact.
// ─────────────────────────────────────────────────────────────────────────────
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useReducedMotion: () => true }
})

afterEach(cleanup)

const wrap = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>)

const FRAMEWORK = {
  name: 'Cognia',
  indexMin: 100,
  indexMax: 400,
  defaultTarget: 320,
  statusBands: [
    { min: 100, label: 'Below accreditation threshold' },
    { min: 280, label: 'Accredited' },
    { min: 320, label: 'Accredited with Merit' },
  ],
}

// The two numbers are FORTY POINTS APART on purpose: any leak of the projection
// into the headline is then unmistakable rather than a rounding argument.
const READINESS = {
  framework: FRAMEWORK,
  projectedIndex: 260,
  band: 'Below accreditation threshold',
  selfScoredPct: 0.52,
  verifiedPct: 0.31,
  scoredCount: 11,
  coveredCount: 6,
  leafCount: 20,
  confidence: null,
  assurances: [],
  target: { index: 320, bandLabel: 'Accredited with Merit', pointGap: 60, stepsToTarget: 4 },
  gaps: [
    {
      standardId: 'std-1',
      code: 'COG-1.1',
      title: 'Leadership capacity',
      evidenceGap: false,
      nextStepLift: 1.2,
      fullLift: 3.6,
      work: {
        initiativeCount: 2,
        initiativeIds: ['i1', 'i2'],
        nearestDueDate: '2026-09-30',
        targetRubricScore: 3,
      },
    },
  ],
  inFlight: {
    expectedIndexIfDelivered: 300,
    expectedBandIfDelivered: 'Accredited',
    expectedByDate: '2026-09-30',
    basis: '2 initiatives counted, each with a target rubric score and a due date.',
    counted: 2,
    excluded: { noTargetScore: 3, noDueDate: 1 },
  },
}

describe('the PROJECTION never becomes the headline', () => {
  it('the headline index node renders projectedIndex, not expectedIndexIfDelivered', () => {
    wrap(<ReadinessHero readiness={READINESS} adopted />)
    expect(screen.getByTestId('projected-index').textContent).toBe('260')
    expect(screen.getByTestId('projected-index').textContent).not.toBe('300')
  })

  it('the band label is the REAL band, never expectedBandIfDelivered', () => {
    wrap(<ReadinessHero readiness={READINESS} adopted />)
    const band = screen.getByTestId('band-label').textContent
    expect(band).toContain('Below accreditation threshold')
    expect(band).not.toContain('Accredited with')
    expect(band).not.toBe('Accredited')
  })

  it('the marker carries the literal string PROJECTION', () => {
    const { container } = wrap(<ReadinessHero readiness={READINESS} adopted />)
    expect(screen.getByTestId('projection-marker')).toBeTruthy()
    expect(container.textContent).toContain('PROJECTION')
  })

  it('states the projection as a conditional sentence, arrow and all', () => {
    wrap(<ReadinessHero readiness={READINESS} adopted />)
    const sentence = screen.getByTestId('inflight-sentence').textContent
    expect(sentence).toContain('→')
    expect(sentence).toContain('300')
    expect(sentence).toMatch(/if delivered/i)
  })

  it('renders NO marker and NO → sentence when there is nothing in flight', () => {
    const { container } = wrap(
      <ReadinessHero
        readiness={{ ...READINESS, inFlight: null, gaps: [{ ...READINESS.gaps[0], work: undefined }] }}
        adopted
      />,
    )
    expect(screen.queryByTestId('projection-marker')).toBeNull()
    expect(screen.queryByTestId('inflight-sentence')).toBeNull()
    expect(container.textContent).not.toContain('PROJECTION')
    expect(container.textContent).not.toContain('→')
    // …and the headline is untouched by the absence.
    expect(screen.getByTestId('projected-index').textContent).toBe('260')
  })

  it('names the excluded counts AND the reason each was left out (acceptance 6)', () => {
    wrap(<ReadinessHero readiness={READINESS} adopted />)
    const excluded = screen.getByTestId('inflight-excluded').textContent
    expect(excluded).toContain('3')
    expect(excluded).toMatch(/no target rubric score/i)
    expect(excluded).toContain('1')
    expect(excluded).toMatch(/no due date/i)
  })

  it('renders the exclusion counts even when NOTHING could be projected', () => {
    // Every in-flight initiative excluded → no projection at all. The counts are
    // exactly what explains the silence, so they must survive that branch.
    wrap(
      <ReadinessHero
        readiness={{
          ...READINESS,
          inFlight: {
            expectedIndexIfDelivered: null,
            expectedBandIfDelivered: null,
            expectedByDate: null,
            basis: 'No in-flight initiative carries both a target score and a due date.',
            counted: 0,
            excluded: { noTargetScore: 4, noDueDate: 2 },
          },
        }}
        adopted
      />,
    )
    expect(screen.queryByTestId('projection-marker')).toBeNull()
    expect(screen.getByTestId('inflight-excluded').textContent).toMatch(/4/)
  })

  it('shows work already pointed at a gap as a COUNT, leaving the gap’s own lift alone', () => {
    const { container } = wrap(<ReadinessHero readiness={READINESS} adopted />)
    expect(container.textContent).toContain('2 in flight')
    // The lift figures still come from the gap itself, unmoved by the work.
    expect(container.textContent).toContain('+3.6 pts')
  })
})

describe('a status-only initiative reports status only — never 0%', () => {
  // The back-compat contract: progressSource === null is the legacy shape, and a
  // legacy row must render EXACTLY as it did before Phase G.
  const LEGACY = {
    id: 'legacy-1',
    title: 'Refresh the crisis plan',
    status: 'in_progress',
    originType: 'manual',
    originRef: null,
    findingKey: null,
    goalId: null,
    goalTitle: null,
    pillarName: null,
    owner: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    lastProgressAt: null,
    metricKey: null,
    metricLabel: null,
    unit: null,
    baseline: null,
    current: null,
    target: null,
    formattedBaseline: null,
    formattedCurrent: null,
    formattedTarget: null,
    targetRubricScore: null,
    milestones: null,
    linkedTaskCounts: null,
    trend: [],
    progressSource: null,
    progressPct: null,
    progressBasis: 'Status only',
    expectedPct: null,
    paceStatus: 'no_data',
    overshoot: false,
    riskSignal: 'none',
    riskLevel: null,
    riskNote: null,
    projectedCompletionDate: null,
    projectionReason: 'This initiative reports status only, so nothing can be projected.',
    countsTowardRollup: false,
  }

  it('the drawer says "Status only" and renders no percentage at all', () => {
    const { container } = wrap(<InitiativeDrawer initiative={LEGACY} onClose={() => {}} />)
    expect(screen.getByTestId('status-only').textContent).toContain('Status only')
    expect(screen.queryByTestId('progress-pct')).toBeNull()
    expect(container.textContent).not.toContain('%')
  })

  it('the register row says "Status only" rather than 0%', () => {
    const { container } = wrap(<InitiativeList initiatives={[LEGACY]} />)
    expect(container.textContent).toContain('Status only')
    expect(container.textContent).not.toContain('0%')
    expect(container.textContent).not.toContain('%')
  })

  it('pctLabel maps null to null — the one place a zero could be substituted', () => {
    expect(pctLabel(null)).toBeNull()
    expect(pctLabel(undefined)).toBeNull()
    expect(pctLabel(0)).toBe('0%') // a MEASURED zero is a real fact and still prints
  })

  it('prints the server’s literal refusal instead of inventing a completion date', () => {
    wrap(<InitiativeDrawer initiative={LEGACY} onClose={() => {}} />)
    expect(screen.queryByTestId('projection')).toBeNull()
    expect(screen.getByTestId('projection-reason').textContent).toBe(LEGACY.projectionReason)
  })

  it('a manual-source row still never shows a projected date, only the reason', () => {
    const manual = {
      ...LEGACY,
      progressSource: 'manual',
      progressPct: 0.25,
      progressBasis: 'Hand-set percentage',
      countsTowardRollup: false,
      projectedCompletionDate: null,
      projectionReason:
        'A hand-set percentage is not an observation, so no completion date can be projected.',
    }
    wrap(<InitiativeDrawer initiative={manual} onClose={() => {}} />)
    expect(screen.queryByTestId('projection')).toBeNull()
    expect(screen.getByTestId('projection-reason').textContent).toBe(manual.projectionReason)
    expect(screen.getByTestId('progress-pct').textContent).toBe('25%')
  })
})

describe('riskSignal (computed) and riskLevel (human) are TWO fields, never merged', () => {
  const base = {
    id: 'i-1',
    title: 'Raise COG-2.3',
    status: 'in_progress',
    originType: 'gap',
    originRef: 'std-2',
    findingKey: null,
    goalId: null,
    owner: { userId: 'u1', name: 'Jo Ruiz' },
    dueDate: '2026-06-01',
    trend: [],
    milestones: null,
    progressSource: 'metric',
    progressPct: 0.3,
    progressBasis: 'Measured: Operating margin',
    expectedPct: 0.7,
    paceStatus: 'behind',
    overshoot: false,
    riskSignal: 'behind',
    riskLevel: 'low',
    riskNote: 'The board thinks this is fine.',
    projectedCompletionDate: null,
    projectionReason: 'Only 1 observation recorded; two are needed to project.',
    countsTowardRollup: true,
  }

  it('renders BOTH, separately labelled, when both are present and they disagree', () => {
    wrap(<InitiativeDrawer initiative={base} onClose={() => {}} />)
    const signal = screen.getByTestId('risk-signal').textContent
    const level = screen.getByTestId('risk-level').textContent
    expect(signal).toMatch(/signal/i)
    expect(signal).toMatch(/behind/i)
    expect(level).toMatch(/set by your team/i)
    expect(level).toMatch(/low/i)
    // The disagreement is the POINT: the engine says behind, the human said low,
    // and neither is allowed to overwrite the other.
    expect(signal).not.toMatch(/low/i)
    expect(level).not.toMatch(/behind/i)
  })

  it('a null riskLevel renders NOTHING — it is never backfilled to "none"', () => {
    wrap(
      <InitiativeDrawer
        initiative={{ ...base, riskSignal: 'none', riskLevel: null, riskNote: null }}
        onClose={() => {}}
      />,
    )
    expect(screen.queryByTestId('risk-level')).toBeNull()
    expect(screen.getByTestId('risk-signal').textContent).toMatch(/no signal/i)
  })
})

describe('the recommendation rail states no lift it was not given', () => {
  const withLift = {
    templateId: 'REC-RUBRIC-STEP',
    findingKey: null,
    originType: 'gap',
    originRef: 'std-1',
    title: 'Move COG-1.1 up one rubric level',
    rationale: 'COG-1.1 is rated Emerging today. One rubric level of movement is worth 1.7 index points.',
    suggestedOwnerRole: 'accreditation_lead',
    suggestedMetricKey: null,
    suggestedTargetRubricScore: 3,
    estimatedLift: { points: 1.7, basis: 'nextStepLift' },
    estimatedLiftReason: null,
    standardTags: ['COG-1.1'],
  }
  const withoutLift = {
    templateId: 'REC-EVIDENCE-GAP',
    findingKey: null,
    originType: 'gap',
    originRef: 'std-2',
    title: 'Attach evidence to COG-2.3',
    rationale: 'COG-2.3 carries no artifacts.',
    suggestedOwnerRole: 'accreditation_lead',
    suggestedMetricKey: null,
    suggestedTargetRubricScore: null,
    estimatedLift: null,
    estimatedLiftReason:
      'Attaching evidence moves the defensible half of readiness, not the projected index — the index is the mean rubric score.',
    standardTags: ['COG-2.3'],
  }

  it('prints estimatedLift.points VERBATIM — never rounded, scaled or re-derived', () => {
    const { container } = wrap(<RecommendationRail recommendations={[withLift]} canEdit />)
    expect(container.textContent).toContain('+1.7 index pts')
    expect(container.textContent).not.toContain('+2 index pts')
  })

  it('a null lift prints the engine’s literal reason and NO number', () => {
    const { container } = wrap(<RecommendationRail recommendations={[withoutLift]} canEdit />)
    expect(screen.getByTestId('lift-reason').textContent).toBe(withoutLift.estimatedLiftReason)
    expect(container.textContent).not.toContain('index pts')
    // The only digits on the card are the ones the server put in the standard code
    // and the rationale — none of them is an invented "+0".
    expect(container.textContent).not.toContain('+0')
  })

  it('offers "Work this gap" to editors and no dead control to viewers', () => {
    // NB: jest-dom matchers are not registered in this project's vitest config —
    // the DOM property is the assertion, and it is the one the browser reads.
    wrap(<RecommendationRail recommendations={[withLift]} canEdit />)
    expect(screen.getByRole('button', { name: /work this gap/i }).disabled).toBe(false)
    cleanup()
    wrap(<RecommendationRail recommendations={[withLift]} canEdit={false} />)
    expect(screen.queryByRole('button', { name: /work this gap/i })).toBeNull()
  })
})

describe('the seeded flow can only POST keys its endpoint whitelists', () => {
  // The API runs a global forbidNonWhitelisted ValidationPipe: one stray key is a
  // 400, not a warning. This class of bug has broken /apply twice in this repo.
  const rec = {
    templateId: 'REC-RUBRIC-STEP',
    findingKey: 'ACC-UNSCORED:standard:std-1',
    originType: 'finding',
    originRef: 'ACC-UNSCORED:standard:std-1',
    title: 'Score the unscored standards',
    suggestedOwnerRole: 'accreditation_lead',
    suggestedMetricKey: 'operating_margin',
    suggestedTargetRubricScore: 3,
  }

  it('an adopted recommendation emits ONLY AdoptRecommendationDto keys', () => {
    const flow = buildImprovementFlow(seedFromRecommendation(rec, []))
    const values = { ...flow.defaults, dueDate: '2026-10-01' }
    const body = flow.toBody(values, {})
    for (const k of Object.keys(body)) expect(ADOPT_KEYS).toContain(k)
    expect(body.templateId).toBe('REC-RUBRIC-STEP')
    expect(body.findingKey).toBe(rec.findingKey)
    expect(body.targetRubricScore).toBe(3)
  })

  it('a hand-typed initiative emits ONLY CreateImprovementInitiativeDto keys', () => {
    const flow = buildImprovementFlow({})
    const values = {
      ...flow.defaults,
      title: 'Write the crisis plan',
      progressSource: 'milestone',
      milestoneLines: 'Draft\nBoard review\n',
      riskLevel: 'medium',
    }
    const body = flow.toBody(values, {})
    for (const k of Object.keys(body)) expect(CREATE_KEYS).toContain(k)
    expect(body.milestones).toEqual([{ label: 'Draft' }, { label: 'Board review' }])
    expect(body.progressSource).toBe('milestone')
  })

  it('an unanswered progress picker sends progressSource NULL — the "status only" contract', () => {
    const body = createBody({ ...buildImprovementFlow({}).defaults, title: 'x' })
    expect(body.progressSource).toBeNull()
    expect('manualProgressPct' in body).toBe(false)
    expect('milestones' in body).toBe(false)
  })

  it('a hand-set percentage is sent as a 0..1 fraction, not 0..100', () => {
    const body = createBody({
      ...buildImprovementFlow({}).defaults,
      title: 'x',
      progressSource: 'manual',
      manualProgressPct: '25',
    })
    expect(body.manualProgressPct).toBe(0.25)
  })

  it('the adopt path HIDES every control the adopt endpoint would drop', () => {
    // A field that collects a value the request never sends is a fake control.
    const flow = buildImprovementFlow(seedFromRecommendation(rec, []))
    const rendered = flow.steps.flatMap((s) =>
      s.fields.filter((f) => !f.showIf || f.showIf(flow.defaults)).map((f) => f.key),
    )
    const adoptable = new Set([...ADOPT_KEYS, 'templateId'])
    for (const key of rendered) expect(adoptable.has(key)).toBe(true)
    // …and the hand-typed flow keeps its extra step rather than losing fields.
    expect(buildImprovementFlow({}).steps.length).toBeGreaterThan(flow.steps.length)
  })

  it('adoptBody omits an unset optional rather than sending an empty string', () => {
    const body = adoptBody({
      templateId: 'REC-ASSURANCE-GATE',
      originType: 'assurance',
      originRef: 'std-9',
      title: '  Close the assurance gate  ',
      findingKey: '',
      ownerUserId: '',
      dueDate: '',
      metricKey: '',
      targetRubricScore: '',
    })
    expect(body).toEqual({
      templateId: 'REC-ASSURANCE-GATE',
      originType: 'assurance',
      originRef: 'std-9',
      title: 'Close the assurance gate',
    })
  })

  it('milestonesFromLines drops blank lines instead of minting empty milestones', () => {
    expect(milestonesFromLines('a\n\n  \nb')).toEqual([{ label: 'a' }, { label: 'b' }])
    expect(milestonesFromLines('')).toEqual([])
  })

  it('isAdoption is what routes the submit, and a blank seed is NOT an adoption', () => {
    expect(isAdoption({ templateId: 'REC-RUBRIC-STEP' })).toBe(true)
    expect(isAdoption({ templateId: '' })).toBe(false)
    expect(isAdoption({})).toBe(false)
  })

  it('never guesses a person from a suggested ROLE', () => {
    // Fixtures are snake_case because that is what GET /schools/:id/members
    // sends. A member with no POSITION cannot be matched by one: an access role
    // (Leadership/Finance/Board) is not a job, and assigning the wrong colleague
    // to accreditation work is worse than assigning nobody.
    const members = [{ id: 'u1', first_name: 'Jo', last_name: 'Ruiz', email: 'jo@x.edu' }]
    expect(matchOwnerId('accreditation_lead', members)).toBeNull()
    expect(seedFromRecommendation(rec, members).ownerUserId).toBe('')
  })

  it('a roster that CARRIES the position auto-selects that person', () => {
    // The payoff of Membership.title: the suggested owner stops being a hint
    // beside an Unassigned picker and becomes the pre-selected colleague. Pinned
    // against the real roster shape so a casing regression cannot quietly send
    // every school back to Unassigned.
    const roster = [
      { id: 'u1', first_name: 'Jo', last_name: 'Ruiz', email: 'jo@x.edu', title: 'Business Manager' },
      { id: 'u2', first_name: 'Sam', last_name: 'Lee', email: 'sam@x.edu', title: 'Head of School' },
    ]
    expect(matchOwnerId('business_manager', roster)).toBe('u1')
    expect(matchOwnerId('head_of_school', roster)).toBe('u2')
    // Still nobody when no position matches — the honesty rail is unchanged.
    expect(matchOwnerId('accreditation_lead', roster)).toBeNull()
    expect(
      seedFromRecommendation({ ...rec, suggestedOwnerRole: 'business_manager' }, roster).ownerUserId,
    ).toBe('u1')
  })
})

describe('the nav gate mirrors the API guard, and mints no third SKU', () => {
  const group = NAV_GROUPS.find((g) => g.id === 'improvement')

  it('gates on accreditation OR strategy, and carries no single `module` key', () => {
    expect(group).toBeTruthy()
    expect(group.modules).toEqual(['accreditation', 'strategy'])
    expect(group.module).toBeUndefined()
  })

  it('still classifies as a DOMAIN group, not as Core', () => {
    // AppShell splits on `module === null` for Core. `undefined !== null`, so this
    // group lands in domainGroups — the one place the new shape could silently
    // misclassify itself into the always-on Core rail.
    expect(group.module === null).toBe(false)
  })

  it('renders for a school with EITHER key, and for neither school not at all', () => {
    const visible = (has) =>
      NAV_GROUPS.filter(
        (g) => g.module === null || (g.modules ? g.modules.some(has) : has(g.module)),
      ).map((g) => g.id)
    expect(visible((k) => k === 'accreditation')).toContain('improvement')
    expect(visible((k) => k === 'strategy')).toContain('improvement')
    expect(visible((k) => k === 'finance')).not.toContain('improvement')
  })

  it('adds NO `improvement` module anatomy — /improvement has no module tab-rail', () => {
    // MODULE_ANATOMY is keyed by ModuleKey and its label resolves through
    // MODULE_META; an `improvement` entry would render an `undefined` heading and
    // imply a SKU that does not exist. The API side asserts the mirror of this
    // over MODULE_KEYS.
    expect(Object.keys(MODULE_ANATOMY)).not.toContain('improvement')
  })

  it('the single nav item keeps a stable navId — Penny anchors to these', () => {
    expect(group.items).toHaveLength(1)
    expect(group.items[0].navId).toBe('nav-improvement')
    expect(group.items[0].to).toBe('/improvement')
    expect(group.items[0].match('/improvement?rec=x')).toBe(true)
    expect(group.items[0].match('/accreditation')).toBe(false)
  })

  // ── The page has to be REACHABLE on the UI the school actually gets ────────
  // NAV_GROUPS renders only in AppShell's v1 branch, and ui.v2 is the DEFAULT
  // (UiFlagContext: only an explicit 'v1' opts out). Under v2 modules are reached
  // from the home tiles, and a tile is keyed by ModuleKey with its label resolved
  // through MODULE_META — so /improvement, which has no module key on purpose, can
  // never be one. The v2 rail row is therefore the only route a strategy-only
  // school has to this page, and it gates on the SAME OR predicate.
  it('the ui.v2 rail carries /improvement under the same OR gate', () => {
    const row = V2_NAV.find((i) => i.to === '/improvement')
    expect(row).toBeTruthy()
    expect(row.modules).toEqual(['accreditation', 'strategy'])
    expect(row.module).toBeUndefined()
  })

  it('the v2 rail row shows for either key and for neither school not at all', () => {
    const visible = (has) =>
      V2_NAV.filter((i) =>
        i.modules ? i.modules.some(has) : !i.module || has(i.module),
      ).map((i) => i.to)
    expect(visible((k) => k === 'accreditation')).toContain('/improvement')
    expect(visible((k) => k === 'strategy')).toContain('/improvement')
    expect(visible((k) => k === 'finance')).not.toContain('/improvement')
    // …and the ungated core destinations are unaffected by the new predicate.
    expect(visible(() => false)).toEqual(['/app', '/tasks', '/knowledge'])
  })
})

describe('the register distinguishes "nobody measured it" from "no reading yet"', () => {
  // Two different facts. A KPI-bound row whose metric has not been reported comes
  // back `progressSource: 'metric'`, `progressPct: null` — printing "Status only"
  // there would report that nobody chose to measure work that somebody did.
  const row = (over) => ({
    id: 'r1',
    title: 'Raise COG-1.1',
    status: 'in_progress',
    originType: 'gap',
    owner: null,
    dueDate: null,
    riskSignal: 'none',
    progressSource: null,
    progressPct: null,
    ...over,
  })

  it('a legacy row (no source) reads "Status only"', () => {
    const { container } = wrap(<InitiativeList initiatives={[row({})]} />)
    expect(screen.getByTestId('no-pct-label').textContent).toBe('Status only')
    expect(container.textContent).not.toContain('%')
  })

  it('a KPI-bound row with no reading reads "Not measured yet", NOT "Status only"', () => {
    const { container } = wrap(
      <InitiativeList initiatives={[row({ progressSource: 'metric', id: 'r2' })]} />,
    )
    expect(screen.getByTestId('no-pct-label').textContent).toBe('Not measured yet')
    expect(container.textContent).not.toContain('Status only')
    expect(container.textContent).not.toContain('0%')
  })
})

describe('the sparkline’s x axis is time, not row order', () => {
  // Evenly spacing readings by index draws a four-month stall and a next-day
  // reading as the same distance, which flattens a stalled series into a steady
  // climb — the one thing a viewer reads a sparkline's slope for.
  const xsOf = (container) =>
    [...container.querySelectorAll('circle')].map((c) => Number(c.getAttribute('cx')))

  it('places the middle reading by its DATE, not at the midpoint', () => {
    const { container } = wrap(
      <ProgressSparkline
        trend={[
          { date: '2026-01-01', pct: 0 },
          { date: '2026-01-08', pct: 0.5 }, // 7 days into a 100-day span
          { date: '2026-04-11', pct: 0.6 },
        ]}
      />,
    )
    const [x0, x1, x2] = xsOf(container)
    const frac = (x1 - x0) / (x2 - x0)
    expect(frac).toBeGreaterThan(0.05)
    expect(frac).toBeLessThan(0.10) // 7/100 — index spacing would put it at 0.5
  })

  it('falls back to even spacing when the dates carry no usable span', () => {
    const { container } = wrap(
      <ProgressSparkline
        trend={[
          { date: '2026-01-01', pct: 0.1 },
          { date: '2026-01-01', pct: 0.2 },
          { date: '2026-01-01', pct: 0.3 },
        ]}
      />,
    )
    const [x0, x1, x2] = xsOf(container)
    expect(x1 - x0).toBeCloseTo(x2 - x1, 5)
  })

  it('still refuses to draw a line through fewer than two readings', () => {
    const { container } = wrap(<ProgressSparkline trend={[{ date: '2026-01-01', pct: 0.4 }]} />)
    expect(screen.getByTestId('sparkline-empty').textContent).toMatch(/a line needs two/i)
    expect(container.querySelector('path')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// THE HAND-OFF FIXES — the five places the page made a claim it could not keep.
// ─────────────────────────────────────────────────────────────────────────────

describe('an empty rail says WHICH empty it is', () => {
  // "Every open gap, unmet assurance and non-informational warning is already
  // being worked" is a claim about work that was EVALUATED. /improvement rides on
  // accreditation OR strategy, so a strategy-only school reaches this page with
  // the accreditation sources never read at all — and a school with no framework
  // adopted has no gaps or assurances to be clear of. Both used to read the
  // all-clear sentence.
  it('a strategy-only school is told the sources were not read, not that it is clear', () => {
    wrap(
      <RecommendationRail
        recommendations={[]}
        basis={{ accreditationLicensed: false, frameworkAdopted: false }}
      />,
    )
    const empty = screen.getByTestId('rail-empty').textContent
    expect(empty).toMatch(/Recommendations come from Accreditation/i)
    expect(empty).not.toMatch(/already being worked/i)
    expect(empty).not.toMatch(/Nothing is waiting on a plan/i)
  })

  it('an accredited school with no framework is told to adopt one', () => {
    wrap(
      <RecommendationRail
        recommendations={[]}
        basis={{ accreditationLicensed: true, frameworkAdopted: false }}
      />,
    )
    const empty = screen.getByTestId('rail-empty').textContent
    expect(empty).toMatch(/No framework adopted yet/i)
    expect(empty).not.toMatch(/already being worked/i)
  })

  it('a school that really IS clear still gets the all-clear — the check is not vacuous', () => {
    wrap(
      <RecommendationRail
        recommendations={[]}
        basis={{ accreditationLicensed: true, frameworkAdopted: true }}
      />,
    )
    const empty = screen.getByTestId('rail-empty').textContent
    expect(empty).toMatch(/Nothing is waiting on a plan/i)
    expect(empty).toMatch(/already being worked/i)
  })

  it('with NO basis at all it claims nothing either way', () => {
    wrap(<RecommendationRail recommendations={[]} />)
    const empty = screen.getByTestId('rail-empty').textContent
    expect(empty).toMatch(/Nothing to recommend right now/i)
    expect(empty).not.toMatch(/already being worked/i)
  })
})

describe('"Work this gap" is never a silent no-op', () => {
  // The rail is capped at 8 and ranks any stated lift above every null one, so a
  // school-scoped early warning is the FIRST thing truncated on a school with
  // eight-plus scored gaps. Resolving the deep link only against the rail meant
  // the click did nothing at all, and left ?rec= in the URL forever.
  const rail = [
    {
      templateId: 'REC-RUBRIC-STEP',
      findingKey: null,
      originType: 'gap',
      originRef: 'std-1',
      title: 'Raise COG-1 one rubric level',
      suggestedTargetRubricScore: 3,
      suggestedMetricKey: null,
      suggestedOwnerRole: 'accreditation_lead',
    },
  ]

  it('a key the rail does not contain still seeds an adoptable flow, from the link', () => {
    const seed = seedFromDeepLink({
      wanted: 'GOV-MINUTES-STALE:school',
      title: 'Board minutes have gone stale',
      recommendations: rail,
      members: [],
    })
    expect(seed).not.toBeNull()
    expect(seed.findingKey).toBe('GOV-MINUTES-STALE:school')
    expect(seed.originRef).toBe('GOV-MINUTES-STALE:school')
    expect(seed.originType).toBe('finding')
    expect(seed.title).toBe('Board minutes have gone stale')
    // …and what it seeds is a REAL adoption: isAdoption routes it to the adopt
    // endpoint, and the body it builds is whitelisted.
    expect(isAdoption(seed)).toBe(true)
    const body = adoptBody({ ...buildImprovementFlow(seed).defaults })
    for (const k of Object.keys(body)) expect(ADOPT_KEYS).toContain(k)
    expect(body.findingKey).toBe('GOV-MINUTES-STALE:school')
  })

  it('a key the rail DOES contain still wins — the rail carries the engine’s numbers', () => {
    const seed = seedFromDeepLink({ wanted: 'REC-RUBRIC-STEP:std-1', recommendations: rail })
    expect(seed.templateId).toBe('REC-RUBRIC-STEP')
    expect(seed.originRef).toBe('std-1')
    expect(seed.targetRubricScore).toBe('3')
  })

  it('no key at all opens nothing', () => {
    expect(seedFromDeepLink({ wanted: '', recommendations: rail })).toBeNull()
    expect(seedFromDeepLink({})).toBeNull()
  })
})

describe('the drawer can WRITE — created-and-deleted was the whole vocabulary', () => {
  const MEASURED = {
    id: 'i-9',
    title: 'Adopt the new safeguarding policy',
    status: 'in_progress',
    originType: 'gap',
    originRef: 'std-3',
    findingKey: null,
    goalId: null,
    owner: null,
    startDate: '2026-01-01',
    dueDate: '2026-12-01',
    trend: [],
    metricKey: null,
    milestones: [
      { id: 'm1', label: 'Draft the policy', done: true },
      { id: 'm2', label: 'Board review', done: false },
    ],
    progressSource: 'milestone',
    progressPct: 0.5,
    progressBasis: 'Milestones completed',
    expectedPct: 0.6,
    paceStatus: 'on_track',
    overshoot: false,
    riskSignal: 'none',
    riskLevel: null,
    riskNote: null,
    projectedCompletionDate: null,
    projectionReason: 'Only 0 observations recorded; two are needed to project.',
    countsTowardRollup: true,
  }

  it('ticking a milestone PATCHes the whole list with exactly that one flipped', async () => {
    const onUpdate = vi.fn(async () => {})
    wrap(<InitiativeDrawer initiative={MEASURED} canEdit onUpdate={onUpdate} onClose={() => {}} />)
    const review = screen.getByRole('button', { name: /Board review/i })
    review.click()
    await Promise.resolve()
    expect(onUpdate).toHaveBeenCalledTimes(1)
    const [id, body] = onUpdate.mock.calls[0]
    expect(id).toBe('i-9')
    for (const k of Object.keys(body)) expect(PATCH_KEYS).toContain(k)
    expect(body.milestones).toEqual([
      { id: 'm1', label: 'Draft the policy', done: true },
      { id: 'm2', label: 'Board review', done: true },
    ])
  })

  it('a viewer gets read-only milestones and no editor at all', () => {
    wrap(<InitiativeDrawer initiative={MEASURED} onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: /Board review/i })).toBeNull()
    expect(screen.queryByTestId('status-select')).toBeNull()
    expect(screen.queryByTestId('record-reading')).toBeNull()
  })

  it('"Record today’s reading" posts the COMPUTED figure, never a typed one', async () => {
    const onRecordReading = vi.fn(async () => {})
    wrap(
      <InitiativeDrawer
        initiative={MEASURED}
        canEdit
        onUpdate={async () => {}}
        onRecordReading={onRecordReading}
        onClose={() => {}}
      />,
    )
    screen.getByTestId('record-reading').click()
    await Promise.resolve()
    expect(onRecordReading).toHaveBeenCalledTimes(1)
    const [id, body] = onRecordReading.mock.calls[0]
    expect(id).toBe('i-9')
    expect(body.pct).toBe(0.5) // the server's own progressPct, not an input
    expect(body.source).toBe('milestone')
    expect(body.observedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('nothing measurable to record ⇒ no control offered', () => {
    for (const it of [
      { ...MEASURED, progressSource: null, progressPct: null, progressBasis: 'Status only' },
      { ...MEASURED, progressSource: 'manual', progressPct: 0.4 },
      { ...MEASURED, progressPct: null },
    ]) {
      const { unmount } = wrap(
        <InitiativeDrawer
          initiative={it}
          canEdit
          onUpdate={async () => {}}
          onRecordReading={async () => {}}
          onClose={() => {}}
        />,
      )
      expect(screen.queryByTestId('record-reading')).toBeNull()
      unmount()
    }
  })

  it('the measurement editor emits ONLY whitelisted keys and keeps ticked milestones ticked', () => {
    const patch = measurementPatch(
      { progressSource: 'milestone', milestoneLines: 'Draft the policy\nBoard review\nPublish' },
      MEASURED,
    )
    for (const k of Object.keys(patch)) expect(PATCH_KEYS).toContain(k)
    expect(patch.milestones).toEqual([
      { label: 'Draft the policy', done: true },
      { label: 'Board review', done: false },
      { label: 'Publish', done: false },
    ])
  })

  it('a percent KPI target is stored as a fraction, and clearing the source clears nothing else', () => {
    expect(
      measurementPatch({ progressSource: 'metric', metricKey: 'operating_margin', targetValue: '8.5' })
        .targetValue,
    ).toBeCloseTo(0.085, 9)
    expect(measurementPatch({ progressSource: '' })).toEqual({ progressSource: null })
    expect(measurementPatch({ progressSource: 'manual', manualProgressPct: '40' })).toEqual({
      progressSource: 'manual',
      manualProgressPct: 0.4,
    })
  })

  it('milestonesWithToggle flips exactly one and preserves the rest', () => {
    const out = milestonesWithToggle(MEASURED.milestones, 0)
    expect(out).toEqual([
      { id: 'm1', label: 'Draft the policy', done: false },
      { id: 'm2', label: 'Board review', done: false },
    ])
  })
})

describe('a pace verdict is only stated when there is a schedule window', () => {
  // computePace falls back to "expected 0%" with no start date, so 0%-done work
  // due tomorrow reads on_track. On /improvement a null start is the NORMAL case
  // (the field is optional and hidden on the adopt path), so "On pace" would be a
  // claim nothing supports. expectedPct === null is the server's own signal.
  const base = {
    id: 'i-2',
    title: 'Write the continuity plan',
    status: 'planned',
    originType: 'manual',
    originRef: null,
    findingKey: null,
    goalId: null,
    owner: null,
    dueDate: '2026-08-01',
    trend: [],
    metricKey: null,
    milestones: null,
    progressSource: 'milestone',
    progressPct: 0,
    progressBasis: 'Milestones completed',
    paceStatus: 'on_track',
    overshoot: false,
    riskSignal: 'none',
    riskLevel: null,
    riskNote: null,
    projectedCompletionDate: null,
    projectionReason: 'Only 0 observations recorded; two are needed to project.',
    countsTowardRollup: true,
  }

  it('no window ⇒ "No schedule window", never "On pace"', () => {
    const { container } = wrap(
      <InitiativeDrawer initiative={{ ...base, expectedPct: null }} onClose={() => {}} />,
    )
    expect(screen.getByTestId('pace-unknown').textContent).toMatch(/No schedule window/i)
    expect(screen.queryByTestId('pace-label')).toBeNull()
    expect(container.textContent).not.toMatch(/On pace/i)
  })

  it('with a window the verdict IS printed — the guard is not "hide the label"', () => {
    wrap(
      <InitiativeDrawer
        initiative={{ ...base, startDate: '2026-01-01', expectedPct: 0.5 }}
        onClose={() => {}}
      />,
    )
    expect(screen.getByTestId('pace-label').textContent).toMatch(/On pace/i)
    expect(screen.queryByTestId('pace-unknown')).toBeNull()
  })
})

describe('a KPI picked on the adopt path is a KPI actually bound', () => {
  // The picker used to send metricKey to an endpoint that stored no progress
  // source, so the drawer showed the chosen KPI and told the user to bind a KPI,
  // in the same panel — and the baseline was never frozen.
  it('adoptBody names the metric source and converts a percent target', () => {
    const body = adoptBody({
      templateId: 'REC-RUBRIC-STEP',
      originType: 'gap',
      originRef: 'std-1',
      title: 'Raise COG-1',
      metricKey: 'operating_margin',
      targetValue: '8.5',
    })
    for (const k of Object.keys(body)) expect(ADOPT_KEYS).toContain(k)
    expect(body.progressSource).toBe('metric')
    expect(body.targetValue).toBeCloseTo(0.085, 9)
  })

  it('no KPI ⇒ no source at all, which is still the status-only contract', () => {
    const body = adoptBody({
      templateId: 'REC-EVIDENCE-GAP',
      originType: 'gap',
      originRef: 'std-2',
      title: 'Attach evidence',
      metricKey: '',
    })
    expect('progressSource' in body).toBe(false)
    expect('metricKey' in body).toBe(false)
  })

  it('a row carrying a KPI with no bound source does not tell the user to bind a KPI', () => {
    wrap(
      <InitiativeDrawer
        initiative={{
          id: 'i-3',
          title: 'Raise COG-2.3',
          status: 'planned',
          originType: 'gap',
          originRef: 'std-2',
          findingKey: null,
          goalId: null,
          owner: null,
          trend: [],
          milestones: null,
          metricKey: 'operating_margin',
          metricLabel: 'Operating margin',
          formattedCurrent: '4.0%',
          progressSource: null,
          progressPct: null,
          progressBasis: 'Status only',
          expectedPct: null,
          paceStatus: 'no_data',
          overshoot: false,
          riskSignal: 'none',
          riskLevel: null,
          riskNote: null,
          projectedCompletionDate: null,
          projectionReason: 'This initiative reports status only, so nothing can be projected.',
          countsTowardRollup: false,
        }}
        onClose={() => {}}
      />,
    )
    const text = screen.getByTestId('status-only').textContent
    expect(text).toMatch(/a KPI is named on this initiative/i)
    expect(text).not.toMatch(/Bind it to a\s+KPI/i)
  })
})
