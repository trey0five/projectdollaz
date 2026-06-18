// §I School Eligibility — DOE compliance status must show "approved" (not
// suspended/revoked). INTAKE: doeStatusApproved.
import type { Rule } from '../types.js'
import { has } from './util.js'

const CITE = 'SUFS AUP §I; s.1002.395(2)(i) (2024) — DOE approval'

export const doeApproved: Rule = {
  id: 'doe_approved',
  section: 'I',
  title: 'DOE status shows "approved"',
  citation: CITE,
  severityOnFail: 'reportable',
  kind: 'intake',
  programs: 'all',
  evaluate(facts) {
    const v = facts.inputs.doeStatusApproved
    if (!has(v)) {
      return {
        status: 'needs_data',
        detail: 'Attest whether the school’s DOE compliance status currently shows "approved".',
        citation: CITE,
      }
    }
    if (v) {
      return {
        status: 'pass',
        detail: 'DOE compliance status shows "approved" (not suspended or revoked).',
        citation: CITE,
      }
    }
    return {
      status: 'reportable',
      detail: 'DOE compliance status is not "approved" (suspended/revoked/other) — reportable exception under §I.',
      citation: CITE,
    }
  },
}
