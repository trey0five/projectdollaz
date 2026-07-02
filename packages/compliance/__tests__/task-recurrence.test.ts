import { describe, it, expect } from 'vitest'
import { nextTaskOccurrence, TASK_RECURRENCES } from '../src/task-urgency.js'
import { civilFromDays, daysFromCivil, addMonths, civilToIso } from '../src/review-status.js'

// A fixed injected `now` used when no prevDue is supplied.
const NOW = new Date('2026-07-02T12:00:00.000Z')

describe('nextTaskOccurrence', () => {
  it("returns null for 'none' and any unknown cadence", () => {
    expect(nextTaskOccurrence('2026-01-15', 'none', NOW)).toBeNull()
    expect(nextTaskOccurrence('2026-01-15', 'daily', NOW)).toBeNull()
    expect(nextTaskOccurrence('2026-01-15', '', NOW)).toBeNull()
  })

  it('weekly = +7 days', () => {
    expect(nextTaskOccurrence('2026-01-15', 'weekly', NOW)).toBe('2026-01-22')
    // Crosses a month boundary correctly (day arithmetic, not month math).
    expect(nextTaskOccurrence('2026-01-28', 'weekly', NOW)).toBe('2026-02-04')
  })

  it('monthly = +1 month, month-end-safe (Jan-31 → Feb-28)', () => {
    expect(nextTaskOccurrence('2026-01-15', 'monthly', NOW)).toBe('2026-02-15')
    // 2026 is not a leap year → Feb 28.
    expect(nextTaskOccurrence('2026-01-31', 'monthly', NOW)).toBe('2026-02-28')
  })

  it('monthly month-end-safe on a LEAP year (Jan-31 → Feb-29)', () => {
    expect(nextTaskOccurrence('2028-01-31', 'monthly', NOW)).toBe('2028-02-29')
  })

  it('quarterly = +3 months', () => {
    expect(nextTaskOccurrence('2026-01-15', 'quarterly', NOW)).toBe('2026-04-15')
    // Year rollover.
    expect(nextTaskOccurrence('2026-11-30', 'quarterly', NOW)).toBe('2027-02-28')
  })

  it('annual = +12 months, leap-day clamps to Feb-28 on a non-leap next year', () => {
    expect(nextTaskOccurrence('2026-06-30', 'annual', NOW)).toBe('2027-06-30')
    // Feb-29 2028 (leap) + 12mo → Feb-28 2029 (non-leap).
    expect(nextTaskOccurrence('2028-02-29', 'annual', NOW)).toBe('2029-02-28')
  })

  it('falls back to `now` when prevDue is null', () => {
    // now = 2026-07-02 → +1 month = 2026-08-02.
    expect(nextTaskOccurrence(null, 'monthly', NOW)).toBe('2026-08-02')
    // weekly off now.
    expect(nextTaskOccurrence(null, 'weekly', NOW)).toBe('2026-07-09')
  })

  it('accepts a JS Date prevDue (reads UTC accessors only)', () => {
    expect(nextTaskOccurrence(new Date('2026-03-31T00:00:00.000Z'), 'monthly', NOW)).toBe('2026-04-30')
  })

  it('the next occurrence is always strictly AFTER the base (monotonic advance)', () => {
    for (const rec of TASK_RECURRENCES) {
      if (rec === 'none') continue
      const iso = nextTaskOccurrence('2026-02-28', rec, NOW)
      expect(iso).not.toBeNull()
      expect(iso! > '2026-02-28').toBe(true)
    }
  })
})

describe('civilFromDays is the exact inverse of daysFromCivil', () => {
  it('round-trips a range of dates + reproduces addMonths', () => {
    for (const iso of ['1970-01-01', '2000-02-29', '2026-07-02', '1999-12-31', '2100-03-01']) {
      const [y, m, d] = iso.split('-').map(Number)
      const days = daysFromCivil(y, m, d)
      expect(civilToIso(civilFromDays(days))).toBe(iso)
    }
    // addMonths still behaves after export.
    expect(civilToIso(addMonths({ y: 2026, m: 1, d: 31 }, 1))).toBe('2026-02-28')
  })
})
