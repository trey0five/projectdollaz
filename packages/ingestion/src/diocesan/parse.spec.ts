import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { gradeKeyFromColumn, parseDiocesanEnrollment } from './parse.js'

/** Build an xlsx Buffer from a 2D array of rows (aoa). */
function xlsxBuffer(aoa: (string | number)[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

describe('gradeKeyFromColumn', () => {
  it("maps '01'→'1', 'K'→'K', PK3/PK4 verbatim, Total→null, unknown→null", () => {
    expect(gradeKeyFromColumn('01')).toBe('1')
    expect(gradeKeyFromColumn('08')).toBe('8')
    expect(gradeKeyFromColumn('K')).toBe('K')
    expect(gradeKeyFromColumn('PK3')).toBe('PK3')
    expect(gradeKeyFromColumn('PK4')).toBe('PK4')
    expect(gradeKeyFromColumn('Total')).toBeNull()
    expect(gradeKeyFromColumn('PK2')).toBeNull()
  })
})

describe('Shape 1 — Admissions dashboard', () => {
  const buf = xlsxBuffer([
    ['School Name', 'New', 'Returning', 'Total'],
    ['St. Rose of Lima', 25, 38, 63],
    ['Holy Name Academy', 40, 260, 300],
  ])

  it('parses per-school byStatus + total with empty byGrade', () => {
    const res = parseDiocesanEnrollment(buf)
    expect(res.sourceShape).toBe('admissions')
    expect(res.rows).toHaveLength(2)
    const rose = res.rows[0]!
    expect(rose.sourceName).toBe('St. Rose of Lima')
    expect(rose.byStatus).toEqual({ new: 25, returning: 38 })
    expect(rose.total).toBe(63)
    expect(rose.byGrade).toEqual({})
    expect(rose.byDemographics).toBeNull()
  })
})

describe('Shape 2 — Enrollment details', () => {
  const buf = xlsxBuffer([
    ['Enrollment Details — as of 10/01/2025'],
    [
      'School Name',
      'PK3',
      'PK4',
      'K',
      '01',
      '08',
      'Total',
      'Female',
      'Male',
      'Hispanic',
      'Non-Hispanic',
      'Asian',
      'Black/African American',
      'Two or more races',
      'White',
      'Native Hawaiian/Pacific Islander',
      'Middle Eastern/North African',
    ],
    ['Annunciation Catholic Academy', 20, 43, 30, 25, 22, 140, 68, 72, 41, 99, 6, 12, 5, 110, 3, 4],
  ])

  it('parses byGrade to canonical keys, full byDemographics, and the as-of date', () => {
    const res = parseDiocesanEnrollment(buf)
    expect(res.sourceShape).toBe('details')
    expect(res.observedOn).toBe('2025-10-01')
    expect(res.rows).toHaveLength(1)
    const row = res.rows[0]!
    expect(row.sourceName).toBe('Annunciation Catholic Academy')
    // '01'→'1', '08'→'8', PK3/PK4/K verbatim; Total skipped from byGrade.
    expect(row.byGrade).toEqual({ PK3: 20, PK4: 43, K: 30, '1': 25, '8': 22 })
    expect(row.total).toBe(140)
    expect(row.byDemographics?.gender).toEqual({ female: 68, male: 72 })
    expect(row.byDemographics?.ethnicity).toEqual({ hispanic: 41, nonHispanic: 99 })
    expect(row.byDemographics?.race).toEqual({
      asian: 6,
      black: 12,
      twoOrMore: 5,
      white: 110,
      nhpi: 3,
      mena: 4,
    })
  })

  it('opts.observedOn overrides the parsed date', () => {
    const res = parseDiocesanEnrollment(buf, { observedOn: '2024-09-15' })
    expect(res.observedOn).toBe('2024-09-15')
  })
})

describe('Shape 2b — Enrollment details, per-school BLOCK layout', () => {
  // Two stacked school blocks; block B carries a BLANK-labeled (unknown) ethnicity
  // row that must NOT corrupt the hispanic / non-hispanic extraction.
  const buf = xlsxBuffer([
    ['Enrollment Details — as of 10/01/2025'],
    // ── Block A ──
    ['Annunciation Catholic Academy', '01', '02', 'K', 'PK3', 'PK4', 'Total'],
    ['Gender', '', '', '', '', '', ''],
    ['Female', 10, 12, 8, 5, 6, 41],
    ['Male', 11, 9, 7, 6, 7, 40],
    ['Ethnicity', '', '', '', '', '', ''],
    ['Hispanic', 5, 6, 4, 3, 3, 21],
    ['Non-Hispanic', 16, 15, 11, 8, 10, 60],
    ['Race', '', '', '', '', '', ''],
    ['Asian', 1, 2, 1, 0, 1, 5],
    ['Black/African American', 2, 3, 1, 1, 1, 8],
    ['Two or more races', 3, 2, 2, 1, 2, 10],
    ['White', 15, 13, 11, 9, 10, 58],
    ['Total', 21, 21, 15, 11, 13, 81],
    // ── Block B (fewer grades; blank-ethnicity row) ──
    ['St Rose of Lima', '01', '02', 'K', 'Total'],
    ['Gender', '', '', '', ''],
    ['Female', 20, 18, 12, 50],
    ['Male', 22, 16, 12, 50],
    ['Ethnicity', '', '', '', ''],
    ['', 2, 1, 0, 3], // blank = unknown ethnicity — must be ignored
    ['Hispanic', 10, 8, 6, 24],
    ['Non-Hispanic', 30, 25, 18, 73],
    ['Race', '', '', '', ''],
    ['Asian', 3, 2, 1, 6],
    ['White', 39, 32, 23, 94],
    ['Total', 42, 34, 24, 100],
  ])

  it('reads each block into one row with byGrade + full byDemographics + total', () => {
    const res = parseDiocesanEnrollment(buf)
    expect(res.sourceShape).toBe('details')
    expect(res.observedOn).toBe('2025-10-01')
    expect(res.rows).toHaveLength(2)

    const a = res.rows[0]!
    expect(a.sourceName).toBe('Annunciation Catholic Academy')
    // byGrade + total come from the block's Total row.
    expect(a.byGrade).toEqual({ '1': 21, '2': 21, K: 15, PK3: 11, PK4: 13 })
    expect(a.total).toBe(81)
    expect(a.byDemographics?.gender).toEqual({ female: 41, male: 40 })
    expect(a.byDemographics?.ethnicity).toEqual({ hispanic: 21, nonHispanic: 60 })
    expect(a.byDemographics?.race).toEqual({ asian: 5, black: 8, twoOrMore: 10, white: 58 })

    const b = res.rows[1]!
    expect(b.sourceName).toBe('St Rose of Lima')
    expect(b.byGrade).toEqual({ '1': 42, '2': 34, K: 24 })
    expect(b.total).toBe(100)
    expect(b.byDemographics?.gender).toEqual({ female: 50, male: 50 })
    // The blank-labeled (unknown) ethnicity row is ignored — only Hispanic/Non-Hispanic.
    expect(b.byDemographics?.ethnicity).toEqual({ hispanic: 24, nonHispanic: 73 })
    expect(b.byDemographics?.race).toEqual({ asian: 6, white: 94 })
  })
})

describe('degrades, never throws', () => {
  it('an unknown grade column (PK2) becomes a per-row warning, not a throw', () => {
    const buf = xlsxBuffer([
      ['School Name', 'PK2', 'PK3', 'Total'],
      ['Sacred Heart', 10, 20, 30],
    ])
    const res = parseDiocesanEnrollment(buf)
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0]!.byGrade).toEqual({ PK3: 20 })
    expect(res.rows[0]!.warnings.some((w) => w.includes('PK2'))).toBe(true)
  })

  it('an empty file returns empty rows + a file-level warning', () => {
    const res = parseDiocesanEnrollment(Buffer.from(''))
    expect(res.rows).toEqual([])
    expect(res.warnings.length).toBeGreaterThan(0)
  })

  it('a total/footer row is skipped', () => {
    const buf = xlsxBuffer([
      ['School Name', 'New', 'Returning', 'Total'],
      ['St Rose', 10, 20, 30],
      ['Total', 10, 20, 30],
    ])
    const res = parseDiocesanEnrollment(buf)
    expect(res.rows.map((r) => r.sourceName)).toEqual(['St Rose'])
  })
})
