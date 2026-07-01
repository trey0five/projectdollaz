import type { MetricDef } from '../types.js'

/**
 * Student-Teacher Ratio = enrollment ÷ teaching FTE.
 *
 * The FIRST HR-domain BANDED metric — the second non-finance wedge (after
 * enrollment_change_yoy) and the proof that MODULE-SCOPED metric gating lights up a
 * page-less sellable module purely through Analytics + the briefing. It reuses the
 * teachingFte ALREADY captured on PeriodOperationalData (the Data-hub Enrollment-
 * and-aid form) — NO new store, NO migration, NO new intake.
 *
 * Unlike enrollment_change_yoy (a stock DELTA that consumes priorOp), this is a
 * WITHIN-period ratio: compute reads curOp ONLY, so its period-over-period delta
 * computes normally via evaluate()'s prior recompute.
 *
 * Available ONLY when enrollment is present (>= 0) AND teachingFte is present AND
 * > 0. teachingFte <= 0 is the divide-by-zero guard (a school with zero teachers
 * has no defensible ratio) — a missing/zero denominator yields available:false with
 * precise inputsMissing, NEVER Infinity/NaN and never a fabricated 0.
 *
 * scopeAggregation 'recompute-from-components': both inputs are EXTENSIVE, so the org
 * value is the metric's OWN formula on the summed components — Σenrollment ÷
 * ΣteachingFte, an FTE-weighted org ratio, NOT the average of per-school ratios. At
 * org scope it resolves available:false via its OWN teachingFte guard when no school
 * entered teaching FTE (ΣteachingFte null/≤0) — the honest "no org ratio".
 */
export const studentTeacherRatio: MetricDef = {
  key: 'student_teacher_ratio',
  label: 'Student-Teacher Ratio',
  unit: 'ratio',
  category: 'operational',
  // A higher ratio (more students per teacher) is worse: staffing-load / class-size.
  goodDirection: 'lower',
  domain: 'hr',
  scopeAggregation: 'recompute-from-components',
  inputs: [
    { key: 'enrollment', source: 'operational', label: 'Enrollment' },
    { key: 'teachingFte', source: 'operational', label: 'Teaching FTE' },
  ],
  basis: 'Students per full-time-equivalent teacher — a staffing-load indicator. Reuses the staff-FTE figures already captured on the operational data.',
  formula: 'Enrollment ÷ Teaching FTE',
  description: 'Number of students per full-time-equivalent teacher.',
  compute(_cur, _prior, curOp) {
    const enrollment = curOp?.enrollment ?? null
    const teachingFte = curOp?.teachingFte ?? null
    const inputs = [
      { key: 'enrollment', label: 'Enrollment', value: enrollment, unit: 'ratio' as const },
      { key: 'teachingFte', label: 'Teaching FTE', value: teachingFte, unit: 'ratio' as const },
    ]
    const missing: string[] = []
    if (enrollment === null) missing.push('enrollment')
    // Denominator must be present AND > 0: guards divide-by-zero and a 0-teacher
    // school that has no defensible ratio.
    if (teachingFte === null || teachingFte <= 0) missing.push('teachingFte')
    if (missing.length > 0 || enrollment === null || teachingFte === null || teachingFte <= 0) {
      return { value: null, available: false, inputsMissing: missing, inputs }
    }
    return {
      value: enrollment / teachingFte,
      available: true,
      inputsMissing: [],
      inputs,
    }
  },
}
