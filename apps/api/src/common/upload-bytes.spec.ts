// #52 — a PDF upload becomes the table it printed before any parser sees it.
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { BadRequestException } from '@nestjs/common'
import { tableBytes } from './upload-bytes.js'

/** A one-page text PDF (Helvetica at coordinates) — the same builder as the ingestion test. */
function pdf(entries: Array<[number, number, string]>): Buffer {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  const ops = entries.map(([x, y, t]) => `BT /F1 10 Tf ${x} ${792 - y} Td (${esc(t)}) Tj ET`).join('\n')
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
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

describe('tableBytes', () => {
  it('passes a spreadsheet through untouched', async () => {
    const f = { buffer: Buffer.from('a,b\n1,2'), originalname: 'x.csv', size: 7 }
    expect(await tableBytes(f)).toBe(f)
    expect(await tableBytes(undefined)).toBeUndefined()
  })

  it('turns a text-layer PDF into an .xlsx of its table, renamed', async () => {
    const roster = pdf([[72, 60, 'Student Name'], [250, 60, 'Gr'], [72, 76, 'Smith, Ann'], [250, 76, '9'], [72, 90, 'Diaz, Bo'], [250, 90, 'K']])
    const out = (await tableBytes({ buffer: roster, originalname: 'roster.pdf', size: roster.length }))!
    expect(out.originalname).toBe('roster.xlsx')
    const wb = XLSX.read(out.buffer, { type: 'buffer' })
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]!]!, { header: 1 })
    expect(rows).toEqual([['Student Name', 'Gr'], ['Smith, Ann', 9], ['Diaz, Bo', 'K']])
  })

  it('refuses a scanned PDF in plain words', async () => {
    await expect(tableBytes({ buffer: pdf([]), originalname: 'scan.pdf', size: 1 })).rejects.toThrow(BadRequestException)
    await expect(tableBytes({ buffer: pdf([]), originalname: 'scan.pdf', size: 1 })).rejects.toThrow(/no text in it/)
  })
})
