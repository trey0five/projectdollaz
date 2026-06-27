// ─────────────────────────────────────────────────────────────────────────────
// Monthly budget rollup — pure helper (NO Nest deps, NO import of the off-limits
// budget.spread.ts / budget.service.ts).
//
// READS the already-persisted PeriodBudget.lines.spread (an annotated spread:
// { monthKeys: string[], accounts: SpreadAccountAnnotated[] }) and rolls it up
// INDEPENDENTLY into MTD/YTD budget-by-rollupLine using @finrep/engine ACCT_MAP +
// SCOA_CATEGORIES, resolving each account engine-first (ACCT_MAP[acct] ->
// SCOA_CATEGORIES[cat].{rollupLine,section,includedInTotals}) with a fallback to
// the spread's own annotation for acct===0 label-only rows / unmapped accounts.
//
// KEY ALIGNMENT (highest risk): the keys emitted here are rollupLine keys
// (tuition, dev, instructional, ...) — IDENTICAL to the keys
// MonthlyActualsService.ytd/mtd produce (the revenue_mix/expense_mix components
// are keyed by REVENUE_LINE_KEYS/EXPENSE_LINE_KEYS, i.e. rollupLine keys) — so a
// budgeted line pairs against the correct actual line.
//
// SIGN: months are summed AS-IS, no flip. Verified safe because budget.spread.ts
// sums a.annual as-is into the same annual budget map that the existing annual
// buildOperations pairs against display-positive actuals — the per-month sums are
// in the identical sign basis.
// ─────────────────────────────────────────────────────────────────────────────
import { ACCT_MAP, SCOA_CATEGORIES } from '@finrep/engine'

/** The persisted spread account annotation (subset we read; matches SpreadAccountAnnotated). */
interface SpreadAccountLike {
  acct: number
  label?: string
  category?: string
  section?: 'revenue' | 'expense' | null
  rollupLine?: string | null
  includedInTotals?: boolean
  months?: (number | null)[]
}

/** The persisted lines.spread shape we read (read-only). */
interface PersistedSpread {
  monthKeys?: unknown
  accounts?: unknown
}

/** A single column's budget-by-rollupLine per section. */
export interface MonthlyBudgetColumn {
  revenue: Record<string, number>
  expense: Record<string, number>
}

export interface MonthlyBudgetRollup {
  monthKeys: string[]
  perMonth: Record<string, MonthlyBudgetColumn>
  /** That single calendar-month column, or null when monthKey is not in the spread. */
  budgetMtd(monthKey: string): MonthlyBudgetColumn | null
  /** Cumulative Jul..monthKey (inclusive, string compare), or null when not in the spread. */
  budgetYtd(monthKey: string): MonthlyBudgetColumn | null
}

/** Local 2-dp round (mirrors budget.spread's round2 — kept private, no import). */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Roll the persisted spread up to per-month budget-by-rollupLine. Returns null
 * (=> hasBudget:false; every budget cell em-dash; actuals still render) when the
 * spread is absent/malformed.
 */
export function rollupMonthlyBudget(spread: unknown): MonthlyBudgetRollup | null {
  const s = spread as PersistedSpread | null | undefined
  if (!s || !Array.isArray(s.accounts) || !Array.isArray(s.monthKeys)) return null

  const monthKeys = (s.monthKeys as unknown[]).map((m) => String(m))
  const accounts = s.accounts as SpreadAccountLike[]

  // perMonth[mk] = { revenue:{}, expense:{} }
  const perMonth: Record<string, MonthlyBudgetColumn> = {}
  for (const mk of monthKeys) perMonth[mk] = { revenue: {}, expense: {} }

  for (const a of accounts) {
    if (!a || typeof a !== 'object') continue
    const acct = Number(a.acct)

    // Resolve { line, section, included } engine-first, spread-annotation fallback.
    let line: string | null
    let section: 'revenue' | 'expense' | null
    let included: boolean

    if (Number.isFinite(acct) && acct > 0 && ACCT_MAP[acct] !== undefined) {
      const cat = ACCT_MAP[acct]
      const def = SCOA_CATEGORIES[cat]
      line = def.rollupLine || null
      section = def.section
      included = def.includedInTotals
    } else {
      // acct===0 label-only row, OR acct>0 unmapped: use the spread's own annotation.
      line = a.rollupLine ?? null
      section = a.section ?? null
      included = a.includedInTotals !== false
    }

    // Drop ancillary (includedInTotals:false) + unmapped/empty-rollup rows —
    // matching the SOA totals convention.
    if (!included || !line || !section) continue

    const months = Array.isArray(a.months) ? a.months : []
    for (let i = 0; i < monthKeys.length; i++) {
      const mk = monthKeys[i]
      const raw = months[i]
      if (raw == null) continue
      const v = Number(raw)
      if (!Number.isFinite(v)) continue
      const bucket = perMonth[mk][section]
      bucket[line] = round2((bucket[line] ?? 0) + v)
    }
  }

  const inSpread = (monthKey: string): boolean => monthKeys.includes(monthKey)

  const budgetMtd = (monthKey: string): MonthlyBudgetColumn | null => {
    if (!inSpread(monthKey)) return null
    return perMonth[monthKey]
  }

  const budgetYtd = (monthKey: string): MonthlyBudgetColumn | null => {
    if (!inSpread(monthKey)) return null
    // Cumulative Jul..monthKey inclusive — string compare valid for 'YYYY-MM'.
    const out: MonthlyBudgetColumn = { revenue: {}, expense: {} }
    for (const mk of monthKeys) {
      if (mk > monthKey) continue
      const col = perMonth[mk]
      for (const sect of ['revenue', 'expense'] as const) {
        for (const [k, v] of Object.entries(col[sect])) {
          out[sect][k] = round2((out[sect][k] ?? 0) + v)
        }
      }
    }
    return out
  }

  return { monthKeys, perMonth, budgetMtd, budgetYtd }
}
