// ─────────────────────────────────────────────────────────────
// Pure adapter: ReportBundle (engine output) -> PeriodFinancials.
//
// Reads the engine's ALREADY-COMPUTED current-year numbers off a snapshot. It
// never re-derives statement math — it just projects the fields the metrics
// need into a stable, decoupled struct. Missing SFP => cash/naWithout null
// (drives `available:false` downstream, never a fabricated zero).
// ─────────────────────────────────────────────────────────────
import type { ReportBundle, SOAResult } from '@finrep/engine'
import type {
  ExpenseLineKey,
  PeriodFinancials,
  RevenueLineKey,
} from './types.js'

export const REVENUE_LINE_KEYS: readonly RevenueLineKey[] = [
  'tuition',
  'dev',
  'studAct',
  'textbook',
  'other',
  'support',
  'intlRev',
  'investments',
  'interest',
]

export const EXPENSE_LINE_KEYS: readonly ExpenseLineKey[] = [
  'instructional',
  'facilities',
  'fixedOther',
  'intlExp',
  'bus',
  'food',
  'studActExp',
  'athletics',
  'admin',
  'restricted',
]

/** Human-readable labels for the mix breakdown components (UI legend). */
export const REVENUE_LINE_LABELS: Record<RevenueLineKey, string> = {
  tuition: 'Tuition & fees',
  dev: 'Development',
  studAct: 'Student activities',
  textbook: 'Textbooks',
  other: 'Other income',
  support: 'Support & grants',
  intlRev: 'International',
  investments: 'Investments',
  interest: 'Interest',
}

export const EXPENSE_LINE_LABELS: Record<ExpenseLineKey, string> = {
  instructional: 'Instructional',
  facilities: 'Facilities',
  fixedOther: 'Fixed & other',
  intlExp: 'International',
  bus: 'Transportation',
  food: 'Food service',
  studActExp: 'Student activities',
  athletics: 'Athletics',
  admin: 'Administration',
  restricted: 'Restricted',
}

function pickRevenue(soa: SOAResult): Record<RevenueLineKey, number> {
  return {
    tuition: soa.tuition,
    dev: soa.dev,
    studAct: soa.studAct,
    textbook: soa.textbook,
    other: soa.other,
    support: soa.support,
    intlRev: soa.intlRev,
    investments: soa.investments,
    interest: soa.interest,
  }
}

function pickExpense(soa: SOAResult): Record<ExpenseLineKey, number> {
  return {
    instructional: soa.instructional,
    facilities: soa.facilities,
    fixedOther: soa.fixedOther,
    intlExp: soa.intlExp,
    bus: soa.bus,
    food: soa.food,
    studActExp: soa.studActExp,
    athletics: soa.athletics,
    admin: soa.admin,
    restricted: soa.restricted,
  }
}

/**
 * Project a ReportBundle's current-year statements into PeriodFinancials.
 * NEVER throws on missing lines: a bundle without a CY SFP yields hasSFP:false
 * and null cash/naWithout/naWith.
 */
export function fromBundle(bundle: ReportBundle): PeriodFinancials {
  const soa = bundle.soaResults.cy
  const sfp = bundle.sfpResults.cy
  const hasSFP = sfp !== null && sfp !== undefined

  return {
    totalRev: soa.totalRev,
    totalExp: soa.totalExp,
    netChange: soa.netChange,
    tuition: soa.tuition,
    revenueLines: pickRevenue(soa),
    expenseLines: pickExpense(soa),
    cash: hasSFP ? sfp.cash : null,
    restrictedCash: hasSFP ? sfp.restrictedCash : null,
    naWithout: hasSFP ? sfp.naWithout : null,
    naWith: hasSFP ? sfp.naWith : null,
    hasSFP,
  }
}
