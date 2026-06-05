// ─────────────────────────────────────────────────────────────
// CSV trial-balance adapter (NEW). Mirrors the Excel adapter's column
// semantics (A=acct, B=desc, C=debit, D=credit, E=total) and the same
// start-row detection heuristic, emitting identical NormalizedRow[].
// Lib-light: hand-rolled CSV parsing (handles quoted fields/commas).
// ─────────────────────────────────────────────────────────────
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
    if (!isNaN(num) && num >= 100 && num <= 9999) {
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
  const rows: NormalizedRow[] = []

  for (let i = startRow; i < raw.length; i++) {
    const r = raw[i]
    if (!r || r[0] == null || r[0] === '') continue

    const acct = parseInt(r[0].toString().trim(), 10)
    if (isNaN(acct) || acct <= 0 || acct > 9999) continue

    const desc = r[1] != null ? r[1].toString().trim() : ''
    if (!desc || desc === 'null' || desc === 'undefined') continue

    let total = 0
    if (r[4] != null && r[4] !== '') {
      const p = parseFloat(clean(r[4]))
      if (!isNaN(p)) total = p
    } else {
      const deb = parseFloat(clean(r[2] ?? '0')) || 0
      const crd = parseFloat(clean(r[3] ?? '0')) || 0
      total = deb - crd
    }

    rows.push({ acct, desc, total })
  }

  if (rows.length === 0) {
    throw new Error(
      `No account rows found (start row detected: ${startRow}). ` +
        'Ensure account numbers are in column A starting around row 4.'
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
