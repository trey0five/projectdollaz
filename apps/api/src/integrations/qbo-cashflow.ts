// Live cash-flow + reconciliation — PURE parser + reconcile/runway math. No Nest/DB
// imports; unit-tested in isolation (qbo-cashflow.spec.ts). Mirrors qbo-aging.ts /
// qbo-gl.ts: reads the summary reports STRUCTURALLY (sections keyed on `row.group`,
// header-text as a fallback, tail rows matched by a case-insensitive synonym set) —
// NEVER trusting exact label text, the same "don't depend on QBO honoring a label"
// discipline the GL/aging parsers use. Filter-agnostic + derived-fallback friendly:
// a degenerate CashFlow report degrades to null so the service can synthesize the
// breakdown from our own SCF, while the STRONG reconciliation (off BS + P&L) still runs.

// ── QBO summary-report JSON shapes (only the fields we read) ──────────────────
interface ColDataCell {
  value?: string
  id?: string
}
interface ReportColumn {
  ColTitle?: string
  ColType?: string
}
interface ReportRow {
  group?: string
  type?: string
  ColData?: ColDataCell[]
  Header?: { ColData?: ColDataCell[] }
  Rows?: { Row?: ReportRow[] }
  Summary?: { ColData?: ColDataCell[] }
}
interface SummaryReport {
  Columns?: { Column?: ReportColumn[] }
  Rows?: { Row?: ReportRow[] }
}

/** The native cash-flow breakdown (each field null when the report omits it). */
export interface CashFlowSections {
  operating: number | null
  investing: number | null
  financing: number | null
  /** QBO's own net change in cash (tail row, or operating+investing+financing). */
  netChange: number | null
  cashBegin: number | null
  cashEnd: number | null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Parse a report money string ("1,234.50", "-89.50", "") to a number, or null on junk/empty. */
function money(v: string | null | undefined): number | null {
  if (v == null || String(v).trim() === '') return null
  const n = Number(String(v).replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? round2(n) : null
}

/** The index of the (last) Money column, so subtotal/data rows are read positionally. */
function moneyColIndex(report: SummaryReport): number {
  const cols = report.Columns?.Column ?? []
  let idx = -1
  cols.forEach((c, i) => {
    if ((c.ColType ?? '').toLowerCase() === 'money') idx = i
  })
  return idx
}

/** Read a money cell from a ColData array: the Money column if known, else the last cell. */
function moneyAt(cols: ColDataCell[] | undefined, moneyIdx: number): number | null {
  if (!cols || cols.length === 0) return null
  if (moneyIdx >= 0 && moneyIdx < cols.length) return money(cols[moneyIdx]?.value)
  // Fallback: scan from the right for the first parseable money cell.
  for (let i = cols.length - 1; i >= 1; i--) {
    const m = money(cols[i]?.value)
    if (m != null) return m
  }
  return null
}

/** The row's leading label text — from Header.ColData[0] or ColData[0]. Lowercased. */
function rowLabel(row: ReportRow): string {
  const h = row.Header?.ColData?.[0]?.value
  const c = row.ColData?.[0]?.value
  return String(h ?? c ?? '').trim().toLowerCase()
}

/** Which activity section a row is, keyed on `group` first, header text as fallback. */
function sectionKind(row: ReportRow): 'operating' | 'investing' | 'financing' | null {
  const g = (row.group ?? '').toLowerCase()
  if (g.includes('operating')) return 'operating'
  if (g.includes('investing')) return 'investing'
  if (g.includes('financing')) return 'financing'
  const h = rowLabel(row)
  if (h.includes('operating')) return 'operating'
  if (h.includes('investing')) return 'investing'
  if (h.includes('financing')) return 'financing'
  return null
}

/** A section's subtotal: its Summary money cell, or (fallback) the sum of its leaf rows. */
function sectionTotal(row: ReportRow, moneyIdx: number): number | null {
  const fromSummary = moneyAt(row.Summary?.ColData, moneyIdx)
  if (fromSummary != null) return fromSummary
  // Structural fallback: sum the section's own detail leaf rows.
  let sum = 0
  let found = false
  const walk = (rows: ReportRow[]): void => {
    for (const r of rows) {
      if (r.ColData && r.ColData.length) {
        const m = moneyAt(r.ColData, moneyIdx)
        if (m != null) {
          sum = round2(sum + m)
          found = true
        }
      }
      if (r.Rows?.Row?.length) walk(r.Rows.Row)
    }
  }
  walk(row.Rows?.Row ?? [])
  return found ? sum : null
}

// Tail-row synonym sets (matched case-insensitively via includes — never ===).
const NET_CHANGE_HINTS = ['net cash increase', 'net cash decrease', 'net increase', 'net decrease', 'net change in cash', 'net cash']
const CASH_END_HINTS = ['cash at end', 'end of period', 'ending cash', 'cash and cash equivalents at end']
const CASH_BEGIN_HINTS = ['cash at beginning', 'beginning of period', 'beginning cash', 'cash and cash equivalents at beginning']

function labelMatches(label: string, hints: string[]): boolean {
  return hints.some((h) => label.includes(h))
}

/**
 * Parse a native reports/CashFlow JSON into the activity breakdown. Walks the
 * top-level Rows.Row tree: activity SECTIONS are identified by `group` (header-text
 * fallback) and read from their Summary subtotal; the net-change / begin / end tail
 * rows are matched by a case-insensitive synonym set. Returns null when NONE of the
 * three sections NOR a net-change could be read (a degenerate report → the caller's
 * derived-from-SCF fallback). netChange falls back to operating+investing+financing.
 */
export function parseCashFlow(raw: unknown): CashFlowSections | null {
  const report = (raw ?? {}) as SummaryReport
  const moneyIdx = moneyColIndex(report)
  const out: CashFlowSections = {
    operating: null,
    investing: null,
    financing: null,
    netChange: null,
    cashBegin: null,
    cashEnd: null,
  }

  const walk = (rows: ReportRow[]): void => {
    for (const row of rows) {
      const kind = sectionKind(row)
      if (kind) {
        const total = sectionTotal(row, moneyIdx)
        if (total != null && out[kind] == null) out[kind] = total
        // A matched section may still nest sub-activity rows, but its Summary is the
        // authoritative subtotal — do NOT descend (avoids double-reading tail rows).
        continue
      }
      // Non-section row: a tail data/summary row (net change / begin / end).
      const label = rowLabel(row)
      const val = moneyAt(row.ColData ?? row.Summary?.ColData, moneyIdx)
      if (val != null && label) {
        if (out.cashEnd == null && labelMatches(label, CASH_END_HINTS)) out.cashEnd = val
        else if (out.cashBegin == null && labelMatches(label, CASH_BEGIN_HINTS)) out.cashBegin = val
        else if (out.netChange == null && labelMatches(label, NET_CHANGE_HINTS)) out.netChange = val
      }
      if (row.Rows?.Row?.length) walk(row.Rows.Row)
    }
  }
  walk(report.Rows?.Row ?? [])

  // Derive net-change from the three sections when the tail row was absent.
  if (out.netChange == null && (out.operating != null || out.investing != null || out.financing != null)) {
    out.netChange = round2((out.operating ?? 0) + (out.investing ?? 0) + (out.financing ?? 0))
  }

  const hasAny =
    out.operating != null || out.investing != null || out.financing != null || out.netChange != null
  return hasAny ? out : null
}

/**
 * Extract the company-total NET INCOME from a plain P&L report — the tail "Net
 * Income" summary/data row (case-insensitive includes). Structural: walks the tree
 * and returns the LAST row whose label reads "net income". null when absent.
 */
export function parseNetIncome(raw: unknown): number | null {
  const report = (raw ?? {}) as SummaryReport
  const moneyIdx = moneyColIndex(report)
  let net: number | null = null
  const walk = (rows: ReportRow[]): void => {
    for (const row of rows) {
      const label = rowLabel(row)
      if (label.includes('net income')) {
        const v = moneyAt(row.Summary?.ColData ?? row.ColData, moneyIdx)
        if (v != null) net = v
      }
      const sumLabel = String(row.Summary?.ColData?.[0]?.value ?? '').trim().toLowerCase()
      if (sumLabel.includes('net income')) {
        const v = moneyAt(row.Summary?.ColData, moneyIdx)
        if (v != null) net = v
      }
      if (row.Rows?.Row?.length) walk(row.Rows.Row)
    }
  }
  walk(report.Rows?.Row ?? [])
  return net
}

/**
 * Extract the company-total ENDING CASH from a plain Balance Sheet report — the Bank
 * section total (QBO groups cash accounts under ASSETS > Current Assets > Bank).
 * Structural: finds the section whose group/label reads "bank" and returns its
 * Summary subtotal; falls back to a "total bank" / "cash and cash equivalents"
 * summary row. null when absent.
 */
export function parseBalanceSheetCash(raw: unknown): number | null {
  const report = (raw ?? {}) as SummaryReport
  const moneyIdx = moneyColIndex(report)
  let cash: number | null = null
  const walk = (rows: ReportRow[]): void => {
    for (const row of rows) {
      const g = (row.group ?? '').toLowerCase()
      const label = rowLabel(row)
      const isBankSection = g === 'bank' || g.includes('bank') || label === 'bank'
      if (cash == null && isBankSection) {
        const total = sectionTotal(row, moneyIdx)
        if (total != null) {
          cash = total
          continue
        }
      }
      const sumLabel = String(row.Summary?.ColData?.[0]?.value ?? '').trim().toLowerCase()
      if (
        cash == null &&
        (sumLabel.includes('total bank') || sumLabel.includes('cash and cash equivalents'))
      ) {
        const v = moneyAt(row.Summary?.ColData, moneyIdx)
        if (v != null) cash = v
      }
      if (row.Rows?.Row?.length) walk(row.Rows.Row)
    }
  }
  walk(report.Rows?.Row ?? [])
  return cash
}

// ── Reconciliation (PURE tolerance/tie/differs math) ─────────────────────────
export type CheckKey = 'cash' | 'net_income' | 'cash_change'
export type CheckStatus = 'tied' | 'differs' | 'expected'

/** One reconciliation comparison result (page popover + persisted detail JSON). */
export interface CheckResult {
  key: CheckKey
  label: string
  qbo: number
  computed: number
  diff: number
  status: CheckStatus
  note?: string
  /** STRONG checks only: |diff| beyond the material band (fires the briefing). */
  material?: boolean
}

/** Tolerance base = |computed| (or |qbo| when computed is 0). */
function baseOf(qbo: number, computed: number): number {
  return Math.abs(computed) || Math.abs(qbo)
}
/** Tie band: rounding only — max($1, 0.5% of base). */
function tieTol(base: number): number {
  return Math.max(1, 0.005 * base)
}
/** Material band (fires the briefing): max($1000, 1% of base). */
function materialTol(base: number): number {
  return Math.max(1000, 0.01 * base)
}

/**
 * A STRONG same-TB check (cash balance A / net income B): QBO's own accrual report vs
 * our computed value. `tied` within the rounding band, else `differs`. `material` when
 * the gap clears the higher briefing band. A material differs is a genuine trust breach.
 */
export function strongCheck(key: CheckKey, label: string, qbo: number, computed: number): CheckResult {
  const diff = round2(qbo - computed)
  const base = baseOf(qbo, computed)
  const tied = Math.abs(diff) <= tieTol(base)
  const material = Math.abs(diff) > materialTol(base)
  return { key, label, qbo, computed, diff, status: tied ? 'tied' : 'differs', material }
}

/**
 * The LOOSE check (net change in cash C): QBO's native CashFlow net-change vs our
 * SYNTHESIZED indirect SCF. `tied` within the rounding band, else `expected` (NEVER
 * `differs`) with an honest note — our SCF is reconstructed from a beginning dataset
 * QBO doesn't use, so a moderate gap is normal accrual/method timing, not "broken".
 * Never material — C alone can never raise a briefing signal.
 */
export function looseCheck(
  key: CheckKey,
  label: string,
  qbo: number,
  computed: number,
  noteOverride?: string,
): CheckResult {
  const diff = round2(qbo - computed)
  const base = baseOf(qbo, computed)
  const tied = Math.abs(diff) <= tieTol(base)
  return {
    key,
    label,
    qbo,
    computed,
    diff,
    status: tied ? 'tied' : 'expected',
    note: tied
      ? undefined
      : (noteOverride ??
        'Expected difference — our cash-flow statement is synthesized by the indirect method from the trial balance and can differ from QuickBooks by accrual timing.'),
  }
}

// ── Runway / months-of-cash (PURE, value-safe) ───────────────────────────────
/** Fiscal-year START for an annual period END (one year earlier + 1 day). Jul–Jun. */
export function fyStartISO(periodEndISO: string): string {
  const [y, m, d] = periodEndISO.split('-')
  const prior = new Date(`${Number(y) - 1}-${m}-${d}T00:00:00Z`)
  prior.setUTCDate(prior.getUTCDate() + 1)
  return prior.toISOString().slice(0, 10)
}

/** Whole months elapsed in [fyStart, periodEnd], floored to ≥1 (avoids a runway spike). */
export function monthsElapsedInFy(fyStartISOStr: string, periodEndISO: string): number {
  const a = Date.parse(`${fyStartISOStr}T00:00:00Z`)
  const b = Date.parse(`${periodEndISO}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 1
  return Math.max(1, Math.round((b - a) / (30.44 * 86_400_000)))
}

/** Monthly operating burn = operating cash ÷ months elapsed (signed; null when unknown). */
export function monthlyBurnOf(operating: number | null, monthsElapsed: number): number | null {
  if (operating == null || monthsElapsed <= 0) return null
  return round2(operating / monthsElapsed)
}

/** Months of cash at the current burn = openingCash / |monthlyBurn| when burning; else null. */
export function monthsOfCash(openingCash: number | null, monthlyBurn: number | null): number | null {
  if (openingCash == null || monthlyBurn == null) return null
  if (monthlyBurn >= 0) return null // cash-flow positive → not "burning"
  return round2(openingCash / Math.abs(monthlyBurn))
}
