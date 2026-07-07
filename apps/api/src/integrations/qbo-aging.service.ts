// QuickBooks AR/AP aging — orchestrator for the "Cash & Collections" surface.
//
// Two jobs with OPPOSITE latency/availability needs, kept apart:
//   • the /cash PAGE + Penny call getAging() — a live+cached QBO pull (LRU+TTL, the
//     drill-down pattern) that ALSO write-through-persists the snapshot as a side
//     effect (so the briefing's stored row trends fresh);
//   • the BRIEFING never calls this service — it reads the persisted snapshot DIRECTLY
//     via Prisma (the module rule that keeps AnalyticsModule→IntegrationsModule out of
//     the graph). This service OWNS fetch + persist + page payload.
//
// Token access goes ONLY through QboService.connectionForSchool (the existing refresh-
// and-persist path). On any token/QBO failure getAging returns the last stored
// snapshot with stale:true + a soft note — it NEVER 500s. Topology A only (direct
// per-school connection); org-fed / CSV schools get connected:false.
import { Injectable, Logger } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import type { ReportBundle } from '@finrep/engine'
import { PrismaService } from '../prisma/prisma.service.js'
import { QboService } from './qbo.service.js'
import { OrgQboTokenService } from './qbo-org-token.service.js'
import { QboClient } from './qbo.client.js'
import type { QboEnvironment } from './qbo-gl.js'
import {
  parseAgedDetail,
  parseEntityAging,
  rollupAging,
  type AgingBuckets,
  type AgingItem,
  type AgingParty,
  type AgingRollup,
  type AgingSide,
  type QboOpenEntity,
} from './qbo-aging.js'

const REGISTER_CAP = 25
const TOP_N = 8

// Soft honesty note for an org-fed (Topology B) school: its aging is the org
// company's aged reports sliced to this school's Location(s) via `&department=`.
// Invoices/bills booked at the org level (untagged) or across locations may not appear.
const ORG_FED_AGING_NOTE =
  "Aging reflects invoices/bills tagged to this school's location; interlocation and untagged items may not appear."

// In-memory LRU + TTL (single API container — the drill-service pattern). refresh bypasses.
const CACHE_MAX = 50
const CACHE_TTL_MS = 10 * 60 * 1000

interface PullResult {
  ar: AgingItem[]
  ap: AgingItem[]
  source: 'aging-detail' | 'entity-fallback'
}
interface CacheEntry {
  pull: PullResult
  expires: number
}

/** One register row the /cash table renders (server supplies the deepLink verbatim). */
export interface AgingRow {
  party: string
  type: string
  docNumber: string | null
  dueDate: string | null
  daysOverdue: number
  bucket: AgingItem['bucket']
  amount: number
  deepLink: string | null
}

export interface ArSideResponse {
  total: number
  overdue: number
  accounts: number
  over90: number
  buckets: AgingBuckets
  dso: number | null
  items: AgingRow[]
  top: AgingParty[]
  totalCount: number
}
export interface ApSideResponse {
  total: number
  overdue: number
  dueSoon: number
  buckets: AgingBuckets
  daysPayable: number | null
  items: AgingRow[]
  top: AgingParty[]
  totalCount: number
}

/** The page + Penny payload (web builds against this EXACT shape). */
export interface AgingResponse {
  connected: boolean
  orgFed: boolean
  asOf: string | null
  stale: boolean
  source: 'aging-detail' | 'entity-fallback' | null
  environment: 'sandbox' | 'production'
  companyName: string | null
  /** Soft note set on graceful degradation (stale snapshot after a live failure). */
  note?: string
  ar: ArSideResponse
  ap: ApSideResponse
  /** ar.total − ap.total (net receivable position). */
  net: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
function toRow(it: AgingItem): AgingRow {
  return {
    party: it.party,
    type: it.type,
    docNumber: it.docNumber,
    dueDate: it.dueDate,
    daysOverdue: it.daysOverdue,
    bucket: it.bucket,
    amount: it.amount,
    deepLink: it.deepLink,
  }
}
function zeroBuckets(): AgingBuckets {
  return { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 }
}
function emptyAr(): ArSideResponse {
  return { total: 0, overdue: 0, accounts: 0, over90: 0, buckets: zeroBuckets(), dso: null, items: [], top: [], totalCount: 0 }
}
function emptyAp(): ApSideResponse {
  return { total: 0, overdue: 0, dueSoon: 0, buckets: zeroBuckets(), daysPayable: null, items: [], top: [], totalCount: 0 }
}

@Injectable()
export class QboAgingService {
  private readonly logger = new Logger(QboAgingService.name)
  private readonly cache = new Map<string, CacheEntry>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: QboClient,
    // QboService ⇄ QboAgingService is a mutual dependency. A constructor injection
    // (even with forwardRef) crashes at MODULE LOAD: emitDecoratorMetadata emits the
    // paramtype as a value at class-definition time, and under ESM one class is still
    // in the temporal dead zone when the other evaluates. So we resolve QboService
    // LAZILY via ModuleRef at call time (QboService is only touched inside methods,
    // never at class-eval) — this is the only shape that boots in both load orders.
    private readonly moduleRef: ModuleRef,
  ) {}

  /** Lazily resolve QboService (breaks the eval-time import cycle — see the ctor note). */
  private qboService(): QboService {
    return this.moduleRef.get(QboService, { strict: false })
  }

  /** Lazily resolve the org-token accessor (Topology B). Resolved via ModuleRef — same
   *  discipline as qboService() — so nothing new is materialized as a constructor
   *  paramtype at class-eval time (boot-safety). OrgQboTokenService is a leaf, so this
   *  never drags a heavy subgraph in either. */
  private orgTokenService(): OrgQboTokenService {
    return this.moduleRef.get(OrgQboTokenService, { strict: false })
  }

  /** Today as an ISO 'YYYY-MM-DD' (UTC) — aging is always "as of now". */
  private today(): string {
    return new Date().toISOString().slice(0, 10)
  }

  /**
   * The Cash & Collections payload: a live+cached QBO pull (bucketized, DSO/days-
   * payable, capped register + top parties, write-through persisted). On token/QBO
   * failure returns the last stored snapshot with stale:true + a soft note — never
   * throws. Not-connected / org-fed → connected:false. `refresh` bypasses the cache.
   */
  async getAging(schoolId: string, opts: { refresh?: boolean } = {}): Promise<AgingResponse> {
    const connection = await this.qboService().connectionForSchool(schoolId)
    if (!connection) {
      // No direct connection — try the org company (Topology B, diocesan) sliced to
      // this school's Location(s). Falls back to the honest disconnected/orgFed panel.
      return this.orgFedAging(schoolId, opts)
    }
    const { conn, token } = connection
    const env: QboEnvironment = conn.environment === 'production' ? 'production' : 'sandbox'
    const asOf = this.today()

    try {
      const pull = await this.pull(schoolId, conn.realmId, token, asOf, env, opts.refresh === true)
      const arRoll = rollupAging(pull.ar, TOP_N)
      const apRoll = rollupAging(pull.ap, TOP_N)
      const flows = await this.annualFlows(schoolId)
      const response = this.assemble({
        connected: true,
        orgFed: false,
        asOf,
        stale: false,
        source: pull.source,
        env,
        companyName: conn.companyName ?? null,
        arRoll,
        apRoll,
        annualRevenue: flows?.revenue ?? null,
        annualExpense: flows?.expense ?? null,
      })
      // Write-through persist (best-effort — a persist failure must not fail the page).
      await this.persist(schoolId, conn.realmId, env, asOf, 'page', response, arRoll, apRoll).catch((e) =>
        this.logger.warn(`aging write-through persist failed for ${schoolId}: ${errMsg(e)}`),
      )
      return response
    } catch (e) {
      this.logger.warn(`aging live pull failed for ${schoolId}: ${errMsg(e)}`)
      return this.staleFromStore(schoolId, env, conn.companyName ?? null)
    }
  }

  /**
   * Topology B (diocesan) aging: resolve the ORG company's token + this school's
   * mapped Location(s) and pull the aged reports FILTERED to `&department=<ids>`
   * (QBO honours this — live-probed). Flips connected:true ONLY when the filtered
   * pull actually returned attributed items (never a wrong whole-company slice); a
   * soft note explains that untagged/interlocation items may not appear. When the
   * school maps only to "__unspecified__" (no id to filter by) or the slice is empty,
   * keeps the honest orgFed panel. On a live failure, degrades to this school's last
   * stored snapshot (never a throw).
   */
  private async orgFedAging(schoolId: string, opts: { refresh?: boolean }): Promise<AgingResponse> {
    const org = await this.orgTokenService()
      .forSchool(schoolId)
      .catch(() => null)
    // forSchool returns non-null IFF the school has an org connection + a mapping in
    // the active dimension — so a non-null result IS the "org-fed" signal.
    if (!org) return this.disconnected(false) // no org mapping → genuinely disconnected
    if (org.filterableQboIds.length === 0) {
      // Org-fed, but mapped ONLY to "__unspecified__" — no id to `&department=`-slice
      // by. Keep the honest panel; never fabricate a whole-company slice.
      return this.disconnected(true)
    }
    const env = org.env
    const asOf = this.today()
    try {
      const pull = await this.pull(
        schoolId,
        org.conn.realmId,
        org.token,
        asOf,
        env,
        opts.refresh === true,
        org.filterableQboIds,
      )
      // Honest gate: only "connected" when the department-filtered pull produced
      // dimension-attributed items. An empty slice ⇒ this school's AR/AP isn't tagged
      // to its Location — keep the panel rather than show a zeroed/wrong register.
      if (pull.ar.length === 0 && pull.ap.length === 0) {
        return this.disconnected(true)
      }
      const arRoll = rollupAging(pull.ar, TOP_N)
      const apRoll = rollupAging(pull.ap, TOP_N)
      const flows = await this.annualFlows(schoolId)
      const response = this.assemble({
        connected: true,
        orgFed: true,
        asOf,
        stale: false,
        source: pull.source,
        env,
        companyName: org.conn.companyName ?? null,
        arRoll,
        apRoll,
        annualRevenue: flows?.revenue ?? null,
        annualExpense: flows?.expense ?? null,
      })
      response.note = ORG_FED_AGING_NOTE
      // Persist this school's OWN snapshot (keyed schoolId,asOfDate — the empty-guard
      // protects a good prior snapshot; the dept-scoped cache prevents cross-school bleed).
      await this.persist(schoolId, org.conn.realmId, env, asOf, 'page', response, arRoll, apRoll).catch((e) =>
        this.logger.warn(`org-fed aging persist failed for ${schoolId}: ${errMsg(e)}`),
      )
      return response
    } catch (e) {
      this.logger.warn(`org-fed aging live pull failed for ${schoolId}: ${errMsg(e)}`)
      return this.staleFromStore(schoolId, env, org.conn.companyName ?? null, true)
    }
  }

  /**
   * Best-effort capture at QBO sync time (as-of TODAY, captured_via:'sync'). The
   * CALLER (QboService.captureAging) wraps this in try/catch so a failing aging pull
   * or persist never aborts the TB sync.
   */
  async captureFromSync(schoolId: string, conn: { realmId: string; environment: string }): Promise<void> {
    const connection = await this.qboService().connectionForSchool(schoolId)
    if (!connection) return
    const token = connection.token
    const env: QboEnvironment = conn.environment === 'production' ? 'production' : 'sandbox'
    const asOf = this.today()
    const pull = await this.pull(schoolId, conn.realmId, token, asOf, env, true)
    const arRoll = rollupAging(pull.ar, TOP_N)
    const apRoll = rollupAging(pull.ap, TOP_N)
    const flows = await this.annualFlows(schoolId)
    const response = this.assemble({
      connected: true,
      orgFed: false,
      asOf,
      stale: false,
      source: pull.source,
      env,
      companyName: null,
      arRoll,
      apRoll,
      annualRevenue: flows?.revenue ?? null,
      annualExpense: flows?.expense ?? null,
    })
    await this.persist(schoolId, conn.realmId, env, asOf, 'sync', response, arRoll, apRoll)
  }

  // ── Live pull (cached) + fallback ladder ────────────────────────────────────
  private async pull(
    schoolId: string,
    realmId: string,
    token: string,
    asOf: string,
    env: QboEnvironment,
    refresh: boolean,
    deptIds?: string[],
  ): Promise<PullResult> {
    // The dept slice MUST be in the cache key: an org-fed school pulls from the SAME
    // realm as its siblings, so without it School A could serve School B's cached rows.
    const deptKey = deptIds && deptIds.length ? [...deptIds].sort().join(',') : ''
    const key = `${schoolId}|${asOf}|${deptKey}`
    if (!refresh) {
      const hit = this.cache.get(key)
      if (hit && hit.expires > Date.now()) {
        this.cache.delete(key) // refresh recency (Map keeps insertion order)
        this.cache.set(key, hit)
        return hit.pull
      }
    }
    const [ar, ap] = await Promise.all([
      this.pullSide(realmId, token, asOf, 'ar', env, deptIds),
      this.pullSide(realmId, token, asOf, 'ap', env, deptIds),
    ])
    // If BOTH sides fell back, stamp entity-fallback; else the primary detail source.
    const source: PullResult['source'] =
      ar.source === 'entity-fallback' && ap.source === 'entity-fallback' ? 'entity-fallback' : 'aging-detail'
    const pull: PullResult = { ar: ar.items, ap: ap.items, source }
    this.store(key, pull)
    return pull
  }

  /**
   * One side: the aging DETAIL report → parse; on parse-empty, the entity query.
   * When `deptIds` is set (Topology B org pull) the detail report is `&department=`-
   * sliced to this school's Location(s), and the entity fallback is SKIPPED — the
   * open-invoice/bill entity query cannot be dimension-scoped, so falling back would
   * return the WHOLE org company's AR/AP as this one school's slice (a wrong number).
   * An empty org slice therefore returns [] (honest "no attributed items"); a failure
   * throws so the caller degrades to the stored snapshot, never the whole-company set.
   */
  private async pullSide(
    realmId: string,
    token: string,
    asOf: string,
    side: AgingSide,
    env: QboEnvironment,
    deptIds?: string[],
  ): Promise<{ items: AgingItem[]; source: PullResult['source'] }> {
    const deptOpts = deptIds && deptIds.length ? { department: deptIds } : undefined
    try {
      const raw =
        side === 'ar'
          ? await this.client.getAgedReceivableDetail(realmId, token, asOf, deptOpts)
          : await this.client.getAgedPayableDetail(realmId, token, asOf, deptOpts)
      const items = parseAgedDetail(raw, asOf, side, env)
      if (items.length > 0) return { items, source: 'aging-detail' }
    } catch (e) {
      // Org (Topology B): never fall back to the non-dept-scoped entity query — propagate.
      if (deptOpts) throw e
      this.logger.warn(`aged detail (${side}) failed, trying entity fallback: ${errMsg(e)}`)
    }
    // Org: an empty department-filtered detail = no items tagged to this Location.
    if (deptOpts) return { items: [], source: 'aging-detail' }
    // Direct connection — fall back to the entity query.
    const rawEntities =
      side === 'ar'
        ? await this.client.queryOpenInvoices(realmId, token)
        : await this.client.queryOpenBills(realmId, token)
    const entities = extractEntities(rawEntities, side)
    return { items: parseEntityAging(entities, asOf, side, env), source: 'entity-fallback' }
  }

  private store(key: string, pull: PullResult): void {
    this.cache.set(key, { pull, expires: Date.now() + CACHE_TTL_MS })
    if (this.cache.size > CACHE_MAX) {
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) this.cache.delete(oldest)
    }
  }

  // ── Assembly ────────────────────────────────────────────────────────────────
  private assemble(args: {
    connected: boolean
    orgFed: boolean
    asOf: string | null
    stale: boolean
    source: 'aging-detail' | 'entity-fallback' | null
    env: QboEnvironment
    companyName: string | null
    arRoll: AgingRollup
    apRoll: AgingRollup
    annualRevenue: number | null
    annualExpense: number | null
  }): AgingResponse {
    const { arRoll, apRoll } = args
    const dso =
      args.annualRevenue && args.annualRevenue > 0 ? round2((arRoll.total / args.annualRevenue) * 365) : null
    const daysPayable =
      args.annualExpense && args.annualExpense > 0 ? round2((apRoll.total / args.annualExpense) * 365) : null
    const ar: ArSideResponse = {
      total: arRoll.total,
      overdue: arRoll.overdue,
      accounts: arRoll.accounts,
      over90: arRoll.d90Plus,
      buckets: arRoll.buckets,
      dso,
      items: arRoll.items.slice(0, REGISTER_CAP).map(toRow),
      top: arRoll.top,
      totalCount: arRoll.totalCount,
    }
    const ap: ApSideResponse = {
      total: apRoll.total,
      overdue: apRoll.overdue,
      dueSoon: apRoll.dueSoon,
      buckets: apRoll.buckets,
      daysPayable,
      items: apRoll.items.slice(0, REGISTER_CAP).map(toRow),
      top: apRoll.top,
      totalCount: apRoll.totalCount,
    }
    return {
      connected: args.connected,
      orgFed: args.orgFed,
      asOf: args.asOf,
      stale: args.stale,
      source: args.source,
      environment: args.env,
      companyName: args.companyName,
      ar,
      ap,
      net: round2(arRoll.total - apRoll.total),
    }
  }

  private disconnected(orgFed: boolean): AgingResponse {
    return {
      connected: false,
      orgFed,
      asOf: null,
      stale: false,
      source: null,
      environment: 'sandbox',
      companyName: null,
      ar: emptyAr(),
      ap: emptyAp(),
      net: 0,
    }
  }

  // ── Persistence ─────────────────────────────────────────────────────────────
  private async persist(
    schoolId: string,
    realmId: string,
    env: QboEnvironment,
    asOf: string,
    capturedVia: 'sync' | 'page' | 'penny',
    response: AgingResponse,
    arRoll: AgingRollup,
    apRoll: AgingRollup,
  ): Promise<void> {
    // Guard against a zeroed 200-OK pull clobbering a good snapshot: QBO can return an
    // empty report on a transient glitch, which is NOT an error (so it never routes to
    // staleFromStore) — the connector's "all-zero rows ≠ no data" rule. If this capture
    // found no AR/AP at all but a prior snapshot for this school did, keep the good one.
    const empty =
      arRoll.total === 0 && apRoll.total === 0 && arRoll.totalCount === 0 && apRoll.totalCount === 0
    if (empty) {
      const prior = await this.prisma.arApAgingSnapshot
        .findFirst({ where: { schoolId }, orderBy: { capturedAt: 'desc' } })
        .catch(() => null)
      if (prior && (prior.arTotal > 0 || prior.apTotal > 0)) {
        this.logger.warn(`aging capture for ${schoolId} was empty; kept prior non-zero snapshot`)
        return
      }
    }

    const asOfDate = new Date(`${asOf}T00:00:00.000Z`)
    const data = {
      realmId,
      environment: env,
      source: response.source ?? 'aging-detail',
      capturedVia,
      arTotal: arRoll.total,
      arOverdue: arRoll.overdue,
      ar90Plus: arRoll.d90Plus,
      apTotal: apRoll.total,
      apOverdue: apRoll.overdue,
      apDueSoon: apRoll.dueSoon,
      arAccounts: arRoll.accounts,
      ar90Count: arRoll.overdue90Count,
      apVendors: apRoll.accounts,
      arBuckets: arRoll.buckets as unknown as object,
      apBuckets: apRoll.buckets as unknown as object,
      arTop: arRoll.top as unknown as object,
      apTop: apRoll.top as unknown as object,
      capturedAt: new Date(),
    }
    await this.prisma.arApAgingSnapshot.upsert({
      where: { schoolId_asOfDate: { schoolId, asOfDate } },
      create: { schoolId, asOfDate, ...data },
      update: data,
    })
  }

  /** Return the last stored snapshot as a stale response (graceful degrade, no 500).
   *  `orgFed` carries through so an org-fed (Topology B) school with no stored
   *  snapshot falls back to its honest panel instead of an empty "connected" register. */
  private async staleFromStore(
    schoolId: string,
    env: QboEnvironment,
    companyName: string | null,
    orgFed = false,
  ): Promise<AgingResponse> {
    const row = await this.prisma.arApAgingSnapshot
      .findFirst({ where: { schoolId }, orderBy: { capturedAt: 'desc' } })
      .catch(() => null)
    if (!row) {
      // Org-fed with nothing captured and QBO unreachable — show the honest panel,
      // not an empty "connected" register.
      if (orgFed) return this.disconnected(true)
      // Direct connection, never captured (and the live pull just failed) —
      // connected:true, zeroed, with a soft note so the page can prompt a refresh.
      return {
        connected: true,
        orgFed: false,
        asOf: null,
        stale: true,
        source: null,
        environment: env,
        companyName,
        note: "Couldn't reach QuickBooks — no saved aging yet. Try Refresh.",
        ar: emptyAr(),
        ap: emptyAp(),
        net: 0,
      }
    }
    const asOf = row.asOfDate.toISOString().slice(0, 10)
    const arBuckets = (row.arBuckets ?? {}) as unknown as AgingBuckets
    const apBuckets = (row.apBuckets ?? {}) as unknown as AgingBuckets
    return {
      connected: true,
      orgFed,
      asOf,
      stale: true,
      source: (row.source as AgingResponse['source']) ?? null,
      environment: env,
      companyName,
      note: `Couldn't reach QuickBooks — showing the last saved aging from ${asOf}.`,
      ar: {
        total: row.arTotal,
        overdue: row.arOverdue,
        accounts: row.arAccounts,
        over90: row.ar90Plus,
        buckets: arBuckets,
        dso: null,
        items: [], // the persisted snapshot keeps aggregates only, not the full register
        top: (row.arTop ?? []) as unknown as AgingParty[],
        totalCount: row.arAccounts,
      },
      ap: {
        total: row.apTotal,
        overdue: row.apOverdue,
        dueSoon: row.apDueSoon,
        buckets: apBuckets,
        daysPayable: null,
        items: [],
        top: (row.apTop ?? []) as unknown as AgingParty[],
        totalCount: row.apVendors,
      },
      net: round2(row.arTotal - row.apTotal),
    }
  }

  // ── DSO / days-payable inputs (self-contained, cycle-free) ───────────────────
  /**
   * Annual revenue + expense from the school's NEWEST statement snapshot bundle
   * (soaResults.cy.totalRev / totalExp). Read directly via Prisma so this service
   * takes NO dependency on AnalyticsModule (keeps the module graph unchanged). null
   * when there is no snapshot → DSO / days-payable fall to null (honest "unknown").
   */
  private async annualFlows(schoolId: string): Promise<{ revenue: number; expense: number } | null> {
    try {
      const snap = await this.prisma.statementSnapshot.findFirst({
        where: { schoolId },
        orderBy: { createdAt: 'desc' },
      })
      if (!snap) return null
      const bundle = snap.payload as unknown as ReportBundle
      const soa = bundle?.soaResults?.cy
      const revenue = typeof soa?.totalRev === 'number' ? soa.totalRev : 0
      const expense = typeof soa?.totalExp === 'number' ? soa.totalExp : 0
      if (revenue <= 0 && expense <= 0) return null
      return { revenue, expense }
    } catch {
      return null
    }
  }

}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** Pull the Invoice/Bill array out of an entity-query QueryResponse (side-typed). */
function extractEntities(raw: unknown, side: AgingSide): QboOpenEntity[] {
  const key = side === 'ar' ? 'Invoice' : 'Bill'
  const data = (raw ?? {}) as { QueryResponse?: Record<string, unknown> }
  const list = data.QueryResponse?.[key]
  return Array.isArray(list) ? (list as QboOpenEntity[]) : []
}
