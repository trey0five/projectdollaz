// ─────────────────────────────────────────────────────────────────────────────
// Accreditation Intelligence Phase A — PURE readiness-HISTORY math.
//
// The frozen readiness engine (accreditation-readiness.ts) answers "where are we
// NOW?". This module answers "what CHANGED, and why?" — and it is deliberately
// NOT a statistics module. Phase A reports an OBSERVED CHANGE between two
// recorded readings and an EXACT attribution of that change to four causes. It
// never extrapolates, never fits a line, and never reports a direction it cannot
// defend. When the history is too short, too sparse, or spans a comparability
// BREAK, the honest answer is `insufficient_history` with a human sentence — not
// a guessed number.
//
// THE FOUR-WAY DECOMPOSITION is the product. A readiness figure that rose 11
// points because the school finally SCORED eleven standards it had never scored
// is a completely different fact from one that rose 11 points because practice
// actually improved. Blending the two is the dishonesty this module exists to
// prevent, so every delta is split: scope → newly scored → score moved →
// evidence, in that FROZEN order, each step recomputing the frozen 0.7/0.3 mean
// so the parts telescope to the whole and the residual is 0 by construction.
//
// DETERMINISM CONTRACT: obeys the package PURITY GUARD — no Date, no clock, no
// I/O, no randomness. All time arrives as ISO yyyy-mm-dd strings and all date
// math runs through the shared civil-day helpers in ./review-status.js (one
// source of truth, no drift). Same inputs → same outputs on any host/timezone.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizeRubricScore, standardReadiness } from './accreditation-readiness.js'
import { daysFromCivil, toCivil } from './review-status.js'

export const READINESS_HISTORY_VERSION = '1.0.0'

/** Materiality floor for calling an observed change a direction (percentage points). */
export const MIN_MATERIAL_DELTA_PCT = 2
/** Minimum points and calendar span before ANY direction is reported. */
export const MIN_POINTS_FOR_DIRECTION = 3
export const MIN_SPAN_DAYS_FOR_DIRECTION = 30

/** One LEAF standard as a snapshot recorded it. */
export interface LeafScore {
  standardId: string
  code: string
  rubricScore: number | null // 1..4 | null
  evidenceCount: number
}

/** One recorded reading of a school's readiness for one series. */
export interface ReadinessPoint {
  date: string // yyyy-mm-dd
  readinessPct: number
  selfScoredPct: number
  verifiedPct: number
  projectedIndex: number | null
  band: string | null
  leafCount: number
  scoredCount: number
  coveredCount: number
}

export type SeriesBreakKind =
  | 'leaf_count_changed'
  | 'framework_changed'
  | 'engine_version_changed'
  | 'verified_definition_changed'

/** A point in the series across which readings are NOT comparable. */
export interface SeriesBreak {
  date: string
  kind: SeriesBreakKind
  detail: string
}

export type ChangeConfidence = 'insufficient_history' | 'observed_change'
export type ChangeDirection = 'improving' | 'declining' | 'flat' | 'insufficient_history'

export interface ObservedChange {
  available: boolean
  from: string | null
  to: string | null
  deltaPct: number | null
  direction: ChangeDirection
  confidence: ChangeConfidence
  /** Non-null whenever available === false. Rendered verbatim by the UI. */
  reason: string | null
}

export interface ReadinessDecomposition {
  total: number
  fromScopeChange: number
  fromScoring: number // previously UNSCORED leaves that now carry a score
  fromImprovement: number // leaves scored in BOTH snapshots whose score moved
  fromEvidence: number
  residual: number // always 0; asserted by spec
  narrative: string // "+11 points: +8 from newly scored standards, +3 from actual improvement."
}

export interface ReadinessDiff {
  improved: { standardId: string; code: string; fromScore: number; toScore: number }[]
  declined: { standardId: string; code: string; fromScore: number; toScore: number }[]
  newlyScored: { standardId: string; code: string; toScore: number }[]
  unscored: { standardId: string; code: string; fromScore: number }[]
  evidenceGained: { standardId: string; code: string; fromCount: number; toCount: number }[]
  evidenceLost: { standardId: string; code: string; fromCount: number; toCount: number }[]
  scopeAdded: { standardId: string; code: string }[]
  scopeRemoved: { standardId: string; code: string }[]
}

// ── Internals ────────────────────────────────────────────────────────────────

const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/** yyyy-mm-dd → "14 Aug 2026" (pure; falls back to the raw string if unparseable). */
function formatDay(iso: string): string {
  const c = toCivil(iso)
  if (c === null) return iso
  return `${c.d} ${MONTH_ABBR[c.m - 1]} ${c.y}`
}

/** yyyy-mm-dd → days since epoch, or null when unparseable. */
function dayNumber(iso: string): number | null {
  const c = toCivil(iso)
  if (c === null) return null
  return daysFromCivil(c.y, c.m, c.d)
}

/** The FROZEN per-leaf readiness (0..100), reused verbatim — never re-derived. */
function leafReadiness(l: LeafScore): number {
  return standardReadiness({ rubricScore: l.rubricScore, evidenceCount: l.evidenceCount })
}

/**
 * The frozen school readiness as a REAL number (mean of the per-leaf integers,
 * un-rounded). The engine's published figure is Math.round of exactly this, so
 * the attribution can work in real space and still land on the engine's integer.
 */
function readinessExact(leaves: readonly LeafScore[]): number {
  if (leaves.length === 0) return 0
  let sum = 0
  for (const l of leaves) sum += leafReadiness(l)
  return sum / leaves.length
}

/** The engine-identical integer readiness for a leaf set. */
function readinessInt(leaves: readonly LeafScore[]): number {
  return Math.round(readinessExact(leaves))
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

/**
 * Largest-remainder allocation: turn four real components into four integers
 * that sum EXACTLY to `total`. A component that is exactly zero is INELIGIBLE
 * for a remainder unit — a cause that demonstrably did not happen must never be
 * handed a point by a rounding artifact (that would be a fabricated attribution).
 * When every component is zero the total is zero too, so nothing is left over.
 */
function allocateLargestRemainder(values: readonly number[], total: number): number[] {
  const out = values.map((v) => Math.floor(v))
  let diff = total - out.reduce((a, b) => a + b, 0)
  if (diff === 0) return out

  const eligible = values
    .map((v, i) => ({ i, v, rem: v - Math.floor(v) }))
    .filter((e) => e.v !== 0)
  if (eligible.length === 0) return out

  const desc = [...eligible].sort((a, b) => b.rem - a.rem || a.i - b.i)
  const asc = [...eligible].sort((a, b) => a.rem - b.rem || a.i - b.i)
  let k = 0
  while (diff > 0) {
    out[desc[k % desc.length].i] += 1
    diff -= 1
    k += 1
  }
  let j = 0
  while (diff < 0) {
    out[asc[j % asc.length].i] -= 1
    diff += 1
    j += 1
  }
  return out
}

/** Copy a leaf with an overridden score/evidence — never mutates the input. */
function withState(leaf: LeafScore, rubricScore: number | null, evidenceCount: number): LeafScore {
  return {
    standardId: leaf.standardId,
    code: leaf.code,
    rubricScore,
    evidenceCount,
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * DOCUMENTED — the rubric-only component: mean over leaves of
 * 100 × (score − 1) / 3, an unscored leaf counting 0. This is the half of
 * readiness the school asserts about itself.
 */
export function selfScoredPct(leaves: readonly LeafScore[]): number {
  if (leaves.length === 0) return 0
  let sum = 0
  for (const l of leaves) {
    const score = normalizeRubricScore(l.rubricScore)
    sum += score === null ? 0 : (100 * (score - 1)) / 3
  }
  return Math.round(sum / leaves.length)
}

/**
 * DEFENSIBLE — the evidence-only component: 100 × coveredCount / leafCount,
 * 0 when there are no leaves. In Phase A "covered" means an artifact EXISTS;
 * currency of that artifact is Phase C and will emit a break when it lands.
 */
export function verifiedPct(leaves: readonly LeafScore[]): number {
  if (leaves.length === 0) return 0
  let covered = 0
  for (const l of leaves) if (l.evidenceCount > 0) covered += 1
  return Math.round((100 * covered) / leaves.length)
}

/**
 * EXACT four-way attribution of the change in readinessPct between two leaf sets.
 *
 * Order of application is FROZEN: scope → newly-scored → score-moved → evidence.
 * The four intermediate leaf sets telescope (S0 = from … S4 = to), each measured
 * with the frozen 0.7/0.3 mean over the TO-snapshot's leaf set, so the parts sum
 * to the total by construction and `residual` is always 0. `total` is the engine's
 * own integer delta, so the headline can never disagree with the register.
 */
export function decomposeReadinessDelta(
  from: readonly LeafScore[],
  to: readonly LeafScore[],
): ReadinessDecomposition {
  const fromById = new Map<string, LeafScore>()
  for (const l of from) fromById.set(l.standardId, l)

  // S1 — SCOPE applied: the TO leaf set carrying each leaf's FROM state. A leaf
  // that did not exist before enters at its honest floor (unscored, no evidence),
  // which is exactly why adopting standards moves readiness DOWN.
  const s1 = to.map((t) => {
    const prior = fromById.get(t.standardId)
    return prior
      ? withState(t, normalizeRubricScore(prior.rubricScore), prior.evidenceCount)
      : withState(t, null, 0)
  })

  // S2 — NEWLY SCORED: leaves that carried no score and now do.
  const s2 = s1.map((l, i) => {
    if (l.rubricScore !== null) return l
    const target = normalizeRubricScore(to[i].rubricScore)
    return target === null ? l : withState(l, target, l.evidenceCount)
  })

  // S3 — SCORE MOVED: every remaining rubric difference (up or down) on leaves
  // that were already scored in both snapshots.
  const s3 = s2.map((l, i) => withState(l, normalizeRubricScore(to[i].rubricScore), l.evidenceCount))

  // S4 — EVIDENCE: the TO snapshot in full.
  const s4 = to.map((t) => withState(t, normalizeRubricScore(t.rubricScore), t.evidenceCount))

  const rFrom = readinessExact(from)
  const r1 = readinessExact(s1)
  const r2 = readinessExact(s2)
  const r3 = readinessExact(s3)
  const r4 = readinessExact(s4)

  const total = readinessInt(to) - readinessInt(from)
  const parts = allocateLargestRemainder([r1 - rFrom, r2 - r1, r3 - r2, r4 - r3], total)
  const [fromScopeChange, fromScoring, fromImprovement, fromEvidence] = parts

  return {
    total,
    fromScopeChange,
    fromScoring,
    fromImprovement,
    fromEvidence,
    residual: total - (fromScopeChange + fromScoring + fromImprovement + fromEvidence),
    narrative: narrate(total, fromScopeChange, fromScoring, fromImprovement, fromEvidence),
  }
}

/** The one place the decomposition is put into words. Never says "improving" for
 *  points that came from newly scored standards — that is the whole point. */
function narrate(
  total: number,
  scope: number,
  scoring: number,
  improvement: number,
  evidence: number,
): string {
  const noun = Math.abs(total) === 1 ? 'point' : 'points'
  const clauses: string[] = []
  if (scope !== 0) {
    clauses.push(`${signed(scope)} from a change in which standards are in scope`)
  }
  if (scoring !== 0) {
    clauses.push(
      `${signed(scoring)} from ${scoring > 0 ? 'newly scored standards' : 'standards that lost their score'}`,
    )
  }
  if (improvement !== 0) {
    clauses.push(
      `${signed(improvement)} from ${improvement > 0 ? 'actual improvement' : 'scores that moved down'}`,
    )
  }
  if (evidence !== 0) {
    clauses.push(
      `${signed(evidence)} from ${evidence > 0 ? 'new evidence' : 'evidence no longer attached'}`,
    )
  }
  if (clauses.length === 0) return `No observed change: 0 ${noun}.`
  return `${signed(total)} ${noun}: ${clauses.join(', ')}.`
}

/**
 * Set-difference over standardId — the itemised "what actually moved" behind the
 * decomposition. Pure and order-stable (every list sorted by code asc, then
 * standardId asc so identical codes never reorder between calls).
 */
export function diffLeafScores(
  from: readonly LeafScore[],
  to: readonly LeafScore[],
): ReadinessDiff {
  const fromById = new Map<string, LeafScore>()
  for (const l of from) fromById.set(l.standardId, l)
  const toById = new Map<string, LeafScore>()
  for (const l of to) toById.set(l.standardId, l)

  const out: ReadinessDiff = {
    improved: [],
    declined: [],
    newlyScored: [],
    unscored: [],
    evidenceGained: [],
    evidenceLost: [],
    scopeAdded: [],
    scopeRemoved: [],
  }

  for (const t of to) {
    const prior = fromById.get(t.standardId)
    if (prior === undefined) {
      out.scopeAdded.push({ standardId: t.standardId, code: t.code })
      continue
    }
    const a = normalizeRubricScore(prior.rubricScore)
    const b = normalizeRubricScore(t.rubricScore)
    if (a === null && b !== null) {
      out.newlyScored.push({ standardId: t.standardId, code: t.code, toScore: b })
    } else if (a !== null && b === null) {
      out.unscored.push({ standardId: t.standardId, code: t.code, fromScore: a })
    } else if (a !== null && b !== null && b > a) {
      out.improved.push({ standardId: t.standardId, code: t.code, fromScore: a, toScore: b })
    } else if (a !== null && b !== null && b < a) {
      out.declined.push({ standardId: t.standardId, code: t.code, fromScore: a, toScore: b })
    }
    if (t.evidenceCount > prior.evidenceCount) {
      out.evidenceGained.push({
        standardId: t.standardId,
        code: t.code,
        fromCount: prior.evidenceCount,
        toCount: t.evidenceCount,
      })
    } else if (t.evidenceCount < prior.evidenceCount) {
      out.evidenceLost.push({
        standardId: t.standardId,
        code: t.code,
        fromCount: prior.evidenceCount,
        toCount: t.evidenceCount,
      })
    }
  }

  for (const f of from) {
    if (!toById.has(f.standardId)) {
      out.scopeRemoved.push({ standardId: f.standardId, code: f.code })
    }
  }

  const byCode = (x: { code: string; standardId: string }, y: { code: string; standardId: string }) =>
    x.code.localeCompare(y.code) || x.standardId.localeCompare(y.standardId)
  out.improved.sort(byCode)
  out.declined.sort(byCode)
  out.newlyScored.sort(byCode)
  out.unscored.sort(byCode)
  out.evidenceGained.sort(byCode)
  out.evidenceLost.sort(byCode)
  out.scopeAdded.sort(byCode)
  out.scopeRemoved.sort(byCode)
  return out
}

/**
 * Observed CHANGE between the first and last recorded reading — deliberately NOT
 * a statistical claim about direction over time. Returns `insufficient_history`
 * (with a sentence the UI prints verbatim) when there are fewer than
 * MIN_POINTS_FOR_DIRECTION readings, when they span less than
 * MIN_SPAN_DAYS_FOR_DIRECTION days, or when ANY comparability break falls between
 * the endpoints. A movement smaller than MIN_MATERIAL_DELTA_PCT is 'flat' — real,
 * reported, but not dressed up as a direction.
 */
export function summarizeObservedChange(
  points: readonly ReadinessPoint[],
  breaks: readonly SeriesBreak[],
): ObservedChange {
  const blocked = (reason: string): ObservedChange => ({
    available: false,
    from: null,
    to: null,
    deltaPct: null,
    direction: 'insufficient_history',
    confidence: 'insufficient_history',
    reason,
  })

  if (points.length === 0) {
    return blocked('Readiness has not been recorded yet — tracking starts with the first reading.')
  }

  const ordered = [...points].sort((a, b) => a.date.localeCompare(b.date))
  const first = ordered[0]
  const last = ordered[ordered.length - 1]
  const tooShort = `Tracking started on ${formatDay(first.date)} — we need at least ${MIN_POINTS_FOR_DIRECTION} readings over ${MIN_SPAN_DAYS_FOR_DIRECTION} days before reporting a direction.`

  if (ordered.length < MIN_POINTS_FOR_DIRECTION) return blocked(tooShort)

  const firstDay = dayNumber(first.date)
  const lastDay = dayNumber(last.date)
  if (firstDay === null || lastDay === null) return blocked(tooShort)
  if (lastDay - firstDay < MIN_SPAN_DAYS_FOR_DIRECTION) return blocked(tooShort)

  // A break anywhere inside the window makes the endpoints incomparable. We say
  // WHICH break, so the reader can see it is a definition change, not a decline.
  for (const b of breaks) {
    const d = dayNumber(b.date)
    if (d === null || d < firstDay || d > lastDay) continue
    const detail = b.detail.replace(/\.\s*$/, '')
    return blocked(
      `${detail} on ${formatDay(b.date)} — readings before and after that date are not comparable.`,
    )
  }

  const deltaPct = last.readinessPct - first.readinessPct
  const direction: ChangeDirection =
    Math.abs(deltaPct) < MIN_MATERIAL_DELTA_PCT ? 'flat' : deltaPct > 0 ? 'improving' : 'declining'

  return {
    available: true,
    from: first.date,
    to: last.date,
    deltaPct,
    direction,
    confidence: 'observed_change',
    reason: null,
  }
}

/**
 * Month-end downsample for granularity='month': the LAST recorded reading of each
 * calendar month, in ascending date order. Never interpolates a month with no
 * reading — a gap in the record stays a gap.
 */
export function downsampleMonthly(points: readonly ReadinessPoint[]): ReadinessPoint[] {
  const ordered = [...points].sort((a, b) => a.date.localeCompare(b.date))
  const lastOfMonth = new Map<string, ReadinessPoint>()
  for (const p of ordered) {
    const c = toCivil(p.date)
    if (c === null) continue
    lastOfMonth.set(`${c.y}-${c.m}`, p)
  }
  return [...lastOfMonth.values()].sort((a, b) => a.date.localeCompare(b.date))
}
