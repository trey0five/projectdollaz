// Prudential red flags (NOT an AUP exception per se) — negative net assets,
// negative cash, an operating deficit, or very low days-cash / going-concern
// signals. Surfaced as `watch` so a school sees financial-health risks alongside
// the AUP checks. AUTO, derived from the analytics-fed financials.
import type { Rule } from '../types.js'

const CITE = 'Prudential / financial-health (not an AUP exception)'

/** Below ~30 days of cash on hand is a going-concern warning band. */
const LOW_DAYS_CASH = 30

export const redFlags: Rule = {
  id: 'red_flags',
  section: 'VI',
  title: 'Prudential financial red flags',
  citation: CITE,
  severityOnFail: 'watch',
  kind: 'auto',
  programs: 'all',
  evaluate(facts) {
    const { hasSnapshot, netAssets, cash, operatingResult, daysCashOnHand } = facts.financials
    if (!hasSnapshot) {
      return {
        status: 'needs_data',
        detail: 'No saved statement snapshot for this period yet — financial-health red flags cannot be evaluated.',
        citation: CITE,
      }
    }
    const flags: string[] = []
    if (netAssets !== null && netAssets < 0) flags.push('negative net assets')
    if (cash !== null && cash < 0) flags.push('negative cash')
    if (operatingResult < 0) flags.push('operating deficit')
    if (daysCashOnHand !== null && daysCashOnHand < LOW_DAYS_CASH) {
      flags.push(`very low days cash on hand (${Math.round(daysCashOnHand)} days)`)
    }
    if (flags.length === 0) {
      return {
        status: 'pass',
        detail: 'No prudential red flags: net assets and cash are non-negative, the period is not in deficit, and liquidity is adequate.',
        citation: CITE,
      }
    }
    return {
      status: 'watch',
      detail: `Financial-health signals to watch: ${flags.join(', ')}. These are prudential warnings, NOT AUP exceptions.`,
      citation: CITE,
    }
  },
}
