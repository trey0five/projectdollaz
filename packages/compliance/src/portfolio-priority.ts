// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase I — the SUPERINTENDENT PORTFOLIO priority engine (pure).
//
// ONE SENTENCE: this file decides which schools in a diocese need attention,
// which schools we are NOT ALLOWED TO RANK, and — in words a superintendent can
// challenge — WHY, and it does all of that without touching a clock, a database
// or a network.
//
// THE FIVE RULES THAT GOVERN EVERY LINE BELOW.
//
//   1. EVERY COMPONENT SCORE IS 0..100 WHERE **HIGHER MEANS MORE ATTENTION
//      NEEDED**. This is an ATTENTION score, not a health score. Inverting one
//      component by mistake is the most likely silent defect in this module, so
//      it is stated here, restated on every scorer, and pinned by spec.
//
//   2. RENORMALIZE OVER KNOWN COMPONENTS ONLY. An unmeasured dimension leaves
//      the denominator; it is never scored 0 ("nothing wrong") and never scored
//      50 ("about average"). Both of those make an unmeasured school look
//      healthy, which is the single failure this whole program exists to
//      prevent.
//
//   3. BELOW THE FLOOR A SCHOOL IS NOT RANKED AT ALL. Two floors, both live:
//      `MIN_KNOWN_COMPONENTS` (a COUNT) and `MIN_CONFIDENCE` (a WEIGHT share).
//      The count floor is not belt-and-braces — it is the ONLY thing that makes
//      "any 3 of 6 missing is unrankable" true, because for a weight rule alone
//      to guarantee it the three smallest of six weights would have to sum to
//      more than 0.6, which forces the three largest to sum to less than 0.4.
//      That is arithmetically impossible. An unranked school carries NO
//      `attentionScore` and NO `attentionBand` — there is no key on it a UI
//      could render as "steady", "clear" or "fine".
//
//   4. URGENCY IS A SORT KEY, NEVER A MULTIPLIER. Multiplying an attention score
//      by an urgency invents a number that describes nothing and cannot be
//      challenged. Ordering by it is a stated preference about which of two
//      equally-attention-worthy schools you deal with first. Because
//      `attentionBand` is the FIRST comparator key and is a pure function of
//      `attentionScore` alone, urgency can reorder schools INSIDE a band and can
//      never promote a school into a worse one.
//
//   5. NO RANK WITHOUT A STATED DRIVER. `drivers[]` is never empty, and a
//      driver's `detail` may name only figures the row itself carries. A rank
//      with no stated driver is a number a superintendent can neither act on nor
//      challenge — and "clear" is exactly the rank most likely to be wrong.
//
// THE TIEBREAK IS `verifiedPct`, NOT `readinessPct`. `readinessPct` and
// `selfScoredPct` are dominated by what a school asserted about itself in a
// rubric. RANKING ON SELF-SCORES REWARDS OPTIMISTIC SELF-ASSESSMENT; RANKING ON
// EVIDENCE REWARDS EVIDENCE. The only way to move on `verifiedPct` is to produce
// an artifact.
//
// DETERMINISM CONTRACT: obeys the package PURITY GUARD — no clock, no I/O, no
// randomness, no UI. `now` is a yyyy-mm-dd STRING PARAMETER. Inputs are never
// mutated. Weights are INTEGER BASIS POINTS, never floats: two identical
// refreshes must produce byte-identical ordering, and float weights make
// `attentionScore` a float whose rounding can differ under reassociation.
// `computePortfolio` is TOTAL — it never throws, and it never turns malformed
// input into a plausible number.
// ─────────────────────────────────────────────────────────────────────────────

import { bandForRisk, type TwinRiskBand } from './accreditation-twin.js'
import { DOMAIN_KEYS, DOMAIN_LABELS, isDomainKey, type DomainKey } from './accreditation-domains.js'
import { civilFromDays, civilToIso, daysFromCivil, toCivil } from './review-status.js'
import { MIN_SPAN_DAYS_FOR_DIRECTION } from './readiness-history.js'

export const PORTFOLIO_PRIORITY_VERSION = '1.0.0'

// ─────────────────────────────────────────────────────────────────────────────
// §2.1 THE SIX COMPONENTS — integer basis points
// ─────────────────────────────────────────────────────────────────────────────

export const PORTFOLIO_COMPONENT_KEYS = [
  'readinessLevel', // how much of the framework is NOT evidence-backed
  'earlyWarning', // the open findings ledger load
  'evidenceCurrency', // the DOCUMENTED − DEFENSIBLE optimism gap
  'domainExposure', // the weakest domain
  'improvement', // unresponded findings + overdue/stale initiatives
  'trajectory', // observed movement vs a comparable baseline
] as const
export type PortfolioComponentKey = (typeof PORTFOLIO_COMPONENT_KEYS)[number]

/** FROZEN. Basis points, summing to exactly 10000. Integers, never floats. */
export const COMPONENT_WEIGHT_BP: Record<PortfolioComponentKey, number> = {
  readinessLevel: 3200,
  earlyWarning: 3000,
  evidenceCurrency: 1400,
  domainExposure: 1100,
  improvement: 800,
  trajectory: 500,
}
export const TOTAL_WEIGHT_BP = 10000

/** Display labels for the six components. ONE source of label truth. */
export const COMPONENT_LABELS: Record<PortfolioComponentKey, string> = {
  readinessLevel: 'Evidence-backed coverage',
  earlyWarning: 'Open early warnings',
  evidenceCurrency: 'Self-score above evidence',
  domainExposure: 'Weakest domain',
  improvement: 'Improvement response',
  trajectory: 'Movement since the baseline',
}

/**
 * BOTH exclusion rules are live and both are load-bearing.
 *
 * With the frozen weight table the four LIGHTEST components sum to
 * 1400+1100+800+500 = 3800 bp = 0.38 < 0.40, so a school that knows exactly
 * those four passes the COUNT rule and is excluded by the CONFIDENCE rule. Every
 * other 4-subset contains `readinessLevel` or `earlyWarning` and lands at 0.54
 * or better. In plain words the confidence rule says: A SCHOOL WHOSE READINESS
 * LEVEL AND WHOSE EARLY-WARNING LEDGER ARE BOTH UNREADABLE IS NOT RANKED,
 * however much else we know about it.
 */
export const MIN_CONFIDENCE = 0.4
export const MIN_KNOWN_COMPONENTS = 4

/** The trajectory baseline lookback, in whole days. */
export const TRAJECTORY_BASELINE_DAYS = 90

/** The reason attached to any component we had to reject rather than believe. */
export const INVALID_INPUT_REASON = 'invalid_input'

// ─────────────────────────────────────────────────────────────────────────────
// §2.4 URGENCY — a sort key, and nothing else
// ─────────────────────────────────────────────────────────────────────────────

export type Urgency = 0 | 1 | 2 | 3
export const URGENCY_TIER_DAYS = { imminent: 180, near: 365, horizon: 730 } as const

/**
 * `review_beyond_horizon` is an ADDITION to the plan's four reasons.
 *
 * The plan maps BOTH "no date known" and "more than 730 days away" to
 * `'no_scheduled_review'`. For a school whose visit is genuinely scheduled 900
 * days out that sentence is simply false, and a portfolio that exists to stop
 * schools looking healthier than they are must not start by telling a
 * superintendent a school has no scheduled review when it has one. Both reasons
 * are urgency 0, so NO ORDERING CHANGES; only the stated reason gets more
 * honest.
 */
/**
 * `review_overdue` is the SECOND addition, and it exists because the plan's four
 * reasons have nothing true to say about a review date that has already passed.
 *
 * A lapsed review is the MOST urgent calendar state there is, and it used to be
 * reachable only as `'visit_imminent'` — "the visit is within six months" — of a
 * date six months in the PAST. Same urgency tier (3), so no ordering changes;
 * only the sentence stops being false.
 */
export type PortfolioUrgencyReason =
  | 'citation_overdue'
  | 'review_overdue'
  | 'visit_imminent'
  | 'visit_within_year'
  | 'visit_on_horizon'
  | 'review_beyond_horizon'
  | 'no_scheduled_review'

// ─────────────────────────────────────────────────────────────────────────────
// §2.5 THE FROZEN COMPARATOR
// ─────────────────────────────────────────────────────────────────────────────

export const ATTENTION_BAND_RANK: Record<TwinRiskBand, number> = {
  high: 0,
  elevated: 1,
  watch: 2,
  clear: 3,
  critical: 0,
}

/** Fixed key order for every `counts` record, so JSON is byte-stable. */
export const PORTFOLIO_BAND_KEYS: readonly TwinRiskBand[] = [
  'critical',
  'high',
  'elevated',
  'watch',
  'clear',
]

// ─────────────────────────────────────────────────────────────────────────────
// FROZEN SENTENCES — every note this engine can emit, in one place
// ─────────────────────────────────────────────────────────────────────────────

/** §2.7's frozen sentence. Emitted only when 2 or more frameworks are RANKED. */
export function multiFrameworkNote(frameworkCount: number): string {
  return (
    `These schools follow ${frameworkCount} different accreditation frameworks. ` +
    'Index scores are not comparable across frameworks, so this portfolio is ordered by ' +
    'attention and evidence coverage — never by index.'
  )
}

/**
 * The plan supplies ONE sentence for `indexComparable: false` and it names a
 * framework COUNT. That sentence is a lie in the two other ways comparability
 * can fail, so each gets its own frozen sentence rather than being forced
 * through a template that would state a number it cannot support.
 */
export const UNKNOWN_FRAMEWORK_NOTE =
  'At least one ranked school has no accreditation framework on record, so index scores are ' +
  'not comparable; this portfolio is ordered by attention and evidence coverage — never by index.'

export const NO_INDEX_SCALE_NOTE =
  'This framework does not publish an index scale, so this portfolio is ordered by attention ' +
  'and evidence coverage — never by index.'

/** The frozen detail for a fully-measured school with nothing outstanding. */
export const ALL_CLEAR_DRIVER_DETAIL = 'Measured, with nothing outstanding.'

// ─────────────────────────────────────────────────────────────────────────────
// §2.7 THE EXPORTED SURFACE
// ─────────────────────────────────────────────────────────────────────────────

export interface PortfolioComponentInput {
  known: boolean
  /** 0..100 when known; MUST be null when `known === false`. */
  score: number | null
  /** Short frozen phrase naming where the number came from. */
  basis: string | null
  /** Non-null exactly when `known === false`. */
  reason: string | null
}

export interface PortfolioOpenFindings {
  critical: number
  warn: number
  info: number
}

export interface PortfolioInitiativeCounts {
  open: number
  overdue: number
  stale: number
  unresponded: number
}

export interface PortfolioWeakestDomain {
  domainKey: DomainKey
  pct: number
}

export interface PortfolioSchoolInput {
  schoolId: string
  name: string
  seriesKey: string | null
  frameworkCode: string | null
  frameworkName: string | null
  indexComparable: boolean
  verifiedPct: number | null
  selfScoredPct: number | null
  readinessPct: number | null
  projectedIndex: number | null
  band: string | null
  leafCount: number | null
  /** yyyy-mm-dd */
  snapshotDate: string | null
  demoData: boolean
  components: Record<PortfolioComponentKey, PortfolioComponentInput>
  urgencyDaysToReview: number | null
  /**
   * TRI-STATE, and the third state is the one that matters.
   *
   * `true` = a prior-visit citation response is past its stated due date.
   * `false` = we looked, and it is not.
   * `null` = NOT ASSESSED — this caller holds no source that could answer it.
   *
   * `false` and `null` are different claims and this contract refuses to conflate
   * them: a payload field that is structurally always `false` reads as "we checked
   * and everything is fine", which is precisely the reassurance this program
   * exists to withhold. Only `true` raises urgency; `null` and `false` behave
   * identically for ORDERING, and differ only in what may honestly be said.
   */
  citationOverdue: boolean | null
  openFindings: PortfolioOpenFindings
  initiatives: PortfolioInitiativeCounts
  weakestDomain: PortfolioWeakestDomain | null
  /**
   * ADDITIVE. The binding accreditation date as yyyy-mm-dd. Used ONLY when
   * `urgencyDaysToReview` is absent, and converted against the `now` parameter
   * with the package's own civil-date helpers — which is what `now` and the
   * permitted `daysFromCivil`/`toCivil` imports are for. A caller that already
   * holds a day count keeps sending one.
   */
  urgencyDate?: string | null
  /**
   * ADDITIVE, and load-bearing for rule 5. The trajectory driver is the only one
   * whose sentence wants a figure the plan's row does not carry. Rather than let
   * that driver name a number the row cannot show, the number is carried on the
   * row. When it is absent the trajectory driver states a DIRECTION (derived
   * exactly from its own component score) and names no figure at all.
   */
  trajectoryDeltaPct?: number | null
}

export interface PortfolioDriver {
  component: PortfolioComponentKey
  /**
   * Integer: `round(weightBp * score / knownBp)` — this row's own share.
   *
   * READ THE UNITS BEFORE RENDERING THIS. The frozen formula divides by
   * `knownBp`, not by `TOTAL_WEIGHT_BP × 100`, so the value is in
   * ATTENTION-SCORE POINTS (0..100) despite the `Bp` in the name: the shares of
   * the KNOWN components sum to `attentionScore` up to rounding. That is the
   * genuinely useful decomposition — "12 of this school's 33 points come from
   * evidence coverage" — so the formula is kept exactly as frozen and only the
   * unit is documented. Do NOT render it as a percentage of 10000.
   */
  contributionBp: number
  /** Frozen template, e.g. 'Weakest domain: Finance'. */
  label: string
  /** Frozen template naming the observed figure. */
  detail: string
}

export interface PortfolioRow {
  schoolId: string
  name: string
  seriesKey: string | null
  frameworkCode: string | null
  frameworkName: string | null
  indexComparable: boolean
  verifiedPct: number | null
  selfScoredPct: number | null
  readinessPct: number | null
  projectedIndex: number | null
  band: string | null
  leafCount: number | null
  snapshotDate: string | null
  demoData: boolean
  components: Record<PortfolioComponentKey, PortfolioComponentInput>
  urgencyDaysToReview: number | null
  /** Tri-state; `null` means NOT ASSESSED. See `PortfolioSchoolInput`. */
  citationOverdue: boolean | null
  openFindings: PortfolioOpenFindings
  initiatives: PortfolioInitiativeCounts
  weakestDomain: PortfolioWeakestDomain | null
  urgencyDate: string | null
  trajectoryDeltaPct: number | null
  rank: number
  attentionScore: number
  attentionBand: TwinRiskBand
  confidence: number
  knownComponents: PortfolioComponentKey[]
  urgency: Urgency
  urgencyReason: PortfolioUrgencyReason
  drivers: PortfolioDriver[]
}

export interface PortfolioMissingComponent {
  component: PortfolioComponentKey
  reason: string
}

/**
 * An unranked school. NOTE WHAT IS NOT HERE: no `attentionScore`, no
 * `attentionBand`, no band word, no percentage of anything. There is no field on
 * this object a UI could render as "steady".
 */
export interface PortfolioInsufficientRow {
  schoolId: string
  name: string
  confidence: number
  knownComponents: PortfolioComponentKey[]
  /** NEVER empty. */
  missingComponents: PortfolioMissingComponent[]
  reason: 'too_few_components' | 'low_confidence'
}

export interface PortfolioBandDistribution {
  frameworkCode: string | null
  frameworkName: string | null
  counts: Record<TwinRiskBand, number>
  schoolCount: number
}

export interface PortfolioResult {
  ranked: PortfolioRow[]
  insufficientData: PortfolioInsufficientRow[]
  bandDistribution: PortfolioBandDistribution[]
  indexComparable: boolean
  notes: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// §2.1 THE SIX SCORERS (pure, exported)
//
// These live HERE and not in the API for one reason: rule 1. The API holds the
// rows; the direction of every scale is a property of the portfolio contract,
// and re-typing `100 - verifiedPct` in a service is how one of these six ends up
// inverted with nothing to catch it. Each returns `null` for "cannot be scored",
// which is the caller's cue to emit `known: false` WITH A REASON.
// ─────────────────────────────────────────────────────────────────────────────

function clampScore(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.min(100, Math.max(0, Math.round(v)))
}

/** HIGHER = MORE ATTENTION. How much of the framework is NOT evidence-backed. */
export function scoreReadinessLevel(verifiedPct: number | null | undefined): number | null {
  if (typeof verifiedPct !== 'number' || !Number.isFinite(verifiedPct)) return null
  return clampScore(100 - verifiedPct)
}

/**
 * HIGHER = MORE ATTENTION. Zero open findings is KNOWN with score 0 — a pass is
 * not an absence, and the caller must not send `known: false` for a clean ledger.
 */
export function scoreEarlyWarning(counts: {
  critical?: number | null
  warn?: number | null
  info?: number | null
}): number | null {
  if (!counts || typeof counts !== 'object') return null
  const c = finiteCount(counts.critical)
  const w = finiteCount(counts.warn)
  const i = finiteCount(counts.info)
  if (c === null || w === null || i === null) return null
  return Math.min(100, 25 * c + 10 * w + 3 * i)
}

/**
 * HIGHER = MORE ATTENTION. The DOCUMENTED − DEFENSIBLE optimism gap, and it is
 * KNOWN only when the snapshot's evidence definition in force is `'current'`.
 * Under `'exists'` this dimension is ABSENT AND SAID TO BE ABSENT — never
 * silently folded in at full confidence.
 */
export function scoreEvidenceCurrency(
  selfScoredPct: number | null | undefined,
  verifiedPct: number | null | undefined,
  verifiedBasis: string | null | undefined,
): number | null {
  if (verifiedBasis !== 'current') return null
  if (typeof selfScoredPct !== 'number' || !Number.isFinite(selfScoredPct)) return null
  if (typeof verifiedPct !== 'number' || !Number.isFinite(verifiedPct)) return null
  return clampScore(selfScoredPct - verifiedPct)
}

export interface DomainExposure {
  score: number
  domainKey: DomainKey
  pct: number
}

/**
 * HIGHER = MORE ATTENTION. `100 - min(pct)` over the domains that carry a
 * number. Returns the weakest domain alongside the score so the driver sentence
 * and the row can never name different domains. Ties resolve to the lowest
 * `DOMAIN_KEYS` index — frozen, never insertion order.
 */
export function scoreDomainExposure(
  domainScores: Readonly<Record<string, unknown>> | null | undefined,
): DomainExposure | null {
  if (!domainScores || typeof domainScores !== 'object') return null
  let best: DomainExposure | null = null
  for (const key of DOMAIN_KEYS) {
    const raw = readDomainPct((domainScores as Record<string, unknown>)[key])
    if (raw === null) continue
    if (best === null || raw < best.pct) best = { score: clampScore(100 - raw), domainKey: key, pct: raw }
  }
  return best
}

/** HIGHER = MORE ATTENTION. Unresponded findings plus overdue/stale initiatives. */
export function scoreImprovement(counts: {
  unresponded?: number | null
  overdue?: number | null
  stale?: number | null
}): number | null {
  if (!counts || typeof counts !== 'object') return null
  const u = finiteCount(counts.unresponded)
  const o = finiteCount(counts.overdue)
  const s = finiteCount(counts.stale)
  if (u === null || o === null || s === null) return null
  return Math.min(100, 15 * u + 10 * o + 5 * s)
}

/**
 * HIGHER = MORE ATTENTION. `50` is the honest midpoint for a KNOWN-FLAT school.
 * `50` is NOT the value for an unknown school — unknown is `known: false`, and
 * it leaves the denominator entirely.
 */
export function scoreTrajectory(
  latestVerifiedPct: number | null | undefined,
  baselineVerifiedPct: number | null | undefined,
): number | null {
  if (typeof latestVerifiedPct !== 'number' || !Number.isFinite(latestVerifiedPct)) return null
  if (typeof baselineVerifiedPct !== 'number' || !Number.isFinite(baselineVerifiedPct)) return null
  return clampScore(50 - 5 * (latestVerifiedPct - baselineVerifiedPct))
}

// ─────────────────────────────────────────────────────────────────────────────
// §2.2 TRAJECTORY COMPARABILITY — reuse, do not re-derive
// ─────────────────────────────────────────────────────────────────────────────

export interface TrajectoryReading {
  /** yyyy-mm-dd */
  day: string | null
  engineVersion: string | null
  leafCount: number | null
  frameworkId: string | null
  verifiedBasis: string | null
  verifiedPct: number | null
}

export type TrajectoryUnknownReason =
  | 'no_latest_reading'
  | 'no_baseline_reading'
  | 'span_too_short'
  | 'comparability_break'

export interface TrajectoryComparability {
  known: boolean
  reason: TrajectoryUnknownReason | null
  spanDays: number | null
  deltaPct: number | null
}

/**
 * The yyyy-mm-dd cutoff the baseline read must sit on or before. Exported so the
 * API's bounded snapshot query and this engine can never disagree about what "90
 * days back" means — the alternative is the same subtraction typed twice.
 */
export function trajectoryBaselineCutoff(now: string): string | null {
  const c = toCivil(now)
  if (c === null) return null
  return civilToIso(civilFromDays(daysFromCivil(c.y, c.m, c.d) - TRAJECTORY_BASELINE_DAYS))
}

/**
 * `trajectory` is KNOWN only when a comparable baseline exists. Condition 3 is
 * the SAME four predicates `AccreditationReadinessHistoryService.detectBreaks`
 * tests: we do not draw a direction across a comparability break anywhere else
 * in the product and we do not start here.
 */
export function assessTrajectoryComparability(
  latest: TrajectoryReading | null | undefined,
  baseline: TrajectoryReading | null | undefined,
): TrajectoryComparability {
  const blocked = (reason: TrajectoryUnknownReason, spanDays: number | null = null): TrajectoryComparability => ({
    known: false,
    reason,
    spanDays,
    deltaPct: null,
  })
  if (!latest) return blocked('no_latest_reading')
  if (!baseline) return blocked('no_baseline_reading')

  const latestDay = dayNumberOf(latest.day)
  const baselineDay = dayNumberOf(baseline.day)
  if (latestDay === null || baselineDay === null) return blocked('no_baseline_reading')

  const spanDays = latestDay - baselineDay
  if (spanDays < MIN_SPAN_DAYS_FOR_DIRECTION) return blocked('span_too_short', spanDays)

  if (
    latest.engineVersion !== baseline.engineVersion ||
    latest.leafCount !== baseline.leafCount ||
    latest.frameworkId !== baseline.frameworkId ||
    latest.verifiedBasis !== baseline.verifiedBasis
  ) {
    return blocked('comparability_break', spanDays)
  }

  if (
    typeof latest.verifiedPct !== 'number' ||
    !Number.isFinite(latest.verifiedPct) ||
    typeof baseline.verifiedPct !== 'number' ||
    !Number.isFinite(baseline.verifiedPct)
  ) {
    return blocked('no_baseline_reading', spanDays)
  }

  return {
    known: true,
    reason: null,
    spanDays,
    deltaPct: latest.verifiedPct - baseline.verifiedPct,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// §6.2 THE CANONICAL BULK-ADOPT PAYLOAD
// ─────────────────────────────────────────────────────────────────────────────

export interface BulkAdoptPayloadInput {
  orgId: string
  catalogStandardId: string
  schoolIds: readonly string[]
  title: string
  dueDate?: string | null
  targetRubricScore?: number | null
}

/**
 * ONE canonical string for a propose→confirm proposal. The HASH lives in the API
 * (crypto is I/O-adjacent and does not belong in a pure package); the canonical
 * STRING lives here so the two sides can never disagree about what was proposed.
 *
 * School ids are de-duplicated and sorted with raw `<`/`>` — never
 * `localeCompare`, whose ICU data is a host property. Confirming the same SET of
 * schools in a different order is the same proposal; confirming a DIFFERENT set
 * is not, and that is exactly the change `PROPOSAL_STALE` exists to catch. The
 * version tag makes a future field addition a hash change rather than a silent
 * collision.
 */
export function canonicalBulkAdoptPayload(input: BulkAdoptPayloadInput): string {
  const ids = Array.from(new Set((input.schoolIds ?? []).map((s) => String(s)))).sort(compareRaw)
  return JSON.stringify([
    'bulk-adopt/v1',
    String(input.orgId ?? ''),
    String(input.catalogStandardId ?? ''),
    ids,
    String(input.title ?? ''),
    input.dueDate ?? '',
    input.targetRubricScore ?? '',
  ])
}

// ─────────────────────────────────────────────────────────────────────────────
// §2.5 comparePortfolioRows — TOTAL and DETERMINISTIC
// ─────────────────────────────────────────────────────────────────────────────

function compareRaw(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

/**
 * In order, no exceptions:
 *
 *   1. `attentionBand`  desc in severity  (ATTENTION_BAND_RANK asc)
 *   2. `urgency`        desc
 *   3. `attentionScore` desc
 *   4. `verifiedPct`    asc, null LAST within the tie group
 *   5. `name`           asc, raw `<`/`>` — NOT `localeCompare`
 *   6. `schoolId`       asc — an ADDITION, consulted only when 1..5 all tie
 *
 * Key 6 is required and is not a change to the frozen five. Two schools in one
 * diocese sharing a name ("St. Mary" twice is the NORMAL case) leaves the
 * plan's five keys short of a total order, so the output would depend on the
 * database's return order and the byte-identical-ordering criterion would fail
 * INTERMITTENTLY — the worst way for it to fail.
 */
export function comparePortfolioRows(a: PortfolioRow, b: PortfolioRow): number {
  const ba = ATTENTION_BAND_RANK[a.attentionBand] ?? 0
  const bb = ATTENTION_BAND_RANK[b.attentionBand] ?? 0
  if (ba !== bb) return ba - bb

  if (a.urgency !== b.urgency) return b.urgency - a.urgency

  if (a.attentionScore !== b.attentionScore) return b.attentionScore - a.attentionScore

  const av = a.verifiedPct
  const bv = b.verifiedPct
  if (av === null && bv !== null) return 1
  if (av !== null && bv === null) return -1
  if (av !== null && bv !== null && av !== bv) return av < bv ? -1 : 1

  const byName = compareRaw(a.name, b.name)
  if (byName !== 0) return byName

  return compareRaw(a.schoolId, b.schoolId)
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalization — every coercion is a REFUSAL, never a plausible number
// ─────────────────────────────────────────────────────────────────────────────

function finiteCount(v: unknown): number | null {
  if (v === null || v === undefined) return 0
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  return Math.max(0, Math.round(v))
}

function coercedCount(v: unknown): number {
  return finiteCount(v) ?? 0
}

function readDomainPct(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (v && typeof v === 'object') {
    const pct = (v as { pct?: unknown }).pct
    if (typeof pct === 'number' && Number.isFinite(pct)) return pct
  }
  return null
}

function dayNumberOf(iso: string | null | undefined): number | null {
  const c = toCivil(iso ?? null)
  if (c === null) return null
  return daysFromCivil(c.y, c.m, c.d)
}

function nullableString(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function nullableFinite(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function unknownComponent(reason: string): PortfolioComponentInput {
  return { known: false, score: null, basis: null, reason }
}

function normalizeComponent(raw: unknown): PortfolioComponentInput {
  if (!raw || typeof raw !== 'object') return unknownComponent(INVALID_INPUT_REASON)
  const c = raw as Partial<PortfolioComponentInput>
  const basis = typeof c.basis === 'string' && c.basis.length > 0 ? c.basis : null

  if (c.known !== true) {
    // A score present on an UNKNOWN component is a contradiction in the input,
    // not a number we may quietly use.
    if (c.score !== null && c.score !== undefined) return unknownComponent(INVALID_INPUT_REASON)
    const reason = typeof c.reason === 'string' && c.reason.length > 0 ? c.reason : INVALID_INPUT_REASON
    return { known: false, score: null, basis, reason }
  }

  const s = c.score
  if (typeof s !== 'number' || !Number.isFinite(s) || s < 0 || s > 100) {
    return unknownComponent(INVALID_INPUT_REASON)
  }
  return { known: true, score: Math.round(s), basis, reason: null }
}

function normalizeWeakestDomain(raw: unknown): PortfolioWeakestDomain | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as { domainKey?: unknown; pct?: unknown }
  if (!isDomainKey(d.domainKey)) return null
  if (typeof d.pct !== 'number' || !Number.isFinite(d.pct)) return null
  return { domainKey: d.domainKey, pct: d.pct }
}

function computeUrgency(
  daysToReview: number | null,
  citationOverdue: boolean,
): { urgency: Urgency; urgencyReason: PortfolioUrgencyReason } {
  // An overdue citation response is a stated FAILURE, not a calendar
  // proximity, so it names itself when both apply. Both are urgency 3, so the
  // choice cannot move a school in the ordering — only in what it says.
  if (citationOverdue) return { urgency: 3, urgencyReason: 'citation_overdue' }
  if (daysToReview === null) return { urgency: 0, urgencyReason: 'no_scheduled_review' }
  // A NEGATIVE day count is a review date that has already gone by. Same urgency
  // tier as an imminent visit — it was already in that tier before this branch
  // existed — but "the visit is within six months" is not a true sentence about a
  // date in the past, and this portfolio's whole claim is that its sentences are
  // true of the data they describe.
  if (daysToReview < 0) return { urgency: 3, urgencyReason: 'review_overdue' }
  if (daysToReview <= URGENCY_TIER_DAYS.imminent) return { urgency: 3, urgencyReason: 'visit_imminent' }
  if (daysToReview <= URGENCY_TIER_DAYS.near) return { urgency: 2, urgencyReason: 'visit_within_year' }
  if (daysToReview <= URGENCY_TIER_DAYS.horizon) return { urgency: 1, urgencyReason: 'visit_on_horizon' }
  return { urgency: 0, urgencyReason: 'review_beyond_horizon' }
}

interface NormalizedSchool {
  row: Omit<
    PortfolioRow,
    'rank' | 'attentionScore' | 'attentionBand' | 'confidence' | 'knownComponents' | 'drivers'
  >
  knownComponents: PortfolioComponentKey[]
  knownBp: number
  confidence: number
}

function normalizeSchool(raw: unknown, now: string): NormalizedSchool | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Partial<PortfolioSchoolInput> & Record<string, unknown>

  const components = {} as Record<PortfolioComponentKey, PortfolioComponentInput>
  const rawComponents = (s.components ?? {}) as Record<string, unknown>
  for (const key of PORTFOLIO_COMPONENT_KEYS) {
    components[key] = normalizeComponent(
      rawComponents && typeof rawComponents === 'object' ? rawComponents[key] : undefined,
    )
  }

  const verifiedPct = nullableFinite(s.verifiedPct)
  const selfScoredPct = nullableFinite(s.selfScoredPct)
  const weakestDomain = normalizeWeakestDomain(s.weakestDomain)

  // COHERENCE. A component may not be KNOWN when the row cannot show the figure
  // its own driver sentence would have to name. Rejecting here pushes the school
  // towards `insufficientData` — which is the SAFE direction: an explicitly
  // unrankable school, never a quietly ranked one.
  if (components.readinessLevel.known && verifiedPct === null) {
    components.readinessLevel = unknownComponent(INVALID_INPUT_REASON)
  }
  if (components.evidenceCurrency.known && (verifiedPct === null || selfScoredPct === null)) {
    components.evidenceCurrency = unknownComponent(INVALID_INPUT_REASON)
  }
  if (components.domainExposure.known && weakestDomain === null) {
    components.domainExposure = unknownComponent(INVALID_INPUT_REASON)
  }

  const urgencyDate = nullableString(s.urgencyDate)
  let urgencyDaysToReview = nullableFinite(s.urgencyDaysToReview)
  if (urgencyDaysToReview !== null) {
    urgencyDaysToReview = Math.round(urgencyDaysToReview)
  } else if (urgencyDate !== null) {
    const target = dayNumberOf(urgencyDate)
    const today = dayNumberOf(now)
    if (target !== null && today !== null) urgencyDaysToReview = target - today
  }

  // Tri-state, preserved: an omitted / null field is NOT ASSESSED and stays null,
  // rather than being flattened to a `false` the payload cannot defend.
  const citationOverdue =
    s.citationOverdue === true ? true : s.citationOverdue === false ? false : null
  const { urgency, urgencyReason } = computeUrgency(urgencyDaysToReview, citationOverdue === true)

  const openFindings: PortfolioOpenFindings = {
    critical: coercedCount((s.openFindings as PortfolioOpenFindings | undefined)?.critical),
    warn: coercedCount((s.openFindings as PortfolioOpenFindings | undefined)?.warn),
    info: coercedCount((s.openFindings as PortfolioOpenFindings | undefined)?.info),
  }
  const initiativesRaw = s.initiatives as PortfolioInitiativeCounts | undefined
  const initiatives: PortfolioInitiativeCounts = {
    open: coercedCount(initiativesRaw?.open),
    overdue: coercedCount(initiativesRaw?.overdue),
    stale: coercedCount(initiativesRaw?.stale),
    unresponded: coercedCount(initiativesRaw?.unresponded),
  }

  const knownComponents = PORTFOLIO_COMPONENT_KEYS.filter((k) => components[k].known)
  const knownBp = knownComponents.reduce((acc, k) => acc + COMPONENT_WEIGHT_BP[k], 0)

  const leafCountRaw = nullableFinite(s.leafCount)
  const snapshotDate = nullableString(s.snapshotDate)

  return {
    row: {
      schoolId: String(s.schoolId ?? ''),
      name: String(s.name ?? ''),
      seriesKey: nullableString(s.seriesKey),
      frameworkCode: nullableString(s.frameworkCode),
      frameworkName: nullableString(s.frameworkName),
      indexComparable: s.indexComparable === true,
      verifiedPct,
      selfScoredPct,
      readinessPct: nullableFinite(s.readinessPct),
      projectedIndex: nullableFinite(s.projectedIndex),
      band: nullableString(s.band),
      leafCount: leafCountRaw === null ? null : Math.round(leafCountRaw),
      snapshotDate: dayNumberOf(snapshotDate) === null ? null : snapshotDate,
      demoData: s.demoData === true,
      components,
      urgencyDaysToReview,
      citationOverdue,
      openFindings,
      initiatives,
      weakestDomain,
      urgencyDate,
      trajectoryDeltaPct: nullableFinite(s.trajectoryDeltaPct),
      urgency,
      urgencyReason,
    },
    knownComponents,
    knownBp,
    confidence: knownBp / TOTAL_WEIGHT_BP,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// §2.6 DRIVERS — never empty, and never a figure the row does not carry
// ─────────────────────────────────────────────────────────────────────────────

type DriverContext = NormalizedSchool['row']

function driverLabel(key: PortfolioComponentKey, ctx: DriverContext): string {
  if (key === 'domainExposure' && ctx.weakestDomain !== null) {
    return `Weakest domain: ${DOMAIN_LABELS[ctx.weakestDomain.domainKey]}`
  }
  return COMPONENT_LABELS[key]
}

function driverDetail(key: PortfolioComponentKey, ctx: DriverContext): string {
  switch (key) {
    case 'readinessLevel':
      return `${Math.round(ctx.verifiedPct as number)}% of the framework is evidence-backed.`
    case 'earlyWarning':
      return (
        `${ctx.openFindings.critical} critical, ${ctx.openFindings.warn} warning and ` +
        `${ctx.openFindings.info} informational findings are open.`
      )
    case 'evidenceCurrency':
      return (
        `Self-scored ${Math.round(ctx.selfScoredPct as number)}% against ` +
        `${Math.round(ctx.verifiedPct as number)}% evidence-backed.`
      )
    case 'domainExposure': {
      const wd = ctx.weakestDomain as PortfolioWeakestDomain
      return `${DOMAIN_LABELS[wd.domainKey]} reads ${Math.round(wd.pct)}%, the weakest domain on record.`
    }
    case 'improvement':
      return (
        `${ctx.initiatives.unresponded} findings without an initiative, ` +
        `${ctx.initiatives.overdue} overdue and ${ctx.initiatives.stale} stale.`
      )
    case 'trajectory': {
      const delta = ctx.trajectoryDeltaPct
      if (delta !== null) {
        const rounded = Math.round(delta)
        if (rounded === 0) return 'Verified coverage is unchanged against its comparable baseline.'
        const verb = rounded < 0 ? 'fell' : 'rose'
        return `Verified coverage ${verb} ${Math.abs(rounded)} points against its comparable baseline.`
      }
      // No figure on the row, so name none. The DIRECTION is derived exactly
      // from the component's own score (score = 50 − 5·delta), so this sentence
      // states nothing the score does not already say.
      const score = ctx.components.trajectory.score ?? 50
      if (score > 50) return 'Verified coverage moved backwards against its comparable baseline.'
      if (score < 50) return 'Verified coverage moved forwards against its comparable baseline.'
      return 'Verified coverage is unchanged against its comparable baseline.'
    }
  }
}

function buildDrivers(
  ctx: DriverContext,
  knownComponents: readonly PortfolioComponentKey[],
  knownBp: number,
): PortfolioDriver[] {
  const indexOf = (k: PortfolioComponentKey) => PORTFOLIO_COMPONENT_KEYS.indexOf(k)
  const contributionOf = (k: PortfolioComponentKey) =>
    Math.round((COMPONENT_WEIGHT_BP[k] * (ctx.components[k].score ?? 0)) / knownBp)

  const positives = knownComponents.filter((k) => (ctx.components[k].score ?? 0) > 0)

  // THE ALL-ZERO CASE IS SPECIFIED, NOT LEFT TO CHANCE. A fully-measured school
  // with nothing outstanding still gets exactly ONE driver — "clear" is the rank
  // most likely to be wrong, so it is the rank that most needs a stated basis.
  if (positives.length === 0) {
    const top = [...knownComponents].sort(
      (a, b) => COMPONENT_WEIGHT_BP[b] - COMPONENT_WEIGHT_BP[a] || indexOf(a) - indexOf(b),
    )[0]
    return [
      {
        component: top,
        contributionBp: 0,
        label: driverLabel(top, ctx),
        detail: ALL_CLEAR_DRIVER_DETAIL,
      },
    ]
  }

  return [...positives]
    .sort((a, b) => contributionOf(b) - contributionOf(a) || indexOf(a) - indexOf(b))
    .slice(0, 3)
    .map((k) => ({
      component: k,
      contributionBp: contributionOf(k),
      label: driverLabel(k, ctx),
      detail: driverDetail(k, ctx),
    }))
}

// ─────────────────────────────────────────────────────────────────────────────
// computePortfolio
// ─────────────────────────────────────────────────────────────────────────────

function emptyCounts(): Record<TwinRiskBand, number> {
  const counts = {} as Record<TwinRiskBand, number>
  for (const band of PORTFOLIO_BAND_KEYS) counts[band] = 0
  return counts
}

function buildBandDistribution(ranked: readonly PortfolioRow[]): PortfolioBandDistribution[] {
  const byCode = new Map<string, PortfolioBandDistribution>()
  // A framework code and the ABSENCE of one are different groups, so the
  // no-framework bucket gets a key no code can collide with.
  const keyOf = (code: string | null) => (code === null ? 'null:' : `code:${code}`)

  for (const row of ranked) {
    const key = keyOf(row.frameworkCode)
    let entry = byCode.get(key)
    if (!entry) {
      entry = {
        frameworkCode: row.frameworkCode,
        frameworkName: row.frameworkName,
        counts: emptyCounts(),
        schoolCount: 0,
      }
      byCode.set(key, entry)
    }
    if (entry.frameworkName === null && row.frameworkName !== null) entry.frameworkName = row.frameworkName
    entry.counts[row.attentionBand] = (entry.counts[row.attentionBand] ?? 0) + 1
    entry.schoolCount += 1
  }

  // frameworkCode asc, null LAST. There is never a single merged histogram when
  // more than one framework is present.
  return [...byCode.values()].sort((a, b) => {
    if (a.frameworkCode === null && b.frameworkCode === null) return 0
    if (a.frameworkCode === null) return 1
    if (b.frameworkCode === null) return -1
    return compareRaw(a.frameworkCode, b.frameworkCode)
  })
}

/**
 * TOTAL. Never throws. Malformed input is coerced to UNKNOWN with reason
 * `'invalid_input'` — it is never allowed to produce a plausible number.
 *
 * `now` is a yyyy-mm-dd STRING PARAMETER, not a clock read.
 */
export function computePortfolio(
  schools: readonly PortfolioSchoolInput[],
  now: string,
): PortfolioResult {
  const nowDay = typeof now === 'string' ? now : ''
  const source = Array.isArray(schools) ? schools : []

  const ranked: PortfolioRow[] = []
  const insufficientData: PortfolioInsufficientRow[] = []

  for (const raw of source) {
    const normalized = normalizeSchool(raw, nowDay)
    if (normalized === null) continue
    const { row, knownComponents, knownBp, confidence } = normalized

    // Two floors, count FIRST (its reason is the more specific of the two).
    if (knownComponents.length < MIN_KNOWN_COMPONENTS || confidence < MIN_CONFIDENCE) {
      insufficientData.push({
        schoolId: row.schoolId,
        name: row.name,
        confidence,
        knownComponents,
        missingComponents: PORTFOLIO_COMPONENT_KEYS.filter((k) => !row.components[k].known).map((k) => ({
          component: k,
          reason: row.components[k].reason ?? INVALID_INPUT_REASON,
        })),
        reason: knownComponents.length < MIN_KNOWN_COMPONENTS ? 'too_few_components' : 'low_confidence',
      })
      continue
    }

    const weightedBp = knownComponents.reduce(
      (acc, k) => acc + COMPONENT_WEIGHT_BP[k] * (row.components[k].score ?? 0),
      0,
    )
    const attentionScore = Math.round(weightedBp / knownBp)

    ranked.push({
      ...row,
      rank: 0,
      attentionScore,
      attentionBand: bandForRisk(attentionScore),
      confidence,
      knownComponents,
      drivers: buildDrivers(row, knownComponents, knownBp),
    })
  }

  ranked.sort(comparePortfolioRows)
  for (let i = 0; i < ranked.length; i += 1) ranked[i].rank = i + 1

  insufficientData.sort((a, b) => compareRaw(a.name, b.name) || compareRaw(a.schoolId, b.schoolId))

  const distinctCodes = new Set<string>()
  let hasUnknownFramework = false
  let everyRowCarriesIndexScale = true
  for (const row of ranked) {
    if (row.frameworkCode === null) hasUnknownFramework = true
    else distinctCodes.add(row.frameworkCode)
    if (!row.indexComparable) everyRowCarriesIndexScale = false
  }

  const indexComparable =
    ranked.length > 0 && !hasUnknownFramework && distinctCodes.size === 1 && everyRowCarriesIndexScale

  const notes: string[] = []
  if (!indexComparable && ranked.length > 0) {
    if (distinctCodes.size >= 2) notes.push(multiFrameworkNote(distinctCodes.size))
    if (hasUnknownFramework) notes.push(UNKNOWN_FRAMEWORK_NOTE)
    if (distinctCodes.size === 1 && !hasUnknownFramework && !everyRowCarriesIndexScale) {
      notes.push(NO_INDEX_SCALE_NOTE)
    }
  }

  return {
    ranked,
    insufficientData,
    bandDistribution: buildBandDistribution(ranked),
    indexComparable,
    notes,
  }
}
