// S3 — "Change columns" must never pick up ANOTHER year's file.
//
// Keyed by school + name + row count, last year's and this year's
// "Trial Balance.xlsx" (same number of accounts) collided: FY26's "Change
// columns" previewed the FY25 bytes and autosave replaced FY26 with FY25.
import { describe, it, expect, beforeEach } from 'vitest'
import { rememberBytes, recallBytes, withSessionBytes, rowsFingerprint, clearSessionBytes } from './sessionBytes.js'

const fy26 = [
  { acct: 1010, total: 508_400 },
  { acct: 4010, total: -4_562_000 },
]
const fy25 = [
  { acct: 1010, total: 412_000 },
  { acct: 4010, total: -4_300_000 },
]
const b26 = new ArrayBuffer(26)
const b25 = new ArrayBuffer(25)

beforeEach(() => clearSessionBytes())

describe('session bytes are tied to what was read from them', () => {
  it('two years’ "Trial Balance.xlsx" with the same row count never collide', () => {
    rememberBytes('s1', 'Trial Balance.xlsx', fy26, b26)
    rememberBytes('s1', 'Trial Balance.xlsx', fy25, b25)
    expect(recallBytes('s1', 'Trial Balance.xlsx', fy26)).toBe(b26)
    expect(recallBytes('s1', 'Trial Balance.xlsx', fy25)).toBe(b25)
  })

  it('a file whose rows don’t match gets nothing (verified on recall)', () => {
    rememberBytes('s1', 'Trial Balance.xlsx', fy25, b25)
    expect(recallBytes('s1', 'Trial Balance.xlsx', fy26)).toBeNull()
    const [f] = withSessionBytes('s1', [{ id: 'x', fileName: 'Trial Balance.xlsx', persisted: true, rows: fy26 }])
    expect(f.bytes).toBeUndefined()
  })

  it('the hydrated entry with the SAME rows gets its own bytes back', () => {
    rememberBytes('s1', 'Trial Balance.xlsx', fy26, b26)
    const [f] = withSessionBytes('s1', [{ id: 'x', fileName: 'Trial Balance.xlsx', persisted: true, rows: fy26.map((r) => ({ ...r })) }])
    expect(f.bytes).toBe(b26)
  })

  it('the fingerprint sees amounts, not just the count', () => {
    expect(rowsFingerprint(fy26)).not.toBe(rowsFingerprint(fy25))
    expect(rowsFingerprint(fy26)).toBe(rowsFingerprint(fy26.map((r) => ({ ...r }))))
  })
})
