// ─────────────────────────────────────────────────────────────────────────────
// Board-friendly labels for the 23 SCoA categories, mirroring @finrep/engine's
// SCOA_CATEGORIES keys/sections. Kept as a small static list here (rather than
// importing the TS engine into JSX) — the keys are stable and the VALUE submitted
// to PATCH /mapping is the SCoA key, which the backend validates via categoryDef.
// Used by ResolveUnmatched to populate the per-line category dropdown.
// ─────────────────────────────────────────────────────────────────────────────

/** @type {{ key: string, label: string, section: 'revenue' | 'expense' }[]} */
export const SCOA_OPTIONS = [
  // ── Revenue ──
  { key: 'tuition', label: 'Tuition & fees', section: 'revenue' },
  { key: 'development', label: 'Development & fundraising', section: 'revenue' },
  { key: 'studActRev', label: 'Student activities (revenue)', section: 'revenue' },
  { key: 'textbook', label: 'Textbooks', section: 'revenue' },
  { key: 'other', label: 'Other revenue', section: 'revenue' },
  { key: 'support', label: 'Parish / diocesan support & grants', section: 'revenue' },
  { key: 'intlRev', label: 'International program (revenue)', section: 'revenue' },
  { key: 'investments', label: 'Investments & endowment', section: 'revenue' },
  { key: 'interest', label: 'Interest & dividends', section: 'revenue' },
  // ── Expense ──
  { key: 'instrSal', label: 'Instructional salaries', section: 'expense' },
  { key: 'instrSup', label: 'Instructional supplies & development', section: 'expense' },
  { key: 'facilSal', label: 'Facilities salaries', section: 'expense' },
  { key: 'facilCost', label: 'Facilities & operations', section: 'expense' },
  { key: 'fixedOther', label: 'Fixed charges / debt / benefits', section: 'expense' },
  { key: 'intlExp', label: 'International program (expense)', section: 'expense' },
  { key: 'bus', label: 'Transportation', section: 'expense' },
  { key: 'food', label: 'Food service', section: 'expense' },
  { key: 'studActExp', label: 'Student activities (expense)', section: 'expense' },
  { key: 'athletics', label: 'Athletics', section: 'expense' },
  { key: 'adminSal', label: 'Administrative salaries', section: 'expense' },
  { key: 'adminCost', label: 'Administrative & office costs', section: 'expense' },
  { key: 'restricted', label: 'Restricted', section: 'expense' },
  { key: 'ancillary', label: 'Ancillary', section: 'expense' },
]

export const SCOA_REVENUE_OPTIONS = SCOA_OPTIONS.filter((o) => o.section === 'revenue')
export const SCOA_EXPENSE_OPTIONS = SCOA_OPTIONS.filter((o) => o.section === 'expense')
