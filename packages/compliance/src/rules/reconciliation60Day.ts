// §III.B Financial Controls — bank statements must be reconciled within 60 days
// of month-end AND independently reviewed. A failure here is a MATERIAL exception
// (requires a Corrective Action Plan). INTAKE.
import type { Rule } from '../types.js'
import { has } from './util.js'

const CITE = 'SUFS AUP §III.B (Financial Controls — 60-day reconciliation)'

export const reconciliation60Day: Rule = {
  id: 'reconciliation_60day',
  section: 'III',
  title: '60-day bank reconciliation, independently reviewed',
  citation: CITE,
  severityOnFail: 'material',
  kind: 'intake',
  programs: 'all',
  evaluate(facts) {
    const within = facts.inputs.reconciledWithin60Days
    const reviewed = facts.inputs.reconciliationIndependentlyReviewed

    // A definite `false` on EITHER attestation is already a failure (OR
    // semantics) — surface it as MATERIAL even if the other is still unanswered;
    // a known failure must never be downgraded to needs_data.
    const failed: string[] = []
    if (within === false) failed.push('not reconciled within 60 days of month-end')
    if (reviewed === false) failed.push('reconciliations not independently reviewed')
    if (failed.length > 0) {
      return {
        status: 'material',
        detail: `MATERIAL exception (${failed.join('; ')}). A Corrective Action Plan will be required under §III.B.`,
        citation: CITE,
      }
    }

    // No explicit failure yet — if either is unanswered we cannot pass.
    if (!has(within) || !has(reviewed)) {
      return {
        status: 'needs_data',
        detail: 'Attest whether bank statements are reconciled within 60 days of month-end AND independently reviewed.',
        citation: CITE,
      }
    }
    return {
      status: 'pass',
      detail: 'Bank statements are reconciled within 60 days of month-end and independently reviewed.',
      citation: CITE,
    }
  },
}
