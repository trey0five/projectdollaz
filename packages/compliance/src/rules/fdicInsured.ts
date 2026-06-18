// §III.A Financial Controls — scholarship funds must be held at a federally-
// insured (FDIC/NCUA) institution. INTAKE: fundsAtInsuredInstitution.
import type { Rule } from '../types.js'
import { has } from './util.js'

const CITE = 'SUFS AUP §III.A (Financial Controls — insured institution)'

export const fdicInsured: Rule = {
  id: 'fdic_insured',
  section: 'III',
  title: 'Funds at a federally-insured institution',
  citation: CITE,
  severityOnFail: 'reportable',
  kind: 'intake',
  programs: 'all',
  evaluate(facts) {
    const v = facts.inputs.fundsAtInsuredInstitution
    if (!has(v)) {
      return {
        status: 'needs_data',
        detail: 'Attest whether scholarship funds are held at a federally-insured (FDIC/NCUA) institution.',
        citation: CITE,
      }
    }
    if (v) {
      return {
        status: 'pass',
        detail: 'Scholarship funds are held at a federally-insured (FDIC/NCUA) institution.',
        citation: CITE,
      }
    }
    return {
      status: 'reportable',
      detail: 'Scholarship funds are NOT held at a federally-insured institution — reportable exception under §III.A.',
      citation: CITE,
    }
  },
}
