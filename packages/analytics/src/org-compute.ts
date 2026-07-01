// ─────────────────────────────────────────────────────────────
// Canonical semantic layer v1 — the GENERIC, registry-driven org-scope engine.
//
// THE MOAT PROPERTY: an organization's metric value is the metric's OWN formula
// (def.compute) applied to the FIELD-BY-FIELD SUM of its schools' EXTENSIVE
// components — NEVER the average of per-school metric outputs. So org
// operating_margin = (Σrev−Σexp)/Σrev, org cost_per_pupil = Σexp/Σenrollment,
// etc. — all correct by construction, with EXACTLY ONE formula per metric shared
// with the per-school path (assembleMetricResult).
//
// PURE + DETERMINISTIC: no Date, no clock, no random, no IO. The only new
// arithmetic is plain extensive addition over a FIXED key list; the metric math
// is the existing def.compute. Computing twice over the same rows is
// byte-identical (see __tests__/org-compute.test.ts).
//
// REGISTRY-DRIVEN: a new metric added to the registry rolls up automatically —
// sumFinancials/sumOperational already sum every field and the loop runs
// def.compute. The only metric-specific knob is scopeAggregation; absent defaults
// to 'recompute-from-components' (correct for any extensive-input metric). A
// metric reading a non-extensive input MUST declare 'not-aggregatable' and is
// skipped (resolves available:false) — never silently mis-averaged.
// ─────────────────────────────────────────────────────────────
import type {
  MetricResult,
  PeriodFinancials,
  PeriodOperational,
} from './types.js'
import { EXPENSE_LINE_KEYS, REVENUE_LINE_KEYS } from './adapt.js'
import { ALL_METRICS, scopeRuleFor } from './registry.js'
import { assembleMetricResult } from './compute.js'

/** One school's contribution to an org rollup for a single period. */
export interface SchoolPeriodInputs {
  /** Stable id so the result can attribute which schools contributed. */
  schoolId: string
  /** The school's period financials (already adapted via fromBundle by the API). */
  financials: PeriodFinancials
  /** The school's period operational data, or null/absent when not entered. */
  operational?: PeriodOperational | null
}

/** An org-scope MetricResult, plus which schools contributed + how many reported. */
export interface OrgMetricResult extends MetricResult {
  scope: 'org'
  /** Number of schools whose financials were folded into the org sums. */
  reportedSchoolCount: number
}

/**
 * Absent-as-null fold for a NULLABLE extensive field: a school whose value is null
 * contributes NOTHING; the org field is the Σ of the present (non-null, finite)
 * values, or null ONLY when EVERY school was null/absent. This mirrors the shipped
 * consolidated-statements behavior (StatementsRollupService treats a missing SFP as
 * contributing 0 to the consolidated balance sheet, NOT as poisoning the whole org
 * to null), so org metrics and the statements rollup agree by construction.
 */
function foldNullable(values: (number | null | undefined)[]): number | null {
  let sum = 0
  let anyPresent = false
  for (const v of values) {
    if (v === null || v === undefined || !Number.isFinite(v)) continue
    sum += v
    anyPresent = true
  }
  return anyPresent ? sum : null
}

/** Plain Σ of a REQUIRED extensive scalar (NaN-safe). */
function sumScalar(values: number[]): number {
  let sum = 0
  for (const v of values) if (Number.isFinite(v)) sum += v
  return sum
}

/**
 * Sum a list of PeriodFinancials field-by-field into ONE org PeriodFinancials.
 *
 * - Extensive scalars (totalRev/totalExp/netChange/tuition): plain Σ.
 * - revenueLines/expenseLines: Σ per FIXED key (bounded, homogeneous — same
 *   discipline as StatementsRollupService's SOA_KEYS whitelist).
 * - Nullable SFP fields (cash/restrictedCash/naWithout/naWith): absent-as-null fold
 *   (null only when ALL schools lacked an SFP; else Σ of the schools that have one).
 * - hasSFP: OR across schools — true if AT LEAST ONE school carried an SFP. When no
 *   school has one, hasSFP=false AND cash/naWithout=null, so the SFP-dependent
 *   metrics resolve available:false via their EXISTING guards (zero special-casing).
 *   ASYMMETRY (deliberate, v1 consolidated-entity view): when only SOME schools
 *   carry an SFP, days_cash_on_hand/months_operating_reserve pair a numerator
 *   summed over the SFP schools (Σcash / ΣnaWithout) against a denominator summed
 *   over ALL reporters (Σtotal-exp). That's the true consolidated ratio for the
 *   entity, not a per-school average; coverage is surfaced via reportedSchoolCount
 *   + the API contributor list rather than forking the denominator (a 2nd formula).
 * - elapsedDays/elapsedMonths: org rollup is ANNUAL-only (the API matches the
 *   latest annual snapshot per FY per school), so left undefined → 365/12
 *   denominators, byte-identical to the per-school annual path.
 */
export function sumFinancials(rows: PeriodFinancials[]): PeriodFinancials {
  const revenueLines = {} as PeriodFinancials['revenueLines']
  for (const k of REVENUE_LINE_KEYS) {
    revenueLines[k] = sumScalar(rows.map((r) => r.revenueLines[k]))
  }
  const expenseLines = {} as PeriodFinancials['expenseLines']
  for (const k of EXPENSE_LINE_KEYS) {
    expenseLines[k] = sumScalar(rows.map((r) => r.expenseLines[k]))
  }
  return {
    totalRev: sumScalar(rows.map((r) => r.totalRev)),
    totalExp: sumScalar(rows.map((r) => r.totalExp)),
    netChange: sumScalar(rows.map((r) => r.netChange)),
    tuition: sumScalar(rows.map((r) => r.tuition)),
    revenueLines,
    expenseLines,
    cash: foldNullable(rows.map((r) => r.cash)),
    restrictedCash: foldNullable(rows.map((r) => r.restrictedCash)),
    naWithout: foldNullable(rows.map((r) => r.naWithout)),
    naWith: foldNullable(rows.map((r) => r.naWith)),
    hasSFP: rows.some((r) => r.hasSFP),
    // Annual-only org rollup: leave the partial-year basis undefined.
    elapsedDays: undefined,
    elapsedMonths: undefined,
  }
}

/**
 * Sum a list of (possibly null/absent) PeriodOperational into ONE org
 * PeriodOperational, or null when NO school reported any operational data.
 *
 * Each count uses the same absent-as-null fold: a field is the Σ of the schools
 * that entered it, or null when none did. Returning null when there is no
 * operational data at all means the Tier-2 metrics resolve unavailable via their
 * existing `!curOp` / null-enrollment guards — exactly the per-school contract.
 *
 * NOTE on partial coverage: org cost_per_pupil = Σexp(all reporters) /
 * Σenrollment(schools that entered enrollment) can mix a numerator over more
 * schools than the denominator. v1 takes the consolidated-entity view (sum what is
 * present) and surfaces coverage via reportedSchoolCount + the API's contributor
 * list rather than forking the denominator (which would be a second formula).
 */
export function sumOperational(
  rows: (PeriodOperational | null | undefined)[],
): PeriodOperational | null {
  const present = rows.filter((r): r is PeriodOperational => r !== null && r !== undefined)
  if (present.length === 0) return null
  return {
    enrollment: foldNullable(present.map((r) => r.enrollment)),
    enrollmentFte: foldNullable(present.map((r) => r.enrollmentFte)),
    studentsOnAid: foldNullable(present.map((r) => r.studentsOnAid)),
    financialAidTotal: foldNullable(present.map((r) => r.financialAidTotal)),
  }
}

/**
 * Compute EVERY metric at organization scope from the contributing schools'
 * period inputs. Registry-driven: iterates ALL_METRICS in canonical order, sums
 * the extensive components ONCE, and runs each metric's own def.compute on the
 * sums — then wraps with the SAME assembleMetricResult the per-school path uses.
 *
 * Org scope has no prior period in v1, so periodOverPeriodDelta is always null
 * (cards simply hide the delta chip, which they already do for null).
 */
export function computeOrgMetrics(rows: SchoolPeriodInputs[]): OrgMetricResult[] {
  const reportedSchoolCount = rows.length
  const orgFin = sumFinancials(rows.map((r) => r.financials))
  const orgOp = sumOperational(rows.map((r) => r.operational))

  return ALL_METRICS.map((def) => {
    const rule = scopeRuleFor(def.key)

    // not-aggregatable: refuse the math. Resolve unavailable via the SAME
    // available:false / inputsMissing contract consumers already handle — never a
    // wrong (silently averaged/summed) number.
    if (rule === 'not-aggregatable') {
      const result = assembleMetricResult(
        def,
        { value: null, available: false, inputsMissing: ['scope:not-aggregatable'], inputs: [] },
        null,
      )
      return { ...result, scope: 'org' as const, reportedSchoolCount }
    }

    // recompute / weighted / sum all funnel through the IDENTICAL path: the
    // metric's own formula on the summed components. (weighted/sum are honest
    // LABELS, not separate math — see ScopeAggregation docs.)
    const out = def.compute(orgFin, undefined, orgOp ?? undefined, undefined)
    const result = assembleMetricResult(def, out, null)
    return { ...result, scope: 'org' as const, reportedSchoolCount }
  })
}
