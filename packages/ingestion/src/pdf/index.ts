// ─────────────────────────────────────────────────────────────────────────────
// PDF → table (#52). A text-layer PDF (a QuickBooks report "saved as PDF", a
// SIS or publisher export) keeps every cell as positioned text. We rebuild the
// table — rows by y, columns by clustered x — and hand the grid to the parsers
// that already exist, as an .xlsx so every path reads it unchanged.
//
// Its own subpath (`@finrep/ingestion/pdf`): pdfjs is Node-sized and server-
// only; the browser asks the API to convert. A PDF with no text layer (a scan)
// comes back with zero rows — that's the OCR follow-up, said in plain words.
// ─────────────────────────────────────────────────────────────────────────────
import * as XLSX from 'xlsx'
import { gridToSheet, type TableRead } from '../table-import/read-table.js'

export function isPdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 // %PDF
}

interface Item {
  str: string
  x: number
  y: number
  w: number
  h: number
}

/** Every positioned text item on every page, page-offset so pages stack. */
async function textItems(bytes: Uint8Array): Promise<{ items: Item[]; pages: number }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  // pdfjs refuses a Node Buffer ("provide binary data as Uint8Array"); copy into a plain one.
  const data = new Uint8Array(bytes.byteLength)
  data.set(bytes)
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false, disableFontFace: true }).promise
  const items: Item[] = []
  let offset = 0
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const view = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    for (const raw of content.items) {
      const it = raw as { str?: string; transform?: number[]; width?: number; height?: number }
      if (!it.str || !it.transform || !it.str.trim()) continue
      const [a, , , d, x, y] = it.transform
      const h = Math.abs(it.height ?? d ?? 10) || Math.abs(a) || 10
      // pdf y grows upward; flip so rows read top-down, then stack pages.
      items.push({ str: it.str, x, y: offset + (view.height - y), w: it.width ?? it.str.length * h * 0.5, h })
    }
    offset += view.height
    page.cleanup()
  }
  await doc.destroy()
  return { items, pages: doc.numPages }
}

const NUMERIC = /^\(?-?\$?\s*[\d,]+(\.\d+)?\)?%?$|^-$|^—$/

/** Positioned text → rows (by y) → cells (by x gaps) → columns (clustered across the page). */
export function gridFromItems(items: Item[]): string[][] {
  if (!items.length) return []
  // 1 — lines: sort by y, start a new line when the gap exceeds half a line height.
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x)
  const lines: Item[][] = []
  for (const it of sorted) {
    const last = lines[lines.length - 1]
    if (last && Math.abs(it.y - last[0]!.y) <= Math.max(2, last[0]!.h * 0.5)) last.push(it)
    else lines.push([it])
  }
  // 2 — cells: within a line, merge neighbours closer than ~a space; split on wider gaps.
  type Cell = { text: string; x0: number; x1: number }
  const rows: Cell[][] = lines.map((line) => {
    const byX = [...line].sort((a, b) => a.x - b.x)
    const cells: Cell[] = []
    for (const it of byX) {
      const last = cells[cells.length - 1]
      const space = it.h * 0.6
      if (last && it.x - last.x1 <= space) {
        last.text = `${last.text}${it.x - last.x1 > it.h * 0.15 ? ' ' : ''}${it.str}`
        last.x1 = Math.max(last.x1, it.x + it.w)
      } else cells.push({ text: it.str, x0: it.x, x1: it.x + it.w })
    }
    return cells.map((c) => ({ ...c, text: c.text.replace(/\s+/g, ' ').trim() })).filter((c) => c.text)
  })
  // 3 — columns: numbers are right-aligned (their right edge is the anchor);
  // text is left-aligned (its left edge) — except a word sitting on a numeric
  // column's right edge ("Debit" over the debits), which anchors by its right
  // edge too. A band is a run of anchors with no gap wider than ~1.5 characters.
  const cluster = (xs: number[]): Array<{ lo: number; hi: number }> => {
    const out: Array<{ lo: number; hi: number }> = []
    for (const a of [...xs].sort((p, q) => p - q)) {
      const last = out[out.length - 1]
      if (last && a - last.hi <= 14) last.hi = a
      else out.push({ lo: a, hi: a })
    }
    return out
  }
  const near = (x: number, bs: Array<{ lo: number; hi: number }>) =>
    bs.some((b) => x >= b.lo - 14 && x <= b.hi + 14)
  const numericBands = cluster(rows.flatMap((r) => r.filter((c) => NUMERIC.test(c.text)).map((c) => c.x1)))
  const anchorOf = (c: Cell): number => (NUMERIC.test(c.text) || near(c.x1, numericBands) ? c.x1 : c.x0)
  const bands = cluster(rows.flatMap((r) => r.map(anchorOf)))
  const band = (c: Cell): number => {
    const a = anchorOf(c)
    let best = 0
    let dist = Number.POSITIVE_INFINITY
    bands.forEach((b, i) => {
      const d = a < b.lo ? b.lo - a : a > b.hi ? a - b.hi : 0
      if (d < dist) {
        dist = d
        best = i
      }
    })
    return best
  }
  const grid: string[][] = rows.map((r) => {
    const out: string[] = Array<string>(bands.length).fill('')
    for (const c of r) {
      const i = band(c)
      out[i] = out[i] ? `${out[i]} ${c.text}` : c.text
    }
    return out
  })
  // Drop columns no row uses; trim trailing empties.
  const used = grid.reduce<boolean[]>((acc, r) => r.map((v, i) => acc[i] || v !== ''), Array<boolean>(bands.length).fill(false))
  return grid.map((r) => r.filter((_, i) => used[i]))
}

const ACCT_NAME = /^(\d{3,8})\s*(?:[·:\-–]\s*)?(\S.*)$/
const ACCT_HEADER = /^(account|acct|account name|name|account \/ description|gl account)$/i

/**
 * A report prints "100 · Cash" in one column; the trial-balance reader wants
 * the number and the name apart. When most first-column cells look like that,
 * split them (the header becomes Number | Description). A roster or a list of
 * names never matches, so nothing else changes.
 */
export function splitAccountColumn(grid: string[][]): string[][] {
  const body = grid.filter((r) => r[0] && r[0].trim())
  if (body.length < 3) return grid
  const hits = body.filter((r) => ACCT_NAME.test(r[0]!.trim())).length
  if (hits < Math.ceil(body.length * 0.5)) return grid
  return grid.map((r) => {
    const first = (r[0] ?? '').trim()
    const m = first.match(ACCT_NAME)
    if (m) return [m[1]!, m[2]!.trim(), ...r.slice(1)]
    if (ACCT_HEADER.test(first)) return ['Number', 'Description', ...r.slice(1)]
    return [first, '', ...r.slice(1)]
  })
}

/** "$12,500.00" / "(1,200)" → number, else the text (for the xlsx cells). */
function cellValue(text: string): string | number {
  const s = text.trim()
  if (!NUMERIC.test(s) || s === '-' || s === '—') return s
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-')
  const n = Number(s.replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(n) || s.replace(/[^0-9]/g, '') === '') return s
  return neg ? -n : n
}

export interface PdfTable {
  grid: string[][]
  pages: number
  /** No text layer at all — a scan; needs OCR. */
  scanned: boolean
}

export async function pdfToGrid(bytes: Uint8Array): Promise<PdfTable> {
  const { items, pages } = await textItems(bytes)
  return { grid: gridFromItems(items), pages, scanned: items.length === 0 }
}

/** The rebuilt table as an .xlsx (numbers as numbers) so every existing reader takes it. */
export async function pdfToXlsx(bytes: Uint8Array, sheetName = 'Table'): Promise<{ xlsx: Uint8Array; table: PdfTable }> {
  const table = await pdfToGrid(bytes)
  const aoa = splitAccountColumn(table.grid).map((r) => r.map(cellValue))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa.length ? aoa : [[]]), sheetName.slice(0, 31))
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return { xlsx: new Uint8Array(out), table }
}

/** readTable for a PDF: the rebuilt table as one sheet (empty when scanned). */
export async function readPdfTable(bytes: Uint8Array): Promise<TableRead & { scanned: boolean; pages: number }> {
  const table = await pdfToGrid(bytes)
  const sheet = gridToSheet(null, splitAccountColumn(table.grid))
  return { kind: 'csv', sheets: sheet ? [sheet] : [], scanned: table.scanned, pages: table.pages }
}

export const SCANNED_PDF_MESSAGE =
  'This PDF has no text in it — it’s a scan or a photo. We can’t read numbers out of a picture yet; export the report as Excel or CSV, or as a PDF straight from the program that made it.'
