import { describe, it, expect } from 'vitest'
import { parseGradebookCsv, parseMark } from './gradebook-file.parser.js'

const enc = (s: string): Buffer => Buffer.from(s, 'utf-8')

describe('gradebook parser', () => {
  it('reads the LONG shape (a row per student per course)', () => {
    const csv = [
      'Student ID,Last Name,First Name,Course,Term,Grade',
      '1001,Nguyen,Amy,Algebra I,S1,92',
      '1001,Nguyen,Amy,English 9,S1,88',
    ].join('\n')
    const out = parseGradebookCsv(enc(csv), { schoolYear: 2026 })
    expect(out.shape).toBe('long')
    expect(out.rows).toHaveLength(2)
    expect(out.courses).toEqual(['Algebra I', 'English 9'])
    expect(out.rows[0].numericGrade).toBe(92)
    expect(out.rows[0].term).toBe('S1')
  })

  it('reads the WIDE shape (a column per course) and fans it out', () => {
    const csv = ['Student,Grade Level,Math,English,Science', '"Nguyen, Amy",9,92,88,95'].join('\n')
    const out = parseGradebookCsv(enc(csv), { schoolYear: 2026, term: 'S1' })
    expect(out.shape).toBe('wide')
    expect(out.rows).toHaveLength(3)
    expect(out.rows.map((r) => r.courseName)).toEqual(['Math', 'English', 'Science'])
    expect(out.rows[0].lastName).toBe('Nguyen')
    expect(out.rows[0].gradeLevel).toBe('9')
  })

  it('keeps the letter AND converts it, because a term average is arithmetic', () => {
    expect(parseMark('B+')).toEqual({ numeric: 88, letter: 'B+' })
    expect(parseMark('92')).toEqual({ numeric: 92, letter: null })
    expect(parseMark('87%')).toEqual({ numeric: 87, letter: null })
    expect(parseMark('')).toEqual({ numeric: null, letter: null })
    expect(parseMark('n/a')).toEqual({ numeric: null, letter: null })
  })

  it('skips a row with no student identifier rather than inventing one', () => {
    const csv = ['Student ID,Last Name,Course,Grade', ',,Algebra I,90', '1002,Walsh,Algebra I,85'].join('\n')
    const out = parseGradebookCsv(enc(csv))
    expect(out.rows).toHaveLength(1)
    expect(out.skipped).toBe(1)
    expect(out.warnings.some((w) => w.includes('no student identifier'))).toBe(true)
  })

  it('handles a title row above the header', () => {
    const csv = ['Spring 2026 Report Cards', '', 'Student ID,Last Name,Course,Term,Grade', '1,Ada,Math,Q1,A'].join('\n')
    const out = parseGradebookCsv(enc(csv))
    expect(out.rows[0].letterGrade).toBe('A')
    expect(out.rows[0].numericGrade).toBe(95)
  })

  it('throws only when there is nothing usable', () => {
    expect(() => parseGradebookCsv(enc('a,b\n1,2'))).toThrow()
  })
})
