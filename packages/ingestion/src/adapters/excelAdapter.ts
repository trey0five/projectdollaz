// ─────────────────────────────────────────────────────────────
// Excel trial-balance adapter. Ports the legacy parseTrialBalance
// semantics (start-row detection, Total-column-wins-else-debit-minus-credit,
// acct range filter — now 1…999 999, QuickBooks-style 5-digit charts included)
// but now (a) maps columns by HEADER NAME so a
// re-ordered sheet still parses, and (b) enumerates EVERY sheet in a workbook
// (listTrialBalanceSheets) so a multi-sheet monthly workbook fans out to one
// candidate per sheet. Single-sheet behaviour is byte-identical.
// ─────────────────────────────────────────────────────────────
import * as XLSX from 'xlsx'
import type {
  IngestionAdapter,
  IngestionResult,
  NormalizedRow,
  SheetCandidate,
} from '../types.js'
import { extractSheetMetadata } from '../metadata.js'

type RawGrid = any[][]

/** Column indices for the trial-balance fields (-1 = column absent). */
export interface ColumnMap {
  acct: number
  desc: number
  debit: number
  credit: number
  total: number
}

const FIXED_COLUMNS: ColumnMap = { acct: 0, desc: 1, debit: 2, credit: 3, total: 4 }

/**
 * Account-number range the engine accepts from FILES. 4-digit charts (1000…9999)
 * and 5-digit QuickBooks-style charts (40000-series revenue, 60000-series expense —
 * the SAME blocks the live QBO sync synthesises in qbo.client.ts) both pass.
 * Six digits is the ceiling so years/phone numbers/ZIPs in column A don't read as
 * accounts. (2026-10-14 customer file: every row was 40000+ and got dropped.)
 */
export const ACCT_MIN = 1
export const ACCT_MAX = 999_999
export const isPlausibleAcct = (n: number): boolean =>
  Number.isInteger(n) && n >= ACCT_MIN && n <= ACCT_MAX
/** Start-row scan: a cell "looks like" an account number from 100 up. */
const looksLikeAcctCell = (v: unknown): boolean => {
  const n = parseInt((v ?? '').toString().trim(), 10)
  return !isNaN(n) && n >= 100 && n <= ACCT_MAX
}

/**
 * Header → signed-TOTAL column. Order = preference when several amount columns
 * exist (a QuickBooks "Budget vs Actuals" export carries Actual | Budget |
 * over Budget | % of Budget): the ACTUAL / period balance wins; budget, variance
 * and percentage columns are never treated as the balance.
 */
const TOTAL_HEADER_PATTERNS: RegExp[] = [
  /\bactuals?\b/,
  /\b(ytd|year[\s-]*to[\s-]*date)\b/,
  /\b(ending|closing)\s*balance\b|\bbalance\b/,
  /\b(total|net|amount)\b/,
  /\b(current|this)\s*(year|period|fy)\b/,
]
const NEVER_TOTAL = /budget|variance|over\s*budget|under\s*budget|%|percent|prior|last\s*year|py\b/

/** Flatten the banner/title cells above the data header into strings. */
function headerCells(raw: RawGrid, startRow: number): string[] {
  const out: string[] = []
  for (let i = 0; i < startRow; i++) {
    const r = raw[i]
    if (!r) continue
    for (const c of r) {
      if (c != null && c !== '') out.push(c.toString())
    }
  }
  return out
}

const clean = (v: unknown): string =>
  v != null ? v.toString().replace(/[$,\s]/g, '') : ''

const isAcctHeader = (h: string): boolean =>
  /^(number|account|acct|acc|gl|no\.?|#)$/.test(h) || /account\s*(number|no\.?)/.test(h)
const isDescHeader = (h: string): boolean =>
  /^(description|name|account\s*name|desc)$/.test(h)

/** True when a row anywhere holds an account-header AND a description-header cell. */
function rowLooksLikeHeader(r: any[]): boolean {
  let hasAcct = false
  let hasDesc = false
  for (const c of r) {
    const h = (c ?? '').toString().trim().toLowerCase()
    if (!h) continue
    if (isAcctHeader(h)) hasAcct = true
    else if (isDescHeader(h)) hasDesc = true
  }
  return hasAcct && hasDesc
}

/** Detect the first data row by scanning the top of the sheet. */
export function detectStartRow(raw: RawGrid): number {
  const startRow = 3 // safe default
  for (let i = 0; i < Math.min(12, raw.length); i++) {
    const r = raw[i]
    if (!r) continue
    // Header row like "Number | Description" — matched ANYWHERE in the row so a
    // re-ordered sheet (Total first, etc.) still anchors on its header.
    if (rowLooksLikeHeader(r)) return i + 1
    // First row whose column A looks like an account number
    if (looksLikeAcctCell(r[0])) return i
  }
  return startRow
}

/**
 * Map columns by HEADER NAME using the row just above the first data row (the
 * detected header row). Falls back to the fixed A/B/C/D/E positions when the
 * header text is unrecognizable (or there is no header row — data detected by
 * account-number). Robustness for the "interpret ALL files" goal.
 */
/**
 * Map columns by HEADER NAME. Exported so the CSV adapter uses the SAME rules.
 *
 * STACKED HEADERS: QuickBooks (and hand-built sheets) often put the amount
 * header on the row ABOVE the account/description header — the 2026-10-14
 * customer export was literally `row 2: _ | _ | Actual` over `row 3: Acct |
 * Desc | _`. So after reading the detected header row, any column still
 * unmapped is looked up in the two rows above it (nearest first). Only
 * cells that sit in an otherwise-unlabeled column are taken, so a banner
 * title in A1 can never be mistaken for a column header.
 */
export function detectColumns(raw: RawGrid, startRow: number): ColumnMap {
  return detectColumnsByName(raw, startRow) ?? FIXED_COLUMNS
}

/**
 * The header row (the row just above `startRow`) with blank cells filled from
 * up to two rows above, nearest first — lower-cased + trimmed. [] when there is
 * no header row.
 */
export function stackedHeaderCells(raw: RawGrid, startRow: number): string[] {
  const headerRow = startRow > 0 ? raw[startRow - 1] : undefined
  if (!headerRow || !Array.isArray(headerRow)) return []
  const norm = (row: any[] | undefined): string[] =>
    (row ?? []).map((cell) => (cell ?? '').toString().trim().toLowerCase())
  const headers = norm(headerRow)
  // Fill blanks in the header row from up to two rows above (stacked headers).
  for (let up = 2; up <= 3; up++) {
    const above = startRow - up >= 0 ? norm(raw[startRow - up]) : []
    above.forEach((h, i) => {
      if (h && !headers[i]) headers[i] = h
    })
  }
  return headers
}

/**
 * The signed-TOTAL column among (stacked, lower-cased) header cells: best
 * preference across the WHOLE row (not first match wins), skipping budget /
 * variance / percentage columns outright and the `exclude`d columns. -1 = none.
 */
export function totalColumnFromHeaders(headers: string[], exclude: readonly number[]): number {
  for (const pat of TOTAL_HEADER_PATTERNS) {
    const idx = headers.findIndex((h, i) => h && !exclude.includes(i) && pat.test(h) && !NEVER_TOTAL.test(h))
    if (idx >= 0) return idx
  }
  return -1
}

/**
 * Name-mapping only: the column map when the header row NAMES both the
 * account and the description columns, else null (detectColumns then falls
 * back to the fixed A/B/C/D/E positions). Exported for the #32 preview, which
 * must know whether a column was recognised by name or merely by position.
 */
export function detectColumnsByName(raw: RawGrid, startRow: number): ColumnMap | null {
  const headers = stackedHeaderCells(raw, startRow)
  if (headers.length === 0) return null
  const map: ColumnMap = { acct: -1, desc: -1, debit: -1, credit: -1, total: -1 }
  headers.forEach((h, idx) => {
    if (!h) return
    if (map.acct < 0 && /^(number|account|acct|acc|gl|no\.?|#)\b|account\s*(number|no)/.test(h)) {
      map.acct = idx
    } else if (map.desc < 0 && /(description|account\s*name|name|desc)/.test(h)) {
      map.desc = idx
    } else if (map.debit < 0 && /^debit|\bdebit\b|\bdr\b/.test(h)) {
      map.debit = idx
    } else if (map.credit < 0 && /^credit|\bcredit\b|\bcr\b/.test(h)) {
      map.credit = idx
    }
  })
  map.total = totalColumnFromHeaders(headers, [map.acct, map.desc, map.debit, map.credit])
  // Need at least account + description recognized to trust name-mapping.
  if (map.acct < 0 || map.desc < 0) return null
  return map
}

/**
 * No balance could have been read: no amount column was recognised by name,
 * OR every body cell of the amount column(s) in use is blank (the fixed
 * A/B/C/D/E fallback pointing past a two-column sheet). Paired with "every
 * total is 0" by both plain adapters — never import a chart of zeros.
 */
export function noAmountCells(raw: any[][], startRow: number, cols: ColumnMap): boolean {
  if (cols.total < 0 && cols.debit < 0 && cols.credit < 0) return true
  const used = [cols.total, cols.debit, cols.credit].filter((c) => c >= 0)
  for (let i = startRow; i < raw.length; i++) {
    const r = raw[i]
    if (!r) continue
    for (const c of used) {
      const v = r[c]
      if (v != null && v.toString().trim() !== '') return false
    }
  }
  return true
}

/** Shared by the CSV adapter: the signed total of one row under a column map. */
export function rowTotalFor(r: any[], cols: ColumnMap): number {
  return rowTotal(r, cols)
}
/** Compute a single row's signed total: Total column wins, else Debit − Credit. */
function rowTotal(r: any[], cols: ColumnMap): number {
  if (cols.total >= 0) {
    const cell = r[cols.total]
    if (cell != null && cell !== '') {
      const p = parseFloat(clean(cell))
      if (!isNaN(p)) return p
    }
  }
  const deb = cols.debit >= 0 ? parseFloat(clean(r[cols.debit] ?? '0')) || 0 : 0
  const crd = cols.credit >= 0 ? parseFloat(clean(r[cols.credit] ?? '0')) || 0 : 0
  return deb - crd
}

/**
 * Parse ONE sheet's raw grid into normalized rows + metadata. Returns null when
 * the grid is empty/unreadable or holds no account rows (so a non-TB tab such as
 * "Assumptions" is skipped by the enumerator instead of throwing).
 */
function parseSheetGrid(raw: RawGrid, sheetName: string): IngestionResult | null {
  if (!raw || raw.length < 3) return null

  const startRow = detectStartRow(raw)
  const cols = detectColumns(raw, startRow)
  const rows: NormalizedRow[] = []

  for (let i = startRow; i < raw.length; i++) {
    const r = raw[i]
    if (!r) continue
    const acctCell = r[cols.acct]
    if (acctCell == null) continue

    const acct = parseInt(acctCell.toString().trim(), 10)
    if (!isPlausibleAcct(acct)) continue

    const descCell = r[cols.desc]
    const desc = descCell != null ? descCell.toString().trim() : ''
    if (!desc || desc === 'null' || desc === 'undefined') continue

    rows.push({ acct, desc, total: rowTotal(r, cols) })
  }

  if (rows.length === 0) return null
  // Every parsed total is zero AND no amount column was recognised → the sheet
  // has balances we could not find (e.g. an unlabeled column). Refuse rather
  // than import a chart of zeros that looks like success.
  if (rows.every((r) => r.total === 0) && noAmountCells(raw, startRow, cols)) {
    const hdr = (startRow > 0 ? raw[startRow - 1] ?? [] : []).map((c: unknown) => (c ?? '').toString().trim()).filter(Boolean)
    throw new Error(
      `Found ${rows.length} account rows but no amount column. ` +
        `Header cells seen: ${hdr.length ? hdr.join(' | ') : '(none)'}. ` +
        'Name the balance column "Actual", "Total", "Balance", "Debit"/"Credit", or "YTD".',
    )
  }

  const net = rows.reduce((s, r) => s + (Number.isFinite(r.total) ? r.total : 0), 0)
  const metadata = extractSheetMetadata(
    headerCells(raw, startRow),
    '', // sourceName defaulted by the ingest facade
    rows.length,
    { sheetName, net, accountCount: rows.length },
  )

  return { rows, startRow, metadata }
}

/** Read a workbook and turn a named sheet into a raw grid. */
function sheetGrid(wb: XLSX.WorkBook, name: string): RawGrid {
  const ws = wb.Sheets[name]
  if (!ws) return []
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as RawGrid
}

/** The first sheet that parses to at least one account row (NOT blind index 0). */
function firstTrialBalanceSheet(wb: XLSX.WorkBook): string | undefined {
  for (const name of wb.SheetNames) {
    const parsed = parseSheetGrid(sheetGrid(wb, name), name)
    if (parsed) return name
  }
  return undefined
}

/**
 * Parse an ArrayBuffer of an Excel file into trial-balance rows. When `sheetName`
 * is given it parses THAT sheet; otherwise the first trial-balance-looking sheet
 * (NOT blind index 0). Throws the same error strings as the legacy parser.
 */
export function parseTrialBalance(
  arrayBuffer: ArrayBuffer,
  sheetName?: string,
): IngestionResult {
  const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' })
  if (wb.SheetNames.length === 0) {
    throw new Error('File appears empty or unreadable.')
  }
  const target =
    sheetName && wb.SheetNames.includes(sheetName)
      ? sheetName
      : firstTrialBalanceSheet(wb) ?? wb.SheetNames[0]!

  const raw = sheetGrid(wb, target)
  if (!raw || raw.length < 3) {
    throw new Error('File appears empty or unreadable.')
  }

  const result = parseSheetGrid(raw, target)
  if (!result) {
    const startRow = detectStartRow(raw)
    throw new Error(
      `No account rows found (start row detected: ${startRow}). ` +
        'Ensure account numbers (1–999999) are in an "Account"/"Acct" column with a "Description"/"Desc" column beside it.',
    )
  }
  return result
}

/**
 * Enumerate EVERY sheet in the workbook and return one SheetCandidate per sheet
 * that looks like a trial balance (has account rows). Non-TB tabs (e.g.
 * "Assumptions") are omitted. Each candidate carries its own rows + per-sheet
 * metadata (monthKey / isMonthly / net / accountCount / periodEndDate).
 */
export function listTrialBalanceSheets(arrayBuffer: ArrayBuffer): SheetCandidate[] {
  const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' })
  const out: SheetCandidate[] = []
  for (const name of wb.SheetNames) {
    try {
      const parsed = parseSheetGrid(sheetGrid(wb, name), name)
      if (!parsed) continue
      out.push({ sheet: name, rows: parsed.rows, metadata: parsed.metadata! })
    } catch {
      // A single unreadable sheet must not abort the whole enumeration.
      continue
    }
  }
  return out
}

export const excelAdapter: IngestionAdapter = {
  format: 'xlsx',
  canHandle(fileName: string): boolean {
    return /\.xlsx?$/i.test(fileName)
  },
  parse(bytes: ArrayBuffer, opts?: { sheet?: string }): IngestionResult {
    return parseTrialBalance(bytes, opts?.sheet)
  },
}
