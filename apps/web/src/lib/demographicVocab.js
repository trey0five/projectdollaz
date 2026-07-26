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

// ── Phase 5 student-roster vocab (mirrors @finrep/analytics demographics.ts) ──
export const STUDENT_STATUS_KEYS = ['enrolled', 'waitlist', 'withdrawn', 'graduated']
export const STUDENT_STATUS_LABELS = {
  enrolled: 'Enrolled',
  waitlist: 'Waitlist',
  withdrawn: 'Withdrawn',
  graduated: 'Graduated',
}

export const STUDENT_FLAG_KEYS = ['iep', 'plan504', 'ell']
export const STUDENT_FLAG_LABELS = { iep: 'IEP', plan504: '504', ell: 'ELL' }

export const AGE_BAND_KEYS = ['under5', '5to10', '11to13', '14to18', '19plus', 'unknown']
export const AGE_BAND_LABELS = {
  under5: 'Under 5',
  '5to10': '5–10',
  '11to13': '11–13',
  '14to18': '14–18',
  '19plus': '19+',
  unknown: 'Unknown',
}

/** Pure, never throws. null/invalid birthDate → 'unknown'. Age at `asOf` (default now). */
export function ageBandFromBirthDate(birthDate, asOf) {
  const age = ageFromBirthDate(birthDate, asOf)
  if (age == null) return 'unknown'
  if (age < 5) return 'under5'
  if (age <= 10) return '5to10'
  if (age <= 13) return '11to13'
  if (age <= 18) return '14to18'
  return '19plus'
}

/** Whole-year age at `asOf` (default now), or null when birthDate is absent/invalid. */
export function ageFromBirthDate(birthDate, asOf) {
  if (!birthDate) return null
  const b = birthDate instanceof Date ? birthDate : new Date(String(birthDate).slice(0, 10) + 'T00:00:00Z')
  if (Number.isNaN(b.getTime())) return null
  const at = asOf instanceof Date && !Number.isNaN(asOf.getTime()) ? asOf : new Date()
  let age = at.getUTCFullYear() - b.getUTCFullYear()
  const m = at.getUTCMonth() - b.getUTCMonth()
  if (m < 0 || (m === 0 && at.getUTCDate() < b.getUTCDate())) age -= 1
  return age >= 0 && age < 130 ? age : null
}

/** FERPA min-cell display rule (CLIENT display-only — the API returns true counts):
 *  categorical breakdown cells between 1 and 4 render as '<5'. Never applied to
 *  headline KPI totals. */
export function formatMinCell(n) {
  const v = Number(n) || 0
  return v > 0 && v < 5 ? '<5' : String(v)
}

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
