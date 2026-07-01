import { describe, expect, it } from 'vitest'
import {
  ACCREDITATION_REVIEW_SOON_DAYS,
  coverageForStandard,
  computeStandardCoverage,
  summarizeCoverage,
} from '../src/accreditation-coverage.js'

// A fixed injected `now` so review banding is deterministic + timezone-independent.
const NOW = new Date('2026-07-01T12:00:00.000Z')

describe('accreditation coverage — binary', () => {
  it('coverageForStandard: 0 → no-evidence, 1/5 → covered', () => {
    expect(coverageForStandard(0)).toBe('no-evidence')
    expect(coverageForStandard(1)).toBe('covered')
    expect(coverageForStandard(5)).toBe('covered')
  })

  it('computeStandardCoverage carries the binary coverage', () => {
    expect(computeStandardCoverage({ evidenceCount: 0 }, NOW).coverage).toBe('no-evidence')
    expect(computeStandardCoverage({ evidenceCount: 3 }, NOW).coverage).toBe('covered')
  })
})

describe('accreditation coverage — summary', () => {
  it('total / withEvidence / gaps / pctCovered on a mixed list', () => {
    const s = summarizeCoverage([
      { evidenceCount: 0 },
      { evidenceCount: 2 },
      { evidenceCount: 0 },
      { evidenceCount: 1 },
    ])
    expect(s).toEqual({ total: 4, withEvidence: 2, gaps: 2, pctCovered: 50 })
  })

  it('empty list → all zeros (pctCovered 0, gaps 0, no divide-by-zero)', () => {
    expect(summarizeCoverage([])).toEqual({ total: 0, withEvidence: 0, gaps: 0, pctCovered: 0 })
  })

  it('all covered → 100%, no gaps; all gaps → 0%', () => {
    expect(summarizeCoverage([{ evidenceCount: 1 }, { evidenceCount: 4 }])).toEqual({
      total: 2,
      withEvidence: 2,
      gaps: 0,
      pctCovered: 100,
    })
    expect(summarizeCoverage([{ evidenceCount: 0 }, { evidenceCount: 0 }])).toEqual({
      total: 2,
      withEvidence: 0,
      gaps: 2,
      pctCovered: 0,
    })
  })
})

describe('accreditation coverage — review urgency bands (injected now)', () => {
  it('null reviewDate → unknown, daysUntilReview null', () => {
    const c = computeStandardCoverage({ evidenceCount: 1, reviewDate: null }, NOW)
    expect(c.reviewStatus).toBe('unknown')
    expect(c.daysUntilReview).toBeNull()
  })

  it('past reviewDate → overdue (negative days)', () => {
    const c = computeStandardCoverage({ evidenceCount: 0, reviewDate: '2026-06-01' }, NOW)
    expect(c.reviewStatus).toBe('overdue')
    expect(c.daysUntilReview).toBe(-30)
  })

  it('exactly today → due-soon, 0 days', () => {
    const c = computeStandardCoverage({ evidenceCount: 0, reviewDate: '2026-07-01' }, NOW)
    expect(c.reviewStatus).toBe('due-soon')
    expect(c.daysUntilReview).toBe(0)
  })

  it('boundary: exactly ACCREDITATION_REVIEW_SOON_DAYS out → due-soon', () => {
    // 2026-07-01 + 180 days = 2026-12-28.
    const c = computeStandardCoverage({ evidenceCount: 0, reviewDate: '2026-12-28' }, NOW)
    expect(c.daysUntilReview).toBe(ACCREDITATION_REVIEW_SOON_DAYS)
    expect(c.reviewStatus).toBe('due-soon')
  })

  it('one day past the window → current', () => {
    const c = computeStandardCoverage({ evidenceCount: 0, reviewDate: '2026-12-29' }, NOW)
    expect(c.daysUntilReview).toBe(181)
    expect(c.reviewStatus).toBe('current')
  })

  it('deterministic: same (input, now) → same result', () => {
    const a = computeStandardCoverage({ evidenceCount: 2, reviewDate: '2026-09-01' }, NOW)
    const b = computeStandardCoverage({ evidenceCount: 2, reviewDate: '2026-09-01' }, NOW)
    expect(a).toEqual(b)
  })

  it('accepts a JS Date (@db.Date) for reviewDate, UTC-read', () => {
    const c = computeStandardCoverage(
      { evidenceCount: 0, reviewDate: new Date('2026-06-01T00:00:00.000Z') },
      NOW,
    )
    expect(c.reviewStatus).toBe('overdue')
    expect(c.daysUntilReview).toBe(-30)
  })
})
