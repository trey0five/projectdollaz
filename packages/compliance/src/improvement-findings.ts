// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase G — the PURE recommendation templates for the Continuous
// Improvement Manager.
//
// Every other accreditation surface in this product ends in a sentence. This one
// ends in something a school can OWN: a title, an owner role, a metric to bind,
// a target rubric level, and — only when it is real — the number of index points
// the work is worth.
//
// THE THREE RULES THAT GOVERN EVERY LINE BELOW:
//
//   1. NO TEMPLATE MAY STATE A NUMBER THE CALLER DID NOT SUPPLY. `nextStepLift`
//      and `fullLift` are COPIED from `computeGaps`, never recomputed here — the
//      arithmetic that produced them needs `leafCount`, which is deliberately not
//      an input, so there is no way for this file to invent a plausible lift.
//   2. `estimatedLift` IS NULL OR IT IS TRUE. Evidence work and assurance gates
//      move readiness but move the index by exactly zero (the index is the mean
//      rubric score — accreditation-readiness.ts:181 — and assurance leaves are
//      excluded from the scored set entirely), so those templates ship a null
//      lift and a literal reason rather than a flattering number. A reason is
//      non-null EXACTLY when the lift is null.
//   3. NO PERCENTAGE IS EVER USED AS A LIKELIHOOD. Nothing here expresses
//      confidence as a number at all.
//
// DETERMINISM CONTRACT: obeys the package PURITY GUARD — no clock, no I/O, no
// randomness, no React/DOM. `now` is a PARAMETER. Inputs are never mutated.
// ─────────────────────────────────────────────────────────────────────────────

import { RUBRIC_MAX, RUBRIC_MIN, normalizeRubricScore } from './accreditation-readiness.js'
import type { DomainKey } from './accreditation-domains.js'

export const IMPROVEMENT_FINDINGS_VERSION = '1.0.0'

/** Default size of the recommendations rail. */
export const RECOMMENDATION_LIMIT = 8

// ─────────────────────────────────────────────────────────────────────────────
// The ONE finding-key formula
// ─────────────────────────────────────────────────────────────────────────────

/**
 * THE one formula. `AccreditationFinding.findingKey` is composed in the API
 * layer (`apps/api/src/twin/early-warning.service.ts`) and the improvement
 * templates must compose the SAME key from the same two parts, or an adopted
 * recommendation would never match the finding it came from. Both sides call
 * this; neither re-inlines the template literal.
 *
 * NOTE for readers coming from the pure twin engine: `TwinFinding.factKey` is a
 * different thing (a de-duplication key over facts), and `TwinStandardRisk.
 * findingKeys[]` is a set of FACT keys despite its name. This is the real one.
 */
export function composeFindingKey(ruleId: string, scopeKey: string): string {
  return `${ruleId}:${scopeKey}`
}

// ─────────────────────────────────────────────────────────────────────────────
// §4.1 INPUTS — everything is handed in, nothing is looked up
// ─────────────────────────────────────────────────────────────────────────────

export interface ImprovementGapInput {
  standardId: string
  code: string
  title: string
  /** 1..4 or null. Re-normalised defensively; an out-of-range value reads as unrated. */
  rubricScore: number | null
  evidenceGap: boolean
  /** VERBATIM from `computeGaps`. Never recomputed here. Null in no-index mode. */
  nextStepLift: number | null
  /**
   * VERBATIM from `computeGaps`. Null in no-index mode.
   *
   * DELIBERATELY UNUSED by all four templates today: no template claims the
   * whole-way lift, because no template proposes going straight to level 4. It
   * is carried on the input so the API hands over the complete gap record and so
   * the specs can prove — with a large, tempting value present — that the
   * evidence and assurance templates still refuse to quote a number.
   */
  fullLift: number | null
  primaryDomainKey: DomainKey
  /** From the standard's bound signals; `[]` when none. */
  boundMetricKeys: readonly string[]
}

export interface ImprovementAssuranceInput {
  standardId: string
  code: string
  title: string
  satisfied: boolean
  primaryDomainKey: DomainKey
}

export interface ImprovementFindingInput {
  /** `findingKey` is COMPOSED from these two — see `composeFindingKey`. */
  ruleId: string
  scopeKey: string
  title: string
  severity: 'info' | 'warn' | 'critical'
  standardTags: readonly string[]
  primaryDomainKey: DomainKey
  /** The accreditation consequence. ECHOED VERBATIM as the rationale. */
  consequence: string
}

export interface RecommendationInput {
  gaps: readonly ImprovementGapInput[]
  assurances: readonly ImprovementAssuranceInput[]
  findings: readonly ImprovementFindingInput[]
  /**
   * Finding keys / standard ids already worked. These are EXCLUDED before
   * ordering and are never re-offered — a school that has adopted a gap does not
   * get told to adopt it again.
   */
  adoptedKeys: readonly string[]
  /**
   * yyyy-mm-dd, PASSED IN — this package may not read a clock.
   *
   * DELIBERATELY UNUSED today: not one of the four frozen templates states or
   * derives a date, and the frozen `Recommendation` shape carries no date field,
   * so using `now` would mean inventing output the contract does not have. It is
   * required on the input anyway so that the day a template does need "today",
   * the clock arrives as an argument rather than as an import — and a spec pins
   * that the output is invariant to it, which is the strongest available proof
   * that nothing here has quietly started reading time.
   */
  now: string
  /** Default `RECOMMENDATION_LIMIT`. */
  limit?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// §4.2 OUTPUT
// ─────────────────────────────────────────────────────────────────────────────

export type RecommendationTemplateId =
  | 'REC-RUBRIC-STEP'
  | 'REC-EVIDENCE-GAP'
  | 'REC-ASSURANCE-GATE'
  | 'REC-FINDING-WORK'

/** The declared order. Also the template tie-break rank. FROZEN. */
export const RECOMMENDATION_TEMPLATE_IDS = [
  'REC-RUBRIC-STEP',
  'REC-EVIDENCE-GAP',
  'REC-ASSURANCE-GATE',
  'REC-FINDING-WORK',
] as const

export type SuggestedOwnerRole =
  | 'head_of_school'
  | 'principal'
  | 'business_manager'
  | 'board_chair'
  | 'facilities_manager'
  | 'advancement_director'
  | 'accreditation_lead'

export type RecommendationOriginType = 'gap' | 'assurance' | 'finding'

export interface EstimatedLift {
  /** REAL index points, copied from the input. Never rounded, scaled or re-derived. */
  points: number
  basis: 'nextStepLift' | 'fullLift'
}

export interface Recommendation {
  templateId: RecommendationTemplateId
  /** `${ruleId}:${scopeKey}` for finding-derived; null for gap/assurance-derived. */
  findingKey: string | null
  originType: RecommendationOriginType
  /** standardId, or the findingKey. NEVER null. */
  originRef: string
  title: string
  rationale: string
  suggestedOwnerRole: SuggestedOwnerRole
  suggestedMetricKey: string | null
  suggestedTargetRubricScore: number | null
  /** Null whenever no index movement is attributable — which is most of the time. */
  estimatedLift: EstimatedLift | null
  /** Non-null EXACTLY when `estimatedLift` is null. A literal, frozen sentence. */
  estimatedLiftReason: string | null
  standardTags: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// The frozen refusal sentences. Rendered VERBATIM; never re-worded by a client.
// Each one is traced to the line of arithmetic that makes it true.
// ─────────────────────────────────────────────────────────────────────────────

/** No index scale at all (MSA / NSBECS): `computeGaps` returns null lifts. */
export const NO_INDEX_SCALE_REASON =
  'Your framework publishes no index scale, so an index gain cannot be stated.'

/**
 * accreditation-readiness.ts:181 — `projectedIndex = round(mean(rubricScore ?? 1)
 * × 100)`, in which evidence appears nowhere. Evidence is the 30% term of
 * `standardReadiness` (:138) and nothing else.
 */
export const EVIDENCE_NOT_INDEXED_REASON =
  'Attaching evidence moves the defensible half of readiness, not the projected index — the index is the mean rubric score.'

/**
 * readiness.service.ts:151–153 — assurance leaves are excluded from
 * `scoredLeaves`, which is the only array `schoolReadiness` ever sees.
 */
export const ASSURANCE_NOT_INDEXED_REASON =
  'Assurance gates are pass/fail and sit outside the index calculation.'

/** The finding's scope is 'school' or 'evidence:<tag>' — no single standard moves. */
export const FINDING_NOT_STANDARD_SCOPED_REASON =
  'This finding is not scoped to a single standard, so no index movement can be attributed to it.'

/**
 * The finding names ONE standard, but that standard is not among the ranked
 * readiness gaps (it is already at the top of the rubric with evidence, or it
 * fell outside the caller's gap window), so this file has no lift to copy and
 * refuses to derive one. Distinct from
 * `FINDING_NOT_STANDARD_SCOPED_REASON`, which would be a false statement here.
 */
export const FINDING_STANDARD_NOT_A_GAP_REASON =
  'That standard is not among the ranked readiness gaps, so no index movement can be attributed to this finding.'

/**
 * The gap EXISTS and the framework HAS an index, but a rubric step on that
 * standard is worth exactly zero points — `computeGaps` sets
 * `nextStepLift = 0` for a leaf already at the top of the rubric that is a gap
 * only because it carries no evidence (accreditation-readiness.ts, the
 * `effective >= RUBRIC_MAX ? 0` branch).
 *
 * Rule 2 of this file's header says `estimatedLift` IS NULL OR IT IS TRUE, and
 * "+0 index pts" is neither: it is a number that claims an attribution it does
 * not have, and — worse — `compareRanked` ranks ANY non-null lift above every
 * honestly-null one, so a zero-point card would outrank real work and could push
 * a genuine recommendation out of the rail. A non-positive lift is therefore no
 * lift at all.
 */
export const ZERO_LIFT_REASON =
  'A rubric step on that standard is worth no index points, so no index gain can be stated.'

/** `scopeKey` shape for a single-standard finding: `standard:<standardId>`. */
const STANDARD_SCOPE = /^standard:(.+)$/

// ─────────────────────────────────────────────────────────────────────────────
// The FROZEN owner map. Declared as a total Record<DomainKey, …> so TypeScript
// refuses to compile if a domain is ever added without an owner. No
// per-recommendation invention: the domain decides, every time.
//
// `advancement_director` is part of the owner vocabulary but no accreditation
// domain routes to it — the ten-domain map has no advancement domain — so the
// table never emits it. That is a deliberate hole, not an oversight: the day a
// framework carries advancement standards, this is the one line that changes.
// ─────────────────────────────────────────────────────────────────────────────
export const OWNER_ROLE_BY_DOMAIN: Readonly<Record<DomainKey, SuggestedOwnerRole>> = Object.freeze({
  mission_identity: 'head_of_school',
  governance: 'board_chair',
  leadership: 'head_of_school',
  academic_excellence: 'principal',
  student_services: 'principal',
  hr: 'head_of_school',
  finance: 'business_manager',
  facilities: 'facilities_manager',
  technology: 'business_manager',
  continuous_improvement: 'accreditation_lead',
})

// ─────────────────────────────────────────────────────────────────────────────
// Ordering. FROZEN, total, deterministic:
//
//   estimatedLift.points DESC (null LAST)
//     -> severity critical > warn   (findings only; gap/assurance rank as warn)
//     -> templateId in RECOMMENDATION_TEMPLATE_IDS order
//     -> code / originRef localeCompare ASC
//     -> originRef localeCompare ASC   (final total tie-break)
//
// The last key is an ADDITION to the frozen list. It can only fire when two
// recommendations agree on all four frozen keys — same lift, same severity, same
// template, same code — which the frozen ordering leaves undefined and which
// `Array.prototype.sort` would resolve by input position. Without it a shuffled
// input could legitimately produce a different order, and "determinism" would be
// a property of the caller's array rather than of this function.
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_RANK: Readonly<Record<'critical' | 'warn', number>> = Object.freeze({
  critical: 2,
  warn: 1,
})

const TEMPLATE_RANK: Readonly<Record<RecommendationTemplateId, number>> = Object.freeze({
  'REC-RUBRIC-STEP': 0,
  'REC-EVIDENCE-GAP': 1,
  'REC-ASSURANCE-GATE': 2,
  'REC-FINDING-WORK': 3,
})

/** The sort carriers. `severity` and `sortKey` never reach the output. */
interface Ranked {
  rec: Recommendation
  severity: 'critical' | 'warn'
  /** The standard `code` where one exists, else the findingKey. */
  sortKey: string
}

function compareRanked(a: Ranked, b: Ranked): number {
  const al = a.rec.estimatedLift
  const bl = b.rec.estimatedLift
  if (al !== null && bl === null) return -1
  if (al === null && bl !== null) return 1
  if (al !== null && bl !== null && al.points !== bl.points) return bl.points - al.points
  const s = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
  if (s !== 0) return s
  const t = TEMPLATE_RANK[a.rec.templateId] - TEMPLATE_RANK[b.rec.templateId]
  if (t !== 0) return t
  const k = a.sortKey.localeCompare(b.sortKey)
  if (k !== 0) return k
  return a.rec.originRef.localeCompare(b.rec.originRef)
}

// ─────────────────────────────────────────────────────────────────────────────
// §4.4 THE FOUR TEMPLATES. Every numeral traced to an input.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * THE one place a `nextStepLift` becomes an `estimatedLift`, shared by the two
 * templates that quote one.
 *
 * A lift is stated ONLY when it is a real, positive number of index points.
 * `null` means the framework publishes no index scale; `<= 0` means the
 * arithmetic that produced it attributed no movement (a leaf at the top of the
 * rubric). Both are refusals, and each gets its own true sentence — a reason is
 * non-null EXACTLY when the lift is null (§2).
 */
function nextStepLiftOf(gap: ImprovementGapInput): {
  lift: EstimatedLift | null
  reason: string | null
} {
  if (gap.nextStepLift === null) return { lift: null, reason: NO_INDEX_SCALE_REASON }
  if (!(gap.nextStepLift > 0)) return { lift: null, reason: ZERO_LIFT_REASON }
  return { lift: { points: gap.nextStepLift, basis: 'nextStepLift' }, reason: null }
}

/**
 * REC-RUBRIC-STEP — one rubric level, on a standard that has room for one.
 *
 * The lift sentence is OMITTED ENTIRELY when `nextStepLift` is null. It is never
 * replaced with a guess, an average, or the word "some".
 */
function rubricStep(gap: ImprovementGapInput): Ranked {
  const score = normalizeRubricScore(gap.rubricScore)
  const step = nextStepLiftOf(gap)
  const lift = step.lift
  const rated = score === null ? `${gap.code} is unrated today.` : `${gap.code} is rated ${score} today.`
  const worth =
    lift === null
      ? ''
      : ` One rubric level of movement is worth ${lift.points} index point${lift.points === 1 ? '' : 's'}.`
  return {
    rec: {
      templateId: 'REC-RUBRIC-STEP',
      findingKey: null,
      originType: 'gap',
      originRef: gap.standardId,
      title: `Raise ${gap.code} one rubric level`,
      rationale: `${rated}${worth}`,
      suggestedOwnerRole: OWNER_ROLE_BY_DOMAIN[gap.primaryDomainKey],
      suggestedMetricKey: gap.boundMetricKeys[0] ?? null,
      suggestedTargetRubricScore: Math.min(RUBRIC_MAX, (score ?? RUBRIC_MIN) + 1),
      estimatedLift: lift,
      estimatedLiftReason: step.reason,
      standardTags: [gap.code],
    },
    severity: 'warn',
    sortKey: gap.code,
  }
}

/**
 * REC-EVIDENCE-GAP — a standard with nothing attached to it.
 *
 * `estimatedLift` is null ALWAYS, whatever the gap's lifts say, because evidence
 * contributes zero to the projected index. The rationale carries NO index
 * numeral, and it carries no evidence count either: the count is not an input,
 * and a count this file does not have is not a count it will print.
 */
function evidenceGap(gap: ImprovementGapInput): Ranked {
  return {
    rec: {
      templateId: 'REC-EVIDENCE-GAP',
      findingKey: null,
      originType: 'gap',
      originRef: gap.standardId,
      title: `Attach evidence for ${gap.code}`,
      rationale: `${gap.code} — ${gap.title} — carries no evidence, so it is documented but not defensible.`,
      suggestedOwnerRole: OWNER_ROLE_BY_DOMAIN[gap.primaryDomainKey],
      suggestedMetricKey: gap.boundMetricKeys[0] ?? null,
      suggestedTargetRubricScore: null,
      estimatedLift: null,
      estimatedLiftReason: EVIDENCE_NOT_INDEXED_REASON,
      standardTags: [gap.code],
    },
    severity: 'warn',
    sortKey: gap.code,
  }
}

/** REC-ASSURANCE-GATE — an unmet assurance. Pass/fail, and outside the index. */
function assuranceGate(assurance: ImprovementAssuranceInput): Ranked {
  return {
    rec: {
      templateId: 'REC-ASSURANCE-GATE',
      findingKey: null,
      originType: 'assurance',
      originRef: assurance.standardId,
      title: `Close the assurance gate on ${assurance.code}`,
      rationale:
        `${assurance.code} — ${assurance.title} — is an assurance gate and it is not satisfied. ` +
        'An unmet assurance is decided pass/fail at the visit, whatever the rest of the register says.',
      suggestedOwnerRole: OWNER_ROLE_BY_DOMAIN[assurance.primaryDomainKey],
      // There are no bound metric keys on an assurance input — an assurance is a
      // document gate, not a measured one — so this is null by construction and
      // never guessed from the title.
      suggestedMetricKey: null,
      suggestedTargetRubricScore: null,
      estimatedLift: null,
      estimatedLiftReason: ASSURANCE_NOT_INDEXED_REASON,
      standardTags: [assurance.code],
    },
    severity: 'warn',
    sortKey: assurance.code,
  }
}

/**
 * REC-FINDING-WORK — work an early warning.
 *
 * The rationale is the finding's `consequence`, ECHOED VERBATIM. This file
 * composes no new sentence about a finding: the sentence that exists was already
 * numerically validated where its numbers were checked, and re-writing it here
 * would be a second, unvalidated claim about the same fact.
 */
function findingWork(
  finding: ImprovementFindingInput,
  findingKey: string,
  gapsByStandardId: ReadonlyMap<string, ImprovementGapInput>,
): Ranked {
  const scoped = STANDARD_SCOPE.exec(finding.scopeKey)
  const gap = scoped ? gapsByStandardId.get(scoped[1]) : undefined

  let lift: EstimatedLift | null = null
  let reason: string | null = null
  if (!scoped) {
    reason = FINDING_NOT_STANDARD_SCOPED_REASON
  } else if (!gap) {
    reason = FINDING_STANDARD_NOT_A_GAP_REASON
  } else {
    // The SAME borrow the rubric-step template uses, refusals and all — a lift
    // of 0 is not a lift here either, and the rail must never print "+0 pts".
    const step = nextStepLiftOf(gap)
    lift = step.lift
    reason = step.reason
  }

  return {
    rec: {
      templateId: 'REC-FINDING-WORK',
      findingKey,
      originType: 'finding',
      originRef: findingKey,
      title: finding.title,
      rationale: finding.consequence,
      suggestedOwnerRole: OWNER_ROLE_BY_DOMAIN[finding.primaryDomainKey],
      suggestedMetricKey: null,
      suggestedTargetRubricScore: null,
      estimatedLift: lift,
      estimatedLiftReason: reason,
      standardTags: [...finding.standardTags],
    },
    severity: finding.severity === 'critical' ? 'critical' : 'warn',
    sortKey: findingKey,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The ranked recommendation rail.
 *
 * A gap can produce TWO recommendations — a rubric step and an evidence gap are
 * different pieces of work with different owners and different truths about the
 * index — and both are offered. `adoptedKeys` is applied BEFORE ordering, on
 * `originRef`, so adopting a standard removes every recommendation derived from
 * it and adopting a finding removes exactly that finding's.
 *
 * Never mutates its inputs. Same inputs -> same output, on any host, in any
 * timezone, at any hour.
 */
export function computeRecommendations(input: RecommendationInput): Recommendation[] {
  const adopted = new Set<string>(input.adoptedKeys)

  // First occurrence wins, so a caller that hands the same standard twice still
  // gets one deterministic lift rather than whichever row the map saw last.
  const gapsByStandardId = new Map<string, ImprovementGapInput>()
  for (const gap of input.gaps) {
    if (!gapsByStandardId.has(gap.standardId)) gapsByStandardId.set(gap.standardId, gap)
  }

  const ranked: Ranked[] = []

  for (const gap of input.gaps) {
    if (adopted.has(gap.standardId)) continue
    const score = normalizeRubricScore(gap.rubricScore)
    if (score === null || score < RUBRIC_MAX) ranked.push(rubricStep(gap))
    if (gap.evidenceGap) ranked.push(evidenceGap(gap))
  }

  for (const assurance of input.assurances) {
    if (assurance.satisfied) continue
    if (adopted.has(assurance.standardId)) continue
    ranked.push(assuranceGate(assurance))
  }

  for (const finding of input.findings) {
    // 'info' is a note, not work. It never becomes a recommendation.
    if (finding.severity === 'info') continue
    const findingKey = composeFindingKey(finding.ruleId, finding.scopeKey)
    if (adopted.has(findingKey)) continue
    ranked.push(findingWork(finding, findingKey, gapsByStandardId))
  }

  ranked.sort(compareRanked)
  const limit = input.limit ?? RECOMMENDATION_LIMIT
  return ranked.slice(0, Math.max(0, limit)).map((r) => r.rec)
}
