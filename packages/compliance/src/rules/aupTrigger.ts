// AUP trigger (threshold) — once a school receives > $250,000 aggregate
// scholarship dollars in a school year it MUST engage a CPA to perform the AUP
// and submit the report by September 15. INTAKE: keys off scholarshipFundsReceived.
// Status is `info`/`manual`, not a pass/fail exception (summarize.requiresAup
// keys off the same > $250k condition).
import type { Rule } from '../types.js'
import { has, usd } from './util.js'

const CITE = 's.1002.421(1)(q) (2024) — AUP trigger / Sept 15 report'
const THRESHOLD = 250_000

export const aupTrigger: Rule = {
  id: 'aup_trigger',
  section: 'V',
  title: '$250,000 AUP trigger',
  citation: CITE,
  severityOnFail: 'info',
  kind: 'intake',
  programs: 'all',
  evaluate(facts) {
    const scholarships = facts.inputs.scholarshipFundsReceived
    if (!has(scholarships)) {
      return {
        status: 'needs_data',
        detail: 'Enter the scholarship funds received in the intake to determine whether an AUP is required this year.',
        citation: CITE,
      }
    }
    if (scholarships > THRESHOLD) {
      return {
        status: 'manual',
        detail: `AUP REQUIRED this year — scholarship funds received (${usd(scholarships)}) exceed the ${usd(THRESHOLD)} threshold. Engage a licensed CPA; the AUP report is due September 15.`,
        citation: CITE,
      }
    }
    return {
      status: 'manual',
      detail: `Scholarship funds received (${usd(scholarships)}) are at or below the ${usd(THRESHOLD)} threshold — an AUP is not required this year.`,
      citation: CITE,
    }
  },
}
