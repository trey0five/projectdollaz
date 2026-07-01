import type { MetricDef } from '../types.js'

/**
 * % of students on aid = students on aid ÷ enrollment. 0..1.
 * Contextual (neutral). Requires studentsOnAid present (0 is valid -> 0%) and
 * enrollment > 0. Missing inputs named precisely; never a fabricated zero.
 */
export const pctStudentsOnAid: MetricDef = {
  key: 'pct_students_on_aid',
  label: '% of Students on Aid',
  unit: 'percent',
  category: 'operational',
  goodDirection: 'neutral',
  domain: 'aid',
  // Org = ΣstudentsOnAid / Σenrollment — enrollment-weighted share.
  scopeAggregation: 'recompute-from-components',
  inputs: [
    { key: 'studentsOnAid', source: 'operational', label: 'Students on aid' },
    { key: 'enrollment', source: 'operational', label: 'Enrollment' },
  ],
  basis: 'Students receiving aid ÷ enrollment.',
  formula: 'Students on aid ÷ Enrollment',
  description: 'Share of the student body receiving financial aid.',
  compute(_cur, _prior, curOp) {
    const missing: string[] = []
    const studentsOnAid = curOp?.studentsOnAid ?? null
    const enrollment = curOp?.enrollment ?? null
    if (studentsOnAid === null) missing.push('studentsOnAid')
    if (enrollment === null || enrollment <= 0) missing.push('enrollment')
    const inputs = [
      { key: 'studentsOnAid', label: 'Students on aid', value: studentsOnAid, unit: 'ratio' as const },
      { key: 'enrollment', label: 'Enrollment', value: enrollment, unit: 'ratio' as const },
    ]
    if (missing.length > 0 || studentsOnAid === null || enrollment === null) {
      return { value: null, available: false, inputsMissing: missing, inputs }
    }
    return {
      value: studentsOnAid / enrollment,
      available: true,
      inputsMissing: [],
      inputs,
    }
  },
}
