// FES-UA dormancy/closure (UA tier ONLY) — an ESA must be closed/reverted after
// 3 years post-high-school without eligible enrollment, or after 2 consecutive
// inactive fiscal years. CHECKLIST: document-dependent -> `manual` with CPA
// guidance. Returns not_applicable unless programs include FES_UA.
import type { Rule } from '../types.js'
import { hasProgram } from './util.js'

const CITE = 's.1002.394(5)(b)3. (2024) — FES-UA dormancy/closure'

export const fesuaDormancy: Rule = {
  id: 'fesua_dormancy',
  section: 'ELIGIBILITY',
  title: 'FES-UA dormancy / account closure',
  citation: CITE,
  severityOnFail: 'reportable',
  kind: 'checklist',
  programs: ['FES_UA'],
  evaluate(facts) {
    if (!hasProgram(facts.programs, 'FES_UA')) {
      return {
        status: 'not_applicable',
        detail: 'Not applicable — the school does not participate in the FES-UA (Unique Abilities) tier.',
        citation: CITE,
      }
    }
    return {
      status: 'manual',
      detail: 'CPA procedure: confirm any FES-UA ESA is closed/reverted after 3 years post-high-school without eligible enrollment, or after 2 consecutive inactive fiscal years. Have enrollment/activity records ready.',
      citation: CITE,
    }
  },
}
