// ─────────────────────────────────────────────────────────────
// File preview + plain-language failure reasons (#32).
//
// When ingest() cannot read a finance file it shows the person what it saw:
// the first rows of the grid, which row it took for the column names, and its
// best guess at the account / name / amount columns — so they can point at
// the right columns instead of hitting a dead end. The guess is ONLY a
// pre-selection: nothing here is ever applied without the person's click.
//
// The grid is the SAME one ingestion reads: xlsx = sheet_to_json(ws,
// {header:1, defval:null}) (index 0 = the sheet's !ref start column, which is
// why letters carry an offset), csv = csvToGrid(text).
//
// PRIVACY: a FilePreview holds cell text and is for the browser picker only.
// explainFailure() names column LETTERS only — never cell text.
// ─────────────────────────────────────────────────────────────
import * as XLSX from 'xlsx'
import type { ColumnChoice } from '../types.js'
import {
  csvToGrid,
  ACTUAL_HEADER,
  hasDebitCreditHeader,
  isBudgetReport,
  parseMoney,
  type RawGrid,
} from '../statements/statementAdapter.js'
import {
  detectColumnsByName,
  detectStartRow,
  stackedHeaderCells,
  totalColumnFromHeaders,
} from '../adapters/excelAdapter.js'
import { BUDGETISH, columnHoldsAmounts, gridReadsAsStatement } from './override.js'
import type { IngestErrorCode } from './errors.js'

export const PREVIEW_ROWS = 25
export const PREVIEW_COLS = 20
/** Body rows scanned to classify a column. */
const SCAN_ROWS = 500
/** Max characters of any cell / header shown. */
const CELL_CHARS = 40

export interface PreviewColumn {
  /** Grid index. */
  index: number
  /** Spreadsheet letter, offset by the sheet's !ref start column ('A' for csv col 0). */
  letter: string
  /** Stack-filled header text at guess.headerRow ('' if none), ≤ 40 chars. */
  header: string
  kind: 'acct' | 'money' | 'text' | 'empty' | 'mixed'
  /** Non-empty body cells (body = rows below guess.headerRow, ≤ 500 rows scanned). */
  filled: number
  nonZeroMoney: number
  /** Header matches BUDGETISH (or, on a budget report, any money column not headed Actual). */
  budgetish: boolean
  /**
   * ADDITIVE. The body cells are numbers (≥ 60% of the filled cells parse as
   * money), judged by CONTENT, not by header words — an unlabeled Debit or
   * Credit column is numeric. The account-number column is numeric too.
   */
  numeric: boolean
  /**
   * ADDITIVE. On a grid with a suggested Debit/Credit pair: this column is that
   * pair's net (debit − credit, either sign) on ≥ 95% of rows — a derived
   * "Balance"/"Total" column, never reported as unassigned beside the pair.
   */
  netOfPair: boolean
  /**
   * ADDITIVE. This column holds AMOUNTS, never account numbers — its header
   * names money (Actual / Budget / Total / a month …) or its numbers are not
   * plausible, unique account numbers (columnHoldsAmounts, the same rule the
   * picker path refuses with 'acct-is-money'). The picker disables it for
   * "Account numbers".
   */
  holdsAmounts: boolean
}

/** A preview note the picker shows beside the table (letters only — never cell text). */
export interface PreviewWarning {
  code: 'unassigned-numeric-column'
  /** Grid index of the column. */
  column: number
  /** Its spreadsheet letter. */
  letter: string
}

export interface FilePreview {
  sheet: string | null
  /** Every sheet name (xlsx); [] for csv. */
  sheets: string[]
  /** Grid rows 0..min(totalRows,PREVIEW_ROWS)-1, padded to columnCount, cells String()-ed, trimmed, ≤ 40 chars. */
  rows: string[][]
  totalRows: number
  /** min(grid width, PREVIEW_COLS). */
  columnCount: number
  /** length = columnCount. */
  columns: PreviewColumn[]
  /** Pre-selected in the picker, NEVER auto-applied. */
  guess: ColumnChoice
  debitCreditHeader: boolean
  /** gridReadsAsStatement(...) — the picker's "will be read as" hint. */
  readsAsStatement: boolean
  /** layoutSignature(grid, guess.headerRow). */
  signature: string | null
  /** ADDITIVE: the sheet's !ref start column (0 for csv) — letters are offset by it. */
  colOffset: number
  /** ADDITIVE: the sheet's !ref start row (0 for csv) — a spreadsheet row number is rowOffset + index + 1. */
  rowOffset: number
  /**
   * ADDITIVE. Two adjacent numeric columns that read as Debit / Credit — by
   * their header words, or by CONTENT (each account row has a value in at most
   * one of them, or their totals net to ≈ 0; both non-negative). null when
   * none. When present and no header names an amount column, the guess uses it.
   */
  suggestedDebitCredit: { debit: number; credit: number } | null
  /** ADDITIVE. Notes for the GUESS (= unassignedNumericColumns(preview, guess)). */
  warnings: PreviewWarning[]
}

// ── Grid reading ──────────────────────────────────────────────────────────────

export interface ReadGrid {
  grid: RawGrid
  /** The sheet read (null for csv). */
  sheet: string | null
  /** Every sheet name (xlsx); [] for csv. */
  sheets: string[]
  colOffset: number
  rowOffset: number
}

const isXlsx = (fileName: string): boolean => /\.xlsx?$/i.test(fileName)
const isCsv = (fileName: string): boolean => /\.csv$/i.test(fileName)

function sheetToGrid(ws: XLSX.WorkSheet | undefined): { grid: RawGrid; colOffset: number; rowOffset: number } {
  if (!ws) return { grid: [], colOffset: 0, rowOffset: 0 }
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as RawGrid
  let colOffset = 0
  let rowOffset = 0
  const ref = ws['!ref']
  if (ref) {
    try {
      const range = XLSX.utils.decode_range(ref)
      colOffset = range.s.c
      rowOffset = range.s.r
    } catch {
      /* keep 0 */
    }
  }
  return { grid, colOffset, rowOffset }
}

/** A grid with at least `min` rows holding a non-empty cell. */
function hasContent(grid: RawGrid, min = 1): boolean {
  let n = 0
  for (const r of grid) {
    if (r && r.some((c) => c != null && String(c).trim() !== '')) n++
    if (n >= min) return true
  }
  return false
}

/**
 * Read one sheet's grid the way the adapters do. Default sheet (xlsx): the
 * first with at least 3 non-empty rows, else the first sheet. Throws on an
 * unsupported extension or unreadable bytes.
 */
export function readGrid(fileName: string, bytes: ArrayBuffer, sheet?: string | null): ReadGrid {
  if (isXlsx(fileName)) {
    const wb = XLSX.read(new Uint8Array(bytes), { type: 'array' })
    const sheets = [...wb.SheetNames]
    if (sheets.length === 0) return { grid: [], sheet: null, sheets, colOffset: 0, rowOffset: 0 }
    let name: string
    if (sheet && sheets.includes(sheet)) name = sheet
    else {
      name = sheets[0]!
      for (const n of sheets) {
        if (hasContent(sheetToGrid(wb.Sheets[n]).grid, 3)) {
          name = n
          break
        }
      }
    }
    const g = sheetToGrid(wb.Sheets[name])
    return { grid: g.grid, sheet: name, sheets, colOffset: g.colOffset, rowOffset: g.rowOffset }
  }
  if (isCsv(fileName)) {
    const grid = csvToGrid(new TextDecoder('utf-8').decode(new Uint8Array(bytes)))
    return { grid, sheet: null, sheets: [], colOffset: 0, rowOffset: 0 }
  }
  throw new Error(`No ingestion adapter for "${fileName}". Supported: .xlsx, .xls, .csv`)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** 0→'A', 25→'Z', 26→'AA' (plus the sheet's start-column offset). */
export function columnLetter(index: number, offset = 0): string {
  let n = Math.max(0, Math.trunc(index + offset))
  let s = ''
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

const cellText = (v: unknown): string => (v == null ? '' : String(v)).replace(/ /g, ' ').trim()
const clip = (s: string): string => (s.length > CELL_CHARS ? `${s.slice(0, CELL_CHARS - 1)}…` : s)

/** Grid width over the top rows (the widest of rows 0..30). */
export function gridWidth(grid: RawGrid, rows = 31): number {
  let w = 0
  for (let i = 0; i < Math.min(rows, grid.length); i++) w = Math.max(w, grid[i]?.length ?? 0)
  return w
}

/** Grid width over every row. */
function fullWidth(grid: RawGrid): number {
  let w = 0
  for (const r of grid) w = Math.max(w, r?.length ?? 0)
  return w
}

/** Stack-filled header row: the header row's cells, blanks filled from up to 2 rows above (nearest first). */
export function stackedHeaderRow(grid: RawGrid, headerRow: number, width: number): string[] {
  const out: string[] = []
  if (headerRow < 0) return out
  for (let c = 0; c < width; c++) {
    let t = ''
    for (let up = 0; up <= 2 && t === ''; up++) {
      const r = headerRow - up >= 0 ? grid[headerRow - up] : undefined
      t = r ? cellText(r[c]) : ''
    }
    out.push(t)
  }
  return out
}

const MONTH_WORD =
  /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\b/g

/**
 * A readable fingerprint of a sheet's column layout: `w=<width>:` + the
 * normalised stack-filled header cells joined by `|` (lower-case, month names
 * → `@`, digit runs → `#`, whitespace collapsed; trailing empties dropped;
 * ≤ 300 chars). "Acct | Desc | Q4 2026" and "Acct | Desc | Q1 2027" agree.
 * null when there is no header row or it has fewer than 2 non-empty cells —
 * such a layout is never applied automatically.
 */
export function layoutSignature(grid: RawGrid, headerRow: number): string | null {
  if (!grid || headerRow < 0 || headerRow >= grid.length) return null
  const width = gridWidth(grid)
  const cells = stackedHeaderRow(grid, headerRow, Math.max(width, grid[headerRow]?.length ?? 0)).map((h) =>
    h
      .toLowerCase()
      .replace(MONTH_WORD, '@')
      .replace(/\d+/g, '#')
      .replace(/\s+/g, ' ')
      .trim(),
  )
  while (cells.length && cells[cells.length - 1] === '') cells.pop()
  if (cells.filter((c) => c !== '').length < 2) return null
  return `w=${width}:${cells.join('|')}`.slice(0, 300)
}

/** A positive whole number 100…999 999 with no decimals — an account-number cell. */
function isAcctCell(v: unknown): boolean {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 100 && v <= 999_999
  const t = cellText(v)
  if (!/^\d{3,6}$/.test(t)) return false
  const n = parseInt(t, 10)
  return n >= 100 && n <= 999_999
}

interface ColumnStats {
  kind: PreviewColumn['kind']
  filled: number
  nonZeroMoney: number
  /** ≥ 60% of the filled cells parse as money (account numbers included). */
  numeric: boolean
  /** Non-zero money cells below zero. */
  negatives: number
}

function classifyColumn(grid: RawGrid, col: number, bodyStart: number): ColumnStats {
  let filled = 0
  let acct = 0
  let money = 0
  let nonNumeric = 0
  let nonZeroMoney = 0
  let negatives = 0
  const end = Math.min(grid.length, bodyStart + SCAN_ROWS)
  for (let i = Math.max(0, bodyStart); i < end; i++) {
    const v = grid[i]?.[col]
    if (v == null || cellText(v) === '') continue
    filled++
    if (isAcctCell(v)) acct++
    const m = parseMoney(v)
    if (m !== null) {
      money++
      if (m !== 0) nonZeroMoney++
      if (m < 0) negatives++
    } else nonNumeric++
  }
  let kind: PreviewColumn['kind'] = 'mixed'
  if (filled === 0) kind = 'empty'
  else if (filled >= 2 && acct / filled >= 0.6) kind = 'acct'
  else if (money / filled >= 0.6) kind = 'money'
  else if (nonNumeric / filled >= 0.6) kind = 'text'
  return { kind, filled, nonZeroMoney, numeric: filled > 0 && money / filled >= 0.6, negatives }
}

/**
 * Two ADJACENT numeric columns that read as Debit / Credit by their CONTENT:
 * both hold non-zero values, both are (≥ 95%) non-negative, and either each
 * row has a value in at most one of them (one stray row — a totals line —
 * allowed per 20) or — both UNLABELED — their totals net to ≈ 0. Only rows whose account cell
 * looks like an account count, when an account column is known. Budget-ish,
 * excluded (account / name) and empty columns are skipped; "adjacent" ignores
 * all-empty columns between. null when no pair qualifies (the first wins).
 */
export function findDebitCreditPair(
  grid: RawGrid,
  opts: {
    bodyStart: number
    acct?: number
    exclude?: readonly number[]
    budgetish?: readonly boolean[]
    /** Stack-filled header per column: the "net to ≈ 0" test needs BOTH unlabeled (a "Jul | Aug" pair can tie by chance). */
    headers?: readonly string[]
  },
): { debit: number; credit: number } | null {
  const width = fullWidth(grid)
  const start = Math.max(0, opts.bodyStart)
  const end = Math.min(grid.length, start + SCAN_ROWS)
  const stats: ColumnStats[] = []
  for (let c = 0; c < width; c++) stats.push(classifyColumn(grid, c, start))
  const skip = new Set(opts.exclude ?? [])
  const nonEmpty = stats.map((st, i) => i).filter((i) => stats[i]!.filled > 0)
  const ok = (i: number): boolean => {
    const st = stats[i]!
    if (skip.has(i) || opts.budgetish?.[i] || !st.numeric || st.nonZeroMoney === 0) return false
    return st.negatives <= Math.floor(st.nonZeroMoney * 0.05)
  }
  const acctCol = opts.acct ?? -1
  for (let k = 0; k + 1 < nonEmpty.length; k++) {
    const a = nonEmpty[k]!
    const b = nonEmpty[k + 1]!
    if (!ok(a) || !ok(b)) continue
    let both = 0
    let any = 0
    let sa = 0
    let sb = 0
    for (let i = start; i < end; i++) {
      const r = grid[i]
      if (!r) continue
      if (acctCol >= 0 && !isAcctCell(r[acctCol])) continue
      const va = parseMoney(r[a]) ?? 0
      const vb = parseMoney(r[b]) ?? 0
      if (va !== 0 || vb !== 0) any++
      if (va !== 0 && vb !== 0) both++
      sa += va
      sb += vb
    }
    if (any < 2) continue
    const exclusive = both <= Math.max(1, Math.floor(any * 0.05))
    const unlabeled = !(opts.headers?.[a] ?? '').trim() && !(opts.headers?.[b] ?? '').trim()
    const nets = unlabeled && Math.abs(sa - sb) <= Math.max(1, 0.005 * Math.max(Math.abs(sa), Math.abs(sb)))
    if (exclusive || nets) return { debit: a, credit: b }
  }
  return null
}

/** Is column `col` the pair's net (d − c or c − d) on ≥ 95% of the rows that hold any of the three? */
function isNetOfPair(grid: RawGrid, col: number, pair: { debit: number; credit: number }, bodyStart: number): boolean {
  if (col === pair.debit || col === pair.credit) return false
  let rows = 0
  let fwd = 0
  let rev = 0
  const end = Math.min(grid.length, Math.max(0, bodyStart) + SCAN_ROWS)
  for (let i = Math.max(0, bodyStart); i < end; i++) {
    const r = grid[i]
    if (!r) continue
    const v = parseMoney(r[col])
    const d = parseMoney(r[pair.debit]) ?? 0
    const c = parseMoney(r[pair.credit]) ?? 0
    if (v == null && d === 0 && c === 0) continue
    rows++
    const x = v ?? 0
    if (Math.abs(x - (d - c)) < 0.01) fwd++
    if (Math.abs(x - (c - d)) < 0.01) rev++
  }
  return rows > 0 && Math.max(fwd, rev) >= rows * 0.95
}

/**
 * Populated numeric columns a choice leaves unread — so a guess (or a pick)
 * never silently drops one. Skips the columns the choice uses, budget-ish
 * columns (labelled "(budget)" already) and, when Debit/Credit are used, a
 * column that is just their net.
 */
export function unassignedNumericColumns(preview: FilePreview, choice: ColumnChoice): PreviewWarning[] {
  const used = new Set([choice.acct, choice.desc, choice.amount, choice.debit, choice.credit].filter((i) => i >= 0))
  const dc = choice.debit >= 0 && choice.credit >= 0
  const out: PreviewWarning[] = []
  for (const col of preview.columns) {
    if (used.has(col.index) || !col.numeric || col.nonZeroMoney === 0 || col.budgetish) continue
    if (dc && col.netOfPair) continue
    out.push({ code: 'unassigned-numeric-column', column: col.index, letter: col.letter })
  }
  return out
}

// ── Analysis (preview + guess) ────────────────────────────────────────────────

export interface FileAnalysis {
  preview: FilePreview
  /** Columns the excel header-name rules recognised (−1 = not by name). */
  nameMapped: { acct: number; desc: number; debit: number; credit: number; total: number }
}

/** previewFile + which guessed columns were recognised by NAME (the registry's classifier needs it). */
export function analyzeFile(fileName: string, bytes: ArrayBuffer, opts?: { sheet?: string | null }): FileAnalysis | null {
  let read: ReadGrid
  try {
    read = readGrid(fileName, bytes, opts?.sheet ?? null)
  } catch {
    return null
  }
  return analyzeGrid(fileName, read)
}

export function analyzeGrid(fileName: string, read: ReadGrid): FileAnalysis | null {
  const { grid } = read
  if (!grid || grid.length === 0 || !hasContent(grid)) return null
  const width = fullWidth(grid)

  const startRow = detectStartRow(grid as any[][])
  const headerRow = startRow > 0 ? startRow - 1 : -1
  const byName = detectColumnsByName(grid as any[][], startRow)
  const nameMapped = byName
    ? { acct: byName.acct, desc: byName.desc, debit: byName.debit, credit: byName.credit, total: byName.total }
    : { acct: -1, desc: -1, debit: -1, credit: -1, total: -1 }

  const bodyStart = headerRow + 1
  const stats: ColumnStats[] = []
  for (let c = 0; c < width; c++) stats.push(classifyColumn(grid, c, bodyStart))
  const headers = stackedHeaderRow(grid, headerRow, width)
  // On a BUDGET report every money column not headed Actual is budget figures
  // (a Budget Overview's "Total" / month columns) — flagged, never guessed.
  const budgetReport = isBudgetReport(grid, read.sheet ?? '', headerRow, fileName)
  const budgetish = headers.map(
    (h, i) => (h !== '' && BUDGETISH.test(h)) || (budgetReport && (stats[i]?.kind === 'money' || stats[i]?.kind === 'acct') && h !== '' && !ACTUAL_HEADER.test(h)),
  )

  // Columns that hold amounts, never account numbers (judged on the guessed header row).
  const holdsAmounts = stats.map((_, i) => columnHoldsAmounts(grid, headerRow, i))

  // ── The guess ──
  let acct = nameMapped.acct
  let desc = nameMapped.desc
  if (!byName) {
    // A column of whole-dollar amounts reads as 'acct'-kind too: never take the
    // column the header row names as the balance ("Amount", "Total") for the
    // account numbers.
    const amountByHeader = totalColumnFromHeaders(stackedHeaderCells(grid as any[][], startRow), [])
    // Nor a column that holds amounts (a Budget vs. Actual's "Budget" column of
    // whole dollars is 'acct'-kind; its header names money): a statement whose names carry the numbers
    // ("40100 Tuition") is read by name, account numbers = None.
    acct = stats.findIndex((s, i) => s.kind === 'acct' && i !== amountByHeader && !holdsAmounts[i])
    desc = stats.findIndex((s, i) => i !== acct && s.kind === 'text')
  }
  let amount = -1
  let debit = -1
  let credit = -1
  const namedPair = byName && nameMapped.debit >= 0 && nameMapped.credit >= 0
  // Debit / Credit by CONTENT (unlabeled columns): judged on the account rows.
  const contentPair = namedPair
    ? null
    : findDebitCreditPair(grid, { bodyStart, acct, exclude: [acct, desc].filter((i) => i >= 0), budgetish, headers })
  const suggestedDebitCredit = namedPair ? { debit: nameMapped.debit, credit: nameMapped.credit } : contentPair
  if (namedPair) {
    debit = nameMapped.debit
    credit = nameMapped.credit
  } else {
    if (byName && nameMapped.total >= 0) amount = nameMapped.total
    if (amount < 0) {
      const lower = stackedHeaderCells(grid as any[][], startRow)
      amount = totalColumnFromHeaders(lower, [acct, desc])
    }
    // No header names the amount, but two columns read as Debit / Credit:
    // guess that layout, never one half of it (the other half would be dropped).
    if (amount < 0 && contentPair) {
      debit = contentPair.debit
      credit = contentPair.credit
    }
    if (amount < 0 && debit < 0) {
      let best = 0
      stats.forEach((s, i) => {
        // A column of whole-dollar positive amounts reads as 'acct'-kind, so any
        // acct-kind column that is not THE account column is a candidate too.
        if (i === acct || i === desc || (s.kind !== 'money' && s.kind !== 'acct') || budgetish[i]) return
        if (s.nonZeroMoney > best) {
          best = s.nonZeroMoney
          amount = i
        }
      })
    }
  }
  // A budget report's "Total" column is budget figures: never offer it as the guess.
  if (budgetReport && amount >= 0 && budgetish[amount]) amount = -1
  const guess: ColumnChoice = { sheet: read.sheet, headerRow, acct, desc, amount, debit, credit }

  const columnCount = Math.min(width, PREVIEW_COLS)
  const columns: PreviewColumn[] = []
  for (let c = 0; c < columnCount; c++) {
    // Whole-dollar amounts look like account numbers ('acct'-kind): once the
    // account column is known, any OTHER acct-kind column is money, so the
    // picker offers it for Amounts / Debit / Credit.
    // A column that holds amounts is money whether or not an account column was found.
    const kind = stats[c]!.kind === 'acct' && c !== acct && (acct >= 0 || holdsAmounts[c]) ? 'money' : stats[c]!.kind
    columns.push({
      index: c,
      letter: columnLetter(c, read.colOffset),
      header: clip(headers[c] ?? ''),
      kind,
      filled: stats[c]!.filled,
      nonZeroMoney: stats[c]!.nonZeroMoney,
      budgetish: budgetish[c] ?? false,
      numeric: stats[c]!.numeric,
      netOfPair: suggestedDebitCredit ? isNetOfPair(grid, c, suggestedDebitCredit, bodyStart) : false,
      holdsAmounts: holdsAmounts[c] ?? false,
    })
  }
  const rows: string[][] = []
  for (let i = 0; i < Math.min(grid.length, PREVIEW_ROWS); i++) {
    const r = grid[i] ?? []
    const out: string[] = []
    for (let c = 0; c < columnCount; c++) out.push(clip(cellText(r[c])))
    rows.push(out)
  }

  const preview: FilePreview = {
    sheet: read.sheet,
    sheets: read.sheets,
    rows,
    totalRows: grid.length,
    columnCount,
    columns,
    guess,
    debitCreditHeader: hasDebitCreditHeader(grid),
    readsAsStatement: gridReadsAsStatement(fileName, grid, read.sheet ?? ''),
    signature: layoutSignature(grid, headerRow),
    colOffset: read.colOffset,
    rowOffset: read.rowOffset,
    suggestedDebitCredit,
    warnings: [],
  }
  preview.warnings = unassignedNumericColumns(preview, guess)
  return { preview, nameMapped }
}

/**
 * What the picker shows for a file: the first rows, every column's kind and a
 * guess. null when the file cannot be read as a grid at all (unsupported,
 * unreadable, or blank).
 */
export function previewFile(fileName: string, bytes: ArrayBuffer, opts?: { sheet?: string | null }): FilePreview | null {
  return analyzeFile(fileName, bytes, opts)?.preview ?? null
}

// ── Plain reasons ─────────────────────────────────────────────────────────────

/** 'can-number' (acct-is-money): the picker offers "None — KYRO numbers them" for this grid (it reads as a statement). */
export type FailureVariant = 'zeros' | 'same-column' | 'no-sign' | 'no-rows' | 'need-acct' | 'budget-report' | 'can-number' | 'header-row'

/** A column-picker role, as the picker labels it. */
export type ColumnRole = 'acct' | 'desc' | 'amount' | 'debit' | 'credit'
const ROLE_LABEL: Record<ColumnRole, string> = {
  acct: 'account numbers',
  desc: 'names',
  amount: 'amounts',
  debit: 'debits',
  credit: 'credits',
}

/**
 * ONE plain sentence + the question to answer, for a failure code. Columns are
 * named by LETTER only (from the preview), never by their cell text.
 */
export function explainFailure(
  code: IngestErrorCode,
  preview: FilePreview | null,
  detail?: { column?: number; variant?: FailureVariant; colOffset?: number; roles?: [ColumnRole, ColumnRole] },
): { reason: string; ask: string | null } {
  const letterOf = (i: number | undefined): string | null => {
    if (i == null || i < 0) return null
    const col = preview?.columns[i]
    if (col) return col.letter
    return preview ? columnLetter(i, preview.colOffset) : columnLetter(i, detail?.colOffset ?? 0)
  }
  const inCol = (i: number | undefined): string => {
    const l = letterOf(i)
    return l ? ` in column ${l}` : ''
  }
  const firstMoney = (): number => {
    if (!preview) return -1
    if (preview.guess.amount >= 0) return preview.guess.amount
    const c = preview.columns.find((x) => x.kind === 'money' && x.index !== preview.guess.acct)
    return c ? c.index : -1
  }
  const ask = {
    balances: 'Which column holds the balances?',
  }
  switch (code) {
    case 'no-amount':
      if (detail?.variant === 'zeros') {
        const l = letterOf(detail.column ?? preview?.guess.amount)
        return {
          reason: l ? `Every amount in column ${l} is blank or zero.` : 'Every amount is blank or zero.',
          ask: ask.balances,
        }
      }
      return {
        reason: `We found account numbers${inCol(detail?.column ?? preview?.guess.acct)} but no amount column.`,
        ask: ask.balances,
      }
    case 'no-accounts': {
      const m = detail?.column ?? firstMoney()
      if (m >= 0) {
        return { reason: `We found amounts${inCol(m)} but no account numbers.`, ask: 'Which column has the account numbers?' }
      }
      return {
        reason: "We couldn't find account numbers or amounts in this file.",
        ask: 'Which row has the column names?',
      }
    }
    case 'no-description':
      return {
        reason: `We found account numbers${inCol(detail?.column ?? preview?.guess.acct)} but no account names.`,
        ask: 'Which column has the names?',
      }
    case 'empty':
      return { reason: 'This file looks empty.', ask: 'Check the export has numbers in it.' }
    case 'unsupported':
      return { reason: 'KYRO reads Excel (.xlsx, .xls) and .csv files.', ask: null }
    case 'budget-only':
      return {
        reason: 'This is a budget report — it has no actual amounts.',
        ask: 'Export Budget vs. Actuals or the Profit and Loss instead.',
      }
    case 'budget-column': {
      const l = letterOf(detail?.column)
      if (detail?.variant === 'budget-report') {
        return {
          reason: l ? `Column ${l} holds budget figures.` : 'This column holds budget figures.',
          ask: 'Pick the Actual column. A Budget Overview has none — export Budget vs. Actuals or the Profit and Loss instead.',
        }
      }
      return {
        reason: `${l ? `Column ${l}` : 'That column'} holds budget, variance or prior-year figures, not actual balances.`,
        ask: "Pick the column with this period's actual balances.",
      }
    }
    case 'acct-is-money': {
      const l = letterOf(detail?.column)
      const canNumber = detail?.variant === 'can-number' || !!preview?.readsAsStatement
      return {
        reason: `${l ? `Column ${l}` : 'That column'} holds amounts, not account numbers.`,
        ask: canNumber
          ? 'Pick the column with your account numbers, or “None — KYRO numbers them” if there isn’t one.'
          : 'Pick the column with your account numbers.',
      }
    }
    case 'bad-choice':
      switch (detail?.variant) {
        case 'same-column': {
          // Name the two roles that actually collide ("Names and amounts can't
          // both be column B."), never a fixed pair that may not be the one.
          const roles = detail.roles
          if (!roles) return { reason: "Two jobs can't share the same column.", ask: 'Pick a different column for one of them.' }
          const [a, b] = roles.map((r) => ROLE_LABEL[r])
          const pair = `${a![0]!.toUpperCase()}${a!.slice(1)} and ${b}`
          const l = letterOf(detail.column)
          return {
            reason: l ? `${pair} can't both be column ${l}.` : `${pair} can't be the same column.`,
            ask: 'Pick a different column for one of them.',
          }
        }
        case 'no-sign':
          return {
            reason: "We couldn't tell income from expenses in this layout.",
            ask: 'Pick the account-number column so we can sign each row.',
          }
        case 'header-row':
          return {
            reason: "That row doesn't look like your column names.",
            ask: 'Pick the row with the column names.',
          }
        case 'need-acct':
          return {
            reason: 'We can only number accounts ourselves for a QuickBooks Profit and Loss or Balance Sheet.',
            ask: 'Pick the column with account numbers.',
          }
        default:
          return { reason: "Those columns didn't give us any accounts.", ask: 'Try another header row or account column.' }
      }
  }
}
