// QBO category-review name heuristic — PURE (no Nest imports). Given a
// QuickBooks account name and its P&L section, suggest the SCoA category the
// user probably wants, or null when unsure. Deliberately conservative: a wrong
// suggestion is worse than none, so rules only fire on strong keywords and
// every returned key is PICKABLE (includedInTotals, not 'studActExp') and of
// the matching section — the caller never has to re-validate.

/** Ordered lowercase-substring rules; first match wins. */
const REVENUE_RULES: Array<{ match: (n: string) => boolean; category: string }> = [
  { match: (n) => /tuition|fee/.test(n), category: 'tuition' },
  { match: (n) => /donat|contribut|gift|annual fund|grant/.test(n), category: 'support' },
  { match: (n) => /fundrais|gala|auction|development/.test(n), category: 'development' },
  { match: (n) => /interest/.test(n), category: 'interest' },
  { match: (n) => /invest|dividend|endow/.test(n), category: 'investments' },
  { match: (n) => /book/.test(n), category: 'textbook' },
  { match: (n) => /international/.test(n), category: 'intlRev' },
]

// Expense ordering matters: instructional/admin SALARY checks run before the
// generic cost buckets so "Faculty Payroll" never lands in adminCost. Bare
// "rent"/"bus" get word-boundary guards ("parent", "business" must not match).
const EXPENSE_RULES: Array<{ match: (n: string) => boolean; category: string }> = [
  { match: (n) => /teach|faculty|instructor/.test(n) && /sal|wage|payroll/.test(n), category: 'instrSal' },
  { match: (n) => /classroom|curricul|instructional/.test(n), category: 'instrSup' },
  { match: (n) => /admin/.test(n) && /salar|payroll/.test(n), category: 'adminSal' },
  { match: (n) => /office|software|legal|account|bank fee/.test(n), category: 'adminCost' },
  { match: (n) => /\brent|utilit|maint|repair|janitor|custod|grounds/.test(n), category: 'facilCost' },
  { match: (n) => /insurance|deprec|interest/.test(n), category: 'fixedOther' },
  { match: (n) => /\bbus(?:es|ing)?\b|transport/.test(n), category: 'bus' },
  { match: (n) => /food|cafeter|lunch/.test(n), category: 'food' },
  { match: (n) => /athletic|sport/.test(n), category: 'athletics' },
  { match: (n) => /international/.test(n), category: 'intlExp' },
]

/** Suggest a pickable SCoA category for a QBO account name, or null when unsure. */
export function suggestCategory(name: string, section: 'revenue' | 'expense'): string | null {
  const n = name.toLowerCase()
  const rules = section === 'revenue' ? REVENUE_RULES : EXPENSE_RULES
  for (const rule of rules) {
    if (rule.match(n)) return rule.category
  }
  return null
}
