import type { MetricDef } from '../types.js'

/**
 * Aid per aided student = financial aid total ÷ students on aid.
 * Contextual (neutral). Requires financialAidTotal present (0 is valid) and
 * studentsOnAid > 0. Missing inputs named precisely; never a fabricated zero.
 */
export const aidPerAidedStudent: MetricDef = {
  key: 'aid_per_aided_student',
  label: 'Aid per Aided Student',
  unit: 'currency',
  category: 'operational',
  goodDirection: 'neutral',
  basis: 'Total financial aid ÷ students receiving aid.',
  formula: 'Financial aid ÷ Students on aid',
  description: 'Average award size among students who actually receive aid.',
  compute(_cur, _prior, curOp) {
    const missing: string[] = []
    const aid = curOp?.financialAidTotal ?? null
    const studentsOnAid = curOp?.studentsOnAid ?? null
    if (aid === null) missing.push('financialAidTotal')
    if (studentsOnAid === null || studentsOnAid <= 0) missing.push('studentsOnAid')
    const inputs = [
      { key: 'financialAidTotal', label: 'Financial aid', value: aid, unit: 'currency' as const },
      { key: 'studentsOnAid', label: 'Students on aid', value: studentsOnAid, unit: 'ratio' as const },
    ]
    if (missing.length > 0 || aid === null || studentsOnAid === null) {
      return { value: null, available: false, inputsMissing: missing, inputs }
    }
    return {
      value: aid / studentsOnAid,
      available: true,
      inputsMissing: [],
      inputs,
    }
  },
}
