// §III.A Financial Controls — when the average daily balance exceeds the
// $250,000 FDIC limit, the school must annually review the bank's rating
// (Bauer/Fitch/Moody's/S&P) and confirm it is in the top two. INTAKE:
// avgDailyBalanceOver250k gates the requirement; bankRatingReviewedTopTwo satisfies it.
import type { Rule } from '../types.js'
import { has } from './util.js'

const CITE = 'SUFS AUP §III.A (Financial Controls — bank rating review)'

export const bankRating: Rule = {
  id: 'bank_rating',
  section: 'III',
  title: 'Bank-rating review when balance > $250k',
  citation: CITE,
  severityOnFail: 'reportable',
  kind: 'intake',
  programs: 'all',
  evaluate(facts) {
    const over = facts.inputs.avgDailyBalanceOver250k
    if (!has(over)) {
      return {
        status: 'needs_data',
        detail: 'Attest whether the average daily balance exceeds the $250,000 FDIC insurance limit.',
        citation: CITE,
      }
    }
    if (!over) {
      return {
        status: 'pass',
        detail: 'Average daily balance is at or below the $250,000 FDIC limit — an annual bank-rating review is not required.',
        citation: CITE,
      }
    }
    const reviewed = facts.inputs.bankRatingReviewedTopTwo
    if (!has(reviewed)) {
      return {
        status: 'needs_data',
        detail: 'Balance exceeds $250k — attest whether the bank rating was reviewed and is in the top two (Bauer/Fitch/Moody’s/S&P).',
        citation: CITE,
      }
    }
    if (reviewed) {
      return {
        status: 'pass',
        detail: 'Balance exceeds $250k and an annual review confirmed the bank rating is in the top two.',
        citation: CITE,
      }
    }
    return {
      status: 'reportable',
      detail: 'Balance exceeds the $250k FDIC limit but the bank rating was not reviewed / not confirmed in the top two — reportable exception under §III.A.',
      citation: CITE,
    }
  },
}
