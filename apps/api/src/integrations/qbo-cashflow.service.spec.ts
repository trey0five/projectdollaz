// Unit tests for the cash-flow + reconciliation ORCHESTRATOR, driven through fakes
// (no Nest, no DB, no live QBO). Pins: the tied happy path (A cash + B net income tie
// off the same TB), a material differs (fires the briefing via detail.material), the
// LOOSE cash-change "expected" verdict that never flips the overall status, the
// months-of-cash runway, the write-through upsert, the empty-clobber guard, graceful
// stale-on-failure, and not-connected. QboService is resolved lazily via ModuleRef.
import { describe, expect, it } from 'vitest'
import { QboCashFlowService } from './qbo-cashflow.service.js'

const MONEY_COLS = { Column: [{ ColType: 'Account' }, { ColType: 'Money' }] }

function cashFlowReport(operating: number, investing: number, financing: number, netChange: number) {
  const sec = (group: string, v: number) => ({
    group,
    Summary: { ColData: [{ value: `Total ${group}` }, { value: String(v) }] },
  })
  return {
    Columns: MONEY_COLS,
    Rows: {
      Row: [
        sec('OperatingActivities', operating),
        sec('InvestingActivities', investing),
        sec('FinancingActivities', financing),
        { ColData: [{ value: 'Net cash increase for period' }, { value: String(netChange) }] },
      ],
    },
  }
}
function plReport(netIncome: number) {
  return { Columns: MONEY_COLS, Rows: { Row: [{ Summary: { ColData: [{ value: 'Net Income' }, { value: String(netIncome) }] } }] } }
}
function bsReport(cash: number) {
  return {
    Columns: MONEY_COLS,
    Rows: { Row: [{ group: 'Bank', Summary: { ColData: [{ value: 'Total Bank' }, { value: String(cash) }] } }] },
  }
}

// A ReportBundle payload with the computed values the recon compares QBO against.
function bundle(opts: { cashEnd: number; netChange: number; netCashChange: number; operating?: number }) {
  return {
    soaResults: { cy: { netChange: opts.netChange } },
    sfpResults: { cy: { cash: opts.cashEnd, restrictedCash: 0 } },
    scf: {
      cashEnd: opts.cashEnd,
      netCashChange: opts.netCashChange,
      operatingCash: opts.operating ?? 0,
      investingCash: 0,
      financingCash: 0,
    },
  }
}

const PERIOD = { id: 'period-1', label: 'FY 2026', periodEndDate: new Date('2026-06-30T00:00:00.000Z') }

interface Overrides {
  connection?: unknown
  cashFlow?: unknown
  pl?: unknown
  bs?: unknown
  snapshot?: unknown // statementSnapshot.findFirst result
  fiscalPeriod?: unknown // fiscalPeriod.findFirst fallback
  storedRow?: unknown // cashFlowSnapshot.findFirst (empty-guard / stale)
}

function makeService(over: Overrides = {}) {
  const calls = { cashFlow: 0, pl: 0, bs: 0, upsert: 0 }
  const conn =
    over.connection === undefined
      ? { conn: { realmId: 'realm-1', environment: 'sandbox', companyName: 'Acme School' }, token: 'tok' }
      : over.connection

  const qbo = { connectionForSchool: async () => conn }
  const client = {
    getCashFlow: async () => {
      calls.cashFlow++
      return over.cashFlow ?? cashFlowReport(-48000, -5000, 12000, -41000)
    },
    getProfitAndLoss: async () => {
      calls.pl++
      return over.pl ?? plReport(75000)
    },
    getBalanceSheet: async () => {
      calls.bs++
      return over.bs ?? bsReport(32000)
    },
  }
  const prisma = {
    statementSnapshot: {
      findFirst: async () =>
        over.snapshot === undefined
          ? { payload: bundle({ cashEnd: 32000, netChange: 75000, netCashChange: -41000, operating: -48000 }), fiscalPeriod: PERIOD }
          : over.snapshot,
    },
    fiscalPeriod: { findFirst: async () => over.fiscalPeriod ?? PERIOD },
    cashFlowSnapshot: {
      upsert: async () => {
        calls.upsert++
        return {}
      },
      findFirst: async () => over.storedRow ?? null,
    },
  }
  const moduleRef = { get: () => qbo }
  const svc = new QboCashFlowService(prisma as never, client as never, moduleRef as never)
  return { svc, calls }
}

describe('QboCashFlowService.getCashFlow', () => {
  it('TIED happy path: A cash + B net income tie off the same TB → status tied, write-through', async () => {
    const { svc, calls } = makeService()
    const res = await svc.getCashFlow('school-1', { refresh: true })
    expect(res.connected).toBe(true)
    expect(res.source).toBe('cashflow')
    expect(res.companyName).toBe('Acme School')
    expect(res.period?.id).toBe('period-1')
    expect(res.cashflow.operating).toBe(-48000)
    expect(res.reconciliation.status).toBe('tied')
    const cash = res.reconciliation.checks.find((c) => c.key === 'cash')
    const ni = res.reconciliation.checks.find((c) => c.key === 'net_income')
    expect(cash?.status).toBe('tied')
    expect(ni?.status).toBe('tied')
    expect(calls.upsert).toBe(1)
  })

  it('months-of-cash runway = openingCash / |monthlyBurn| (32k / 4k = 8 months)', async () => {
    const { svc } = makeService() // operating -48k / 12mo = -4k/mo; BS cash 32k
    const res = await svc.getCashFlow('school-1', { refresh: true })
    expect(res.runway.openingCash).toBe(32000)
    expect(res.runway.monthlyBurn).toBe(-4000)
    expect(res.runway.months).toBe(8)
  })

  it('MATERIAL differs: QBO net income far from computed → status differs + detail.material', async () => {
    let persisted: Record<string, unknown> | null = null
    const { svc } = makeService({ pl: plReport(95000) }) // computed netChange 75000 → $20k gap
    ;(svc as unknown as { prisma: { cashFlowSnapshot: { upsert: (a: { create: Record<string, unknown> }) => Promise<unknown> } } }).prisma.cashFlowSnapshot.upsert =
      async (a) => {
        persisted = a.create
        return {}
      }
    const res = await svc.getCashFlow('school-1', { refresh: true })
    expect(res.reconciliation.status).toBe('differs')
    const ni = res.reconciliation.checks.find((c) => c.key === 'net_income')
    expect(ni?.status).toBe('differs')
    // The persisted detail carries the material flag the briefing gates off.
    const detail = persisted!.detail as { net_income?: { material?: boolean } }
    expect(detail.net_income?.material).toBe(true)
    expect(persisted!.reconStatus).toBe('differs')
    expect(persisted!.netIncomeTie).toBe(false)
  })

  it('LOOSE cash-change gap reads "expected" and does NOT flip the overall status', async () => {
    // A + B tie; only C (cash change) is off (QBO -30000 vs computed scf.netCashChange -41000).
    const { svc } = makeService({ cashFlow: cashFlowReport(-48000, -5000, 12000, -30000) })
    const res = await svc.getCashFlow('school-1', { refresh: true })
    expect(res.reconciliation.status).toBe('tied') // C never changes the verdict
    const c = res.reconciliation.checks.find((k) => k.key === 'cash_change')
    expect(c?.status).toBe('expected')
    expect(c?.note).toBeTruthy()
  })

  it('EMPTY-CLOBBER guard: a degenerate pull with a prior non-null snapshot does NOT upsert', async () => {
    const { svc, calls } = makeService({
      cashFlow: { Rows: { Row: [] } }, // degenerate → parseCashFlow null
      snapshot: { payload: { soaResults: { cy: { netChange: 1 } }, sfpResults: { cy: { cash: 1 } }, scf: null }, fiscalPeriod: PERIOD },
      storedRow: { operating: -48000, netChange: -41000 }, // a good prior snapshot exists
    })
    const res = await svc.getCashFlow('school-1', { refresh: true })
    expect(res.cashflow.operating).toBeNull() // no native report, no SCF → null breakdown
    expect(calls.upsert).toBe(0) // guard kept the prior non-null snapshot
  })

  it('GRACEFUL: a live-pull failure returns the last stored snapshot with stale:true (never throws)', async () => {
    const { svc } = makeService()
    ;(svc as unknown as { client: Record<string, unknown> }).client = {
      getCashFlow: async () => {
        throw new Error('QBO 401')
      },
      getProfitAndLoss: async () => {
        throw new Error('QBO 401')
      },
      getBalanceSheet: async () => {
        throw new Error('QBO 401')
      },
    }
    ;(svc as unknown as { prisma: { cashFlowSnapshot: { findFirst: () => Promise<unknown> } } }).prisma.cashFlowSnapshot.findFirst =
      async () => ({
        source: 'cashflow',
        operating: -48000,
        investing: -5000,
        financing: 12000,
        netChange: -41000,
        openingCash: 32000,
        monthlyBurn: -4000,
        runwayMonths: 8,
        reconStatus: 'tied',
        detail: {},
      })
    const res = await svc.getCashFlow('school-1', { refresh: true })
    expect(res.connected).toBe(true)
    expect(res.stale).toBe(true)
    expect(res.cashflow.operating).toBe(-48000)
    expect(res.reconciliation.status).toBe('tied')
  })

  it('not connected → connected:false', async () => {
    const { svc } = makeService({ connection: null })
    const res = await svc.getCashFlow('school-1', {})
    expect(res.connected).toBe(false)
    expect(res.reconciliation.status).toBe('unknown')
  })
})
