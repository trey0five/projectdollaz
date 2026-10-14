// ─────────────────────────────────────────────────────────────
// QuickBooks statement EXPORT adapter (issue #31). Accepts a QBO report
// exported to xlsx/csv in its natural form — Profit and Loss / Statement of
// Activity, Balance Sheet / Statement of Financial Position, Budget vs
// Actuals / Budget Overview — and turns it into trial-balance rows "just like
// a TB". Sign, numbering and plug rules are NOT re-derived here: they are the
// shared ./tbConventions.ts the live QBO sync also uses.
//
// DETECTION (isStatementExport): a BANNER in the top rows naming the report,
// OR the STRUCTURAL signature — a KNOWN section label row with no value
// (Income / Expenses / ASSETS / LIABILITIES AND EQUITY …) plus a `Total <Name>`
// subtotal row or a computed row (Net Income / Net Operating Income / Gross
// Profit / TOTAL LIABILITIES AND EQUITY). A plain trial balance has neither.
//
// THE ONE HARD RULE — a plain trial balance is NEVER hijacked: a statement
// export never has Debit | Credit columns, so a grid whose header carries BOTH
// is a trial balance whatever its file name, banner or section rows say
// (hasDebitCreditHeader → detection false, the filename hint ignored, the
// adapter returns null). A sectioned TB (group rows + "Total Assets" rows) is
// already TB-signed; re-signing it would flip every credit.
//
// WALK: hierarchy is tracked by a SECTION STACK, not by indentation — QBO's
// Excel export indents with cell formatting that a grid read loses, so the
// only reliable signals are "a name row with no value OPENS a section" and
// "`Total <Name>` CLOSES it". Leading spaces / empty leading cells are
// tolerated but never required. `Total <X>` is a subtotal ONLY when X is a
// section on the stack or a leaf already seen (a parent printed with its own
// amount) — an account literally named "Total Compensation" is a leaf.
// Computed and blank rows are skipped so nothing is double-counted; leaf rows
// (name + value, zero INCLUDED — mapping needs the full chart, exactly as the
// plain TB keeps its zeros) are kept.
//
// ACCOUNT NUMBERS: an explicit Acct column (when one exists a leading number
// in the name is NOT read — "2026 Annual Fund" is a name), else a leading
// number in the name ("40000 Income"; a bare year 19xx/20xx is only an account
// when a `-`/`:` separator follows it), else SYNTHESISED:
//   · P&L  → QBO_REVENUE_BASE (40000) / QBO_EXPENSE_BASE (60000) +
//     syntheticOffset(name): +1000 + fnv1a(normalised name) % 8000, skipping
//     forward on a collision or a number an explicit account already uses.
//     A hash, not an order, so a later export that inserts a row (or turns a
//     zero into a value) keeps every other account's number. The live sync
//     owns base + 1 … + 999 (base + QBO id) — see tbConventions.ts. Every
//     synthesised {acct, name, section} is recorded in
//     metadata.statement.synthesized so a mapping UI can re-key.
//   · BS   → the engine's fixed default-chart number for the row's section
//     family (BS_ENGINE_ACCT: Bank Accounts → 100, Accounts Receivable → 120,
//     Prepaid → 125, Fixed Assets → 150 / 170, Other Assets → 140, current
//     liabilities → 200, long-term → 260, Equity → 300), collapsing like the
//     live sync so the SFP works with no mapping at all.
//
// COLUMNS: `Actual` wins (Budget vs Actuals), else `Total` (multi-period),
// else the single value column; Budget / over Budget / % columns are
// ignored. `opts.column` picks a named period column ("Jan 2026") instead.
// A Budget-vs-Actuals-typed report whose chosen column is NOT an Actual column
// (a "Budget Overview" is budget only) is REFUSED with StatementExportError —
// a budget must never import as actuals. Values are natural-positive per
// section → the TB sign convention applies.
// ─────────────────────────────────────────────────────────────
import * as XLSX from 'xlsx'
import type { IngestionAdapter, IngestionResult, NormalizedRow, SheetMetadata } from '../types.js'
import type { StatementMetadata, StatementType } from '../types.js'
import { extractSheetMetadata, fiscalYearEndForMonth } from '../metadata.js'
import {
  applyBalancePlug,
  BS_ENGINE_ACCT,
  bsSectionFromGroups,
  normalizeGroup,
  pnlSectionFromGroups,
  QBO_EXPENSE_BASE,
  QBO_REVENUE_BASE,
  QBO_SYNTHETIC_OFFSET,
  QBO_SYNTHETIC_SPAN,
  round2,
  sectionFromAcct,
  sectionSign,
  syntheticOffset,
  type TbSection,
} from './tbConventions.js'

/**
 * A file that IS a statement export but cannot be imported as actuals (a
 * budget-only "Budget Overview"). Distinct from "not a statement" (null) so
 * the registry can surface THIS message instead of the plain adapter's.
 */
export class StatementExportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StatementExportError'
  }
}

export type RawGrid = unknown[][]

export interface StatementParseOptions {
  /** Workbook sheet to parse (xlsx). Default: every statement sheet, merged when it is a P&L + BS pair. */
  sheet?: string
  /** Value column to read by header text, e.g. "Jan 2026" (case-insensitive substring). Default: Actual → Total → the single column. */
  column?: string
  /**
   * Walk the grid even when detection is NEGATIVE (the registry's "plain
   * adapters found no rows" fallback). Rows still need a recognisable section
   * or account number to get a sign, so an unrecognisable file yields null.
   */
  force?: boolean
  /**
   * Statement type known from OUTSIDE the grid — the registry derives it from
   * the FILE NAME ("CMA Statement of Activity Budget vs Actuals 6-30-26.xlsx").
   * Exports trimmed of their banner (the 2026-10-14 customer file: no title row,
   * no section rows, just `Acct | Desc | Actual`) are undetectable from the
   * cells alone, yet the name says exactly what they are.
   */
  typeHint?: StatementType
  /** Receives per-sheet failures the workbook walkers would otherwise swallow. */
  onWarning?: (message: string) => void
}

// ── Cell helpers ──────────────────────────────────────────────────────────────

const text = (v: unknown): string => (v == null ? '' : String(v)).replace(/ /g, ' ').trim()

/**
 * Parse a report money cell. Handles numbers, "1,234.00", "$1,234", "(1,234.00)"
 * and "$(1,234.00)" (accounting negative — Excel's accounting format puts the
 * currency sign OUTSIDE the parens), "-1,234", the EU "1.234,00", and the "-" /
 * "—" zero placeholder. Returns null for text that is not a number (so names,
 * "N/A" and "104.17 %" never read as 0).
 */
export function parseMoney(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  let s = v.replace(/ /g, ' ').trim()
  if (s === '') return null
  if (/^[-–—]$/.test(s)) return 0
  let neg = false
  // A leading currency sign sits OUTSIDE the parens / minus in Excel's
  // accounting format: "$(1,234.00)", "$ -1,234", "-$1,234".
  s = s.replace(/^(-?)\s*\$\s*/, '$1')
  if (/^\(.*\)$/.test(s)) {
    neg = true
    s = s.slice(1, -1).trim().replace(/^\$\s*/, '')
  }
  if (s.startsWith('-')) {
    neg = !neg
    s = s.slice(1)
  }
  s = s.replace(/[$\s]/g, '')
  // EU thousands/decimal — "1.234,00" (last comma AFTER the last dot) or a lone
  // decimal comma "1234,50" (comma + 1–2 digits at the end) — else US commas.
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma >= 0 && ((lastDot >= 0 && lastComma > lastDot) || (lastDot < 0 && /,\d{1,2}$/.test(s)))) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else {
    s = s.replace(/,/g, '')
  }
  if (!/^\d*\.?\d+$/.test(s)) return null
  const n = parseFloat(s)
  if (!Number.isFinite(n)) return null
  return neg ? -n : n
}

/** A cell that reads as money (number, or numeric-looking text). */
const isMoneyCell = (v: unknown): boolean => parseMoney(v) !== null && !(typeof v === 'string' && /^[-–—]$/.test(v))

// ── Detection ─────────────────────────────────────────────────────────────────

const PL_TITLE = /\b(profit\s*(and|&)\s*loss|statement\s+of\s+activit(y|ies)|income\s+statement)\b/i
const BS_TITLE = /\b(balance\s+sheet|statement\s+of\s+financial\s+position)\b/i
const BVA_TITLE = /\b(budget\s*(vs\.?|versus|v\.?)\s*actuals?|budget\s+overview|budget\s+(to|and)\s+actuals?)\b/i

const SECTION_LABELS: ReadonlySet<string> = new Set([
  'income', 'otherincome', 'revenue', 'revenues', 'expenses', 'expense', 'otherexpenses',
  'costofgoodssold', 'cogs', 'assets', 'currentassets', 'fixedassets', 'otherassets',
  'liabilitiesandequity', 'liabilities', 'currentliabilities', 'longtermliabilities', 'equity',
])
const COMPUTED_LABELS: ReadonlySet<string> = new Set([
  'netincome', 'netoperatingincome', 'netotherincome', 'grossprofit', 'netrevenue',
  'totalliabilitiesandequity', 'totalassets', 'totalliabilities', 'totalequity',
  'totalincome', 'totalexpenses', 'netincomeloss', 'changeinnetassets',
])
const TOTAL_ROW = /^total\s+\S/i
/** Section labels that only a P&L carries (type inference when there is no banner). */
const PNL_LABELS: ReadonlySet<string> = new Set([
  'income', 'otherincome', 'revenue', 'revenues', 'expenses', 'expense', 'otherexpenses', 'costofgoodssold', 'cogs',
])

/** Statement type from banner text, or undefined. BVA is checked FIRST: its banner also says "Profit and Loss". */
export function detectStatementType(bannerText: string): StatementType | undefined {
  if (BVA_TITLE.test(bannerText)) return 'bva'
  if (BS_TITLE.test(bannerText)) return 'bs'
  if (PL_TITLE.test(bannerText)) return 'pl'
  return undefined
}

/** First non-empty text cell of a row (the name column, wherever indentation put it). */
function firstText(row: unknown[]): string {
  for (const c of row) {
    const t = text(c)
    if (t !== '') return t
  }
  return ''
}

/** Banner = the non-empty cell strings of the top rows (before any money cell appears). */
function bannerCells(grid: RawGrid, limit = 10): string[] {
  const out: string[] = []
  for (let i = 0; i < Math.min(limit, grid.length); i++) {
    const r = grid[i]
    if (!r) continue
    if (r.some((c) => typeof c === 'number')) break
    for (const c of r) {
      const t = text(c)
      if (t !== '') out.push(t)
    }
  }
  return out
}

const DEBIT_HEADER = /^(debits?|dr\.?)$/i
const CREDIT_HEADER = /^(credits?|cr\.?)$/i

/**
 * THE trial-balance tell: a header row (top 20 rows) carrying BOTH a Debit and
 * a Credit column. No QuickBooks statement export has them, so when this is
 * true the grid is a plain TB whatever its file name, banner or section rows
 * say — detection is false, the filename hint is ignored, the walk never runs.
 */
export function hasDebitCreditHeader(grid: RawGrid, limit = 20): boolean {
  for (let i = 0; i < Math.min(limit, grid.length); i++) {
    const r = grid[i]
    if (!r) continue
    let debit = false
    let credit = false
    for (const c of r) {
      if (typeof c !== 'string') continue
      const t = text(c)
      if (DEBIT_HEADER.test(t)) debit = true
      else if (CREDIT_HEADER.test(t)) credit = true
    }
    if (debit && credit) return true
  }
  return false
}

/** A value-less row whose label is a KNOWN P&L / BS section (Income, Expenses, ASSETS …). */
export function hasKnownSectionRow(grid: RawGrid): boolean {
  for (const r of grid) {
    if (!r) continue
    const name = firstText(r)
    if (name === '') continue
    const hasMoney = r.some((c) => typeof c === 'number' || (typeof c === 'string' && c !== name && isMoneyCell(c)))
    if (!hasMoney && SECTION_LABELS.has(normalizeGroup(name))) return true
  }
  return false
}

/**
 * Statement type from a FILE NAME ("CMA Statement of Activity Budget vs
 * Actuals 6-30-26.xlsx" → 'bva'). QuickBooks names its exports after the
 * report, and a banner-less export is otherwise indistinguishable from a TB.
 * Only a HINT: a Debit | Credit grid overrides it (see hasDebitCreditHeader).
 */
export function statementTypeFromFileName(fileName: string): StatementType | undefined {
  return detectStatementType(fileName.replace(/[_.\-]+/g, ' '))
}

/**
 * Is this grid a QuickBooks statement export? Banner title, OR the structural
 * signature (a value-less KNOWN section label + a `Total <Name>` / computed
 * row). Never when the grid has Debit | Credit columns.
 */
export function isStatementExport(grid: RawGrid): boolean {
  if (!grid || grid.length < 3) return false
  if (hasDebitCreditHeader(grid)) return false
  if (detectStatementType(bannerCells(grid).join(' ')) !== undefined) return true
  let sectionRows = 0
  let totalRows = 0
  let computedRows = 0
  for (const r of grid) {
    if (!r) continue
    const name = firstText(r)
    if (name === '') continue
    const key = normalizeGroup(name)
    const hasMoney = r.some((c) => typeof c === 'number' || (typeof c === 'string' && c !== name && isMoneyCell(c)))
    if (COMPUTED_LABELS.has(key)) computedRows++
    else if (TOTAL_ROW.test(name)) totalRows++
    else if (!hasMoney && SECTION_LABELS.has(key)) sectionRows++
  }
  return sectionRows > 0 && totalRows + computedRows > 0
}

// ── Header / column detection ─────────────────────────────────────────────────

interface ColumnPlan {
  /** Index of the money column to read. */
  value: number
  /** Header text of that column ('' when there was no header row). */
  valueHeader: string
  /** Explicit account-number column, or -1. */
  acct: number
  /** Explicit description column (when the export has Acct | Desc | …), or -1. */
  desc: number
  /** Row index of the header row, or -1. */
  headerRow: number
  /** First body row. */
  startRow: number
}

const MONTH_TOKEN = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{2,4}\b/i
const HEADER_TOKEN =
  /^(actual|actuals|budget|total|totals|amount|balance|net|over\s+budget|%\s*of\s+budget|%\s*of\s+income|acct|account|account\s*(#|no\.?|number)|number|no\.?|#|description|desc|name|account\s*name|distribution\s+account|memo\/description|debit|credit|ytd|year\s+to\s+date)$/i

const isAcctHeader = (h: string): boolean =>
  /^(number|account|acct|acc|gl|no\.?|#|account\s*(#|no\.?|number))$/i.test(h)
const isDescHeader = (h: string): boolean =>
  /^(description|desc|name|account\s*name|distribution\s+account)$/i.test(h)

/**
 * Does this row look like the column-header row? Header tokens (Actual / Total
 * / Acct / Desc …) or period-column labels ("Jul 2025"). A row whose ONLY cell
 * is a month token ("July 2025 - June 2026") is the banner's period line, not a
 * header — it must stay in the banner so the period is read from it.
 */
function headerCandidate(row: unknown[]): boolean {
  let headerTokens = 0
  let monthTokens = 0
  let cells = 0
  for (const c of row) {
    const t = text(c)
    if (t === '') continue
    if (typeof c === 'number') return false
    cells++
    if (HEADER_TOKEN.test(t)) headerTokens++
    else if (MONTH_TOKEN.test(t)) monthTokens++
  }
  if (headerTokens > 0) return true
  return monthTokens > 0 && cells > 1
}

/** Index of the first body row: the first row with a money cell beyond the name. */
function firstMoneyRow(grid: RawGrid): number {
  for (let i = 0; i < grid.length; i++) {
    const r = grid[i]
    if (!r) continue
    const name = firstText(r)
    if (name === '') continue
    if (r.some((c) => typeof c === 'number' || (typeof c === 'string' && text(c) !== name && isMoneyCell(c)))) {
      return i
    }
  }
  return -1
}

function planColumns(grid: RawGrid, column?: string): ColumnPlan {
  const bodyStart = firstMoneyRow(grid)
  // The header row is the LAST header-looking row before the first money row.
  let headerRow = -1
  const scanTo = bodyStart >= 0 ? bodyStart : Math.min(20, grid.length)
  for (let i = 0; i < scanTo; i++) {
    const r = grid[i]
    if (r && headerCandidate(r)) headerRow = i
  }

  // Body start: after the header row; with NO header row, at the first KNOWN
  // section row ("Income") above the first money row — so the opening section
  // is walked and the banner (company / title / period) stays above it.
  let startRow = headerRow >= 0 ? headerRow + 1 : Math.max(bodyStart, 0)
  if (headerRow < 0 && bodyStart > 0) {
    for (let i = 0; i < bodyStart; i++) {
      const r = grid[i]
      if (r && SECTION_LABELS.has(normalizeGroup(firstText(r)))) {
        startRow = i
        break
      }
    }
  }
  const plan: ColumnPlan = {
    value: -1,
    valueHeader: '',
    acct: -1,
    desc: -1,
    headerRow,
    startRow,
  }

  // Money density per column over the body — the no-header fallback and the
  // tie-breaker between equally-named columns.
  const density: number[] = []
  for (let i = plan.startRow; i < grid.length; i++) {
    const r = grid[i]
    if (!r) continue
    r.forEach((c, idx) => {
      if (typeof c === 'number' || (typeof c === 'string' && idx > 0 && isMoneyCell(c))) {
        density[idx] = (density[idx] ?? 0) + 1
      }
    })
  }
  const densest = (): number => {
    let best = -1
    let bestN = 0
    density.forEach((n, idx) => {
      if (n > bestN) {
        best = idx
        bestN = n
      }
    })
    return best
  }

  if (headerRow >= 0) {
    const headers = (grid[headerRow] ?? []).map((c) => text(c))
    // STACKED HEADERS: QuickBooks puts the amount label on the row ABOVE the
    // "Acct | Desc" row (customer file 2026-10-14: `_ | _ | Actual` over
    // `Acct | Desc | _`). Fill blank header cells from up to two rows above,
    // nearest first, so "Actual" is found where it was printed.
    for (let up = 1; up <= 2; up++) {
      const above = headerRow - up >= 0 ? (grid[headerRow - up] ?? []).map((c) => text(c)) : []
      above.forEach((h, idx) => {
        if (h !== '' && (headers[idx] ?? '') === '') headers[idx] = h
      })
    }
    headers.forEach((h, idx) => {
      if (h === '') return
      if (plan.acct < 0 && isAcctHeader(h)) plan.acct = idx
      else if (plan.desc < 0 && isDescHeader(h)) plan.desc = idx
    })
    const lower = headers.map((h) => h.toLowerCase())
    const pick = (pred: (h: string) => boolean): number => {
      let found = -1
      lower.forEach((h, idx) => {
        if (found < 0 && h !== '' && idx !== plan.acct && idx !== plan.desc && pred(h)) found = idx
      })
      return found
    }
    const isBudgetish = (h: string): boolean => /budget|%|variance|over|under|diff/.test(h)
    let value = -1
    if (column) {
      const want = column.toLowerCase().trim()
      // "Jan 2026" on a monthly Budget-vs-Actuals → the "Jan 2026 Actual" column.
      value = pick((h) => h.includes(want) && h.includes('actual'))
      if (value < 0) value = pick((h) => h.includes(want) && !isBudgetish(h))
      if (value < 0) value = pick((h) => h.includes(want))
    }
    if (value < 0) value = pick((h) => /\bactual/.test(h) && /\btotal\b/.test(h))
    if (value < 0) value = pick((h) => /^actuals?$/.test(h) || (/\bactual/.test(h) && !isBudgetish(h)))
    if (value < 0) value = pick((h) => /^total$/.test(h) || (/\btotal\b/.test(h) && !isBudgetish(h)))
    if (value < 0) value = pick((h) => /^(amount|balance|net|ytd|year to date)$/.test(h))
    if (value < 0) {
      // Single-value exports label the money column with the date range or
      // nothing at all: the densest money column that is NOT the account /
      // description column (a numbered chart makes column A all-numeric too).
      let d = -1
      let dN = 0
      density.forEach((n, idx) => {
        if (idx !== plan.acct && idx !== plan.desc && n > dN) { d = idx; dN = n }
      })
      if (d >= 0 && !isBudgetish(lower[d] ?? '')) value = d
    }
    if (value < 0) value = pick((h) => !isBudgetish(h) && (density[lower.indexOf(h)] ?? 0) > 0)
    plan.value = value
    plan.valueHeader = value >= 0 ? headers[value] ?? '' : ''
  } else {
    // No header row: the densest money column, never column 0 — in every QBO
    // export column 0 holds the names (and, numbered, the account column).
    let best = -1
    let bestN = 0
    density.forEach((n, idx) => {
      if (idx > 0 && n > bestN) {
        best = idx
        bestN = n
      }
    })
    plan.value = best >= 0 ? best : densest()
  }
  return plan
}

// ── The walk ──────────────────────────────────────────────────────────────────

interface Leaf {
  name: string
  explicitAcct: number | null
  value: number
  /** Enclosing section labels, outermost → innermost. */
  groups: string[]
  rowIndex: number
}

const LEADING_ACCT = /^(\d{3,6})(\s*([-–:.·])?\s+)(.+)$/
const YEAR_LIKE = /^(19|20)\d\d$/

/**
 * "40000 Income" → 40000 / "Income". A bare YEAR ("2026 Annual Fund") is a
 * name, not an account, unless a `-` / `:` separator says otherwise
 * ("2026 - Fund"). "2025-26 Tuition" never matches (no space after the dash).
 */
function splitLeadingAcct(name: string): { acct: number | null; rest: string } {
  const m = name.match(LEADING_ACCT)
  if (!m) return { acct: null, rest: name }
  const digits = m[1]!
  const sep = m[3] ?? ''
  if (YEAR_LIKE.test(digits) && !/^[-–:]$/.test(sep)) return { acct: null, rest: name }
  const n = parseInt(digits, 10)
  return Number.isFinite(n) && n > 0 ? { acct: n, rest: m[4]!.trim() } : { acct: null, rest: name }
}

/** Explicit Acct cell → its LEADING digit run ("4000-10" → 4000, "4000" → 4000), or null. */
function explicitAcctOf(cell: string): number | null {
  const m = cell.match(/^\s*(\d+)/)
  if (!m) return null
  const n = parseInt(m[1]!, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Equity lines a BALANCE SHEET prints for the current-year result — QuickBooks
 * names it "Net Income" for a company and "Net Revenue" / "Net Income (Loss)" /
 * "Change in Net Assets" for a nonprofit. Kept as the equity row on a BS-only
 * upload (the sheet balances on its own) and DROPPED again when the BS is
 * merged with a P&L (the P&L leaves ARE that result).
 */
export const BS_RESULT_LABELS: ReadonlySet<string> = new Set([
  'netincome', 'netincomeloss', 'netrevenue', 'netrevenueloss', 'changeinnetassets', 'netassets',
])

interface Walk {
  leaves: Leaf[]
  warnings: string[]
}

/**
 * Walk the body rows with a section stack. Emits every leaf (name + value)
 * once; opens a section on a value-less name row; closes on `Total <Name>`
 * when Name is a section on the stack (popping back to it — resilient to a
 * stray value-less leaf that never got a Total) or a leaf already seen (a
 * parent printed with its own amount, then its children, then `Total Parent`);
 * any other `Total …` row is an ordinary account. Skips computed rows. A row
 * whose value cell holds UNPARSEABLE text is a bad leaf (warned), never a
 * section opener.
 */
function walkLeaves(grid: RawGrid, plan: ColumnPlan, type: StatementType): Walk {
  const leaves: Leaf[] = []
  const warnings: string[] = []
  const stack: string[] = []
  const seenLeaves = new Set<string>()
  const badLeaves: string[] = []
  const popTo = (label: string): boolean => {
    const want = normalizeGroup(label)
    const at = stack.map(normalizeGroup).lastIndexOf(want)
    if (at < 0) return false
    stack.length = at
    return true
  }

  for (let i = plan.startRow; i < grid.length; i++) {
    const r = grid[i]
    if (!r) continue
    let rawName = ''
    if (plan.desc >= 0) rawName = text(r[plan.desc])
    if (rawName === '') {
      // First text cell that is not the acct / value column.
      for (let idx = 0; idx < r.length; idx++) {
        if (idx === plan.value || idx === plan.acct) continue
        const t = text(r[idx])
        if (t !== '' && (typeof r[idx] !== 'number')) {
          rawName = t
          break
        }
      }
    }
    const explicitCell = plan.acct >= 0 ? text(r[plan.acct]) : ''
    if (rawName === '' && explicitCell === '') continue

    const key = normalizeGroup(rawName)
    const valueCell = plan.value >= 0 ? r[plan.value] : undefined
    const value = parseMoney(valueCell)

    // `Total <X>`: a subtotal only when X is a section on the stack or a leaf
    // already printed; otherwise it is an account that happens to be named
    // "Total …" ("Total Compensation") and falls through as a leaf.
    if (TOTAL_ROW.test(rawName)) {
      const label = rawName.replace(/^total\s+/i, '')
      if (popTo(label)) continue
      if (COMPUTED_LABELS.has(key)) continue
      if (seenLeaves.has(normalizeGroup(label))) continue
      if (value === null) continue
    }
    // Computed rows: a P&L's Net Income / Gross Profit / Net Operating Income
    // are derived from the leaves and are NEVER rows. On a BALANCE SHEET the
    // current-year result line inside Equity (Net Income / Net Revenue /
    // Change in Net Assets …) is what makes the sheet balance — kept as an
    // equity row (dropped again when merged with a P&L).
    if (COMPUTED_LABELS.has(key)) {
      if (!(type === 'bs' && BS_RESULT_LABELS.has(key) && value !== null)) continue
    }

    if (value === null) {
      const cellText = text(valueCell)
      if (cellText !== '') {
        // A name WITH something in the value column that is not money: a bad
        // leaf ("N/A", a stray note), never a section opener.
        badLeaves.push(`${rawName || explicitCell} = "${cellText}"`)
        continue
      }
      // A name with no value opens a section (or is a stray label).
      if (rawName !== '' && explicitCell === '') stack.push(rawName)
      continue
    }

    let explicitAcct: number | null = null
    let name = rawName
    if (explicitCell !== '') explicitAcct = explicitAcctOf(explicitCell)
    // A leading number in the NAME is only an account when the export has no
    // Acct column of its own — with one, "2026 Annual Fund" is just a name.
    if (explicitAcct == null && plan.acct < 0) {
      const split = splitLeadingAcct(rawName)
      if (split.acct != null) explicitAcct = split.acct
    }
    if (name === '' && explicitCell !== '') name = explicitCell
    seenLeaves.add(normalizeGroup(name))
    leaves.push({ name, explicitAcct, value, groups: [...stack], rowIndex: i })
  }
  if (badLeaves.length) {
    warnings.push(
      `${badLeaves.length} row(s) had text instead of an amount in the value column and were skipped: ${badLeaves.slice(0, 5).join(', ')}${badLeaves.length > 5 ? '…' : ''}`,
    )
  }
  return { leaves, warnings }
}

// ── Section + numbering ───────────────────────────────────────────────────────

function sectionOf(leaf: Leaf, type: StatementType): TbSection | undefined {
  if (type === 'bs') return bsSectionFromGroups(leaf.groups) ?? (leaf.explicitAcct != null ? sectionFromAcct(leaf.explicitAcct) : undefined)
  const byGroup = pnlSectionFromGroups(leaf.groups)
  if (byGroup) return byGroup
  if (leaf.explicitAcct != null) {
    const s = sectionFromAcct(leaf.explicitAcct)
    if (s === 'revenue' || s === 'expense') return s
  }
  return undefined
}

/** Balance-sheet family → engine fixed number, from the innermost section labels + the row name. */
function bsEngineAcct(leaf: Leaf, section: TbSection): number {
  const name = leaf.name.toLowerCase()
  const groups = leaf.groups.map(normalizeGroup)
  const inner = [...groups].reverse()
  const has = (re: RegExp): boolean => inner.some((g) => re.test(g))
  if (section === 'equity') return BS_ENGINE_ACCT.equity
  if (section === 'liability') {
    return has(/longterm/) ? BS_ENGINE_ACCT.longTermLiability : BS_ENGINE_ACCT.currentLiability
  }
  if (/accumulated|depreciation|amortization/.test(name)) return BS_ENGINE_ACCT.accumulatedDepreciation
  if (/prepaid/.test(name)) return BS_ENGINE_ACCT.prepaid
  if (/undeposited/.test(name)) return BS_ENGINE_ACCT.undepositedFunds
  if (has(/^bank/)) return BS_ENGINE_ACCT.bank
  if (has(/receivable/)) return BS_ENGINE_ACCT.receivable
  if (has(/^fixedassets?$|propertyandequipment|propertyplantandequipment/)) return BS_ENGINE_ACCT.fixedAsset
  if (has(/^otherassets?$|longtermassets?/)) return BS_ENGINE_ACCT.otherAsset
  if (has(/othercurrentassets?/)) return BS_ENGINE_ACCT.otherCurrentAsset
  return BS_ENGINE_ACCT.otherCurrentAsset
}

export interface StatementSheetResult extends IngestionResult {
  metadata: SheetMetadata & { statement: StatementMetadata }
}

// ── Period from the banner ────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}
const pad2 = (n: number): string => String(n).padStart(2, '0')
const lastDay = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate()

/**
 * Every date-ish token in the banner, in order, as YYYY-MM-DD. "June 30, 2026"
 * / "Jun 30 2026" → that day; "July 2025" → month END; "6/30/2026" → that day.
 * A range ("July 2025 - June 2026", "Jul 1, 2025 - Jun 30, 2026") therefore
 * yields [start, end] and the LAST token is the period end.
 */
export function bannerDates(bannerText: string): string[] {
  return bannerDateTokens(bannerText).map((t) => t.iso)
}

interface DateToken {
  at: number
  /** YYYY-MM-DD; a day-less "July 2025" resolves to the month END. */
  iso: string
  /** YYYY-MM-01 for a day-less token (a range START), else the same as iso. */
  first: string
}

function bannerDateTokens(bannerText: string): DateToken[] {
  const out: DateToken[] = []
  const named = /\b([A-Za-z]{3,9})\.?\s+(?:(\d{1,2})(?:st|nd|rd|th)?,?\s+)?(20\d{2})\b/g
  let m: RegExpExecArray | null
  while ((m = named.exec(bannerText)) !== null) {
    const mo = MONTHS[m[1]!.slice(0, 3).toLowerCase()]
    if (!mo || !/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(m[1]!)) continue
    const y = parseInt(m[3]!, 10)
    const hadDay = m[2] != null
    const d = hadDay ? parseInt(m[2]!, 10) : lastDay(y, mo)
    if (d < 1 || d > 31) continue
    const iso = `${y}-${pad2(mo)}-${pad2(d)}`
    out.push({ at: m.index, iso, first: hadDay ? iso : `${y}-${pad2(mo)}-01` })
  }
  const numeric = /\b(\d{1,2})[/\-](\d{1,2})[/\-](20\d{2})\b/g
  while ((m = numeric.exec(bannerText)) !== null) {
    const mo = parseInt(m[1]!, 10)
    const d = parseInt(m[2]!, 10)
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      const iso = `${m[3]}-${pad2(mo)}-${pad2(d)}`
      out.push({ at: m.index, iso, first: iso })
    }
  }
  return out.sort((a, b) => a.at - b.at)
}

/** Jul–Jun fiscal year a YYYY-MM-DD period end belongs to. */
function fiscalYearOfEnd(iso: string): number {
  const y = parseInt(iso.slice(0, 4), 10)
  const m = parseInt(iso.slice(5, 7), 10)
  return parseInt(fiscalYearEndForMonth(y, m).slice(0, 4), 10)
}

function detectBasis(bannerText: string): 'accrual' | 'cash' | undefined {
  if (/\baccrual\s+basis\b/i.test(bannerText)) return 'accrual'
  if (/\bcash\s+basis\b/i.test(bannerText)) return 'cash'
  return undefined
}

// ── Grid → result ─────────────────────────────────────────────────────────────

/**
 * Parse ONE statement grid into TB rows. Returns null when the grid is not a
 * statement (and `force` is off) or yields no signed rows.
 */
export function parseStatementGrid(
  grid: RawGrid,
  sheetName: string,
  opts: StatementParseOptions = {},
): StatementSheetResult | null {
  if (!grid || grid.length < 3) return null
  // A Debit | Credit grid is a trial balance, full stop — no banner, file-name
  // hint or `force` may re-sign it (B1 / B2).
  if (hasDebitCreditHeader(grid)) return null
  let type = detectStatementType(`${bannerCells(grid).join(' ')} ${sheetName}`) ?? opts.typeHint
  const detected = type !== undefined || isStatementExport(grid)
  // `force` (the registry's "plain adapter found nothing" fallback) still needs
  // REAL statement evidence — a known section row — before walking a flat
  // grid; signing by leading digit alone would silently "succeed" on an
  // unlabeled TB whose real error the caller should see instead (B3).
  if (!detected && !(opts.force && hasKnownSectionRow(grid))) return null

  const plan = planColumns(grid, opts.column)
  if (plan.value < 0) return null
  // A Budget-vs-Actuals-typed report must be read from an ACTUAL column: the
  // "Budget Overview" report shares the banner family but is budget only, and
  // a budget must never import as actuals. (An explicit opts.column is the
  // caller's deliberate choice and is honoured.)
  if (type === 'bva' && !opts.column && !/actual/i.test(plan.valueHeader)) {
    throw new StatementExportError(
      `Budget vs Actuals export has no Actual column (columns seen: ${(grid[plan.headerRow] ?? []).map((c) => text(c)).filter(Boolean).join(' | ') || 'none'}). A Budget Overview is budget only — export the Budget vs. Actuals report, or the Profit and Loss.`,
    )
  }
  // The banner proper: the rows ABOVE the header row (or above the body when
  // there is no header), so header tokens never pollute the title/period text.
  const banner = bannerCells(grid, plan.headerRow >= 0 ? plan.headerRow : plan.startRow)
  const bannerText = banner.join(' ')

  // No banner title: infer the type from the sections present.
  if (type === undefined) {
    const labels = new Set<string>()
    for (const r of grid) if (r) labels.add(normalizeGroup(firstText(r)))
    const bsish = [...labels].some((l) => /asset|liabilit|equity/.test(l))
    const plish = [...labels].some((l) => PNL_LABELS.has(l))
    type = bsish && !plish ? 'bs' : 'pl'
  }
  const walkType: StatementType = type === 'bva' ? 'pl' : type

  const walk = walkLeaves(grid, plan, walkType)
  const leaves = walk.leaves
  const warnings: string[] = [...walk.warnings]
  const taken = new Set<number>()
  for (const l of leaves) if (l.explicitAcct != null) taken.add(l.explicitAcct)

  const rows: NormalizedRow[] = []
  const synthesized: StatementMetadata['synthesized'] = []
  const skipped: string[] = []

  for (const leaf of leaves) {
    // Zero leaves are KEPT: the plain TB keeps its zeros, mapping needs the
    // full chart, and dropping them would make the row set depend on the
    // period's activity.
    const section = sectionOf(leaf, walkType)
    if (!section) {
      skipped.push(leaf.name)
      continue
    }
    let acct: number
    if (leaf.explicitAcct != null) {
      acct = leaf.explicitAcct
    } else if (section === 'revenue' || section === 'expense') {
      // base + a stable hash of the name (see tbConventions: the live sync owns
      // base + id below +1000). Collisions — same hash, or a number an explicit
      // account already uses — skip forward within the synthetic sub-range.
      const base = section === 'revenue' ? QBO_REVENUE_BASE : QBO_EXPENSE_BASE
      const lo = base + QBO_SYNTHETIC_OFFSET
      let off = syntheticOffset(leaf.name) - QBO_SYNTHETIC_OFFSET
      acct = lo + off
      while (taken.has(acct)) {
        off = (off + 1) % QBO_SYNTHETIC_SPAN
        acct = lo + off
      }
      taken.add(acct)
      synthesized.push({ acct, name: leaf.name, section })
    } else {
      acct = bsEngineAcct(leaf, section)
      synthesized.push({ acct, name: leaf.name, section })
    }
    // `|| 0` normalises the −0 a signed zero would otherwise carry.
    rows.push({ acct, desc: leaf.name, total: round2(sectionSign(section) * leaf.value) || 0 })
  }

  if (rows.length === 0) return null
  if (skipped.length) {
    warnings.push(
      `${skipped.length} row(s) had no recognisable section or account number and were skipped: ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? '…' : ''}`,
    )
  }

  const net = round2(rows.reduce((s, r) => s + r.total, 0))
  const metadata = extractSheetMetadata(banner, '', rows.length, {
    sheetName,
    net,
    accountCount: rows.length,
  })
  // The banner's period wins over the generic title heuristics: "As of June 30,
  // 2026" / "July 2025 - June 2026" → end date 2026-06-30, FY2026 (Jul–Jun).
  const dates = bannerDateTokens(bannerText)
  const periodEnd = dates.length ? dates[dates.length - 1]!.iso : undefined
  const periodStart = dates.length > 1 ? dates[0]!.first : undefined
  if (periodEnd) {
    metadata.periodEndDate = periodEnd
    metadata.periodEndSource = 'explicit'
    metadata.fiscalYear = fiscalYearOfEnd(periodEnd)
    delete metadata.isMonthly
    delete metadata.monthKey
  }
  const title = banner.find((c) => detectStatementType(c) !== undefined) ?? metadata.periodTitle ?? sheetName
  const statement: StatementMetadata = {
    type,
    title,
    partial: type === 'bs' ? 'bs' : 'pl',
    column: plan.valueHeader || undefined,
    synthesized,
  }
  const basis = detectBasis(bannerText)
  if (basis) statement.basis = basis
  if (periodStart) statement.periodStart = periodStart
  metadata.statement = statement

  return {
    rows,
    startRow: plan.startRow,
    warnings: warnings.length ? warnings : undefined,
    metadata: metadata as StatementSheetResult['metadata'],
  }
}

// ── Merge a P&L with a Balance Sheet ──────────────────────────────────────────

export const STATEMENT_PLUG_DESC = 'Balancing adjustment (QuickBooks statement export)'

/**
 * Combine a P&L result with a Balance Sheet result into ONE full trial balance.
 * The BS's equity result row ("Net Income" / "Net Revenue" / "Change in Net
 * Assets" — BS_RESULT_LABELS) is dropped (the P&L leaves ARE that result) and
 * the residual — exported on different days, rounding, an interlocation entry
 * — is absorbed by one explicit acct-399 plug row via the shared
 * applyBalancePlug. Period end = the BS "As of" date when both carry one.
 */
export function mergeStatementResults(
  pl: StatementSheetResult,
  bs: StatementSheetResult,
): StatementSheetResult {
  const bsRows = bs.rows.filter((r) => !BS_RESULT_LABELS.has(normalizeGroup(r.desc)))
  const plugged = applyBalancePlug([...pl.rows, ...bsRows], STATEMENT_PLUG_DESC)
  const rows = plugged.rows
  const net = round2(rows.reduce((s, r) => s + r.total, 0))
  const periodEndDate = bs.metadata.periodEndDate ?? pl.metadata.periodEndDate
  const metadata: StatementSheetResult['metadata'] = {
    ...pl.metadata,
    rowCount: rows.length,
    accountCount: rows.length,
    net,
    periodEndDate,
    periodEndSource: periodEndDate ? 'explicit' : undefined,
    fiscalYear: periodEndDate ? fiscalYearOfEnd(periodEndDate) : pl.metadata.fiscalYear,
    sheet: pl.metadata.sheet && bs.metadata.sheet ? `${pl.metadata.sheet} + ${bs.metadata.sheet}` : pl.metadata.sheet ?? bs.metadata.sheet,
    statement: {
      ...pl.metadata.statement,
      partial: 'full',
      title: `${pl.metadata.statement.title} + ${bs.metadata.statement.title}`,
      synthesized: [...pl.metadata.statement.synthesized, ...bs.metadata.statement.synthesized],
      balancePlug: plugged.balancePlug,
      imbalance: plugged.imbalance,
    },
  }
  if (!periodEndDate) delete metadata.periodEndSource
  const warnings = [...(pl.warnings ?? []), ...(bs.warnings ?? [])]
  if (plugged.balancePlug != null) {
    warnings.push(
      `P&L and Balance Sheet did not tie by ${plugged.imbalance}; an acct-${plugged.rows[plugged.rows.length - 1]!.acct} balancing row of ${plugged.balancePlug} was added.`,
    )
  }
  return { rows, startRow: pl.startRow, warnings: warnings.length ? warnings : undefined, metadata }
}

// ── xlsx entry ────────────────────────────────────────────────────────────────

function sheetGrid(wb: XLSX.WorkBook, name: string): RawGrid {
  const ws = wb.Sheets[name]
  if (!ws) return []
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as RawGrid
}

/** Exactly one P&L-shaped sheet + exactly one Balance Sheet — the pair that merges into a full TB. */
export function isStatementPair(results: readonly StatementSheetResult[]): boolean {
  if (results.length !== 2) return false
  const bss = results.filter((r) => r.metadata.statement.type === 'bs').length
  return bss === 1
}

/** Walk every sheet; statement results + the per-sheet failures (never swallowed silently). */
function walkSheets(
  wb: XLSX.WorkBook,
  opts: StatementParseOptions,
): { found: StatementSheetResult[]; warnings: string[]; refused: StatementExportError[] } {
  const found: StatementSheetResult[] = []
  const warnings: string[] = []
  const refused: StatementExportError[] = []
  for (const name of wb.SheetNames) {
    try {
      const r = parseStatementGrid(sheetGrid(wb, name), name, { ...opts, force: false })
      if (r) found.push(r)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (e instanceof StatementExportError) refused.push(e)
      warnings.push(`Sheet "${name}" was skipped: ${msg}`)
    }
  }
  for (const w of warnings) opts.onWarning?.(w)
  return { found, warnings, refused }
}

const withWarnings = (r: StatementSheetResult, extra: string[]): StatementSheetResult =>
  extra.length ? { ...r, warnings: [...(r.warnings ?? []), ...extra] } : r

/**
 * Parse an xlsx export. With `opts.sheet` only that sheet is read. Otherwise
 * every sheet is tried: exactly one P&L (or BvA) + one BS → merged into a
 * full TB with a plug; else the FIRST statement sheet, with a warning naming
 * the sheets that were not imported (a workbook of monthly P&L tabs belongs
 * to the multi-sheet uploader — listStatementSheets). Returns null when no
 * sheet is a statement; throws StatementExportError when the only statement
 * sheets were refused (a budget-only report).
 */
export function parseStatementWorkbook(
  bytes: ArrayBuffer,
  opts: StatementParseOptions = {},
): StatementSheetResult | null {
  const wb = XLSX.read(new Uint8Array(bytes), { type: 'array' })
  if (wb.SheetNames.length === 0) return null
  if (opts.sheet && wb.SheetNames.includes(opts.sheet)) {
    return parseStatementGrid(sheetGrid(wb, opts.sheet), opts.sheet, opts)
  }
  const { found, warnings, refused } = walkSheets(wb, opts)
  if (found.length === 0 && refused.length) throw refused[0]
  if (found.length === 0 && opts.force) {
    const first = wb.SheetNames[0]!
    return parseStatementGrid(sheetGrid(wb, first), first, opts)
  }
  if (found.length === 0) return null
  if (isStatementPair(found)) {
    const pl = found.find((r) => r.metadata.statement.type !== 'bs')!
    const bs = found.find((r) => r.metadata.statement.type === 'bs')!
    return withWarnings(mergeStatementResults(pl, bs), warnings)
  }
  const first = found[0]!
  if (found.length > 1) {
    const others = found.slice(1).map((r) => `"${r.metadata.sheet ?? '?'}"`).join(', ')
    warnings.push(
      `Workbook holds ${found.length} statement sheets; only "${first.metadata.sheet ?? '?'}" was imported (not imported: ${others}). Use the multi-year uploader to import each sheet, or export one report per file.`,
    )
  }
  return withWarnings(first, warnings)
}

/**
 * Every statement sheet in a workbook, one result per sheet (no merging) —
 * the multi-sheet fan-out the trend uploader and Penny consult BEFORE
 * listTrialBalanceSheets, so a workbook of monthly Statement-of-Activity tabs
 * is signed as statements, not read as debit-positive TBs. Honours the same
 * Debit | Credit rule (a TB sheet is never returned). Per-sheet failures go to
 * `opts.onWarning`.
 */
export function listStatementSheets(bytes: ArrayBuffer, opts: StatementParseOptions = {}): StatementSheetResult[] {
  const wb = XLSX.read(new Uint8Array(bytes), { type: 'array' })
  return walkSheets(wb, opts).found
}

// ── csv entry ─────────────────────────────────────────────────────────────────

/** RFC-4180-ish CSV → grid of strings (quoted fields, doubled quotes, CRLF). */
export function csvToGrid(textIn: string): RawGrid {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  const src = textIn.charCodeAt(0) === 0xfeff ? textIn.slice(1) : textIn
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch !== '\r') field += ch
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

export function parseStatementCsv(bytes: ArrayBuffer, opts: StatementParseOptions = {}): StatementSheetResult | null {
  const grid = csvToGrid(new TextDecoder('utf-8').decode(new Uint8Array(bytes)))
  return parseStatementGrid(grid, '', opts)
}

// ── Adapter object (registered LAST — see registry.ts for the order) ──────────

/** Parse by extension; null when the file is not a statement export. */
export function parseStatementExport(
  fileName: string,
  bytes: ArrayBuffer,
  opts: StatementParseOptions = {},
): StatementSheetResult | null {
  if (/\.xlsx?$/i.test(fileName)) return parseStatementWorkbook(bytes, opts)
  if (/\.csv$/i.test(fileName)) return parseStatementCsv(bytes, opts)
  return null
}

export const statementAdapter: IngestionAdapter & {
  parse(bytes: ArrayBuffer, opts?: StatementParseOptions): IngestionResult
} = {
  format: 'xlsx',
  /** Only claims a file when the bytes are given AND it detects a statement. */
  canHandle(fileName: string, bytes?: ArrayBuffer): boolean {
    if (!bytes) return false
    try {
      return parseStatementExport(fileName, bytes) !== null
    } catch {
      return false
    }
  },
  parse(bytes: ArrayBuffer, opts?: StatementParseOptions): IngestionResult {
    const xl = parseStatementWorkbookSafe(bytes, opts)
    if (xl) return xl
    const csv = parseStatementCsv(bytes, opts)
    if (csv) return csv
    throw new Error('Not a QuickBooks statement export (no Profit and Loss / Balance Sheet / Budget vs Actuals structure found).')
  },
}

function parseStatementWorkbookSafe(bytes: ArrayBuffer, opts?: StatementParseOptions): StatementSheetResult | null {
  try {
    return parseStatementWorkbook(bytes, opts)
  } catch {
    return null
  }
}
