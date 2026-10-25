// ─────────────────────────────────────────────────────────────────────────────
// readTable — ONE reader for every "a list of rows" upload (rosters, board
// members, committees, assessments, staff…): .xlsx / .xls / .csv / .tsv in,
// `{ header, rows }` per sheet out, with the header row FOUND rather than
// assumed. Exporters put titles, blank lines and "As of …" banners above the
// real header, and finance already learned to look for it (#32); every other
// module used to assume row 1 and reject the file.
//
// PURE: bytes in, strings out. No coercion here — a cell is whatever text the
// sheet held (dates are rendered as the sheet shows them). Schemas decide meaning.
// ─────────────────────────────────────────────────────────────────────────────
import * as XLSX from 'xlsx'

export interface TableSheet {
  /** Sheet name (xlsx) or null for a CSV. */
  name: string | null
  /** 0-based index of the row used as the header. */
  headerRow: number
  /** Trimmed header cells (blank cells kept as '' so indexes line up). */
  header: string[]
  /** Data rows after the header; each cell a trimmed string. Blank rows dropped. */
  rows: string[][]
}

export interface TableRead {
  kind: 'xlsx' | 'csv'
  sheets: TableSheet[]
}

const BOM = 0xfeff

/** Zip-based xlsx (PK..) that is a workbook, or legacy BIFF .xls (D0 CF 11 E0). */
export function looksLikeWorkbook(buf: Uint8Array): boolean {
  if (buf.length < 8) return false
  if (buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) return true
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    // A OneRoster ZIP is also PK… — a workbook has an xl/ folder in its directory.
    const head = Buffer.from(buf.subarray(0, Math.min(buf.length, 4096))).toString('latin1')
    const tail = Buffer.from(buf.subarray(Math.max(0, buf.length - 65536))).toString('latin1')
    return head.includes('xl/') || head.includes('[Content_Types].xml') || tail.includes('xl/')
  }
  return false
}

/** RFC-4180-ish delimited text → cells (quotes, "" escapes, CR/LF). */
export function parseDelimited(textIn: string, delimiter: string): string[][] {
  const text = textIn.charCodeAt(0) === BOM ? textIn.slice(1) : textIn
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch !== '\r') {
      field += ch
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** Comma unless the first non-blank line is clearly tab- or semicolon-separated. */
export function detectDelimiter(text: string): string {
  const line = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? ''
  const count = (c: string) => line.split(c).length - 1
  const tabs = count('\t')
  const semis = count(';')
  const commas = count(',')
  if (tabs > commas && tabs > semis) return '\t'
  if (semis > commas && semis > tabs) return ';'
  return ','
}

const HEADER_SCAN_ROWS = 25

function isLabelish(cell: string): boolean {
  const s = cell.trim()
  if (!s) return false
  if (/^-?[\d,.$%()\s]+$/.test(s)) return false // a number, not a label
  return true
}

/**
 * The header is the first row (within the first 25) whose count of label-like
 * cells is at least 2 and at least 60% of the best such count in the window.
 * A one-cell title ("Holy Family Academy"), a blank line, or an "As of …" banner
 * all score below the real header; a data row of numbers scores 0-1.
 */
export function detectHeaderRow(grid: string[][]): number {
  const window = grid.slice(0, HEADER_SCAN_ROWS)
  const scores = window.map((r) => r.filter(isLabelish).length)
  const best = Math.max(0, ...scores)
  if (best < 2) return 0
  const idx = scores.findIndex((s) => s >= 2 && s >= best * 0.6)
  return idx < 0 ? 0 : idx
}

/** A grid (any source — a PDF's rebuilt table, a sheet) → a TableSheet with the header row found. */
export function gridToSheet(name: string | null, grid: string[][]): TableSheet | null {
  return toSheet(name, grid)
}

function toSheet(name: string | null, grid: string[][]): TableSheet | null {
  const cleaned = grid.map((r) => r.map((c) => (c ?? '').toString().trim()))
  const headerRow = detectHeaderRow(cleaned)
  const header = (cleaned[headerRow] ?? []).map((h, i) => (i === 0 && h.charCodeAt(0) === BOM ? h.slice(1) : h))
  if (header.filter(Boolean).length === 0) return null
  const width = header.length
  const rows = cleaned
    .slice(headerRow + 1)
    .filter((r) => r.some((c) => c !== ''))
    .map((r) => (r.length >= width ? r : [...r, ...Array<string>(width - r.length).fill('')]))
  return { name, headerRow, header, rows }
}

/**
 * Read any tabular upload. Throws only when the bytes are not a readable table
 * (an image, an empty file). Sheets with no header-like row are omitted; a
 * workbook whose every sheet is empty yields `sheets: []`.
 */
export function readTable(input: Uint8Array | ArrayBuffer | string): TableRead {
  if (typeof input === 'string') {
    const grid = parseDelimited(input, detectDelimiter(input))
    const sheet = toSheet(null, grid)
    return { kind: 'csv', sheets: sheet ? [sheet] : [] }
  }
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : input
  if (bytes.length === 0) throw new Error('The file is empty.')
  if (looksLikeWorkbook(bytes)) {
    let wb: XLSX.WorkBook
    try {
      wb = XLSX.read(bytes, { type: 'array', cellDates: false, raw: false })
    } catch {
      throw new Error('Couldn’t open this workbook. Save it as .xlsx or .csv and try again.')
    }
    const sheets: TableSheet[] = []
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name]
      if (!ws) continue
      // raw:false → formatted text (dates as displayed, numbers as shown).
      const grid = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '', raw: false, blankrows: false })
      const sheet = toSheet(name, grid)
      if (sheet) sheets.push(sheet)
    }
    return { kind: 'xlsx', sheets }
  }
  const text = Buffer.from(bytes).toString('utf8')
  const grid = parseDelimited(text, detectDelimiter(text))
  const sheet = toSheet(null, grid)
  return { kind: 'csv', sheets: sheet ? [sheet] : [] }
}

/** The sheet with the most rows — the one a person means when they say "the list". */
export function mainSheet(read: TableRead): TableSheet | null {
  return read.sheets.reduce<TableSheet | null>((best, s) => (!best || s.rows.length > best.rows.length ? s : best), null)
}
