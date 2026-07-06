import type { MetricDef } from '../types.js'

/**
 * Enrollment vs Plan = (enrollment − enrollmentPlan) / enrollmentPlan.
 *
 * The Phase-2 Enrollment Intelligence metric: how far ACTUAL headcount lands from
 * the PLANNED/budgeted enrollment for the period. Higher is better (at/above plan
 * is good; a shortfall is a tuition-revenue and, downstream, a cash concern — the
 * cross-domain briefing item extends exactly this signal). Enrollment domain, so
 * it is auto-gated by the 'enrollment' module at all three surfaces (registry →
 * metric-gating derives the module from the domain).
 *
 * Reads the NEW threaded `curOp.enrollmentPlan` (the plan total the API resolves
 * from the driver budget's enrollmentByGrade OR the free plannedEnrollmentByGrade)
 * plus the existing `curOp.enrollment` actual. Available ONLY when the plan is
 * present AND > 0 (a null/≤0 plan is an undefined denominator — never a fabricated
 * ratio, never Infinity) AND enrollment is present (≥ 0 is a legitimate actual). A
 * missing plan names inputsMissing:['enrollmentPlan']; a missing actual names
 * ['enrollment']. Never fabricates a 0%.
 *
 * scopeAggregation 'recompute-from-components': both enrollment and enrollmentPlan
 * are EXTENSIVE counts, so the org value is the metric's OWN formula on the summed
 * components — (Σenroll − Σplan)/Σplan — like every other ratio (org-compute's
 * sumOperational folds enrollmentPlan the same absent-as-null way).
 */
export const enrollmentVsPlan: MetricDef = {
  key: 'enrollment_vs_plan',
  label: 'Enrollment vs Plan',
  boardLabel: 'Enrollment vs Plan',
  unit: 'percent',
  category: 'operational',
  goodDirection: 'higher',
  domain: 'enrollment',
  scopeAggregation: 'recompute-from-components',
  inputs: [
    { key: 'enrollment', source: 'operational', label: 'Enrollment (actual)' },
    { key: 'enrollmentPlan', source: 'operational', label: 'Enrollment plan' },
  ],
  basis:
    'Actual headcount vs the planned/budgeted enrollment for the period. Plan comes from the driver-budget enrollment grid or the entered enrollment plan.',
  formula: '(Enrollment − Enrollment plan) ÷ Enrollment plan',
  description: 'How far actual enrollment is above or below the plan for the period.',
  compute(_cur, _prior, curOp) {
    const enrollment = curOp?.enrollment ?? null
    const plan = curOp?.enrollmentPlan ?? null
    const inputs = [
      { key: 'enrollment', label: 'Enrollment (actual)', value: enrollment, unit: 'ratio' as const },
      { key: 'enrollmentPlan', label: 'Enrollment plan', value: plan, unit: 'ratio' as const },
    ]
    const missing: string[] = []
    if (enrollment === null) missing.push('enrollment')
    // Plan must be present AND > 0: a null/zero/negative plan is an undefined
    // denominator (divide-by-zero / no defensible ratio), not a real 0%.
    if (plan === null || plan <= 0) missing.push('enrollmentPlan')
    if (missing.length > 0 || enrollment === null || plan === null || plan <= 0) {
      return { value: null, available: false, inputsMissing: missing, inputs }
    }
    return {
      value: (enrollment - plan) / plan,
      available: true,
      inputsMissing: [],
      inputs,
    }
  },
}
