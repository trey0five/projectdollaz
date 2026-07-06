// ─────────────────────────────────────────────────────────────
// Thin wedge — enrollment_change_yoy: the first non-finance (enrollment-domain)
// BANDED metric. Growth/flat/decline banding, availability guards, the honest
// null PoP delta, and org-unavailable-without-prior.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import type { PeriodOperational } from '../src/types.js'
import { computeMetricsRecord } from '../src/compute.js'
import { computeOrgMetrics, type SchoolPeriodInputs } from '../src/org-compute.js'
import { fromBundle } from '../src/adapt.js'
import { METRIC_KEYS, METRIC_META } from '../src/registry.js'
import { DEFAULT_BANDS } from '../src/health.js'
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

// Compute enrollment_change_yoy from a current + prior headcount. Both periods use
// the SAME financial bundle (irrelevant to this metric — it reads only operational).
function yoy(curEnrollment: number | null, priorEnrollment: number | null) {
  return computeMetricsRecord({
    current: FULL_BUNDLE,
    prior: FULL_BUNDLE,
    currentOperational: op(curEnrollment),
    priorOperational: op(priorEnrollment),
  }).enrollment_change_yoy
}

describe('enrollment_change_yoy — registry wiring', () => {
  it('is registered before the last, keeping the existing 12 keys byte-identical up front', () => {
    expect(METRIC_KEYS).toContain('enrollment_change_yoy')
    // student_teacher_ratio then enrollment_vs_plan (Phase 2) were appended after
    // enrollment_change_yoy (see registry), so it is now third-to-last.
    expect(METRIC_KEYS[METRIC_KEYS.length - 3]).toBe('enrollment_change_yoy')
    expect(METRIC_KEYS).toHaveLength(15)
    // The first 12 are unchanged.
    expect(METRIC_KEYS.slice(0, 12)).toEqual([
      'operating_margin', 'days_cash_on_hand', 'months_operating_reserve',
      'tuition_dependency', 'revenue_mix', 'expense_mix', 'cost_per_pupil',
      'net_tuition_per_student', 'financial_aid_per_student', 'aid_per_aided_student',
      'tuition_discount_rate', 'pct_students_on_aid',
    ])
  })

  it('declares enrollment domain, higher goodDirection, percent unit, recompute-from-components rollup', () => {
    const m = METRIC_META.find((x) => x.key === 'enrollment_change_yoy')!
    expect(m.domain).toBe('enrollment')
    expect(m.goodDirection).toBe('higher')
    expect(m.unit).toBe('percent')
    // Now that the org path resolves each school's nearest-prior operational,
    // enrollment (an extensive stock) rolls up as (Σcur − Σprior) / Σprior.
    expect(m.scopeAggregation).toBe('recompute-from-components')
    expect(m.bands).toEqual({ goodDirection: 'higher', good: 0, risk: -0.05 })
  })

  it('DEFAULT_BANDS carries the enrollment band', () => {
    expect(DEFAULT_BANDS.enrollment_change_yoy).toEqual({
      goodDirection: 'higher', good: 0, risk: -0.05,
    })
  })
})

describe('enrollment_change_yoy — banding', () => {
  it('GROWTH: 100 → 110 is +10%, good', () => {
    const r = yoy(110, 100)
    expect(r.available).toBe(true)
    expect(r.value).toBeCloseTo(0.1, 12)
    expect(r.status).toBe('good')
  })

  it('FLAT: 100 → 100 is 0%, good (0 is inclusive-good)', () => {
    const r = yoy(100, 100)
    expect(r.available).toBe(true)
    expect(r.value).toBe(0)
    expect(r.status).toBe('good')
  })

  it('MODEST DECLINE: 100 → 97 is -3%, watch', () => {
    const r = yoy(97, 100)
    expect(r.value).toBeCloseTo(-0.03, 12)
    expect(r.status).toBe('watch')
  })

  it('BOUNDARY at the risk frontier: -5% exactly lands in WATCH (not risk)', () => {
    const r = yoy(95, 100)
    expect(r.value).toBeCloseTo(-0.05, 12)
    expect(r.status).toBe('watch')
  })

  it('just past the frontier: -6% is risk', () => {
    const r = yoy(94, 100)
    expect(r.value).toBeCloseTo(-0.06, 12)
    expect(r.status).toBe('risk')
  })

  it('STEEP DECLINE: 100 → 90 is -10%, risk', () => {
    const r = yoy(90, 100)
    expect(r.value).toBeCloseTo(-0.1, 12)
    expect(r.status).toBe('risk')
  })

  it('TOTAL COLLAPSE: a positive prior → 0 current is -100%, available & risk (never a fabricated 0)', () => {
    // cur=0 is a legitimate value (not absent), so the metric IS available and
    // reports the true -100% — the worst-case risk, not swallowed as unavailable.
    const r = yoy(0, 100)
    expect(r.available).toBe(true)
    expect(r.value).toBeCloseTo(-1, 12)
    expect(r.status).toBe('risk')
  })
})

describe('enrollment_change_yoy — availability guards (never fabricate/divide-by-zero)', () => {
  it('no prior operational at all → unavailable, missing priorEnrollment', () => {
    const r = computeMetricsRecord({
      current: FULL_BUNDLE,
      currentOperational: op(100),
    }).enrollment_change_yoy
    expect(r.available).toBe(false)
    expect(r.value).toBeNull()
    expect(r.inputsMissing).toEqual(['priorEnrollment'])
  })

  it('prior enrollment null → unavailable, missing priorEnrollment', () => {
    const r = yoy(100, null)
    expect(r.available).toBe(false)
    expect(r.inputsMissing).toEqual(['priorEnrollment'])
  })

  it('prior enrollment 0 → unavailable (divide-by-zero guard), missing priorEnrollment', () => {
    const r = yoy(100, 0)
    expect(r.available).toBe(false)
    expect(r.inputsMissing).toEqual(['priorEnrollment'])
  })

  it('prior enrollment negative → unavailable', () => {
    const r = yoy(100, -5)
    expect(r.available).toBe(false)
    expect(r.inputsMissing).toEqual(['priorEnrollment'])
  })

  it('current enrollment null (prior present) → unavailable, missing enrollment', () => {
    const r = yoy(null, 100)
    expect(r.available).toBe(false)
    expect(r.inputsMissing).toEqual(['enrollment'])
  })

  it('both missing → both flagged', () => {
    const r = computeMetricsRecord({ current: FULL_BUNDLE }).enrollment_change_yoy
    expect(r.available).toBe(false)
    expect(r.inputsMissing).toEqual(['enrollment', 'priorEnrollment'])
  })

  it('reports the two operands in inputs[] even when available', () => {
    const r = yoy(110, 100)
    const keys = r.inputs.map((i) => i.key)
    expect(keys).toEqual(['enrollment', 'priorEnrollment'])
    expect(r.inputs.find((i) => i.key === 'enrollment')?.value).toBe(110)
    expect(r.inputs.find((i) => i.key === 'priorEnrollment')?.value).toBe(100)
  })
})

describe('enrollment_change_yoy — PoP delta is intentionally null', () => {
  it('the metric IS a delta, so a delta-of-a-delta (no prior-of-prior) is null', () => {
    // evaluate() recomputes the prior via compute(prior, undefined, priorOp, undefined)
    // — the prior period with NO prior-of-prior — so priorOut is unavailable → delta null.
    const r = yoy(110, 100)
    expect(r.available).toBe(true)
    expect(r.periodOverPeriodDelta).toBeNull()
  })
})

describe('enrollment_change_yoy — org scope recomputes from summed enrollment', () => {
  // With prior operational supplied, org YoY = (Σcur − Σprior) / Σprior.
  function schoolWithPrior(
    id: string,
    cur: number,
    prior: number,
  ): SchoolPeriodInputs {
    return {
      schoolId: id,
      financials: fromBundle(FULL_BUNDLE),
      operational: op(cur),
      priorFinancials: fromBundle(FULL_BUNDLE),
      priorOperational: op(prior),
    }
  }
  // No prior: no priorFinancials/priorOperational at all.
  function schoolNoPrior(id: string, cur: number): SchoolPeriodInputs {
    return { schoolId: id, financials: fromBundle(FULL_BUNDLE), operational: op(cur) }
  }

  it('with priors present: org value = (Σcur − Σprior) / Σprior, banded', () => {
    // Σcur = 80 + 20 = 100; Σprior = 100 + 40 = 140 → (100−140)/140 = −0.2857… decline.
    const org = computeOrgMetrics([
      schoolWithPrior('A', 80, 100),
      schoolWithPrior('B', 20, 40),
    ])
    const m = org.find((x) => x.key === 'enrollment_change_yoy')!
    expect(m.available).toBe(true)
    expect(m.value).toBeCloseTo((100 - 140) / 140, 12)
    // ≈ −28.6% is past the −5% risk frontier → banded risk (a superintendent signal).
    expect(m.status).toBe('risk')
    expect(m.scope).toBe('org')
    // Its OWN PoP delta stays null: no prior-of-prior in the org sums (honest).
    expect(m.periodOverPeriodDelta).toBeNull()
  })

  it('NO school has a prior: guard-driven unavailable (NOT a scope refusal)', () => {
    const org = computeOrgMetrics([schoolNoPrior('A', 100), schoolNoPrior('B', 40)])
    const m = org.find((x) => x.key === 'enrollment_change_yoy')!
    expect(m.available).toBe(false)
    expect(m.value).toBeNull()
    // Reason is now the metric's OWN priorEnrollment guard, not scope:not-aggregatable.
    expect(m.inputsMissing).toContain('priorEnrollment')
    expect(m.inputsMissing).not.toContain('scope:not-aggregatable')
    expect(m.scope).toBe('org')
  })

  it('does NOT break the rest of the org rollup', () => {
    const org = computeOrgMetrics([
      schoolWithPrior('A', 100, 95),
      schoolWithPrior('B', 40, 40),
    ])
    expect(org.find((x) => x.key === 'operating_margin')!.available).toBe(true)
    expect(org).toHaveLength(15)
  })
})

describe('enrollment_change_yoy — purity/determinism', () => {
  it('computing twice from the same inputs is byte-identical', () => {
    expect(yoy(110, 100)).toEqual(yoy(110, 100))
  })
})
