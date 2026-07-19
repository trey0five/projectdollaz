// ─────────────────────────────────────────────────────────────────────────────
// @finrep/analytics — canonical demographic vocabulary + share/diversity math.
//
// PURE, TOTAL, NEVER-THROWS. The ONE source of truth for the aggregate-enrollment
// demographic breakdown (gender / ethnicity / race), the verbose→canonical label
// map, and the share + Blau/Simpson diversity math. Lives in the semantic-layer
// package (moat rule: never inline a vocab/formula in a component or the API) so
// the diocesan PARSER (server), the enrollment SNAPSHOT persist (API), the peer
// COMPARISON (API), and the demographic-mix CARDS (web) all read the same frozen
// exports. Aggregate counts only — no student-level PII, by design.
// ─────────────────────────────────────────────────────────────────────────────
import { GRADE_KEYS, type GradeKey } from './driver.js'

// ── Canonical keys ────────────────────────────────────────────────────────────

export const GENDER_KEYS = ['female', 'male', 'unknown'] as const
export type GenderKey = (typeof GENDER_KEYS)[number]

export const ETHNICITY_KEYS = ['hispanic', 'nonHispanic'] as const
export type EthnicityKey = (typeof ETHNICITY_KEYS)[number]

/** US federal race categories (aggregate). `mena` = Middle Eastern/North African;
 *  `nhpi` = Native Hawaiian/Pacific Islander; `hispanicLatino` is the RACE code
 *  (distinct from the `hispanic` ETHNICITY key). */
export const RACE_KEYS = [
  'asian',
  'black',
  'hispanicLatino',
  'mena',
  'nhpi',
  'twoOrMore',
  'white',
] as const
export type RaceKey = (typeof RACE_KEYS)[number]

/** The three demographic dimensions a breakdown carries. */
export type DemographicDimension = 'gender' | 'ethnicity' | 'race'

// ── Display labels ────────────────────────────────────────────────────────────

export const GENDER_LABELS: Record<GenderKey, string> = {
  female: 'Female',
  male: 'Male',
  unknown: 'Unknown',
}

export const ETHNICITY_LABELS: Record<EthnicityKey, string> = {
  hispanic: 'Hispanic',
  nonHispanic: 'Non-Hispanic',
}

export const RACE_LABELS: Record<RaceKey, string> = {
  asian: 'Asian',
  black: 'Black/African American',
  hispanicLatino: 'Hispanic or Latino',
  mena: 'Middle Eastern/North African',
  nhpi: 'Native Hawaiian/Pacific Islander',
  twoOrMore: 'Two or more races',
  white: 'White',
}

/** The canonical breakdown shape persisted to EnrollmentSnapshot.byDemographics. */
export interface DemographicBreakdown {
  gender?: Partial<Record<GenderKey, number>>
  ethnicity?: Partial<Record<EthnicityKey, number>>
  race?: Partial<Record<RaceKey, number>>
}

/** A resolved demographic cell: which dimension + which key a source label maps to. */
export interface DemographicHit {
  dim: DemographicDimension
  key: GenderKey | EthnicityKey | RaceKey
}

// ── Label → canonical key resolution ──────────────────────────────────────────

/** lowercase, strip punctuation → single-spaced token string (for label matching). */
function canon(label: string | null | undefined): string {
  return String(label ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Map a verbose source label ("Black/African American", "Native Hawaiian/Pacific
 * Islander", "Middle Eastern/North African", "Two or more races", "Non-Hispanic")
 * to its canonical { dim, key }. Returns null for an unknown label (parser degrades
 * it to a warning). RACE is checked so its "Hispanic or Latino" resolves to the race
 * key, while a bare "Hispanic" resolves to the ETHNICITY key.
 */
export function demographicKeyFromLabel(label: string | null | undefined): DemographicHit | null {
  const s = canon(label)
  if (!s) return null

  // Gender
  if (/^(female|f|girls?|women)$/.test(s)) return { dim: 'gender', key: 'female' }
  if (/^(male|m|boys?|men)$/.test(s)) return { dim: 'gender', key: 'male' }

  // Ethnicity (bare Hispanic / Non-Hispanic — NOT the race "Hispanic or Latino").
  if (/^non\s*hispanic( non\s*latino)?$/.test(s) || s === 'not hispanic') {
    return { dim: 'ethnicity', key: 'nonHispanic' }
  }
  if (s === 'hispanic') {
    return { dim: 'ethnicity', key: 'hispanic' }
  }

  // Race
  if (/asian/.test(s)) return { dim: 'race', key: 'asian' }
  if (/black|african american/.test(s)) return { dim: 'race', key: 'black' }
  if (/hispanic or latino|latino|latinx|latine/.test(s)) return { dim: 'race', key: 'hispanicLatino' }
  if (/middle eastern|north african|\bmena\b/.test(s)) return { dim: 'race', key: 'mena' }
  if (/native hawaiian|pacific islander|\bnhpi\b/.test(s)) return { dim: 'race', key: 'nhpi' }
  if (/two or more|multiracial|multi racial|two races/.test(s)) return { dim: 'race', key: 'twoOrMore' }
  if (/american indian|alaska native|\baian\b/.test(s)) return { dim: 'race', key: 'twoOrMore' }
  if (/^white$|caucasian/.test(s)) return { dim: 'race', key: 'white' }

  // A bare "hispanic" that also reads as latino falls to the ethnicity default.
  if (/^hispanic/.test(s)) return { dim: 'ethnicity', key: 'hispanic' }
  return null
}

// ── Share + diversity math ────────────────────────────────────────────────────

/**
 * Normalize a count map to shares in [0,1] summing to ~1 (0 for every key when the
 * total is 0). Negative / non-finite counts are treated as 0. Pure; key set is the
 * caller's key set (never re-ordered).
 */
export function toShares<K extends string>(counts: Partial<Record<K, number>> | null | undefined): Record<K, number> {
  const out = {} as Record<K, number>
  const entries = Object.entries(counts ?? {}) as [K, unknown][]
  let total = 0
  for (const [, v] of entries) {
    const n = Number(v)
    if (Number.isFinite(n) && n > 0) total += n
  }
  for (const [k, v] of entries) {
    const n = Number(v)
    out[k] = total > 0 && Number.isFinite(n) && n > 0 ? n / total : 0
  }
  return out
}

/**
 * Blau / Simpson diversity index over a race (or any) count map: 1 − Σ pᵢ².
 * 0 when all members are one category (or the map is empty/zero); approaches 1 as
 * the mix evens out across more categories. Pure, never throws.
 */
export function diversityIndex(counts: Partial<Record<string, number>> | null | undefined): number {
  const shares = Object.values(toShares(counts ?? {}))
  const sumSq = shares.reduce((s, p) => s + p * p, 0)
  if (sumSq === 0) return 0
  const idx = 1 - sumSq
  // Clamp tiny FP drift.
  return idx < 0 ? 0 : idx > 1 ? 1 : idx
}

/** Grade-mix shares over the canonical GRADE_KEYS present in a byGrade map. */
export function gradeMixShares(
  byGrade: Partial<Record<GradeKey, number>> | null | undefined,
): Partial<Record<GradeKey, number>> {
  const filtered: Partial<Record<GradeKey, number>> = {}
  for (const g of GRADE_KEYS) {
    const n = Number((byGrade ?? {})[g])
    if (Number.isFinite(n) && n > 0) filtered[g] = n
  }
  return toShares(filtered)
}
