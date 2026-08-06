// Hand-built ComplianceFacts fixtures — NOT sample-data file contents. Each
// builder constructs the minimal facts a rule path needs.
import type {
  ComplianceFacts,
  ComplianceFinancials,
  ComplianceInputs,
  Program,
} from '../src/types.js'
// AIC Phase H — the shared mock-visit fixture at the foot of this file.
import type {
  Commendation,
  Recommendation,
  TwinCoverage,
  TwinEvidenceEntry,
  TwinNotEvaluated,
  VisitFindingInput,
  VisitInput,
  VisitSignalInput,
} from '../src/index.js'

const ZERO_EXPENSE_LINES = {
  instructional: 0,
  facilities: 0,
  fixedOther: 0,
  intlExp: 0,
  bus: 0,
  food: 0,
  studActExp: 0,
  athletics: 0,
  admin: 0,
  restricted: 0,
}

/** A balanced snapshot with clean financials and no non-education expenses. */
export const cleanFinancials: ComplianceFinancials = {
  balanced: true,
  hasSnapshot: true,
  totalExpenses: 10_420_000,
  netAssets: 5_000_000,
  cash: 2_000_000,
  daysCashOnHand: 90,
  operatingResult: 250_000,
  expenseLines: { ...ZERO_EXPENSE_LINES, instructional: 8_000_000, admin: 2_420_000 },
}

/** Same as clean but the TB does not balance. */
export const unbalancedFinancials: ComplianceFinancials = {
  ...cleanFinancials,
  balanced: false,
}

/** No snapshot for the period — AUTO rules must return needs_data. */
export const noSnapshotFinancials: ComplianceFinancials = {
  balanced: false,
  hasSnapshot: false,
  totalExpenses: 0,
  netAssets: null,
  cash: null,
  daysCashOnHand: null,
  operatingResult: 0,
  expenseLines: { ...ZERO_EXPENSE_LINES },
}

/** Financials carrying non-education expense categories (athletics/studAct/bus/food). */
export const nonEducationFinancials: ComplianceFinancials = {
  ...cleanFinancials,
  expenseLines: {
    ...ZERO_EXPENSE_LINES,
    instructional: 6_000_000,
    athletics: 120_000,
    studActExp: 80_000,
    bus: 200_000,
    food: 50_000,
  },
}

/** Financials with prudential red flags (deficit + negative net assets + low cash). */
export const redFlagFinancials: ComplianceFinancials = {
  balanced: true,
  hasSnapshot: true,
  totalExpenses: 1_000_000,
  netAssets: -50_000,
  cash: -10_000,
  daysCashOnHand: 5,
  operatingResult: -200_000,
  expenseLines: { ...ZERO_EXPENSE_LINES, instructional: 1_000_000 },
}

/** Low totalExpenses so coverage fails against a larger scholarship figure. */
export const lowExpenseFinancials: ComplianceFinancials = {
  ...cleanFinancials,
  totalExpenses: 100_000,
}

/** Build a ComplianceFacts with the given inputs + financials. Programs resolved from inputs. */
export function buildFacts(
  inputs: ComplianceInputs,
  financials: ComplianceFinancials = cleanFinancials,
): ComplianceFacts {
  return {
    inputs,
    financials,
    programs: inputs.programs ?? [],
  }
}

/** A fully-populated, all-passing intake (no FES-UA). */
export const fullPassInputs: ComplianceInputs = {
  scholarshipFundsReceived: 300_000,
  programs: ['FTC'] as Program[],
  fundsAtInsuredInstitution: true,
  avgDailyBalanceOver250k: false,
  bankRatingReviewedTopTwo: true,
  reconciledWithin60Days: true,
  reconciliationIndependentlyReviewed: true,
  doeStatusApproved: true,
  yearsInOperation: 5,
  suretyBondPosted: false,
  fesuaAnyAccountOver50k: false,
}

/** An empty intake — every intake rule should return needs_data. */
export const emptyInputs: ComplianceInputs = {}

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase H — THE SHARED MOCK-VISIT FIXTURE.
//
// SEAM D: this is the single source of test data for the visit payload. The pure
// composer's specs build from it, and the web specs import a JSON copy of the
// COMPOSED result rather than hand-rolling a payload — so a shape change breaks
// one fixture, not four hand-written ones that quietly disagree.
//
// It is deliberately AWKWARD, because the easy cases prove nothing:
//   • two findings under one code, one under another, and one with NO code at all
//     (the school-level bucket);
//   • a finding whose `standardTags` has two entries (the `alsoServes` path);
//   • a roster row with a NULL `unavailableReason` (the NO_REASON_GIVEN path);
//   • one recommendation already in `adoptedKeys` (the exclusion path);
//   • one recommendation with a null `estimatedLift` (the nulls-last ordering).
//
// The disclaimer here is a PLACEHOLDER on purpose. The real sentence lives on the
// server as READINESS_DISCLAIMER; a fixture that retyped it would create the
// second copy this phase exists to delete.
// ─────────────────────────────────────────────────────────────────────────────

export const VISIT_FIXTURE_DISCLAIMER =
  'FIXTURE DISCLAIMER — the server constant is passed in at runtime.'

function ev(
  key: string,
  label: string,
  value: number | string,
  display: string,
  asOf: string | null,
): TwinEvidenceEntry {
  return { key, label, value, display, asOf, lineage: null }
}

const noHorizon = { kind: 'none', value: null, confidence: null, reason: 'No trend.' } as const

function finding(over: Partial<VisitFindingInput> & { findingKey: string }): VisitFindingInput {
  return {
    ruleId: 'GOV-CADENCE-GAP',
    scopeKey: 'school',
    title: 'Board meeting cadence',
    rationale: '2 board meetings were held in the last twelve months.',
    evidence: [ev('gov.meetings', 'Board meetings', 2, '2 meetings', '2026-06-30')],
    standardTags: [],
    domainKeys: ['governance'],
    severity: 'warn',
    likelihood: 'possible',
    confidence: 'observation',
    horizon: noHorizon,
    consequence: 'A visiting team would ask how the board exercises oversight.',
    initiativeId: null,
    findingCleared: false,
    ...over,
  }
}

export const visitFixtureFindings: VisitFindingInput[] = [
  finding({
    findingKey: 'GOV-CADENCE-GAP:standard:s-gov-2',
    scopeKey: 'standard:s-gov-2',
    standardTags: ['GOV-2', 'GOV-4'],
    severity: 'warn',
  }),
  finding({
    findingKey: 'GOV-POLICY-OVERDUE:standard:s-gov-2',
    ruleId: 'GOV-POLICY-OVERDUE',
    scopeKey: 'standard:s-gov-2',
    standardTags: ['GOV-2'],
    title: 'Policy review overdue',
    rationale: '3 policies are past their review date.',
    consequence: 'A visiting team would read the policy register as unmaintained.',
    evidence: [ev('gov.policies', 'Overdue policies', 3, '3 policies', '2026-06-30')],
    severity: 'info',
    initiativeId: 'init-1',
  }),
  finding({
    findingKey: 'FIN-RESERVE-THIN:standard:s-fin-1',
    ruleId: 'FIN-RESERVE-THIN',
    scopeKey: 'standard:s-fin-1',
    standardTags: ['FIN-1'],
    title: 'Operating reserve is thin',
    rationale: 'Days cash on hand is 41 days.',
    consequence: 'A visiting team would question financial sustainability.',
    evidence: [ev('fin.days_cash', 'Days cash on hand', 41, '41 days', '2026-06-30')],
    domainKeys: ['finance'],
    severity: 'critical',
  }),
  finding({
    findingKey: 'SCHOOL-NOT-REPORTING:school',
    ruleId: 'SCHOOL-NOT-REPORTING',
    scopeKey: 'school',
    standardTags: [],
    title: 'No statements filed this year',
    rationale: 'No fiscal period carries saved statements.',
    consequence: 'A visiting team would have nothing current to read.',
    evidence: [ev('fin.periods', 'Periods with statements', 0, 'none', null)],
    domainKeys: ['finance'],
    severity: 'critical',
  }),
]

export const visitFixtureSignals: VisitSignalInput[] = [
  {
    key: 'gov.meetings',
    label: 'Board meetings',
    availability: 'available',
    unavailableReason: null,
    moduleKey: 'governance',
    observedOn: '2026-06-30',
    ageDays: 31,
    changeState: 'moved',
    domainKeys: ['governance'],
  },
  {
    key: 'fin.days_cash',
    label: 'Days cash on hand',
    availability: 'available',
    unavailableReason: null,
    moduleKey: null,
    observedOn: '2026-06-30',
    ageDays: 31,
    changeState: 'unchanged',
    domainKeys: ['finance'],
  },
  {
    key: 'hr.pd_participation',
    label: 'Professional development participation',
    availability: 'not_tracked',
    // THE NULL. This row must still render a reason.
    unavailableReason: null,
    moduleKey: 'hr',
    observedOn: null,
    ageDays: null,
    changeState: 'never_observed',
    domainKeys: ['hr'],
  },
  {
    key: 'fac.inspections',
    label: 'Compliance inspections',
    availability: 'not_licensed',
    unavailableReason: 'Facilities is not licensed for this school.',
    moduleKey: 'facilities',
    observedOn: null,
    ageDays: null,
    changeState: 'never_observed',
    domainKeys: ['facilities'],
  },
  {
    key: 'acad.growth',
    label: 'Academic growth',
    availability: 'no_data',
    unavailableReason: 'No academic growth readings have been recorded.',
    moduleKey: null,
    observedOn: null,
    ageDays: null,
    changeState: 'never_observed',
    domainKeys: ['academic_excellence'],
  },
]

export const visitFixtureCoverage: TwinCoverage = {
  rulesTotal: 29,
  rulesEvaluated: 11,
  rulesFired: 4,
  rulesNotEvaluated: 18,
  evaluablePct: 0.379,
  signals: { available: 2, not_licensed: 1, no_data: 1, not_tracked: 1 },
  blockedByModule: { facilities: ['FAC-BACKLOG', 'FAC-INSPECTION-DUE'], hr: ['HR-PD-LOW'] },
  unlockableByYears: {
    signalKey: 'fin.days_cash',
    ruleIds: ['FIN-BUDGET-DETERIORATING'],
    yearsNeeded: 2,
    fyLabels: ['FY2023–24', 'FY2022–23'],
  },
  namedHoles: [
    {
      ruleId: 'HR-PD-LOW',
      intake: 'hr.pd',
      copy: 'We cannot tell you whether staff development is keeping pace.',
    },
    {
      ruleId: 'SAFE-ENV-GAP',
      intake: 'safety.clearances',
      copy: 'We cannot tell you whether every adult on campus is cleared.',
    },
  ],
}

export const visitFixtureNotEvaluated: TwinNotEvaluated[] = [
  {
    ruleId: 'HR-PD-LOW',
    title: 'Professional development participation is low',
    reason: 'signal_not_tracked',
    blockingSignalKey: 'hr.pd_participation',
    blockingSignalLabel: 'Professional development participation',
    message: 'Nothing records professional development participation for this school yet.',
    moduleKey: 'hr',
    unlock: {
      moduleKey: 'hr',
      intake: 'hr.pd',
      copy: 'Record professional development participation to evaluate this rule.',
    },
  },
  {
    ruleId: 'FAC-BACKLOG',
    title: 'Deferred maintenance backlog',
    reason: 'signal_not_licensed',
    blockingSignalKey: 'fac.backlog',
    blockingSignalLabel: 'Maintenance backlog',
    message: 'Facilities is not licensed for this school.',
    moduleKey: 'facilities',
    unlock: {
      moduleKey: 'facilities',
      intake: 'facilities.workorders',
      copy: 'License Facilities to evaluate this rule.',
    },
  },
]

const commendation: Commendation = {
  standardId: 's-mis-1',
  code: 'MIS-1',
  title: 'Mission and purpose',
  rubricScore: 4,
  rubricLabel: 'Impacting',
  evidence: [{ tag: 'mission_statement', label: 'Mission statement', expiresOn: null }],
  signals: [
    { key: 'fin.days_cash', label: 'Days cash on hand', formattedValue: '41 days', asOf: '2026-06-30' },
  ],
  strength: 0.91,
  narrative: 'Scored Impacting, with a current mission statement and a favorable operating figure.',
}

export const visitFixtureRecommendations: Recommendation[] = [
  {
    templateId: 'REC-RUBRIC-STEP',
    findingKey: null,
    originType: 'gap',
    originRef: 's-aca-3',
    title: 'Move ACA-3 from Initiating to Improving',
    rationale: 'ACA-3 is scored 2 of 4 and carries current evidence.',
    suggestedOwnerRole: 'principal',
    suggestedMetricKey: null,
    suggestedTargetRubricScore: 3,
    estimatedLift: { points: 4.2, basis: 'nextStepLift' },
    estimatedLiftReason: null,
    standardTags: ['ACA-3'],
  },
  {
    templateId: 'REC-FINDING-WORK',
    findingKey: 'FIN-RESERVE-THIN:standard:s-fin-1',
    originType: 'finding',
    originRef: 'FIN-RESERVE-THIN:standard:s-fin-1',
    title: 'Work the thin operating reserve',
    rationale: 'Days cash on hand is 41 days.',
    suggestedOwnerRole: 'business_manager',
    suggestedMetricKey: 'days_cash_on_hand',
    suggestedTargetRubricScore: null,
    estimatedLift: null,
    estimatedLiftReason:
      'That standard is not among the ranked readiness gaps, so no index movement can be attributed to this finding.',
    standardTags: ['FIN-1'],
  },
  {
    // ALREADY ADOPTED — must not appear in the draft.
    templateId: 'REC-EVIDENCE-GAP',
    findingKey: null,
    originType: 'gap',
    originRef: 's-gov-2',
    title: 'Attach evidence to GOV-2',
    rationale: 'GOV-2 is scored but carries no current artifact.',
    suggestedOwnerRole: 'board_chair',
    suggestedMetricKey: null,
    suggestedTargetRubricScore: null,
    estimatedLift: null,
    estimatedLiftReason:
      'Attaching evidence moves the defensible half of readiness, not the projected index — the index is the mean rubric score.',
    standardTags: ['GOV-2'],
  },
]

/** The shared input. `over` lets one spec bend one axis without a second fixture. */
export function visitFixtureInput(over: Partial<VisitInput> = {}): VisitInput {
  return {
    now: '2026-07-31T12:00:00.000Z',
    framework: { code: 'cognia_2022', name: 'the Cognia Performance Standards' },
    // The ORDINARY school holds one. Multi-framework cases override this.
    otherFrameworks: [],
    frameworkAdopted: true,
    snapshotAsOf: '2026-06-30',
    demoData: false,
    disclaimer: VISIT_FIXTURE_DISCLAIMER,
    readiness: {
      readinessPct: 54,
      selfScoredPct: 62,
      verifiedPct: 41,
      projectedIndex: 310,
      band: 'watch',
      confidence: {
        coveragePct: 60,
        measuredDomains: 6,
        unmeasuredDomains: ['student_services', 'hr', 'facilities', 'technology'],
        caveat: 'Six of ten domains carry a measured reading.',
      },
    },
    findings: visitFixtureFindings,
    notEvaluated: visitFixtureNotEvaluated,
    coverage: visitFixtureCoverage,
    signals: visitFixtureSignals,
    commendations: {
      commendations: [commendation],
      exclusions: {
        eligible: 1,
        noScore: 3,
        lowScore: 5,
        noRequirements: 7,
        noCurrentEvidence: 2,
        noFavorableSignal: 1,
      },
      caveat:
        'Strengths we can defend: a strong self-score, current evidence, and a favorable operating figure — all three. 1 of 19 standards qualify.',
      signalsUnavailable: null,
      demoData: false,
    },
    evidence: {
      groups: [{ tag: 'mission_statement' }, { tag: 'board_minutes' }],
      health: {
        evidenceHealthPct: 50,
        rated: 8,
        current: 4,
        expiring: 1,
        stale: 2,
        missing: 1,
        unknown: 0,
        notTracked: 3,
        basis: '4 of 8 rated artifacts are current.',
      },
      counts: {
        artifacts: 11,
        artifactsTracked: 8,
        requirements: 24,
        requiredTracked: 17,
        standardsWithRequirements: 9,
        standardsLegacy: 10,
      },
    },
    recommendations: visitFixtureRecommendations,
    recommendationsBasis: { accreditationLicensed: true, frameworkAdopted: true },
    adoptedKeys: ['s-gov-2'],
    ...over,
  }
}
