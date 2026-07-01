// ─────────────────────────────────────────────────────────────
// Canonical semantic layer v1 — org-scope rollup consistency suite.
//
// The load-bearing proof that "two people never see disagreeing numbers": there
// is exactly ONE formula per metric (def.compute), and the org value is that
// formula applied to the SUM of extensive components — never the average of
// per-school values.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from 'vitest'
import type {
  MetricDef,
  PeriodFinancials,
  PeriodOperational,
} from '../src/types.js'
import {
  computeOrgMetrics,
  sumFinancials,
  sumOperational,
  type SchoolPeriodInputs,
} from '../src/org-compute.js'
import { assembleMetricResult, computeMetricsRecord } from '../src/compute.js'
import { scopeRuleFor } from '../src/registry.js'
import { fromBundle } from '../src/adapt.js'
import { FULL_BUNDLE, NO_SFP_BUNDLE } from './fixtures.js'

// ── Hand-built PeriodFinancials at controlled scales ─────────────────────────
function fin(over: Partial<PeriodFinancials>): PeriodFinancials {
  const base: PeriodFinancials = {
    totalRev: 0,
    totalExp: 0,
    netChange: 0,
    tuition: 0,
    revenueLines: {
      tuition: 0, dev: 0, studAct: 0, textbook: 0, other: 0,
      support: 0, intlRev: 0, investments: 0, interest: 0,
    },
    expenseLines: {
      instructional: 0, facilities: 0, fixedOther: 0, intlExp: 0, bus: 0,
      food: 0, studActExp: 0, athletics: 0, admin: 0, restricted: 0,
    },
    cash: null,
    restrictedCash: null,
    naWithout: null,
    naWith: null,
    hasSFP: false,
  }
  return { ...base, ...over }
}

function op(over: Partial<PeriodOperational>): PeriodOperational {
  return { enrollment: null, enrollmentFte: null, studentsOnAid: null, financialAidTotal: null, ...over }
}

// Two DIFFERENT-SIZED schools (so weighted ≠ simple mean by construction).
// School A: rev 1000, exp 800, net 200, tuition 700, cash 3000, naWithout 2000,
//           enrollment 100, aid 90, studentsOnAid 40.
// School B: rev 100,  exp 120, net -20, tuition 80,  cash 60,   naWithout 30,
//           enrollment 20,  aid 30, studentsOnAid 15.
const schoolA: SchoolPeriodInputs = {
  schoolId: 'A',
  financials: fin({
    totalRev: 1000, totalExp: 800, netChange: 200, tuition: 700,
    revenueLines: { tuition: 700, dev: 200, studAct: 0, textbook: 0, other: 100, support: 0, intlRev: 0, investments: 0, interest: 0 },
    expenseLines: { instructional: 600, facilities: 100, fixedOther: 0, intlExp: 0, bus: 0, food: 0, studActExp: 0, athletics: 0, admin: 100, restricted: 0 },
    cash: 3000, restrictedCash: 0, naWithout: 2000, naWith: 0, hasSFP: true,
  }),
  operational: op({ enrollment: 100, studentsOnAid: 40, financialAidTotal: 90 }),
}
const schoolB: SchoolPeriodInputs = {
  schoolId: 'B',
  financials: fin({
    totalRev: 100, totalExp: 120, netChange: -20, tuition: 80,
    revenueLines: { tuition: 80, dev: 10, studAct: 0, textbook: 0, other: 10, support: 0, intlRev: 0, investments: 0, interest: 0 },
    expenseLines: { instructional: 90, facilities: 10, fixedOther: 0, intlExp: 0, bus: 0, food: 0, studActExp: 0, athletics: 0, admin: 20, restricted: 0 },
    cash: 60, restrictedCash: 0, naWithout: 30, naWith: 0, hasSFP: true,
  }),
  operational: op({ enrollment: 20, studentsOnAid: 15, financialAidTotal: 30 }),
}

function byKey(rows: ReturnType<typeof computeOrgMetrics>) {
  const m = {} as Record<string, (typeof rows)[number]>
  for (const r of rows) m[r.key] = r
  return m
}

describe('org rollup = formula(Σ components), NEVER avg(per-school values)', () => {
  const org = byKey(computeOrgMetrics([schoolA, schoolB]))

  it('operating_margin = Σnet / Σrev, not the mean of per-school margins', () => {
    // Σnet=180, Σrev=1100 -> 0.16363…  Per-school margins: 0.2 and -0.2 -> mean 0.
    expect(org.operating_margin.value).toBeCloseTo(180 / 1100, 12)
    const naiveMean = (200 / 1000 + -20 / 100) / 2 // = 0
    expect(org.operating_margin.value).not.toBeCloseTo(naiveMean, 6)
  })

  it('tuition_dependency = Σtuition / Σrev', () => {
    expect(org.tuition_dependency.value).toBeCloseTo(780 / 1100, 12)
  })

  it('tuition_discount_rate = Σaid / Σtuition, not avg of rates', () => {
    // Σaid=120, Σtuition=780 -> 0.1538…  per-school 90/700 & 30/80 -> mean ≠ this.
    expect(org.tuition_discount_rate.value).toBeCloseTo(120 / 780, 12)
    const naiveMean = (90 / 700 + 30 / 80) / 2
    expect(org.tuition_discount_rate.value).not.toBeCloseTo(naiveMean, 6)
  })

  it('days_cash_on_hand = Σcash / (Σexp/365), cash-weighted', () => {
    expect(org.days_cash_on_hand.value).toBeCloseTo(3060 / (920 / 365), 9)
  })

  it('months_operating_reserve = ΣnaWithout / (Σexp/12)', () => {
    expect(org.months_operating_reserve.value).toBeCloseTo(2030 / (920 / 12), 9)
  })

  it('revenue_mix org donut: share = Σline / Σrev, value = Σrev', () => {
    const m = org.revenue_mix
    expect(m.value).toBe(1100)
    const tuition = m.components?.find((c) => c.key === 'tuition')
    expect(tuition?.value).toBe(780)
    expect(tuition?.share).toBeCloseTo(780 / 1100, 12)
    const sum = (m.components ?? []).reduce((a, c) => a + c.share, 0)
    expect(sum).toBeCloseTo(1, 10)
  })

  it('expense_mix org donut: share = Σline / Σexp, value = Σexp', () => {
    const m = org.expense_mix
    expect(m.value).toBe(920)
    const instr = m.components?.find((c) => c.key === 'instructional')
    expect(instr?.value).toBe(690)
    expect(instr?.share).toBeCloseTo(690 / 920, 12)
  })

  it('every org result is tagged scope:org with the contributing count', () => {
    for (const r of Object.values(org)) {
      expect(r.scope).toBe('org')
      expect(r.reportedSchoolCount).toBe(2)
    }
  })
})

describe('weighted per-pupil/per-aided metrics', () => {
  const org = byKey(computeOrgMetrics([schoolA, schoolB]))

  it('cost_per_pupil = Σexp / Σenrollment (enrollment-weighted, not simple mean)', () => {
    // Σexp=920, Σenroll=120 -> 7.666…  per-school 8 and 6 -> simple mean 7.
    expect(org.cost_per_pupil.value).toBeCloseTo(920 / 120, 12)
    expect(org.cost_per_pupil.value).not.toBeCloseTo((800 / 100 + 120 / 20) / 2, 6)
  })

  it('financial_aid_per_student = Σaid / Σenrollment', () => {
    expect(org.financial_aid_per_student.value).toBeCloseTo(120 / 120, 12)
  })

  it('net_tuition_per_student = (Σtuition − Σaid) / Σenrollment', () => {
    expect(org.net_tuition_per_student.value).toBeCloseTo((780 - 120) / 120, 12)
  })

  it('aid_per_aided_student = Σaid / ΣstudentsOnAid (aided-count-weighted)', () => {
    // Σaid=120, Σonaid=55 -> 2.1818…
    expect(org.aid_per_aided_student.value).toBeCloseTo(120 / 55, 12)
  })

  it('pct_students_on_aid = ΣstudentsOnAid / Σenrollment', () => {
    expect(org.pct_students_on_aid.value).toBeCloseTo(55 / 120, 12)
  })
})

describe('cross-surface identity: org-of-one === per-school', () => {
  // The SAME dataset through both surfaces must agree byte-for-byte (modulo the
  // additive scope/reportedSchoolCount fields the org wrapper adds).
  const finA = fromBundle(FULL_BUNDLE)
  const operationalA: PeriodOperational = op({ enrollment: 250, studentsOnAid: 60, financialAidTotal: 120000 })

  const perSchool = computeMetricsRecord({ current: FULL_BUNDLE, currentOperational: operationalA })
  const org = byKey(computeOrgMetrics([{ schoolId: 'solo', financials: finA, operational: operationalA }]))

  it('every metric value + availability + status matches the per-school path', () => {
    for (const key of Object.keys(perSchool)) {
      const ps = perSchool[key as keyof typeof perSchool]
      const o = org[key]
      expect(o.value).toBe(ps.value)
      expect(o.available).toBe(ps.available)
      expect(o.status).toBe(ps.status)
      // A 'not-aggregatable' metric (e.g. enrollment_change_yoy, a YoY rate) is
      // honestly unavailable at org via the engine's not-aggregatable branch, so it
      // reports inputsMissing ['scope:not-aggregatable'] instead of the per-school
      // reason. value/available/status still agree (null/false/neutral); only the
      // reason string diverges by design — skip the reason equality for those.
      if (scopeRuleFor(key as never) === 'not-aggregatable') continue
      expect(o.inputsMissing).toEqual(ps.inputsMissing)
    }
  })

  it('mix components match the per-school path for org-of-one', () => {
    expect(org.revenue_mix.components).toEqual(perSchool.revenue_mix.components)
    expect(org.expense_mix.components).toEqual(perSchool.expense_mix.components)
  })
})

describe('null / SFP fold', () => {
  it('one school with an SFP + one without → days_cash_on_hand available off the present cash', () => {
    const withSfp: SchoolPeriodInputs = { schoolId: 'A', financials: fin({ totalRev: 1000, totalExp: 365, cash: 100, naWithout: 50, hasSFP: true }) }
    const noSfp: SchoolPeriodInputs = { schoolId: 'B', financials: fromBundle(NO_SFP_BUNDLE) }
    const org = byKey(computeOrgMetrics([withSfp, noSfp]))
    expect(org.days_cash_on_hand.available).toBe(true)
    // Σcash = 100 (only A has one); Σexp = 365 + 480 = 845.
    expect(org.days_cash_on_hand.value).toBeCloseTo(100 / (845 / 365), 9)
  })

  it('ALL schools lacking an SFP → SFP-dependent metrics unavailable', () => {
    const a: SchoolPeriodInputs = { schoolId: 'A', financials: fromBundle(NO_SFP_BUNDLE) }
    const b: SchoolPeriodInputs = { schoolId: 'B', financials: fromBundle(NO_SFP_BUNDLE) }
    const org = byKey(computeOrgMetrics([a, b]))
    expect(org.days_cash_on_hand.available).toBe(false)
    expect(org.days_cash_on_hand.inputsMissing).toContain('cash')
    expect(org.months_operating_reserve.available).toBe(false)
  })

  it('enrollment null on one school sums over the rest (advisory partial coverage)', () => {
    const a: SchoolPeriodInputs = { schoolId: 'A', financials: fin({ totalRev: 100, totalExp: 100 }), operational: op({ enrollment: 50 }) }
    const b: SchoolPeriodInputs = { schoolId: 'B', financials: fin({ totalRev: 100, totalExp: 100 }), operational: op({ enrollment: null }) }
    const org = byKey(computeOrgMetrics([a, b]))
    // Σexp=200, Σenroll=50 (only A entered it).
    expect(org.cost_per_pupil.available).toBe(true)
    expect(org.cost_per_pupil.value).toBeCloseTo(200 / 50, 9)
  })

  it('no school reported operational data → Tier-2 metrics unavailable', () => {
    const a: SchoolPeriodInputs = { schoolId: 'A', financials: fin({ totalRev: 100, totalExp: 100 }) }
    const org = byKey(computeOrgMetrics([a]))
    expect(org.cost_per_pupil.available).toBe(false)
    expect(org.pct_students_on_aid.available).toBe(false)
  })
})

describe('sumFinancials / sumOperational units', () => {
  it('sums extensive scalars + revenue/expense lines per key', () => {
    const s = sumFinancials([schoolA.financials, schoolB.financials])
    expect(s.totalRev).toBe(1100)
    expect(s.totalExp).toBe(920)
    expect(s.netChange).toBe(180)
    expect(s.tuition).toBe(780)
    expect(s.revenueLines.dev).toBe(210)
    expect(s.expenseLines.instructional).toBe(690)
  })

  it('foldNullable: null only when every school is null; else Σ of present', () => {
    const s = sumFinancials([
      fin({ cash: null }),
      fin({ cash: 5, hasSFP: true }),
    ])
    expect(s.cash).toBe(5)
    const allNull = sumFinancials([fin({ cash: null }), fin({ cash: null })])
    expect(allNull.cash).toBeNull()
  })

  it('hasSFP = OR across schools', () => {
    expect(sumFinancials([fin({ hasSFP: false }), fin({ hasSFP: true })]).hasSFP).toBe(true)
    expect(sumFinancials([fin({ hasSFP: false }), fin({ hasSFP: false })]).hasSFP).toBe(false)
  })

  it('sumOperational returns null when no school reported any operational row', () => {
    expect(sumOperational([null, undefined])).toBeNull()
  })

  it('org rollup is annual-only: elapsed basis stays undefined', () => {
    const s = sumFinancials([schoolA.financials])
    expect(s.elapsedDays).toBeUndefined()
    expect(s.elapsedMonths).toBeUndefined()
  })
})

describe('not-aggregatable rule → unavailable', () => {
  // A synthetic def exercising the org engine's only branch. We drive it through
  // assembleMetricResult exactly as the engine does, so the contract is pinned.
  it('produces available:false with the scope reason (engine contract)', () => {
    const stub: MetricDef = {
      key: 'operating_margin', // any key; we only read the assembly shape
      label: 'Stub',
      unit: 'ratio',
      category: 'profitability',
      goodDirection: 'neutral',
      formula: 'n/a',
      description: 'n/a',
      scopeAggregation: 'not-aggregatable',
      compute: () => ({ value: 1, available: true, inputsMissing: [] }),
    }
    const res = assembleMetricResult(
      stub,
      { value: null, available: false, inputsMissing: ['scope:not-aggregatable'], inputs: [] },
      null,
    )
    expect(res.available).toBe(false)
    expect(res.value).toBeNull()
    expect(res.inputsMissing).toContain('scope:not-aggregatable')
    expect(res.status).toBe('neutral')
  })

  // Pin the ROUTING (not just the assembly): drive a real key through
  // computeOrgMetrics with the registry stubbed to declare it not-aggregatable,
  // proving the `rule === 'not-aggregatable'` branch is reached end-to-end and
  // never silently sums/averages. Isolated via resetModules + a scoped doMock so
  // the rest of the suite keeps the real registry.
  it('computeOrgMetrics routes a not-aggregatable metric to available:false', async () => {
    vi.resetModules()
    vi.doMock('../src/registry.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../src/registry.js')>()
      return {
        ...actual,
        scopeRuleFor: (k: string) =>
          k === 'operating_margin' ? 'not-aggregatable' : actual.scopeRuleFor(k as never),
      }
    })
    const { computeOrgMetrics: mocked } = await import('../src/org-compute.js')
    const om = mocked([schoolA, schoolB]).find((m) => m.key === 'operating_margin')
    expect(om?.available).toBe(false)
    expect(om?.value).toBeNull()
    expect(om?.inputsMissing).toContain('scope:not-aggregatable')
    // A sibling metric with a real rule still computes — proves the stub is scoped.
    const sib = mocked([schoolA, schoolB]).find((m) => m.key === 'tuition_dependency')
    expect(sib?.available).toBe(true)
    vi.doUnmock('../src/registry.js')
    vi.resetModules()
  })
})

describe('determinism', () => {
  it('computing twice over the same rows is deep-equal', () => {
    const a = computeOrgMetrics([schoolA, schoolB])
    const b = computeOrgMetrics([schoolA, schoolB])
    expect(a).toEqual(b)
  })

  it('input rows are not mutated', () => {
    const before = JSON.parse(JSON.stringify(schoolA.financials))
    computeOrgMetrics([schoolA, schoolB])
    expect(schoolA.financials).toEqual(before)
  })
})
