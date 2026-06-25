// ─────────────────────────────────────────────────────────────────────────────
// Driver Model — web-side metadata + state helpers (NO math).
//
// The MATH and the contract SHAPE are the single source of truth in
// @finrep/analytics (computeDriverBudget / defaultAssumptions /
// toDriverPriorContext). This module only owns: the prefill ON TOP of the
// contract's blank seed, and DISPLAY labels for grades / rate bands / roles. It
// derives the rate-band field list from whatever keys the contract's seed
// carries, so it never hardcodes the band set — it labels whatever bands the
// contract defines (resilient to the package renaming a band).
// ─────────────────────────────────────────────────────────────────────────────
import { defaultAssumptions, toDriverPriorContext as pkgToDriverPriorContext } from '@finrep/analytics'

// Enrollment grid order (PK tiers → K → 1..8). Kept here only for the grid layout;
// the grade→band mapping (bandOf) lives in the package and runs inside the compute.
export const GRADE_ROW = ['PK0', 'PK1', 'PK2', 'PK3', 'PK4', 'K', '1', '2', '3', '4', '5', '6', '7', '8']

export const GRADE_LABELS = {
  PK0: 'PK-0', PK1: 'PK-1', PK2: 'PK-2', PK3: 'PK-3', PK4: 'PK-4',
  K: 'K', 1: 'Grade 1', 2: 'Grade 2', 3: 'Grade 3', 4: 'Grade 4',
  5: 'Grade 5', 6: 'Grade 6', 7: 'Grade 7', 8: 'Grade 8',
}

// Display labels for tuition rate bands — covers BOTH naming schemes the
// architects proposed, plus a title-cased fallback for any unknown key so a band
// the contract adds later still renders a readable label (never blank).
const RATE_BAND_LABELS = {
  prek3: 'PreK (part-time)', prekHalf: 'PreK (part-time)',
  prek5: 'PreK (full-day)', prekFull: 'PreK (full-day)',
  elem: 'Elementary (K–5)', elementary: 'Elementary (K–5)',
  middle: 'Middle (6–8)',
}

export function rateBandLabel(band) {
  if (RATE_BAND_LABELS[band]) return RATE_BAND_LABELS[band]
  const spaced = String(band)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export const ROLE_LABELS = {
  teachers: 'Teachers',
  admin: 'Administration',
  facilities: 'Facilities & support',
}
export const ROLE_ORDER = ['teachers', 'admin', 'facilities']

export const PROGRAM_LABELS = {
  parent: 'Parent-pay / FACTS',
  ftc: 'SUFS / FTC',
  fes: 'FES-UA',
}

// The narrow prior-context the compute consumes — re-export the PACKAGE's mapper
// so the web and the API derive it identically (one source of truth; cannot
// drift). Takes the full budgetContext ({ prior: { revenue, expense } }).
export const toDriverPriorContext = pkgToDriverPriorContext

// A blank-but-complete assumptions object straight from the contract's seed, so
// the band keys, grade keys, and nested shape always match computeDriverBudget.
// We only nudge inflation to a sane non-zero starting point for the form.
function blankAssumptions() {
  return { ...defaultAssumptions(), inflationPct: 3 }
}

// Seed the form from budgetContext where available. PURE (no side effects, no
// fabricated estimates): only fills what the context actually carries.
//   • enrollment — uses the most recent driver enrollment as a TOTAL hint and
//     spreads it evenly across the 14 grades (so grossTuition is non-zero out of
//     the box); the user then refines per grade.
//   • tuition rate — seeds every band from priorNetTuitionPerStudent as a starting
//     point (a single per-student figure is all the context has; the user splits
//     it by band).
//   • program split / staffing / fees — left at neutral defaults (the context has
//     no split or salary breakdown), benefits at a sane 25%.
export function seedAssumptions(budgetContext) {
  const a = blankAssumptions()
  const drivers = budgetContext?.drivers ?? null
  if (!drivers) return a

  const totalEnroll =
    drivers.current?.enrollment ??
    drivers.prior?.enrollment ??
    drivers.baselineEnrollment ??
    null
  if (Number.isFinite(totalEnroll) && totalEnroll > 0) {
    const per = Math.floor(totalEnroll / GRADE_ROW.length)
    let remainder = totalEnroll - per * GRADE_ROW.length
    for (const g of GRADE_ROW) {
      a.enrollmentByGrade[g] = per + (remainder > 0 ? 1 : 0)
      if (remainder > 0) remainder -= 1
    }
  }

  const perStudent = drivers.priorNetTuitionPerStudent
  if (Number.isFinite(perStudent) && perStudent > 0) {
    const r = Math.round(perStudent)
    a.tuitionRates = { prek3: r, prek5: r, elem: r, middle: r }
  }

  a.staffing.benefitsPct = 25
  return a
}

// Whole-number? helper for choosing the integer vs decimal sanitizer per field.
export function programSplitSum(split) {
  return (Number(split?.parent) || 0) + (Number(split?.ftc) || 0) + (Number(split?.fes) || 0)
}
