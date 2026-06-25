// ─────────────────────────────────────────────────────────────
// @finrep/ingestion — Budget Spread parser (browser + node).
//
// Format-AGNOSTIC structural parser for monthly budget spreadsheets,
// with the diocesan "Budget Spread" template recognized as a preset.
// Mirrors excelAdapter's SheetJS usage (XLSX.read(bytes,{type:'array'})
// + sheet_to_json header:1). Pure: bytes in -> BudgetSpread out, NO I/O.
//
// CORRECTNESS RULES (load-bearing):
//  • A row is an ACCOUNT row IFF col[acctIdx] is an integer in [100,9999].
//    The DISCRIMINATOR is the account code, NEVER the label. This keeps the
//    diocesan row [940,'Total Student Activity Expense',0] (a real GL code
//    whose label starts with "Total") while still skipping the section
//    subtotal rows ("Total Tuition and Fees", acct cell null).
//  • Amounts are stored EXACTLY as written (sign-lossless). Revenue is
//    positive; the allowance acct 409 is genuinely -599000 and stays
//    negative. SCoA sign/section semantics are applied LATER at the API
//    rollup step, so the parsed spread is a faithful copy of the file.
//  • months[] preserves blank-vs-zero: a blank cell is null, a 0 cell is 0.
//  • The sheet's OWN printed grand-total rows (Total Operating Revenues /
//    TOTAL OPERATING EXPENDITURES = 5,383,000 each in the diocesan sample)
//    are captured into sheetTotals as the AUTHORITATIVE figures; the
//    account-level rollup (computed downstream) is reconciled against them.
// ─────────────────────────────────────────────────────────────
import * as XLSX from 'xlsx'

export type BudgetSpreadFormat = 'diocesan' | 'generic'

export interface BudgetSpreadAccount {
  /** GL code from the account column (e.g. 401..988). */
  acct: number
  /** Description from the label column (verbatim, trimmed). */
  label: string
  /**
   * Monthly amounts, length === monthKeys.length. null = blank cell
   * (preserves blank-vs-zero); a literal 0 cell stays 0.
   */
  months: (number | null)[]
  /** ANNUAL column value verbatim if present, else sum of non-null months. */
  annual: number
}

export interface BudgetSpreadSkippedRow {
  rowIndex: number
  reason: 'section' | 'subtotal' | 'blank' | 'no-acct'
  text?: string
}

export interface BudgetSpread {
  format: BudgetSpreadFormat
  sheetName: string
  /** ['2025-07',...,'2026-06'] derived from the month-header date serials. */
  monthKeys: string[]
  /** ['Jul 2025',...] for display, parallel to monthKeys. */
  monthLabels: string[]
  /** First monthKey (e.g. '2025-07') or null if undetected. */
  fiscalYearStart: string | null
  /** 0-based raw row index where the month-header dates were found. */
  headerRowIndex: number
  /** Resolved column indices used by the parse. */
  columns: { acct: number; label: number; months: number[]; annual: number | null }
  /** ONLY real GL rows (subtotal / section rows excluded). */
  accounts: BudgetSpreadAccount[]
  /** Rows skipped during the parse, for transparency. */
  skippedRows: BudgetSpreadSkippedRow[]
  /**
   * Authoritative grand-total rows printed on the sheet (diocesan). null when
   * not found (generic files); the API then falls back to the rollup sum.
   */
  sheetTotals: { revenue: number | null; expense: number | null }
  warnings: string[]
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Coerce a cell to a number, stripping $ , and whitespace. Blank -> null. */
function toNumOrNull(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const n = Number(String(v).replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? n : null
}

/** True when a cell looks like an Excel date serial (a number in a sane range). */
function isDateSerial(v: unknown): boolean {
  return typeof v === 'number' && v >= 20000 && v <= 80000
}

/** True when a cell parses as a JS Date or a 'Mon-YYYY' / 'M/YYYY' string. */
function isDateLike(v: unknown): boolean {
  if (isDateSerial(v)) return true
  if (v instanceof Date) return true
  if (typeof v === 'string') {
    const s = v.trim()
    if (!s) return false
    if (/^[A-Za-z]{3,}[-\s/]\d{2,4}$/.test(s)) return true
    if (/^\d{1,2}[-/]\d{2,4}$/.test(s)) return true
  }
  return false
}

/**
 * Convert an Excel date serial to a UTC Date via the 1900 epoch (with the
 * Lotus 1900-leap-year bug baked in for serials >= 60). Avoids XLSX.SSF, which
 * is not reliably reachable across the CJS/ESM interop of the bundled 'xlsx'.
 */
function excelSerialToDate(serial: number): Date {
  const whole = Math.floor(serial)
  // Excel day 1 = 1900-01-01; subtract the phantom 1900-02-29 (serial 60).
  const adjusted = whole >= 60 ? whole - 1 : whole
  const ms = Date.UTC(1899, 11, 31) + adjusted * 86400000
  return new Date(ms)
}

/** Convert a header date cell to a {key:'YYYY-MM', label:'Mon YYYY'} pair. */
function monthFromHeader(v: unknown): { key: string; label: string } | null {
  let y: number | null = null
  let m: number | null = null
  if (isDateSerial(v)) {
    const d = excelSerialToDate(v as number)
    y = d.getUTCFullYear()
    m = d.getUTCMonth() + 1
  } else if (v instanceof Date) {
    y = v.getUTCFullYear()
    m = v.getUTCMonth() + 1
  } else if (typeof v === 'string') {
    const s = v.trim()
    let mm = s.match(/^([A-Za-z]{3,})[-\s/](\d{2,4})$/)
    if (mm) {
      const idx = MONTH_ABBR.findIndex((a) => a.toLowerCase() === mm![1]!.slice(0, 3).toLowerCase())
      if (idx >= 0) {
        m = idx + 1
        y = Number(mm[2]!.length === 2 ? `20${mm[2]}` : mm[2])
      }
    } else {
      mm = s.match(/^(\d{1,2})[-/](\d{2,4})$/)
      if (mm) {
        m = Number(mm[1])
        y = Number(mm[2]!.length === 2 ? `20${mm[2]}` : mm[2])
      }
    }
  }
  if (y == null || m == null || m < 1 || m > 12) return null
  const key = `${y}-${String(m).padStart(2, '0')}`
  const label = `${MONTH_ABBR[m - 1]} ${y}`
  return { key, label }
}

/** Labels of subtotal/section/non-account rows we record (not parsed as accts). */
const SUBTOTAL_LABEL = /^\s*(total|subtotal|net (assets|income)|surplus|deficit)\b/i
const SECTION_LABEL = /^\s*(operating|restricted|ancillary)\b/i

/**
 * Parse the byte payload of an Excel budget-spread file into a BudgetSpread.
 * Throws a clear Error if no month-header row can be located.
 */
export function parseBudgetSpread(arrayBuffer: ArrayBuffer, opts?: { sheet?: string }): BudgetSpread {
  const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array', cellDates: false })

  if (wb.SheetNames.length === 0) throw new Error('File appears empty or unreadable.')

  // Sheet selection: prefer an explicit opt / a /budget spread/i sheet, then fall
  // back to scanning EVERY sheet for one that actually has a month-header row, so
  // a multi-tab workbook whose spread isn't the first sheet still imports.
  const preset = wb.SheetNames.find((n) => /budget\s*spread/i.test(n))
  const ordered = [
    ...(opts?.sheet && wb.SheetNames.includes(opts.sheet) ? [opts.sheet] : []),
    ...(preset ? [preset] : []),
    ...wb.SheetNames,
  ].filter((n, i, a) => a.indexOf(n) === i)

  let sheetName = ''
  let raw: any[][] = []
  let headerRowIndex = -1
  for (const name of ordered) {
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[name]!, {
      header: 1,
      raw: true,
      defval: null,
    }) as any[][]
    if (!grid || grid.length < 3) continue
    // The top row (first ~15) with the MOST date-like cells is the month header.
    let bestCount = 0
    let bestRow = -1
    for (let i = 0; i < Math.min(15, grid.length); i++) {
      const r = grid[i]
      if (!r) continue
      const count = r.filter(isDateLike).length
      if (count > bestCount) {
        bestCount = count
        bestRow = i
      }
    }
    if (bestRow >= 0 && bestCount >= 3) {
      sheetName = name
      raw = grid
      headerRowIndex = bestRow
      break
    }
  }
  if (headerRowIndex < 0) {
    throw new Error(
      'This file doesn’t look like a monthly budget spread. The importer needs a ' +
        'sheet with about 12 month columns across the top (e.g. Jul–Jun) and ' +
        'account rows down the side. ' +
        `Sheet(s) found: ${wb.SheetNames.join(', ')}. ` +
        '(Driver-style budget-builder workbooks aren’t supported yet.)',
    )
  }
  const headerRow = raw[headerRowIndex]!

  // ── Month columns: the contiguous run of date-like cells in the header row. ──
  const dateCols: number[] = []
  for (let c = 0; c < headerRow.length; c++) {
    if (isDateLike(headerRow[c])) dateCols.push(c)
  }
  // Keep the longest contiguous run (handles a stray date in a title cell).
  let runStart = 0
  let bestRun: number[] = []
  for (let k = 0; k < dateCols.length; k++) {
    if (k > 0 && dateCols[k]! !== dateCols[k - 1]! + 1) runStart = k
    const run = dateCols.slice(runStart, k + 1)
    if (run.length > bestRun.length) bestRun = run
  }
  const monthCols = bestRun
  const monthKeys: string[] = []
  const monthLabels: string[] = []
  for (const c of monthCols) {
    const m = monthFromHeader(headerRow[c])
    if (m) {
      monthKeys.push(m.key)
      monthLabels.push(m.label)
    }
  }
  if (monthKeys.length === 0) {
    throw new Error('Month-header row found but no parseable month dates.')
  }

  // ── Annual column: a header cell at/after the month run matching annual/total. ──
  const lastMonthCol = monthCols[monthCols.length - 1]!
  let annualCol: number | null = null
  for (let c = lastMonthCol + 1; c < headerRow.length; c++) {
    const v = headerRow[c]
    if (v != null && typeof v === 'string' && /annual|total|ytd|year|fy/i.test(v) && !isDateLike(v)) {
      annualCol = c
      break
    }
  }
  const warnings: string[] = []
  if (annualCol == null) {
    warnings.push('Annual column not found; annual derived from monthly sums.')
  }

  // ── Account & label columns: scan cols 0..(firstMonthCol-1) below the header. ──
  const firstMonthCol = monthCols[0]!
  const intCount: Record<number, number> = {}
  for (let c = 0; c < firstMonthCol; c++) intCount[c] = 0
  for (let i = headerRowIndex + 1; i < raw.length; i++) {
    const r = raw[i]
    if (!r) continue
    for (let c = 0; c < firstMonthCol; c++) {
      const n = toNumOrNull(r[c])
      if (n != null && Number.isInteger(n) && n >= 100 && n <= 9999) intCount[c]!++
    }
  }
  let acctCol = 0
  let acctBest = -1
  for (let c = 0; c < firstMonthCol; c++) {
    if (intCount[c]! > acctBest) {
      acctBest = intCount[c]!
      acctCol = c
    }
  }
  // Label = first text-bearing column to the RIGHT of acctCol (else col 0).
  let labelCol = acctCol + 1 < firstMonthCol ? acctCol + 1 : Math.max(0, acctCol - 1)
  for (let c = acctCol + 1; c < firstMonthCol; c++) {
    let texts = 0
    for (let i = headerRowIndex + 1; i < raw.length; i++) {
      const v = raw[i]?.[c]
      if (typeof v === 'string' && v.trim() && toNumOrNull(v) == null) texts++
    }
    if (texts > 0) {
      labelCol = c
      break
    }
  }

  // ── Format detection. ──
  const a1 = raw[0]?.[0]
  const isDiocesan =
    /budget\s*spread/i.test(sheetName) && typeof a1 === 'string' && /school/i.test(a1)
  const format: BudgetSpreadFormat = isDiocesan ? 'diocesan' : 'generic'

  // Resolve a row's label string (helper used in both passes).
  const labelOf = (r: any[] | undefined): string => {
    const v = r?.[labelCol]
    return typeof v === 'string' ? v.trim() : v != null ? String(v).trim() : ''
  }

  // ── Locate the OPERATING EXPENDITURES section header (revenue/expense split). ──
  let expenseSectionRow = raw.length
  for (let i = headerRowIndex + 1; i < raw.length; i++) {
    const first = raw[i]?.[0]
    const lbl = labelOf(raw[i])
    if (/operating\s+expend/i.test(String(first ?? '')) || /operating\s+expend/i.test(lbl)) {
      expenseSectionRow = i
      break
    }
  }

  // ── Row classification + account extraction. ──
  const accounts: BudgetSpreadAccount[] = []
  const skippedRows: BudgetSpreadSkippedRow[] = []
  const sheetTotals: { revenue: number | null; expense: number | null } = {
    revenue: null,
    expense: null,
  }

  for (let i = headerRowIndex + 1; i < raw.length; i++) {
    const r = raw[i]
    if (!r) continue
    const acctRaw = toNumOrNull(r[acctCol])
    const label = labelOf(r)
    const annualCell = annualCol != null ? toNumOrNull(r[annualCol]) : null

    const isAcct = acctRaw != null && Number.isInteger(acctRaw) && acctRaw >= 100 && acctRaw <= 9999

    if (isAcct) {
      // DISCRIMINATOR is the account code; keep the row even if label ~ "Total".
      const months: (number | null)[] = monthCols.map((c) => toNumOrNull(r[c]))
      const annual =
        annualCell != null
          ? annualCell
          : months.reduce<number>((s, v) => s + (v ?? 0), 0)
      accounts.push({ acct: acctRaw, label, months, annual })
      continue
    }

    // Non-account row: capture authoritative grand totals while skipping.
    // Diocesan grand REVENUE total is a blank-label annual row that sits
    // immediately before the OPERATING EXPENDITURES section (no "Total ..."
    // text on the sheet), so anchor it positionally.
    if (
      format === 'diocesan' &&
      label === '' &&
      annualCell != null &&
      i < expenseSectionRow &&
      i >= expenseSectionRow - 3
    ) {
      // Take the row CLOSEST to the section header (largest i wins) so an
      // intervening blank zero-annual row never masks the grand total.
      sheetTotals.revenue = annualCell
    }
    if (/total\s+operating\s+revenue/i.test(label)) sheetTotals.revenue = annualCell
    if (/total\s+operating\s+expend/i.test(label)) sheetTotals.expense = annualCell

    const blank = label === '' && annualCell == null && r.slice(firstMonthCol).every((v) => v == null)
    const reason: BudgetSpreadSkippedRow['reason'] = blank
      ? 'blank'
      : SUBTOTAL_LABEL.test(label)
        ? 'subtotal'
        : SECTION_LABEL.test(label)
          ? 'section'
          : 'no-acct'
    skippedRows.push({ rowIndex: i, reason, text: label || undefined })
  }

  return {
    format,
    sheetName,
    monthKeys,
    monthLabels,
    fiscalYearStart: monthKeys[0] ?? null,
    headerRowIndex,
    columns: { acct: acctCol, label: labelCol, months: monthCols, annual: annualCol },
    accounts,
    skippedRows,
    sheetTotals,
    warnings,
  }
}
