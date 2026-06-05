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
  // Statement-only category with no mapped accounts.
  | 'studActExp'

export type Section = 'revenue' | 'expense'

export interface ScoaCategoryDef {
  category: SCoaCategory
  section: Section
  /** -1 for revenue (credit-positive display), +1 for expense. */
  sign: 1 | -1
  /** SOA statement line this category rolls up into. */
  rollupLine: string
  /** Whether this category contributes to SOA totals (ancillary = false). */
  includedInTotals: boolean
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
}
