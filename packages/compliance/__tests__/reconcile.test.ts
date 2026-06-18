import { describe, it, expect } from 'vitest'
import {
  reconcileScholarships,
  type Disbursement,
  type ReconciliationInput,
} from '../src/reconcile.js'

const PERIOD = { periodStart: '2025-07-01', periodEnd: '2026-06-30' }

function d(p: Partial<Disbursement>): Disbursement {
  return { amount: 0, ...p }
}

describe('reconcileScholarships — totals + breakdowns', () => {
  it('sums totalDisbursed and count over finite amounts', () => {
    const r = reconcileScholarships({
      disbursements: [
        d({ program: 'FTC', payDate: '2025-08-01', amount: 100000 }),
        d({ program: 'FES_UA', payDate: '2025-09-15', amount: 200000 }),
      ],
    })
    expect(r.totalDisbursed).toBe(300000)
    expect(r.count).toBe(2)
  })

  it('byProgram in canonical order (FTC, FES_EO, FES_UA, UNKNOWN)', () => {
    const r = reconcileScholarships({
      disbursements: [
        d({ program: 'FES_UA', amount: 50, payDate: '2025-08-01', studentRef: 'a' }),
        d({ program: 'FTC', amount: 10, payDate: '2025-08-01', studentRef: 'b' }),
        d({ program: 'FES_EO', amount: 20, payDate: '2025-08-01', studentRef: 'c' }),
        d({ program: null, amount: 5, payDate: '2025-08-01', studentRef: 'e' }),
        d({ program: 'FTC', amount: 10, payDate: '2025-08-01', studentRef: 'f' }),
      ],
    })
    expect(r.byProgram.map((b) => b.program)).toEqual(['FTC', 'FES_EO', 'FES_UA', 'UNKNOWN'])
    const ftc = r.byProgram.find((b) => b.program === 'FTC')!
    expect(ftc.total).toBe(20)
    expect(ftc.count).toBe(2)
    expect(r.byProgram.find((b) => b.program === 'UNKNOWN')!.total).toBe(5)
  })

  it('byMonth sorted ascending with unknown bucket last', () => {
    const r = reconcileScholarships({
      disbursements: [
        d({ program: 'FTC', amount: 30, payDate: '2025-09-10', studentRef: 'a' }),
        d({ program: 'FTC', amount: 10, payDate: '2025-08-10', studentRef: 'b' }),
        d({ program: 'FTC', amount: 7, payDate: null, studentRef: 'c' }),
        d({ program: 'FTC', amount: 20, payDate: '2025-08-25', studentRef: 'd' }),
      ],
    })
    expect(r.byMonth.map((m) => m.month)).toEqual(['2025-08', '2025-09', 'unknown'])
    expect(r.byMonth[0]).toMatchObject({ month: '2025-08', total: 30, count: 2 })
    expect(r.byMonth[2]).toMatchObject({ month: 'unknown', total: 7, count: 1 })
  })
})

describe('reconcileScholarships — status + tolerance boundaries', () => {
  it('needs_data when recorded figure missing', () => {
    const r = reconcileScholarships({
      disbursements: [d({ program: 'FTC', amount: 1000, payDate: '2025-08-01' })],
    })
    expect(r.status).toBe('needs_data')
    expect(r.variance).toBeNull()
    expect(r.variancePct).toBeNull()
  })

  it('matched when |variance| within max(abs, pct%)', () => {
    // total 100000, default pct 0.5% = 500. recorded 100400 -> variance 400 <= 500.
    const r = reconcileScholarships({
      disbursements: [d({ program: 'FTC', amount: 100000, payDate: '2025-08-01' })],
      recordedScholarshipRevenue: 100400,
    })
    expect(r.status).toBe('matched')
    expect(r.variance).toBe(400)
    expect(r.variancePct).toBe(0.4)
  })

  it('variance when outside tolerance', () => {
    const r = reconcileScholarships({
      disbursements: [d({ program: 'FTC', amount: 300000, payDate: '2025-08-01' })],
      recordedScholarshipRevenue: 250000,
    })
    expect(r.status).toBe('variance')
    expect(r.variance).toBe(-50000)
    expect(r.variancePct).toBeCloseTo(-16.67, 2)
  })

  it('exact tolerance boundary is matched (inclusive)', () => {
    // total 100000, 0.5% = 500. recorded 100500 -> variance exactly 500.
    const r = reconcileScholarships({
      disbursements: [d({ program: 'FTC', amount: 100000, payDate: '2025-08-01' })],
      recordedScholarshipRevenue: 100500,
    })
    expect(r.variance).toBe(500)
    expect(r.status).toBe('matched')
  })

  it('one cent past tolerance is variance', () => {
    const r = reconcileScholarships({
      disbursements: [d({ program: 'FTC', amount: 100000, payDate: '2025-08-01' })],
      recordedScholarshipRevenue: 100500.01,
    })
    expect(r.status).toBe('variance')
  })

  it('absolute floor of $1 applies when pct is tiny', () => {
    // total 10. 0.5% = 0.05; abs default 1 wins. recorded 10.9 -> variance 0.9 <= 1.
    const r = reconcileScholarships({
      disbursements: [d({ program: 'FTC', amount: 10, payDate: '2025-08-01' })],
      recordedScholarshipRevenue: 10.9,
    })
    expect(r.status).toBe('matched')
  })

  it('custom tolerances honored', () => {
    const r = reconcileScholarships({
      disbursements: [d({ program: 'FTC', amount: 1000, payDate: '2025-08-01' })],
      recordedScholarshipRevenue: 1100,
      toleranceAbs: 0,
      tolerancePct: 20,
    })
    expect(r.status).toBe('matched') // 100 <= 20% of 1000 = 200
  })
})

describe('reconcileScholarships — anomaly taxonomy', () => {
  it('duplicate: same studentRef + payDate + amount > 1x', () => {
    const dup: Disbursement = { studentRef: 'S1', program: 'FTC', payDate: '2025-08-01', amount: 500 }
    const r = reconcileScholarships({ disbursements: [dup, { ...dup }] })
    const dups = r.anomalies.filter((a) => a.type === 'duplicate')
    expect(dups).toHaveLength(1)
    expect(dups[0].index).toBe(1)
  })

  it('negative_amount and zero_amount', () => {
    const r = reconcileScholarships({
      disbursements: [
        d({ program: 'FTC', amount: -10, payDate: '2025-08-01', studentRef: 'a' }),
        d({ program: 'FTC', amount: 0, payDate: '2025-08-01', studentRef: 'b' }),
      ],
    })
    expect(r.anomalies.some((a) => a.type === 'negative_amount' && a.index === 0)).toBe(true)
    expect(r.anomalies.some((a) => a.type === 'zero_amount' && a.index === 1)).toBe(true)
  })

  it('date_outside_period before start and after end', () => {
    const r = reconcileScholarships({
      ...PERIOD,
      disbursements: [
        d({ program: 'FTC', amount: 10, payDate: '2025-06-30', studentRef: 'a' }),
        d({ program: 'FTC', amount: 10, payDate: '2026-07-01', studentRef: 'b' }),
        d({ program: 'FTC', amount: 10, payDate: '2025-08-01', studentRef: 'c' }),
      ],
    })
    const out = r.anomalies.filter((a) => a.type === 'date_outside_period')
    expect(out.map((a) => a.index)).toEqual([0, 1])
  })

  it('unknown_program for null and invalid', () => {
    const r = reconcileScholarships({
      disbursements: [
        d({ program: null, amount: 10, payDate: '2025-08-01' }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        d({ program: 'BOGUS' as any, amount: 10, payDate: '2025-08-01' }),
      ],
    })
    expect(r.anomalies.filter((a) => a.type === 'unknown_program')).toHaveLength(2)
  })

  it('missing_amount when amount is not finite, excluded from total', () => {
    const r = reconcileScholarships({
      disbursements: [
        d({ program: 'FTC', amount: 100, payDate: '2025-08-01' }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        d({ program: 'FTC', amount: NaN as any, payDate: '2025-08-01' }),
      ],
    })
    expect(r.totalDisbursed).toBe(100)
    expect(r.count).toBe(1)
    expect(r.anomalies.some((a) => a.type === 'missing_amount' && a.index === 1)).toBe(true)
  })

  it('anomalies sorted by taxonomy then index', () => {
    const r = reconcileScholarships({
      ...PERIOD,
      disbursements: [
        d({ program: null, amount: -5, payDate: '2025-06-01', studentRef: 'a' }), // unknown + negative + out-of-period
      ],
    })
    const types = r.anomalies.map((a) => a.type)
    // taxonomy order: duplicate, negative_amount, zero_amount, date_outside_period, unknown_program, missing_amount
    expect(types).toEqual(['negative_amount', 'date_outside_period', 'unknown_program'])
  })
})

describe('reconcileScholarships — edge cases + determinism', () => {
  it('empty list', () => {
    const r = reconcileScholarships({ disbursements: [] })
    expect(r.totalDisbursed).toBe(0)
    expect(r.count).toBe(0)
    expect(r.byProgram).toEqual([])
    expect(r.byMonth).toEqual([])
    expect(r.anomalies).toEqual([])
    expect(r.status).toBe('needs_data')
  })

  it('never throws on garbage input', () => {
    expect(() =>
      reconcileScholarships({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        disbursements: [null as any, { amount: 'x' } as any, undefined as any],
      }),
    ).not.toThrow()
  })

  it('variancePct null when total is 0', () => {
    const r = reconcileScholarships({ disbursements: [], recordedScholarshipRevenue: 100 })
    expect(r.variance).toBe(100)
    expect(r.variancePct).toBeNull()
    expect(r.status).toBe('variance')
  })

  it('deterministic: same input -> identical result', () => {
    const input: ReconciliationInput = {
      ...PERIOD,
      recordedScholarshipRevenue: 300000,
      disbursements: [
        d({ program: 'FTC', amount: 150000, payDate: '2025-08-01', studentRef: 'a' }),
        d({ program: 'FES_UA', amount: 150000, payDate: '2025-09-01', studentRef: 'b' }),
        d({ program: 'FTC', amount: 150000, payDate: '2025-08-01', studentRef: 'a' }), // dup
      ],
    }
    const a = reconcileScholarships(input)
    const b = reconcileScholarships(input)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('does not mutate the input array', () => {
    const input: ReconciliationInput = {
      disbursements: [d({ program: 'FTC', amount: 10, payDate: '2025-08-01' })],
    }
    const before = JSON.stringify(input)
    reconcileScholarships(input)
    expect(JSON.stringify(input)).toBe(before)
  })

  it('the DoD scenario: FTC+FES_UA summing 300000 w/ dup, negative, out-of-period, unknown', () => {
    const r = reconcileScholarships({
      ...PERIOD,
      recordedScholarshipRevenue: 300000,
      disbursements: [
        d({ program: 'FTC', amount: 150000, payDate: '2025-08-15', studentRef: 'S1' }),
        d({ program: 'FES_UA', amount: 150000, payDate: '2025-09-15', studentRef: 'S2' }),
        d({ program: 'FTC', amount: 150000, payDate: '2025-08-15', studentRef: 'S1' }), // duplicate
        d({ program: 'FTC', amount: -150000, payDate: '2025-10-01', studentRef: 'S3' }), // negative (offsets)
        d({ program: 'FTC', amount: 150000, payDate: '2024-01-01', studentRef: 'S4' }), // out-of-period
        d({ program: null, amount: -150000, payDate: '2025-11-01', studentRef: 'S5' }), // unknown + negative
      ],
    })
    expect(r.totalDisbursed).toBe(300000)
    expect(r.status).toBe('matched')
    const present = new Set(r.anomalies.map((a) => a.type))
    expect(present.has('duplicate')).toBe(true)
    expect(present.has('negative_amount')).toBe(true)
    expect(present.has('date_outside_period')).toBe(true)
    expect(present.has('unknown_program')).toBe(true)

    const v = reconcileScholarships({
      ...PERIOD,
      recordedScholarshipRevenue: 250000,
      disbursements: [d({ program: 'FTC', amount: 300000, payDate: '2025-08-15', studentRef: 'S1' })],
    })
    expect(v.status).toBe('variance')
    expect(v.variance).toBe(-50000)
  })
})
