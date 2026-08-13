import { describe, it, expect } from 'vitest'
import { looksLikeObjectiveFile, parseObjectiveCsv } from './assessment-file.parser.js'

const enc = (s: string): Buffer => Buffer.from(s, 'utf-8')
const grid = (csv: string) => csv.split('\n').map((r) => r.split(','))

describe('objective summary parser', () => {
  it('detects an objective file by its objective + index columns', () => {
    expect(looksLikeObjectiveFile(grid('School,Grade,Subject,Objective,OPI\nA,5,Math,Measurement,41'))).toBe(true)
    // A score summary has no objective column and must NOT be mistaken for one.
    expect(looksLikeObjectiveFile(grid('School,Grade,Total Battery,Reading\nA,5,72,74'))).toBe(false)
  })

  it('parses OPI rows with subject, grade and code', () => {
    const csv = [
      'Diocese of Sample — TerraNova Objective Summary',
      '',
      'School,Year,Grade,Subject,Objective Code,Objective,OPI,Tested',
      'All Souls,2026,5,Math,05,Measurement,41,28',
      'All Souls,2026,5,Math,06,Number Sense,88,28',
      'All Souls,2026,5,Reading,01,Basic Understanding,73,28',
    ].join('\n')
    const out = parseObjectiveCsv(enc(csv))
    expect(out.rows).toHaveLength(3)
    expect(out.rows[0].objectiveLabel).toBe('Measurement')
    expect(out.rows[0].objectiveCode).toBe('05')
    expect(out.rows[0].opi).toBe(41)
    expect(out.rows[0].subject).toBe('math')
    expect(out.rows[0].gradeLevel).toBe('5')
    expect(out.subjects.sort()).toEqual(['math', 'reading'])
    expect(out.years).toEqual([2026])
  })

  it('derives the index from mastery counts when no OPI column exists', () => {
    const csv = [
      'School,Grade,Subject,Objective,Mastery,Partial,Non-Mastery',
      'All Souls,5,Math,Measurement,10,10,20',
    ].join('\n')
    const out = parseObjectiveCsv(enc(csv), { defaultYear: 2026 })
    // 10 of 40 mastered → 25.
    expect(out.rows[0].opi).toBe(25)
    expect(out.rows[0].masteryCounts).toEqual({ mastery: 10, partial: 10, nonMastery: 20 })
  })

  it('skips rows with no objective or no index rather than inventing them', () => {
    const csv = ['School,Grade,Objective,OPI', 'A,5,,41', 'A,5,Measurement,', 'A,5,Number Sense,88'].join('\n')
    const out = parseObjectiveCsv(enc(csv), { defaultYear: 2026 })
    expect(out.rows).toHaveLength(1)
    expect(out.skipped).toBe(2)
  })

  it('throws when the file has no objective column at all', () => {
    expect(() => parseObjectiveCsv(enc('School,Grade,OPI\nA,5,41'))).toThrow()
  })
})
