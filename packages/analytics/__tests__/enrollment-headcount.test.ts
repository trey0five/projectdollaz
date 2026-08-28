// ─────────────────────────────────────────────────────────────
// enrollment_headcount — the plain total headcount as a registry metric, so the
// enrollment tile, the org leaderboard, the briefing and Penny all print ONE
// number from ONE definition. Registry wiring, the deliberate ABSENCE of a band,
// the availability guard (0 is a fact, missing is not), 'count' formatting, and
// the extensive org roll-up.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import type { PeriodOperational } from '../src/types.js'
import { computeMetricsRecord } from '../src/compute.js'
import { computeOrgMetrics, type SchoolPeriodInputs } from '../src/org-compute.js'
import { fromBundle } from '../src/adapt.js'
import { METRIC_KEYS, METRIC_META } from '../src/registry.js'
import { DEFAULT_BANDS } from '../src/health.js'
import { formatMetricValue, formatMetricDelta, formatMetricValueLong } from '../src/format.js'
import { FULL_BUNDLE } from './fixtures.js'

function op(enrollment: number | null): PeriodOperational {
  return {
    enrollment,
    enrollmentFte: null,
    studentsOnAid: null,
    financialAidTotal: null,
    teachingFte: null,
    totalStaffFte: null,
  }
}

function headcount(enrollment: number | null, prior?: number | null) {
  return computeMetricsRecord({
    current: FULL_BUNDLE,
    prior: prior === undefined ? undefined : FULL_BUNDLE,
    currentOperational: op(enrollment),
    priorOperational: prior === undefined ? undefined : op(prior),
  }).enrollment_headcount
}

describe('enrollment_headcount — registry wiring', () => {
  it('is registered LAST and declares enrollment domain / count / sum', () => {
    expect(METRIC_KEYS).toContain('enrollment_headcount')
    // Appended LAST so every prior key's order — and every saved dashboard
    // layout keyed off that order — stays byte-identical.
    expect(METRIC_KEYS[METRIC_KEYS.length - 1]).toBe('enrollment_headcount')
    const m = METRIC_META.find((x) => x.key === 'enrollment_headcount')!
    expect(m.domain).toBe('enrollment')
    expect(m.unit).toBe('count')
    expect(m.category).toBe('operational')
    expect(m.goodDirection).toBe('higher')
    expect(m.scopeAggregation).toBe('sum')
    expect(m.boardLabel).toBe('Enrollment')
  })

  it('is NEUTRAL by absence — a school of 120 is not worse than a school of 1,200', () => {
    expect(DEFAULT_BANDS.enrollment_headcount).toBeUndefined()
    const r = headcount(436)
    expect(r.status).toBe('neutral')
    expect(r.bands).toBeUndefined()
  })

  it('names its one operational input, so the lineage breadcrumb resolves', () => {
    const r = headcount(436)
    expect(r.inputs).toEqual([
      { key: 'enrollment', label: 'Enrollment', value: 436, unit: 'count', source: 'operational' },
    ])
  })
})

describe('enrollment_headcount — value + availability', () => {
  it('IS the stored headcount, untouched', () => {
    const r = headcount(436)
    expect(r.available).toBe(true)
    expect(r.value).toBe(436)
    expect(r.inputsMissing).toEqual([])
  })

  it('a genuinely wound-down school reports 0 as a FACT (available)', () => {
    const r = headcount(0)
    expect(r.available).toBe(true)
    expect(r.value).toBe(0)
  })

  it('a MISSING headcount is unavailable and named — never a fabricated 0', () => {
    const r = headcount(null)
    expect(r.available).toBe(false)
    expect(r.value).toBeNull()
    expect(r.inputsMissing).toEqual(['enrollment'])
  })

  it('period-over-period delta is the plain difference in students', () => {
    const r = headcount(436, 420)
    expect(r.periodOverPeriodDelta).toBe(16)
  })

  it('no prior operational => no delta (never fabricated)', () => {
    expect(headcount(436).periodOverPeriodDelta).toBeNull()
  })
})

describe("'count' formatting — a headcount is whole children", () => {
  it('prints whole students with separators, not two decimals', () => {
    expect(formatMetricValue(436, 'count')).toBe('436')
    expect(formatMetricValue(1436, 'count')).toBe('1,436')
    expect(formatMetricValueLong(436, 'count')).toBe('436')
  })

  it('deltas are signed whole students', () => {
    expect(formatMetricDelta(16, 'count')).toBe('+16')
    expect(formatMetricDelta(-16, 'count')).toBe('−16')
  })

  it('null stays a dash, never a 0', () => {
    expect(formatMetricValue(null, 'count')).toBe('—')
    expect(formatMetricDelta(null, 'count')).toBeNull()
  })
})

describe('enrollment_headcount — org roll-up is a SUM of extensive counts', () => {
  it('org headcount = Σ school headcounts', () => {
    const schools: SchoolPeriodInputs[] = [
      { schoolId: 's1', financials: fromBundle(FULL_BUNDLE), operational: op(436) },
      { schoolId: 's2', financials: fromBundle(FULL_BUNDLE), operational: op(214) },
    ]
    const org = computeOrgMetrics(schools).find((m) => m.key === 'enrollment_headcount')!
    expect(org.available).toBe(true)
    expect(org.value).toBe(650)
  })

  it('a school with no headcount contributes nothing rather than a 0', () => {
    const schools: SchoolPeriodInputs[] = [
      { schoolId: 's1', financials: fromBundle(FULL_BUNDLE), operational: op(436) },
      { schoolId: 's2', financials: fromBundle(FULL_BUNDLE), operational: op(null) },
    ]
    const org = computeOrgMetrics(schools).find((m) => m.key === 'enrollment_headcount')!
    expect(org.value).toBe(436)
  })
})
