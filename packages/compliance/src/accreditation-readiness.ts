// ─────────────────────────────────────────────────────────────────────────────
// Accreditation Phase 3 — PURE rubric-readiness engine. Layered ON TOP of the
// binary evidence coverage (accreditation-coverage.ts, untouched sibling): each
// LEAF standard now carries an optional accreditor SELF-SCORE 1..4 (the Cognia
// rubric shape; MSA/NSBECS reuse the same 4-point scale with their own labels),
// and readiness blends that rubric progress (70%) with binary evidence coverage
// (30%). Cognia additionally projects an IEQ-style INDEX 100–400 (≈ mean score ×
// 100) with status bands; MSA/NSBECS have no index (indexMax null → index/band
// math returns null, readiness + gaps still work).
//
// DETERMINISM CONTRACT: obeys the package PURITY GUARD — no Date, no clock, no
// I/O, no randomness. Same inputs → same outputs on any host/timezone.
// ─────────────────────────────────────────────────────────────────────────────

export const RUBRIC_MIN = 1
export const RUBRIC_MAX = 4
/** Readiness blend: 70% rubric progress + 30% binary evidence coverage. */
export const RUBRIC_WEIGHT = 0.7
export const EVIDENCE_WEIGHT = 0.3

/**
 * The CLOSED evidence-tag vocabulary carried by catalog standards (seed-only —
 * never client-supplied). Drives the deterministic artifact-suggestion matcher.
 */
export const EVIDENCE_TAGS = [
  'governance',
  'board_minutes',
  'policy_manual',
  'financial_audit',
  'budget',
  'strategic_plan',
  'enrollment_data',
  'staff_credentials',
  'safety_plan',
  'survey',
  'fiscal_resources',
  'marketing',
] as const
export type EvidenceTag = (typeof EVIDENCE_TAGS)[number]

/** One index→status band: the label applies from `min` up to the next band's min. */
export interface StatusBand {
  min: number
  label: string
}

/** The framework facts the index math needs (null indexMax = no index scale). */
export interface ReadinessFrameworkInput {
  indexMin: number | null
  indexMax: number | null
  statusBands: readonly StatusBand[]
}

/** One NON-assurance LEAF standard as the engine sees it. */
export interface ReadinessLeafInput {
  standardId: string
  code: string
  title: string
  /** 1..4 self-score; null = unscored (treated as rubric progress 0 / index floor 1). */
  rubricScore: number | null
  evidenceCount: number
}

export interface SchoolReadiness {
  /** 0..100 mean of per-leaf standardReadiness; 0 when no leaves. */
  readinessPct: number
  leafCount: number
  /** Leaves with a non-null rubricScore. */
  scoredCount: number
  /** Leaves with ≥1 evidence. */
  coveredCount: number
  /** Cognia-style projected index (clamped to [indexMin,indexMax]); null = no index scale. */
  projectedIndex: number | null
  /** Status-band label at projectedIndex; null when projectedIndex is null. */
  band: string | null
  /**
   * True when projectedIndex sits BELOW the lowest status band — in which case
   * `band` carries the BELOW_THRESHOLD_LABEL sentinel, which is a floor
   * statement and NOT an accreditor-awarded band. Callers deciding "did we land
   * in a band?" must consult this flag, never string-compare the label.
   * False whenever band is null (no index scale — there is no floor to be below).
   */
  belowThreshold: boolean
}

export interface ReadinessGap {
  standardId: string
  code: string
  title: string
  rubricScore: number | null
  /** This leaf's standardReadiness 0..100. */
  readiness: number
  /** True when the leaf has NO evidence. */
  evidenceGap: boolean
  /** Index points gained by +1 rubric level (null in no-index mode / already at max). */
  nextStepLift: number | null
  /** Index points gained by lifting this leaf to 4 (null in no-index mode). */
  fullLift: number | null
}

export interface TargetGap {
  /** max(0, targetIndex - projectedIndex). */
  pointGap: number
  /** Minimum number of +1 rubric steps (across any leaves) to reach the target. */
  stepsToTarget: number
}

export interface AssuranceLeafInput {
  standardId: string
  code: string
  title: string
  evidenceCount: number
}

export interface AssuranceStatus {
  standardId: string
  code: string
  title: string
  satisfied: boolean
}

/** Round to 1 decimal (index-point lifts). */
function round1(x: number): number {
  return Math.round(x * 10) / 10
}

/** Coerce any stored value into the valid score domain; out-of-range → null. */
export function normalizeRubricScore(score: number | null | undefined): number | null {
  if (score == null) return null
  if (!Number.isInteger(score) || score < RUBRIC_MIN || score > RUBRIC_MAX) return null
  return score
}

/**
 * Per-standard readiness 0..100: 70% rubric progress ((score-1)/3 — Insufficient
 * = 0 progress) + 30% binary evidence. Unscored-but-evidenced = 30 → an honest
 * "score it" nudge, never false confidence.
 */
export function standardReadiness(input: {
  rubricScore: number | null
  evidenceCount: number
}): number {
  const score = normalizeRubricScore(input.rubricScore)
  const rubricPart = score == null ? 0 : (score - RUBRIC_MIN) / (RUBRIC_MAX - RUBRIC_MIN)
  const evidencePart = input.evidenceCount > 0 ? 1 : 0
  return Math.round(100 * (RUBRIC_WEIGHT * rubricPart + EVIDENCE_WEIGHT * evidencePart))
}

/**
 * Status-band label for an index: the HIGHEST band whose min <= index, else the
 * below-threshold label. Bands need not be pre-sorted.
 */
export const BELOW_THRESHOLD_LABEL = 'Below accreditation threshold'
export function bandForIndex(statusBands: readonly StatusBand[], index: number): string {
  let best: StatusBand | null = null
  for (const b of statusBands) {
    if (b.min <= index && (best === null || b.min > best.min)) best = b
  }
  return best ? best.label : BELOW_THRESHOLD_LABEL
}

/**
 * School-wide rollup over the NON-assurance leaves. projectedIndex = clamped
 * round(mean(rubricScore ?? 1) × 100) — an unscored leaf counts as 1
 * ("Insufficient until shown otherwise", the honest floor); null when the
 * framework has no index scale or there are no leaves.
 */
export function schoolReadiness(
  leaves: readonly ReadinessLeafInput[],
  framework?: ReadinessFrameworkInput | null,
): SchoolReadiness {
  const leafCount = leaves.length
  let readinessSum = 0
  let scoredCount = 0
  let coveredCount = 0
  let scoreSum = 0
  for (const l of leaves) {
    const score = normalizeRubricScore(l.rubricScore)
    readinessSum += standardReadiness(l)
    if (score != null) scoredCount += 1
    if (l.evidenceCount > 0) coveredCount += 1
    scoreSum += score ?? RUBRIC_MIN
  }
  const readinessPct = leafCount === 0 ? 0 : Math.round(readinessSum / leafCount)

  let projectedIndex: number | null = null
  let band: string | null = null
  let belowThreshold = false
  if (framework && framework.indexMax != null && leafCount > 0) {
    const raw = Math.round((scoreSum / leafCount) * 100)
    const lo = framework.indexMin ?? raw
    const hi = framework.indexMax
    projectedIndex = Math.min(hi, Math.max(lo, raw))
    band = bandForIndex(framework.statusBands, projectedIndex)
    // The engine's own floor fact (B1): below every band, bandForIndex returns
    // the BELOW_THRESHOLD_LABEL sentinel — derived here from the bands
    // themselves so no caller ever has to string-compare the label.
    belowThreshold = !framework.statusBands.some((b) => b.min <= (projectedIndex as number))
  }
  return { readinessPct, leafCount, scoredCount, coveredCount, projectedIndex, band, belowThreshold }
}

/**
 * Ranked improvement gaps over the NON-assurance leaves. A leaf is a gap
 * candidate unless it is fully done (score 4 AND evidenced). INDEX MODE
 * (hasIndex=true): nextStepLift = 100/leafCount index points per +1 rubric
 * level, fullLift = (4 - (score ?? 1)) × 100/leafCount; sorted fullLift desc →
 * evidenceGap first → code asc. NO-INDEX MODE: lifts are null; sorted
 * (score ?? 1) asc → evidenceGap first → code asc. Top `limit` (default 8).
 */
export function computeGaps(
  leaves: readonly ReadinessLeafInput[],
  hasIndex: boolean,
  limit = 8,
): ReadinessGap[] {
  const leafCount = leaves.length
  if (leafCount === 0) return []
  const perStep = 100 / leafCount
  const gaps: ReadinessGap[] = []
  for (const l of leaves) {
    const score = normalizeRubricScore(l.rubricScore)
    const evidenceGap = l.evidenceCount === 0
    if (score === RUBRIC_MAX && !evidenceGap) continue // fully done — not a gap
    const effective = score ?? RUBRIC_MIN
    const fullLift = hasIndex ? round1((RUBRIC_MAX - effective) * perStep) : null
    const nextStepLift = hasIndex ? (effective >= RUBRIC_MAX ? 0 : round1(perStep)) : null
    gaps.push({
      standardId: l.standardId,
      code: l.code,
      title: l.title,
      rubricScore: score,
      readiness: standardReadiness(l),
      evidenceGap,
      nextStepLift,
      fullLift,
    })
  }
  gaps.sort((a, b) => {
    if (hasIndex) {
      const f = (b.fullLift ?? 0) - (a.fullLift ?? 0)
      if (f !== 0) return f
    } else {
      const s = (a.rubricScore ?? RUBRIC_MIN) - (b.rubricScore ?? RUBRIC_MIN)
      if (s !== 0) return s
    }
    const e = (b.evidenceGap ? 1 : 0) - (a.evidenceGap ? 1 : 0)
    if (e !== 0) return e
    return a.code.localeCompare(b.code)
  })
  return gaps.slice(0, limit)
}

/**
 * Distance to a target index. stepsToTarget = min(ceil(pointGap × leafCount /
 * 100), total available +1 rubric steps) — each +1 step on any leaf lifts the
 * index by 100/leafCount points.
 */
export function computeTargetGap(
  leaves: readonly ReadinessLeafInput[],
  projectedIndex: number,
  targetIndex: number,
): TargetGap {
  const leafCount = leaves.length
  const pointGap = Math.max(0, targetIndex - projectedIndex)
  let availableSteps = 0
  for (const l of leaves) {
    availableSteps += RUBRIC_MAX - (normalizeRubricScore(l.rubricScore) ?? RUBRIC_MIN)
  }
  const stepsToTarget =
    leafCount === 0 ? 0 : Math.min(Math.ceil((pointGap * leafCount) / 100), availableSteps)
  return { pointGap, stepsToTarget }
}

// ── WS3 F4 — projected-tier polish (pure additions; nothing above changes) ──

export interface NextBandGap {
  /** The NEXT band up's label ("Accredited with Merit"). */
  label: string
  /** That band's floor on the index scale. */
  min: number
  /** Points between the projected index and that floor (always ≥ 1). */
  pointGap: number
}

/**
 * The band ABOVE the projected index, or null at the top band / off the scale.
 * Bands need not be pre-sorted (bandForIndex's own discipline).
 */
export function nextBandGap(
  statusBands: readonly StatusBand[],
  projectedIndex: number,
): NextBandGap | null {
  let next: StatusBand | null = null
  for (const b of statusBands) {
    if (b.min > projectedIndex && (next === null || b.min < next.min)) next = b
  }
  if (next === null) return null
  return { label: next.label, min: next.min, pointGap: next.min - projectedIndex }
}

/**
 * Index points contributed ABOVE the floor by leaves that carry a rubric score
 * but NO evidence — the "review-day risk" number: a reviewer discounts a score
 * nothing backs. An UNSCORED leaf contributes 0 (it already sits at the honest
 * floor of 1), so this can never exceed the projected index's own lift.
 * Returns null when the framework has no index scale or there are no leaves.
 */
export function unbackedIndexPoints(
  leaves: readonly ReadinessLeafInput[],
  hasIndex: boolean,
): number | null {
  if (!hasIndex || leaves.length === 0) return null
  const perStep = 100 / leaves.length
  let points = 0
  for (const l of leaves) {
    const score = normalizeRubricScore(l.rubricScore)
    if (score === null || l.evidenceCount > 0) continue
    points += (score - RUBRIC_MIN) * perStep
  }
  return Math.round(points)
}

/** Binary assurance gates: satisfied = the leaf has ≥1 evidence artifact. */
export function computeAssurances(
  assuranceLeaves: readonly AssuranceLeafInput[],
): AssuranceStatus[] {
  return assuranceLeaves.map((l) => ({
    standardId: l.standardId,
    code: l.code,
    title: l.title,
    satisfied: l.evidenceCount > 0,
  }))
}
