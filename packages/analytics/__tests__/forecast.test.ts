// ─────────────────────────────────────────────────────────────
// Phase 2 — FY-End Forecast feeder merge. The ONE analytics addition, shared by
// the API (server save) and web (live preview), so it carries dedicated coverage.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import {
  mergeFeederEnrollment,
  rollForwardEnrollment,
  effectiveEnrollment,
  GRADE_KEYS,
  computeDriverBudget,
  defaultAssumptions,
} from '../src/index.js'

describe('mergeFeederEnrollment', () => {
  it('adds feeder per grade and omits zero-sum keys', () => {
    const out = mergeFeederEnrollment({ PK4: 40, K: 60, '1': 58 }, { PK4: 12, K: 18, '6': 4 })
    expect(out).toEqual({ PK4: 52, K: 78, '1': 58, '6': 4 })
    // A grade absent from both stays absent (zero-sum omitted).
    expect(out).not.toHaveProperty('2')
  })

  it('clamps negatives to 0 on each side and never throws', () => {
    expect(mergeFeederEnrollment({ K: -5 }, { K: 10 })).toEqual({ K: 10 })
    expect(mergeFeederEnrollment({ K: 8 }, { K: -3 })).toEqual({ K: 8 })
    expect(mergeFeederEnrollment({ K: 0 }, { K: 0 })).toEqual({})
  })

  it('treats null/undefined feeder as no additions', () => {
    expect(mergeFeederEnrollment({ K: 20 }, null)).toEqual({ K: 20 })
    expect(mergeFeederEnrollment({ K: 20 }, undefined)).toEqual({ K: 20 })
  })

  it('ignores unknown keys on both inputs (only the 14 GRADE_KEYS participate)', () => {
    const out = mergeFeederEnrollment(
      { K: 10, bogus: 99 } as Record<string, number>,
      { K: 5, alsoBogus: 7 } as Record<string, number>,
    )
    expect(out).toEqual({ K: 15 })
    for (const k of Object.keys(out)) expect(GRADE_KEYS).toContain(k)
  })

  it('feeder raises projected gross tuition through computeDriverBudget', () => {
    const base = defaultAssumptions()
    base.enrollmentByGrade = { K: 100 }
    base.tuitionRates = { prek3: 0, prek5: 0, elem: 1000, middle: 0 }
    const withoutFeeder = computeDriverBudget(base, { priorRevenue: {}, priorExpense: {} })
    const merged = { ...base, enrollmentByGrade: mergeFeederEnrollment(base.enrollmentByGrade, { K: 20 }) }
    const withFeeder = computeDriverBudget(merged, { priorRevenue: {}, priorExpense: {} })
    // 20 extra K students × $1000 = +$20,000 tuition; enrollment total +20.
    expect(withFeeder.revenue.tuition - withoutFeeder.revenue.tuition).toBe(20000)
    expect(withFeeder.kpis.enrollmentTotal - withoutFeeder.kpis.enrollmentTotal).toBe(20)
  })
})

describe('rollForwardEnrollment', () => {
  it('locks the worked example: K/1 age up, grade 8 graduates, PK0/K entrants', () => {
    const out = rollForwardEnrollment({
      currentByGrade: { K: 100, '1': 100, '8': 100 },
      retentionPct: 90,
      newEntrantsByGrade: { PK0: 30, K: 10 },
      graduatingGrade: '8',
    })
    // K(100)->1 round(90)=90; 1(100)->2 round(90)=90; 8 graduates (no roll-up);
    // entrants PK0=30, K=10. Returning K/1 no longer counted in their own grade.
    expect(out).toEqual({ PK0: 30, K: 10, '1': 90, '2': 90 })
    expect(Object.values(out).reduce((s, v) => s + v, 0)).toBe(220)
  })

  it('promotes one index — each destination has exactly one source cohort', () => {
    const out = rollForwardEnrollment({ currentByGrade: { '3': 50 }, retentionPct: 100 })
    expect(out).toEqual({ '4': 50 })
  })

  it('first grade PK0 stays 0 returning (no lower grade feeds it)', () => {
    const out = rollForwardEnrollment({ currentByGrade: { PK0: 80 }, retentionPct: 100 })
    // PK0's cohort ages into PK1; PK0 itself has no source → absent (0 returning).
    expect(out).toEqual({ PK1: 80 })
    expect(out).not.toHaveProperty('PK0')
  })

  it('drops the graduating cohort (default grade 8)', () => {
    const out = rollForwardEnrollment({ currentByGrade: { '8': 100 }, retentionPct: 100 })
    expect(out).toEqual({})
  })

  it('honors a non-top graduatingGrade — that cohort exits, grades above only get entrants', () => {
    const out = rollForwardEnrollment({
      currentByGrade: { '5': 40, '6': 40 },
      retentionPct: 100,
      graduatingGrade: '5',
      newEntrantsByGrade: { '7': 3 },
    })
    // grade5 graduates (no roll into 6); grade6 -> 7 = 40; +3 transfer at 7.
    // No current grade 4, so grade 6 has no source → absent.
    expect(out).toEqual({ '7': 43 })
  })

  it('adds new entrants additively at any grade (entry + transfers)', () => {
    const out = rollForwardEnrollment({
      currentByGrade: { K: 20 },
      retentionPct: 50,
      newEntrantsByGrade: { PK0: 18, '1': 5, '4': 2 },
    })
    // K(20)->1 round(10)=10, +5 transfer at 1 = 15; PK0=18 entrants; 4=2 transfer.
    expect(out).toEqual({ PK0: 18, '1': 15, '4': 2 })
  })

  it('Math.round per cohort (half-up), one boundary per grade', () => {
    // 7 * 0.93 = 6.51 -> 7 ;  3 * 0.5 = 1.5 -> 2
    const out = rollForwardEnrollment({ currentByGrade: { K: 7, '1': 3 }, retentionPct: 93 })
    expect(out['1']).toBe(7)
    // 1 -> 2 at 93%: round(3*0.93)=round(2.79)=3
    expect(out['2']).toBe(3)
  })

  it('applies per-grade retention keyed by SOURCE grade', () => {
    const out = rollForwardEnrollment({
      currentByGrade: { K: 100, '1': 100 },
      retentionPct: 90,
      retentionByGrade: { K: 50 }, // source-grade override: 50% of current K returns
    })
    expect(out['1']).toBe(50) // round(100 * 0.50)
    expect(out['2']).toBe(90) // grade1 still uses default 90%
  })

  it('clamps retention to [0,100], counts to >=0, ignores NaN/unknown keys, never throws', () => {
    expect(
      rollForwardEnrollment({ currentByGrade: { K: 100 }, retentionPct: 250 })['1'],
    ).toBe(100) // >100 clamps to 100
    expect(
      rollForwardEnrollment({ currentByGrade: { K: 100 }, retentionPct: -20 }),
    ).toEqual({}) // <0 clamps to 0 → empty
    expect(
      rollForwardEnrollment({ currentByGrade: { K: -50 }, retentionPct: 100 }),
    ).toEqual({}) // negative count floors to 0
    expect(
      rollForwardEnrollment({
        currentByGrade: { K: Number.NaN as number, bogus: 9 } as Record<string, number>,
        retentionPct: 100,
      }),
    ).toEqual({}) // NaN → 0, unknown key ignored
    expect(() =>
      rollForwardEnrollment({ currentByGrade: {}, retentionPct: 0 }),
    ).not.toThrow()
  })

  it('emits sparse output (only the 14 GRADE_KEYS, zeros omitted)', () => {
    const out = rollForwardEnrollment({ currentByGrade: { K: 100 }, retentionPct: 90 })
    for (const k of Object.keys(out)) expect(GRADE_KEYS).toContain(k)
    expect(Object.values(out).every((v) => v !== 0)).toBe(true)
  })
})

describe('effectiveEnrollment (shared dispatcher)', () => {
  it('manual mode === mergeFeederEnrollment for representative inputs', () => {
    const enrollment = { PK4: 40, K: 60, '1': 58 }
    const feeder = { PK4: 12, K: 18, '6': 4 }
    expect(
      effectiveEnrollment({
        projectionMethod: 'manual',
        enrollmentByGrade: enrollment,
        feederEnrollmentByGrade: feeder,
      }),
    ).toEqual(mergeFeederEnrollment(enrollment, feeder))
  })

  it('missing/unknown projectionMethod ⇒ manual (back-compat)', () => {
    const enrollment = { K: 95, '1': 90 }
    const feeder = { PK0: 30 }
    const expected = mergeFeederEnrollment(enrollment, feeder)
    expect(
      effectiveEnrollment({ enrollmentByGrade: enrollment, feederEnrollmentByGrade: feeder }),
    ).toEqual(expected)
    expect(
      effectiveEnrollment({
        projectionMethod: 'bogus' as 'manual',
        enrollmentByGrade: enrollment,
        feederEnrollmentByGrade: feeder,
      }),
    ).toEqual(expected)
    expect(
      effectiveEnrollment({
        projectionMethod: null,
        enrollmentByGrade: enrollment,
        feederEnrollmentByGrade: feeder,
      }),
    ).toEqual(expected)
  })

  it('rollforward feeds feeder as new entrants and applies overrides LAST', () => {
    const out = effectiveEnrollment({
      projectionMethod: 'rollforward',
      enrollmentByGrade: { K: 999 }, // DERIVED/IGNORED in rollforward mode
      feederEnrollmentByGrade: { PK0: 18, K: 22, '3': 2 },
      rollForward: {
        currentByGrade: {
          PK0: 16, PK1: 17, PK2: 18, PK3: 19, PK4: 20,
          K: 24, '1': 23, '2': 22, '3': 21, '4': 20,
          '5': 19, '6': 18, '7': 17, '8': 16,
        },
        retentionPct: 93,
        retentionByGrade: { '8': 100, PK4: 88 },
        graduatingGrade: '8',
        projectedOverrideByGrade: { K: 45 },
      },
    })
    // K = round(PK4 20 * 88%) 18 promoted + feeder K 22 = 40, OVERRIDDEN to 45.
    // '1' = round(K 24 * 93%)=22 + feeder 0 = 22. PK0 = 0 + feeder 18 = 18.
    // '8' = round('7' 17 * 93%)=16. Current grade-8 16 do NOT roll up.
    expect(out).toMatchObject({
      PK0: 18, PK1: 15, PK2: 16, PK3: 17, PK4: 18,
      K: 45, '1': 22, '2': 21, '3': 22, '4': 20,
      '5': 19, '6': 18, '7': 17, '8': 16,
    })
    // enrollmentByGrade in rollforward is ignored — 999 never appears.
    expect(out.K).toBe(45)
  })

  it('rollforward with rollForward absent degrades to entrants-only without throwing', () => {
    expect(() =>
      effectiveEnrollment({
        projectionMethod: 'rollforward',
        enrollmentByGrade: {},
        feederEnrollmentByGrade: { PK0: 25, K: 30 },
      }),
    ).not.toThrow()
    expect(
      effectiveEnrollment({
        projectionMethod: 'rollforward',
        enrollmentByGrade: {},
        feederEnrollmentByGrade: { PK0: 25, K: 30 },
      }),
    ).toEqual({ PK0: 25, K: 30 })
  })

  it('override clamps negatives to >=0 and can REPLACE down to zero (omitted)', () => {
    const out = effectiveEnrollment({
      projectionMethod: 'rollforward',
      enrollmentByGrade: {},
      feederEnrollmentByGrade: { '1': 50 },
      rollForward: {
        currentByGrade: {},
        retentionPct: 0,
        projectedOverrideByGrade: { '1': 0, '2': -10 },
      },
    })
    // '1' computed 50 but overridden to 0 → omitted; '2' override -10 clamps to 0 → omitted.
    expect(out).toEqual({})
  })
})
