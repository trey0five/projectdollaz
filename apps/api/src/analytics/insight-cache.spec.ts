import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_CHART } from '@finrep/engine'
import type { MetricResult } from '@finrep/analytics'
import { InsightService } from './insight.service.js'
import { clearPeriodInsights } from './insight-cache.js'
import { StatementsService } from '../statements/statements.service.js'
import { ImportsService } from '../imports/imports.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// The saved KYRO insight follows the data (live report 2026-10-15, Verify Test
// School): a P&L saved alone, then the full P&L + BS pair for the same period,
// left "Days Cash on Hand is a risk at 0 days" beside 152 days; a review-popup
// Approve (mapping merge → period rebuild) left "Not enough data…".
// ─────────────────────────────────────────────────────────────────────────────

const metric = (over: Partial<MetricResult>): MetricResult =>
  ({
    key: 'days_cash_on_hand',
    label: 'Days Cash on Hand',
    unit: 'days',
    value: 0,
    available: true,
    status: 'risk',
    goodDirection: 'higher',
    periodOverPeriodDelta: null,
    ...over,
  }) as MetricResult

/** InsightService over an in-memory period_insights row + a swappable metrics source. */
function insightHarness() {
  let row: { fingerprint: string; text: string; source: string } | null = null
  const state = {
    metrics: [metric({ value: 0, status: 'risk' })],
    dataAsOf: '2026-10-15T10:00:00.000Z',
  }
  const analytics = {
    computeMetricsResponse: vi.fn(async () => ({
      periodId: 'p1',
      label: 'FY 2026',
      periodEndDate: '2026-06-30',
      metrics: state.metrics,
      freshness: { dataAsOf: state.dataAsOf, periodEndDate: '2026-06-30' },
    })),
  }
  const prisma = {
    periodInsight: {
      findUnique: vi.fn(async () => row),
      upsert: vi.fn(async (args: { create: { fingerprint: string; text: string; source: string } }) => {
        row = { ...args.create }
        return row
      }),
    },
  }
  // No LLM configured → deterministic tagged rule text.
  const svc = new InsightService(analytics as never, { get: () => undefined } as never, prisma as never, {} as never)
  return { svc, state, prisma }
}

describe('InsightService cache follows the snapshot', () => {
  it('★ re-saving a period with different numbers yields a fresh insight', async () => {
    const { svc, state, prisma } = insightHarness()
    const first = await svc.insightFor('s1', 'p1')
    expect(first.text).toMatch(/^\[RISK\] Days Cash on Hand is a risk at 0 days/)

    // The P&L + Balance Sheet pair lands: a new snapshot, real cash.
    state.metrics = [metric({ value: 152, status: 'good' })]
    state.dataAsOf = '2026-10-15T10:00:05.000Z'
    const second = await svc.insightFor('s1', 'p1')
    expect(second.text).toBe('[STRENGTH] Days Cash on Hand is healthy at 152 days.')
    expect(second.dataAsOf).toBe('2026-10-15T10:00:05.000Z')
    expect(prisma.periodInsight.upsert).toHaveBeenCalledTimes(2)
  })

  it('★ a rebuilt snapshot (remap) misses the cache even when the metric values match', async () => {
    const { svc, state, prisma } = insightHarness()
    await svc.insightFor('s1', 'p1')
    state.dataAsOf = '2026-10-15T11:00:00.000Z' // mapping merge → period rebuild
    await svc.insightFor('s1', 'p1')
    expect(prisma.periodInsight.upsert).toHaveBeenCalledTimes(2)
  })

  it('★ an unchanged period still hits the cache', async () => {
    const { svc, prisma } = insightHarness()
    const a = await svc.insightFor('s1', 'p1')
    const b = await svc.insightFor('s1', 'p1')
    expect(b).toEqual(a)
    expect(prisma.periodInsight.upsert).toHaveBeenCalledTimes(1)
  })
})

describe('clearPeriodInsights', () => {
  it('clears the period and every LATER period (their deltas compare against it)', async () => {
    const deleteMany = vi.fn(async () => ({ count: 2 }))
    const end = new Date('2026-06-30')
    await expect(clearPeriodInsights({ periodInsight: { deleteMany } } as never, 's1', 'p1', end)).resolves.toBe(2)
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        schoolId: 's1',
        OR: [{ fiscalPeriodId: 'p1' }, { fiscalPeriod: { periodEndDate: { gt: end } } }],
      },
    })
  })

  it('no period → the whole school; never throws', async () => {
    const deleteMany = vi.fn(async () => ({ count: 0 }))
    await clearPeriodInsights({ periodInsight: { deleteMany } } as never, 's1')
    expect(deleteMany).toHaveBeenCalledWith({ where: { schoolId: 's1' } })
    const boom = { periodInsight: { deleteMany: vi.fn(async () => Promise.reject(new Error('db down'))) } }
    await expect(clearPeriodInsights(boom as never, 's1', 'p1')).resolves.toBe(0)
    await expect(clearPeriodInsights(undefined, 's1')).resolves.toBe(0)
  })
})

// ── Every rebuild goes through StatementsService.generate (the mapping PATCH's
//    rebuild loop, import save/replace, QBO sync, KYRO chat) — it must clear. ──
describe('StatementsService.generate clears the saved insight', () => {
  function make() {
    const period = { id: 'p1', schoolId: 's1', periodEndDate: new Date('2026-06-30') }
    const cy = {
      id: 'i1',
      schoolId: 's1',
      fiscalPeriodId: 'p1',
      role: 'cy',
      createdAt: new Date(),
      rows: [
        { acct: 1000, desc: 'Cash', total: 100000 },
        { acct: 4000, desc: 'Tuition', total: -90000 },
        { acct: 5000, desc: 'Salaries', total: 80000 },
        { acct: 3000, desc: 'Net assets', total: -90000 },
      ],
    }
    const deleteMany = vi.fn(async () => ({ count: 1 }))
    const prisma = {
      school: { findUnique: vi.fn(async () => ({ id: 's1', netAssetsBegin: 0, pyNetAssetsBegin: 0, auditNetAssetsBegin: 0 })) },
      fiscalPeriod: { findMany: vi.fn(async () => [period]) },
      import: { findMany: vi.fn(async () => [cy]), findUnique: vi.fn() },
      statementSnapshot: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'snap1', ...data, createdAt: new Date() })),
      },
      periodInsight: { deleteMany },
    }
    const mapping = {
      ensureActive: vi.fn(async () => ({
        mapping: { version: 'm1' },
        chartVersion: { version: 'c1' },
        chart: DEFAULT_CHART,
      })),
    }
    const svc = new StatementsService(
      prisma as never,
      { write: vi.fn(async () => undefined) } as never,
      { getOwnedPeriod: vi.fn(async () => period) } as never,
      mapping as never,
      { evaluateForPeriod: vi.fn(async () => ({ summary: { counts: {} } })) } as never,
      { reconcileForPeriod: vi.fn(async () => null) } as never,
    )
    return { svc, deleteMany, prisma }
  }

  it('★ a (re)generated snapshot drops the period insight and later periods’', async () => {
    const { svc, deleteMany, prisma } = make()
    await svc.generate({ id: 'u1' } as never, 's1', 'p1', {}, { trigger: 'remap' })
    expect(prisma.statementSnapshot.create).toHaveBeenCalledTimes(1)
    expect(deleteMany).toHaveBeenCalledTimes(1)
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        schoolId: 's1',
        OR: [{ fiscalPeriodId: 'p1' }, { fiscalPeriod: { periodEndDate: { gt: new Date('2026-06-30') } } }],
      },
    })
  })
})

describe('ImportsService.remove — last CY gone → snapshot AND insight cleared', () => {
  it('clears the saved insight with the statements', async () => {
    const deleteMany = vi.fn(async () => ({ count: 1 }))
    const prisma = {
      import: {
        findUnique: vi.fn(async () => ({ id: 'i1', schoolId: 's1', fiscalPeriodId: 'p1', role: 'cy', rowCount: 3, sourceName: 'x' })),
        deleteMany: vi.fn(async () => ({ count: 1 })),
        count: vi.fn(async () => 0),
      },
      statementSnapshot: { deleteMany: vi.fn(async () => ({ count: 1 })) },
      periodInsight: { deleteMany },
    }
    const periods = { getOwnedPeriod: vi.fn(async () => ({ id: 'p1', periodEndDate: new Date('2026-06-30') })) }
    const svc = new ImportsService(prisma as never, { write: vi.fn() } as never, periods as never, {} as never)
    const out = await svc.remove({ id: 'u1' } as never, 's1', 'i1')
    expect(out.snapshot).toBe('cleared')
    expect(deleteMany).toHaveBeenCalledTimes(1)
  })
})
