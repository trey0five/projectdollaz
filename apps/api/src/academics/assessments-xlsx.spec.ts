// #49 — an Excel results file reads like the CSV it used to require: the service
// turns .xlsx into the grid the parser already understands (every sheet; the
// one with the most rows), and the preview says how each column was read and
// what the file didn't say (year / grade) so the uploader can ask.
import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { BadRequestException } from '@nestjs/common'
import { AssessmentsService } from './assessments.service.js'

const svc = () => new AssessmentsService({} as never)

function xlsx(sheets: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer)
}

const SUMMARY = [
  ['Diocese of Example — ACT Results'],
  [],
  ['School', 'Grade', 'Students Tested', 'Composite', 'English', 'Math', 'Reading', 'Science'],
  ['St. Aurelia Academy', 11, 42, 24.1, 23.5, 24.0, 25.2, 23.8],
  ['Holy Family', 11, 30, 22.4, 21.9, 22.6, 23.1, 22.0],
]

describe('AssessmentsService.preview — an .xlsx results file', () => {
  it('reads a workbook (title row, two sheets), reports the columns, and asks for the missing year', async () => {
    const p = await svc().preview('s1', { buffer: xlsx({ Notes: [['exported']], Results: SUMMARY }), originalname: 'ACT results.xlsx' })
    expect(p.scope).toBe('school_aggregate')
    expect(p.testType).toBe('act')
    expect(p.rows).toBe(2)
    expect(p.years).toEqual([])
    expect(p.needsYear).toBe(true)
    expect(p.needsGrade).toBe(false)
    expect(p.columns).toEqual([
      { header: 'School', role: 'School' },
      { header: 'Grade', role: 'Grade' },
      { header: 'Students Tested', role: 'Students tested' },
      { header: 'Composite', role: 'Composite / total' },
      { header: 'English', role: 'Subject: english' },
      { header: 'Math', role: 'Subject: math' },
      { header: 'Reading', role: 'Subject: reading' },
      { header: 'Science', role: 'Subject: science' },
    ])
  })

  it('a chosen year clears the ask', async () => {
    const p = await svc().preview('s1', { buffer: xlsx({ Results: SUMMARY }), originalname: 'ACT results.xlsx' }, { schoolYear: 2026 })
    expect(p.years).toEqual([2026])
    expect(p.needsYear).toBe(false)
  })

  it('a CSV with a quoted comma in a header still reads (quote-aware)', async () => {
    const csv = Buffer.from('School,Grade,"Composite, ACT",English\nSt. A,11,24,23\n', 'utf8')
    const p = await svc().preview('s1', { buffer: csv, originalname: 'ACT 2026.csv' })
    expect(p.rows).toBe(1)
    expect(p.columns?.map((c) => c.header)).toEqual(['School', 'Grade', 'Composite, ACT', 'English']) // the quoted header stayed whole
    expect(p.needsYear).toBe(true)
  })

  it('an empty workbook is refused in plain words', async () => {
    await expect(svc().preview('s1', { buffer: xlsx({ Empty: [[]] }), originalname: 'x.xlsx' })).rejects.toThrow(BadRequestException)
  })
})
