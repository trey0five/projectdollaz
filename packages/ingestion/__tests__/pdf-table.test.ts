// #52 — a text-layer PDF becomes the table it printed. The fixture is a PDF
// built by hand below (Helvetica text at coordinates, like a QuickBooks "save
// as PDF"), so the test owns every byte it reads.
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { gridFromItems, isPdf, pdfToGrid, pdfToXlsx, readPdfTable } from '../src/pdf/index.js'
import { ingest } from '../src/index.js'

/** A one-page PDF: each entry is [x, y-from-top, text]; right-aligned numbers are placed by their right edge. */
function pdf(entries: Array<[number, number, string, 'l' | 'r']>, pageW = 612, pageH = 792): Buffer {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  // Helvetica average glyph ≈ 0.5em at 10pt → 5pt per char, for right alignment.
  const ops = entries
    .map(([x, y, text, align]) => {
      const x0 = align === 'r' ? x - text.length * 5 : x
      return `BT /F1 10 Tf ${x0.toFixed(1)} ${(pageH - y).toFixed(1)} Td (${esc(text)}) Tj ET`
    })
    .join('\n')
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(ops)} >>\nstream\n${ops}\nendstream`,
  ]
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out))
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = Buffer.byteLength(out)
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

const TB = pdf([
  [72, 60, 'Sample School', 'l'],
  [72, 74, 'Trial Balance', 'l'],
  [72, 88, 'As of June 30, 2026', 'l'],
  [72, 120, 'Account', 'l'],
  [380, 120, 'Debit', 'r'],
  [480, 120, 'Credit', 'r'],
  [72, 136, '100 Cash', 'l'],
  [380, 136, '500,000.00', 'r'],
  [72, 150, '120 Receivable', 'l'],
  [380, 150, '30,000.00', 'r'],
  [72, 164, '200 Payable', 'l'],
  [480, 164, '20,000.00', 'r'],
  [72, 178, '300 Net assets', 'l'],
  [480, 178, '374,000.00', 'r'],
  [72, 192, '401 Tuition', 'l'],
  [480, 192, '500,000.00', 'r'],
  [72, 206, '402 Fees', 'l'],
  [480, 206, '20,000.00', 'r'],
  [72, 220, '501 Salaries', 'l'],
  [380, 220, '300,000.00', 'r'],
  [72, 234, '502 Benefits', 'l'],
  [380, 234, '60,000.00', 'r'],
  [72, 248, '503 Supplies', 'l'],
  [380, 248, '24,000.00', 'r'],
  [72, 266, 'TOTAL', 'l'],
  [380, 266, '914,000.00', 'r'],
  [480, 266, '914,000.00', 'r'],
])

describe('pdfToGrid', () => {
  it('recognises a PDF', () => {
    expect(isPdf(new Uint8Array(TB))).toBe(true)
    expect(isPdf(Buffer.from('a,b\n1,2'))).toBe(false)
  })

  it('rebuilds rows and right-aligned columns from positioned text', async () => {
    const { grid, pages, scanned } = await pdfToGrid(new Uint8Array(TB))
    expect(pages).toBe(1)
    expect(scanned).toBe(false)
    const header = grid.find((r) => r[0] === 'Account')!
    expect(header).toEqual(['Account', 'Debit', 'Credit'])
    expect(grid.find((r) => r[0] === '100 Cash')).toEqual(['100 Cash', '500,000.00', ''])
    expect(grid.find((r) => r[0] === '200 Payable')).toEqual(['200 Payable', '', '20,000.00'])
    expect(grid.find((r) => r[0] === 'TOTAL')).toEqual(['TOTAL', '914,000.00', '914,000.00'])
    expect(grid[0]).toEqual(['Sample School', '', '']) // a grid is rectangular
  })

  it('…and the existing trial-balance reader takes the xlsx it becomes', async () => {
    const { xlsx } = await pdfToXlsx(new Uint8Array(TB))
    const r = ingest('Trial Balance 6-30-26.pdf.xlsx', xlsx.buffer.slice(xlsx.byteOffset, xlsx.byteOffset + xlsx.byteLength) as ArrayBuffer)
    expect(r.rows.length).toBe(9)
    expect(r.rows.find((x) => x.acct === 100)?.total).toBe(500000)
    expect(r.rows.find((x) => x.acct === 401)?.total).toBe(-500000)
    expect(r.metadata?.periodEndDate).toBe('2026-06-30')
    const wb = XLSX.read(xlsx, { type: 'array' })
    expect(wb.SheetNames).toEqual(['Table'])
  })

  it('a generic list (roster) reads through readPdfTable', async () => {
    const roster = pdf([
      [72, 60, 'Student Name', 'l'],
      [250, 60, 'Gr', 'l'],
      [320, 60, 'Student ID', 'l'],
      [72, 76, 'Smith, Ann', 'l'],
      [250, 76, '9', 'l'],
      [320, 76, 'S-1', 'l'],
      [72, 90, 'Diaz, Bo', 'l'],
      [250, 90, 'K', 'l'],
      [320, 90, 'S-2', 'l'],
    ])
    const t = await readPdfTable(new Uint8Array(roster))
    expect(t.scanned).toBe(false)
    expect(t.sheets[0]!.header).toEqual(['Student Name', 'Gr', 'Student ID'])
    expect(t.sheets[0]!.rows).toEqual([['Smith, Ann', '9', 'S-1'], ['Diaz, Bo', 'K', 'S-2']])
  })

  it('a PDF with no text layer is reported as scanned', async () => {
    const blank = pdf([])
    const t = await readPdfTable(new Uint8Array(blank))
    expect(t.scanned).toBe(true)
    expect(t.sheets).toEqual([])
  })

  it('gridFromItems keeps a wrapped description together and splits on wide gaps', () => {
    const grid = gridFromItems([
      { str: 'Accounts', x: 72, y: 100, w: 40, h: 10 },
      { str: 'Receivable', x: 115, y: 100, w: 50, h: 10 },
      { str: '1,000.00', x: 340, y: 100, w: 40, h: 10 },
    ])
    expect(grid).toEqual([['Accounts Receivable', '1,000.00']])
  })
})
