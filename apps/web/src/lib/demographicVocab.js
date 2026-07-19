// ─────────────────────────────────────────────────────────────────────────────
// demographicVocab — the browser-side MIRROR of the frozen
// `@finrep/analytics/demographics` contract (canonical demographic vocab +
// share/diversity math). Kept web-local, following the ByGradeChart precedent
// ("Kept local so the web bundle never imports the analytics package just for a
// label list"), so the web app builds independently of the analytics package
// landing its `demographics.ts` export. The KEYS + verbose LABELS + the pure
// share/diversity math here are byte-identical to the canonical shape the API
// stamps into `byDemographics`:
//   { gender:{female,male,unknown},
//     ethnicity:{hispanic,nonHispanic},
//     race:{asian,black,hispanicLatino,mena,nhpi,twoOrMore,white} }
// The math is intentionally trivial + non-financial (no metric formula/band —
// those stay in @finrep/analytics). Pure/total/never-throws.
// ─────────────────────────────────────────────────────────────────────────────

export const GENDER_KEYS = ['female', 'male', 'unknown']
export const GENDER_LABELS = { female: 'Female', male: 'Male', unknown: 'Unknown' }

export const ETHNICITY_KEYS = ['hispanic', 'nonHispanic']
export const ETHNICITY_LABELS = { hispanic: 'Hispanic', nonHispanic: 'Non-Hispanic' }

export const RACE_KEYS = ['asian', 'black', 'hispanicLatino', 'mena', 'nhpi', 'twoOrMore', 'white']
export const RACE_LABELS = {
  asian: 'Asian',
  black: 'Black/African American',
  hispanicLatino: 'Hispanic or Latino',
  mena: 'Middle Eastern/North African',
  nhpi: 'Native Hawaiian/Pacific Islander',
  twoOrMore: 'Two or more races',
  white: 'White',
}

// The canonical enrollment grid order (mirrors @finrep/analytics GRADE_KEYS).
export const GRADE_KEYS = ['PK3', 'PK4', 'K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** counts → { key: share 0..1 }. Zero-sum → all zeros (never NaN). */
export function toShares(counts) {
  const entries = Object.entries(counts || {})
  const total = entries.reduce((s, [, v]) => s + num(v), 0)
  const out = {}
  for (const [k, v] of entries) out[k] = total > 0 ? num(v) / total : 0
  return out
}

/** Blau/Simpson diversity index over race counts: 1 − Σ p². 0 (uniform) → 1 (even). */
export function diversityIndex(raceCounts) {
  const shares = toShares(raceCounts)
  const sumSq = Object.values(shares).reduce((s, p) => s + p * p, 0)
  const idx = 1 - sumSq
  return idx > 0 ? idx : 0
}

/** byGrade counts → { GradeKey: share 0..1 } over the canonical grid. */
export function gradeMixShares(byGrade) {
  const counts = {}
  for (const g of GRADE_KEYS) counts[g] = num(byGrade?.[g])
  return toShares(counts)
}
