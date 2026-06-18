// FES-UA $50k cap (UA tier ONLY) — no transfer into an ESA whose balance already
// exceeds $50,000. INTAKE: fesuaAnyAccountOver50k. Returns not_applicable unless
// the resolved programs include FES_UA (tier scoping).
import type { Rule } from '../types.js'
import { has, hasProgram } from './util.js'

const CITE = 's.1002.394(12)(b)11. (2024) — FES-UA $50,000 account cap'

export const fesua50kCap: Rule = {
  id: 'fesua_50k_cap',
  section: 'ELIGIBILITY',
  title: 'FES-UA $50,000 account-balance cap',
  citation: CITE,
  severityOnFail: 'reportable',
  kind: 'intake',
  programs: ['FES_UA'],
  evaluate(facts) {
    if (!hasProgram(facts.programs, 'FES_UA')) {
      return {
        status: 'not_applicable',
        detail: 'Not applicable — the school does not participate in the FES-UA (Unique Abilities) tier.',
        citation: CITE,
      }
    }
    const over = facts.inputs.fesuaAnyAccountOver50k
    if (!has(over)) {
      return {
        status: 'needs_data',
        detail: 'Attest whether any FES-UA ESA account balance already exceeds the $50,000 cap.',
        citation: CITE,
      }
    }
    if (!over) {
      return {
        status: 'pass',
        detail: 'No FES-UA ESA account balance exceeds the $50,000 cap.',
        citation: CITE,
      }
    }
    return {
      status: 'reportable',
      detail: 'At least one FES-UA ESA account balance exceeds the $50,000 cap — no further transfers may be made into it (reportable exception).',
      citation: CITE,
    }
  },
}
