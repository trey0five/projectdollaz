// ─────────────────────────────────────────────────────────────────────────────
// Accreditation Intelligence Phase C — PURE commendations.
//
// Every other surface in this product tells a school what is wrong. This one
// tells them what they can DEFEND — and it is deliberately hard to qualify for.
// A commendation requires all THREE, no exceptions:
//
//   1. a strong self-score (rubric ≥ 3),
//   2. at least one required artifact that is CURRENT (not expiring, not
//      undated, not "tracked in your portal"), and
//   3. at least one bound operating figure that is both AVAILABLE and FAVORABLE.
//
// Two of the three is not a strength we can defend in front of a visiting team;
// it is a claim plus a folder. ZERO COMMENDATIONS IS A LEGITIMATE AND COMMON
// ANSWER, and the panel says so with the exclusion counts rather than padding a
// list or showing an empty box.
//
// Mirrors computeGaps: deterministic, ranked, no clock, no formatting, no LLM.
// Every numeral in the narrative is traceable to an input.
//
// DETERMINISM CONTRACT: obeys the package PURITY GUARD — no clock, no I/O, no
// randomness, no React/DOM. Inputs are never mutated.
// ─────────────────────────────────────────────────────────────────────────────

import { RUBRIC_MAX, normalizeRubricScore } from './accreditation-readiness.js'
import type { RequirementCurrency } from './evidence-currency.js'

export const COMMENDATIONS_VERSION = '1.0.0'
/** "Improving" on the Cognia scale — the floor for a claim we would put in writing. */
export const COMMENDATION_MIN_RUBRIC = 3
export const COMMENDATION_LIMIT = 5

export interface CommendationLeafInput {
  standardId: string
  code: string
  title: string
  rubricScore: number | null
  evidenceCount: number
}

/** A bound signal as the SIGNAL PANEL already computes it (server-formatted). */
export interface CommendationSignalInput {
  key: string
  label: string
  standardIds: readonly string[]
  available: boolean
  status: 'good' | 'watch' | 'risk' | 'neutral'
  formattedValue: string | null
  asOf: string | null
}

export interface Commendation {
  standardId: string
  code: string
  title: string
  rubricScore: number
  rubricLabel: string | null
  /** CURRENT artifacts only — `expiring` and `unknown` do not qualify. */
  evidence: { tag: string; label: string; expiresOn: string | null }[]
  signals: { key: string; label: string; formattedValue: string | null; asOf: string | null }[]
  /** Ranking key. NEVER rendered, NEVER a percentage. */
  strength: number
  /** One deterministic sentence, rendered VERBATIM. */
  narrative: string
}

export interface CommendationExclusions {
  eligible: number
  noScore: number
  lowScore: number
  /**
   * WE NEVER ASKED FOR AN ARTIFACT HERE. The requirement table is deliberately
   * sparse, so most leaves carry no artifact list at all. Counting those as "no
   * current evidence" would manufacture a gap out of a hole we chose not to dig
   * — the exact conflation `dataAvailability` exists to prevent everywhere else.
   */
  noRequirements: number
  noCurrentEvidence: number
  noFavorableSignal: number
}

export interface CommendationOptions {
  limit?: number
  minRubric?: number
  /** array[4]: index i = the framework's label for score i+1. */
  rubricLabels?: readonly string[]
}

type CurrencyByStandard = Readonly<Record<string, readonly RequirementCurrency[]>>

/** The single place the three conditions are evaluated, so counts and list agree. */
interface Verdict {
  outcome:
    | 'eligible'
    | 'noScore'
    | 'lowScore'
    | 'noRequirements'
    | 'noCurrentEvidence'
    | 'noFavorableSignal'
  score: number
  currentEvidence: { tag: string; label: string; expiresOn: string | null }[]
  goodSignals: { key: string; label: string; formattedValue: string | null; asOf: string | null }[]
}

function judge(
  leaf: CommendationLeafInput,
  currencyByStandard: CurrencyByStandard,
  signals: readonly CommendationSignalInput[],
  minRubric: number,
): Verdict {
  const empty = { currentEvidence: [], goodSignals: [] }
  const score = normalizeRubricScore(leaf.rubricScore)
  if (score === null) return { outcome: 'noScore', score: 0, ...empty }
  if (score < minRubric) return { outcome: 'lowScore', score, ...empty }

  // NO ARTIFACT LIST AT ALL is its own answer, counted before the evidence test:
  // this standard was never asked for anything, so it has not failed anything.
  const asked = currencyByStandard[leaf.standardId] ?? []
  if (asked.length === 0) return { outcome: 'noRequirements', score, ...empty }

  // ONLY `current`. An artifact that expires next month is not a strength we
  // would put in front of a visiting team, and an undated one is not a claim we
  // can make at all.
  const currentEvidence = asked
    .filter((c) => c.state === 'current')
    .map((c) => ({ tag: c.tag, label: c.label, expiresOn: c.expiresOn }))
    .sort((a, b) => a.tag.localeCompare(b.tag) || a.label.localeCompare(b.label))
  if (currentEvidence.length === 0) return { outcome: 'noCurrentEvidence', score, ...empty }

  const goodSignals = signals
    .filter((s) => s.available && s.status === 'good' && s.standardIds.includes(leaf.standardId))
    .map((s) => ({ key: s.key, label: s.label, formattedValue: s.formattedValue, asOf: s.asOf }))
    .sort((a, b) => a.key.localeCompare(b.key))
  if (goodSignals.length === 0) {
    return { outcome: 'noFavorableSignal', score, currentEvidence, goodSignals: [] }
  }

  return { outcome: 'eligible', score, currentEvidence, goodSignals }
}

/**
 * The FROZEN narrative template. No LLM, no adjectives we cannot defend, and
 * every numeral traceable to an input. The parenthetical is omitted entirely
 * when the leading signal has no formatted value — we name the figure or we say
 * nothing about it — and it drops the "as of" clause rather than printing a
 * missing date, because a date we do not have is never rendered as one.
 */
function narrate(
  leaf: CommendationLeafInput,
  score: number,
  rubricLabel: string | null,
  evidence: Verdict['currentEvidence'],
  signals: Verdict['goodSignals'],
): string {
  const n = evidence.length
  const m = signals.length
  const s0 = signals[0]
  const parenthetical =
    s0 && s0.formattedValue != null
      ? s0.asOf != null
        ? ` (${s0.label} ${s0.formattedValue} as of ${s0.asOf})`
        : ` (${s0.label} ${s0.formattedValue})`
      : ''
  return (
    `${leaf.code} — ${leaf.title}: scored ${rubricLabel ?? score} of ${RUBRIC_MAX}, ` +
    `backed by ${n} current artifact${n === 1 ? '' : 's'} and ` +
    `${m} favorable operating figure${m === 1 ? '' : 's'}${parenthetical}.`
  )
}

/**
 * Ranked commendations. FROZEN ordering:
 *
 *   strength = rubricScore × 100 + min(currentEvidence, 3) × 10 + min(goodSignals, 3)
 *   sort: strength desc → code asc ; slice(limit)
 *
 * `evidence[]` and `signals[]` are sorted (tag asc / key asc) so two identical
 * calls stringify identically.
 */
export function computeCommendations(
  leaves: readonly CommendationLeafInput[],
  currencyByStandard: CurrencyByStandard,
  signals: readonly CommendationSignalInput[],
  opts: CommendationOptions = {},
): Commendation[] {
  const limit = opts.limit ?? COMMENDATION_LIMIT
  const minRubric = opts.minRubric ?? COMMENDATION_MIN_RUBRIC
  const labels = opts.rubricLabels ?? null

  const out: Commendation[] = []
  for (const leaf of leaves) {
    const v = judge(leaf, currencyByStandard, signals, minRubric)
    if (v.outcome !== 'eligible') continue
    const rubricLabel = labels ? (labels[v.score - 1] ?? null) : null
    out.push({
      standardId: leaf.standardId,
      code: leaf.code,
      title: leaf.title,
      rubricScore: v.score,
      rubricLabel,
      evidence: v.currentEvidence,
      signals: v.goodSignals,
      strength:
        v.score * 100 + Math.min(v.currentEvidence.length, 3) * 10 + Math.min(v.goodSignals.length, 3),
      narrative: narrate(leaf, v.score, rubricLabel, v.currentEvidence, v.goodSignals),
    })
  }
  out.sort((a, b) => b.strength - a.strength || a.code.localeCompare(b.code))
  return out.slice(0, Math.max(0, limit))
}

/**
 * WHY the list is as short as it is. Each leaf is counted EXACTLY ONCE, at the
 * first condition it fails, so the five numbers sum to the leaf count and the
 * panel can explain itself instead of showing an empty box.
 */
export function computeCommendationExclusions(
  leaves: readonly CommendationLeafInput[],
  currencyByStandard: CurrencyByStandard,
  signals: readonly CommendationSignalInput[],
  opts: CommendationOptions = {},
): CommendationExclusions {
  const minRubric = opts.minRubric ?? COMMENDATION_MIN_RUBRIC
  const out: CommendationExclusions = {
    eligible: 0,
    noScore: 0,
    lowScore: 0,
    noRequirements: 0,
    noCurrentEvidence: 0,
    noFavorableSignal: 0,
  }
  for (const leaf of leaves) {
    out[judge(leaf, currencyByStandard, signals, minRubric).outcome] += 1
  }
  return out
}
