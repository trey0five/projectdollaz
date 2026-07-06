// Unit tests for the pure live-adapter normalizer. Since the SIS REST providers
// (Blackbaud/OneRoster-API/FACTS/Veracross) are customer-gated with no open sandbox,
// this synthetic fixture — a Blackbaud-shaped roster reduced to RawStudentRow[] — is
// how the connector's grade-mapping + headcount logic is verified without a live call.
import { describe, expect, it } from 'vitest'
import {
  buildNormalizedSnapshot,
  gradeKeyFromLabel,
  normalizeManualSnapshot,
  type RawStudentRow,
} from './enrollment.normalize.js'

describe('gradeKeyFromLabel', () => {
  it('maps OneRoster codes, free-text labels, and PreK tiers', () => {
    expect(gradeKeyFromLabel('KG')).toBe('K')
    expect(gradeKeyFromLabel('Kindergarten')).toBe('K')
    expect(gradeKeyFromLabel('09')).toBe('9')
    expect(gradeKeyFromLabel('Grade 9')).toBe('9')
    expect(gradeKeyFromLabel('10th Grade')).toBe('10')
    expect(gradeKeyFromLabel('1st')).toBe('1')
    expect(gradeKeyFromLabel('PK')).toBe('PK4')
    expect(gradeKeyFromLabel('Pre-K 3')).toBe('PK3')
    expect(gradeKeyFromLabel('PK4')).toBe('PK4')
    expect(gradeKeyFromLabel('Transitional Kindergarten')).toBe('PK4')
  })

  it('returns null for unknown / empty labels', () => {
    expect(gradeKeyFromLabel('')).toBeNull()
    expect(gradeKeyFromLabel(null)).toBeNull()
    expect(gradeKeyFromLabel('Graduated')).toBeNull()
    expect(gradeKeyFromLabel('13')).toBeNull()
  })
})

// A Blackbaud-shaped roster (already reduced to the adapter seam) covering active
// students across grades, one withdrawn/inactive, and one unmappable grade.
const ROSTER: RawStudentRow[] = [
  { grade: 'Kindergarten', status: 'Active' },
  { grade: 'Grade 1', status: 'Active' },
  { grade: 'Grade 9', status: 'Active' },
  { grade: 'Grade 9', status: 'Active' },
  { grade: 'Pre-K 4', status: 'Active' },
  { grade: 'Grade 5', status: 'Inactive' }, // withdrawn → byStatus, not headcount
  { grade: 'Graduated', status: 'Active' }, // unmappable → warning
]

describe('buildNormalizedSnapshot', () => {
  it('counts the active headcount and splits the withdrawn student', () => {
    const snap = buildNormalizedSnapshot('blackbaud', ROSTER, { observedOn: '2026-09-15' })
    expect(snap.provider).toBe('blackbaud')
    expect(snap.observedOn).toBe('2026-09-15')
    expect(snap.byGrade).toEqual({ K: 1, '1': 1, '9': 2, PK4: 1 })
    expect(snap.totalEnrolled).toBe(5)
    expect(snap.byStatus).toEqual({ enrolled: 5, withdrawn: 1 })
  })

  it('warns on an unmappable grade but still imports the rest', () => {
    const snap = buildNormalizedSnapshot('blackbaud', ROSTER, { observedOn: '2026-09-15' })
    expect(snap.warnings?.some((w) => w.includes('Graduated'))).toBe(true)
    // The unmappable row must not inflate the headcount.
    expect(snap.totalEnrolled).toBe(5)
  })

  it('averages FTE only across rows that report it', () => {
    const rows: RawStudentRow[] = [
      { grade: 'Grade 1', status: 'Active', fte: 1 },
      { grade: 'Grade 1', status: 'Active', fte: 0.5 },
      { grade: 'Grade 1', status: 'Active' },
    ]
    const snap = buildNormalizedSnapshot('facts', rows, { observedOn: '2026-09-15' })
    expect(snap.fte).toBe(1.5)
    expect(snap.totalEnrolled).toBe(3)
  })
})

describe('normalizeManualSnapshot', () => {
  it('sums valid grade counts and drops unknown keys with a warning', () => {
    const snap = normalizeManualSnapshot({ K: 10, '1': 12, XX: 5 }, '2026-09-01')
    expect(snap.provider).toBe('manual')
    expect(snap.byGrade).toEqual({ K: 10, '1': 12 })
    expect(snap.totalEnrolled).toBe(22)
    expect(snap.warnings?.some((w) => w.includes('XX'))).toBe(true)
  })
})
