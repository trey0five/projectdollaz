// Live cash-flow + reconciliation — orchestrator for the "Cash & Collections" trust
// check + runway. SIBLING of QboAgingService, same spine:
//   • the /cash PAGE + Penny call getCashFlow() — a live+cached QBO pull (LRU+TTL)
//     that ALSO write-through-persists the snapshot as a side effect (so the
//     briefing's stored row stays fresh);
//   • the BRIEFING never calls this service — it reads the persisted CashFlowSnapshot
//     DIRECTLY via Prisma (the module rule that keeps AnalyticsModule→IntegrationsModule
//     out of the graph). This service OWNS fetch + reconcile + persist + page payload.
//
// Unlike aging (as-of NOW), cash-flow/recon is PERIOD-scoped: the window is the LATEST
// StatementSnapshot's fiscal period (fyStart→periodEnd) so QBO's native reports cover
// the SAME window as the computed statements they're reconciled against. On any
// token/QBO failure getCashFlow returns the last stored snapshot with stale:true + a
// soft note — it NEVER 500s. Topology A only; org-fed / CSV schools get connected:false.
//
// BOOT-SAFETY: QboCashFlowService injects QboService LAZILY via ModuleRef (NOT a
// constructor paramtype — the ESM eval-cycle boot-crash class that hit aging +
// scheduled-sync). qbo.service.ts calls captureCashFlow via ModuleRef the same way.
import { Injectable, Logger } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import type { ReportBundle } from '@finrep/engine'
import { PrismaService } from '../prisma/prisma.service.js'
import { QboService } from './qbo.service.js'
import { QboClient } from './qbo.client.js'
import type { QboEnvironment } from './qbo-gl.js'
import {
  parseCashFlow,
  parseNetIncome,
  parseBalanceSheetCash,
  strongCheck,
  looseCheck,
  fyStartISO,
  monthsElapsedInFy,
  monthlyBurnOf,
  monthsOfCash,
  type CashFlowSections,
  type CheckResult,
} from './qbo-cashflow.js'

// In-memory LRU + TTL (single API container — the drill/aging pattern). refresh bypasses.
const CACHE_MAX = 50
const CACHE_TTL_MS = 10 * 60 * 1000

interface CacheEntry {
  pull: Pull
  expires: number
}

/** One live pull's parsed inputs (the raw material for assembly + reconciliation). */
interface Pull {
  sections: CashFlowSections | null
  qboNetIncome: number | null
  qboEndingCash: number | null
}

/** The reconciled window + the platform's own computed values (from StatementSnapshot). */
interface Window {
  periodId: string
  label: string
  periodEnd: string // ISO YYYY-MM-DD
  fyStart: string // ISO YYYY-MM-DD
  computedCash: number | null
  computedNetIncome: number | null
  computedNetCashChange: number | null
  /** Our own SCF breakdown — the derived-fallback source when QBO's report is degenerate. */
  scfOperating: number | null
  scfInvesting: number | null
  scfFinancing: number | null
  scfNetCashChange: number | null
}

/** A single reconciliation check as surfaced to the page/Penny (contract shape). */
export interface ReconCheck {
  key: 'cash' | 'net_income' | 'cash_change'
  label: string
  qbo: number | null
  computed: number | null
  diff: number | null
  status: 'tied' | 'differs' | 'expected'
  note?: string
}

/** The page + Penny payload (web builds against this EXACT shape — contract §Service). */
export interface CashFlowResponse {
  connected: boolean
  asOf: string | null
  stale: boolean
  source: 'cashflow' | 'computed-scf' | null
  environment: 'sandbox' | 'production'
  companyName: string | null
  period: { id: string; label: string } | null
  cashflow: { operating: number | null; investing: number | null; financing: number | null; netChange: number | null }
  runway: { openingCash: number | null; monthlyBurn: number | null; months: number | null }
  reconciliation: { status: 'tied' | 'differs' | 'unknown'; checks: ReconCheck[] }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

@Injectable()
export class QboCashFlowService {
  private readonly logger = new Logger(QboCashFlowService.name)
  private readonly cache = new Map<string, CacheEntry>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: QboClient,
    // QboService ⇄ QboCashFlowService is a mutual dependency. A constructor injection
    // (even with forwardRef) crashes at MODULE LOAD: emitDecoratorMetadata emits the
    // paramtype as a value at class-definition time, and under ESM one class is still
    // in the temporal dead zone when the other evaluates. So we resolve QboService
    // LAZILY via ModuleRef at call time (never at class-eval) — the ONLY shape that
    // boots in both load orders (the exact pattern QboAgingService uses).
    private readonly moduleRef: ModuleRef,
  ) {}

  /** Lazily resolve QboService (breaks the eval-time import cycle — see the ctor note). */
  private qboService(): QboService {
    return this.moduleRef.get(QboService, { strict: false })
  }

  /**
   * The Cash & Collections cash-flow + reconciliation payload: a live+cached QBO pull
   * (native CashFlow breakdown + BS/P&L reconciliation comparands), reconciled against
   * the platform's own computed statements, write-through persisted. On token/QBO
   * failure returns the last stored snapshot with stale:true + a soft note — never
   * throws. Not-connected / org-fed → connected:false. `refresh` bypasses the cache.
   */
  async getCashFlow(schoolId: string, opts: { refresh?: boolean } = {}): Promise<CashFlowResponse> {
    const connection = await this.qboService().connectionForSchool(schoolId)
    if (!connection) return this.disconnected()
    const { conn, token } = connection
    const env: QboEnvironment = conn.environment === 'production' ? 'production' : 'sandbox'

    try {
      const win = await this.resolveWindow(schoolId)
      if (!win) {
        // Connected but no fiscal period to key/window a capture — pull as-of today's
        // FY for the breakdown, reconStatus unknown, NOT persisted (no period key).
        const today = new Date().toISOString().slice(0, 10)
        const fy = fyStartISO(today)
        const pull = await this.pull(schoolId, conn.realmId, token, fy, today, opts.refresh === true)
        return this.assemble({ env, companyName: conn.companyName ?? null, win: null, pull, stale: false })
      }
      const pull = await this.pull(schoolId, conn.realmId, token, win.fyStart, win.periodEnd, opts.refresh === true)
      const response = this.assemble({ env, companyName: conn.companyName ?? null, win, pull, stale: false })
      await this.persist(schoolId, conn.realmId, env, win, pull, 'page', response).catch((e) =>
        this.logger.warn(`cash-flow write-through persist failed for ${schoolId}: ${errMsg(e)}`),
      )
      return response
    } catch (e) {
      this.logger.warn(`cash-flow live pull failed for ${schoolId}: ${errMsg(e)}`)
      return this.staleFromStore(schoolId, env, conn.companyName ?? null)
    }
  }

  /**
   * Best-effort capture at QBO sync time (captured_via:'sync'). The CALLER
   * (QboService.captureCashFlow) wraps this in try/catch so a failing cash-flow pull
   * or persist never aborts the TB sync.
   */
  async captureFromSync(schoolId: string, conn: { realmId: string; environment: string }): Promise<void> {
    const connection = await this.qboService().connectionForSchool(schoolId)
    if (!connection) return
    const token = connection.token
    const env: QboEnvironment = conn.environment === 'production' ? 'production' : 'sandbox'
    const win = await this.resolveWindow(schoolId)
    if (!win) return // no fiscal period → nothing to key a period-scoped capture on
    const pull = await this.pull(schoolId, conn.realmId, token, win.fyStart, win.periodEnd, true)
    const response = this.assemble({ env, companyName: connection.conn.companyName ?? null, win, pull, stale: false })
    await this.persist(schoolId, conn.realmId, env, win, pull, 'sync', response)
  }

  // ── Live pull (cached) ───────────────────────────────────────────────────────
  private async pull(
    schoolId: string,
    realmId: string,
    token: string,
    fyStart: string,
    periodEnd: string,
    refresh: boolean,
  ): Promise<Pull> {
    const key = `${schoolId}|${periodEnd}`
    if (!refresh) {
      const hit = this.cache.get(key)
      if (hit && hit.expires > Date.now()) {
        this.cache.delete(key) // refresh recency (Map keeps insertion order)
        this.cache.set(key, hit)
        return hit.pull
      }
    }
    const [cashFlowRaw, plRaw, bsRaw] = await Promise.all([
      this.client.getCashFlow(realmId, token, fyStart, periodEnd),
      this.client.getProfitAndLoss(realmId, token, fyStart, periodEnd),
      this.client.getBalanceSheet(realmId, token, fyStart, periodEnd),
    ])
    const pull: Pull = {
      sections: parseCashFlow(cashFlowRaw),
      qboNetIncome: parseNetIncome(plRaw),
      qboEndingCash: parseBalanceSheetCash(bsRaw),
    }
    this.store(key, pull)
    return pull
  }

  private store(key: string, pull: Pull): void {
    this.cache.set(key, { pull, expires: Date.now() + CACHE_TTL_MS })
    if (this.cache.size > CACHE_MAX) {
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) this.cache.delete(oldest)
    }
  }

  // ── Window resolution (Prisma-direct — no AnalyticsModule dep) ────────────────
  /**
   * The reconciled window: the LATEST StatementSnapshot's fiscal period (fyStart→
   * periodEnd) + the platform's own computed values (soaResults/sfpResults/scf). When
   * there is no snapshot but a fiscal period exists, window it (reconStatus unknown,
   * no computed comparands). null → no fiscal period at all.
   */
  private async resolveWindow(schoolId: string): Promise<Window | null> {
    const snap = await this.prisma.statementSnapshot
      .findFirst({ where: { schoolId }, orderBy: { createdAt: 'desc' }, include: { fiscalPeriod: true } })
      .catch(() => null)
    let period: { id: string; label: string; periodEndDate: Date } | null = snap?.fiscalPeriod ?? null
    let bundle: ReportBundle | null = null
    if (snap) bundle = snap.payload as unknown as ReportBundle
    if (!period) {
      const fp = await this.prisma.fiscalPeriod
        .findFirst({ where: { schoolId }, orderBy: { periodEndDate: 'desc' } })
        .catch(() => null)
      period = fp ?? null
    }
    if (!period) return null

    const periodEnd = period.periodEndDate.toISOString().slice(0, 10)
    const soa = bundle?.soaResults?.cy
    const sfp = bundle?.sfpResults?.cy
    const scf = bundle?.scf ?? null
    // Computed cash = scf.cashEnd (total cash across all cash accts, incl. restricted —
    // lines up with QBO's total Bank); fall back to SFP cash + restrictedCash.
    const computedCash =
      typeof scf?.cashEnd === 'number'
        ? round2(scf.cashEnd)
        : sfp
          ? round2((sfp.cash ?? 0) + (sfp.restrictedCash ?? 0))
          : null
    return {
      periodId: period.id,
      label: period.label,
      periodEnd,
      fyStart: fyStartISO(periodEnd),
      computedCash,
      computedNetIncome: typeof soa?.netChange === 'number' ? round2(soa.netChange) : null,
      computedNetCashChange: typeof scf?.netCashChange === 'number' ? round2(scf.netCashChange) : null,
      scfOperating: typeof scf?.operatingCash === 'number' ? round2(scf.operatingCash) : null,
      scfInvesting: typeof scf?.investingCash === 'number' ? round2(scf.investingCash) : null,
      scfFinancing: typeof scf?.financingCash === 'number' ? round2(scf.financingCash) : null,
      scfNetCashChange: typeof scf?.netCashChange === 'number' ? round2(scf.netCashChange) : null,
    }
  }

  // ── Assembly (breakdown + reconciliation + runway) ────────────────────────────
  private assemble(args: {
    env: QboEnvironment
    companyName: string | null
    win: Window | null
    pull: Pull
    stale: boolean
  }): CashFlowResponse {
    const { env, companyName, win, pull } = args
    const breakdown = this.breakdown(win, pull)
    const checks = win ? this.reconChecks(win, pull) : []
    const reconStatus = win ? overallStatus(checks, win) : 'unknown'
    const runway = this.runway(win, pull, breakdown.operating)
    return {
      connected: true,
      asOf: win ? win.periodEnd : null,
      stale: args.stale,
      source: breakdown.source,
      environment: env,
      companyName,
      period: win ? { id: win.periodId, label: win.label } : null,
      cashflow: {
        operating: breakdown.operating,
        investing: breakdown.investing,
        financing: breakdown.financing,
        netChange: breakdown.netChange,
      },
      runway,
      reconciliation: { status: reconStatus, checks: checks.map(toReconCheck) },
    }
  }

  /** The breakdown: native CashFlow if parseable, else derived from our own SCF. */
  private breakdown(
    win: Window | null,
    pull: Pull,
  ): { operating: number | null; investing: number | null; financing: number | null; netChange: number | null; source: CashFlowResponse['source'] } {
    const s = pull.sections
    if (s && (s.operating != null || s.investing != null || s.financing != null || s.netChange != null)) {
      return { operating: s.operating, investing: s.investing, financing: s.financing, netChange: s.netChange, source: 'cashflow' }
    }
    // Derived fallback — build the breakdown from the platform's own SCF payload.
    if (win && (win.scfOperating != null || win.scfInvesting != null || win.scfFinancing != null)) {
      return {
        operating: win.scfOperating,
        investing: win.scfInvesting,
        financing: win.scfFinancing,
        netChange: win.scfNetCashChange,
        source: 'computed-scf',
      }
    }
    return { operating: null, investing: null, financing: null, netChange: null, source: null }
  }

  /** The comparable reconciliation checks. NET INCOME is the sole STRONG tie (same P&L
   *  → must match, and it's the real "our numbers vs QuickBooks" signal). CASH balance is
   *  LOOSE/informational: our acct-100 cash can legitimately include undeposited/restricted
   *  funds that QuickBooks' balance-sheet cash line excludes — a scope difference, not an
   *  error, so it's shown for transparency but never fires the briefing. C (net change) is
   *  LOOSE for the synthesized-SCF reason. */
  private reconChecks(win: Window, pull: Pull): CheckResult[] {
    const out: CheckResult[] = []
    if (pull.qboNetIncome != null && win.computedNetIncome != null) {
      out.push(strongCheck('net_income', 'Net income', pull.qboNetIncome, win.computedNetIncome))
    }
    if (pull.qboEndingCash != null && win.computedCash != null) {
      out.push(
        looseCheck(
          'cash',
          'Cash balance',
          pull.qboEndingCash,
          win.computedCash,
          "QuickBooks' balance-sheet cash may exclude undeposited or restricted funds that our statements count as cash — a difference in scope, not an error.",
        ),
      )
    }
    // LOOSE — only when we have a NATIVE CashFlow net-change (never off the derived SCF,
    // which would be comparing our SCF to itself).
    const qboChange = pull.sections?.netChange ?? null
    if (qboChange != null && win.computedNetCashChange != null) {
      out.push(looseCheck('cash_change', 'Net change in cash', qboChange, win.computedNetCashChange))
    }
    return out
  }

  /** openingCash = QBO ending cash; monthlyBurn = operating ÷ months; months = runway. */
  private runway(win: Window | null, pull: Pull, operating: number | null): CashFlowResponse['runway'] {
    const openingCash = pull.qboEndingCash ?? null
    const monthsElapsed = win ? monthsElapsedInFy(win.fyStart, win.periodEnd) : 0
    const monthlyBurn = win ? monthlyBurnOf(operating, monthsElapsed) : null
    const months = monthsOfCash(openingCash, monthlyBurn)
    return { openingCash, monthlyBurn, months }
  }

  private disconnected(): CashFlowResponse {
    return {
      connected: false,
      asOf: null,
      stale: false,
      source: null,
      environment: 'sandbox',
      companyName: null,
      period: null,
      cashflow: { operating: null, investing: null, financing: null, netChange: null },
      runway: { openingCash: null, monthlyBurn: null, months: null },
      reconciliation: { status: 'unknown', checks: [] },
    }
  }

  // ── Persistence ───────────────────────────────────────────────────────────────
  private async persist(
    schoolId: string,
    realmId: string,
    env: QboEnvironment,
    win: Window,
    pull: Pull,
    capturedVia: 'sync' | 'page' | 'penny',
    response: CashFlowResponse,
  ): Promise<void> {
    // Empty-clobber guard (aging's "all-zero ≠ no data" rule): if this capture produced
    // NO breakdown (degenerate CashFlow AND no SCF) but a prior snapshot for this school
    // has real figures, keep the good one rather than overwriting it with nulls.
    const cf = response.cashflow
    const empty =
      cf.operating == null && cf.investing == null && cf.financing == null && cf.netChange == null
    if (empty) {
      const prior = await this.prisma.cashFlowSnapshot
        .findFirst({ where: { schoolId }, orderBy: { capturedAt: 'desc' } })
        .catch(() => null)
      if (prior && (prior.operating != null || prior.netChange != null)) {
        this.logger.warn(`cash-flow capture for ${schoolId} was empty; kept prior non-null snapshot`)
        return
      }
    }

    const checks = this.reconChecks(win, pull)
    const byKey = (k: CheckResult['key']) => checks.find((c) => c.key === k) ?? null
    const cash = byKey('cash')
    const ni = byKey('net_income')
    const change = byKey('cash_change')
    const data = {
      realmId,
      environment: env,
      source: response.source ?? 'cashflow',
      capturedVia,
      operating: cf.operating,
      investing: cf.investing,
      financing: cf.financing,
      netChange: cf.netChange,
      openingCash: response.runway.openingCash,
      monthlyBurn: response.runway.monthlyBurn,
      runwayMonths: response.runway.months,
      reconStatus: response.reconciliation.status,
      cashDiff: cash?.diff ?? null,
      netIncomeDiff: ni?.diff ?? null,
      cashChangeDiff: change?.diff ?? null,
      cashTie: cash ? cash.status === 'tied' : null,
      netIncomeTie: ni ? ni.status === 'tied' : null,
      detail: {
        cash: cash ? detailOf(cash) : null,
        net_income: ni ? detailOf(ni) : null,
        cash_change: change ? detailOf(change) : null,
      } as unknown as object,
      capturedAt: new Date(),
    }
    await this.prisma.cashFlowSnapshot.upsert({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: win.periodId } },
      create: { schoolId, fiscalPeriodId: win.periodId, ...data },
      update: data,
    })
  }

  /** Return the last stored snapshot as a stale response (graceful degrade, no 500). */
  private async staleFromStore(
    schoolId: string,
    env: QboEnvironment,
    companyName: string | null,
  ): Promise<CashFlowResponse> {
    const row = await this.prisma.cashFlowSnapshot
      .findFirst({ where: { schoolId }, orderBy: { capturedAt: 'desc' } })
      .catch(() => null)
    if (!row) {
      // Connected but never captured (and the live pull just failed) — connected:true,
      // empty, with a soft note so the page can prompt a refresh instead of erroring.
      return {
        ...this.disconnected(),
        connected: true,
        stale: true,
        environment: env,
        companyName,
      }
    }
    const detail = (row.detail ?? {}) as Record<string, ReconDetail | null>
    const checks: ReconCheck[] = (['cash', 'net_income', 'cash_change'] as const)
      .map((k) => detail[k])
      .filter((d): d is ReconDetail => d != null)
      .map((d) => ({ key: d.key, label: d.label, qbo: d.qbo, computed: d.computed, diff: d.diff, status: d.status, ...(d.note ? { note: d.note } : {}) }))
    return {
      connected: true,
      asOf: null,
      stale: true,
      source: (row.source as CashFlowResponse['source']) ?? null,
      environment: env,
      companyName,
      period: null,
      cashflow: {
        operating: row.operating,
        investing: row.investing,
        financing: row.financing,
        netChange: row.netChange,
      },
      runway: { openingCash: row.openingCash, monthlyBurn: row.monthlyBurn, months: row.runwayMonths },
      reconciliation: { status: (row.reconStatus as 'tied' | 'differs' | 'unknown') ?? 'unknown', checks },
    }
  }
}

/** Overall recon status: tied (A&B tie) / differs (A or B differs) / unknown (no strong check). */
function overallStatus(checks: CheckResult[], _win: Window): 'tied' | 'differs' | 'unknown' {
  // Net income is the sole STRONG tie; cash is now loose (scope-sensitive) and can't
  // flip the badge — only a net-income break means "books don't reconcile."
  const strong = checks.filter((c) => c.key === 'net_income')
  if (strong.length === 0) return 'unknown'
  return strong.some((c) => c.status === 'differs') ? 'differs' : 'tied'
}

/** The page/Penny check projection (strips the internal `material` flag). */
function toReconCheck(c: CheckResult): ReconCheck {
  return { key: c.key, label: c.label, qbo: c.qbo, computed: c.computed, diff: c.diff, status: c.status, ...(c.note ? { note: c.note } : {}) }
}

interface ReconDetail {
  key: 'cash' | 'net_income' | 'cash_change'
  label: string
  qbo: number
  computed: number
  diff: number
  status: 'tied' | 'differs' | 'expected'
  note?: string
  material?: boolean
}

/** The persisted per-check detail (carries `material` so the briefing can gate off it). */
function detailOf(c: CheckResult): ReconDetail {
  return {
    key: c.key,
    label: c.label,
    qbo: c.qbo,
    computed: c.computed,
    diff: c.diff,
    status: c.status,
    ...(c.note ? { note: c.note } : {}),
    ...(c.material != null ? { material: c.material } : {}),
  }
}
