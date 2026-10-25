// A gradebook export saved as Excel reads exactly like the CSV it used to
// require: the service reads the workbook (title rows, the sheet with the most
// rows) into the grid the gradebook parser already understands.
import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { BadRequestException } from '@nestjs/common'
import { GradebookService } from './gradebook.service.js'

const prisma = { student: { findMany: async () => [] } }
const svc = () => new GradebookService(prisma as never)

function xlsx(sheets: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer)
}

const LONG = [
  ['First', 'Last', 'Grade Level', 'Course', 'Term', 'Letter Grade'],
  ['Ava', 'Reyes', 9, 'Algebra I', 'Q1', 'B+'],
  ['Ava', 'Reyes', 9, 'English 9', 'Q1', 'A'],
  ['Noah', 'Kim', 9, 'Algebra I', 'Q1', 88],
]
const csv = (rows: unknown[][]) => Buffer.from(rows.map((r) => r.join(',')).join('\n'))

describe('GradebookService.preview — an Excel gradebook', () => {
  it('reads an .xlsx (title row, a notes sheet) the same as the CSV', async () => {
    const fromXlsx = await svc().preview('s1', {
      buffer: xlsx({ Notes: [['exported from SIS']], Marks: [['Fall marks — Grade 9'], [], ...LONG] }),
      originalname: 'marks.xlsx',
    })
    const fromCsv = await svc().preview('s1', { buffer: csv(LONG), originalname: 'marks.csv' })
    expect(fromXlsx.shape).toBe('long')
    expect(fromXlsx.rows).toBe(3)
    expect(fromXlsx.courses).toEqual(fromCsv.courses)
    expect(fromXlsx.terms).toEqual(['Q1'])
    expect(fromXlsx.sample).toEqual(fromCsv.sample)
  })

  it('reads a wide workbook (a column per course)', async () => {
    const p = await svc().preview('s1', {
      buffer: xlsx({ Sheet1: [['Student ID', 'First', 'Last', 'Algebra I', 'English 9'], ['1001', 'Ava', 'Reyes', 91, 'A-']] }),
      originalname: 'wide.xlsx',
    })
    expect(p.shape).toBe('wide')
    expect(p.courses.sort()).toEqual(['Algebra I', 'English 9'])
  })

  it('refuses a workbook with no data in plain words', async () => {
    await expect(svc().preview('s1', { buffer: xlsx({ Empty: [[]] }), originalname: 'blank.xlsx' })).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })
})
