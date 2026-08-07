// ─────────────────────────────────────────────────────────────────────────────
// The budget-to-cash bridge: the approved budget says HOW MUCH, its monthly
// phasing says WHEN.
//
// This is the reuse that makes a real projection tractable. KYRO already imports
// a budget spread with per-account monthly columns — `PeriodBudget.lines.spread.
// accounts[].months`, up to 24 of them — and until now nothing read it for cash
// purposes at all. Everything downstream used `evenMonths(annual)`, a flat
// twelfth, which is precisely the assumption that hides a summer trough: it
// spreads instructional supplies evenly when they actually land in July and
// August, and it spreads payroll evenly across months where a ten-month contract
// pays nothing.
//
// WHAT THIS DELIBERATELY DOES NOT DO. It does not turn accrual expense into cash
// with a working-capital bridge — no AR/AP/deferred-revenue timing adjustment.
// That needs a monthly accrual-to-cash reconciliation KYRO does not compute yet,
// and faking one would put an invented lag on every line. Budget phasing is
// treated as a cash proxy and the class says so: every event produced here is
// `modelled`, never `committed`. A school's genuinely committed outflows —
// payroll dates, debt service, insurance instalments — come from the commitment
// calendar, and those are the ones allowed to claim certainty.
// ─────────────────────────────────────────────────────────────────────────────
import { isoToDays, lastDayOfMonth, parseIso, toIso } from './civil.js'
import type { CashEvent } from './types.js'

/** One row of the imported budget spread. Mirrors `SpreadAccountAnnotated`. */
export interface SpreadAccountLike {
  acct?: string | null
  label?: string | null
  category?: string | null
  section?: 'revenue' | 'expense' | null
  includedInTotals?: boolean | null
  /** Per-month amounts in fiscal-month order; `null` = no figure for that month. */
  months?: readonly (number | null)[] | null
  annual?: number | null
}

export interface SpreadDisbursementInput {
  accounts: readonly SpreadAccountLike[]
  /** ISO date of the FIRST fiscal month in `months` (e.g. '2026-07-01'). */
  fiscalYearStart: string
  /**
   * Categories already covered by an explicit commitment. Their spread rows are
   * SKIPPED — see the note on double counting below.
   */
  excludeCategories?: readonly string[]
  /** Day of month the modelled spend is assumed to clear. Default: month end. */
  dayOfMonth?: number | null
}

/**
 * Turn budget spread rows into dated cash events.
 *
 * DOUBLE COUNTING IS THE REAL HAZARD HERE, not precision. A school that records
 * payroll as a commitment AND leaves salaries in the budget spread would see its
 * payroll twice and a trough twice as deep as the truth — worse than no forecast,
 * because it looks authoritative. `excludeCategories` is how the caller resolves
 * that, and the API layer passes every category it already has a commitment for.
 */
export function spreadDisbursements(input: SpreadDisbursementInput): CashEvent[] {
  const start = parseIso(input.fiscalYearStart)
  if (!start) return []
  const excluded = new Set((input.excludeCategories ?? []).map((c) => c.toLowerCase()))
  const out: CashEvent[] = []

  for (const [i, row] of input.accounts.entries()) {
    if (!row) continue
    if (row.section !== 'expense') continue
    if (row.includedInTotals === false) continue
    const category = (row.category ?? 'other').toString()
    if (excluded.has(category.toLowerCase())) continue
    const months = row.months
    if (!Array.isArray(months) || months.length === 0) continue

    for (const [mi, raw] of months.entries()) {
      const amount = Number.isFinite(raw as number) ? (raw as number) : 0
      if (!(amount > 0)) continue
      const total = start.y * 12 + (start.m - 1) + mi
      const y = Math.floor(total / 12)
      const m = (total % 12) + 1
      const dom = input.dayOfMonth ?? lastDayOfMonth(y, m)
      const date = toIso({ y, m, d: Math.min(Math.max(1, dom), lastDayOfMonth(y, m)) })
      if (isoToDays(date) == null) continue
      out.push({
        date,
        amount,
        direction: 'out',
        label: (row.label ?? row.acct ?? 'Budgeted expense').toString(),
        category,
        // MODELLED, never committed — this is budget phasing standing in for cash
        // timing, which is a reasonable proxy and not a known date.
        confidence: 'modelled',
        sourceRef: `budget:${row.acct ?? `row${i}`}`,
      })
    }
  }
  return out
}

/**
 * Budget rows on the REVENUE side, excluding anything the tuition driver already
 * produces. Same modelled-not-committed rule, and the same double-count hazard:
 * leaving tuition in here beside the driver would count a school's largest
 * receipt twice.
 */
export function spreadReceipts(input: SpreadDisbursementInput): CashEvent[] {
  const start = parseIso(input.fiscalYearStart)
  if (!start) return []
  const excluded = new Set((input.excludeCategories ?? []).map((c) => c.toLowerCase()))
  const out: CashEvent[] = []

  for (const [i, row] of input.accounts.entries()) {
    if (!row || row.section !== 'revenue') continue
    if (row.includedInTotals === false) continue
    const category = (row.category ?? 'other').toString()
    if (excluded.has(category.toLowerCase())) continue
    const months = row.months
    if (!Array.isArray(months) || months.length === 0) continue

    for (const [mi, raw] of months.entries()) {
      const amount = Number.isFinite(raw as number) ? (raw as number) : 0
      if (!(amount > 0)) continue
      const total = start.y * 12 + (start.m - 1) + mi
      const y = Math.floor(total / 12)
      const m = (total % 12) + 1
      const dom = input.dayOfMonth ?? lastDayOfMonth(y, m)
      const date = toIso({ y, m, d: Math.min(Math.max(1, dom), lastDayOfMonth(y, m)) })
      if (isoToDays(date) == null) continue
      out.push({
        date,
        amount,
        direction: 'in',
        label: (row.label ?? row.acct ?? 'Budgeted revenue').toString(),
        category,
        confidence: 'modelled',
        sourceRef: `budget:${row.acct ?? `row${i}`}`,
      })
    }
  }
  return out
}
