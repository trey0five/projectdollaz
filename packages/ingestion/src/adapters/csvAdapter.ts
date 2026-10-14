// ─────────────────────────────────────────────────────────────
// CSV trial-balance adapter (NEW). Mirrors the Excel adapter's column
// semantics (A=acct, B=desc, C=debit, D=credit, E=total) and the same
// start-row detection heuristic, emitting identical NormalizedRow[].
// Lib-light: hand-rolled CSV parsing (handles quoted fields/commas).
// ─────────────────────────────────────────────────────────────
import { ACCT_MAX, isPlausibleAcct, detectColumns, rowTotalFor } from './excelAdapter.js'
import type { IngestionAdapter, IngestionResult, NormalizedRow } from '../types.js'
import { extractSheetMetadata } from '../metadata.js'

/** Flatten the banner/title cells above the data header into strings. */
function headerCells(raw: string[][], startRow: number): string[] {
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

/** Parse CSV text into a 2D array of cell strings (RFC-4180-ish). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch === '\r') {
      // ignore; \n handles line end
    } else {
      field += ch
    }
  }
  // flush trailing field/row
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function detectStartRow(raw: string[][]): number {
  let startRow = 3
  for (let i = 0; i < Math.min(12, raw.length); i++) {
    const r = raw[i]
    if (!r) continue
    const c0 = (r[0] || '').toString().trim().toLowerCase()
    const c1 = (r[1] || '').toString().trim().toLowerCase()
    if (
      (c0 === 'number' || c0 === 'account' || c0 === 'acct') &&
      (c1 === 'description' || c1 === 'name')
    ) {
      return i + 1
    }
    const num = parseInt(c0, 10)
    if (!isNaN(num) && num >= 100 && num <= ACCT_MAX) {
      return i
    }
  }
  return startRow
}

export function parseTrialBalanceCsv(bytes: ArrayBuffer): IngestionResult {
  const text = new TextDecoder('utf-8').decode(new Uint8Array(bytes))
  const raw = parseCsv(text)

  if (!raw || raw.length < 3) {
    throw new Error('File appears empty or unreadable.')
  }

  const startRow = detectStartRow(raw)
  // Header-aware column mapping shared with the Excel adapter (falls back to the
  // fixed A/B/C/D/E positions when the header is unrecognisable), so a CSV with
  // "Acct,Desc,Budget,Actual" imports the Actual column, not Budget.
  const cols = detectColumns(raw, startRow)
  const rows: NormalizedRow[] = []

  for (let i = startRow; i < raw.length; i++) {
    const r = raw[i]
    if (!r) continue
    const acctCell = r[cols.acct]
    if (acctCell == null || acctCell === '') continue

    const acct = parseInt(acctCell.toString().trim(), 10)
    if (!isPlausibleAcct(acct)) continue

    const desc = r[cols.desc] != null ? r[cols.desc].toString().trim() : ''
    if (!desc || desc === 'null' || desc === 'undefined') continue

    rows.push({ acct, desc, total: rowTotalFor(r, cols) })
  }

  if (rows.length === 0) {
    throw new Error(
      `No account rows found (start row detected: ${startRow}). ` +
        'Ensure account numbers (1–999999) are in column A with the description in column B.'
    )
  }

  const metadata = extractSheetMetadata(
    headerCells(raw, startRow),
    '', // sourceName defaulted by the ingest facade
    rows.length
  )

  return { rows, startRow, metadata }
}

export const csvAdapter: IngestionAdapter = {
  format: 'csv',
  canHandle(fileName: string): boolean {
    return /\.csv$/i.test(fileName)
  },
  parse(bytes: ArrayBuffer): IngestionResult {
    return parseTrialBalanceCsv(bytes)
  },
}
