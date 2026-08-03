// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase H — THE MOCK VISIT, composed. PURE.
//
// Six acts: the team is here → what they'd commend → what they'd likely find →
// what they'd ask for → WHAT WE COULD NOT ANSWER → so here's the plan.
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE: **it composes no sentence about any
// finding.** `title`, `rationale`, `consequence` and every `evidence[].display`
// are carried through byte-identical from the rule engine, and `basis` is the
// SAME ARRAY REFERENCE as `evidence` — never a mapped copy. That is why the Mock
// Visit and the Signals tab cannot drift: there is no second code path that could
// say something different about one fact.
//
// A SECOND FINDING TYPE WAS PROPOSED AND REFUSED. `PredictedFinding{standardId,
// likelihood, confidence, horizon, basis[], tier}` carries no fact `TwinFinding`
// cannot already express — `standardTags`/`scopeKey`, `likelihood`, `confidence`,
// `horizon`, `evidence[]`, and a tier that is constant by construction (nothing
// here is an observation of a real visit). What it WOULD carry is a second
// populator for `basis[]`, and this program has twice nearly shipped two surfaces
// quoting different sentences about one fact. So the Mock Visit is a REGROUPING
// of the twin's findings, and the rhetorical difference between "early warning"
// and "mock-visit finding" is served by grouping and by act copy.
//
// PURITY. No clock, no random, no I/O, no React. `now` is an input field. The
// package's purity guard also forbids the literal spellings of the browser
// globals, so this header avoids them.
//
// SENTENCES THIS FILE IS ALLOWED TO WRITE: sentences about the ASSESSMENT (Act 1's
// framing lines, the executive summary, and the frozen "nothing to say" and
// "could not be read" lines). Never a sentence about a finding, a commendation, a
// recommendation or an evidence row.
// ─────────────────────────────────────────────────────────────────────────────

import type { DomainConfidence, DomainKey } from './accreditation-domains.js'
import type {
  TwinCoverage,
  TwinEvidenceEntry,
  TwinFinding,
  TwinNotEvaluated,
} from './accreditation-twin.js'
import { formatCivilDate } from './accreditation-twin.js'
import type { Commendation, CommendationExclusions } from './accreditation-commendations.js'
import type { EvidenceHealth } from './evidence-currency.js'
import type {
  EstimatedLift,
  Recommendation,
  RecommendationOriginType,
  RecommendationTemplateId,
  SuggestedOwnerRole,
} from './improvement-findings.js'
import { RECOMMENDATION_TEMPLATE_IDS } from './improvement-findings.js'

export const VISIT_VERSION = '1.0.0'

/**
 * How many drafted commitments Act 6 offers at once. Five is a board agenda, not
 * a backlog; the remainder is COUNTED (`moreAvailable`) and the screen links to
 * /improvement rather than duplicating the rail.
 */
export const VISIT_PLAN_LIMIT = 5

/** The Evidence Index page shipped in Phase C. Act 4 points at it; it is not rebuilt. */
export const VISIT_EVIDENCE_INDEX_ROUTE = '/accreditation/evidence/print'

/**
 * A finding with no standard code is real work; it is simply not work under a
 * standard. Rendered VERBATIM above `schoolLevel`.
 */
export const SCHOOL_LEVEL_FINDING_NOTE =
  'This finding is not scoped to a single standard. A visiting team would raise it with the head of school rather than under a standard code.'

/**
 * A roster row that could not be read and whose collector gave no reason. It
 * NEVER renders blank: "we could not read this and we cannot tell you why" is a
 * worse answer than a reason, and it is still an answer.
 */
export const NO_REASON_GIVEN =
  'This signal could not be read, and the collector recorded no reason.'

// ── The frozen "we could not read this" lines. One per degradable source. ─────
// Each is the reason field its act carries when the API's read failed. The API
// service composes NONE of them: it passes `null` (the fact) and reads the
// sentence back off this module, so there is exactly one wording per failure.

export const VISIT_READINESS_UNREADABLE =
  'Readiness could not be read for this school, so the documented and defensible figures cannot be stated.'

/**
 * NO FRAMEWORK IS ADOPTED, so there is nothing to be documented or defensible
 * AGAINST — and that is a different fact from "we could not read your readiness"
 * and a very different fact from "you scored zero".
 *
 * This exists because both halves of the pair are 0 BY CONSTRUCTION for a school
 * with no standard rows: the readiness engine averages over an empty leaf set and
 * an empty average is 0, not null. Quoting those zeroes gave a school that has
 * bought accreditation and not yet started a measured-sounding
 * "documented readiness is 0%, defensible readiness is 0%" — spoken aloud by the
 * narration player, printed on the board one-pager, and emailed to the board —
 * while Act 6 of the same document correctly said there was nothing to plan
 * against. The Accreditation page has always refused to show that pair without an
 * adopted framework; this makes the Mock Visit refuse it too.
 */
export const VISIT_NO_FRAMEWORK_READINESS =
  'Nothing has been scored against a rubric, so no readiness figure can be stated until a framework is adopted.'

export const VISIT_COMMENDATIONS_UNREADABLE =
  'Commendations could not be computed for this school, so no strength is claimed here.'

export const VISIT_EVIDENCE_UNREADABLE =
  'The evidence index could not be read for this school, so what a team would ask for cannot be listed.'

export const VISIT_PLAN_UNREADABLE =
  'The recommendation rail could not be read for this school, so no plan is drafted here.'

// ── The frozen "nothing to say" lines. A segment is never empty and never dropped.

export const VISIT_NO_COMMENDATION =
  "A visiting team would find no commendable standard on today's evidence."

export const VISIT_NO_FINDING =
  'No rule fired against this school today, so a visiting team would raise nothing from this data.'

export const VISIT_NO_FRAMEWORK_LABEL = 'a school with no adopted accreditation framework'

export const VISIT_NO_SNAPSHOT_LINE =
  'No accreditation snapshot has been recorded, so every figure here was read live.'

/** The plan is empty and the school licenses accreditation but adopted no framework. */
export const VISIT_PLAN_NO_FRAMEWORK =
  'No framework has been adopted yet, so there is nothing to plan against.'

/** The plan is empty because the accreditation module was never readable. */
export const VISIT_PLAN_NOT_LICENSED =
  'The accreditation module is not licensed for this school, so no plan was drafted.'

/** The plan is empty and both gates passed: genuinely nothing left to offer. */
export const VISIT_PLAN_ALL_ADOPTED =
  'Every gap, unmet assurance and open finding we can act on is already being worked.'

// ─────────────────────────────────────────────────────────────────────────────
// §1 INPUT — structurally assignable FROM what the API already holds.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The subset of the API's `FindingPublic` this composer reads.
 *
 * NOTE THE WIDENED UNIONS. `FindingPublic` declares `severity`, `likelihood` and
 * `confidence` as `string` while `TwinFinding` declares literal unions, so
 * `Pick<TwinFinding, 'severity'>` is NOT assignable from `FindingPublic`. They
 * are `string` here for exactly that reason.
 */
export interface VisitFindingInput {
  ruleId: string
  scopeKey: string
  findingKey: string
  title: string
  rationale: string
  /** THE BASIS CHAIN. Non-empty for every finding; an empty one is a bug. */
  evidence: readonly TwinEvidenceEntry[]
  standardTags: readonly string[]
  domainKeys: readonly DomainKey[]
  severity: string
  likelihood: string
  confidence: string
  horizon: TwinFinding['horizon']
  consequence: string
  /** Phase G back-link. Non-null ⇒ this finding is already being worked. */
  initiativeId: string | null
  findingCleared: boolean
}

/** The API's `TwinSignalRow`, verbatim. The 36-row roster Act 5 is built on. */
export interface VisitSignalInput {
  key: string
  label: string
  availability: string
  unavailableReason: string | null
  moduleKey: string | null
  observedOn: string | null
  ageDays: number | null
  changeState: string
  domainKeys: readonly string[]
}

/** The subset of `ReadinessResponse` Act 1 renders. Null when the read failed. */
export interface VisitReadinessInput {
  readinessPct: number | null
  selfScoredPct: number | null
  verifiedPct: number | null
  projectedIndex: number | null
  band: string | null
  confidence: DomainConfidence | null
}

/** `CommendationsResponse`, verbatim. Null when the read failed. */
export interface VisitCommendationsInput {
  commendations: readonly Commendation[]
  exclusions: CommendationExclusions
  caveat: string
  signalsUnavailable: { reason: string; message: string } | null
  demoData: boolean
}

/** The artifact counts the Evidence Index publishes. Carried, never re-derived. */
export interface VisitEvidenceCounts {
  artifacts: number
  artifactsTracked: number
  requirements: number
  requiredTracked: number
  standardsWithRequirements: number
  standardsLegacy: number
}

/**
 * The Evidence Index read. `G` is the API's `EvidenceGroup` and is OPAQUE here:
 * Act 4 carries rows through and never sorts, re-words or re-derives one, so
 * re-declaring that 15-field type in this package would create a second
 * definition of a shape only the API owns. A caller that cares passes its own
 * type; a caller that does not gets `unknown` and cannot accidentally read it.
 */
export interface VisitEvidenceInput<G = unknown> {
  groups: readonly G[]
  health: EvidenceHealth
  counts: VisitEvidenceCounts
}

/** Phase G's `ImprovementRecommendationsPayload.basis`. WHY the rail holds what it holds. */
export interface VisitPlanBasis {
  accreditationLicensed: boolean
  frameworkAdopted: boolean
}

export interface VisitInput<G = unknown> {
  /** ISO. The service's `at`. Copied to `generatedAt`; never read from a clock. */
  now: string
  framework: { code: string | null; name: string | null }
  /**
   * HAS THE SCHOOL ADOPTED A FRAMEWORK? It cannot be inferred from `readiness`:
   * `selfScoredPct` and `verifiedPctCurrent` both return 0 over an empty leaf
   * set, so "no framework, nothing scored" and "a framework, everything scored
   * at the bottom of the rubric" arrive here as the identical pair of zeroes.
   * The API knows the answer; this is it, passed in as a FACT.
   */
  frameworkAdopted: boolean
  snapshotAsOf: string | null
  demoData: boolean
  /**
   * `READINESS_DISCLAIMER`, passed in. THIS PACKAGE NEVER CONTAINS THE SENTENCE —
   * one string, declared once, on the server.
   */
  disclaimer: string
  /** Null ⇒ the readiness read failed. */
  readiness: VisitReadinessInput | null
  findings: readonly VisitFindingInput[]
  notEvaluated: readonly TwinNotEvaluated[]
  coverage: TwinCoverage
  /** The full catalog roster. */
  signals: readonly VisitSignalInput[]
  /** Null ⇒ the commendations read failed. */
  commendations: VisitCommendationsInput | null
  /** Null ⇒ the evidence-index read failed. */
  evidence: VisitEvidenceInput<G> | null
  /** Null ⇒ the recommendations read failed (distinct from "returned none"). */
  recommendations: readonly Recommendation[] | null
  /** Null exactly when `recommendations` is null. */
  recommendationsBasis: VisitPlanBasis | null
  adoptedKeys: readonly string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// §2 OUTPUT
// ─────────────────────────────────────────────────────────────────────────────

export interface VisitArrivalAct {
  frameworkLabel: string
  /** Phase A's DOCUMENTED — the rubric term alone. Never "readiness %" alone. */
  documented: number | null
  /** Phase A's DEFENSIBLE — the evidence term alone. */
  defensible: number | null
  readinessPct: number | null
  projectedIndex: number | null
  band: string | null
  confidence: DomainConfidence | null
  /** One deterministic sentence naming the snapshot date, or saying there is none. */
  asOfLine: string
  /** Composed from rulesEvaluated/rulesTotal. Never a bare `evaluablePct`. */
  evaluableLine: string
  demoData: boolean
  /**
   * Non-null exactly when the pair CANNOT BE STATED, and it says which of the two
   * reasons applies: `VISIT_READINESS_UNREADABLE` (the read failed) or
   * `VISIT_NO_FRAMEWORK_READINESS` (there is nothing to score against yet).
   * `documented`, `defensible` and `readinessPct` are ALL null whenever this is
   * non-null — a reason beside a number would be read as a footnote to the number.
   */
  unavailableReason: string | null
}

export interface VisitCommendationsAct {
  commendations: readonly Commendation[]
  /** Null exactly when the commendations read failed. */
  exclusions: CommendationExclusions | null
  /** The engine's caveat, verbatim. Null exactly when the read failed. */
  caveat: string | null
  /** The "we could value nothing" case, carried verbatim. */
  signalsUnavailable: { reason: string; message: string } | null
  unavailableReason: string | null
}

/** The input finding, field-for-field, plus the three things the act adds. */
export interface VisitFinding extends VisitFindingInput {
  /**
   * THE SAME ARRAY REFERENCE as `evidence`. Not a mapped copy: a mapped copy is
   * how a basis row acquires a second formatting and a second truth.
   */
  basis: readonly TwinEvidenceEntry[]
  /** `initiativeId !== null` — the Phase G back-link, as a boolean for the card. */
  worked: boolean
  /** `standardTags.slice(1)`: the other codes this one finding also serves. */
  alsoServes: readonly string[]
}

export interface VisitFindingGroup {
  /** `standardTags[0]` — the named standard code the group renders under. */
  code: string
  /** `critical` | `warn` | `info` — the group's worst. Drives the ordering. */
  worstSeverity: string
  findings: VisitFinding[]
}

export interface VisitFindingsAct {
  groups: VisitFindingGroup[]
  /** Findings with no standard code at all. */
  schoolLevel: VisitFinding[]
  /** `SCHOOL_LEVEL_FINDING_NOTE`, rendered verbatim above `schoolLevel`. */
  schoolLevelNote: string
  severityCounts: { critical: number; warn: number; info: number; total: number }
  /** DISTINCT standard codes carrying at least one finding. */
  standardCount: number
}

export interface VisitRequestsAct<G = unknown> {
  /** The page that ALREADY EXISTS. A constant, so screen and print agree. */
  indexRoute: string
  groups: readonly G[]
  health: EvidenceHealth | null
  counts: VisitEvidenceCounts | null
  unavailableReason: string | null
}

/** One roster row, plus the reason it will actually render. */
export interface VisitSignalRow extends VisitSignalInput {
  /**
   * NULL exactly when `availability === 'available'`. For every other row this is
   * a NON-EMPTY string — the collector's own words, or `NO_REASON_GIVEN`.
   * Render THIS, not `unavailableReason`, which is carried verbatim and may be null.
   */
  reasonText: string | null
}

export interface VisitSignalRoster {
  available: VisitSignalRow[]
  notLicensed: VisitSignalRow[]
  noData: VisitSignalRow[]
  notTracked: VisitSignalRow[]
}

export interface VisitUnansweredAct {
  /** `coverage.namedHoles` — the visible holes, with the intake that closes each. */
  namedHoles: TwinCoverage['namedHoles']
  /** The whole roster, partitioned; within a partition, sorted by key ASCII. */
  signalRows: VisitSignalRoster
  rosterCounts: {
    available: number
    notLicensed: number
    noData: number
    notTracked: number
    total: number
  }
  /** The rules that could not run, each naming its blocking signal. Verbatim. */
  rules: readonly TwinNotEvaluated[]
  /** From the commendations engine: "we could value nothing". Verbatim. */
  signalsUnavailable: { reason: string; message: string } | null
  /** `coverage.blockedByModule` as a list. Every entry is a module we can sell. */
  upsell: { moduleKey: string; ruleIds: readonly string[] }[]
  /** ONE signal, EVERY year it needs, ONLY the rules that read it. Never re-aggregated. */
  unlockableByYears: TwinCoverage['unlockableByYears']
}

/** EXACTLY the fields Phase G's adopt DTO needs. All copied; none composed. */
export interface VisitPlanItem {
  templateId: RecommendationTemplateId
  originType: RecommendationOriginType
  originRef: string
  findingKey: string | null
  title: string
  rationale: string
  suggestedOwnerRole: SuggestedOwnerRole
  suggestedMetricKey: string | null
  suggestedTargetRubricScore: number | null
  estimatedLift: EstimatedLift | null
  estimatedLiftReason: string | null
  standardTags: readonly string[]
}

export interface VisitPlanAct {
  items: VisitPlanItem[]
  /** How many more the rail holds. The screen links to /improvement for these. */
  moreAvailable: number
  limit: number
  /** Phase G's basis contract. Null exactly when the recommendations read failed. */
  basis: VisitPlanBasis | null
  /** Non-null exactly when `items` is empty — and it says WHICH empty this is. */
  emptyReason: string | null
  unavailableReason: string | null
}

export type VisitSummaryKey =
  | 'opening'
  | 'strengths'
  | 'findings'
  | 'evidence'
  | 'unanswered'
  | 'plan'

export interface VisitSummarySegment {
  key: VisitSummaryKey
  text: string
}

export interface VisitExecutiveSummary {
  /** ALWAYS all six, ALWAYS in `VISIT_SUMMARY_KEYS` order. Never a short array. */
  segments: VisitSummarySegment[]
  /** Every numeral the composer was permitted to emit, as rendered strings. */
  allowedNumerals: string[]
}

/** The frozen segment order. A variable-length summary cannot be compared byte-for-byte. */
export const VISIT_SUMMARY_KEYS: readonly VisitSummaryKey[] = [
  'opening',
  'strengths',
  'findings',
  'evidence',
  'unanswered',
  'plan',
] as const

export interface VisitResult<G = unknown> {
  version: string
  /** === `input.now`, copied. */
  generatedAt: string
  framework: { code: string | null; name: string | null }
  demoData: boolean
  snapshotAsOf: string | null
  /** === `input.disclaimer`, copied. Never composed here. */
  disclaimer: string
  /**
   * An OBJECT with six fixed keys, never an array. An array invites a client to
   * filter it, and Act 5 is the act reviewers try to cut.
   */
  acts: {
    arrival: VisitArrivalAct
    commendations: VisitCommendationsAct
    findings: VisitFindingsAct
    requests: VisitRequestsAct<G>
    unanswered: VisitUnansweredAct
    plan: VisitPlanAct
  }
  executiveSummary: VisitExecutiveSummary
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 INTERNALS
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_ORDER: readonly string[] = ['critical', 'warn', 'info']

function severityRank(s: string): number {
  const i = SEVERITY_ORDER.indexOf(s)
  return i === -1 ? SEVERITY_ORDER.length : i
}

/** ASCII, total, deterministic. `localeCompare` is locale-dependent and is not used. */
function asciiCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

const NUMERAL_RE = /\d+(?:\.\d+)?/g

/** Every numeric token in a string. The same discipline the narration guard applies. */
function numeralTokens(s: string): string[] {
  return s.match(NUMERAL_RE) ?? []
}

function templateRank(id: RecommendationTemplateId): number {
  const i = (RECOMMENDATION_TEMPLATE_IDS as readonly string[]).indexOf(id)
  return i === -1 ? RECOMMENDATION_TEMPLATE_IDS.length : i
}

function frameworkLabelOf(framework: { code: string | null; name: string | null }): string {
  return framework.name ?? framework.code ?? VISIT_NO_FRAMEWORK_LABEL
}

/**
 * BOTH SOURCES MUST AGREE, and the label is the tie-breaker: whatever the flag
 * claims, a school the opening sentence is about to call "a school with no
 * adopted accreditation framework" has no framework. One sentence cannot name a
 * framework in its second clause and deny one in its first.
 */
function frameworkAdoptedOf(input: VisitInput<unknown>): boolean {
  return (
    input.frameworkAdopted && (input.framework.code !== null || input.framework.name !== null)
  )
}

// ── ACT 1 ────────────────────────────────────────────────────────────────────

function composeArrival(input: VisitInput<unknown>): VisitArrivalAct {
  const adopted = frameworkAdoptedOf(input)
  // THREE STATES, NOT TWO. "The read failed" beats "no framework": a failed read
  // means we do not actually know what this school has adopted, so we say the
  // thing we are certain of. Only when the read SUCCEEDED and there is no
  // framework do we say there is nothing to score against.
  const readFailed = input.readiness === null
  const r = readFailed || !adopted ? null : input.readiness
  const unavailableReason = readFailed
    ? VISIT_READINESS_UNREADABLE
    : adopted
      ? null
      : VISIT_NO_FRAMEWORK_READINESS
  const day = input.snapshotAsOf ? input.snapshotAsOf.slice(0, 10) : null
  const asOfLine = day
    ? `Figures are as of ${formatCivilDate(day)}.`
    : VISIT_NO_SNAPSHOT_LINE
  return {
    frameworkLabel: frameworkLabelOf(input.framework),
    documented: r ? r.selfScoredPct : null,
    defensible: r ? r.verifiedPct : null,
    readinessPct: r ? r.readinessPct : null,
    projectedIndex: r ? r.projectedIndex : null,
    band: r ? r.band : null,
    // The domain-confidence caveat is about COVERAGE, not about the pair, and it
    // is honest in every one of the three states — so it survives them all.
    confidence: input.readiness ? input.readiness.confidence : null,
    asOfLine,
    evaluableLine: `${input.coverage.rulesEvaluated} of ${input.coverage.rulesTotal} rules could be evaluated on today's data.`,
    demoData: input.demoData,
    unavailableReason,
  }
}

// ── ACT 2 ────────────────────────────────────────────────────────────────────

function composeCommendations(input: VisitInput<unknown>): VisitCommendationsAct {
  const c = input.commendations
  if (!c) {
    return {
      commendations: [],
      exclusions: null,
      caveat: null,
      signalsUnavailable: null,
      unavailableReason: VISIT_COMMENDATIONS_UNREADABLE,
    }
  }
  // Carried through VERBATIM. The engine ran in Phase C; nothing re-runs here,
  // and zero commendations is a legitimate answer rendered as the caveat plus
  // the exclusion counts — never as an empty box, never padded.
  return {
    commendations: c.commendations,
    exclusions: c.exclusions,
    caveat: c.caveat,
    signalsUnavailable: c.signalsUnavailable,
    unavailableReason: null,
  }
}

// ── ACT 3 ────────────────────────────────────────────────────────────────────

function toVisitFinding(f: VisitFindingInput): VisitFinding {
  return {
    ...f,
    // THE SAME REFERENCE. Never `[...f.evidence]`, never `f.evidence.map(...)`.
    basis: f.evidence,
    worked: f.initiativeId !== null,
    alsoServes: f.standardTags.slice(1),
  }
}

function composeFindings(input: VisitInput<unknown>): VisitFindingsAct {
  const byCode = new Map<string, VisitFinding[]>()
  const schoolLevel: VisitFinding[] = []
  const counts = { critical: 0, warn: 0, info: 0, total: 0 }

  for (const f of input.findings) {
    const vf = toVisitFinding(f)
    counts.total += 1
    if (f.severity === 'critical') counts.critical += 1
    else if (f.severity === 'warn') counts.warn += 1
    else if (f.severity === 'info') counts.info += 1
    // EXACTLY ONE GROUP per finding. The other codes ride on the card as
    // `alsoServes` — a finding listed twice is a finding counted twice.
    const code = f.standardTags.length > 0 ? f.standardTags[0] : null
    if (code === null) {
      schoolLevel.push(vf)
      continue
    }
    const bucket = byCode.get(code)
    if (bucket) bucket.push(vf)
    else byCode.set(code, [vf])
  }

  const groups: VisitFindingGroup[] = [...byCode.entries()].map(([code, findings]) => {
    // The worst finding's OWN severity string, not an index back into the frozen
    // order: a severity this file does not recognise must travel as itself rather
    // than be rounded to 'info', which would be a claim about how bad it is.
    let worst = findings[0]
    for (const f of findings) {
      if (severityRank(f.severity) < severityRank(worst.severity)) worst = f
    }
    return { code, worstSeverity: worst.severity, findings }
  })
  // Worst severity first, then code ASCII. Deterministic and total.
  groups.sort(
    (a, b) =>
      severityRank(a.worstSeverity) - severityRank(b.worstSeverity) ||
      asciiCompare(a.code, b.code),
  )

  return {
    groups,
    schoolLevel,
    schoolLevelNote: SCHOOL_LEVEL_FINDING_NOTE,
    severityCounts: counts,
    standardCount: groups.length,
  }
}

// ── ACT 4 ────────────────────────────────────────────────────────────────────

function composeRequests<G>(input: VisitInput<G>): VisitRequestsAct<G> {
  const e = input.evidence
  return {
    indexRoute: VISIT_EVIDENCE_INDEX_ROUTE,
    groups: e ? e.groups : [],
    health: e ? e.health : null,
    counts: e ? e.counts : null,
    unavailableReason: e ? null : VISIT_EVIDENCE_UNREADABLE,
  }
}

// ── ACT 5 — MUST NOT BE CUT ──────────────────────────────────────────────────

function toRosterRow(s: VisitSignalInput): VisitSignalRow {
  const available = s.availability === 'available'
  return {
    ...s,
    reasonText: available ? null : (s.unavailableReason ?? NO_REASON_GIVEN),
  }
}

function composeUnanswered(input: VisitInput<unknown>): VisitUnansweredAct {
  const roster: VisitSignalRoster = { available: [], notLicensed: [], noData: [], notTracked: [] }
  for (const s of input.signals) {
    const row = toRosterRow(s)
    if (s.availability === 'available') roster.available.push(row)
    else if (s.availability === 'not_licensed') roster.notLicensed.push(row)
    else if (s.availability === 'no_data') roster.noData.push(row)
    else roster.notTracked.push(row)
  }
  for (const part of [roster.available, roster.notLicensed, roster.noData, roster.notTracked]) {
    part.sort((a, b) => asciiCompare(a.key, b.key))
  }

  const upsell = Object.entries(input.coverage.blockedByModule)
    .map(([moduleKey, ruleIds]) => ({ moduleKey, ruleIds: ruleIds as readonly string[] }))
    .sort((a, b) => asciiCompare(a.moduleKey, b.moduleKey))

  return {
    namedHoles: input.coverage.namedHoles,
    signalRows: roster,
    rosterCounts: {
      available: roster.available.length,
      notLicensed: roster.notLicensed.length,
      noData: roster.noData.length,
      notTracked: roster.notTracked.length,
      total: input.signals.length,
    },
    rules: input.notEvaluated,
    signalsUnavailable: input.commendations?.signalsUnavailable ?? null,
    upsell,
    // Carried through EXACTLY as the twin emits it — one signal, every year it
    // needs, only the rules that read it. Re-aggregating is the bug the twin's
    // own essay documents.
    unlockableByYears: input.coverage.unlockableByYears,
  }
}

// ── ACT 6 ────────────────────────────────────────────────────────────────────

function toPlanItem(r: Recommendation): VisitPlanItem {
  return {
    templateId: r.templateId,
    originType: r.originType,
    originRef: r.originRef,
    findingKey: r.findingKey,
    title: r.title,
    rationale: r.rationale,
    suggestedOwnerRole: r.suggestedOwnerRole,
    suggestedMetricKey: r.suggestedMetricKey,
    suggestedTargetRubricScore: r.suggestedTargetRubricScore,
    estimatedLift: r.estimatedLift,
    estimatedLiftReason: r.estimatedLiftReason,
    standardTags: r.standardTags,
  }
}

function composePlan(input: VisitInput<unknown>): VisitPlanAct {
  if (input.recommendations === null || input.recommendationsBasis === null) {
    return {
      items: [],
      moreAvailable: 0,
      limit: VISIT_PLAN_LIMIT,
      basis: null,
      emptyReason: VISIT_PLAN_UNREADABLE,
      unavailableReason: VISIT_PLAN_UNREADABLE,
    }
  }

  const adopted = new Set(input.adoptedKeys)
  const severityByFindingKey = new Map(input.findings.map((f) => [f.findingKey, f.severity]))

  // Already-worked work is not a proposal. The rail already excludes these; the
  // second pass costs nothing and means a stale rail cannot re-offer adopted work.
  const eligible = input.recommendations.filter(
    (r) => !adopted.has(r.originRef) && !(r.findingKey !== null && adopted.has(r.findingKey)),
  )

  // ORDER, total and deterministic: real index points first (nulls LAST — a null
  // lift is honest, not superior), then the linked finding's severity, then the
  // frozen template order, then originRef ASCII.
  const ranked = [...eligible].sort((a, b) => {
    const la = a.estimatedLift?.points ?? null
    const lb = b.estimatedLift?.points ?? null
    if (la !== lb) {
      if (la === null) return 1
      if (lb === null) return -1
      return lb - la
    }
    const sa = severityRank(
      (a.findingKey !== null ? severityByFindingKey.get(a.findingKey) : undefined) ?? '',
    )
    const sb = severityRank(
      (b.findingKey !== null ? severityByFindingKey.get(b.findingKey) : undefined) ?? '',
    )
    if (sa !== sb) return sa - sb
    const ta = templateRank(a.templateId)
    const tb = templateRank(b.templateId)
    if (ta !== tb) return ta - tb
    return asciiCompare(a.originRef, b.originRef)
  })

  const items = ranked.slice(0, VISIT_PLAN_LIMIT).map(toPlanItem)
  const basis = input.recommendationsBasis
  const emptyReason =
    items.length > 0
      ? null
      : !basis.accreditationLicensed
        ? VISIT_PLAN_NOT_LICENSED
        : !basis.frameworkAdopted
          ? VISIT_PLAN_NO_FRAMEWORK
          : VISIT_PLAN_ALL_ADOPTED

  return {
    items,
    moreAvailable: Math.max(0, ranked.length - items.length),
    limit: VISIT_PLAN_LIMIT,
    basis,
    emptyReason,
    unavailableReason: null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// §4 THE EXECUTIVE SUMMARY — one composer, four surfaces.
//
// PRIVATE TO THIS MODULE and called from exactly one place. It is not exported
// from index.ts, because the moment a second caller can compose a summary the
// spoken version and the printed version can disagree — and proving they cannot
// is the whole point of the phase.
//
// THE NUMERAL RULE. `allowedNumerals` is built from the INPUTS, before any text
// is composed: every figure is passed through `allow()`, which records its
// numeric tokens and returns the rendered string the sentence then uses. A test
// asserts that every numeral appearing in every segment is a member. Because the
// text can only be built out of already-allowed strings, this is an invariant
// rather than a guard — there is no fallback branch, because there is nothing to
// fall back from.
// ─────────────────────────────────────────────────────────────────────────────

function composeVisitExecutiveSummary(
  input: VisitInput<unknown>,
  acts: VisitResult<unknown>['acts'],
): VisitExecutiveSummary {
  const allowed = new Set<string>()
  /** Record a figure's numerals and hand back the string the sentence may use. */
  const allow = (v: string | number | null): string => {
    const s = v === null ? '' : String(v)
    for (const t of numeralTokens(s)) allowed.add(t)
    return s
  }

  // ── opening ───────────────────────────────────────────────────────────────
  const label = allow(acts.arrival.frameworkLabel)
  let opening: string
  if (acts.arrival.unavailableReason !== null) {
    // Covers BOTH "we could not read it" and "there is no framework to read it
    // against" — the act already chose which, and this sentence quotes it. The
    // percentage branch below is therefore unreachable without an adopted
    // framework, which is what keeps ` This framework publishes no index.` from
    // being said about a school that has no framework.
    opening = `A visiting team would arrive to ${label}. ${acts.arrival.unavailableReason}`
  } else {
    const documented = allow(acts.arrival.documented)
    const defensible = allow(acts.arrival.defensible)
    const index = acts.arrival.projectedIndex === null ? null : allow(acts.arrival.projectedIndex)
    const band = acts.arrival.band
    const indexClause =
      index === null
        ? ' This framework publishes no index.'
        : band === null
          ? ` The projected index is ${index}.`
          : ` The projected index is ${index}, which bands as ${band}.`
    opening = `A visiting team would arrive to ${label}. Documented readiness is ${documented}%, defensible readiness is ${defensible}%.${indexClause}`
  }

  // ── strengths ─────────────────────────────────────────────────────────────
  const commendCount = allow(acts.commendations.commendations.length)
  const strengths =
    acts.commendations.unavailableReason !== null
      ? acts.commendations.unavailableReason
      : acts.commendations.commendations.length === 0
        ? VISIT_NO_COMMENDATION
        : `A visiting team would commend ${commendCount} ${acts.commendations.commendations.length === 1 ? 'standard' : 'standards'} we can defend with a score, current evidence and a favorable operating figure.`

  // ── findings ──────────────────────────────────────────────────────────────
  const sc = acts.findings.severityCounts
  const total = allow(sc.total)
  const critical = allow(sc.critical)
  const warn = allow(sc.warn)
  const info = allow(sc.info)
  const standards = allow(acts.findings.standardCount)
  const schoolLevelCount = allow(acts.findings.schoolLevel.length)
  const findings =
    sc.total === 0
      ? VISIT_NO_FINDING
      : `They would likely raise ${total} ${sc.total === 1 ? 'finding' : 'findings'} — ${critical} critical, ${warn} to watch, ${info} informational — across ${standards} named ${acts.findings.standardCount === 1 ? 'standard' : 'standards'}, with ${schoolLevelCount} raised with the head of school rather than under a code.`

  // ── evidence ──────────────────────────────────────────────────────────────
  let evidence: string
  if (acts.requests.unavailableReason !== null) {
    evidence = acts.requests.unavailableReason
  } else {
    const health = acts.requests.health
    const rated = allow(health?.rated ?? 0)
    const current = allow(health?.current ?? 0)
    const artifacts = allow(acts.requests.counts?.artifacts ?? 0)
    evidence = `They would ask for ${artifacts} ${(acts.requests.counts?.artifacts ?? 0) === 1 ? 'artifact' : 'artifacts'}; of the ${rated} we rate for currency, ${current} are current today.`
  }

  // ── unanswered ────────────────────────────────────────────────────────────
  const holes = allow(acts.unanswered.namedHoles.length)
  const rosterTotal = allow(acts.unanswered.rosterCounts.total)
  const rosterAvailable = allow(acts.unanswered.rosterCounts.available)
  const notEvaluatedCount = allow(acts.unanswered.rules.length)
  const unanswered = `We could not answer ${holes} named ${acts.unanswered.namedHoles.length === 1 ? 'question' : 'questions'}. Of the ${rosterTotal} signals we track we could read ${rosterAvailable}, and ${notEvaluatedCount} ${acts.unanswered.rules.length === 1 ? 'rule' : 'rules'} could not be evaluated at all.`

  // ── plan ──────────────────────────────────────────────────────────────────
  const planCount = allow(acts.plan.items.length)
  const more = allow(acts.plan.moreAvailable)
  const plan =
    acts.plan.items.length === 0
      ? (acts.plan.emptyReason ?? VISIT_PLAN_ALL_ADOPTED)
      : `The draft plan commits to ${planCount} ${acts.plan.items.length === 1 ? 'piece' : 'pieces'} of work${acts.plan.moreAvailable > 0 ? `, with ${more} more on the improvement rail` : ''}.`

  const byKey: Record<VisitSummaryKey, string> = {
    opening,
    strengths,
    findings,
    evidence,
    unanswered,
    plan,
  }
  return {
    // ALWAYS all six, ALWAYS in order.
    segments: VISIT_SUMMARY_KEYS.map((key) => ({ key, text: byKey[key] })),
    allowedNumerals: [...allowed].sort(asciiCompare),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// §5 THE ONE COMPOSER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The whole Mock Visit, from data the API already holds. Pure, total and
 * deterministic: two runs over one input are byte-identical, and no input object
 * is mutated.
 */
export function composeMockVisit<G = unknown>(input: VisitInput<G>): VisitResult<G> {
  const wide = input as VisitInput<unknown>
  const acts = {
    arrival: composeArrival(wide),
    commendations: composeCommendations(wide),
    findings: composeFindings(wide),
    requests: composeRequests(input),
    unanswered: composeUnanswered(wide),
    plan: composePlan(wide),
  }
  return {
    version: VISIT_VERSION,
    generatedAt: input.now,
    framework: { code: input.framework.code, name: input.framework.name },
    demoData: input.demoData,
    snapshotAsOf: input.snapshotAsOf,
    disclaimer: input.disclaimer,
    acts,
    executiveSummary: composeVisitExecutiveSummary(wide, acts),
  }
}
