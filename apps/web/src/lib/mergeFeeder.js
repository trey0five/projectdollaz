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

// ── Phase 4 — roll-forward cohort projection (shared @finrep/analytics contract).
// localRollForward / localEffective are BYTE-FOR-BYTE copies of the documented
// rollForwardMath / sharedShapes contract so the web builds even if the analytics
// export lands slightly after this file during integration. The package export is
// ALWAYS preferred (it's the single source the API also calls), so preview and
// server never drift; the fallback only exists for the build seam.

const clampPct = (p) => Math.min(100, Math.max(0, num(p)))

// Pure, total, never-throws cohort roll-forward (no overrides applied here).
//   input = { currentByGrade, retentionPct, retentionByGrade?, newEntrantsByGrade?, graduatingGrade? }
function localRollForward(input) {
  const cur = input?.currentByGrade || {}
  const retDefault = input?.retentionPct
  const retByGrade = input?.retentionByGrade || {}
  const entrants = input?.newEntrantsByGrade || {}
  const grad = GRADE_KEYS.includes(input?.graduatingGrade) ? input.graduatingGrade : '8'
  const retOf = (g) => clampPct(retByGrade?.[g] ?? retDefault)

  const projected = {}
  for (const g of GRADE_KEYS) projected[g] = 0

  // Age-up one index; the graduating cohort exits (does NOT roll up). First grade
  // (index 0 / PK0) is never a destination, so its only population is new entrants.
  for (let i = 1; i < GRADE_KEYS.length; i += 1) {
    const src = GRADE_KEYS[i - 1]
    if (src === grad) continue
    projected[GRADE_KEYS[i]] += Math.round((nn(cur[src]) * retOf(src)) / 100)
  }

  // New entrants / transfers, at ANY grade.
  for (const g of GRADE_KEYS) projected[g] += nn(entrants?.[g])

  // Sparse — omit zeros (same shape as mergeFeederEnrollment).
  const out = {}
  for (const g of GRADE_KEYS) if (projected[g] !== 0) out[g] = projected[g]
  return out
}

// Shared dispatcher — the ONE source of effectiveEnrollmentByGrade for BOTH the
// API save and the web preview.
//   input = { projectionMethod?, enrollmentByGrade, feederEnrollmentByGrade?, rollForward? }
function localEffective(input) {
  const method = input?.projectionMethod === 'rollforward' ? 'rollforward' : 'manual'
  if (method === 'manual') {
    return localMerge(input?.enrollmentByGrade, input?.feederEnrollmentByGrade)
  }
  const rf = input?.rollForward ?? { currentByGrade: {}, retentionPct: 0 }
  const computed = localRollForward({
    currentByGrade: rf.currentByGrade,
    retentionPct: rf.retentionPct,
    retentionByGrade: rf.retentionByGrade,
    newEntrantsByGrade: input?.feederEnrollmentByGrade,
    graduatingGrade: rf.graduatingGrade,
  })
  // Apply per-grade overrides LAST (present key REPLACES computed; clamp >=0; sparse).
  const out = {}
  for (const g of GRADE_KEYS) {
    const ov = rf.projectedOverrideByGrade?.[g]
    const v = ov !== undefined ? Math.max(0, num(ov)) : num(computed[g])
    if (v !== 0) out[g] = v
  }
  return out
}

// Prefer the shared package helpers; fall back to the byte-identical local copies.
export const rollForwardEnrollment =
  typeof analytics.rollForwardEnrollment === 'function'
    ? analytics.rollForwardEnrollment
    : localRollForward

export const effectiveEnrollment =
  typeof analytics.effectiveEnrollment === 'function'
    ? analytics.effectiveEnrollment
    : localEffective

// Σ of a feeder/enrollment grid over the 14 grade keys (UI badges + summaries).
export function gradeGridTotal(grid) {
  if (!grid) return 0
  let t = 0
  for (const g of GRADE_KEYS) t += nn(grid[g])
  return t
}
