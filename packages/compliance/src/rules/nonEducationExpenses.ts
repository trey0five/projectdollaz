// §V Education-Related Expenses — flag expense categories that are NOT
// education-related and therefore cannot count toward scholarship coverage:
// extracurricular/student-activities, athletics, transportation/busing, and food
// service (after-school care / food / transportation family per the research
// doc). AUTO: reads the analytics-derived expenseLines (same keys the expense_mix
// donut uses). Any such category > 0 -> reportable, listing the amounts.
import type { ExpenseLineKey } from '@finrep/analytics'
import type { Rule } from '../types.js'
import { usd } from './util.js'

const CITE = 'SUFS AUP §V (Education-Related Expenses)'

/**
 * The non-education expense line keys (mirror the analytics EXPENSE_LINE_KEYS).
 * athletics + after-school programs/events, student activities/extracurriculars,
 * transportation/busing, and food service are NOT education-related per the AUP.
 */
const NON_EDUCATION_KEYS: { key: ExpenseLineKey; label: string }[] = [
  { key: 'athletics', label: 'Athletics' },
  { key: 'studActExp', label: 'Student activities / extracurricular' },
  { key: 'bus', label: 'Transportation / busing' },
  { key: 'food', label: 'Food service' },
]

export const nonEducationExpenses: Rule = {
  id: 'non_education_expenses',
  section: 'V',
  title: 'Non-education expense categories flagged',
  citation: CITE,
  severityOnFail: 'reportable',
  kind: 'auto',
  programs: 'all',
  evaluate(facts) {
    const { hasSnapshot, expenseLines } = facts.financials
    if (!hasSnapshot) {
      return {
        status: 'needs_data',
        detail: 'No saved statement snapshot for this period yet — expense categories are needed to flag non-education spending.',
        citation: CITE,
      }
    }
    const offending = NON_EDUCATION_KEYS.filter(({ key }) => (expenseLines[key] ?? 0) > 0)
    if (offending.length === 0) {
      return {
        status: 'pass',
        detail: 'No non-education expense categories (athletics, student activities, transportation, food service) carry a balance.',
        citation: CITE,
      }
    }
    const list = offending
      .map(({ key, label }) => `${label} (${usd(expenseLines[key] ?? 0)})`)
      .join(', ')
    return {
      status: 'reportable',
      detail: `Non-education expense categories carry balances and CANNOT count toward scholarship coverage: ${list}. Reportable exception under §V.`,
      citation: CITE,
    }
  },
}
