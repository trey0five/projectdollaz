import { describe, expect, it, vi } from 'vitest'
import { matchMonthColumns } from '../integrations/qbo-company.synth.js'
import {
  QboEventsService,
  AR_AP_WINDOW_DAYS,
  OVERDUE_COLLECTION_DAYS,
  MIN_HISTORY_MONTHS,
} from './qbo-events.service.js'
import { CashFlowService } from './cashflow.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// ZERO MANUAL ENTRY ONLY WORKS IF THE BLEND CANNOT DOUBLE-COUNT.
//
// A QuickBooks-powered forecast layers three derived sources onto whatever the
// school entered by hand. Every rule here exists to keep one dollar from being
// counted twice — the failure mode that draws a trough twice as deep (or half
// as deep) as the truth and looks authoritative doing it.
// ─────────────────────────────────────────────────────────────────────────────

const iso = (d: Date) => d.toISOString().slice(0, 10)

/** A month-columned P&L, QBO-shaped: one Money column per month + Total. */
function monthReport(months: string[], rows: { name: string; group: string; values: number[] }[]) {
  return {
    Columns: {
      Column: [
        { ColTitle: '', ColType: 'Account' },
        ...months.map((m) => ({
          ColTitle: '',
          ColType: 'Money',
          MetaData: [
            { Name: 'StartDate', Value: `${m}-01` },
            { Name: 'EndDate', Value: `${m}-28` },
          ],
        })),
        { ColTitle: 'Total', ColType: 'Money' },
      ],
    },
    Rows: {
      Row: rows.map((r) => ({
        type: 'Section',
        group: r.group,
        Header: { ColData: [{ value: r.group }] },
        Rows: {
          Row: [
            {
              type: 'Data',
              ColData: [
                { value: r.name, id: '77' },
                ...r.values.map((v) => ({ value: String(v) })),
                { value: String(r.values.reduce((a, b) => a + b, 0)) },
              ],
            },
          ],
        },
      })),
    },
  }
}

interface Over {
  connection?: unknown
  items?: { asOf: string; ar: unknown[]; ap: unknown[] } | null
  report?: unknown
  balanceSheet?: unknown
  snapshot?: unknown
}

function makeService(over: Over = {}) {
  const qboService = {
    connectionForSchool: vi.fn(async () =>
      over.connection === undefined
        ? { conn: { realmId: 'r1', environment: 'sandbox' }, token: 't' }
        : over.connection,
    ),
  }
  const aging = { getItems: vi.fn(async () => over.items ?? null) }
  const moduleRef = {
    get: vi.fn((cls: { name: string }) =>
      cls.name === 'QboAgingService' ? aging : qboService,
    ),
  }
  const client = {
    getSummarizedReport: vi.fn(async () => over.report ?? monthReport([], [])),
    getBalanceSheet: vi.fn(async () => over.balanceSheet ?? {}),
  }
  const prisma = {
    cashFlowSnapshot: { findFirst: vi.fn(async () => over.snapshot ?? null) },
  }
  const svc = new QboEventsService(moduleRef as never, prisma as never, client as never)
  return { svc, aging, client, qboService }
}

const AS_OF = '2026-07-01'
const HORIZON = '2027-06-30'
const BASE_OPTS = {
  asOfDate: AS_OF,
  horizonEnd: HORIZON,
  collectionRate: 0.95,
  excludeCategories: [] as string[],
  tuitionDriverActive: false,
}

const invoice = (over: Record<string, unknown> = {}) => ({
  txnId: '1', type: 'Invoice', docNumber: 'INV-1', party: 'Smith Family',
  txnDate: '2026-06-01', dueDate: '2026-08-15', amount: 10_000,
  bucket: 'current', daysOverdue: 0, deepLink: null, dept: null, ...over,
})
const bill = (over: Record<string, unknown> = {}) => ({
  txnId: '9', type: 'Bill', docNumber: 'BILL-9', party: 'Power Co',
  txnDate: '2026-06-20', dueDate: '2026-07-20', amount: 4_000,
  bucket: 'current', daysOverdue: 0, deepLink: null, dept: null, ...over,
})

describe('month columns are matched by their own metadata', () => {
  it('binds StartDate columns to YYYY-MM and excludes the Total column', () => {
    const r = monthReport(['2026-01', '2026-02', '2026-03'], [])
    const m = matchMonthColumns((r.Columns.Column ?? []) as never)
    expect([...m.monthByIndex.values()]).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(m.total).toBe(4)
  })

  it('falls back to "Jan 2026"-style titles, and skips what it cannot read', () => {
    const cols = [
      { ColTitle: '' },
      { ColTitle: 'Jan 2026' },
      { ColTitle: 'mystery' },
      { ColTitle: 'Total' },
    ]
    const m = matchMonthColumns(cols as never)
    expect([...m.monthByIndex.values()]).toEqual(['2026-01'])
    // A column it cannot read is SKIPPED — "no figure", never a wrong one.
    expect(m.monthByIndex.size).toBe(1)
  })
})

describe('AR: invoices become dated receipts at the collection rate', () => {
  it('a future due date IS the event date; the rate haircuts the amount', async () => {
    const { svc } = makeService({ items: { asOf: AS_OF, ar: [invoice()], ap: [] } })
    const r = await svc.eventsFor('s1', BASE_OPTS)
    const ev = r.events.find((e) => e.sourceRef.startsWith('qbo:ar'))!
    expect(ev.date).toBe('2026-08-15')
    expect(ev.amount).toBeCloseTo(10_000 * 0.95, 6)
    expect(ev.confidence).toBe('scheduled')
  })

  it('an OVERDUE invoice lands on the stated two-week assumption, not its dead due date', async () => {
    const { svc } = makeService({
      items: { asOf: AS_OF, ar: [invoice({ dueDate: '2026-05-01', daysOverdue: 61 })], ap: [] },
    })
    const r = await svc.eventsFor('s1', BASE_OPTS)
    const ev = r.events.find((e) => e.sourceRef.startsWith('qbo:ar'))!
    const expected = new Date(`${AS_OF}T00:00:00Z`)
    expected.setUTCDate(expected.getUTCDate() + OVERDUE_COLLECTION_DAYS)
    expect(ev.date).toBe(iso(expected))
  })

  it('the collection rate NEVER touches a bill — a bill is owed in full', async () => {
    const { svc } = makeService({ items: { asOf: AS_OF, ar: [], ap: [bill()] } })
    const r = await svc.eventsFor('s1', { ...BASE_OPTS, collectionRate: 0.5 })
    const ev = r.events.find((e) => e.sourceRef.startsWith('qbo:ap'))!
    expect(ev.amount).toBe(4_000)
    expect(ev.confidence).toBe('committed')
  })
})

describe('seasonal history is modelled honestly', () => {
  const SIX_MONTHS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']
  const HISTORY = monthReport(SIX_MONTHS, [
    { name: 'Utilities', group: 'Expenses', values: [3_000, 3_000, 2_800, 2_500, 2_400, 2_600] },
    { name: 'Aftercare fees', group: 'Income', values: [8_000, 8_000, 7_500, 7_000, 2_000, 500] },
  ])

  it('projects a seasonal year — the profile follows the CALENDAR month', async () => {
    const { svc } = makeService({ report: HISTORY })
    const r = await svc.eventsFor('s1', BASE_OPTS)
    const utils = r.events.filter((e) => e.sourceRef === 'qbo:history:facilCost')
    expect(utils.length).toBeGreaterThan(0)
    expect(utils.every((e) => e.direction === 'out')).toBe(true)
    expect(utils.every((e) => e.confidence === 'modelled')).toBe(true)
    // January's figure lands in January, not in an even twelfth.
    const jan = utils.find((e) => e.date.startsWith('2027-01'))
    expect(jan?.amount).toBeCloseTo(3_000, 6)
  })

  it('refuses with an omission below the minimum history', async () => {
    const short = monthReport(['2026-05', '2026-06'], [
      { name: 'Utilities', group: 'Expenses', values: [3_000, 3_000] },
    ])
    const { svc } = makeService({ report: short })
    const r = await svc.eventsFor('s1', BASE_OPTS)
    expect(r.events.some((e) => e.sourceRef.startsWith('qbo:history'))).toBe(false)
    expect(r.omissions.some((o) => o.key === 'qbo_short_history')).toBe(true)
    expect(MIN_HISTORY_MONTHS).toBeGreaterThan(2)
  })

  it('MANUAL WINS: an excluded category never enters the profile', async () => {
    // The blend's first rule. A school that recorded its own utilities
    // commitment must not also receive utilities modelled from history — that
    // is the same dollar twice.
    const { svc } = makeService({ report: HISTORY })
    const r = await svc.eventsFor('s1', { ...BASE_OPTS, excludeCategories: ['facilCost'] })
    expect(r.events.some((e) => e.sourceRef === 'qbo:history:facilCost')).toBe(false)
    // …while unexcluded categories still flow.
    expect(r.events.some((e) => e.sourceRef.startsWith('qbo:history:'))).toBe(true)
  })

  it('the tuition driver suppresses tuition history', async () => {
    const withTuition = monthReport(SIX_MONTHS, [
      { name: 'Tuition income', group: 'Income', values: [100, 100, 100, 100, 100, 100] },
    ])
    const { svc } = makeService({ report: withTuition })
    const r = await svc.eventsFor('s1', { ...BASE_OPTS, tuitionDriverActive: true })
    expect(r.events.some((e) => e.category === 'tuition')).toBe(false)
  })

  it('modelled RECEIPTS stay out of the AR window — the invoices are the near-term truth', async () => {
    const { svc } = makeService({ report: HISTORY })
    const r = await svc.eventsFor('s1', BASE_OPTS)
    const receipts = r.events.filter(
      (e) => e.direction === 'in' && e.sourceRef.startsWith('qbo:history'),
    )
    const boundary = new Date(`${AS_OF}T00:00:00Z`)
    boundary.setUTCDate(boundary.getUTCDate() + AR_AP_WINDOW_DAYS)
    for (const e of receipts) {
      expect(e.date > iso(boundary)).toBe(true)
    }
  })
})

describe('never throws, never invents', () => {
  it('no connection → empty result, not an error', async () => {
    const { svc } = makeService({ connection: null })
    const r = await svc.eventsFor('s1', BASE_OPTS)
    expect(r.connected).toBe(false)
    expect(r.events).toEqual([])
  })

  it('a QBO failure mid-pull degrades to whatever succeeded — AND says so', async () => {
    // Live-caught on the sandbox: a transient failure returned an empty history
    // family with no omission, so the forecast quietly lost its seasonal year
    // and looked complete.
    const { svc, client } = makeService({ items: { asOf: AS_OF, ar: [invoice()], ap: [] } })
    client.getSummarizedReport = vi.fn(async () => {
      throw new Error('rate limited')
    })
    const r = await svc.eventsFor('s1', BASE_OPTS)
    expect(r.events.some((e) => e.sourceRef.startsWith('qbo:ar'))).toBe(true)
    expect(r.events.some((e) => e.sourceRef.startsWith('qbo:history'))).toBe(false)
    expect(r.omissions.some((o) => o.key === 'qbo_history_unavailable')).toBe(true)
  })

  it('the opening balance is an OFFER with its provenance, never a substitution', async () => {
    const { svc } = makeService({ snapshot: { openingCash: 612_000, updatedAt: new Date('2026-06-30') } })
    const offer = await svc.openingCashOffer('s1', AS_OF)
    // Live pull returned no parseable cash → falls to the snapshot, and says so.
    expect(offer).toMatchObject({ amount: 612_000, source: 'snapshot' })
  })
})

describe('the service blend (CashFlowService + QBO)', () => {
  function blendService(qboResult: unknown) {
    const prisma = {
      cashCommitment: { findMany: vi.fn(async () => []) },
      cashAssumptions: { findUnique: vi.fn(async () => null) },
      cashProjectionRun: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({})) },
      cashFlowSnapshot: { findFirst: vi.fn(async () => null) },
      arApAgingSnapshot: { findFirst: vi.fn(async () => null), count: vi.fn(async () => 0) },
      qboConnection: { findFirst: vi.fn(async () => ({ id: 'q' })) },
      monthlySnapshot: { count: vi.fn(async () => 3) },
      periodBudget: { findFirst: vi.fn(async () => null) },
      periodOperationalData: { findFirst: vi.fn(async () => null) },
    }
    const qboEvents = {
      eventsFor: vi.fn(async () => qboResult),
      openingCashOffer: vi.fn(async () => ({ amount: 500_000, asOf: AS_OF, source: 'live' })),
    }
    const svc = new CashFlowService(prisma as never, qboEvents as never)
    return { svc, qboEvents }
  }

  const QBO_RESULT = {
    events: [
      { date: '2026-08-15', amount: 9_500, direction: 'in', label: 'Collection', category: 'receivables', confidence: 'scheduled', sourceRef: 'qbo:ar:1' },
      { date: '2026-07-20', amount: 4_000, direction: 'out', label: 'Bill', category: 'payables', confidence: 'committed', sourceRef: 'qbo:ap:9' },
    ],
    sources: {
      qbo_ar: { count: 1, total: 9_500 },
      qbo_ap: { count: 1, total: 4_000 },
      qbo_history: { count: 0, total: 0 },
    },
    omissions: [],
    connected: true,
  }

  it('a connected school with ZERO commitments gets a populated forecast and no nagging', async () => {
    // The whole point of the feature. And the "no commitments" omission must
    // NOT fire — for a connected school an empty commitment list is the happy
    // path, and warning about it teaches the reader to ignore the band.
    const { svc } = blendService(QBO_RESULT)
    const r = await svc.project('s1', 'u1', { openingCash: 100_000, asOfDate: AS_OF, horizon: '3m' })
    expect(r.projection!.totalReceipts).toBeCloseTo(9_500, 6)
    expect(r.projection!.totalDisbursements).toBeCloseTo(4_000, 6)
    expect(r.omissions.some((o) => o.key === 'no_commitments')).toBe(false)
    expect(r.dataTier).toBe('high')
    expect(r.dataTierReason).toContain('Live from QuickBooks')
  })

  it('sources reconcile to the projection totals', async () => {
    const { svc } = blendService(QBO_RESULT)
    const r = await svc.project('s1', 'u1', { openingCash: 100_000, asOfDate: AS_OF, horizon: '3m' })
    const sourceTotal = Object.values(r.sources).reduce((t, s2) => t + s2.total, 0)
    expect(sourceTotal).toBeCloseTo(
      r.projection!.totalReceipts + r.projection!.totalDisbursements,
      6,
    )
  })

  it('useQuickBooks: false yields the manual-only forecast', async () => {
    const { svc, qboEvents } = blendService(QBO_RESULT)
    const r = await svc.project('s1', 'u1', {
      openingCash: 100_000, asOfDate: AS_OF, horizon: '3m', useQuickBooks: false,
    })
    expect(qboEvents.eventsFor).not.toHaveBeenCalled()
    expect(r.projection!.totalReceipts).toBe(0)
  })

  it('horizon presets pick the window AND the grain', async () => {
    const { svc } = blendService(QBO_RESULT)
    const m1 = await svc.project('s1', 'u1', { openingCash: 1, asOfDate: AS_OF, horizon: '1m' })
    expect(m1.projection!.granularity).toBe('week')
    expect(m1.projection!.buckets.length).toBeLessThanOrEqual(6)
    const m6 = await svc.project('s1', 'u1', { openingCash: 1, asOfDate: AS_OF, horizon: '6m' })
    expect(m6.projection!.granularity).toBe('month')
    expect(m6.projection!.buckets.length).toBe(6)
    const m12 = await svc.project('s1', 'u1', { openingCash: 1, asOfDate: AS_OF, horizon: '12m' })
    expect(m12.projection!.buckets.length).toBe(12)
    const w13 = await svc.project('s1', 'u1', { openingCash: 1, asOfDate: AS_OF, horizon: '13w' })
    expect(w13.projection!.granularity).toBe('week')
  })
})
