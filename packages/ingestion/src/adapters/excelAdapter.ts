// ─────────────────────────────────────────────────────────────
// Excel trial-balance adapter. Ports the legacy parseTrialBalance
// VERBATIM (start-row detection, column-E-or-debit-minus-credit total,
// acct 100-9999 range filter). Throws the same error strings.
// ─────────────────────────────────────────────────────────────
import * as XLSX from 'xlsx'
import type { IngestionAdapter, IngestionResult, NormalizedRow } from '../types.js'
import { extractSheetMetadata } from '../metadata.js'

/** Flatten the banner/title cells above the data header into strings. */
function headerCells(raw: any[][], startRow: number): string[] {
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

/** Detect the first data row by scanning the top of the sheet. */
function detectStartRow(raw: any[][]): number {
  let startRow = 3 // safe default
  for (let i = 0; i < Math.min(12, raw.length); i++) {
    const r = raw[i]
    if (!r) continue
    const c0 = (r[0] || '').toString().trim().toLowerCase()
    const c1 = (r[1] || '').toString().trim().toLowerCase()
    // Header row like "Number | Description"
    if (
      (c0 === 'number' || c0 === 'account' || c0 === 'acct') &&
      (c1 === 'description' || c1 === 'name')
    ) {
      return i + 1
    }
    // First row whose column A looks like an account number
    const num = parseInt(c0, 10)
    if (!isNaN(num) && num >= 100 && num <= 9999) {
      return i
    }
  }
  return startRow
}

/** Parse an ArrayBuffer of an Excel file into trial-balance rows. */
export function parseTrialBalance(arrayBuffer: ArrayBuffer): IngestionResult {
  const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]!]!
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as any[][]

  if (!raw || raw.length < 3) {
    throw new Error('File appears empty or unreadable.')
  }

  const startRow = detectStartRow(raw)
  const rows: NormalizedRow[] = []

  for (let i = startRow; i < raw.length; i++) {
    const r = raw[i]
    if (!r || r[0] == null) continue

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

export const excelAdapter: IngestionAdapter = {
  format: 'xlsx',
  canHandle(fileName: string): boolean {
    return /\.xlsx?$/i.test(fileName)
  },
  parse(bytes: ArrayBuffer): IngestionResult {
    return parseTrialBalance(bytes)
  },
}
