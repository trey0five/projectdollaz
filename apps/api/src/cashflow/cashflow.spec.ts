import { describe, expect, it, vi } from 'vitest'
import { CONFIDENCE_CLASSES, RECURRENCES } from '@finrep/analytics'
import { CashFlowService, CONFIDENCE_DISCLAIMER, STALE_OPENING_DAYS } from './cashflow.service.js'
import { CashFlowController } from './cashflow.controller.js'
import { CONFIDENCE_VALUES, RECURRENCE_VALUES } from './dto/save-commitment.dto.js'

// ─────────────────────────────────────────────────────────────────────────────
// THE PROJECTION IS ONLY WORTH SHIPPING IF IT CAN BE TRUSTED.
//
// A cash forecast is acted on: a business manager arranges a line of credit, or
// does not, on the strength of a date this service produced. Every test here
// guards something that would make that date wrong or make it look more certain
// than it is — the two failure modes that end a feature like this permanently.
// ─────────────────────────────────────────────────────────────────────────────

interface Over {
  commitments?: unknown[]
  assumptions?: unknown
  aging?: unknown
  qbo?: unknown
  monthlyCount?: number
  agingCount?: number
  budget?: unknown
  operational?: unknown
  cashFlowSnapshot?: unknown
  lastRun?: unknown
}

function makeService(over: Over = {}) {
  const created: Record<string, unknown>[] = []
  const prisma = {
    cashCommitment: {
      findMany: vi.fn(async () => over.commitments ?? []),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'c1', dayRule: null, notes: null, endDate: null, ...data,
      })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    cashAssumptions: {
      findUnique: vi.fn(async () => over.assumptions ?? null),
      upsert: vi.fn(async () => ({})),
    },
    cashProjectionRun: {
      findFirst: vi.fn(async () => over.lastRun ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data)
        return { id: 'r1', ...data }
      }),
    },
    cashFlowSnapshot: { findFirst: vi.fn(async () => over.cashFlowSnapshot ?? null) },
    arApAgingSnapshot: {
      findFirst: vi.fn(async () => over.aging ?? null),
      count: vi.fn(async () => over.agingCount ?? 0),
    },
    qboConnection: { findFirst: vi.fn(async () => over.qbo ?? null) },
    monthlySnapshot: { count: vi.fn(async () => over.monthlyCount ?? 0) },
    periodBudget: { findFirst: vi.fn(async () => over.budget ?? null) },
    periodOperationalData: { findFirst: vi.fn(async () => over.operational ?? null) },
  }
  const svc = new CashFlowService(prisma as never)
  return { svc, prisma, created }
}

const PAYROLL = {
  id: 'p1', label: 'Payroll', category: 'payroll', direction: 'out', amount: 100_000,
  confidence: 'committed', recurrence: 'semimonthly',
  startDate: new Date('2026-07-15'), endDate: null, dayRule: null, notes: null,
}

describe('the DTO and the engine speak the same language', () => {
  it('every confidence class the engine knows is accepted by the API', () => {
    // A class the engine understands but the DTO rejects is a control the school
    // cannot use.
    expect([...CONFIDENCE_VALUES].sort()).toEqual([...CONFIDENCE_CLASSES].sort())
  })

  it('and no recurrence is accepted that the engine cannot expand', () => {
    // The worse direction: a recurrence the DTO accepts and the engine does not
    // know produces NO events. The commitment appears saved and silently never
    // reaches a forecast.
    expect([...RECURRENCE_VALUES].sort()).toEqual([...RECURRENCES].sort())
  })
})

describe('the opening balance is stated, cross-checked, and aged', () => {
  it('returns the trial-balance figure BESIDE the keyed one, never instead', () => {
    // A school can hold $600k on the balance sheet with $125k available to
    // operations. Substituting one for the other overstates every week that
    // follows, so both travel together.
    const { svc } = makeService({
      lastRun: { openingCash: 125_000, asOfDate: new Date('2026-07-01'), openingSource: 'keyed' },
      cashFlowSnapshot: { openingCash: 600_000 },
    })
    return svc.getOpening('s1', '2026-07-05').then((o) => {
      expect(o.openingCash).toBe(125_000)
      expect(o.tbCash).toBe(600_000)
      expect(o.source).toBe('keyed')
    })
  })

  it('flags a STALE opening balance — a bad start compounds silently', async () => {
    const { svc } = makeService({
      lastRun: { openingCash: 100, asOfDate: new Date('2026-06-01'), openingSource: 'keyed' },
    })
    const fresh = await svc.getOpening('s1', '2026-06-10')
    expect(fresh.ageDays).toBe(9)
    expect(fresh.stale).toBe(false)
    const stale = await svc.getOpening('s1', '2026-08-01')
    expect(stale.ageDays).toBeGreaterThan(STALE_OPENING_DAYS)
    expect(stale.stale).toBe(true)
  })

  it('says nothing rather than guessing when no balance was ever stated', async () => {
    const o = await makeService().svc.getOpening('s1', '2026-07-01')
    expect(o.openingCash).toBeNull()
    expect(o.asOfDate).toBeNull()
    expect(o.stale).toBe(false)
  })
})

describe('data confidence describes the DATA, and says so', () => {
  it('carries the disclaimer verbatim on every projection', async () => {
    // Without it "limited confidence" reads as a verdict on the school's
    // finances. A school with immaculate reserves and no QuickBooks connection is
    // a limited-DATA school in excellent health.
    const { svc } = makeService()
    const r = await svc.project('s1', 'u1', { openingCash: 100_000, asOfDate: '2026-07-01' })
    expect(r.disclaimer).toBe(CONFIDENCE_DISCLAIMER)
    expect(r.disclaimer).toContain('not the financial health of the school')
  })

  it('tiers on what the school actually has', async () => {
    const limited = await makeService().svc.project('s1', 'u1', {
      openingCash: 1, asOfDate: '2026-07-01',
    })
    expect(limited.dataTier).toBe('limited')

    const moderate = await makeService({ monthlyCount: 6 }).svc.project('s1', 'u1', {
      openingCash: 1, asOfDate: '2026-07-01',
    })
    expect(moderate.dataTier).toBe('moderate')

    const high = await makeService({ monthlyCount: 6, qbo: { id: 'q' } }).svc.project('s1', 'u1', {
      openingCash: 1, asOfDate: '2026-07-01',
    })
    expect(high.dataTier).toBe('high')
  })

  it('every tier explains ITSELF — a badge with no reason teaches nothing', async () => {
    for (const over of [{}, { monthlyCount: 3 }, { monthlyCount: 3, qbo: { id: 'q' } }]) {
      const r = await makeService(over).svc.project('s1', 'u1', {
        openingCash: 1, asOfDate: '2026-07-01',
      })
      expect(r.dataTierReason.length).toBeGreaterThan(20)
    }
  })
})

describe('the collection rate is suggested, never applied', () => {
  it('offers a rate derived from aging AND keeps the entered one in force', async () => {
    // The single most consequential assumption in the model. Adopting a derived
    // value silently would be making a judgement call in the school's name.
    const { svc } = makeService({
      aging: { arBuckets: { current: 900_000, d90_plus: 100_000 } },
      assumptions: {
        planMix: { annual: 1, semiannual: 0, monthly10: 0, monthly12: 0 },
        collectionRate: 0.98,
        collectionRateSource: 'entered',
        reserveThreshold: null,
        firstBillingDate: null,
      },
    })
    const a = await svc.getAssumptions('s1')
    expect(a.collectionRate).toBe(0.98)
    expect(a.collectionRateSource).toBe('entered')
    expect(a.collectionRateSuggestion?.rate).toBeCloseTo(0.9, 6)
  })

  it('a suggestion failure never breaks the read', async () => {
    const { svc, prisma } = makeService()
    prisma.arApAgingSnapshot.findFirst = vi.fn(async () => {
      throw new Error('boom')
    })
    await expect(svc.getAssumptions('s1')).resolves.toMatchObject({
      collectionRateSuggestion: null,
    })
  })
})

describe('every run is frozen on creation', () => {
  it('stores the projection even though nothing reads it yet', async () => {
    // Back-testing cannot be added retroactively: without a record of what was
    // forecast when, there is nothing for an actual to be compared against, and
    // the school's own behaviour can never be learned.
    const { svc, created } = makeService()
    await svc.project('s1', 'u1', { openingCash: 100_000, asOfDate: '2026-07-01' })
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({ schoolId: 's1', openingSource: 'keyed', dataTier: 'limited' })
    expect(created[0].result).toBeTruthy()
  })

  it('copies the ASSUMPTIONS into the run', async () => {
    // A run has to stay readable after the school changes its assumptions, or the
    // record explains nothing about why that forecast said what it said.
    const { svc, created } = makeService()
    await svc.project('s1', 'u1', { openingCash: 100_000, asOfDate: '2026-07-01' })
    expect(created[0].assumptions).toBeTruthy()
  })

  it('a failed archive does NOT fail the forecast the user asked for', async () => {
    const { svc, prisma } = makeService()
    prisma.cashProjectionRun.create = vi.fn(async () => {
      throw new Error('disk full')
    })
    const r = await svc.project('s1', 'u1', { openingCash: 100_000, asOfDate: '2026-07-01' })
    expect(r.projection).not.toBeNull()
  })
})

describe('no double counting', () => {
  it('a category covered by a commitment is EXCLUDED from budget phasing', async () => {
    // Payroll counted from both sources draws a trough twice as deep as the
    // truth — worse than no forecast, because it looks authoritative.
    const { svc } = makeService({
      commitments: [PAYROLL],
      budget: {
        totalExpenses: 2_000_000,
        lines: {
          spread: {
            fiscalYearStart: '2026-07-01',
            accounts: [
              { acct: '6100', label: 'Salaries', category: 'payroll', section: 'expense', months: [500_000] },
              { acct: '6200', label: 'Supplies', category: 'supplies', section: 'expense', months: [10_000] },
            ],
          },
        },
      },
    })
    const r = await svc.project('s1', 'u1', {
      openingCash: 1_000_000, asOfDate: '2026-07-01', granularity: 'month',
    })
    const out = r.projection!.totalDisbursements
    // Over the 12-month horizon: 24 semi-monthly payroll runs of 100k = 2.4m,
    // plus the 10k supplies row. The 500k SALARIES row is excluded because a
    // commitment already covers that category — counting it would put the total
    // at 2.91m and draw the trough half a million dollars too deep.
    expect(out).toBeCloseTo(2_410_000, 2)
    expect(out).not.toBeCloseTo(2_910_000, 2)
  })
})

describe('module wiring', () => {
  it('the module resolves — an import CYCLE would fail here', async () => {
    // The ESM import graph is the thing under test: a cycle resolves to a
    // partially-initialised module and the constructor blows up at boot rather
    // than in a test.
    const mod = await import('./cashflow.module.js')
    expect(mod.CashFlowModule).toBeDefined()
  })

  it('the controller delegates without doing arithmetic of its own', async () => {
    const { svc } = makeService()
    const controller = new CashFlowController(svc)
    const r = await controller.project('s1', { id: 'u1' } as never, {
      openingCash: 50_000,
      asOfDate: '2026-07-01',
    })
    expect(r.projection).not.toBeNull()
    expect(r.disclaimer).toBe(CONFIDENCE_DISCLAIMER)
  })
})
