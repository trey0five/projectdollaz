import type { MetricDef } from '../types.js'

/**
 * Enrollment (headcount) = the period's total student headcount, as stored on
 * PeriodOperationalData.enrollment.
 *
 * THE PLAIN NUMBER, PROMOTED TO A METRIC. It carries no formula worth the name —
 * that is the point. Before this entry the headcount was read straight off the
 * operational row by the enrollment tile, the roster page, the org leaderboard and
 * Penny, four readers each free to round, re-derive or re-label it. Everything
 * downstream of it (enrollment_change_yoy, enrollment_vs_plan, cost_per_pupil,
 * student_teacher_ratio) already flowed through the registry; the headcount itself
 * did not, so the ONE number the others are all built on was the one number with no
 * canonical definition. This makes it one definition, one label, one unit, one
 * scope rule — and, because it is a registry metric, it gates, rolls up, trends and
 * narrates like every other metric for free.
 *
 * unit 'count': a whole number of children. Formatted with thousands separators and
 * NO decimals — "436", never "436.00" (which reads as a measurement) and never
 * "43,600%" (which is what a 'ratio'/'percent' label would have produced).
 *
 * NO BAND, deliberately. A school of 120 is not worse than a school of 1,200; size
 * has no universal good/bad, so the metric is NEUTRAL by ABSENCE from DEFAULT_BANDS
 * — the same rule that keeps net_tuition_per_student and total_staff_fte neutral.
 * Judgement about enrollment lives in the two metrics that DO have a defensible
 * frame: change-over-last-year and distance-from-plan. goodDirection stays 'higher'
 * so a delta chip of "+16" reads as the good news it is for a tuition-funded school,
 * without implying the LEVEL has a target.
 *
 * scopeAggregation 'sum': the value is itself EXTENSIVE — a raw total — so the
 * organization's headcount is Σ of its schools'. (The org engine reaches the same
 * number by its default route, since compute() just reads the summed
 * `enrollment` component; 'sum' is the honest LABEL for what is happening, so the
 * catalog can say "added across schools" instead of implying a recomputed ratio.)
 *
 * Available whenever enrollment is present (>= 0 is a legitimate actual — a school
 * that has genuinely wound down to zero is a fact, not a missing value). Absent =>
 * available:false with inputsMissing:['enrollment'], never a fabricated 0.
 */
export const enrollmentHeadcount: MetricDef = {
  key: 'enrollment_headcount',
  label: 'Enrollment (Headcount)',
  boardLabel: 'Enrollment',
  unit: 'count',
  category: 'operational',
  goodDirection: 'higher',
  domain: 'enrollment',
  scopeAggregation: 'sum',
  inputs: [{ key: 'enrollment', source: 'operational', label: 'Enrollment' }],
  basis:
    'Total student headcount recorded for the period. The same number the roster, the enrollment tile and the org roll-up all print — one definition, so they cannot disagree.',
  formula: 'Enrollment headcount',
  description: 'Total number of students enrolled for the period.',
  compute(_cur, _prior, curOp) {
    const enrollment = curOp?.enrollment ?? null
    const inputs = [
      { key: 'enrollment', label: 'Enrollment', value: enrollment, unit: 'count' as const },
    ]
    if (enrollment === null) {
      return { value: null, available: false, inputsMissing: ['enrollment'], inputs }
    }
    return { value: enrollment, available: true, inputsMissing: [], inputs }
  },
}
