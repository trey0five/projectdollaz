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
  MetricUnavailableReason,
  PeriodFinancials,
  RevenueLineKey,
} from './types.js'

/**
 * Does the snapshot's current-year Statement of Financial Position rest on any
 * real balance-sheet account?
 *
 * The engine ALWAYS builds an SFP from a non-empty trial balance — even a P&L
 * export alone (statement partial 'pl'), where every asset/liability line sums
 * to 0 and net assets are just the school's opening figure + the year's change.
 * Read as-is that gave "Days cash on hand: 0 days — at risk" and a made-up
 * operating reserve. The SFP lineage records the trial-balance rows behind
 * each asset/liability line; when NO line has a single source row, there is
 * no balance sheet to measure. Snapshots without lineage (legacy) are trusted
 * as before. Returns the reason when missing, else null.
 */
export function missingBalanceSheet(bundle: ReportBundle): MetricUnavailableReason | null {
  const sfp = bundle.sfpResults?.cy
  if (sfp === null || sfp === undefined) return 'needs-balance-sheet'
  const lin = bundle.lineage?.sfp?.cy
  if (!lin) return null // legacy snapshot: no lineage to judge by
  const sourced = Object.values(lin).some(
    (l) => l && l.scoaCategory !== null && Array.isArray(l.sources) && l.sources.length > 0,
  )
  if (sourced) return null
  // Nothing sorted into a balance-sheet line. If the unmapped list holds
  // balance-sheet-numbered accounts (1xxx assets / 2xxx liabilities / 3xxx net
  // assets) the sheet is there but awaiting review; otherwise there is none.
  const unsortedBs = (bundle.unmapped ?? []).some((r) => {
    const acct = Math.abs(Math.trunc(Number((r as { acct?: unknown }).acct)))
    if (!Number.isFinite(acct) || acct < 100) return false
    const lead = String(acct)[0]
    return lead === '1' || lead === '2' || lead === '3'
  })
  return unsortedBs ? 'balance-sheet-unsorted' : 'needs-balance-sheet'
}

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
  const missing = missingBalanceSheet(bundle)
  const sfp = missing ? null : bundle.sfpResults.cy
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
    // Only present when missing, so a full bundle's projection is unchanged.
    ...(missing ? { balanceSheetMissing: missing } : {}),
  }
}
