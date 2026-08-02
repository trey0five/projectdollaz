// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase E — THE ACCREDITATION TWIN / EARLY-WARNING RULE ENGINE (PURE).
//
// This file answers one question and refuses, by name, when it cannot: "what
// would a visiting team find, and what is the basis for saying so?"
//
// FIVE THINGS THAT ARE NOT NEGOTIABLE, AND WHY EACH IS MECHANICAL RATHER THAN
// ASPIRATIONAL:
//
//  1. A RULE FIRES ONLY WHEN EVERY SIGNAL IT DECLARED IS `available` AND ITS
//     PREDICATE IS TRUE. Anything else becomes a `TwinNotEvaluated` entry WITH
//     THE BLOCKING SIGNAL NAMED. An unlicensed module lowers `coverage`; it never
//     lowers a score and it never produces a finding. "We looked and it is fine"
//     and "we could not look" are different facts and this engine never conflates
//     them — a predicate that returns zero findings is a PASS, not a refusal.
//
//  2. EVERY NUMERAL IN A `rationale` COMES FROM THAT FINDING'S `evidence[]`.
//     Rationales are never written by a rule; they are RENDERED by the engine
//     from a frozen template whose only variable parts are `{{key}}` lookups into
//     `evidence`. An unresolved placeholder THROWS (`TwinTemplateError`). A rule
//     that cannot name its own basis is a bug, not a prediction.
//
//  3. EVERY FINDING CARRIES AT LEAST ONE REAL SCHOOL STANDARD CODE. Tag
//     resolution happens in the engine (§ resolveStandardTags), not in review: a
//     finding whose codes do not exist in this school's register is DROPPED and
//     replaced by a `no_standards` refusal.
//
//  4. LIKELIHOOD IS ORDINAL — 'possible' or 'likely'. There is no outcome data
//     anywhere in this program to calibrate a probability against, so no
//     percentage is stored, derived or emitted, and no accreditation DECISION is
//     ever predicted.
//
//  5. A STANDARD WITH ZERO EVIDENCE SCORES `risk: null`, NEVER `0`. Zero reads as
//     "excellent here" on exactly the standards where we know least.
//
// TWO DELIBERATE NON-FIXES, STATED SO NOBODY "CORRECTS" THEM LATER:
//
//  · `MIN_DOMAIN_LEAVES` does NOT gate a domain band. The objection it answers
//    (averaging one integer into a percentage) applies to `computeDomainReadiness`,
//    not here: a band is an ORDINAL OVER COUNTED FACTS. Gating it would grey out
//    domains where we have counted real findings.
//
//  · Four rules ship VISIBLE and permanently/currently `cannot_evaluate`
//    (HR-PD-LOW, SAFE-ENV-GAP, CURR-DOC-AGING, ACAD-GROWTH-FLAT). That is the
//    deliverable, not a shortfall: it tells a school exactly what a visiting team
//    will ask that we cannot answer, and it names the intake that would close it.
//
// PURITY. Obeys `__tests__/purity.test.ts` verbatim: no clock read of any kind,
// no randomness, no I/O, no DOM. `now` is a `yyyy-mm-dd` STRING passed in by the
// caller — the same discipline `trend-signal.ts` and `review-status.ts` follow,
// and the reason two runs on one input are byte-identical forever. (This comment
// deliberately spells none of the forbidden identifiers: the purity guard greps
// the source TEXT, comments included, which is exactly the bluntness that makes
// it impossible to talk your way past.)
// The one runtime import outside this package is `bandsFor` from
// `@finrep/analytics` — a frozen table of constants, and the ONLY authority on a
// metric's risk line. Re-typing `3` for the reserve threshold would be a second
// source of truth for a number analytics already owns.
// ─────────────────────────────────────────────────────────────────────────────

import { bandsFor } from '@finrep/analytics'
import type { MetricKey, TargetBands } from '@finrep/analytics'

import { daysFromCivil, toCivil } from './review-status.js'
import {
  DOMAIN_KEYS,
  DOMAIN_REASON_NOUN,
  type DomainKey,
} from './accreditation-domains.js'
import type { CurrencyState, DataAvailability } from './evidence-currency.js'
import { RUBRIC_MAX } from './accreditation-readiness.js'
import {
  MIN_N_FOR_TREND,
  estimateHorizon,
  type Horizon,
  type TrendConfidence,
  type TrendSignal,
} from './trend-signal.js'
import type { SmallCell } from './small-cells.js'

export const ACCREDITATION_TWIN_VERSION = '1.0.0'

// ─────────────────────────────────────────────────────────────────────────────
// §1.2 INPUT VIEWS
//
// STRUCTURAL, NEVER IMPORTED. `apps/api`'s `TwinSignal` satisfies
// `TwinSignalView` by construction and Phase C's `EvidenceGroup` satisfies
// `TwinEvidenceGroupView` by projection. Declaring the shapes here rather than
// importing them keeps `packages/compliance` free of any dependency on the API,
// which is the reason `trend-signal.ts` lives here too (compliance depends on
// analytics; never the reverse).
// ─────────────────────────────────────────────────────────────────────────────

export type TwinSignalAvailability = 'available' | 'not_licensed' | 'no_data' | 'not_tracked'
export type TwinSignalChangeState = 'moved' | 'unchanged' | 'stale_data' | 'never_observed'

export interface TwinSignalLineage {
  table: string
  field?: string
  metricKey?: string
}

/** The subset of apps/api's `TwinSignal` the rules read. Structural, not imported. */
export interface TwinSignalView {
  key: string
  label: string
  availability: TwinSignalAvailability
  /** Non-null whenever availability !== 'available'. Rendered VERBATIM. */
  unavailableReason: string | null
  moduleKey: string | null
  value: number | string | boolean | null
  trend: TrendSignal | null
  observedOn: string | null
  ageDays: number | null
  changeState: TwinSignalChangeState
  staleAfterDays: number
  cells: readonly SmallCell[] | null
  domainKeys: readonly DomainKey[]
  lineage: TwinSignalLineage | null
}

export interface TwinRequirementView {
  tag: string
  label: string
  state: CurrencyState
  dataAvailability: DataAvailability
  expiresOn: string | null
  daysUntilExpiry: number | null
}

export interface TwinStandardView {
  standardId: string
  code: string
  title: string
  isAssurance: boolean
  /** Binary assurance gate result from `computeAssurances`. Null for non-assurances. */
  assuranceSatisfied: boolean | null
  rubricScore: number | null
  /** Count of AccreditationEvidence rows attached to this standard. */
  evidenceCount: number
  /** Domains this standard carries at weight >= SIGNAL_ATTRIBUTION_MIN_WEIGHT. */
  domainKeys: readonly DomainKey[]
  /** The catalog's primary domain — the fallback when nothing else resolves. */
  primaryDomainKey: DomainKey
  /** Catalog `signalKeys[]` — the METRIC keys bound to this standard (Phase B). */
  boundMetricKeys: readonly string[]
  /** Per-requirement currency for THIS standard (Phase C `RequirementCurrency`, projected). */
  requirements: readonly TwinRequirementView[]
}

/**
 * The ARTIFACT axis — Phase C's `EvidenceGroup`, projected. One tag, N standards.
 *
 * This axis is why `deriveTwin`'s second argument is a REGISTER and not just
 * `standards[]`: `FIN-AUDIT-STALE`, `EVI-STALE` and `EVI-MISSING-REQUIRED` are
 * facts about an artifact ("one audit, nine standards"), and re-deriving artifact
 * currency from per-standard rows would be a second copy of
 * `computeRequirementCurrency` — the precise defect Phase C exists to prevent.
 */
export interface TwinEvidenceGroupView {
  tag: string
  label: string
  state: CurrencyState
  dataAvailability: DataAvailability
  expiresOn: string | null
  daysUntilExpiry: number | null
  servesStandards: readonly { standardId: string; code: string }[]
  /** True when ANY served standard is an assurance gate. Precomputed by the caller. */
  servesAssurance: boolean
}

/**
 * AIC Phase F — ONE OPEN CITATION GROUP, pre-aggregated by the caller.
 *
 * THE GROUPING KEY IS (code, visitDate) — a PAIR, never the code alone. A school
 * cited on the same standard at two different visits produces TWO groups, because
 * the sentence this feeds names a visit date: collapsing 2015 and 2021 into one
 * group and quoting the later date would tell a school that both citations came
 * from the 2021 team, which is a sentence out-running its own arithmetic. One
 * group = one code + one visit, so `openCount` and `visitDate` are true together.
 *
 * `code` is the NORMALISED cited code (trim + uppercase). The engine matches it
 * against `TwinStandardView.code` by EXACT EQUALITY after the same normalisation
 * and by nothing else: no prefix match, no substring match, no edit distance, no
 * stripping of a framework prefix. A group whose code matches no standard NEVER
 * reaches this array — the API keeps unmatched citations on its own register
 * endpoint, because a finding that cannot name a real standard code cannot fire
 * (G3), and a citation matched to the WRONG standard is worse than an unmatched
 * one.
 *
 * NOTHING HERE MAY CALIBRATE A PROBABILITY OR A LIKELIHOOD (plan G10, D4 frozen).
 * One visiting team per six years per school is not calibratable.
 * `ACC-PRIOR-FINDING-OPEN` sets severity, likelihood, confidence and horizon as
 * LITERALS for exactly that reason, and no `TWIN_THRESHOLDS` entry reads this.
 */
export interface TwinPriorVisitCitationView {
  code: string
  /** The ONE visit every citation in this group came from. yyyy-mm-dd. */
  visitDate: string
  /** Citations against `code` from THAT visit that are still recorded open. */
  openCount: number
}

/**
 * AIC Phase F — the staff-evaluation register, as THREE INTEGERS.
 *
 * ADULT-STAFF EMPLOYMENT PII never crosses this boundary. There is no id, no
 * personId, no evaluator name and no cycle label here, and `HR-EVAL-OVERDUE`'s
 * `evidence[]` is counts and days only. Null when the register was unreadable or
 * empty — the rule refuses rather than inventing a zero.
 */
export interface TwinStaffEvaluationSummaryView {
  registerSize: number
  overdueCount: number
  /** Days past due for the OLDEST still-overdue row. 0 when none is overdue. */
  oldestOverdueDays: number
}

/**
 * AIC Phase F — the compliance-inspection subset of the facilities register.
 *
 * `overdueKinds` arrives ALREADY ORDERED by the caller's frozen vocabulary and
 * `anyLifeSafety` arrives as a boolean: this pure package owns the humanising
 * table below and nothing else about the kind vocabulary, so widening the
 * vocabulary is one edit in the API and one line here.
 */
export interface TwinComplianceInspectionSummaryView {
  trackedCount: number
  overdueCount: number
  oldestOverdueDays: number
  /** DISTINCT kinds among the OVERDUE items, in the caller's frozen kind order. */
  overdueKinds: readonly string[]
  /** True when any overdue kind is in the caller's life-safety subset. */
  anyLifeSafety: boolean
}

export interface TwinRegisterView {
  frameworkCode: string | null
  standards: readonly TwinStandardView[]
  evidenceGroups: readonly TwinEvidenceGroupView[]
  /** AIC Phase F. ALWAYS present; `[]` when the register is empty or unreadable. */
  priorVisitCitations: readonly TwinPriorVisitCitationView[]
  /** AIC Phase F. Null when the register was unreadable or empty. COUNTS ONLY. */
  staffEvaluations: TwinStaffEvaluationSummaryView | null
  /** AIC Phase F. Null when the register was unreadable or holds no flagged item. */
  complianceInspections: TwinComplianceInspectionSummaryView | null
  demoData: boolean
  snapshotAsOf: string | null
}

/**
 * A PREVIOUS observation of one register.
 *
 * Three rules compare two observations of a register, and neither the signal
 * catalog nor `TrendSignal` carries a previous observation — `TrendSignal` is a
 * five-reading statistic and these are two-reading comparisons that must never
 * borrow its vocabulary. Priors arrive as DATA so the function stays pure.
 */
export interface PriorFact {
  value: number | string | boolean | null
  observedOn: string | null
  cells: readonly SmallCell[] | null
}

// ─────────────────────────────────────────────────────────────────────────────
// §1.4 OUTPUT
// ─────────────────────────────────────────────────────────────────────────────

export type TwinSeverity = 'info' | 'warn' | 'critical'
export type TwinLikelihood = 'possible' | 'likely'
export type TwinRiskBand = 'clear' | 'watch' | 'elevated' | 'high' | 'critical'

export const TWIN_SEVERITIES = ['info', 'warn', 'critical'] as const
export const TWIN_LIKELIHOODS = ['possible', 'likely'] as const

export interface TwinEvidenceEntry {
  key: string
  label: string
  value: number | string | boolean | null
  /** The RENDERED string. Every numeral in a rationale comes from one of these. */
  display: string
  asOf: string | null
  lineage: TwinSignalLineage | null
}

export interface TwinFinding {
  ruleId: TwinRuleId
  /** 'school' | 'standard:<id>' | 'evidence:<tag>' */
  scopeKey: string
  factKey: string
  title: string
  /** Composed by the engine from `rationaleTemplate` + evidence. NEVER by a caller. */
  rationale: string
  /** The BASIS CHAIN. Non-empty for every finding. */
  evidence: TwinEvidenceEntry[]
  standardTags: string[]
  domainKeys: DomainKey[]
  defaultDomainKey: DomainKey
  severity: TwinSeverity
  likelihood: TwinLikelihood
  confidence: TrendConfidence
  horizon: Horizon
  /** 'The accreditation consequence' — one sentence, for the briefing and the rail. */
  consequence: string
}

export type NotEvaluatedReason =
  | 'signal_not_licensed'
  | 'signal_no_data'
  | 'signal_not_tracked'
  | 'signal_present_but_expected_absent'
  | 'no_prior_observation'
  | 'no_standards'
  | 'value_not_usable'
  | 'cells_suppressed'

export interface TwinNotEvaluated {
  ruleId: TwinRuleId
  title: string
  reason: NotEvaluatedReason
  /** THE BLOCKING SIGNAL, NAMED. Null only for 'no_standards'. */
  blockingSignalKey: string | null
  blockingSignalLabel: string | null
  /** The signal's OWN `unavailableReason` when it has one; else a frozen sentence. */
  message: string
  moduleKey: string | null
  unlock: TwinRuleUnlock | null
}

export interface TwinRiskDriver {
  component: 'C' | 'T' | 'E'
  /**
   * DEVIATION, documented: the spec writes `40 | 40 | 20`, which is the degenerate
   * union `40 | 20`. Written as the union it actually is.
   */
  weight: 40 | 20
  /**
   * 0..1, UNROUNDED. Rounding it here would make `40·C + 40·T + 20·E` fail to
   * reproduce `risk`, and a driver set that does not add up to its own score is
   * exactly the unarguable number this design refuses to ship.
   */
  raw: number
  /** weight * raw, rounded to 1dp */
  contribution: number
  /** Rendered verbatim. NAMES THE HOLE when `raw` is 0 for want of data. */
  detail: string
}

export interface TwinStandardRisk {
  standardId: string
  code: string
  /** 0..100, or NULL when the standard has zero evidence (NEVER 0). */
  risk: number | null
  band: TwinRiskBand | null
  /** MANDATORY and non-empty whenever risk !== null; also present on the bypass. */
  drivers: TwinRiskDriver[]
  /** Set when the formula was bypassed. */
  bypass: 'unmet_assurance' | null
  /** Non-null exactly when risk === null. */
  reason: string | null
  findingCount: number
  findingKeys: string[]
}

export interface TwinDomainBand {
  domainKey: DomainKey
  /** null === not measured. */
  band: TwinRiskBand | null
  /** Non-null exactly when band === null. */
  reason: string | null
  /** DISTINCT factKeys whose primary domain is this domain, by severity. */
  facts: { critical: number; warn: number; info: number; total: number }
  standardCount: number
  availableSignalCount: number
}

export interface TwinCoverage {
  rulesTotal: number
  rulesEvaluated: number
  rulesFired: number
  rulesNotEvaluated: number
  /** rulesEvaluated / rulesTotal, 0..1, 3dp. */
  evaluablePct: number
  signals: { available: number; not_licensed: number; no_data: number; not_tracked: number }
  /** moduleKey -> rule ids blocked PURELY by licensing. The upsell surface. */
  blockedByModule: Record<string, TwinRuleId[]>
  /**
   * Rules whose signal is readable but whose series is too short to be read.
   *
   * THIS IS SCOPED TO EXACTLY ONE SIGNAL, and that is the whole point. The first
   * cut aggregated across every short signal: `yearsNeeded` was the MINIMUM gap
   * over all of them while the fiscal-year label was the MINIMUM first year over
   * all of them — two different signals in the general case — and the CTA printed
   * the rule count next to that label. A school with a 3-reading margin series and
   * a 4-reading ratio series was told "2 more rules unlock when you add FY2021–22",
   * which unlocked neither. This is the one CTA in the product whose entire
   * premise is that the ask is honest, so the ask now names ONE signal, EVERY year
   * that signal needs, and ONLY the rules that read that signal.
   */
  unlockableByYears: {
    /** The signal this ask is about. Null when there is nothing to ask for. */
    signalKey: string | null
    /** ONLY the rules blocked on `signalKey`. */
    ruleIds: TwinRuleId[]
    /**
     * The NEAREST unlock — the fewest additional annual readings that would make
     * any listed rule evaluable. Not the worst case: the CTA this feeds is an ask
     * of a school ("add one more year"), and quoting the longest gap would make
     * the smallest useful action look impossible.
     */
    yearsNeeded: number
    /**
     * EVERY year that signal needs, counting back from its earliest reading —
     * `yearsNeeded` entries, e.g. ['FY2023–24', 'FY2022–23']. Empty when there is
     * nothing to ask for. Naming one year while needing two is how the ask stops
     * being true.
     */
    fyLabels: string[]
  }
  /** The four visible holes, with the intake that closes each. */
  namedHoles: { ruleId: TwinRuleId; intake: string; copy: string }[]
}

export interface TwinResult {
  version: string
  now: string
  frameworkCode: string | null
  demoData: boolean
  snapshotAsOf: string | null
  findings: TwinFinding[]
  notEvaluated: TwinNotEvaluated[]
  coverage: TwinCoverage
  perStandardRisk: TwinStandardRisk[]
  /** ALWAYS all ten, in `DOMAIN_KEYS` order. */
  domainBands: TwinDomainBand[]
}

// ─────────────────────────────────────────────────────────────────────────────
// §1.3 THE RULE DEFINITION
// ─────────────────────────────────────────────────────────────────────────────

export type TwinRuleKind = 'register' | 'trend' | 'comparison' | 'standard' | 'evidence' | 'meta'

export type TwinFrameworkCode = 'cognia_2022' | 'msa_cess_2022' | 'nsbecs'

export const TWIN_FRAMEWORK_CODES = ['cognia_2022', 'msa_cess_2022', 'nsbecs'] as const

export interface TwinRuleUnlock {
  moduleKey: string | null
  intake: string
  copy: string
}

/**
 * What a rule's `evaluate` returns.
 *
 * DEVIATION, documented and load-bearing: the spec types `evaluate` as returning
 * `TwinFinding[]`, but `TwinFinding.rationale` is explicitly "composed by the
 * engine … NEVER by a caller". A rule therefore cannot return a complete
 * `TwinFinding` without violating the rule it exists to obey. The draft omits the
 * one field the engine owns, and carries the template variant when a rule has two
 * frozen sentences for two genuinely different facts.
 */
export interface TwinFindingDraft {
  scopeKey: string
  factKey: string
  /** Defaults to the rule's own title. Never contains a numeral. */
  title?: string
  evidence: TwinEvidenceEntry[]
  /** Codes the rule itself resolved — merged with the def's per-framework codes. */
  standardCodes?: readonly string[]
  domainKeys?: readonly DomainKey[]
  defaultDomainKey?: DomainKey
  severity: TwinSeverity
  likelihood: TwinLikelihood
  confidence: TrendConfidence
  horizon: Horizon
  consequence: string
  templateVariant?: 'primary' | 'low'
}

/**
 * The read-only façade handed to `evaluate`.
 *
 * `signal()` and `prior()` THROW on a key the rule did not declare. A rule can
 * therefore never read a signal it did not gate on, which is what makes the
 * availability gate a guarantee rather than a convention.
 */
export interface RuleContext {
  now: string
  signal(key: string): TwinSignalView
  prior(key: string): PriorFact
  register: TwinRegisterView
  bands(metricKey: string): TargetBands | undefined
  thresholds: typeof TWIN_THRESHOLDS
  /**
   * THE ONE ESCAPE HATCH, used by exactly one rule.
   *
   * `SCHOOL-NOT-REPORTING` is a statement ABOUT the signal set ("three of your
   * signals have gone quiet"), so it cannot declare its inputs in advance. It is
   * the only caller; a read-only snapshot cannot be used to bypass the gate for
   * any other rule because every other rule's predicate reads `signal()`.
   */
  allSignals(): readonly TwinSignalView[]
}

export interface TwinRuleDef {
  id: TwinRuleId
  kind: TwinRuleKind
  /** Card/rail headline. Never contains a numeral. */
  title: string
  /** Every signal that must be `available`. THE gate. */
  requiredAvailable: readonly string[]
  /**
   * Every signal that must be `no_data` — the ABSENCE is the fact.
   *
   * INVARIANT: every key here shares a memoised query group in
   * `TwinSignalsService` with at least one `requiredAvailable` key, so "the query
   * ran and found nothing" is DISTINGUISHABLE from "the query failed". Used by
   * exactly one rule (`GOV-MINUTES-NEVER-RECORDED`, whose partner
   * `gov.meeting_cadence` shares `ctx.meetings()`).
   */
  requiredAbsent: readonly string[]
  /** Signals whose PRIOR observation the predicate needs. */
  requiredPriors: readonly string[]
  /** True when the rule reads `register.standards` / `register.evidenceGroups`. */
  needsRegister: boolean
  /** Accreditation domains the rule TOUCHES. Rendering only. */
  domainKeys: readonly DomainKey[]
  /** Used when `standardTags` resolve to no domain weight at all. */
  defaultDomainKey: DomainKey
  /** Catalog standard CODES, per framework. Resolved against the school's register. */
  standardCodes: Readonly<Record<TwinFrameworkCode, readonly string[]>>
  /** Frozen template. `/\d/` never matches OUTSIDE a `{{…}}` placeholder. */
  rationaleTemplate: string
  /**
   * The second frozen sentence, for rules whose fact has two genuinely different
   * shapes (a lapsed artifact vs an expiring one; a confirmed direction vs a
   * shorter series that cannot yet confirm one). Selected by
   * `TwinFindingDraft.templateVariant`.
   */
  rationaleTemplateLow?: string
  /** The intake that would unlock this rule, when it cannot fire today. */
  unlock: TwinRuleUnlock | null
  evaluate(c: RuleContext): readonly TwinFindingDraft[]
}

/**
 * The frozen ordered vocabulary: 25 firing rules + 4 visible holes.
 *
 * AIC PHASE F took this 26 → 29. `AIC-final-plan.md` §PHASE F promised that the
 * StaffEvaluation and MaintenanceItem.complianceKind intakes would "flip
 * HR-EVAL-OVERDUE / FAC-INSPECTION-DUE live" — but Phase E never wrote either
 * rule, and neither id existed anywhere in the tree. Under a literal reading the
 * phase would light two signals no rule reads. So Phase F WRITES the two rules the
 * plan assumed, plus `ACC-PRIOR-FINDING-OPEN` for the prior-visit register the plan
 * gave no rule id at all. `VISIBLE_HOLE_RULE_IDS` is UNCHANGED at four: none of the
 * three new rules is a named hole, and none of the four named holes is closed here
 * (HR-PD-LOW and SAFE-ENV-GAP are Phase K, CURR-DOC-AGING is one Policy row away,
 * ACAD-GROWTH-FLAT is deferred).
 *
 * The Phase-E scope's prose list counts 23 only if `STRAT-PLAN-EXPIRING
 * (365/180/90)` is read as three rules. It is ONE ruleId with three severity
 * bands over ONE fact (a plan's end date). Splitting it would put three ledger
 * rows behind one date — tripling the ack surface and the notification, and
 * breaking the "one fact, one finding" discipline `factKey` exists to protect.
 * No 23rd rule is invented to make a prose count come out.
 */
export const TWIN_RULE_IDS = [
  'GOV-MINUTES-LAG',
  'GOV-MINUTES-NEVER-RECORDED',
  'GOV-CADENCE-GAP',
  'GOV-POLICY-OVERDUE',
  'GOV-TERM-EXPIRY',
  'GOV-COMMITTEE-NO-CHAIR',
  'FIN-AUDIT-STALE',
  'FIN-RESERVE-THIN',
  'FIN-BUDGET-DETERIORATING',
  'FIN-AR-AGING-WORSENING',
  'STRAT-PLAN-EXPIRING',
  'STRAT-PLAN-EXPIRED',
  'ENR-DECLINE',
  'ENR-FEEDER-EROSION',
  'ACC-UNSCORED',
  'ACC-UNSUPPORTED-SCORE',
  'ACC-ASSURANCE-GAP',
  'EVI-STALE',
  'EVI-MISSING-REQUIRED',
  'FAC-BACKLOG',
  'HR-RATIO-DRIFT',
  'SCHOOL-NOT-REPORTING',
  'HR-PD-LOW',
  'SAFE-ENV-GAP',
  'CURR-DOC-AGING',
  'ACAD-GROWTH-FLAT',
  // ── AIC Phase F. Appended, never interleaved: this order is the render order.
  'HR-EVAL-OVERDUE',
  'FAC-INSPECTION-DUE',
  'ACC-PRIOR-FINDING-OPEN',
] as const

export type TwinRuleId = (typeof TWIN_RULE_IDS)[number]

/** The four that ship VISIBLE and cannot evaluate. A feature, in this order. */
export const VISIBLE_HOLE_RULE_IDS = [
  'HR-PD-LOW',
  'SAFE-ENV-GAP',
  'CURR-DOC-AGING',
  'ACAD-GROWTH-FLAT',
] as const satisfies readonly TwinRuleId[]

// ─────────────────────────────────────────────────────────────────────────────
// §2.0 FROZEN THRESHOLDS
//
// EVERY ENTRY IS A TUNABLE SECTOR DEFAULT, documented as such exactly like
// `DEFAULT_BANDS` in packages/analytics/src/health.ts and `expectedCadenceDays`
// in the twin signal catalog. None of these is a hard truth; each ships its own
// one-sentence `basis` so a school reads the reasoning, not just the number.
// ─────────────────────────────────────────────────────────────────────────────

interface Threshold<T extends number> {
  value: T
  basis: string
}

const t = <T extends number>(value: T, basis: string): Threshold<T> => ({ value, basis })

export const TWIN_THRESHOLDS = Object.freeze({
  MINUTES_LAG_WARN_DAYS: t(
    60,
    'Two board cycles. Minutes approved at the next meeting is normal; a second meeting passing is not.',
  ),
  MINUTES_LAG_CRITICAL_DAYS: t(
    120,
    'Two meetings missed. A visiting team reads this as a governance-record failure.',
  ),
  MIN_BOARD_MEETINGS_PER_YEAR: t(
    4,
    "Quarterly is the floor every one of the three frameworks' governance standards assumes.",
  ),
  POLICY_OVERDUE_CRITICAL_COUNT: t(
    5,
    'Below five is a queue; at five it is a policy-review process that has stopped.',
  ),
  BOARD_TERMS_CRITICAL_COUNT: t(3, 'Three expired terms can be a quorum question.'),
  RESERVE_RISK_MONTHS: t(
    // READ FROM @finrep/analytics, NEVER RE-TYPED. A spec asserts equality with
    // bandsFor('months_operating_reserve').risk.
    bandsFor('months_operating_reserve')?.risk ?? 3,
    'The sector risk line for months of operating reserve, read from the analytics band table — never re-typed here.',
  ),
  AR_WORSEN_FRACTION: t(
    0.25,
    'A quarter-over-quarter rise in 90-plus receivables is past normal seasonal noise.',
  ),
  ENR_DECLINE_FRACTION: t(
    0.03,
    'Three per cent of headcount. In a 200-student school that is six families — the smallest move that is not one family moving away.',
  ),
  ENR_DECLINE_CRITICAL_FRACTION: t(
    0.07,
    'Seven per cent in one observation is a budget event, not a variance.',
  ),
  FEEDER_EROSION_FRACTION: t(
    0.15,
    'Entry cohorts are small; fifteen per cent is the smallest move that clears cell noise at the minimum publishable cell.',
  ),
  FAC_BACKLOG_WARN_COUNT: t(10, 'Ten open items is a register nobody is working.'),
  FAC_BACKLOG_CRITICAL_COUNT: t(
    25,
    'Twenty-five open items is a deferred-maintenance position, not a queue.',
  ),
  STALE_SIGNAL_MIN_COUNT: t(
    3,
    'One stale signal is a holiday; three is a school that stopped reporting.',
  ),
  PLAN_EXPIRY_INFO_DAYS: t(
    365,
    'A plan takes about a year to write, so the first warning has to arrive a year out.',
  ),
  PLAN_EXPIRY_WARN_DAYS: t(180, 'Half a year out, writing a successor plan has to be under way.'),
  PLAN_EXPIRY_CRITICAL_DAYS: t(
    90,
    'Ninety days is too late to start, which is exactly why a ninety-day warning alone is useless.',
  ),
  ACC_UNSCORED_CRITICAL_FRACTION: t(
    0.34,
    'A third of the register unscored is not a gap list, it is an unstarted self-study.',
  ),
  // ── AIC Phase F. Three COUNT/DAY thresholds and deliberately NO FRACTION.
  // A "% of staff evaluated" needs a staff denominator, and GovernancePerson with
  // `groups ∋ 'staff'` is a partial, opt-in roster. Dividing by a denominator we
  // cannot vouch for is exactly the class of claim that out-runs the arithmetic.
  // Nothing below reads prior-visit data: that register may not calibrate anything.
  STAFF_EVAL_OVERDUE_WARN_COUNT: t(
    3,
    'One late evaluation is a calendar. Three is a cycle that has slipped, and three is what a visiting team will find in the sample it pulls.',
  ),
  STAFF_EVAL_OVERDUE_CRITICAL_COUNT: t(
    10,
    'Ten outstanding evaluations is an evaluation process that has stopped, not a queue.',
  ),
  STAFF_EVAL_OVERDUE_CRITICAL_DAYS: t(
    365,
    'A full year past its own due date is a missed cycle, not a late one — and it is one whole review period a team can point at.',
  ),
} as const)

/** Entry-grade keys, frozen ORDER. The two lowest matched keys are the entry cohort. */
export const ENTRY_GRADE_KEYS = ['PK', 'PK3', 'PK4', 'TK', 'K', 'KG', '0', '1'] as const

/** The rubric ceiling, read from the frozen readiness engine. Never re-typed. */
const RUBRIC_CEILING = RUBRIC_MAX

/** Frozen fallback when a signal is unavailable and offers no reason of its own. */
export const TWIN_NO_REASON_FALLBACK =
  'This signal could not be read on this run, and it offered no reason of its own.'

/** Frozen refusal copy. Rendered VERBATIM. */
const HORIZON_CONDITION_TODAY = 'This is a condition today, not a projection.'
const HORIZON_ALREADY_BELOW =
  'Already below its risk threshold — this is a condition, not a forecast.'
const HORIZON_DATE_PASSED = 'The date has passed — this is a condition, not a forecast.'
const HORIZON_TERMS_LAPSED = 'We can see which terms have lapsed, not when the next one will.'

/**
 * Shipped in the payload beside FAC-BACKLOG. The refusal is the point: a free-text
 * maintenance title is not an inspection record and we will not read one as the other.
 */
export const FAC_BACKLOG_HONESTY_NOTE =
  'We can say a recurring facilities item is overdue. We will not say your fire inspection is overdue by guessing at free text — see fac.inspections.'

/**
 * AIC Phase F — how a compliance-inspection KIND is said out loud.
 *
 * The sentence FAC_BACKLOG_HONESTY_NOTE makes is STILL TRUE after Phase F: we
 * still refuse to guess a kind out of a free-text title. What changed is that a
 * school can now DECLARE the kind on the item, and this table is the only place
 * that declaration is turned into English. It is not the vocabulary's authority —
 * the closed list lives in the API's DTO and arrives here already ordered — so an
 * unmapped kind is rendered from its own key rather than dropped or guessed at.
 */
const COMPLIANCE_KIND_LABEL: Readonly<Record<string, string>> = Object.freeze({
  fire_life_safety: 'fire and life-safety',
  boiler: 'boiler',
  elevator: 'elevator',
  asbestos: 'asbestos',
  health: 'health',
  water_quality: 'water quality',
  playground: 'playground',
})

/** An unmapped kind is said as itself, never inferred into a kind we do know. */
function complianceKindLabel(kind: string): string {
  return COMPLIANCE_KIND_LABEL[kind] ?? kind.replace(/_/g, ' ')
}

// ─────────────────────────────────────────────────────────────────────────────
// ERRORS
// ─────────────────────────────────────────────────────────────────────────────

/** A rule that cannot name its own basis is a bug that must not reach a school. */
export class TwinTemplateError extends Error {
  constructor(
    readonly ruleId: string,
    readonly placeholder: string,
  ) {
    super(
      `Rule ${ruleId} rendered a rationale with an unresolved placeholder {{${placeholder}}} — every numeral in a rationale must come from evidence[].`,
    )
    this.name = 'TwinTemplateError'
  }
}

/** A rule reaching for a signal it did not declare. Thrown by the façade. */
export class TwinUndeclaredSignalError extends Error {
  constructor(
    readonly ruleId: string,
    readonly signalKey: string,
  ) {
    super(
      `Rule ${ruleId} read signal '${signalKey}', which it did not declare in requiredAvailable/requiredAbsent/requiredPriors.`,
    )
    this.name = 'TwinUndeclaredSignalError'
  }
}

/**
 * A rule refusing MID-PREDICATE, with the reason and the blocking signal named.
 *
 * Two rules need this because their gate cannot be expressed as an availability
 * check: `STRAT-PLAN-EXPIRING` needs the plan's value to be a DATE (a plan that
 * records only a fiscal end year cannot be counted down to), and
 * `ENR-FEEDER-EROSION` needs at least one entry-grade cell to survive small-cell
 * suppression in BOTH observations. Throwing keeps `evaluate` pure and keeps the
 * refusal in `notEvaluated[]` where a caller can read it.
 */
export class TwinCannotEvaluate extends Error {
  constructor(
    readonly reason: NotEvaluatedReason,
    readonly blockingSignalKey: string | null,
    readonly detail: string,
  ) {
    super(detail)
    this.name = 'TwinCannotEvaluate'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PURE HELPERS — date, number and string rendering.
//
// `now` is a string, every date is a civil date, and the month-name table is a
// frozen constant. There is no locale, no timezone and no clock anywhere below.
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

/** Whole civil days between two yyyy-mm-dd dates (b − a). Null on an unparseable input. */
export function daysBetweenCivil(a: string, b: string): number | null {
  const ca = toCivil(a)
  const cb = toCivil(b)
  if (!ca || !cb) return null
  return daysFromCivil(cb.y, cb.m, cb.d) - daysFromCivil(ca.y, ca.m, ca.d)
}

/** '2026-06-30' -> '30 June 2026'. Returns the input verbatim when unparseable. */
export function formatCivilDate(iso: string | null): string {
  if (!iso) return ''
  const c = toCivil(iso)
  if (!c) return iso
  return `${c.d} ${MONTH_NAMES[c.m - 1]} ${c.y}`
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return n < 0 ? 0 : n > 1 ? 1 : n
}

function withThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function fmtCount(n: number): string {
  return withThousands(String(Math.round(n)))
}

/**
 * A DAY COUNT WITH ITS OWN NOUN, correctly inflected — "1 day", "40 days".
 *
 * A frozen sentence that reads "past its own target date, by 1 days" is a
 * sentence that out-runs its own arithmetic in the smallest possible way, and it
 * is reachable on the FIRST day a target date passes (both Phase-F rules refuse
 * below one day, so 1 is their minimum firing value). Carrying the noun inside
 * the evidence `display` rather than in the template keeps the numeral traceable
 * — §5's extraction spec reads `display`, and "1 day" still contains "1" — while
 * letting one helper own the inflection for every template that quotes a day.
 */
function fmtDays(n: number): string {
  const d = Math.round(n)
  return `${fmtCount(d)} ${d === 1 ? 'day' : 'days'}`
}

function fmtMoney(n: number): string {
  const sign = n < 0 ? '-' : ''
  return `${sign}$${withThousands(String(Math.round(Math.abs(n))))}`
}

function fmt1(n: number): string {
  return n.toFixed(1)
}

/** 0.088 -> '8.8%' */
function fmtPct1(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`
}

/** 0.6381 -> '64%' */
function fmtPct0(ratio: number): string {
  return `${Math.round(ratio * 100)}%`
}

/** A metric VALUE rendered in its own unit, so the rationale and the card agree. */
function fmtMetricValue(v: number, unit: TrendSignal['unit']): string {
  switch (unit) {
    case 'percent':
    case 'share':
      return fmtPct1(v)
    case 'currency':
      return fmtMoney(v)
    case 'days':
      return fmtCount(v)
    case 'months':
    case 'ratio':
    default:
      return fmt1(v)
  }
}

/** An annual SLOPE rendered in its own unit. Percentage series move in POINTS. */
function fmtSlopePerYear(slope: number, unit: TrendSignal['unit']): string {
  const a = Math.abs(slope)
  switch (unit) {
    case 'percent':
    case 'share':
      return `${(a * 100).toFixed(1)} percentage points`
    case 'currency':
      return fmtMoney(a)
    default:
      return fmt1(a)
  }
}

function fmtFy(fy: number | undefined | null): string {
  return fy === undefined || fy === null ? '' : `FY${fy}`
}

/** 2024 -> 'FY2023–24'. The label a school sees on its own uploader. */
function fyRangeLabel(fy: number): string {
  return `FY${fy - 1}–${String(fy).slice(2)}`
}

function ev(
  key: string,
  label: string,
  value: number | string | boolean | null,
  display: string,
  asOf: string | null = null,
  lineage: TwinSignalLineage | null = null,
): TwinEvidenceEntry {
  return { key, label, value, display, asOf, lineage }
}

const SEVERITY_RANK: Readonly<Record<TwinSeverity, number>> = { critical: 0, warn: 1, info: 2 }
const SEVERITY_FACT_WEIGHT: Readonly<Record<TwinSeverity, number>> = {
  critical: 1.0,
  warn: 0.6,
  info: 0.25,
}

const NO_HORIZON = (reason: string): Horizon => ({
  kind: 'none',
  value: null,
  confidence: null,
  reason,
})

/**
 * A STATED REGISTER DATE, never a projection.
 *
 * `horizon.confidence` is deliberately `null`: a plan's end date or an artifact's
 * expiry is a FACT the school wrote down, and attaching a statistical confidence
 * to it would be a category error. `estimateHorizon` remains the only producer of
 * `periods_to_breach`, and only at `confidence: 'trend'`.
 */
const BY_DATE = (iso: string): Horizon => ({
  kind: 'by_date',
  value: iso,
  confidence: null,
  reason: null,
})

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// §2 THE RULE CATALOG
// ─────────────────────────────────────────────────────────────────────────────

const TH = TWIN_THRESHOLDS

const GOV_CODES: Readonly<Record<TwinFrameworkCode, readonly string[]>> = {
  cognia_2022: ['COG-8', 'COG-A1'],
  msa_cess_2022: ['MSA-2'],
  nsbecs: ['NSBECS-5'],
}

const FIN_CODES: Readonly<Record<TwinFrameworkCode, readonly string[]>> = {
  cognia_2022: ['COG-15'],
  msa_cess_2022: ['MSA-4'],
  nsbecs: ['NSBECS-10'],
}

const NO_CODES: Readonly<Record<TwinFrameworkCode, readonly string[]>> = {
  cognia_2022: [],
  msa_cess_2022: [],
  nsbecs: [],
}

// ── 2.1 GOVERNANCE ───────────────────────────────────────────────────────────

const GOV_MINUTES_LAG: TwinRuleDef = {
  id: 'GOV-MINUTES-LAG',
  kind: 'register',
  title: 'Board minutes are approved long after the meeting they record',
  requiredAvailable: ['gov.minutes_lag'],
  requiredAbsent: [],
  requiredPriors: [],
  needsRegister: false,
  domainKeys: ['governance'],
  defaultDomainKey: 'governance',
  standardCodes: GOV_CODES,
  rationaleTemplate:
    'The most recently approved board minutes were approved {{lagDays}} days after the meeting they record, against a working expectation of {{threshold}} days.',
  unlock: null,
  evaluate(c) {
    const s = c.signal('gov.minutes_lag')
    const lag = num(s.value)
    if (lag === null || lag <= TH.MINUTES_LAG_WARN_DAYS.value) return []
    const critical = lag > TH.MINUTES_LAG_CRITICAL_DAYS.value
    return [
      {
        scopeKey: 'school',
        factKey: `register:minutes_lag@${s.observedOn ?? 'undated'}`,
        evidence: [
          ev('lagDays', 'Days from meeting to approved minutes', lag, fmtCount(lag), s.observedOn, s.lineage),
          ev(
            'threshold',
            'Working expectation',
            TH.MINUTES_LAG_WARN_DAYS.value,
            fmtCount(TH.MINUTES_LAG_WARN_DAYS.value),
          ),
        ],
        severity: critical ? 'critical' : 'warn',
        likelihood: critical ? 'likely' : 'possible',
        confidence: 'observation',
        horizon: NO_HORIZON(HORIZON_CONDITION_TODAY),
        consequence:
          "A visiting team reads minute lag as evidence of whether the board's decisions are actually recorded; this is cited under the governance standard.",
      },
    ]
  },
}

const GOV_MINUTES_NEVER_RECORDED: TwinRuleDef = {
  id: 'GOV-MINUTES-NEVER-RECORDED',
  kind: 'register',
  title: 'No board meeting has approved minutes on file',
  requiredAvailable: ['gov.meeting_cadence'],
  // THE ABSENCE IS THE FACT, and it is sound rather than a hack: both collectors
  // share the same memoised meetings query, so if that query had failed BOTH
  // signals would read no_data. Cadence available + minutes_lag no_data therefore
  // proves the query ran, meetings were held, and not one of them has approved
  // minutes — the collector's own documented null-return branch.
  requiredAbsent: ['gov.minutes_lag'],
  requiredPriors: [],
  needsRegister: false,
  domainKeys: ['governance'],
  defaultDomainKey: 'governance',
  standardCodes: GOV_CODES,
  rationaleTemplate:
    '{{meetingsHeld}} board meetings were held in the last twelve months and not one of them has approved minutes on file.',
  unlock: null,
  evaluate(c) {
    const s = c.signal('gov.meeting_cadence')
    const held = num(s.value)
    if (held === null || held < 1) return []
    return [
      {
        scopeKey: 'school',
        factKey: 'register:minutes_never_approved@school',
        evidence: [
          ev('meetingsHeld', 'Board meetings held', held, fmtCount(held), s.observedOn, s.lineage),
        ],
        severity: 'warn',
        likelihood: 'likely',
        confidence: 'observation',
        horizon: NO_HORIZON(HORIZON_CONDITION_TODAY),
        consequence:
          'Approved minutes are the primary artifact for the governance standard; without them the board’s oversight is undocumented rather than absent — and a visiting team can only evidence what is documented.',
      },
    ]
  },
}

const GOV_CADENCE_GAP: TwinRuleDef = {
  id: 'GOV-CADENCE-GAP',
  kind: 'register',
  title: 'The board is meeting less often than every framework assumes',
  requiredAvailable: ['gov.meeting_cadence'],
  requiredAbsent: [],
  requiredPriors: [],
  needsRegister: false,
  domainKeys: ['governance'],
  defaultDomainKey: 'governance',
  standardCodes: GOV_CODES,
  rationaleTemplate:
    '{{meetingsHeld}} board meetings were held in the last twelve months, against a working expectation of {{expected}}.',
  unlock: null,
  evaluate(c) {
    const s = c.signal('gov.meeting_cadence')
    const held = num(s.value)
    if (held === null || held >= TH.MIN_BOARD_MEETINGS_PER_YEAR.value) return []
    return [
      {
        scopeKey: 'school',
        factKey: 'register:board_meetings@trailing12',
        evidence: [
          ev('meetingsHeld', 'Board meetings held', held, fmtCount(held), s.observedOn, s.lineage),
          ev(
            'expected',
            'Working expectation',
            TH.MIN_BOARD_MEETINGS_PER_YEAR.value,
            fmtCount(TH.MIN_BOARD_MEETINGS_PER_YEAR.value),
          ),
        ],
        severity: held === 0 ? 'critical' : 'warn',
        likelihood: held === 0 ? 'likely' : 'possible',
        confidence: 'observation',
        horizon: NO_HORIZON(HORIZON_CONDITION_TODAY),
        consequence:
          'Meeting cadence is the first thing a governance reviewer counts, and quarterly is the floor all three frameworks assume.',
      },
    ]
  },
}

const GOV_POLICY_OVERDUE: TwinRuleDef = {
  id: 'GOV-POLICY-OVERDUE',
  kind: 'register',
  title: 'Policies are past their own scheduled review date',
  requiredAvailable: ['gov.policy_review'],
  requiredAbsent: [],
  requiredPriors: [],
  needsRegister: false,
  domainKeys: ['governance'],
  defaultDomainKey: 'governance',
  standardCodes: {
    cognia_2022: ['COG-8', 'COG-11', 'COG-A1', 'COG-A4'],
    msa_cess_2022: ['MSA-2'],
    nsbecs: ['NSBECS-5', 'NSBECS-11'],
  },
  rationaleTemplate: '{{overdueCount}} policies are past their own scheduled review date.',
  unlock: null,
  evaluate(c) {
    const s = c.signal('gov.policy_review')
    const overdue = num(s.value)
    if (overdue === null || overdue < 1) return []
    return [
      {
        scopeKey: 'school',
        factKey: `register:policy_review_overdue@${s.observedOn ?? 'undated'}`,
        evidence: [
          ev('overdueCount', 'Policies overdue for review', overdue, fmtCount(overdue), s.observedOn, s.lineage),
        ],
        severity: overdue >= TH.POLICY_OVERDUE_CRITICAL_COUNT.value ? 'critical' : 'warn',
        likelihood: 'likely',
        confidence: 'observation',
        horizon: NO_HORIZON(HORIZON_CONDITION_TODAY),
        consequence:
          'The policy manual is a named artifact for the governance standard, and a manual whose review cycle has lapsed is evidence that the cycle is not operating.',
      },
    ]
  },
}

const GOV_TERM_EXPIRY: TwinRuleDef = {
  id: 'GOV-TERM-EXPIRY',
  kind: 'register',
  title: 'Board members are serving on terms that have already ended',
  requiredAvailable: ['gov.board_terms'],
  requiredAbsent: [],
  requiredPriors: [],
  needsRegister: false,
  domainKeys: ['governance'],
  defaultDomainKey: 'governance',
  standardCodes: GOV_CODES,
  rationaleTemplate: '{{expiredCount}} board members are serving on terms that have already ended.',
  unlock: null,
  // DOCUMENTED LIMITATION, stated in the payload: the shipped collector counts
  // terms ALREADY expired. It exposes no upcoming-expiry list, so this rule
  // reports a CONDITION, never a forecast, and its horizon says so. Lighting the
  // forward view is a one-field change to the collector and is out of scope here.
  evaluate(c) {
    const s = c.signal('gov.board_terms')
    const expired = num(s.value)
    if (expired === null || expired < 1) return []
    return [
      {
        scopeKey: 'school',
        factKey: `register:board_terms_expired@${s.observedOn ?? 'undated'}`,
        evidence: [
          ev('expiredCount', 'Board terms already expired', expired, fmtCount(expired), s.observedOn, s.lineage),
        ],
        severity: expired >= TH.BOARD_TERMS_CRITICAL_COUNT.value ? 'critical' : 'warn',
        likelihood: 'likely',
        confidence: 'observation',
        horizon: NO_HORIZON(HORIZON_TERMS_LAPSED),
        consequence:
          'Board composition against the school’s own bylaws is a governance-standard question, and lapsed terms are the version of it a visiting team can check in a minute.',
      },
    ]
  },
}

const GOV_COMMITTEE_NO_CHAIR: TwinRuleDef = {
  id: 'GOV-COMMITTEE-NO-CHAIR',
  kind: 'register',
  title: 'Active committees have no chair recorded',
  requiredAvailable: ['gov.committee_chairs'],
  requiredAbsent: [],
  requiredPriors: [],
  needsRegister: false,
  domainKeys: ['governance'],
  defaultDomainKey: 'governance',
  standardCodes: {
    cognia_2022: ['COG-8', 'COG-9'],
    msa_cess_2022: ['MSA-2'],
    nsbecs: ['NSBECS-5'],
  },
  rationaleTemplate: '{{committeeCount}} active committees have no chair recorded.',
  unlock: null,
  evaluate(c) {
    const s = c.signal('gov.committee_chairs')
    const without = num(s.value)
    if (without === null || without < 1) return []
    return [
      {
        scopeKey: 'school',
        // The signal is honestly UNDATED — a committee roster has no observation
        // date, and inventing today's would make the fact churn nightly.
        factKey: 'register:committees_without_chair@school',
        evidence: [
          ev('committeeCount', 'Committees without a chair', without, fmtCount(without), s.observedOn, s.lineage),
        ],
        severity: 'warn',
        likelihood: 'possible',
        confidence: 'observation',
        horizon: NO_HORIZON(HORIZON_CONDITION_TODAY),
        consequence:
          'A committee without a chair is a committee a reviewer will treat as inactive, whatever its minutes say.',
      },
    ]
  },
}

// ── 2.2 FINANCE ──────────────────────────────────────────────────────────────

const FIN_AUDIT_STALE: TwinRuleDef = {
  id: 'FIN-AUDIT-STALE',
  kind: 'evidence',
  title: 'The external financial audit on file is not current',
  requiredAvailable: ['acc.evidence_currency'],
  requiredAbsent: [],
  requiredPriors: [],
  needsRegister: true,
  domainKeys: ['finance'],
  defaultDomainKey: 'finance',
  // The codes come from the artifact's OWN servesStandards — the standards that
  // actually cite this audit in THIS school's register. A static list would tag
  // findings onto standards that do not ask for the artifact.
  standardCodes: NO_CODES,
  rationaleTemplate:
    'The most recent financial audit on file stopped being current on {{expiresOn}} — {{daysOverdue}} ago — and {{standardCount}} standards cite it.',
  rationaleTemplateLow:
    'The financial audit on file stops being current on {{expiresOn}}, in {{daysUntilExpiry}}, and {{standardCount}} standards cite it.',
  unlock: null,
  evaluate(c) {
    const g = c.register.evidenceGroups.find((x) => x.tag === 'financial_audit')
    if (!g) return []
    if (g.dataAvailability !== 'platform') return []
    if (g.state !== 'stale' && g.state !== 'expiring') return []
    const stale = g.state === 'stale'
    const codes = g.servesStandards.map((x) => x.code)
    const evidence: TwinEvidenceEntry[] = [
      ev('state', 'Evidence currency', g.state, g.state),
      ev('label', 'Artifact', g.label, g.label),
      ev('standardCount', 'Standards citing this artifact', codes.length, fmtCount(codes.length)),
    ]
    if (g.expiresOn) {
      evidence.push(ev('expiresOn', 'Current through', g.expiresOn, formatCivilDate(g.expiresOn)))
    }
    if (stale) {
      const overdue = g.daysUntilExpiry === null ? null : Math.abs(g.daysUntilExpiry)
      if (g.expiresOn === null || overdue === null) return []
      evidence.push(ev('daysOverdue', 'Days out of date', overdue, fmtDays(overdue)))
    } else {
      if (g.expiresOn === null || g.daysUntilExpiry === null) return []
      evidence.push(
        ev('daysUntilExpiry', 'Days until it lapses', g.daysUntilExpiry, fmtDays(g.daysUntilExpiry)),
      )
    }
    return [
      {
        scopeKey: 'evidence:financial_audit',
        factKey: `evidence:financial_audit@${g.expiresOn ?? 'undated'}`,
        standardCodes: codes,
        evidence,
        severity: stale ? 'critical' : 'warn',
        likelihood: stale ? 'likely' : 'possible',
        confidence: 'observation',
        horizon: g.expiresOn ? BY_DATE(g.expiresOn) : NO_HORIZON(HORIZON_CONDITION_TODAY),
        consequence:
          'The external audit is a binary assurance in Cognia and a named artifact in MSA and NSBECS; a lapsed one is the single fastest finding a visiting team can write.',
        templateVariant: stale ? 'primary' : 'low',
      },
    ]
  },
}

const FIN_RESERVE_THIN: TwinRuleDef = {
  id: 'FIN-RESERVE-THIN',
  // A LEVEL rule, not a trend. The statistics are deliberately not consulted: a
  // reserve below its risk line is a condition today whatever its direction.
  kind: 'register',
  title: 'Operating reserve is below the level the sector treats as the risk line',
  requiredAvailable: ['fin.months_operating_reserve'],
  requiredAbsent: [],
  requiredPriors: [],
  needsRegister: false,
  domainKeys: ['finance'],
  defaultDomainKey: 'finance',
  standardCodes: {
    cognia_2022: ['COG-15'],
    msa_cess_2022: ['MSA-4'],
    nsbecs: ['NSBECS-10'],
  },
  rationaleTemplate:
    'Operating reserve stands at {{reserveMonths}} months at {{asOf}}, below the {{riskThreshold}}-month level the sector treats as the risk line.',
  unlock: null,
  evaluate(c) {
    const s = c.signal('fin.months_operating_reserve')
    const months = num(s.value)
    const risk = TH.RESERVE_RISK_MONTHS.value
    if (months === null || months >= risk) return []
    const fy = s.trend?.fiscalYears.at(-1) ?? (s.observedOn ? toCivil(s.observedOn)?.y : null)
    const asOfDisplay = fy ? fmtFy(fy) : formatCivilDate(s.observedOn)
    return [
      {
        scopeKey: 'school',
        factKey: `metric:months_operating_reserve@${s.observedOn ?? 'undated'}`,
        evidence: [
          ev('reserveMonths', 'Months of operating reserve', months, fmt1(months), s.observedOn, s.lineage),
          ev('riskThreshold', 'Sector risk line', risk, fmtCount(risk)),
          ev('asOf', 'Reading', s.observedOn, asOfDisplay, s.observedOn),
        ],
        severity: months < 1.5 ? 'critical' : 'warn',
        likelihood: 'likely',
        confidence: 'observation',
        horizon: NO_HORIZON(HORIZON_ALREADY_BELOW),
        consequence:
          'Resource adequacy is the one finance standard every framework carries, and reserve months is the number a visiting team asks for first.',
      },
    ]
  },
}

/** Shared body for the two multi-year direction rules. */
function trendDraft(
  c: RuleContext,
  opts: {
    signalKey: string
    metricKey: MetricKey
    factPrefix: string
    riskIsAbove: boolean
    domainKeys: readonly DomainKey[]
    defaultDomainKey: DomainKey
    consequence: string
  },
): readonly TwinFindingDraft[] {
  const s = c.signal(opts.signalKey)
  const t = s.trend
  if (t === null) return []
  if (t.direction !== 'declining') return []
  if (!t.materiality.met) return []
  if (t.confidence !== 'directional' && t.confidence !== 'trend') return []
  if (t.firstValue === null || t.lastValue === null || t.slopePerYear === null) return []

  const confirmed = t.confidence === 'trend' && t.mannKendall !== null
  const bands = c.bands(opts.metricKey)
  const horizon = confirmed
    ? estimateHorizon(t, { currentValue: t.lastValue, bands })
    : NO_HORIZON('These readings cannot yet confirm a direction, so no horizon is projected from them.')

  const evidence: TwinEvidenceEntry[] = [
    ev('readings', 'Readings used', t.n, fmtCount(t.n)),
    ev('fyFirst', 'First fiscal year', t.fiscalYears[0] ?? null, fmtFy(t.fiscalYears[0])),
    ev('fyLast', 'Last fiscal year', t.fiscalYears.at(-1) ?? null, fmtFy(t.fiscalYears.at(-1))),
    ev('firstValue', 'First reading', t.firstValue, fmtMetricValue(t.firstValue, t.unit), t.firstDate),
    ev('lastValue', 'Last reading', t.lastValue, fmtMetricValue(t.lastValue, t.unit), t.lastDate),
    ev('slopePerYear', 'Movement a year', t.slopePerYear, fmtSlopePerYear(t.slopePerYear, t.unit)),
  ]
  if (confirmed && t.mannKendall) {
    evidence.push(ev('pValue', 'Mann-Kendall p', t.mannKendall.p, t.mannKendall.p.toFixed(4)))
  }
  if (horizon.kind === 'periods_to_breach' && typeof horizon.value === 'number') {
    evidence.push(ev('periodsToBreach', 'Annual periods to the threshold', horizon.value, fmtCount(horizon.value)))
  }

  // Escalation is a LEVEL question, asked only once the direction is confirmed.
  const past = bands
    ? opts.riskIsAbove
      ? t.lastValue > bands.risk
      : t.lastValue < bands.risk
    : false

  return [
    {
      scopeKey: 'school',
      factKey: `${opts.factPrefix}@${fmtFy(t.fiscalYears.at(-1))}`,
      evidence,
      severity: confirmed && past ? 'critical' : 'warn',
      likelihood: confirmed ? 'likely' : 'possible',
      // The trend signal's OWN confidence, verbatim. This engine never promotes it.
      confidence: t.confidence,
      horizon,
      domainKeys: opts.domainKeys,
      defaultDomainKey: opts.defaultDomainKey,
      consequence: opts.consequence,
      templateVariant: confirmed ? 'primary' : 'low',
    },
  ]
}

const FIN_BUDGET_DETERIORATING: TwinRuleDef = {
  id: 'FIN-BUDGET-DETERIORATING',
  kind: 'trend',
  title: 'Operating margin is moving the wrong way year on year',
  requiredAvailable: ['fin.operating_margin'],
  requiredAbsent: [],
  requiredPriors: [],
  needsRegister: false,
  domainKeys: ['finance'],
  defaultDomainKey: 'finance',
  standardCodes: FIN_CODES,
  rationaleTemplate:
    'Operating margin has fallen across {{readings}} readings, {{fyFirst}} to {{fyLast}} — from {{firstValue}} to {{lastValue}}, about {{slopePerYear}} a year (Mann-Kendall p = {{pValue}}).',
  // "fell in each of N readings" is a MONOTONICITY claim, and `trendDraft` selects
  // this variant on `confidence: 'directional'` — which covers a 3-4 point series
  // that merely clears the materiality floor AND an n>=5 series capped for
  // irregular spacing. Neither is monotone (0.06 -> 0.02 -> 0.04 has a declining
  // Theil-Sen slope while the LAST year rose), and `trend-signal.ts` refuses the
  // same sentence for the same reason. The copy is therefore direction-only: a
  // material Theil-Sen slope licenses "moved down across", nothing per-reading.
  // The caveat also stops blaming the READING COUNT, because at n>=5 the count is
  // sufficient and it was the spacing or the alignment that capped the ladder.
  rationaleTemplateLow:
    'Operating margin moved down across {{readings}} readings, {{fyFirst}} to {{fyLast}} — {{firstValue}} to {{lastValue}}, about {{slopePerYear}} a year. These readings cannot yet confirm a direction.',
  unlock: null,
  evaluate(c) {
    return trendDraft(c, {
      signalKey: 'fin.operating_margin',
      metricKey: 'operating_margin',
      factPrefix: 'metric:operating_margin',
      riskIsAbove: false,
      domainKeys: ['finance'],
      defaultDomainKey: 'finance',
      consequence:
        'Financial sustainability is a resource-allocation finding, and a multi-year direction is the form of it a visiting team writes up rather than notes.',
    })
  },
}

const FIN_AR_AGING_WORSENING: TwinRuleDef = {
  id: 'FIN-AR-AGING-WORSENING',
  kind: 'comparison',
  title: 'Receivables past ninety days are rising against this school’s own last snapshot',
  requiredAvailable: ['fin.ar_aging'],
  requiredAbsent: [],
  requiredPriors: ['fin.ar_aging'],
  needsRegister: false,
  domainKeys: ['finance'],
  defaultDomainKey: 'finance',
  standardCodes: FIN_CODES,
  rationaleTemplate:
    'Receivables over {{agingBucketDays}} days rose from {{ar90Prior}} at {{priorAsOf}} to {{ar90Now}} at {{asOf}} — an increase of {{increasePct}}.',
  unlock: null,
  // WHY NOT A RATIO TO TOTAL AR: the shipped collector emits ar90Plus only.
  // Inventing a denominator would be a second source of truth for a number the
  // aging snapshot already owns. The comparison is against THIS school's own
  // previous snapshot, which needs no denominator at all.
  evaluate(c) {
    const s = c.signal('fin.ar_aging')
    const p = c.prior('fin.ar_aging')
    const now90 = num(s.value)
    const prior90 = num(p.value)
    if (now90 === null || prior90 === null || prior90 <= 0) return []
    if (now90 <= prior90 * (1 + TH.AR_WORSEN_FRACTION.value)) return []
    const increase = (now90 - prior90) / prior90
    return [
      {
        scopeKey: 'school',
        factKey: `register:ar90plus@${s.observedOn ?? 'undated'}`,
        evidence: [
          ev('agingBucketDays', 'Aging bucket', 90, '90'),
          ev('ar90Now', 'Receivables over ninety days', now90, fmtMoney(now90), s.observedOn, s.lineage),
          ev('ar90Prior', 'Previous snapshot', prior90, fmtMoney(prior90), p.observedOn, s.lineage),
          ev('asOf', 'This snapshot', s.observedOn, formatCivilDate(s.observedOn), s.observedOn),
          ev('priorAsOf', 'Previous snapshot date', p.observedOn, formatCivilDate(p.observedOn), p.observedOn),
          ev('increasePct', 'Increase', increase, fmtPct0(increase)),
        ],
        severity: now90 > prior90 * 2 ? 'critical' : 'warn',
        likelihood: 'possible',
        // Two observations. Never the word this program reserves for five readings.
        confidence: 'observation',
        horizon: NO_HORIZON(HORIZON_CONDITION_TODAY),
        consequence:
          'Collections discipline is read as a resource-management control; a deteriorating aging schedule is the evidence a reviewer uses for it.',
      },
    ]
  },
}

// ── 2.3 STRATEGY ─────────────────────────────────────────────────────────────

const STRAT_CODES: Readonly<Record<TwinFrameworkCode, readonly string[]>> = {
  cognia_2022: ['COG-7', 'COG-26'],
  msa_cess_2022: ['MSA-1'],
  nsbecs: ['NSBECS-10', 'NSBECS-1'],
}

const PLAN_VALUE_NOT_USABLE =
  'Your adopted plan records a fiscal end year but no end date, so we cannot count days to it.'

/** The plan's end date, or a NAMED refusal. Shared by the two plan rules. */
function planEndDate(c: RuleContext): { endDate: string; days: number } {
  const s = c.signal('strat.plan_horizon')
  if (typeof s.value !== 'string') {
    throw new TwinCannotEvaluate('value_not_usable', 'strat.plan_horizon', PLAN_VALUE_NOT_USABLE)
  }
  const days = daysBetweenCivil(c.now, s.value)
  if (days === null) {
    throw new TwinCannotEvaluate('value_not_usable', 'strat.plan_horizon', PLAN_VALUE_NOT_USABLE)
  }
  return { endDate: s.value, days }
}

const STRAT_PLAN_EXPIRING: TwinRuleDef = {
  id: 'STRAT-PLAN-EXPIRING',
  kind: 'register',
  title: 'The adopted strategic plan is approaching its end date',
  requiredAvailable: ['strat.plan_horizon'],
  requiredAbsent: [],
  requiredPriors: [],
  needsRegister: false,
  domainKeys: ['continuous_improvement', 'leadership'],
  defaultDomainKey: 'continuous_improvement',
  standardCodes: STRAT_CODES,
  rationaleTemplate:
    'The adopted strategic plan ends on {{planEndDate}}, {{daysRemaining}} from now.',
  unlock: null,
  evaluate(c) {
    const { endDate, days } = planEndDate(c)
    if (days <= 0 || days > TH.PLAN_EXPIRY_INFO_DAYS.value) return []
    const severity: TwinSeverity =
      days <= TH.PLAN_EXPIRY_CRITICAL_DAYS.value
        ? 'critical'
        : days <= TH.PLAN_EXPIRY_WARN_DAYS.value
          ? 'warn'
          : 'info'
    return [
      {
        scopeKey: 'school',
        // ONE PLAN END DATE IS ONE FACT. STRAT-PLAN-EXPIRED uses the SAME factKey
        // deliberately, so the domain numerator counts it once however many rules
        // speak about it.
        factKey: `register:strategic_plan_end@${endDate}`,
        evidence: [
          ev('planEndDate', 'Plan end date', endDate, formatCivilDate(endDate), endDate),
          ev('daysRemaining', 'Days remaining', days, fmtDays(days)),
        ],
        severity,
        likelihood: days <= TH.PLAN_EXPIRY_WARN_DAYS.value ? 'likely' : 'possible',
        confidence: 'observation',
        horizon: BY_DATE(endDate),
        consequence:
          'Every framework asks for a current plan and its evidence of implementation; a plan takes about a year to write, which is why this warns at twelve months and not at ninety days.',
      },
    ]
  },
}

const STRAT_PLAN_EXPIRED: TwinRuleDef = {
  id: 'STRAT-PLAN-EXPIRED',
  kind: 'register',
  title: 'The adopted strategic plan has ended with no successor adopted',
  requiredAvailable: ['strat.plan_horizon'],
  requiredAbsent: [],
  requiredPriors: [],
  needsRegister: false,
  domainKeys: ['continuous_improvement', 'leadership'],
  defaultDomainKey: 'continuous_improvement',
  standardCodes: STRAT_CODES,
  rationaleTemplate:
    'The adopted strategic plan ended on {{planEndDate}}, {{daysOverdue}} ago, and no later plan is adopted.',
  unlock: null,
  evaluate(c) {
    const { endDate, days } = planEndDate(c)
    // Mutually exclusive with STRAT-PLAN-EXPIRING by construction: that rule
    // requires 0 < days <= 365, this one requires days <= 0.
    if (days > 0) return []
    return [
      {
        scopeKey: 'school',
        factKey: `register:strategic_plan_end@${endDate}`,
        evidence: [
          ev('planEndDate', 'Plan end date', endDate, formatCivilDate(endDate), endDate),
          ev('daysOverdue', 'Days since it ended', Math.abs(days), fmtDays(Math.abs(days))),
        ],
        severity: 'critical',
        likelihood: 'likely',
        confidence: 'observation',
        horizon: NO_HORIZON(HORIZON_DATE_PASSED),
        consequence:
          'An expired plan with no successor is the clearest continuous-improvement finding in the catalog, and it is the one a team asks about in the opening interview.',
      },
    ]
  },
}

// ── 2.4 ENROLLMENT ───────────────────────────────────────────────────────────

const ENR_DECLINE: TwinRuleDef = {
  id: 'ENR-DECLINE',
  kind: 'comparison',
  title: 'Enrollment has fallen since the previous observation',
  requiredAvailable: ['enr.headcount'],
  requiredAbsent: [],
  requiredPriors: ['enr.headcount'],
  needsRegister: false,
  domainKeys: ['finance', 'leadership'],
  defaultDomainKey: 'finance',
  standardCodes: {
    cognia_2022: ['COG-15', 'COG-24'],
    msa_cess_2022: ['MSA-4'],
    nsbecs: ['NSBECS-13', 'NSBECS-10'],
  },
  rationaleTemplate:
    'Enrollment fell from {{headcountPrior}} at {{priorAsOf}} to {{headcountNow}} at {{asOf}} — a decline of {{declinePct}}.',
  unlock: null,
  // WHY A LEVEL COMPARISON AND NOT A TREND: `enrollment_change_yoy` is
  // `already_a_delta` and ineligible for the trend statistics, and the metric
  // registry carries no enrollment LEVEL metric at all. Headcount reaches the twin
  // only as a register signal, so this rule compares two observations and reports
  // `confidence: 'observation'` — never the word reserved for five readings.
  //
  // FERPA: school TOTALS are explicitly carved out of small-cell suppression. The
  // total is on the school's own website; masking it protects nobody.
  evaluate(c) {
    const s = c.signal('enr.headcount')
    const p = c.prior('enr.headcount')
    const now = num(s.value)
    const prior = num(p.value)
    if (now === null || prior === null || prior <= 0) return []
    const drop = (prior - now) / prior
    if (drop < TH.ENR_DECLINE_FRACTION.value) return []
    return [
      {
        scopeKey: 'school',
        factKey: `register:enrollment_headcount@${s.observedOn ?? 'undated'}`,
        evidence: [
          ev('headcountNow', 'Enrollment now', now, fmtCount(now), s.observedOn, s.lineage),
          ev('headcountPrior', 'Enrollment previously', prior, fmtCount(prior), p.observedOn, s.lineage),
          ev('asOf', 'This observation', s.observedOn, formatCivilDate(s.observedOn), s.observedOn),
          ev('priorAsOf', 'Previous observation', p.observedOn, formatCivilDate(p.observedOn), p.observedOn),
          ev('declinePct', 'Decline', drop, fmtPct1(drop)),
        ],
        severity: drop >= TH.ENR_DECLINE_CRITICAL_FRACTION.value ? 'critical' : 'warn',
        likelihood: 'possible',
        confidence: 'observation',
        horizon: NO_HORIZON(HORIZON_CONDITION_TODAY),
        consequence:
          'Enrollment drives tuition revenue and, downstream, the reserve; a visiting team reads it as the leading indicator behind every resource standard.',
      },
    ]
  },
}

const FEEDER_SUPPRESSED_MESSAGE =
  'Entry-grade counts are below the publication threshold, so we cannot compare them without disclosing them.'

function entryCells(cells: readonly SmallCell[] | null): SmallCell[] {
  if (!cells) return []
  const ranked: { rank: number; cell: SmallCell }[] = []
  for (const cell of cells) {
    const norm = cell.key.trim().toUpperCase()
    const rank = (ENTRY_GRADE_KEYS as readonly string[]).findIndex((k) => k === norm)
    if (rank >= 0) ranked.push({ rank, cell })
  }
  ranked.sort((a, b) => (a.rank === b.rank ? a.cell.key.localeCompare(b.cell.key) : a.rank - b.rank))
  return ranked.slice(0, 2).map((r) => r.cell)
}

const ENR_FEEDER_EROSION: TwinRuleDef = {
  id: 'ENR-FEEDER-EROSION',
  kind: 'comparison',
  title: 'Entry-grade enrollment is eroding while the headline total may look flat',
  requiredAvailable: ['enr.feeder_grades'],
  requiredAbsent: [],
  requiredPriors: ['enr.feeder_grades'],
  needsRegister: false,
  domainKeys: ['finance', 'leadership'],
  defaultDomainKey: 'finance',
  standardCodes: {
    cognia_2022: ['COG-24', 'COG-15'],
    msa_cess_2022: ['MSA-4'],
    nsbecs: ['NSBECS-13'],
  },
  rationaleTemplate:
    'Entry-grade enrollment ({{grades}}) fell from {{entryPrior}} at {{priorAsOf}} to {{entryNow}} at {{asOf}} — a decline of {{declinePct}}, while the headline total may still look flat.',
  unlock: null,
  evaluate(c) {
    const s = c.signal('enr.feeder_grades')
    const p = c.prior('enr.feeder_grades')
    const nowCells = entryCells(s.cells)
    const priorByKey = new Map<string, SmallCell>()
    for (const cell of entryCells(p.cells)) priorByKey.set(cell.key.trim().toUpperCase(), cell)

    // A cell suppressed in EITHER observation is excluded. Comparing a suppressed
    // cell against a published one would disclose the suppressed count by
    // subtraction — the exact defect complementary suppression exists to prevent.
    const surviving: { key: string; now: number; prior: number }[] = []
    for (const cell of nowCells) {
      const key = cell.key.trim().toUpperCase()
      const prior = priorByKey.get(key)
      if (!prior) continue
      if (cell.value === null || prior.value === null) continue
      surviving.push({ key: cell.key, now: cell.value, prior: prior.value })
    }
    if (surviving.length < 1) {
      throw new TwinCannotEvaluate('cells_suppressed', 'enr.feeder_grades', FEEDER_SUPPRESSED_MESSAGE)
    }

    const nowSum = surviving.reduce((a, x) => a + x.now, 0)
    const priorSum = surviving.reduce((a, x) => a + x.prior, 0)
    if (priorSum <= 0) return []
    const drop = (priorSum - nowSum) / priorSum
    if (drop < TH.FEEDER_EROSION_FRACTION.value) return []

    return [
      {
        scopeKey: 'school',
        factKey: `register:feeder_grades@${s.observedOn ?? 'undated'}`,
        evidence: [
          ev('entryNow', 'Entry-grade enrollment now', nowSum, fmtCount(nowSum), s.observedOn, s.lineage),
          ev('entryPrior', 'Entry-grade enrollment previously', priorSum, fmtCount(priorSum), p.observedOn, s.lineage),
          ev('grades', 'Entry grades compared', surviving.map((x) => x.key).join(', '), surviving.map((x) => x.key).join(', ')),
          ev('asOf', 'This observation', s.observedOn, formatCivilDate(s.observedOn), s.observedOn),
          ev('priorAsOf', 'Previous observation', p.observedOn, formatCivilDate(p.observedOn), p.observedOn),
          ev('declinePct', 'Decline', drop, fmtPct0(drop)),
        ],
        severity: 'warn',
        likelihood: 'possible',
        confidence: 'observation',
        horizon: NO_HORIZON(HORIZON_CONDITION_TODAY),
        consequence:
          'Feeder erosion is the finding a visiting team writes two years before the total moves, and it is the one the school can still act on.',
      },
    ]
  },
}

// ── 2.5 ACCREDITATION STATE ──────────────────────────────────────────────────

/** The chip row is capped; the DATA is not. The full list rides in evidence. */
const ACC_UNSCORED_TAG_CAP = 12

const ACC_UNSCORED: TwinRuleDef = {
  id: 'ACC-UNSCORED',
  kind: 'standard',
  title: 'Standards in the register carry no rubric score at all',
  requiredAvailable: ['acc.unscored_standards'],
  requiredAbsent: [],
  requiredPriors: [],
  needsRegister: true,
  domainKeys: ['continuous_improvement'],
  defaultDomainKey: 'continuous_improvement',
  standardCodes: NO_CODES,
  rationaleTemplate: '{{unscoredCount}} of {{totalStandards}} standards carry no rubric score at all.',
  unlock: null,
  evaluate(c) {
    const s = c.signal('acc.unscored_standards')
    const unscoredSignal = num(s.value)
    if (unscoredSignal === null || unscoredSignal < 1) return []
    const unscored = sortedStandards(c.register).filter((x) => x.rubricScore === null)
    if (unscored.length === 0) return []
    const total = c.register.standards.length
    const codes = unscored.map((x) => x.code)
    return [
      {
        // ONE school-scoped finding, never one per standard: "your self-study is
        // unstarted" is a single fact about the register.
        scopeKey: 'school',
        factKey: 'readiness:unscored_standards@school',
        standardCodes: codes.slice(0, ACC_UNSCORED_TAG_CAP),
        evidence: [
          ev('unscoredCount', 'Standards with no rubric score', unscored.length, fmtCount(unscored.length), s.observedOn, s.lineage),
          ev('totalStandards', 'Standards in the register', total, fmtCount(total)),
          ev('unscoredCodes', 'Every unscored standard', codes.join(', '), codes.join(', ')),
        ],
        severity:
          total > 0 && unscored.length / total >= TH.ACC_UNSCORED_CRITICAL_FRACTION.value
            ? 'critical'
            : 'warn',
        likelihood: 'likely',
        confidence: 'observation',
        horizon: NO_HORIZON(HORIZON_CONDITION_TODAY),
        consequence:
          'An unscored standard has no position to defend; the self-study is the first document a team reads and gaps in it set the tone for the visit.',
      },
    ]
  },
}

const ACC_UNSUPPORTED_SCORE: TwinRuleDef = {
  id: 'ACC-UNSUPPORTED-SCORE',
  kind: 'standard',
  title: 'A strong self-score has no evidence attached',
  requiredAvailable: ['acc.unsupported_score'],
  requiredAbsent: [],
  requiredPriors: [],
  needsRegister: true,
  domainKeys: ['continuous_improvement'],
  defaultDomainKey: 'continuous_improvement',
  standardCodes: NO_CODES,
  // DEVIATION, documented: the spec's frozen sentence reads "out of 4". A literal
  // digit outside a {{…}} placeholder fails the template spec that guarantees
  // every numeral traces to evidence. The ceiling is now an evidence entry read
  // from RUBRIC_MAX, so the rendered sentence is byte-identical AND the numeral
  // has a basis.
  rationaleTemplate:
    '{{code}} is self-scored {{rubricScore}} out of {{rubricMax}} with {{evidenceCount}} artifacts attached.',
  unlock: null,
  evaluate(c) {
    // PER-STANDARD SCOPE IS DELIBERATE AND UNCAPPED. Each is a separate fact,
    // separately actionable. The briefing hard-caps at two and the rail at six;
    // a ledger a school works through one row at a time is the product.
    const out: TwinFindingDraft[] = []
    for (const st of sortedStandards(c.register)) {
      if (st.rubricScore === null || st.rubricScore < 3) continue
      if (st.evidenceCount !== 0) continue
      out.push({
        scopeKey: `standard:${st.standardId}`,
        factKey: `standard:${st.standardId}:unsupported_score`,
        standardCodes: [st.code],
        domainKeys: st.domainKeys,
        defaultDomainKey: st.primaryDomainKey,
        evidence: [
          ev('code', 'Standard', st.code, st.code),
          ev('rubricScore', 'Self-score', st.rubricScore, fmtCount(st.rubricScore)),
          ev('rubricMax', 'Rubric ceiling', RUBRIC_CEILING, fmtCount(RUBRIC_CEILING)),
          ev('evidenceCount', 'Artifacts attached', st.evidenceCount, fmtCount(st.evidenceCount)),
        ],
        severity: st.isAssurance ? 'critical' : 'warn',
        likelihood: 'likely',
        confidence: 'observation',
        horizon: NO_HORIZON(HORIZON_CONDITION_TODAY),
        consequence:
          'You have scored yourself well here and have nothing to show for it. A visiting team resolves that gap in one direction.',
      })
    }
    return out
  },
}

const ACC_ASSURANCE_GAP: TwinRuleDef = {
  id: 'ACC-ASSURANCE-GAP',
  kind: 'standard',
  title: 'An assurance gate is unmet',
  requiredAvailable: ['acc.unsupported_score'],
  requiredAbsent: [],
  requiredPriors: [],
  needsRegister: true,
  domainKeys: ['governance'],
  defaultDomainKey: 'governance',
  standardCodes: NO_CODES,
  rationaleTemplate: '{{code}} is an assurance gate with {{evidenceCount}} artifacts attached.',
  unlock: null,
  evaluate(c) {
    const out: TwinFindingDraft[] = []
    for (const st of sortedStandards(c.register)) {
      if (!st.isAssurance) continue
      if (st.assuranceSatisfied !== false) continue
      out.push({
        scopeKey: `standard:${st.standardId}`,
        factKey: `standard:${st.standardId}:assurance_gap`,
        standardCodes: [st.code],
        domainKeys: st.domainKeys,
        defaultDomainKey: st.primaryDomainKey,
        evidence: [
          ev('code', 'Standard', st.code, st.code),
          ev('title', 'Assurance', st.title, st.title),
          ev('evidenceCount', 'Artifacts attached', st.evidenceCount, fmtCount(st.evidenceCount)),
        ],
        // ALWAYS critical. No escalation ladder and no de-escalation: an assurance
        // is a binary gate, not a matter of degree.
        severity: 'critical',
        likelihood: 'likely',
        confidence: 'observation',
        horizon: NO_HORIZON(HORIZON_CONDITION_TODAY),
        consequence:
          'Assurances are pass or fail. An unmet one is not a low score — it is the accreditation blocked until it is met.',
      })
    }
    return out
  },
}

// ── 2.6 EVIDENCE CURRENCY (the ARTIFACT axis) ────────────────────────────────

const EVI_STALE: TwinRuleDef = {
  id: 'EVI-STALE',
  kind: 'evidence',
  title: 'Required evidence on file has stopped being current',
  requiredAvailable: ['acc.evidence_currency'],
  requiredAbsent: [],
  requiredPriors: [],
  needsRegister: true,
  domainKeys: ['continuous_improvement'],
  defaultDomainKey: 'continuous_improvement',
  standardCodes: NO_CODES,
  rationaleTemplate:
    'The {{label}} on file stopped being current on {{expiresOn}}, {{daysOverdue}} ago, and {{standardCount}} standards cite it.',
  unlock: null,
  evaluate(c) {
    const out: TwinFindingDraft[] = []
    for (const g of sortedGroups(c.register)) {
      if (g.dataAvailability !== 'platform') continue
      if (g.state !== 'stale') continue
      // THE SUPPRESSION THAT PREVENTS A DOUBLE COUNT: FIN-AUDIT-STALE owns this
      // tag, with a sharper consequence and a finance primary domain.
      if (g.tag === 'financial_audit') continue
      if (g.expiresOn === null || g.daysUntilExpiry === null) continue
      const overdue = Math.abs(g.daysUntilExpiry)
      const codes = g.servesStandards.map((x) => x.code)
      out.push({
        scopeKey: `evidence:${g.tag}`,
        factKey: `evidence:${g.tag}@${g.expiresOn ?? 'undated'}`,
        standardCodes: codes,
        domainKeys: ['continuous_improvement'],
        evidence: [
          ev('label', 'Artifact', g.label, g.label),
          ev('expiresOn', 'Current through', g.expiresOn, formatCivilDate(g.expiresOn)),
          ev('daysOverdue', 'Days out of date', overdue, fmtDays(overdue)),
          ev('standardCount', 'Standards citing this artifact', codes.length, fmtCount(codes.length)),
        ],
        severity: g.servesAssurance ? 'critical' : 'warn',
        likelihood: 'likely',
        confidence: 'observation',
        horizon: BY_DATE(g.expiresOn),
        consequence:
          'Evidence that exists but is out of date is the second-most-common recommendation a team writes, after evidence that does not exist.',
      })
    }
    return out
  },
}

const EVI_MISSING_REQUIRED: TwinRuleDef = {
  id: 'EVI-MISSING-REQUIRED',
  kind: 'evidence',
  title: 'A required artifact is not on file anywhere',
  requiredAvailable: ['acc.evidence_currency'],
  requiredAbsent: [],
  requiredPriors: [],
  needsRegister: true,
  domainKeys: ['continuous_improvement'],
  defaultDomainKey: 'continuous_improvement',
  standardCodes: NO_CODES,
  rationaleTemplate:
    'No {{label}} is on file anywhere in KYRO, and {{standardCount}} standards ask for one.',
  unlock: null,
  evaluate(c) {
    const out: TwinFindingDraft[] = []
    for (const g of sortedGroups(c.register)) {
      // `dataAvailability !== 'platform'` IS NEVER A FINDING. A requirement we
      // chose not to track is OUR hole, not the school's; those rows are counted
      // as named holes and never blamed.
      if (g.dataAvailability !== 'platform') continue
      if (g.state !== 'missing') continue
      const codes = g.servesStandards.map((x) => x.code)
      out.push({
        scopeKey: `evidence:${g.tag}`,
        factKey: `evidence:${g.tag}@missing`,
        standardCodes: codes,
        domainKeys: ['continuous_improvement'],
        evidence: [
          ev('label', 'Artifact', g.label, g.label),
          ev('standardCount', 'Standards asking for it', codes.length, fmtCount(codes.length)),
        ],
        severity: g.servesAssurance ? 'critical' : 'warn',
        likelihood: 'likely',
        confidence: 'observation',
        horizon: NO_HORIZON(HORIZON_CONDITION_TODAY),
        consequence:
          "This is the artifact the visiting team's document request will name. Uploading it once to your document store satisfies every standard that cites it.",
      })
    }
    return out
  },
}

// ── 2.7 FACILITIES & HR ──────────────────────────────────────────────────────

const FAC_BACKLOG: TwinRuleDef = {
  id: 'FAC-BACKLOG',
  kind: 'register',
  title: 'Open maintenance items are accumulating',
  requiredAvailable: ['fac.maintenance_backlog'],
  requiredAbsent: [],
  requiredPriors: [],
  needsRegister: false,
  domainKeys: ['facilities'],
  defaultDomainKey: 'facilities',
  standardCodes: {
    cognia_2022: ['COG-A3', 'COG-15'],
    msa_cess_2022: ['MSA-4'],
    nsbecs: ['NSBECS-12'],
  },
  rationaleTemplate:
    // "FEWER THAN" for the same reason as HR-EVAL-OVERDUE below: the gate is
    // `open < WARN_COUNT` -> silent, so this fires AT the threshold. Shipped in
    // Phase E reading "no more than {{threshold}}", which tells a school the exact
    // number it is being flagged for is the number that is acceptable.
    '{{openItems}} maintenance items are open, against a working expectation of fewer than {{threshold}}.',
  unlock: null,
  evaluate(c) {
    const s = c.signal('fac.maintenance_backlog')
    const open = num(s.value)
    if (open === null || open < TH.FAC_BACKLOG_WARN_COUNT.value) return []
    return [
      {
        scopeKey: 'school',
        factKey: `register:maintenance_backlog@${s.observedOn ?? 'undated'}`,
        evidence: [
          ev('openItems', 'Open maintenance items', open, fmtCount(open), s.observedOn, s.lineage),
          ev(
            'threshold',
            'Working expectation',
            TH.FAC_BACKLOG_WARN_COUNT.value,
            fmtCount(TH.FAC_BACKLOG_WARN_COUNT.value),
          ),
          ev('honestyNote', 'What we will not infer', FAC_BACKLOG_HONESTY_NOTE, FAC_BACKLOG_HONESTY_NOTE),
        ],
        severity: open >= TH.FAC_BACKLOG_CRITICAL_COUNT.value ? 'critical' : 'warn',
        likelihood: 'possible',
        confidence: 'observation',
        horizon: NO_HORIZON(HORIZON_CONDITION_TODAY),
        consequence:
          "Facilities adequacy is a named standard in MSA and NSBECS and an assurance in Cognia's safety gate; a backlog nobody is closing is how a reviewer evidences it.",
      },
    ]
  },
}

const HR_RATIO_DRIFT: TwinRuleDef = {
  id: 'HR-RATIO-DRIFT',
  kind: 'trend',
  title: 'The student-teacher ratio is rising year on year',
  requiredAvailable: ['hr.student_teacher_ratio'],
  requiredAbsent: [],
  requiredPriors: [],
  needsRegister: false,
  domainKeys: ['hr'],
  defaultDomainKey: 'hr',
  standardCodes: {
    cognia_2022: ['COG-13', 'COG-15'],
    msa_cess_2022: ['MSA-4', 'MSA-5'],
    nsbecs: ['NSBECS-11'],
  },
  rationaleTemplate:
    'The student-teacher ratio has risen across {{readings}} readings, {{fyFirst}} to {{fyLast}} — from {{firstValue}} to {{lastValue}}, about {{slopePerYear}} a year (Mann-Kendall p = {{pValue}}).',
  // Direction-only for the same reason as FIN-BUDGET-DETERIORATING above: the
  // 'directional' rung does not license a per-reading claim, and this variant
  // previously carried no caveat at all.
  rationaleTemplateLow:
    'The student-teacher ratio moved up across {{readings}} readings, {{fyFirst}} to {{fyLast}} — {{firstValue}} to {{lastValue}}, about {{slopePerYear}} a year. These readings cannot yet confirm a direction.',
  unlock: null,
  // THE PROHIBITION, MECHANISED: we can see a staffing LEVEL change. That is not
  // staff departure, we do not hold the data that would measure it, and no string
  // in this file or in anything it emits names it as such.
  evaluate(c) {
    // The metric's goodDirection is 'lower', so `direction: 'declining'` means the
    // RATIO IS RISING. The word belongs to the metric, not to the number.
    return trendDraft(c, {
      signalKey: 'hr.student_teacher_ratio',
      metricKey: 'student_teacher_ratio',
      factPrefix: 'metric:student_teacher_ratio',
      riskIsAbove: true,
      domainKeys: ['hr'],
      defaultDomainKey: 'hr',
      consequence:
        'Staffing adequacy sits under the personnel standard; a multi-year rise is what a reviewer reads as capacity being stretched — it is not a measure of who left, and we do not have that.',
    })
  },
}

// ── 2.8 META ─────────────────────────────────────────────────────────────────

const SCHOOL_NOT_REPORTING: TwinRuleDef = {
  id: 'SCHOOL-NOT-REPORTING',
  kind: 'meta',
  title: 'Operating signals have gone quiet past their own expected cadence',
  // The gate that proves accreditation is licensed AND a snapshot exists.
  requiredAvailable: ['acc.readiness_series'],
  requiredAbsent: [],
  requiredPriors: [],
  needsRegister: false,
  domainKeys: ['continuous_improvement'],
  defaultDomainKey: 'continuous_improvement',
  standardCodes: {
    cognia_2022: ['COG-24'],
    msa_cess_2022: ['MSA-1'],
    nsbecs: ['NSBECS-10'],
  },
  rationaleTemplate:
    '{{staleSignalCount}} operating signals have gone quiet past their own expected cadence; the oldest was last observed {{oldestAgeDays}} days ago.',
  unlock: null,
  evaluate(c) {
    // Sorted by key so the payload cannot depend on the order the caller happened
    // to hand us the set in — the reconciliation hashes this evidence, and an
    // order-dependent hash would churn the ledger nightly for no change in fact.
    const stale = c
      .allSignals()
      .filter((s) => s.availability === 'available' && s.changeState === 'stale_data')
      .slice()
      .sort((a, b) => a.key.localeCompare(b.key))
    if (stale.length < TH.STALE_SIGNAL_MIN_COUNT.value) return []
    const ages = stale.map((s) => s.ageDays).filter((a): a is number => a !== null)
    // Without a single dated reading there is no honest numeral for "the oldest",
    // and this rule refuses to invent one rather than print a zero.
    if (ages.length === 0) return []
    const oldest = Math.max(...ages)
    const labels = stale.map((s) => s.label).join(', ')
    return [
      {
        scopeKey: 'school',
        // DELIBERATELY DATED TO THE RUN, so the basis moves as staleness deepens
        // rather than silently freezing behind an unchanged payload hash.
        factKey: `meta:not_reporting@${c.now}`,
        evidence: [
          ev('staleSignalCount', 'Signals past their cadence', stale.length, fmtCount(stale.length)),
          ev('staleSignalLabels', 'Which signals', labels, labels),
          ev('oldestAgeDays', 'Oldest observation, in days', oldest, fmtCount(oldest)),
        ],
        // ALWAYS info. A school that stopped uploading has not developed a problem;
        // we have stopped being able to answer for it.
        severity: 'info',
        likelihood: 'possible',
        confidence: 'observation',
        horizon: NO_HORIZON(HORIZON_CONDITION_TODAY),
        consequence:
          'When the data stops arriving we stop being able to answer for you. Findings that stop firing for this reason are marked as data we lost sight of, never as resolved.',
      },
    ]
  },
}

// ── 2.9 THE FOUR VISIBLE HOLES ───────────────────────────────────────────────
//
// These ship VISIBLE and permanently/currently `cannot_evaluate`. They appear in
// `notEvaluated[]` on EVERY payload, in `coverage.namedHoles`, and on the Signals
// tab. THIS IS THE DELIVERABLE, not a shortfall: it tells a school exactly what a
// visiting team will ask that we cannot answer, and names the intake that closes
// it. Their `evaluate` bodies exist and are correct; they are simply unreachable
// until the signal behind them starts resolving `available`.

const HR_PD_LOW: TwinRuleDef = {
  id: 'HR-PD-LOW',
  kind: 'register',
  title: 'Professional-development participation is not tracked',
  requiredAvailable: ['hr.pd_participation'],
  requiredAbsent: [],
  requiredPriors: [],
  needsRegister: false,
  domainKeys: ['hr'],
  defaultDomainKey: 'hr',
  standardCodes: {
    cognia_2022: ['COG-6', 'COG-29'],
    msa_cess_2022: ['MSA-5'],
    nsbecs: ['NSBECS-11'],
  },
  rationaleTemplate:
    '{{participationPct}} of staff have a professional-development record in the last twelve months.',
  unlock: {
    moduleKey: 'hr',
    intake: 'ProfessionalDevelopment register (Phase K)',
    copy: 'We cannot tell you whether your staff are getting professional development, because KYRO holds no PD records. We will not use PD spend as a proxy — one expensive conference for one person would score as healthy. A four-field register unlocks this rule.',
  },
  evaluate() {
    return []
  },
}

const SAFE_ENV_GAP: TwinRuleDef = {
  id: 'SAFE-ENV-GAP',
  kind: 'register',
  title: 'Safe-environment clearances are not tracked',
  requiredAvailable: ['safe.clearances'],
  requiredAbsent: [],
  requiredPriors: [],
  needsRegister: false,
  domainKeys: ['governance', 'student_services'],
  defaultDomainKey: 'governance',
  standardCodes: {
    cognia_2022: ['COG-A3', 'COG-A4'],
    msa_cess_2022: ['MSA-3'],
    nsbecs: ['NSBECS-5'],
  },
  rationaleTemplate: '{{clearedCount}} of {{staffCount}} staff have a current clearance on file.',
  unlock: {
    moduleKey: 'hr',
    intake: 'Clearance register + per-diocese CSV import (Phase K)',
    copy: 'Background-check and safe-environment compliance is not tracked in KYRO. It lives in your diocesan system. A register plus a CSV import unlocks this rule; a live connector is a later conversation — the market reality is CSV.',
  },
  evaluate() {
    return []
  },
}

const CURR_DOC_AGING: TwinRuleDef = {
  id: 'CURR-DOC-AGING',
  kind: 'register',
  title: 'Curriculum documents are past their own scheduled review date',
  requiredAvailable: ['curr.doc_review'],
  requiredAbsent: [],
  requiredPriors: [],
  needsRegister: false,
  domainKeys: ['academic_excellence'],
  defaultDomainKey: 'academic_excellence',
  standardCodes: {
    cognia_2022: ['COG-12', 'COG-14'],
    msa_cess_2022: ['MSA-5'],
    nsbecs: ['NSBECS-7'],
  },
  rationaleTemplate:
    '{{overdueCount}} curriculum documents are past their own scheduled review date.',
  unlock: {
    moduleKey: 'governance',
    intake: "One Policy row per curriculum document, category 'Curriculum', with a review interval",
    copy: 'We cannot see your curriculum. We can track when you last reviewed its documentation the moment you record it — one policy row per document, and the review engine you already have does the rest.',
  },
  // THE ONE OF THE FOUR THAT NEEDS NO NEW TABLE. The day a school files a Policy
  // with category 'Curriculum', this signal flips to `available` and the predicate
  // below fires. It ships implemented, not stubbed.
  evaluate(c) {
    const s = c.signal('curr.doc_review')
    const overdue = num(s.value)
    if (overdue === null || overdue < 1) return []
    return [
      {
        scopeKey: 'school',
        factKey: `register:curriculum_review_overdue@${s.observedOn ?? 'undated'}`,
        evidence: [
          ev('overdueCount', 'Curriculum documents overdue for review', overdue, fmtCount(overdue), s.observedOn, s.lineage),
        ],
        severity: 'warn',
        likelihood: 'likely',
        confidence: 'observation',
        horizon: NO_HORIZON(HORIZON_CONDITION_TODAY),
        consequence:
          'Curriculum documentation and its review cycle are what a team reads for the teaching-and-learning standard; an undocumented review is an unevidenced one.',
      },
    ]
  },
}

const ACAD_GROWTH_FLAT: TwinRuleDef = {
  id: 'ACAD-GROWTH-FLAT',
  kind: 'trend',
  title: 'Measured growth in student learning is not tracked',
  requiredAvailable: ['acad.assessment_growth'],
  requiredAbsent: [],
  requiredPriors: [],
  needsRegister: false,
  domainKeys: ['academic_excellence'],
  defaultDomainKey: 'academic_excellence',
  standardCodes: {
    cognia_2022: ['COG-30', 'COG-31'],
    msa_cess_2022: ['MSA-5'],
    nsbecs: ['NSBECS-8'],
  },
  rationaleTemplate: 'Measured growth has been flat across {{readings}} readings.',
  unlock: {
    moduleKey: null,
    intake: 'LMS / assessment integration (deferred)',
    copy: 'Measured growth in student learning renders as not measured, with the reason. We will not proxy it with anything — not attendance, not enrollment, not staffing.',
  },
  evaluate() {
    return []
  },
}

// ── 2.10 AIC PHASE F — THE THREE RULES THE NEW INTAKE REGISTERS MAKE EVALUABLE ─
//
// None of these closes one of the four named holes above; they are new capability.
// Each is gated on a signal that only resolves `available` once the school has
// entered a row, so a school with an empty register gets a NAMED REFUSAL and no
// finding — "we could not look" and "we looked and it is fine" stay different
// facts. Each also reads a PRE-AGGREGATED summary off the register axis rather
// than a scalar signal value, because a count alone cannot carry the oldest-days
// figure its own sentence quotes; when that summary is absent the rule refuses
// with `value_not_usable` instead of inventing a zero.

const STAFF_EVAL_SUMMARY_MISSING =
  'Your staff-evaluation register reported a reading, but the counts behind it did not come through on this run, so there is no basis to quote.'

const HR_EVAL_OVERDUE: TwinRuleDef = {
  id: 'HR-EVAL-OVERDUE',
  kind: 'register',
  title: 'Staff evaluations are past their own due date',
  requiredAvailable: ['hr.staff_evaluations'],
  requiredAbsent: [],
  requiredPriors: [],
  needsRegister: true,
  domainKeys: ['hr'],
  defaultDomainKey: 'hr',
  standardCodes: {
    // COG-10 names "recruiting, supervising, and EVALUATING professional staff"
    // verbatim; COG-13 is the qualified-personnel standard the same files evidence.
    cognia_2022: ['COG-10', 'COG-13'],
    msa_cess_2022: ['MSA-4'],
    nsbecs: ['NSBECS-11'],
  },
  // ONE template. There is no `rationaleTemplateLow`: the rule does not fire below
  // STAFF_EVAL_OVERDUE_WARN_COUNT (3), so the plural is always correct and no
  // singular variant is reachable.
  // The day figure carries its OWN noun (`fmtDays`), so the oldest row being
  // exactly one day past its date reads "outstanding 1 day" and not "1 days".
  // "FEWER THAN", not "no more than". The gate is `overdue < WARN_COUNT` -> silent,
  // so the rule fires AT the threshold: at exactly 3 overdue, "an expectation of no
  // more than 3" states that 3 is acceptable while flagging 3, and the first thing a
  // head of school does with a sentence like that is stop trusting the next one.
  rationaleTemplate:
    '{{overdueCount}} staff evaluations are past their own recorded due date; the oldest has been outstanding {{oldestOverdueDays}}, against a working expectation of fewer than {{threshold}} overdue.',
  unlock: null,
  // ADULT-STAFF EMPLOYMENT PII STOPS AT THE REGISTER. Nothing this rule emits —
  // rationale, evidence, consequence, factKey — carries a name, a personId, a
  // cycle label or an evaluator. Four integers is the whole payload.
  evaluate(c) {
    const s = c.signal('hr.staff_evaluations')
    const sum = c.register.staffEvaluations
    if (sum === null) {
      throw new TwinCannotEvaluate('value_not_usable', 'hr.staff_evaluations', STAFF_EVAL_SUMMARY_MISSING)
    }
    const overdue = sum.overdueCount
    const oldest = sum.oldestOverdueDays
    // A summary that contradicts itself cannot be narrated honestly: more overdue
    // rows than rows, or an overdue row that is nought days past its own date.
    // Refuse by name rather than render a sentence the arithmetic does not support.
    if (overdue < 0 || sum.registerSize < overdue || (overdue >= 1 && oldest < 1)) {
      throw new TwinCannotEvaluate('value_not_usable', 'hr.staff_evaluations', STAFF_EVAL_SUMMARY_MISSING)
    }
    if (overdue < TH.STAFF_EVAL_OVERDUE_WARN_COUNT.value) return []
    return [
      {
        scopeKey: 'school',
        factKey: `register:staff_evaluations_overdue@${s.observedOn ?? 'undated'}`,
        evidence: [
          ev('overdueCount', 'Evaluations past their due date', overdue, fmtCount(overdue), s.observedOn, s.lineage),
          ev('oldestOverdueDays', 'How long the oldest has been outstanding', oldest, fmtDays(oldest)),
          ev(
            'threshold',
            'Working expectation',
            TH.STAFF_EVAL_OVERDUE_WARN_COUNT.value,
            fmtCount(TH.STAFF_EVAL_OVERDUE_WARN_COUNT.value),
          ),
          ev('registerSize', 'Evaluation records on file', sum.registerSize, fmtCount(sum.registerSize)),
        ],
        // BOTH numerals that decide this appear in the rationale AND in evidence[].
        severity:
          overdue >= TH.STAFF_EVAL_OVERDUE_CRITICAL_COUNT.value ||
          oldest > TH.STAFF_EVAL_OVERDUE_CRITICAL_DAYS.value
            ? 'critical'
            : 'warn',
        // ORDINAL, CONSTANT. A team samples personnel files; an evaluation past its
        // own recorded date is a documentary fact, not a forecast.
        likelihood: 'likely',
        // A single-observation register fact — the GOV-POLICY-OVERDUE / FAC-BACKLOG
        // precedent. No series is computed and the five-reading word is forbidden here.
        confidence: 'observation',
        horizon: NO_HORIZON(HORIZON_DATE_PASSED),
        consequence:
          'Cognia COG-10 names evaluating professional staff explicitly, and a visiting team samples personnel files. An evaluation past the date your own register set for it is the documentary gap they write up.',
      },
    ]
  },
}

const INSPECTION_SUMMARY_MISSING =
  'Your facilities register reported a compliance-inspection reading, but the counts behind it did not come through on this run, so there is no basis to quote.'

const FAC_INSPECTION_DUE: TwinRuleDef = {
  id: 'FAC-INSPECTION-DUE',
  kind: 'register',
  title: 'A recorded compliance inspection is past its own target date',
  requiredAvailable: ['fac.inspections'],
  requiredAbsent: [],
  requiredPriors: [],
  needsRegister: true,
  domainKeys: ['facilities'],
  defaultDomainKey: 'facilities',
  standardCodes: {
    cognia_2022: ['COG-A3'],
    msa_cess_2022: ['MSA-3'],
    nsbecs: ['NSBECS-12'],
  },
  // Both templates take the day figure WITH its noun (`fmtDays`): an inspection
  // one day past its target date is the most common way this rule first fires,
  // and "by 1 days" is a sentence this product will not say.
  rationaleTemplate:
    '{{overdueCount}} recorded compliance inspections are past their own target date ({{kinds}}); the oldest is {{oldestOverdueDays}} past.',
  rationaleTemplateLow:
    'A recorded {{kinds}} inspection is past its own target date, by {{oldestOverdueDays}}.',
  unlock: null,
  // WE STILL DO NOT GUESS. FAC_BACKLOG_HONESTY_NOTE stays true word for word: this
  // rule reads a kind the SCHOOL declared on the item, never one inferred from a
  // free-text title, category or location.
  //
  // The overlap with FAC-BACKLOG is DECIDED, not accidental: an overdue compliance
  // item is also an open maintenance item, so it sits inside FAC-BACKLOG's count.
  // The two carry DIFFERENT factKeys and the domain band counts DISTINCT factKeys,
  // so facilities can be darkened by both — correctly, because a backlog SIZE and a
  // named regulatory inspection past its own date are two different facts. Netting
  // compliance items out of the backlog would silently move FAC-BACKLOG's value for
  // every school that adopts the new field.
  evaluate(c) {
    const s = c.signal('fac.inspections')
    const sum = c.register.complianceInspections
    if (sum === null) {
      throw new TwinCannotEvaluate('value_not_usable', 'fac.inspections', INSPECTION_SUMMARY_MISSING)
    }
    const overdue = sum.overdueCount
    const oldest = sum.oldestOverdueDays
    if (overdue < 0 || sum.trackedCount < overdue) {
      throw new TwinCannotEvaluate('value_not_usable', 'fac.inspections', INSPECTION_SUMMARY_MISSING)
    }
    if (overdue < 1) return []
    // The sentence NAMES the kind, and the severity is decided BY the kind, so the
    // two cannot disagree. Without a kind to name there is no sentence to say —
    // "an inspection of an unnamed kind is overdue" is a sentence this product will
    // not say — and an overdue item nought days past its own date is not overdue.
    if (sum.overdueKinds.length === 0 || oldest < 1) {
      throw new TwinCannotEvaluate('value_not_usable', 'fac.inspections', INSPECTION_SUMMARY_MISSING)
    }
    const kinds = sum.overdueKinds.map(complianceKindLabel).join(', ')
    return [
      {
        scopeKey: 'school',
        factKey: `register:compliance_inspection_overdue@${s.observedOn ?? 'undated'}`,
        evidence: [
          ev('overdueCount', 'Compliance inspections past their target date', overdue, fmtCount(overdue), s.observedOn, s.lineage),
          ev('oldestOverdueDays', 'How far past due the oldest is', oldest, fmtDays(oldest)),
          ev('kinds', 'Kinds of inspection overdue', kinds, kinds),
          ev(
            'trackedCount',
            'Items on your facilities register flagged as a compliance inspection',
            sum.trackedCount,
            fmtCount(sum.trackedCount),
          ),
        ],
        severity: sum.anyLifeSafety ? 'critical' : 'warn',
        likelihood: 'likely',
        confidence: 'observation',
        horizon: NO_HORIZON(HORIZON_DATE_PASSED),
        templateVariant: overdue === 1 ? 'low' : 'primary',
        consequence:
          "Cognia's safety assurance is a binary gate and MSA and NSBECS both name facilities adequacy. An inspection your own register says is past due is the first document a visiting team asks to see.",
      },
    ]
  },
}

const ACC_PRIOR_FINDING_OPEN: TwinRuleDef = {
  id: 'ACC-PRIOR-FINDING-OPEN',
  kind: 'standard',
  // "a PREVIOUS visit", never "your LAST visit". The group's date is the date of
  // the visit THAT CITATION came from, which is not necessarily the school's most
  // recent visit — a 2021 team can leave nothing open while a 2015 citation still
  // stands. The briefing composes `${code} — ${title}`, so a title that claimed
  // "your last visit" would put a false clause in front of a true rationale.
  title: 'A citation from a previous accreditation visit is still open',
  requiredAvailable: ['acc.prior_visit_findings'],
  requiredAbsent: [],
  requiredPriors: [],
  needsRegister: true,
  domainKeys: ['continuous_improvement'],
  defaultDomainKey: 'continuous_improvement',
  standardCodes: NO_CODES,
  rationaleTemplate:
    '{{openCount}} citations against {{code}} from the visit of {{visitDate}} are still recorded as open in your own register.',
  // 'One' is a WORD, so `/\d/` never matches outside a {{…}} in either template.
  rationaleTemplateLow:
    'One citation against {{code}}, from the visit of {{visitDate}}, is still recorded as open in your own register.',
  unlock: null,
  // THE PROHIBITION, MECHANISED (plan G10; D4 stays frozen). severity, likelihood,
  // confidence and horizon below are LITERALS, not functions of anything on the
  // prior-visit register: one visiting team per six years per school is not
  // calibratable, so nothing here may tune the risk arithmetic. What a matched open
  // citation DOES get is exactly what any other `warn` finding gets — one distinct
  // fact under one named standard — and no multiplier, weight or calibration term.
  //
  // The rejected alternative is recorded: keeping prior-visit findings out of the
  // fact count entirely. It was rejected because "raise a standard's visibility" is
  // precisely what a fact-count band does, and excluding one rule's facts from the
  // count would make the band no longer a count of facts.
  evaluate(c) {
    const out: TwinFindingDraft[] = []
    // Matching already happened in the caller, by EXACT equality after trim +
    // uppercase. Nothing here fuzzy-matches, and a citation the caller could not
    // place never arrives — it stays on the register endpoint, shown as unmatched.
    const byCode = new Map(sortedStandards(c.register).map((st) => [st.code, st]))
    for (const cite of c.register.priorVisitCitations) {
      const st = byCode.get(cite.code)
      if (!st) continue
      if (cite.openCount < 1) continue
      out.push({
        scopeKey: `standard:${st.standardId}`,
        // THE VISIT IS PART OF THE FACT. A school cited on one standard at two
        // visits holds two distinct, separately-closable facts; one factKey per
        // (standard, visit) is what makes "{{openCount}} … from the visit of
        // {{visitDate}}" true rather than an average of two visits.
        factKey: `standard:${st.standardId}:prior_visit_open@${cite.visitDate}`,
        standardCodes: [st.code],
        domainKeys: st.domainKeys,
        defaultDomainKey: st.primaryDomainKey,
        // The citation TEXT is deliberately absent: it is free text lifted from a
        // PDF, of unbounded length and unknown provenance. The register endpoint
        // shows it; the twin payload — which feeds the briefing, Penny and every
        // export — does not.
        evidence: [
          ev('code', 'Standard', st.code, st.code),
          ev('title', 'Standard title', st.title, st.title),
          ev('visitDate', 'Visit date', cite.visitDate, formatCivilDate(cite.visitDate)),
          ev('openCount', 'Citations still open', cite.openCount, fmtCount(cite.openCount)),
        ],
        // ALWAYS 'warn'. CONSTANT. Escalating on a prior citation would need an
        // outcome model this program does not have and will not fake, and
        // ACC-ASSURANCE-GAP already owns standing 'critical' for an unmet gate.
        severity: 'warn',
        likelihood: 'likely',
        confidence: 'observation',
        horizon: NO_HORIZON(HORIZON_CONDITION_TODAY),
        templateVariant: cite.openCount === 1 ? 'low' : 'primary',
        consequence:
          "A visiting team reads its predecessor's report before it reads yours. A citation from the last visit that your own register still shows as open is the first thing they will ask you to walk them through.",
      })
    }
    return out
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// THE FROZEN CATALOG
// ─────────────────────────────────────────────────────────────────────────────

export const TWIN_RULE_DEFS: readonly TwinRuleDef[] = Object.freeze([
  GOV_MINUTES_LAG,
  GOV_MINUTES_NEVER_RECORDED,
  GOV_CADENCE_GAP,
  GOV_POLICY_OVERDUE,
  GOV_TERM_EXPIRY,
  GOV_COMMITTEE_NO_CHAIR,
  FIN_AUDIT_STALE,
  FIN_RESERVE_THIN,
  FIN_BUDGET_DETERIORATING,
  FIN_AR_AGING_WORSENING,
  STRAT_PLAN_EXPIRING,
  STRAT_PLAN_EXPIRED,
  ENR_DECLINE,
  ENR_FEEDER_EROSION,
  ACC_UNSCORED,
  ACC_UNSUPPORTED_SCORE,
  ACC_ASSURANCE_GAP,
  EVI_STALE,
  EVI_MISSING_REQUIRED,
  FAC_BACKLOG,
  HR_RATIO_DRIFT,
  SCHOOL_NOT_REPORTING,
  HR_PD_LOW,
  SAFE_ENV_GAP,
  CURR_DOC_AGING,
  ACAD_GROWTH_FLAT,
  // ── AIC Phase F, in TWIN_RULE_IDS order.
  HR_EVAL_OVERDUE,
  FAC_INSPECTION_DUE,
  ACC_PRIOR_FINDING_OPEN,
])

export const TWIN_RULES_BY_ID: ReadonlyMap<TwinRuleId, TwinRuleDef> = new Map(
  TWIN_RULE_DEFS.map((d) => [d.id, d]),
)

// ── Deterministic register iteration ─────────────────────────────────────────
//
// Standards and evidence groups are sorted by their own stable natural key before
// any rule reads them, so shuffling the caller's arrays cannot change a payload.
// Determinism is not a testing convenience here: the reconciliation dedupes on a
// payload hash, and an order-dependent hash would churn the ledger nightly.

function sortedStandards(register: TwinRegisterView): readonly TwinStandardView[] {
  return [...register.standards].sort(
    (a, b) => a.code.localeCompare(b.code) || a.standardId.localeCompare(b.standardId),
  )
}

function sortedGroups(register: TwinRegisterView): readonly TwinEvidenceGroupView[] {
  return [...register.evidenceGroups].sort((a, b) => a.tag.localeCompare(b.tag))
}

// ─────────────────────────────────────────────────────────────────────────────
// §1.5 THE RULE-EVALUATION CONTRACT
// ─────────────────────────────────────────────────────────────────────────────

const AVAILABILITY_TO_REASON: Readonly<
  Record<Exclude<TwinSignalAvailability, 'available'>, NotEvaluatedReason>
> = {
  not_licensed: 'signal_not_licensed',
  no_data: 'signal_no_data',
  not_tracked: 'signal_not_tracked',
}

const MISSING_SIGNAL_MESSAGE =
  'This signal is not present in the collected set, so the rule cannot be evaluated.'
const EXPECTED_ABSENT_MESSAGE =
  'This rule reads the ABSENCE of this signal as its fact, and the signal is present.'
const NO_PRIOR_MESSAGE =
  'We hold only one observation of this register, and this rule compares two.'
const NO_STANDARDS_MESSAGE =
  'None of the standards this rule would be cited under exists in your framework, so there is nothing to report it against.'

function frameworkOf(register: TwinRegisterView): TwinFrameworkCode {
  const code = register.frameworkCode
  return code !== null && (TWIN_FRAMEWORK_CODES as readonly string[]).includes(code)
    ? (code as TwinFrameworkCode)
    : 'cognia_2022'
}

/** Render a frozen template. An unresolved placeholder is a bug, and it throws. */
function renderTemplate(
  ruleId: TwinRuleId,
  template: string,
  evidence: readonly TwinEvidenceEntry[],
): string {
  const byKey = new Map(evidence.map((e) => [e.key, e]))
  return template.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    const entry = byKey.get(key)
    if (!entry) throw new TwinTemplateError(ruleId, key)
    return entry.display
  })
}

interface EngineOptions {
  priorFacts?: Readonly<Record<string, PriorFact>>
  /**
   * `resolvePrimaryDomains`'s output, injected.
   *
   * The ≥0.5 attribution rule lives in ONE place (apps/api's fact-domains.ts) and
   * this engine never re-implements it. Absent the map — pure unit tests — each
   * finding's own `defaultDomainKey` is used, and a spec asserts the two agree on
   * a register that maps cleanly.
   */
  primaryDomainByFactKey?: Readonly<Record<string, DomainKey>>
}

/**
 * THE ENGINE.
 *
 * `now` is a `yyyy-mm-dd` string, never a clock read. `rules` is passed in rather
 * than closed over so a caller can evaluate a subset (a single-rule preview, a
 * spec) without the engine deciding for it — but `coverage.rulesTotal` always
 * counts what it was given, so a partial run cannot masquerade as a full one.
 */
export function deriveTwin(
  signals: readonly TwinSignalView[],
  register: TwinRegisterView,
  rules: readonly TwinRuleDef[],
  now: string,
  opts?: EngineOptions,
): TwinResult {
  const byKey = new Map<string, TwinSignalView>()
  for (const s of signals) byKey.set(s.key, s)
  const priors = opts?.priorFacts ?? {}
  const framework = frameworkOf(register)
  const registerCodes = new Set(register.standards.map((s) => s.code))

  const findings: TwinFinding[] = []
  const notEvaluated: TwinNotEvaluated[] = []
  const firedRuleIds = new Set<TwinRuleId>()

  const refuse = (
    def: TwinRuleDef,
    reason: NotEvaluatedReason,
    key: string | null,
    message: string,
  ): void => {
    const sig = key ? byKey.get(key) : undefined
    notEvaluated.push({
      ruleId: def.id,
      title: def.title,
      reason,
      blockingSignalKey: key,
      blockingSignalLabel: sig?.label ?? null,
      message,
      moduleKey: sig?.moduleKey ?? def.unlock?.moduleKey ?? null,
      unlock: def.unlock,
    })
  }

  for (const def of rules) {
    // ── 1. AVAILABILITY GATE. The first failing key in declaration order — a
    //       deterministic answer, never "all of them".
    let blocked = false
    for (const key of def.requiredAvailable) {
      const sig = byKey.get(key)
      if (!sig) {
        refuse(def, 'signal_no_data', key, MISSING_SIGNAL_MESSAGE)
        blocked = true
        break
      }
      if (sig.availability !== 'available') {
        refuse(
          def,
          AVAILABILITY_TO_REASON[sig.availability],
          key,
          sig.unavailableReason ?? TWIN_NO_REASON_FALLBACK,
        )
        blocked = true
        break
      }
    }
    if (blocked) continue

    // ── 2. ABSENCE GATE. The absence IS the fact, and only where the collector's
    //       shared query proves the difference between "nothing" and "failed".
    for (const key of def.requiredAbsent) {
      const sig = byKey.get(key)
      if (!sig || sig.availability !== 'no_data') {
        refuse(def, 'signal_present_but_expected_absent', key, EXPECTED_ABSENT_MESSAGE)
        blocked = true
        break
      }
    }
    if (blocked) continue

    // ── 3. PRIOR GATE. A prior whose observedOn equals the live reading is the
    //       SAME observation, not a previous one.
    for (const key of def.requiredPriors) {
      const prior = priors[key]
      const live = byKey.get(key)
      if (!prior || (prior.observedOn !== null && prior.observedOn === live?.observedOn)) {
        refuse(def, 'no_prior_observation', key, NO_PRIOR_MESSAGE)
        blocked = true
        break
      }
    }
    if (blocked) continue

    // ── 4. REGISTER GATE.
    if (def.needsRegister && register.standards.length === 0) {
      refuse(def, 'no_standards', null, NO_STANDARDS_MESSAGE)
      continue
    }

    // ── 5. PREDICATE. Zero findings is a PASS, never a refusal.
    const ctx = makeContext(def, byKey, priors, register, now, signals)
    let drafts: readonly TwinFindingDraft[]
    try {
      drafts = def.evaluate(ctx)
    } catch (e) {
      if (e instanceof TwinCannotEvaluate) {
        refuse(def, e.reason, e.blockingSignalKey, e.detail)
        continue
      }
      throw e
    }

    // ── 6/7. RENDER + TAG RESOLUTION.
    let kept = 0
    let dropped = 0
    for (const draft of drafts) {
      const tags = resolveStandardTags(def, draft, framework, registerCodes)
      if (tags.length === 0) {
        dropped += 1
        continue
      }
      const template =
        draft.templateVariant === 'low' && def.rationaleTemplateLow
          ? def.rationaleTemplateLow
          : def.rationaleTemplate
      findings.push({
        ruleId: def.id,
        scopeKey: draft.scopeKey,
        factKey: draft.factKey,
        title: draft.title ?? def.title,
        rationale: renderTemplate(def.id, template, draft.evidence),
        evidence: draft.evidence,
        standardTags: tags,
        domainKeys: [...(draft.domainKeys ?? def.domainKeys)],
        defaultDomainKey: draft.defaultDomainKey ?? def.defaultDomainKey,
        severity: draft.severity,
        likelihood: draft.likelihood,
        confidence: draft.confidence,
        horizon: draft.horizon,
        consequence: draft.consequence,
      })
      kept += 1
    }
    if (kept > 0) firedRuleIds.add(def.id)
    // G3 is enforced HERE, not in review: a rule whose every finding failed to
    // land on a real standard code did not "pass", it could not be reported.
    if (kept === 0 && dropped > 0) refuse(def, 'no_standards', null, NO_STANDARDS_MESSAGE)
  }

  // ── 8. Determinism. Sorted by (severity, ruleId, scopeKey).
  findings.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.ruleId.localeCompare(b.ruleId) ||
      a.scopeKey.localeCompare(b.scopeKey) ||
      a.factKey.localeCompare(b.factKey),
  )

  const perStandardRisk = computePerStandardRisk(register, findings, signals)
  const domainBands = computeDomainBands(register, findings, signals, opts?.primaryDomainByFactKey)
  const coverage = computeCoverage(rules, notEvaluated, firedRuleIds, signals)

  return {
    version: ACCREDITATION_TWIN_VERSION,
    now,
    frameworkCode: register.frameworkCode,
    demoData: register.demoData,
    snapshotAsOf: register.snapshotAsOf,
    findings,
    notEvaluated,
    coverage,
    perStandardRisk,
    domainBands,
  }
}

function makeContext(
  def: TwinRuleDef,
  byKey: ReadonlyMap<string, TwinSignalView>,
  priors: Readonly<Record<string, PriorFact>>,
  register: TwinRegisterView,
  now: string,
  allSignals: readonly TwinSignalView[],
): RuleContext {
  const declared = new Set<string>([
    ...def.requiredAvailable,
    ...def.requiredAbsent,
    ...def.requiredPriors,
  ])
  return {
    now,
    register,
    thresholds: TWIN_THRESHOLDS,
    signal(key) {
      if (!declared.has(key)) throw new TwinUndeclaredSignalError(def.id, key)
      const s = byKey.get(key)
      if (!s) throw new TwinUndeclaredSignalError(def.id, key)
      return s
    },
    prior(key) {
      if (!def.requiredPriors.includes(key)) throw new TwinUndeclaredSignalError(def.id, key)
      const p = priors[key]
      if (!p) throw new TwinUndeclaredSignalError(def.id, key)
      return p
    },
    bands(metricKey) {
      return bandsFor(metricKey as MetricKey)
    },
    allSignals() {
      return allSignals
    },
  }
}

/**
 * §1.5 step 7. The def's per-framework codes intersected with the codes actually
 * present in THIS school's register, PLUS the codes the rule itself resolved
 * (standard-scoped and evidence-scoped rules always emit their own).
 */
function resolveStandardTags(
  def: TwinRuleDef,
  draft: TwinFindingDraft,
  framework: TwinFrameworkCode,
  registerCodes: ReadonlySet<string>,
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const code of def.standardCodes[framework] ?? []) {
    if (!registerCodes.has(code) || seen.has(code)) continue
    seen.add(code)
    out.push(code)
  }
  for (const code of draft.standardCodes ?? []) {
    if (!registerCodes.has(code) || seen.has(code)) continue
    seen.add(code)
    out.push(code)
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 RISK SCORING — 40·C + 40·T + 20·E
//
// `drivers[]` is MANDATORY and non-empty on every entry, including the null-risk
// and bypass cases. A number with no drivers is a score nobody can argue with,
// which is the failure mode this whole program exists to avoid.
// ─────────────────────────────────────────────────────────────────────────────

const ASSURANCE_BYPASS_REASON =
  'Assurance gates are pass or fail; a risk percentage would soften a binary.'
const NO_EVIDENCE_REASON =
  'No evidence is attached to this standard, so there is nothing to score against. This is not a risk of zero.'
const T_HOLE_DETAIL =
  'No operating signal bound to this standard could be read, so trajectory contributes nothing to this score.'
const T_NO_BINDING_DETAIL =
  'No operating signal is bound to this standard, so trajectory contributes nothing to this score.'
const E_HOLE_DETAIL =
  'This standard has no tracked evidence requirement, so evidence contributes nothing to this score.'

/**
 * DEVIATION FROM "register order", documented: entries come back in stable
 * (code, standardId) order rather than the order the caller happened to hand us
 * the standards in. Determinism outranks presentation here — the reconciliation
 * hashes this payload, and an order-dependent hash would rewrite the ledger every
 * night for no change in fact. A client that wants register order re-sorts.
 */
function computePerStandardRisk(
  register: TwinRegisterView,
  findings: readonly TwinFinding[],
  signals: readonly TwinSignalView[],
): TwinStandardRisk[] {
  const out: TwinStandardRisk[] = []
  for (const st of sortedStandards(register)) {
    const cited = findings.filter((f) => f.standardTags.includes(st.code))
    const factSeverity = new Map<string, TwinSeverity>()
    for (const f of cited) {
      const prev = factSeverity.get(f.factKey)
      if (prev === undefined || SEVERITY_RANK[f.severity] < SEVERITY_RANK[prev]) {
        factSeverity.set(f.factKey, f.severity)
      }
    }
    const findingKeys = [...new Set(cited.map((f) => f.factKey))].sort()

    // C — CONDITION. Over DISTINCT factKeys, never findings: the fan-out is real
    // (one plan end date speaks through two rules) and counting findings would
    // double a single fact.
    const cSum = [...factSeverity.values()].reduce((a, s) => a + SEVERITY_FACT_WEIGHT[s], 0)
    const c = clamp01(cSum)
    const cDriver: TwinRiskDriver = {
      component: 'C',
      weight: 40,
      raw: c,
      contribution: round1(40 * c),
      detail:
        c === 0
          ? 'No open finding cites this standard.'
          : `${fmtCount(cited.length)} open findings across ${fmtCount(factSeverity.size)} distinct facts cited under this standard.`,
    }

    // T — TRAJECTORY, over the metric keys Phase B bound to this standard.
    //
    // THE DENOMINATOR IS THE STANDARD'S BINDING, NOT THE PART OF IT WE COULD READ.
    // Filtering unreadable signals out of the denominator did two dishonest things
    // at once: the driver sentence claimed a binding size that was not the
    // standard's binding ("1 of 1 bound signals are moving unfavourably" when two
    // of three sat behind an unlicensed module), and renormalising over the
    // survivors MOVED THE SCORE — up when the readable signal was unhealthy, down
    // when it was healthy — on precisely the standards we could see least of.
    // Scoring an unreadable signal exactly as a flat one keeps an unlicensed
    // module out of the score entirely; it is `coverage` that records the hole,
    // and the driver detail that names it.
    const boundAll = signals.filter(
      (s) => s.lineage?.metricKey !== undefined && st.boundMetricKeys.includes(s.lineage.metricKey),
    )
    const bound = boundAll.filter((s) => s.availability === 'available' && s.trend !== null)
    const unreadable = boundAll.filter((s) => !bound.includes(s))
    const unreadableClause =
      unreadable.length === 0
        ? ''
        : ` ${fmtCount(unreadable.length)} of ${fmtCount(boundAll.length)} could not be read (${unreadable.map((s) => s.label).join(', ')}).`
    let tRaw = 0
    let tDetail = boundAll.length === 0 ? T_NO_BINDING_DETAIL : T_HOLE_DETAIL + unreadableClause
    if (bound.length > 0) {
      let sum = 0
      const moving: string[] = []
      for (const s of bound) {
        const tr = s.trend as TrendSignal
        const unfavourable = tr.direction === 'declining' && tr.materiality.met
        const w = unfavourable ? (tr.confidence === 'trend' ? 1 : tr.confidence === 'directional' ? 0.6 : 0) : 0
        if (w > 0) moving.push(s.label)
        sum += w
      }
      tRaw = clamp01(sum / boundAll.length)
      tDetail =
        `${fmtCount(moving.length)} of ${fmtCount(boundAll.length)} bound signals are moving unfavourably (${moving.length > 0 ? moving.join(', ') : 'none'}).` +
        unreadableClause
    }
    const tDriver: TwinRiskDriver = {
      component: 'T',
      weight: 40,
      raw: tRaw,
      contribution: round1(40 * tRaw),
      // A SILENT ZERO IS FORBIDDEN; a VISIBLE zero is honest.
      detail: tDetail,
    }

    // E — EVIDENCE, over PLATFORM-tracked requirements only. A requirement we
    // chose not to track is our hole, and it never enters this denominator.
    const platform = st.requirements.filter((r) => r.dataAvailability === 'platform')
    let eRaw = 0
    let eDetail = E_HOLE_DETAIL
    if (platform.length > 0) {
      const current = platform.filter((r) => r.state === 'current').length
      eRaw = clamp01(1 - current / platform.length)
      eDetail = `${fmtCount(current)} of ${fmtCount(platform.length)} tracked artifacts are current.`
    }
    const eDriver: TwinRiskDriver = {
      component: 'E',
      weight: 20,
      raw: eRaw,
      contribution: round1(20 * eRaw),
      detail: eDetail,
    }

    const base = {
      standardId: st.standardId,
      code: st.code,
      findingCount: cited.length,
      findingKeys,
    }

    // EXIT 1 — an unmet assurance. The ONLY route to band 'critical'.
    if (st.isAssurance && st.assuranceSatisfied === false) {
      out.push({
        ...base,
        risk: null,
        band: 'critical',
        bypass: 'unmet_assurance',
        drivers: [
          {
            component: 'C',
            weight: 40,
            raw: 1,
            contribution: 40,
            detail:
              'This standard is an assurance gate and it is unmet. Assurances are pass or fail, so the risk formula is bypassed entirely.',
          },
        ],
        reason: ASSURANCE_BYPASS_REASON,
      })
      continue
    }

    // EXIT 2 — zero evidence. `null`, NEVER `0`: zero reads as "excellent here"
    // on exactly the standards where we know least. All three drivers are still
    // computed and returned, so the UI renders the basis beside the refusal.
    if (st.evidenceCount === 0) {
      out.push({
        ...base,
        risk: null,
        band: null,
        bypass: null,
        drivers: [cDriver, tDriver, eDriver],
        reason: NO_EVIDENCE_REASON,
      })
      continue
    }

    // EXIT 3 — EVERY driver is a documented hole. C is zero because no finding
    // cites the standard, T because nothing bound to it could be read, E because
    // nothing under it is tracked. The formula then returns 0, `bandForRisk(0)` is
    // 'clear', and the register draws a GREEN pill on the one standard the engine
    // could not look at — the most reassuring output the component can produce,
    // from an absence of input. An unlicensed module is supposed to cost coverage,
    // not buy a clean bill of health. Same discipline as EXIT 2: null with a
    // reason, and all three drivers still returned so the basis is visible.
    if (c === 0 && bound.length === 0 && platform.length === 0) {
      const missing =
        unreadable.length > 0
          ? `the ${unreadable.length === 1 ? 'signal' : 'signals'} bound to it could not be read (${unreadable.map((s) => s.label).join(', ')})`
          : 'no operating signal is bound to it'
      out.push({
        ...base,
        risk: null,
        band: null,
        bypass: null,
        drivers: [cDriver, tDriver, eDriver],
        reason: `Nothing under this standard could be scored: ${missing}, it has no tracked evidence requirement, and no open finding cites it. This is not a risk of zero.`,
      })
      continue
    }

    const risk = round1(40 * c + 40 * tRaw + 20 * eRaw)
    out.push({
      ...base,
      risk,
      band: bandForRisk(risk),
      bypass: null,
      drivers: [cDriver, tDriver, eDriver],
      reason: null,
    })
  }
  return out
}

/** §3.3. `critical` is reachable ONLY through the assurance bypass. */
export function bandForRisk(risk: number): TwinRiskBand {
  if (risk < 25) return 'clear'
  if (risk < 50) return 'watch'
  if (risk < 75) return 'elevated'
  return 'high'
}

// ─────────────────────────────────────────────────────────────────────────────
// §3.4 DOMAIN BANDS — ordinal, over DISTINCT factKeys
//
// `MIN_DOMAIN_LEAVES` deliberately does NOT gate a band. See the file header:
// a band counts FACTS; it does not average a handful of leaves into a percentage.
// ─────────────────────────────────────────────────────────────────────────────

function computeDomainBands(
  register: TwinRegisterView,
  findings: readonly TwinFinding[],
  signals: readonly TwinSignalView[],
  primaryByFact?: Readonly<Record<string, DomainKey>>,
): TwinDomainBand[] {
  // One primary domain per DISTINCT factKey, at the fact's worst severity.
  const factPrimary = new Map<string, { domain: DomainKey; severity: TwinSeverity }>()
  for (const f of findings) {
    const domain = primaryByFact?.[f.factKey] ?? f.defaultDomainKey
    const prev = factPrimary.get(f.factKey)
    if (prev === undefined) {
      factPrimary.set(f.factKey, { domain, severity: f.severity })
      continue
    }
    if (SEVERITY_RANK[f.severity] < SEVERITY_RANK[prev.severity]) {
      factPrimary.set(f.factKey, { domain: prev.domain, severity: f.severity })
    }
  }

  return DOMAIN_KEYS.map((domainKey) => {
    const facts = { critical: 0, warn: 0, info: 0, total: 0 }
    for (const entry of factPrimary.values()) {
      if (entry.domain !== domainKey) continue
      facts[entry.severity] += 1
      facts.total += 1
    }
    const standardCount = register.standards.filter(
      (s) => s.primaryDomainKey === domainKey || s.domainKeys.includes(domainKey),
    ).length
    const availableSignalCount = signals.filter(
      (s) => s.availability === 'available' && s.domainKeys.includes(domainKey),
    ).length

    // G12, MECHANICAL: grey WITH A REASON, never grey with a number.
    //
    // THE GATE IS READABILITY, NOT EXISTENCE. It used to require BOTH zero
    // standards and zero readable signals, so a single standard was enough to
    // force a band over a domain the engine could not see into — and with no
    // facts, `bandForFacts` returns 'clear' and the strip drew a green card
    // reading "No open fact in this domain" for a module the school has not
    // licensed. A domain with no readable signal and no fact has produced no
    // evidence either way; that is 'not measured', not 'clear'.
    if (facts.total === 0 && availableSignalCount === 0) {
      return {
        domainKey,
        band: null,
        reason:
          standardCount === 0
            ? `No standard in your framework and no KYRO signal reaches ${DOMAIN_REASON_NOUN[domainKey]}. Not measured.`
            : `No KYRO signal reaches ${DOMAIN_REASON_NOUN[domainKey]}, so there is nothing to band the ${fmtCount(standardCount)} standard${standardCount === 1 ? '' : 's'} here against. Not measured.`,
        facts,
        standardCount,
        availableSignalCount,
      }
    }
    return {
      domainKey,
      band: bandForFacts(facts),
      reason: null,
      facts,
      standardCount,
      availableSignalCount,
    }
  })
}

export function bandForFacts(facts: { critical: number; warn: number; info: number }): TwinRiskBand {
  if (facts.critical >= 1) return 'high'
  if (facts.warn >= 4) return 'high'
  if (facts.warn >= 2) return 'elevated'
  if (facts.warn === 1 && facts.info >= 2) return 'elevated'
  if (facts.warn === 1) return 'watch'
  if (facts.info >= 2) return 'watch'
  return 'clear'
}

// ─────────────────────────────────────────────────────────────────────────────
// COVERAGE — the published size of the hole
// ─────────────────────────────────────────────────────────────────────────────

function computeCoverage(
  rules: readonly TwinRuleDef[],
  notEvaluated: readonly TwinNotEvaluated[],
  firedRuleIds: ReadonlySet<TwinRuleId>,
  signals: readonly TwinSignalView[],
): TwinCoverage {
  const rulesTotal = rules.length
  const rulesNotEvaluated = notEvaluated.length
  const rulesEvaluated = rulesTotal - rulesNotEvaluated

  const counts = { available: 0, not_licensed: 0, no_data: 0, not_tracked: 0 }
  for (const s of signals) counts[s.availability] += 1

  // The upsell surface: rules blocked PURELY by a licence, grouped by the module
  // that would light them. A licence is a commercial fact, not a school's failing.
  const blockedByModule: Record<string, TwinRuleId[]> = {}
  for (const ne of notEvaluated) {
    if (ne.reason !== 'signal_not_licensed' || !ne.moduleKey) continue
    ;(blockedByModule[ne.moduleKey] ??= []).push(ne.ruleId)
  }
  for (const key of Object.keys(blockedByModule)) blockedByModule[key].sort()

  // F13. A signal we CAN read whose series is too short to read a direction from.
  // This is the honest CTA: not "buy something", but "give us one more year".
  //
  // GROUPED BY THE BLOCKING SIGNAL, then narrowed to the nearest one. Every part
  // of the published ask — the rule list, the number of years, the year LABELS —
  // then belongs to the same series, so "these rules unlock when you add these
  // years" is a claim the arithmetic actually supports.
  const byKey = new Map(signals.map((s) => [s.key, s]))
  const groups = new Map<string, { gap: number; firstFy: number | null; ruleIds: TwinRuleId[] }>()
  for (const def of rules) {
    if (def.kind !== 'trend') continue
    if (firedRuleIds.has(def.id)) continue
    const key = def.requiredAvailable[0]
    const sig = key ? byKey.get(key) : undefined
    if (!key || !sig || sig.availability !== 'available' || sig.trend === null) continue
    const n = sig.trend.n
    if (n >= MIN_N_FOR_TREND) continue
    const g = groups.get(key) ?? {
      gap: MIN_N_FOR_TREND - n,
      firstFy: sig.trend.fiscalYears[0] ?? null,
      ruleIds: [],
    }
    g.ruleIds.push(def.id)
    groups.set(key, g)
  }
  // Nearest gap wins; ties broken on the signal key so the payload is deterministic.
  let nearest: { key: string; gap: number; firstFy: number | null; ruleIds: TwinRuleId[] } | null =
    null
  for (const key of [...groups.keys()].sort()) {
    const g = groups.get(key)!
    if (nearest === null || g.gap < nearest.gap) nearest = { key, ...g }
  }
  const unlockableIds = nearest === null ? [] : [...nearest.ruleIds].sort()
  const fyLabels: string[] = []
  if (nearest !== null && nearest.firstFy !== null) {
    for (let i = 1; i <= nearest.gap; i += 1) fyLabels.push(fyRangeLabel(nearest.firstFy - i))
  }

  return {
    rulesTotal,
    rulesEvaluated,
    rulesFired: firedRuleIds.size,
    rulesNotEvaluated,
    evaluablePct: rulesTotal === 0 ? 0 : round3(rulesEvaluated / rulesTotal),
    signals: counts,
    blockedByModule,
    unlockableByYears: {
      signalKey: nearest?.key ?? null,
      ruleIds: unlockableIds,
      yearsNeeded: nearest?.gap ?? 0,
      fyLabels,
    },
    // ALWAYS the four, on every payload. The named hole IS the deliverable.
    namedHoles: VISIBLE_HOLE_RULE_IDS.map((id) => {
      const def = TWIN_RULES_BY_ID.get(id)
      return {
        ruleId: id,
        intake: def?.unlock?.intake ?? '',
        copy: def?.unlock?.copy ?? '',
      }
    }),
  }
}
