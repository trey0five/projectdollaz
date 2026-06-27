// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — feeder-enrollment merge bridge for the LIVE forecast preview.
//
// The authoritative pure helper is `mergeFeederEnrollment` in @finrep/analytics
// (packages/analytics/src/forecast.ts) — SHARED by the API's server save and this
// web preview so they can never drift. We re-export the package helper when it is
// present and otherwise fall back to a byte-for-byte copy of its documented
// contract, so the web builds even if the analytics export lands slightly after
// this file during integration. The fallback is intentionally identical:
//
//   for each g in GRADE_KEYS:
//     out[g] = max(0, num(enrollment[g])) + max(0, num(feeder[g]))
//   omit keys that sum to 0; only the 14 GRADE_KEYS participate; never throws.
// ─────────────────────────────────────────────────────────────────────────────
import * as analytics from '@finrep/analytics'
import { GRADE_KEYS } from '@finrep/analytics'

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const nn = (v) => Math.max(0, num(v))

// Local fallback — identical to the package contract (see header).
function localMerge(enrollmentByGrade, feeder) {
  const out = {}
  const e = enrollmentByGrade || {}
  const f = feeder || {}
  for (const g of GRADE_KEYS) {
    const sum = nn(e[g]) + nn(f[g])
    if (sum > 0) out[g] = sum
  }
  return out
}

// Prefer the shared package helper (single source of truth); fall back locally.
export const mergeFeederEnrollment =
  typeof analytics.mergeFeederEnrollment === 'function'
    ? analytics.mergeFeederEnrollment
    : localMerge

// Σ of a feeder/enrollment grid over the 14 grade keys (UI badges + summaries).
export function gradeGridTotal(grid) {
  if (!grid) return 0
  let t = 0
  for (const g of GRADE_KEYS) t += nn(grid[g])
  return t
}
