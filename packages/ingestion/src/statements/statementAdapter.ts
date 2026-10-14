// ─────────────────────────────────────────────────────────────
// QuickBooks statement EXPORT adapter (issue #31). Accepts a QBO report
// exported to xlsx/csv in its natural form — Profit and Loss / Statement of
// Activity, Balance Sheet / Statement of Financial Position, Budget vs
// Actuals / Budget Overview — and turns it into trial-balance rows "just like
// a TB". Sign, numbering and plug rules are NOT re-derived here: they are the
// shared ./tbConventions.ts the live QBO sync also uses.
//
// DETECTION (isStatementExport): a BANNER in the top rows naming the report,
// OR the STRUCTURAL signature — a section label row with no value (Income /
// Expenses / ASSETS / LIABILITIES AND EQUITY …) plus a `Total <Name>` subtotal
// row or a computed row (Net Income / Net Operating Income / Gross Profit /
// TOTAL LIABILITIES AND EQUITY). A plain trial balance has neither.
//
// WALK: hierarchy is tracked by a SECTION STACK, not by indentation — QBO's
// Excel export indents with cell formatting that a grid read loses, so the
// only reliable signals are "a name row with no value OPENS a section" and
// "`Total <Name>` CLOSES it". Leading spaces / empty leading cells are
// tolerated but never required. `Total …`, computed and blank rows are
// skipped so nothing is double-counted; leaf rows (name + value) are kept.
//
// ACCOUNT NUMBERS: an explicit Acct column, else a leading number in the name
// ("40000 Income"), else SYNTHESISED:
//   · P&L  → QBO_REVENUE_BASE (40000) / QBO_EXPENSE_BASE (60000) + the 1-based
//     ORDER of the unnumbered leaf within that section block (skipping any
//     number an explicit account in the same file already uses). Stable across
//     re-uploads of the same file; every synthesised {acct, name, section} is
//     recorded in metadata.statement.synthesized so a mapping UI can re-key.
//   · BS   → the engine's fixed default-chart number for the row's section
//     family (BS_ENGINE_ACCT: Bank Accounts → 100, Accounts Receivable → 120,
//     Prepaid → 125, Fixed Assets → 150 / 170, Other Assets → 140, current
//     liabilities → 200, long-term → 260, Equity → 300), collapsing like the
//     live sync so the SFP works with no mapping at all.
//
// COLUMNS: `Actual` wins (Budget vs Actuals), else `Total` (multi-period),
// else the single value column; Budget / over Budget / % columns are
// ignored. `opts.column` picks a named period column ("Jan 2026") instead.
// Values are natural-positive per section → the TB sign convention applies.
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
  round2,
  sectionFromAcct,
  sectionSign,
  type TbSection,
} from './tbConventions.js'

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
}

// ── Cell helpers ──────────────────────────────────────────────────────────────

const text = (v: unknown): string => (v == null ? '' : String(v)).replace(/ /g, ' ').trim()

/**
 * Parse a report money cell. Handles numbers, "1,234.00", "$1,234", "(1,234.00)"
 * (accounting negative), "-1,234", and the "-" / "—" zero placeholder. Returns
 * null for text that is not a number (so names never read as 0).
 */
export function parseMoney(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  let s = v.replace(/ /g, ' ').trim()
  if (s === '') return null
  if (/^[-–—]$/.test(s)) return 0
  let neg = false
  if (/^\(.*\)$/.test(s)) {
    neg = true
    s = s.slice(1, -1)
  }
  s = s.replace(/[$,\s]/g, '')
  if (s.startsWith('-')) {
    neg = !neg
    s = s.slice(1)
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

/**
 * Is this grid a QuickBooks statement export? Banner title, OR the structural
 * signature (a value-less section label + a `Total <Name>` / computed row).
 */
export function isStatementExport(grid: RawGrid): boolean {
  if (!grid || grid.length < 3) return false
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

function headerCandidate(row: unknown[]): boolean {
  let tokens = 0
  for (const c of row) {
    const t = text(c)
    if (t === '') continue
    if (typeof c === 'number') return false
    if (HEADER_TOKEN.test(t) || MONTH_TOKEN.test(t)) tokens++
  }
  return tokens > 0
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

  const plan: ColumnPlan = {
    value: -1,
    valueHeader: '',
    acct: -1,
    desc: -1,
    headerRow,
    startRow: headerRow >= 0 ? headerRow + 1 : Math.max(bodyStart, 0),
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

const LEADING_ACCT = /^(\d{3,6})\s*[-–:.·]?\s+(.+)$/

function splitLeadingAcct(name: string): { acct: number | null; rest: string } {
  const m = name.match(LEADING_ACCT)
  if (!m) return { acct: null, rest: name }
  const n = parseInt(m[1]!, 10)
  return Number.isFinite(n) && n > 0 ? { acct: n, rest: m[2]!.trim() } : { acct: null, rest: name }
}

/**
 * Walk the body rows with a section stack. Emits every leaf (name + value)
 * once; opens a section on a value-less name row; closes on `Total <Name>`
 * (popping back to the matching name — resilient to a stray value-less leaf
 * that never got a Total); skips computed rows.
 */
function walkLeaves(grid: RawGrid, plan: ColumnPlan, type: StatementType): Leaf[] {
  const leaves: Leaf[] = []
  const stack: string[] = []
  const popTo = (label: string): void => {
    const want = normalizeGroup(label)
    const at = stack.map(normalizeGroup).lastIndexOf(want)
    if (at >= 0) stack.length = at
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

    // Computed rows: a P&L's Net Income / Gross Profit / Net Operating Income
    // are derived from the leaves and are NEVER rows. On a BALANCE SHEET the
    // "Net Income" line inside Equity is the current-year result that makes the
    // sheet balance — kept as an equity row (dropped again when merged with a
    // P&L, see mergeStatementResults).
    if (TOTAL_ROW.test(rawName)) {
      popTo(rawName.replace(/^total\s+/i, ''))
      continue
    }
    if (COMPUTED_LABELS.has(key)) {
      if (!(type === 'bs' && key === 'netincome' && value !== null)) continue
    }

    if (value === null) {
      // A name with no value opens a section (or is a stray label).
      if (rawName !== '' && explicitCell === '') stack.push(rawName)
      continue
    }

    let explicitAcct: number | null = null
    let name = rawName
    if (explicitCell !== '') {
      const n = parseInt(explicitCell.replace(/[^\d]/g, ''), 10)
      if (Number.isFinite(n) && n > 0) explicitAcct = n
    }
    if (explicitAcct == null) {
      const split = splitLeadingAcct(rawName)
      if (split.acct != null) explicitAcct = split.acct
    }
    if (name === '' && explicitCell !== '') name = explicitCell
    leaves.push({ name, explicitAcct, value, groups: [...stack], rowIndex: i })
  }
  return leaves
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
  let type = detectStatementType(`${bannerCells(grid).join(' ')} ${sheetName}`) ?? opts.typeHint
  const detected = type !== undefined || isStatementExport(grid)
  if (!detected && !opts.force) return null

  const plan = planColumns(grid, opts.column)
  if (plan.value < 0) return null
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

  const leaves = walkLeaves(grid, plan, walkType)
  const warnings: string[] = []
  const taken = new Set<number>()
  for (const l of leaves) if (l.explicitAcct != null) taken.add(l.explicitAcct)

  const rows: NormalizedRow[] = []
  const synthesized: StatementMetadata['synthesized'] = []
  const order: Record<'revenue' | 'expense', number> = { revenue: 0, expense: 0 }
  const skipped: string[] = []

  for (const leaf of leaves) {
    if (leaf.value === 0) continue // zero cells carry no information — drop (as the live sync does)
    const section = sectionOf(leaf, walkType)
    if (!section) {
      skipped.push(leaf.name)
      continue
    }
    let acct: number
    if (leaf.explicitAcct != null) {
      acct = leaf.explicitAcct
    } else if (section === 'revenue' || section === 'expense') {
      const base = section === 'revenue' ? QBO_REVENUE_BASE : QBO_EXPENSE_BASE
      acct = base + ++order[section]
      while (taken.has(acct)) acct = base + ++order[section]
      taken.add(acct)
      synthesized.push({ acct, name: leaf.name, section })
    } else {
      acct = bsEngineAcct(leaf, section)
      synthesized.push({ acct, name: leaf.name, section })
    }
    rows.push({ acct, desc: leaf.name, total: round2(sectionSign(section) * leaf.value) })
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
 * The BS's equity "Net Income" row is dropped (the P&L leaves ARE the net
 * income) and the residual — exported on different days, rounding, an
 * interlocation entry — is absorbed by one explicit acct-399 plug row via the
 * shared applyBalancePlug. Period end = the BS "As of" date when both carry one.
 */
export function mergeStatementResults(
  pl: StatementSheetResult,
  bs: StatementSheetResult,
): StatementSheetResult {
  const bsRows = bs.rows.filter((r) => normalizeGroup(r.desc) !== 'netincome')
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

/**
 * Parse an xlsx export. With `opts.sheet` only that sheet is read. Otherwise
 * every sheet is tried: exactly one P&L (or BvA) + one BS → merged into a
 * full TB with a plug; else the first statement sheet. Returns null when no
 * sheet is a statement.
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
  const found: StatementSheetResult[] = []
  for (const name of wb.SheetNames) {
    try {
      const r = parseStatementGrid(sheetGrid(wb, name), name, { ...opts, force: false })
      if (r) found.push(r)
    } catch {
      continue
    }
  }
  if (found.length === 0 && opts.force) {
    const first = wb.SheetNames[0]!
    return parseStatementGrid(sheetGrid(wb, first), first, opts)
  }
  if (found.length === 0) return null
  const pls = found.filter((r) => r.metadata.statement.type !== 'bs')
  const bss = found.filter((r) => r.metadata.statement.type === 'bs')
  if (pls.length === 1 && bss.length === 1) return mergeStatementResults(pls[0]!, bss[0]!)
  return found[0]!
}

/** Every statement sheet in a workbook, one result per sheet (no merging). */
export function listStatementSheets(bytes: ArrayBuffer, opts: StatementParseOptions = {}): StatementSheetResult[] {
  const wb = XLSX.read(new Uint8Array(bytes), { type: 'array' })
  const out: StatementSheetResult[] = []
  for (const name of wb.SheetNames) {
    try {
      const r = parseStatementGrid(sheetGrid(wb, name), name, { ...opts, force: false })
      if (r) out.push(r)
    } catch {
      continue
    }
  }
  return out
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
