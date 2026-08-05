// ─────────────────────────────────────────────────────────────
// Standard Chart of Accounts (SCoA) — category definitions as DATA.
//
// Revenue categories carry sign:-1 so their natural credit (negative)
// balances display positive — this encodes the legacy `-(sum)` pattern
// as metadata. Expense categories carry sign:+1.
//
// CRITICAL behavioral notes preserved from the legacy engine:
//   • 'ancillary' (accts 910/911/918) is MAPPED but NEVER summed into
//     SOA totals. It is marked includedInTotals:false so it contributes
//     0 yet is NOT flagged as unmapped.
//   • 'studActExp' has no mapped accounts; its category sum is 0.
//   • tuition is computed from an explicit acct list in calcSOA (not the
//     category sum) to match legacy exactly — see chart.ts / soa.ts.
// ─────────────────────────────────────────────────────────────

export type SCoaCategory =
  // Revenue & support
  | 'tuition'
  | 'intlRev'
  | 'textbook'
  | 'other'
  | 'studActRev'
  | 'investments'
  | 'support'
  | 'interest'
  | 'development'
  // Expenses
  | 'instrSal'
  | 'instrSup'
  | 'adminSal'
  | 'adminCost'
  | 'facilSal'
  | 'facilCost'
  | 'fixedOther'
  | 'bus'
  | 'food'
  | 'athletics'
  | 'ancillary'
  | 'restricted'
  | 'intlExp'
  /** Depreciation expense. Rolls into the fixedOther SOA line exactly as before —
   *  it is broken out only so the cash-flow statement can find the add-back
   *  without naming an account number. */
  | 'deprExpense'
  // Statement-only category with no mapped accounts.
  | 'studActExp'
  // ── Balance sheet ───────────────────────────────────────────────────────────
  // ONE CATEGORY PER SFP LINE, deliberately. The statement's field names are a
  // published contract (packages/analytics reads sfpResults.cy.cash by name; the
  // web renderers list every field), so the vocabulary mirrors them exactly
  // rather than inventing a second naming for the same quantity.
  //
  // These exist because calcSFP used to sum LITERAL account numbers — cash was
  // "accounts 100,101,102,105,107,109" — which meant the balance sheet only ever
  // worked for one chart of accounts. A school whose cash sits in account 1010
  // reported no cash at all, and no amount of categorising could fix it, because
  // nothing about the balance sheet consulted the mapping.
  | 'cash'
  | 'restrictedCash'
  | 'tuitionRec'
  | 'prepaid'
  | 'ppGross'
  | 'accumDepr'
  | 'rouAsset'
  | 'restrictInvst'
  | 'apAccrued'
  | 'leaseCurr'
  | 'studentClubs'
  | 'deferredIntl'
  | 'leaseNonCurr'
  | 'naWithoutDonor'
  | 'naWithDonor'
  /** Opening-equity rows. Never summed into the SFP — the ending balance comes
   *  from the SOA — but they are what tells us a trial balance is COMPLETE. */
  | 'equityOpening'

export type Section = 'revenue' | 'expense' | 'asset' | 'liability' | 'netAssets'

export interface ScoaCategoryDef {
  category: SCoaCategory
  section: Section
  /** -1 for revenue (credit-positive display), +1 for expense. */
  sign: 1 | -1
  /** SOA statement line this category rolls up into. */
  rollupLine: string
  /** Whether this category contributes to SOA totals (ancillary = false). */
  includedInTotals: boolean
  /** The SFP field this category feeds. Balance-sheet categories only. */
  sfpLine?: string
  /** Report the absolute value (liabilities carry credit balances). */
  abs?: boolean
}

/** Sections that describe the balance sheet rather than the year's activity. */
export const BALANCE_SHEET_SECTIONS: readonly Section[] = ['asset', 'liability', 'netAssets']

export function isBalanceSheetCategory(def: ScoaCategoryDef | undefined): boolean {
  return !!def && BALANCE_SHEET_SECTIONS.includes(def.section)
}

export const SCOA_CATEGORIES: Record<SCoaCategory, ScoaCategoryDef> = {
  // ── Revenue & support (sign -1) ──
  tuition: { category: 'tuition', section: 'revenue', sign: -1, rollupLine: 'tuition', includedInTotals: true },
  development: { category: 'development', section: 'revenue', sign: -1, rollupLine: 'dev', includedInTotals: true },
  studActRev: { category: 'studActRev', section: 'revenue', sign: -1, rollupLine: 'studAct', includedInTotals: true },
  textbook: { category: 'textbook', section: 'revenue', sign: -1, rollupLine: 'textbook', includedInTotals: true },
  other: { category: 'other', section: 'revenue', sign: -1, rollupLine: 'other', includedInTotals: true },
  support: { category: 'support', section: 'revenue', sign: -1, rollupLine: 'support', includedInTotals: true },
  intlRev: { category: 'intlRev', section: 'revenue', sign: -1, rollupLine: 'intlRev', includedInTotals: true },
  investments: { category: 'investments', section: 'revenue', sign: -1, rollupLine: 'investments', includedInTotals: true },
  interest: { category: 'interest', section: 'revenue', sign: -1, rollupLine: 'interest', includedInTotals: true },

  // ── Expenses (sign +1) ──
  instrSal: { category: 'instrSal', section: 'expense', sign: 1, rollupLine: 'instructional', includedInTotals: true },
  instrSup: { category: 'instrSup', section: 'expense', sign: 1, rollupLine: 'instructional', includedInTotals: true },
  facilSal: { category: 'facilSal', section: 'expense', sign: 1, rollupLine: 'facilities', includedInTotals: true },
  facilCost: { category: 'facilCost', section: 'expense', sign: 1, rollupLine: 'facilities', includedInTotals: true },
  fixedOther: { category: 'fixedOther', section: 'expense', sign: 1, rollupLine: 'fixedOther', includedInTotals: true },
  // Same rollupLine as fixedOther, so the SOA line is unchanged.
  deprExpense: { category: 'deprExpense', section: 'expense', sign: 1, rollupLine: 'fixedOther', includedInTotals: true },
  intlExp: { category: 'intlExp', section: 'expense', sign: 1, rollupLine: 'intlExp', includedInTotals: true },
  bus: { category: 'bus', section: 'expense', sign: 1, rollupLine: 'bus', includedInTotals: true },
  food: { category: 'food', section: 'expense', sign: 1, rollupLine: 'food', includedInTotals: true },
  studActExp: { category: 'studActExp', section: 'expense', sign: 1, rollupLine: 'studActExp', includedInTotals: true },
  athletics: { category: 'athletics', section: 'expense', sign: 1, rollupLine: 'athletics', includedInTotals: true },
  adminSal: { category: 'adminSal', section: 'expense', sign: 1, rollupLine: 'admin', includedInTotals: true },
  adminCost: { category: 'adminCost', section: 'expense', sign: 1, rollupLine: 'admin', includedInTotals: true },
  restricted: { category: 'restricted', section: 'expense', sign: 1, rollupLine: 'restricted', includedInTotals: true },
  // Mapped but never rolled into SOA totals.
  ancillary: { category: 'ancillary', section: 'expense', sign: 1, rollupLine: '', includedInTotals: false },

  // ── Balance sheet ──
  // `includedInTotals:false` throughout: these never touch a SOA total, and the
  // flag is also what keeps them OUT of the category picker the intake offers for
  // revenue/expense review (MappingCategorySelect filters on it).
  cash: { category: 'cash', section: 'asset', sign: 1, rollupLine: '', includedInTotals: false, sfpLine: 'cash' },
  restrictedCash: { category: 'restrictedCash', section: 'asset', sign: 1, rollupLine: '', includedInTotals: false, sfpLine: 'restrictedCash' },
  tuitionRec: { category: 'tuitionRec', section: 'asset', sign: 1, rollupLine: '', includedInTotals: false, sfpLine: 'tuitionRec' },
  prepaid: { category: 'prepaid', section: 'asset', sign: 1, rollupLine: '', includedInTotals: false, sfpLine: 'prepaid' },
  // PP&E arrives as two categories because the legacy sum was gross + accumulated
  // depreciation (a credit): ppNet = ppGross + accumDepr, exactly as before.
  ppGross: { category: 'ppGross', section: 'asset', sign: 1, rollupLine: '', includedInTotals: false, sfpLine: 'ppGross' },
  accumDepr: { category: 'accumDepr', section: 'asset', sign: 1, rollupLine: '', includedInTotals: false, sfpLine: 'accumDepr' },
  rouAsset: { category: 'rouAsset', section: 'asset', sign: 1, rollupLine: '', includedInTotals: false, sfpLine: 'rouAsset' },
  restrictInvst: { category: 'restrictInvst', section: 'asset', sign: 1, rollupLine: '', includedInTotals: false, sfpLine: 'restrictInvst' },
  apAccrued: { category: 'apAccrued', section: 'liability', sign: 1, rollupLine: '', includedInTotals: false, sfpLine: 'apAccrued', abs: true },
  leaseCurr: { category: 'leaseCurr', section: 'liability', sign: 1, rollupLine: '', includedInTotals: false, sfpLine: 'leaseCurr', abs: true },
  studentClubs: { category: 'studentClubs', section: 'liability', sign: 1, rollupLine: '', includedInTotals: false, sfpLine: 'studentClubs', abs: true },
  deferredIntl: { category: 'deferredIntl', section: 'liability', sign: 1, rollupLine: '', includedInTotals: false, sfpLine: 'deferredIntl', abs: true },
  leaseNonCurr: { category: 'leaseNonCurr', section: 'liability', sign: 1, rollupLine: '', includedInTotals: false, sfpLine: 'leaseNonCurr', abs: true },
  naWithoutDonor: { category: 'naWithoutDonor', section: 'netAssets', sign: 1, rollupLine: '', includedInTotals: false, sfpLine: 'naWithout' },
  naWithDonor: { category: 'naWithDonor', section: 'netAssets', sign: 1, rollupLine: '', includedInTotals: false, sfpLine: 'naWith' },
  equityOpening: { category: 'equityOpening', section: 'netAssets', sign: 1, rollupLine: '', includedInTotals: false },
}
