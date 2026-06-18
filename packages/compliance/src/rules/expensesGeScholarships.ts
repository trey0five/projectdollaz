// §V Education-Related Expenses — total education-related expenses must be at
// least the scholarship funds received (excess scholarship dollars over education
// expenses needs written justification). AUTO/INTAKE: totalExpenses is derived;
// scholarshipFundsReceived is an intake figure.
import type { Rule } from '../types.js'
import { has, usd } from './util.js'

const CITE = 'SUFS AUP §V (Education-Related Expenses)'

export const expensesGeScholarships: Rule = {
  id: 'expenses_ge_scholarships',
  section: 'V',
  title: 'Education expenses ≥ scholarship funds received',
  citation: CITE,
  severityOnFail: 'reportable',
  kind: 'auto',
  programs: 'all',
  evaluate(facts) {
    const { totalExpenses, hasSnapshot } = facts.financials
    const scholarships = facts.inputs.scholarshipFundsReceived
    if (!has(scholarships)) {
      return {
        status: 'needs_data',
        detail: 'Enter the scholarship funds received in the intake to compare against total education-related expenses.',
        citation: CITE,
      }
    }
    if (!hasSnapshot) {
      return {
        status: 'needs_data',
        detail: 'No saved statement snapshot for this period yet — total expenses are needed to compare against scholarship funds.',
        citation: CITE,
      }
    }
    if (totalExpenses >= scholarships) {
      return {
        status: 'pass',
        detail: `Total education-related expenses (${usd(totalExpenses)}) cover the scholarship funds received (${usd(scholarships)}).`,
        citation: CITE,
      }
    }
    return {
      status: 'reportable',
      detail: `Scholarship funds received (${usd(scholarships)}) exceed total education-related expenses (${usd(totalExpenses)}). The excess requires written justification — reportable exception.`,
      citation: CITE,
    }
  },
}
