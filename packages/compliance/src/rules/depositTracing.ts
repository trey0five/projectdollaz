// §IV Deposit & Classification of Scholarship Funds — the CPA samples 10 students
// or 5% (whichever is greater) and traces each scholarship ACH: (a) deposited to
// the bank, (b) posted to the GL as tuition/books/fees, (c) posted to the student
// account. CHECKLIST: document-dependent, so always `manual` with CPA guidance —
// never a pass/fail.
import type { Rule } from '../types.js'

const CITE = 'SUFS AUP §IV (Deposit & Classification of Scholarship Funds)'

export const depositTracing: Rule = {
  id: 'deposit_tracing',
  section: 'IV',
  title: 'Scholarship deposit tracing (sample)',
  citation: CITE,
  severityOnFail: 'reportable',
  kind: 'checklist',
  programs: 'all',
  evaluate() {
    return {
      status: 'manual',
      detail: 'CPA procedure: sample 10 students or 5% (whichever is greater) and trace each scholarship ACH (a) deposited to the bank, (b) posted to the GL as tuition/books/fees, (c) posted to the student account. Have bank records and the student subledger ready.',
      citation: CITE,
    }
  },
}
