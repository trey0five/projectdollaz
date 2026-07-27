import type { MetricDef } from '../types.js'

/**
 * Teaching staff share = teachingFte ÷ totalStaffFte.
 *
 * Phase 6 (HR & Staffing) — the staffing-COMPOSITION metric: what fraction of all
 * staff FTEs are instructional. HR's second BANDED metric (after
 * student_teacher_ratio), so it feeds the briefing's STEP-1 band machinery. A
 * within-period ratio (reads curOp only), so its period-over-period delta
 * computes normally via evaluate()'s prior recompute.
 *
 * Available ONLY when BOTH fields are present AND totalStaffFte > 0 (the
 * divide-by-zero guard; a school with zero total staff has no defensible
 * composition). The operational service's invariant (teachingFte <=
 * totalStaffFte) guarantees value ∈ [0,1]. inputsMissing is precise per field —
 * never Infinity/NaN and never a fabricated 0.
 *
 * scopeAggregation 'recompute-from-components': both inputs are EXTENSIVE, so
 * the org value is ΣteachingFte ÷ ΣtotalStaffFte — an FTE-weighted org share,
 * NOT the average of per-school shares. Zero engine change.
 */
export const teachingStaffShare: MetricDef = {
  key: 'teaching_staff_share',
  label: 'Teaching Staff Share',
  boardLabel: 'Teaching Staff Share',
  unit: 'percent',
  category: 'operational',
  // More of the staff dollar/headcount in the classroom is (as a sector default)
  // the healthy direction; the band below is tunable.
  goodDirection: 'higher',
  domain: 'hr',
  scopeAggregation: 'recompute-from-components',
  inputs: [
    { key: 'teachingFte', source: 'operational', label: 'Teaching FTE' },
    { key: 'totalStaffFte', source: 'operational', label: 'Total staff FTE' },
  ],
  basis: 'Teaching FTEs as a share of ALL staff FTEs — an instructional-vs-overhead composition indicator. Reuses the staff-FTE figures already captured on the operational data.',
  formula: 'Teaching FTE ÷ Total staff FTE',
  description: 'Share of all staff full-time equivalents that are teaching staff.',
  compute(_cur, _prior, curOp) {
    const teachingFte = curOp?.teachingFte ?? null
    const totalStaffFte = curOp?.totalStaffFte ?? null
    const inputs = [
      { key: 'teachingFte', label: 'Teaching FTE', value: teachingFte, unit: 'ratio' as const },
      { key: 'totalStaffFte', label: 'Total staff FTE', value: totalStaffFte, unit: 'ratio' as const },
    ]
    const missing: string[] = []
    if (teachingFte === null) missing.push('teachingFte')
    // Denominator must be present AND > 0: guards divide-by-zero and a 0-staff
    // school that has no defensible composition.
    if (totalStaffFte === null || totalStaffFte <= 0) missing.push('totalStaffFte')
    if (missing.length > 0 || teachingFte === null || totalStaffFte === null || totalStaffFte <= 0) {
      return { value: null, available: false, inputsMissing: missing, inputs }
    }
    return {
      value: teachingFte / totalStaffFte,
      available: true,
      inputsMissing: [],
      inputs,
    }
  },
}
