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
  lineAdjustments?: unknown[]
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
    cashFlowLineAdjustment: {
      findMany: vi.fn(async () => over.lineAdjustments ?? []),
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({
        id: 'a1', note: null, overrideAmount: null, ...create,
      })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    arApAgingSnapshot: {
      findFirst: vi.fn(async () => over.aging ?? null),
      count: vi.fn(async () => over.agingCount ?? 0),
    },
    qboConnection: { findFirst: vi.fn(async () => over.qbo ?? null) },
    monthlySnapshot: { count: vi.fn(async () => over.monthlyCount ?? 0) },
    periodBudget: { findFirst: vi.fn(async () => over.budget ?? null) },
    periodOperationalData: { findFirst: vi.fn(async () => over.operational ?? null) },
  }
  // A disconnected QBO source by default — the manual path must stay
  // byte-identical to v1 for a school without QuickBooks.
  const qboEvents = {
    eventsFor: vi.fn(async () => ({
      events: [],
      sources: {
        qbo_ar: { count: 0, total: 0 },
        qbo_ap: { count: 0, total: 0 },
        qbo_history: { count: 0, total: 0 },
      },
      omissions: [],
      connected: false,
    })),
    openingCashOffer: vi.fn(async () => null),
  }
  const svc = new CashFlowService(prisma as never, qboEvents as never)
  return { svc, prisma, created, qboEvents }
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

// A budget spread whose supplies row phases 10k in July + 20k in August —
// sourceRef budget:6200, derivedTotal 30k. The one derived line in these tests.
const SUPPLIES_BUDGET = {
  totalExpenses: 2_000_000,
  lines: {
    spread: {
      fiscalYearStart: '2026-07-01',
      accounts: [
        { acct: '6200', label: 'Supplies', category: 'supplies', section: 'expense', months: [10_000, 20_000] },
      ],
    },
  },
}

describe('line adjustments tune the derived sources', () => {
  it('EXCLUDE drops the line and the ending balance rises by exactly its derived total', async () => {
    const baseline = await makeService({ budget: SUPPLIES_BUDGET }).svc.project('s1', 'u1', {
      openingCash: 100_000, asOfDate: '2026-07-01',
    })
    expect(baseline.projection!.endingBalance).toBe(70_000)

    const { svc } = makeService({
      budget: SUPPLIES_BUDGET,
      lineAdjustments: [{ id: 'a1', sourceRef: 'budget:6200', kind: 'exclude', overrideAmount: null, note: 'One-off, already paid' }],
    })
    const r = await svc.project('s1', 'u1', { openingCash: 100_000, asOfDate: '2026-07-01' })
    // The whole 30k outflow is gone from the arithmetic…
    expect(r.projection!.endingBalance).toBe(100_000)
    expect(r.sources.adjustments).toEqual({ count: 1, total: 30_000 })
    // …but the LINE is still visible, at appliedTotal 0 — a row that vanished
    // could never be un-excluded.
    const flow = r.flows.find((f) => f.sourceRef === 'budget:6200')!
    expect(flow.derivedTotal).toBe(30_000)
    expect(flow.appliedTotal).toBe(0)
    expect(flow.adjustment).toMatchObject({ kind: 'exclude', note: 'One-off, already paid' })
  })

  it('OVERRIDE retotals the group and scales its events proportionally', async () => {
    // 30k derived, overridden to 15k: the July 10k and August 20k events must
    // HALVE, not be replaced by a flat 7.5k each — the phasing is the point.
    const { svc } = makeService({
      budget: SUPPLIES_BUDGET,
      lineAdjustments: [{ id: 'a1', sourceRef: 'budget:6200', kind: 'override', overrideAmount: 15_000, note: null }],
    })
    const r = await svc.project('s1', 'u1', {
      openingCash: 100_000, asOfDate: '2026-07-01', granularity: 'month',
    })
    expect(r.projection!.endingBalance).toBe(85_000)
    const flow = r.flows.find((f) => f.sourceRef === 'budget:6200')!
    expect(flow.derivedTotal).toBe(30_000)
    expect(flow.appliedTotal).toBe(15_000)
    const july = r.projection!.buckets[0]
    const august = r.projection!.buckets[1]
    expect(july.disbursements).toBe(5_000)
    expect(august.disbursements).toBe(10_000)
  })

  it('an adjustment matching nothing is silently inert — a settled invoice is not an error', async () => {
    const { svc, created } = makeService({
      budget: SUPPLIES_BUDGET,
      lineAdjustments: [{ id: 'a1', sourceRef: 'budget:9999', kind: 'exclude', overrideAmount: null, note: null }],
    })
    const r = await svc.project('s1', 'u1', { openingCash: 100_000, asOfDate: '2026-07-01' })
    expect(r.projection!.endingBalance).toBe(70_000)
    expect(r.sources.adjustments).toEqual({ count: 0, total: 0 })
    expect(r.flows.some((f) => f.sourceRef === 'budget:9999')).toBe(false)
    // …and the frozen run does not claim an adjustment that never applied.
    expect(created[0].adjustments).toBeUndefined()
  })

  it('the frozen run copies in the adjustments that ACTUALLY applied', async () => {
    // Same reason the assumptions are copied: the school can clear the
    // adjustment tomorrow, and the run must still explain its own numbers.
    const { svc, created } = makeService({
      budget: SUPPLIES_BUDGET,
      lineAdjustments: [{ id: 'a1', sourceRef: 'budget:6200', kind: 'exclude', overrideAmount: null, note: null }],
    })
    await svc.project('s1', 'u1', { openingCash: 100_000, asOfDate: '2026-07-01' })
    expect(created).toHaveLength(1)
    expect(created[0].adjustments).toMatchObject([
      { id: 'a1', sourceRef: 'budget:6200', kind: 'exclude', derivedTotal: 30_000, appliedTotal: 0 },
    ])
  })

  it('overrideAmount is required iff the kind is override — half an instruction fails loudly', async () => {
    const { svc } = makeService()
    await expect(
      svc.saveAdjustment('s1', 'u1', { sourceRef: 'budget:6200', kind: 'override' }),
    ).rejects.toThrow(/overrideAmount is required/)
    await expect(
      svc.saveAdjustment('s1', 'u1', { sourceRef: 'budget:6200', kind: 'exclude', overrideAmount: 5_000 }),
    ).rejects.toThrow(/only applies/)
  })

  it('re-saving a cleared adjustment REVIVES the row — the unique key must never brick a line', async () => {
    const { svc, prisma } = makeService()
    await svc.saveAdjustment('s1', 'u1', { sourceRef: 'qbo:history:cafeteria', kind: 'exclude' })
    const call = (prisma.cashFlowLineAdjustment.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.where).toEqual({ schoolId_sourceRef: { schoolId: 's1', sourceRef: 'qbo:history:cafeteria' } })
    expect(call.update.active).toBe(true)
  })

  it('removal is tenant-scoped soft delete — a foreign id removes nothing', async () => {
    const { svc, prisma } = makeService()
    await svc.removeAdjustment('s1', 'adj-1')
    const call = (prisma.cashFlowLineAdjustment.updateMany as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.where).toEqual({ id: 'adj-1', schoolId: 's1' })
    expect(call.data).toEqual({ active: false })
  })
})

describe('the sourceRef boundary: only DERIVED lines may be adjusted', () => {
  it('commitment:* is rejected at the DTO — a commitment already has an editor', async () => {
    const { validate } = await import('class-validator')
    const { plainToInstance } = await import('class-transformer')
    const { SaveLineAdjustmentDto } = await import('./dto/save-line-adjustment.dto.js')
    const bad = plainToInstance(SaveLineAdjustmentDto, {
      sourceRef: 'commitment:p1', kind: 'exclude',
    })
    const errors = await validate(bad, { whitelist: true, forbidNonWhitelisted: true })
    expect(errors.length).toBeGreaterThan(0)
    expect(JSON.stringify(errors)).toContain('commitments are edited directly')

    // …while every derived family passes.
    for (const ref of ['qbo:ar:1042', 'qbo:ap:88', 'qbo:history:cafeteria', 'budget:6200', 'driver:tuition']) {
      const ok = plainToInstance(SaveLineAdjustmentDto, { sourceRef: ref, kind: 'exclude' })
      expect(await validate(ok, { whitelist: true, forbidNonWhitelisted: true })).toEqual([])
    }
  })
})

describe('persist:false previews without freezing a run', () => {
  it('a preview writes NOTHING — the archive records decisions, not keystrokes', async () => {
    const { svc, created } = makeService({ budget: SUPPLIES_BUDGET })
    const r = await svc.project('s1', 'u1', {
      openingCash: 100_000, asOfDate: '2026-07-01', persist: false,
    })
    expect(r.projection).not.toBeNull()
    expect(created).toHaveLength(0)
  })

  it('and the DTO actually ADMITS the flag — forbidNonWhitelisted must not 400 previews', async () => {
    const { validate } = await import('class-validator')
    const { plainToInstance } = await import('class-transformer')
    const { ProjectCashDto } = await import('./dto/project-cash.dto.js')
    const dto = plainToInstance(ProjectCashDto, {
      openingCash: 100_000, asOfDate: '2026-07-01', persist: false,
    })
    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([])
  })
})

describe('the flows list — the forecast, grouped into lines a reader can point at', () => {
  it('carries provenance and editability per line', async () => {
    const { svc } = makeService({ commitments: [PAYROLL], budget: SUPPLIES_BUDGET })
    const r = await svc.project('s1', 'u1', { openingCash: 1_000_000, asOfDate: '2026-07-01' })

    // A commitment is the school's own claim, edited directly — never adjusted.
    const payroll = r.flows.find((f) => f.sourceRef === 'commitment:p1')!
    expect(payroll).toMatchObject({
      origin: 'commitment', provenance: 'assumed', editable: 'direct',
      commitmentId: 'p1', direction: 'out', adjustment: null,
    })
    expect(payroll.eventCount).toBeGreaterThan(1) // semimonthly expands
    expect(payroll.appliedTotal).toBe(payroll.derivedTotal)

    // A budget row is derived and adjustable.
    const supplies = r.flows.find((f) => f.sourceRef === 'budget:6200')!
    expect(supplies).toMatchObject({
      origin: 'budget', provenance: 'derived', editable: 'adjustable',
      commitmentId: null, category: 'supplies', confidence: 'modelled',
      derivedTotal: 30_000, eventCount: 2,
      firstDate: '2026-07-31', lastDate: '2026-08-31',
    })

    // Grouped rows, not raw events — and ordered largest first, the order a
    // reader scans a forecast in.
    expect(r.flows.length).toBe(2)
    expect(r.flows[0].sourceRef).toBe('commitment:p1')
  })

  it('a blocked projection returns an EMPTY flows list, not a missing one', async () => {
    const { svc } = makeService()
    const r = await svc.project('s1', 'u1', { openingCash: 1, asOfDate: 'not-a-date' })
    expect(r.blockedReason).not.toBeNull()
    expect(r.flows).toEqual([])
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
it('EVERY injected dependency is available in this module, guards AND providers', async () => {
    // LIVE-CAUGHT TWICE, which is why this parses SOURCE, not runtime metadata.
    // v1: JwtAuthGuard needed TokenService and the API would not boot. v2:
    // QboEventsService constructor-injected QboClient and the API would not
    // boot — a hand-written list had checked the guards and nobody extended it
    // for the new provider. The first replacement walked design:paramtypes and
    // PASSED VACUOUSLY: esbuild does not emit decorator metadata, so the dep
    // list came back empty and the test went green over the exact failure it
    // was written for. Source text does not lie to the transpiler.
    const { readFileSync, readdirSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const { join, dirname } = await import('node:path')
    const { CashFlowModule } = await import('./cashflow.module.js')
    const meta = (m: unknown, k: string) =>
      (Reflect.getMetadata(k, m as object) ?? []) as unknown[]
    const nameOf = (c: unknown) => (c as { name?: string })?.name ?? String(c)

    const available = new Set<string>(meta(CashFlowModule, 'providers').map(nameOf))
    for (const imp of meta(CashFlowModule, 'imports')) {
      for (const x of meta(imp, 'exports')) available.add(nameOf(x))
    }
    for (const g of ['PrismaService', 'ConfigService', 'ModuleRef', 'Reflector']) available.add(g)

    const dir = dirname(fileURLToPath(import.meta.url))
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    const sources = files.map((f) => readFileSync(join(dir, f), 'utf8'))

    const unresolved: string[] = []
    const classes = [...meta(CashFlowModule, 'providers'), ...meta(CashFlowModule, 'controllers')]
    expect(classes.length).toBeGreaterThan(1) // the loop must not be vacuous
    for (const cls of classes) {
      const name = nameOf(cls)
      const src = sources.find((s2) => new RegExp(`export class ${name}\\b`).test(s2))
      if (!src) continue // QboClient's source lives in integrations/ — its deps are ConfigService only
      const body = src.slice(src.indexOf(`export class ${name}`))
      const ctor = /constructor\s*\(([\s\S]*?)\)\s*\{/.exec(body)
      if (!ctor) continue
      for (const raw of ctor[1].split(/,(?![^(]*\))/)) {
        const param = raw.trim()
        if (!param || /@Optional|@Inject/.test(param)) continue
        const m = /:\s*([A-Za-z_$][\w$]*)/.exec(param)
        if (!m) continue
        if (!available.has(m[1])) unresolved.push(`${name} injects ${m[1]}, which nothing provides`)
      }
    }
    expect(unresolved).toEqual([])

    // The guards the controller declares — their own dependencies too.
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
