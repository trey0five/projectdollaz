import type { MetricDef } from '../types.js'

/**
 * Enrollment change (YoY) = (cur.enrollment − prior.enrollment) / prior.enrollment.
 *
 * The FIRST non-finance (enrollment-domain) BANDED metric — the thin-wedge proof
 * that the domain-agnostic mechanism (registry → bands → briefing → lens → Penny →
 * org rollup) works for a non-finance domain. It reads the TOTAL headcount already
 * stored on PeriodOperationalData for BOTH the current and immediately-prior period
 * (priorOp) — NO new store, NO per-grade data.
 *
 * It is the ONLY metric of the set whose compute() consumes priorOp INSIDE its own
 * value: enrollment is a STOCK, so its trend is a period-over-period delta, not a
 * within-period ratio. This is fine — the MetricDef.compute signature already
 * receives (cur, prior, curOp, priorOp) and evaluate() already threads priorOp in.
 * (Side-effect: the registry's PoP recompute calls compute(prior, undefined,
 * priorOp, undefined) — the prior period with NO prior-of-prior — so this metric's
 * periodOverPeriodDelta is always null. That is HONEST: a change-of-a-change needs a
 * 3-year window we don't have. Cards hide a null delta chip.)
 *
 * DISTINCT from rollForwardEnrollment (forecast.ts): that is a FORWARD cohort roll
 * (grade-by-grade projection with retention from assumptions.enrollmentByGrade). This
 * is a backward-looking actuals delta on the school-TOTAL headcount. Different
 * concepts — deliberately not coupled (one definition per concept).
 *
 * Available ONLY when prior.enrollment is present AND > 0 (divide-by-zero guard; a
 * school going 0→N has no defensible rate) AND cur.enrollment is present (>= 0). Any
 * missing/zero-prior input → available:false with precise inputsMissing — never a
 * fabricated 0% and never Infinity.
 *
 * scopeAggregation 'recompute-from-components': enrollment is an EXTENSIVE stock, so
 * Σcur_enroll and Σprior_enroll are both meaningful, and the org YoY is the metric's
 * OWN formula on those sums: (Σcur_enroll − Σprior_enroll)/Σprior_enroll. Now that the
 * org path resolves each school's nearest-prior operational and folds it into orgPriorOp,
 * this metric rolls up correctly-by-construction like every other ratio — the compute()
 * body already reads priorOp.enrollment, so ONLY the label changes. At org scope it
 * resolves available:false via its OWN priorEnrollment guard when no school has a prior
 * (Σprior_enroll null/≤0) — the honest "no org YoY", now guard-driven rather than a
 * scope refusal. (Its periodOverPeriodDelta stays null: a change-of-a-change needs a
 * prior-of-prior the org sums don't carry — same honesty as the per-school path.)
 */
export const enrollmentChangeYoy: MetricDef = {
  key: 'enrollment_change_yoy',
  label: 'Enrollment Change (YoY)',
  unit: 'percent',
  category: 'operational',
  goodDirection: 'higher',
  domain: 'enrollment',
  scopeAggregation: 'recompute-from-components',
  inputs: [
    { key: 'enrollment', source: 'operational', label: 'Enrollment (current)' },
    { key: 'priorEnrollment', source: 'operational', label: 'Enrollment (prior year)' },
  ],
  basis: 'Year-over-year change in total enrollment headcount vs. the prior period. Needs two years of enrollment.',
  formula: '(Enrollment − Prior-year enrollment) ÷ Prior-year enrollment',
  description: 'Year-over-year growth (or decline) in total student headcount.',
  compute(_cur, _prior, curOp, priorOp) {
    const enrollment = curOp?.enrollment ?? null
    const priorEnrollment = priorOp?.enrollment ?? null
    const inputs = [
      { key: 'enrollment', label: 'Enrollment (current)', value: enrollment, unit: 'ratio' as const },
      { key: 'priorEnrollment', label: 'Enrollment (prior year)', value: priorEnrollment, unit: 'ratio' as const },
    ]
    const missing: string[] = []
    if (enrollment === null) missing.push('enrollment')
    // Prior must be present AND > 0: guards divide-by-zero and a 0→N ramp that has
    // no defensible growth rate.
    if (priorEnrollment === null || priorEnrollment <= 0) missing.push('priorEnrollment')
    if (missing.length > 0 || enrollment === null || priorEnrollment === null || priorEnrollment <= 0) {
      return { value: null, available: false, inputsMissing: missing, inputs }
    }
    return {
      value: (enrollment - priorEnrollment) / priorEnrollment,
      available: true,
      inputsMissing: [],
      inputs,
    }
  },
}
