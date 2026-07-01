import { describe, it, expect } from 'vitest'
import {
  computeReviewStatus,
  DUE_SOON_DAYS,
  BADLY_OVERDUE_DAYS,
  type PolicyReviewInput,
} from '../src/review-status.js'

// A fixed injected `now` so every assertion is deterministic.
const NOW = new Date('2026-06-30T12:00:00.000Z')

function input(over: Partial<PolicyReviewInput>): PolicyReviewInput {
  return {
    adoptedDate: null,
    lastReviewedDate: null,
    reviewIntervalMonths: 12,
    status: 'active',
    ...over,
  }
}

describe('computeReviewStatus', () => {
  it('current: next review well beyond the due-soon window', () => {
    // last reviewed 1 month ago, 12-month cadence → ~11 months out.
    const r = computeReviewStatus(
      input({ lastReviewedDate: '2026-05-30', reviewIntervalMonths: 12 }),
      NOW,
    )
    expect(r.status).toBe('current')
    expect(r.nextReviewDate).toBe('2027-05-30')
    expect(r.daysUntilDue).not.toBeNull()
    expect(r.daysUntilDue!).toBeGreaterThan(DUE_SOON_DAYS)
  })

  it('due-soon: next review exactly at the 60-day boundary', () => {
    // now = 2026-06-30; +60d = 2026-08-29. adopted 2025-08-29 + 12mo lands there.
    const r = computeReviewStatus(
      input({ adoptedDate: '2025-08-29', reviewIntervalMonths: 12 }),
      NOW,
    )
    expect(r.nextReviewDate).toBe('2026-08-29')
    expect(r.daysUntilDue).toBe(60)
    expect(r.status).toBe('due-soon')
  })

  it('due-soon: 1 day before due', () => {
    const r = computeReviewStatus(
      input({ adoptedDate: '2025-07-01', reviewIntervalMonths: 12 }),
      NOW,
    )
    expect(r.nextReviewDate).toBe('2026-07-01')
    expect(r.daysUntilDue).toBe(1)
    expect(r.status).toBe('due-soon')
  })

  it('current: 61 days out (just past the window)', () => {
    const r = computeReviewStatus(
      input({ adoptedDate: '2025-08-30', reviewIntervalMonths: 12 }),
      NOW,
    )
    expect(r.nextReviewDate).toBe('2026-08-30')
    expect(r.daysUntilDue).toBe(61)
    expect(r.status).toBe('current')
  })

  it('overdue: 1 day past due → negative daysUntilDue', () => {
    const r = computeReviewStatus(
      input({ adoptedDate: '2025-06-29', reviewIntervalMonths: 12 }),
      NOW,
    )
    expect(r.nextReviewDate).toBe('2026-06-29')
    expect(r.daysUntilDue).toBe(-1)
    expect(r.status).toBe('overdue')
  })

  it('badly overdue: at the -90-day cutoff', () => {
    // now - 90d = 2026-04-01. Anchor + interval lands there.
    const r = computeReviewStatus(
      input({ adoptedDate: '2025-04-01', reviewIntervalMonths: 12 }),
      NOW,
    )
    expect(r.nextReviewDate).toBe('2026-04-01')
    expect(r.daysUntilDue).toBe(-90)
    expect(r.status).toBe('overdue')
    expect(r.daysUntilDue!).toBeLessThanOrEqual(-BADLY_OVERDUE_DAYS)
  })

  it('unknown: both dates null → no fabricated date', () => {
    const r = computeReviewStatus(
      input({ adoptedDate: null, lastReviewedDate: null }),
      NOW,
    )
    expect(r).toEqual({ status: 'unknown', nextReviewDate: null, daysUntilDue: null })
  })

  it('unknown: non-positive review interval', () => {
    expect(
      computeReviewStatus(input({ adoptedDate: '2025-01-01', reviewIntervalMonths: 0 }), NOW).status,
    ).toBe('unknown')
    expect(
      computeReviewStatus(input({ adoptedDate: '2025-01-01', reviewIntervalMonths: -6 }), NOW).status,
    ).toBe('unknown')
  })

  it('unknown: non-active lifecycle (draft/retired) has no review clock', () => {
    const base = { adoptedDate: '2020-01-01', reviewIntervalMonths: 12 }
    expect(computeReviewStatus(input({ ...base, status: 'draft' }), NOW).status).toBe('unknown')
    expect(computeReviewStatus(input({ ...base, status: 'retired' }), NOW).status).toBe('unknown')
    // Same policy as active WOULD be overdue — proving the gate, not the dates.
    expect(computeReviewStatus(input({ ...base, status: 'active' }), NOW).status).toBe('overdue')
  })

  it('lastReviewedDate takes precedence over adoptedDate', () => {
    const r = computeReviewStatus(
      input({
        adoptedDate: '2010-01-01', // would be wildly overdue
        lastReviewedDate: '2026-05-30', // recent → current
        reviewIntervalMonths: 12,
      }),
      NOW,
    )
    expect(r.nextReviewDate).toBe('2027-05-30')
    expect(r.status).toBe('current')
  })

  it('month-overflow clamp: Jan-31 + 1 month → Feb-28', () => {
    const r = computeReviewStatus(
      input({ lastReviewedDate: '2025-01-31', reviewIntervalMonths: 1 }),
      NOW,
    )
    expect(r.nextReviewDate).toBe('2025-02-28')
  })

  it('accepts a JS Date anchor (Prisma @db.Date shape) identically to a string', () => {
    const asDate = computeReviewStatus(
      input({ adoptedDate: new Date('2025-07-01T00:00:00.000Z'), reviewIntervalMonths: 12 }),
      NOW,
    )
    const asString = computeReviewStatus(
      input({ adoptedDate: '2025-07-01', reviewIntervalMonths: 12 }),
      NOW,
    )
    expect(asDate).toEqual(asString)
  })

  it('tz determinism: same yyyy-mm-dd inputs give the same result at 00:01Z vs 23:59Z', () => {
    const early = new Date('2026-06-30T00:01:00.000Z')
    const late = new Date('2026-06-30T23:59:00.000Z')
    const p = input({ adoptedDate: '2025-06-29', reviewIntervalMonths: 12 })
    const a = computeReviewStatus(p, early)
    const b = computeReviewStatus(p, late)
    expect(a).toEqual(b)
    expect(a.daysUntilDue).toBe(-1)
  })
})
