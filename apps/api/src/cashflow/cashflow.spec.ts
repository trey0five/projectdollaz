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

describe('a forecast SAYS what is missing from it', () => {
  it('names absent tuition — the largest receipt a school has', async () => {
    // LIVE-CAUGHT on the first real run. A school with commitments recorded and
    // no budget got every outflow and none of its tuition: a catastrophic-looking
    // trough that was an artefact of missing data, with nothing on screen to say
    // so. A number that looks complete and is not is the worst output here.
    const { svc } = makeService({ commitments: [PAYROLL] })
    const r = await svc.project('s1', 'u1', { openingCash: 100_000, asOfDate: '2026-07-01' })
    const keys = r.omissions.map((o) => o.key)
    expect(keys).toContain('tuition_no_billing_date')
    expect(r.omissions.every((o) => o.message.length > 40)).toBe(true)
  })

  it('says the trough is DEEPER THAN REALITY when a receipt is missing', async () => {
    // The consequence, not just the fact. "Tuition is missing" leaves a reader to
    // work out what that does to the number they are looking at.
    const { svc } = makeService({ commitments: [PAYROLL] })
    const r = await svc.project('s1', 'u1', { openingCash: 100_000, asOfDate: '2026-07-01' })
    expect(r.omissions.some((o) => /deeper than reality/.test(o.message))).toBe(true)
  })

  it('names an empty commitment list — usually most of the outflow', async () => {
    const { svc } = makeService()
    const r = await svc.project('s1', 'u1', { openingCash: 100_000, asOfDate: '2026-07-01' })
    expect(r.omissions.map((o) => o.key)).toContain('no_commitments')
  })

  it('says NOTHING when the forecast is complete', async () => {
    // A permanent warning band teaches a reader to ignore the band.
    const { svc } = makeService({
      commitments: [PAYROLL],
      operational: { enrollment: 300, financialAidTotal: 600_000 },
      assumptions: {
        planMix: { annual: 1, semiannual: 0, monthly10: 0, monthly12: 0 },
        collectionRate: 0.95,
        collectionRateSource: 'entered',
        reserveThreshold: 250_000,
        firstBillingDate: new Date('2026-08-01'),
      },
      budget: {
        totalExpenses: 2_000_000,
        lines: {
          revenue: { tuition: 3_000_000 },
          spread: {
            fiscalYearStart: '2026-07-01',
            accounts: [
              { acct: '6200', label: 'Supplies', category: 'supplies', section: 'expense', months: [10_000] },
            ],
          },
        },
      },
    })
    const r = await svc.project('s1', 'u1', { openingCash: 400_000, asOfDate: '2026-07-01' })
    expect(r.omissions).toEqual([])
    // …and the tuition actually made it in.
    expect(r.projection!.totalReceipts).toBeGreaterThan(0)
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

describe('the briefing stops guessing the shape of the year', () => {
  it('reads REAL monthly phasing from the budget spread', async () => {
    // The cash-consequence step used evenMonths(annual net) — a flat twelfth,
    // which is precisely the assumption that hides a summer trough. The real
    // phasing was already in the database and nothing read it.
    const svcFile = await import('node:fs').then((fs) =>
      fs.readFileSync(
        new URL('../analytics/analytics.service.ts', import.meta.url),
        'utf8',
      ),
    )
    expect(svcFile).toMatch(/const spreadMonthly = monthlyNetFromSpread\(lines\)/)
    expect(svcFile).toMatch(/spreadMonthly \?\? \(driverNet !== null \? evenMonths\(driverNet\) : null\)/)
  })

  it('returns NULL rather than a half-real series', async () => {
    // A partial phasing quietly mixed with a flat one is the worst of both.
    const svcFile = await import('node:fs').then((fs) =>
      fs.readFileSync(
        new URL('../analytics/analytics.service.ts', import.meta.url),
        'utf8',
      ),
    )
    expect(svcFile).toMatch(/return sawAny \? out : null/)
    // Rows the budget excludes from its own totals are excluded here too, or this
    // net would be a second and larger definition of the same figure.
    expect(svcFile).toMatch(/if \(row\.includedInTotals === false\) continue/)
  })
})

describe('module wiring', () => {
  it('EVERY injected dependency is available in this module, guards included', async () => {
    // LIVE-CAUGHT, and the reason this test is not just `await import(...)`.
    // The first version imported the module file, passed, and the API would not
    // boot: "Nest can't resolve dependencies of the JwtAuthGuard". A guard on the
    // controller resolves in THIS module's injector, not the root's, so
    // AuthModule has to be imported for TokenService even though nothing in this
    // folder mentions it. An import-graph check cannot see that.
    const { CashFlowModule } = await import('./cashflow.module.js')
    const meta = (m: unknown, k: string) =>
      (Reflect.getMetadata(k, m as object) ?? []) as unknown[]
    const nameOf = (c: unknown) => (c as { name?: string })?.name ?? String(c)

    const available = new Set<string>(meta(CashFlowModule, 'providers').map(nameOf))
    for (const imp of meta(CashFlowModule, 'imports')) {
      for (const x of meta(imp, 'exports')) available.add(nameOf(x))
    }
    // Global modules the app root provides.
    for (const g of ['PrismaService', 'ConfigService']) available.add(g)

    // The guards the controller declares — their own dependencies must resolve here.
    expect(available.has('TokenService'), 'JwtAuthGuard needs TokenService').toBe(true)
    expect(available.has('BillingService'), 'EntitlementGuard needs BillingService').toBe(true)
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
