// ─────────────────────────────────────────────────────────────
// Excel trial-balance adapter. Ports the legacy parseTrialBalance
// semantics (start-row detection, Total-column-wins-else-debit-minus-credit,
// acct 100-9999 range filter) but now (a) maps columns by HEADER NAME so a
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
interface ColumnMap {
  acct: number
  desc: number
  debit: number
  credit: number
  total: number
}

const FIXED_COLUMNS: ColumnMap = { acct: 0, desc: 1, debit: 2, credit: 3, total: 4 }

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
function detectStartRow(raw: RawGrid): number {
  const startRow = 3 // safe default
  for (let i = 0; i < Math.min(12, raw.length); i++) {
    const r = raw[i]
    if (!r) continue
    // Header row like "Number | Description" — matched ANYWHERE in the row so a
    // re-ordered sheet (Total first, etc.) still anchors on its header.
    if (rowLooksLikeHeader(r)) return i + 1
    // First row whose column A looks like an account number
    const num = parseInt((r[0] || '').toString().trim(), 10)
    if (!isNaN(num) && num >= 100 && num <= 9999) {
      return i
    }
  }
  return startRow
}

/**
 * Map columns by HEADER NAME using the row just above the first data row (the
 * detected header row). Falls back to the fixed A/B/C/D/E positions when the
 * header text is unrecognizable (or there is no header row — data detected by
 * account-number). Robustness for the "interpret ALL files" goal.
 */
function detectColumns(raw: RawGrid, startRow: number): ColumnMap {
  const headerRow = startRow > 0 ? raw[startRow - 1] : undefined
  if (!headerRow || !Array.isArray(headerRow)) return FIXED_COLUMNS
  const map: ColumnMap = { acct: -1, desc: -1, debit: -1, credit: -1, total: -1 }
  headerRow.forEach((cell, idx) => {
    const h = (cell ?? '').toString().trim().toLowerCase()
    if (!h) return
    if (map.acct < 0 && /^(number|account|acct|acc|gl|no\.?|#)\b|account\s*(number|no)/.test(h)) {
      map.acct = idx
    } else if (map.desc < 0 && /(description|account\s*name|name|desc)/.test(h)) {
      map.desc = idx
    } else if (map.debit < 0 && /^debit|\bdebit\b|\bdr\b/.test(h)) {
      map.debit = idx
    } else if (map.credit < 0 && /^credit|\bcredit\b|\bcr\b/.test(h)) {
      map.credit = idx
    } else if (map.total < 0 && /\b(total|net|amount|balance|ending)\b/.test(h)) {
      map.total = idx
    }
  })
  // Need at least account + description recognized to trust name-mapping.
  if (map.acct < 0 || map.desc < 0) return FIXED_COLUMNS
  return map
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
    if (isNaN(acct) || acct <= 0 || acct > 9999) continue

    const descCell = r[cols.desc]
    const desc = descCell != null ? descCell.toString().trim() : ''
    if (!desc || desc === 'null' || desc === 'undefined') continue

    rows.push({ acct, desc, total: rowTotal(r, cols) })
  }

  if (rows.length === 0) return null

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
        'Ensure account numbers are in column A starting around row 4.',
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
