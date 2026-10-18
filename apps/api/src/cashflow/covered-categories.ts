// ─────────────────────────────────────────────────────────────────────────────
// Which DERIVED categories a school's own commitments already cover.
//
// Commitments speak the cash vocabulary ('payroll', 'debt_service', …). The
// derived sources — the imported budget spread and the QuickBooks history —
// speak the SCoA vocabulary ('instrSal', 'adminSal', 'facilCost', …). Excluding
// by the commitment's own key alone matched nothing on the derived side, so a
// school with a payroll calendar AND salaries in its budget spread had its
// payroll counted twice and its trough drawn twice as deep as the truth.
//
// The crosswalk is deliberately NARROW: a commitment category only suppresses a
// SCoA category it covers WHOLE. 'payroll' covers every salary line. Debt
// service, insurance and lease payments share 'fixedOther' with costs they do
// not cover, so suppressing it would silently drop real spend; they map to
// nothing here — the LINE-level rules below (LABEL_COVERS) pick out the one
// line inside fixedOther each of them does cover, by its label, and leave the
// rest visible (and adjustable).
// ─────────────────────────────────────────────────────────────────────────────

const COVERS: Record<string, readonly string[]> = {
  payroll: ['instrSal', 'adminSal', 'facilSal'],
}

/**
 * Budget/QBO categories that are not cash at all. Depreciation is an expense on
 * the budget and on the P&L, but no cheque is ever written for it; phasing it as
 * a disbursement would dig a trough out of nothing.
 */
export const NON_CASH_CATEGORIES: readonly string[] = ['deprExpense']

/**
 * The same non-cash rule by LABEL. The category alone is not enough: a spread
 * row's category is fixed at import time, and a chart that mapped "Depreciation"
 * to fixedOther (the demo network did) stores every depreciation row as
 * fixedOther; the QuickBooks history path never sees deprExpense at all — its
 * name heuristic files depreciation under fixedOther. A depreciation or
 * amortization expense is not cash whatever it was filed under.
 */
const NON_CASH_LABEL = /deprec|amorti[sz]/i

/**
 * Expense LINES a commitment stands in for, by label, where the SCoA category is
 * too coarse to say (debt service, insurance and payroll taxes all share
 * fixedOther with costs they do not cover — the reason COVERS above stays
 * narrow). A rule only fires when the school actually recorded that commitment.
 *
 *  • payroll — wage and salary lines filed under a generic category, and the
 *    EMPLOYER payroll taxes, which are remitted on the payroll dates with each
 *    run. A processing fee is a vendor's invoice, not the run. What a payroll
 *    commitment does NOT cover is employee benefits — premiums and retirement
 *    contributions go to carriers on their own schedule — so those stay in, and
 *    `benefitsLeftBesidePayroll` says so on screen rather than guessing.
 *  • debt_service — the interest expense line: a loan payment IS principal plus
 *    interest, so the budgeted interest beside it is the same cash twice.
 *  • insurance — property / liability / general insurance premiums; employee
 *    health and life cover are benefits, and workers' comp rides with payroll
 *    vendors, so neither is assumed covered.
 */
const LABEL_COVERS: Record<string, { match: RegExp; unless?: RegExp }> = {
  payroll: {
    match: /salar|\bwages?\b|payroll|\bfica\b|social security|medicare|\bfuta\b|\bsuta\b|unemployment (?:tax|insurance)/i,
    unless: /\bfees?\b|processing|service/i,
  },
  debt_service: { match: /\binterest\b/i },
  insurance: {
    match: /insurance/i,
    unless: /health|medical|dental|vision|life|disability|employee|benefit|workers|unemployment/i,
  },
}
const BENEFITS_LABEL = /benefit|health|medical|dental|vision|retirement|pension|40[13]\s*\(?[bk]\)?/i

export interface ExpenseLineLike {
  label?: string | null
  category?: string | null
}

/** True for an expense line that is never paid in cash (depreciation, amortization). */
export function isNonCashExpense(line: ExpenseLineLike): boolean {
  const category = String(line.category ?? '').toLowerCase()
  if (NON_CASH_CATEGORIES.some((c) => c.toLowerCase() === category)) return true
  return NON_CASH_LABEL.test(String(line.label ?? ''))
}

/**
 * True for an expense line a recorded commitment already carries, given the
 * EXPANDED covered set from `coveredCategories` (which holds the commitment keys
 * themselves, so 'payroll' in it means a payroll commitment exists).
 */
export function isCoveredExpense(line: ExpenseLineLike, covered: ReadonlySet<string>): boolean {
  const category = String(line.category ?? '').toLowerCase()
  if (covered.has(category)) return true
  const label = String(line.label ?? '')
  for (const [commitment, rule] of Object.entries(LABEL_COVERS)) {
    if (!covered.has(commitment)) continue
    if (rule.match.test(label) && !(rule.unless?.test(label) ?? false)) return true
  }
  return false
}

/** The omission shown when benefits stay in beside a payroll commitment. */
export const PAYROLL_BENEFITS_NOTE = {
  key: 'payroll_benefits_overlap',
  message:
    'Your payroll commitment stands in for salary, wage and employer payroll-tax lines, so those are left out of the modelled spend. Employee benefits stay in on their own schedule \u2014 if your payroll figure already includes benefits, they are counted twice and the low point is deeper than reality.',
} as const

/**
 * True when a payroll commitment exists and a benefits line is still in the
 * modelled spend beside it — the one overlap the forecast cannot settle alone.
 */
export function benefitsLeftBesidePayroll(
  lines: Iterable<ExpenseLineLike>,
  covered: ReadonlySet<string>,
): boolean {
  if (!covered.has('payroll')) return false
  for (const line of lines) {
    if (isNonCashExpense(line) || isCoveredExpense(line, covered)) continue
    if (BENEFITS_LABEL.test(String(line.label ?? ''))) return true
  }
  return false
}

/** The commitment categories plus every SCoA category they wholly cover. */
export function coveredCategories(commitmentCategories: Iterable<string>): string[] {
  const out = new Set<string>()
  for (const c of commitmentCategories) {
    out.add(c)
    for (const scoa of COVERS[String(c).toLowerCase()] ?? []) out.add(scoa)
  }
  return [...out]
}

/** `coveredCategories` as the lowercase lookup set the line predicates take. */
export function coveredSet(commitmentCategories: Iterable<string>): Set<string> {
  return new Set(coveredCategories(commitmentCategories).map((c) => c.toLowerCase()))
}
