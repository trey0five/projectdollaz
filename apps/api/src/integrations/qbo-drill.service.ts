// QuickBooks transaction drill-down — orchestrator.
//
// "What's in this $300,000?" Resolves a computed figure (statement line, dollar
// metric, or explicit engine accts) to its engine accounts (from the STORED
// snapshot lineage — server-authoritative, the client never injects accounts on the
// primary path), reverse-maps them to QBO account ids, live-fetches the General
// Ledger for the period window through the app's token accessor, reconciles the
// transactions to the line total (with an SFP opening-balance plug so a balance
// ties), and deep-links each transaction back into QuickBooks. Lazy live fetch + an
// in-memory LRU+TTL cache (the briefing-narration pattern); ZERO schema migration.
//
// Token access goes ONLY through QboService.connectionForSchool (the existing
// refresh-and-persist path) — this service never refreshes tokens out of band.
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import type { ImportRole } from '@finrep/db'
import { getMetric, isMetricKey } from '@finrep/analytics'
import { PrismaService } from '../prisma/prisma.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import { QboService } from './qbo.service.js'
import { QboClient, metaList } from './qbo.client.js'
import { buildAccountLinkage, type AccountLinkage } from './qbo-drill.linkage.js'
import { buildDeepLink, parseGeneralLedger, type GlTxn, type QboEnvironment } from './qbo-gl.js'

// ── Response contract (web + Penny build against this) ────────────────────────
export type DrillReason =
  | 'ratio'
  | 'subtotal'
  | 'not-quickbooks'
  | 'no-snapshot'
  | 'no-account-map'
  | 'not-connected'
  | 'unsupported-topology-b'
  | 'empty'

export interface QbDrillLine {
  label: string
  value: number | null
  lineKey?: string
  metricKey?: string
  statement?: string
  variant?: string
}
export interface QbDrillAccount {
  acct: number
  name: string
  qboAccountIds: string[]
  linkable: boolean
}
export interface QbDrillTxn {
  txnId: string | null
  date: string
  type: string
  docNumber: string | null
  payee: string | null
  memo: string | null
  amount: number
  account: string
  deepLink: string | null
}
export interface QbDrillReconcile {
  lineValue: number | null
  drilledSum: number
  opening?: number
  diff: number
  ties: boolean
  shown: number
  total: number
  capped: boolean
  note?: string
}
export interface QbDrillResult {
  drillable: boolean
  reason?: DrillReason
  line: QbDrillLine
  window: { start: string; end: string; basis: 'Accrual' | 'Cash' }
  accounts: QbDrillAccount[]
  transactions: QbDrillTxn[]
  reconcile: QbDrillReconcile
  source: { realmId: string; environment: QboEnvironment; companyName: string | null; topology: 'school' | 'org' }
  /** Ratio metrics: the drillable component lines, each with the statement to drill it against. */
  components?: { lineKey: string; statement: 'SOA' | 'SFP' }[]
}

// ── Cache (in-memory LRU + TTL, single API container — briefing-narration pattern) ─
const CACHE_MAX = 100
const CACHE_TTL_MS = 10 * 60 * 1000
interface CacheEntry {
  txns: GlTxn[]
  expires: number
}

// ── Stored-snapshot shapes (only what we read) ────────────────────────────────
interface LineageEntry {
  line: string
  value: number
  sign: 1 | -1
  sources: Array<{ acct: number; desc?: string | null; total?: number }>
}
type LineageMap = Record<string, LineageEntry>
interface SnapshotLineage {
  soa?: { cy?: LineageMap | null; py?: LineageMap | null; audit?: LineageMap | null }
  sfp?: { cy?: LineageMap | null; py?: LineageMap | null; audit?: LineageMap | null }
  scf?: LineageMap | null
  netAssets?: LineageMap | null
}

const STMT_KEY: Record<string, keyof SnapshotLineage> = {
  SOA: 'soa',
  SFP: 'sfp',
  SCF: 'scf',
  NetAssets: 'netAssets',
}

/** Shift an ISO 'YYYY-MM-DD' by whole years (period-ends are month-ends → day stable). */
function shiftYears(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-')
  return `${Number(y) + delta}-${m}-${d}`
}
/** Fiscal-year START for an annual period END (one year earlier + 1 day). */
function fyStartISO(periodEndISO: string): string {
  const d = new Date(`${shiftYears(periodEndISO, -1)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
function round2(n: number): number {
  return Math.round(n * 100) / 100
}
function leaf(name: string): string {
  const parts = name.split(':')
  return (parts[parts.length - 1] ?? name).trim()
}

/** The internal resolution of a selection to a drillable line (or a non-drillable reason). */
interface Resolved {
  line: QbDrillLine
  sources: Array<{ acct: number; desc?: string | null }>
  sign: 1 | -1
  isBalance: boolean
  reason?: DrillReason
  components?: { lineKey: string; statement: 'SOA' | 'SFP' }[]
}

@Injectable()
export class QboDrillService {
  private readonly logger = new Logger(QboDrillService.name)
  private readonly cache = new Map<string, CacheEntry>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: PeriodsService,
    private readonly qbo: QboService,
    private readonly client: QboClient,
  ) {}

  /**
   * Drill a computed figure to its QBO transactions. Resolution precedence:
   * statement+lineKey → metricKey → accts (400 when none supplied).
   */
  async drill(
    schoolId: string,
    dto: {
      periodId: string
      statement?: 'SOA' | 'SFP' | 'SCF' | 'NetAssets'
      variant?: 'cy' | 'py' | 'audit'
      lineKey?: string
      metricKey?: string
      accts?: number[]
      basis?: 'Accrual' | 'Cash'
      limit?: number
    },
  ): Promise<QbDrillResult> {
    const variant = dto.variant ?? 'cy'
    const basis: 'Accrual' | 'Cash' = dto.basis === 'Cash' ? 'Cash' : 'Accrual'
    const limit = Math.min(Math.max(dto.limit ?? 200, 1), 500)

    // Period window (throws NotFound for a bad period — the route validated periodId).
    const period = await this.periods.getOwnedPeriod(schoolId, dto.periodId)
    const periodEnd = period.periodEndDate.toISOString().slice(0, 10)
    const window =
      variant === 'py'
        ? { start: fyStartISO(shiftYears(periodEnd, -1)), end: shiftYears(periodEnd, -1), basis }
        : { start: fyStartISO(periodEnd), end: periodEnd, basis }

    // Resolve the selection to a line + engine accounts (server-authoritative).
    const resolved = await this.resolveSelection(schoolId, dto, variant)

    // Non-drillable selections (subtotal / ratio / no-snapshot / no-account-map) exit
    // early — no QBO call, honest reason. Still fill source best-effort for the UI.
    if (resolved.reason && resolved.reason !== 'empty') {
      return this.nonDrillable(resolved, window, this.emptySource())
    }

    // QBO connection (token via the existing accessor). None → not-connected /
    // org-fed → unsupported-topology-b.
    const connection = await this.qbo.connectionForSchool(schoolId)
    if (!connection) {
      const orgFed = await this.isOrgFed(schoolId)
      return this.nonDrillable(
        { ...resolved, reason: orgFed ? 'unsupported-topology-b' : 'not-connected' },
        window,
        null,
      )
    }
    const { conn, token } = connection
    const env = (conn.environment === 'production' ? 'production' : 'sandbox') as QboEnvironment
    const source = {
      realmId: conn.realmId,
      environment: env,
      companyName: conn.companyName ?? null,
      topology: 'school' as const,
    }

    // QBO-source gate: the period's active import for this variant must be QBO-sourced.
    if (!(await this.isQuickbooksSourced(schoolId, dto.periodId, variant))) {
      return this.nonDrillable(resolved, window, source, 'not-quickbooks')
    }

    // Reverse-map engine accts → QBO account ids over a LIVE account pull.
    let accounts: AccountLinkage[]
    try {
      const meta = metaList(await this.client.accountMeta(conn.realmId, token))
      accounts = buildAccountLinkage(resolved.sources, meta)
    } catch (e) {
      this.logger.warn(`drill account-meta failed for ${schoolId}: ${errMsg(e)}`)
      return this.nonDrillable(resolved, window, source, 'not-connected')
    }

    const linkable = accounts.filter((a) => a.linkable)
    const qboIds = [...new Set(linkable.flatMap((a) => a.qboAccountIds))]
    if (qboIds.length === 0) {
      // Nothing reverse-mapped (all synthetic/reclass) — show accounts, no drill.
      return {
        ...this.baseResult(resolved, window, source),
        drillable: false,
        reason: 'no-account-map',
        accounts: this.toAccounts(accounts),
      }
    }

    // Live GL fetch (cached), then server-side filter by the resolved account set
    // (filter-agnostic — correct whether or not QBO honored account=).
    const idSet = new Set(qboIds)
    const nameSet = new Set<string>()
    for (const src of resolved.sources) {
      const d = (src.desc ?? '').trim().toLowerCase()
      if (d) {
        nameSet.add(d)
        nameSet.add(leaf(d))
      }
    }
    let rows: GlTxn[]
    try {
      rows = await this.fetchGl(schoolId, dto.periodId, variant, basis, qboIds, conn.realmId, token, window)
    } catch (e) {
      this.logger.warn(`drill GL fetch failed for ${schoolId}: ${errMsg(e)}`)
      return this.nonDrillable(resolved, window, source, 'not-connected')
    }
    const matched = rows.filter((r) => this.matchesAccount(r, idSet, nameSet))

    return this.assemble(resolved, matched, accounts, qboIds, window, source, env, limit)
  }

  // ── Selection resolution ────────────────────────────────────────────────────
  private async resolveSelection(
    schoolId: string,
    dto: { periodId: string; statement?: string; lineKey?: string; metricKey?: string; accts?: number[] },
    variant: 'cy' | 'py' | 'audit',
  ): Promise<Resolved> {
    if (dto.statement && dto.lineKey) {
      return this.resolveStatementLine(schoolId, dto.periodId, dto.statement, variant, dto.lineKey)
    }
    if (dto.metricKey) {
      return this.resolveMetric(schoolId, dto.periodId, dto.metricKey, variant)
    }
    if (dto.accts && dto.accts.length) {
      return {
        line: { label: 'Selected accounts', value: null },
        sources: dto.accts.map((a) => ({ acct: a })),
        sign: 1,
        isBalance: false,
      }
    }
    throw new BadRequestException('Provide a statement+lineKey, a metricKey, or accts to drill.')
  }

  private async loadLineage(schoolId: string, periodId: string): Promise<SnapshotLineage | null> {
    const snap = await this.prisma.statementSnapshot.findFirst({
      where: { schoolId, fiscalPeriodId: periodId },
      orderBy: { createdAt: 'desc' },
    })
    if (!snap) return null
    const payload = snap.payload as unknown as { lineage?: SnapshotLineage }
    return payload?.lineage ?? null
  }

  /** The variant-shaped lineage map for a statement (scf/netAssets ignore variant). */
  private lineageMap(
    lineage: SnapshotLineage,
    statement: string,
    variant: 'cy' | 'py' | 'audit',
  ): LineageMap | null {
    const key = STMT_KEY[statement]
    if (!key) return null
    const node = lineage[key]
    if (!node) return null
    if (key === 'scf' || key === 'netAssets') return node as LineageMap
    return (node as Record<'cy' | 'py' | 'audit', LineageMap | null | undefined>)[variant] ?? null
  }

  private async resolveStatementLine(
    schoolId: string,
    periodId: string,
    statement: string,
    variant: 'cy' | 'py' | 'audit',
    lineKey: string,
  ): Promise<Resolved> {
    const lineage = await this.loadLineage(schoolId, periodId)
    const empty: Resolved = {
      line: { label: lineKey, value: null, lineKey, statement, variant },
      sources: [],
      sign: 1,
      isBalance: statement === 'SFP',
    }
    if (!lineage) return { ...empty, reason: 'no-snapshot' }
    const map = this.lineageMap(lineage, statement, variant)
    if (!map) return { ...empty, reason: 'no-snapshot' }
    const entry = map[lineKey]
    if (!entry) return { ...empty, reason: 'no-account-map' }
    const line: QbDrillLine = { label: lineKey, value: entry.value, lineKey, statement, variant }
    if (!entry.sources || entry.sources.length === 0) {
      return { line, sources: [], sign: entry.sign ?? 1, isBalance: statement === 'SFP', reason: 'subtotal' }
    }
    return {
      line,
      sources: entry.sources.map((s) => ({ acct: s.acct, desc: s.desc })),
      sign: entry.sign ?? 1,
      isBalance: statement === 'SFP',
    }
  }

  /**
   * Metric drill (secondary). A dollar metric that maps to a SINGLE drillable
   * statement line (currency unit, no operational inputs) drills that line; anything
   * else (a ratio, or multiple financial inputs) is not directly drillable — return
   * reason:'ratio' with the drillable component line keys for the UI to route to.
   */
  private async resolveMetric(
    schoolId: string,
    periodId: string,
    metricKey: string,
    variant: 'cy' | 'py' | 'audit',
  ): Promise<Resolved> {
    if (!isMetricKey(metricKey)) {
      throw new BadRequestException(`Unknown metric "${metricKey}".`)
    }
    const def = getMetric(metricKey)
    const baseLine: QbDrillLine = { label: def.label, value: null, metricKey }
    const lineage = await this.loadLineage(schoolId, periodId)
    if (!lineage) {
      return { line: baseLine, sources: [], sign: 1, isBalance: false, reason: 'no-snapshot' }
    }
    const financials = (def.inputs ?? []).filter((i) => i.source === 'financials').map((i) => i.key)
    const hasOperational = (def.inputs ?? []).some((i) => i.source === 'operational')

    // Which financial inputs resolve to a drillable line (non-empty sources)?
    const soa = this.lineageMap(lineage, 'SOA', variant)
    const sfp = this.lineageMap(lineage, 'SFP', variant)
    const findLine = (key: string): { statement: 'SOA' | 'SFP'; entry: LineageEntry } | null => {
      if (soa?.[key]?.sources?.length) return { statement: 'SOA', entry: soa[key] }
      if (sfp?.[key]?.sources?.length) return { statement: 'SFP', entry: sfp[key] }
      return null
    }
    const drillable = financials
      .map((k) => ({ key: k, hit: findLine(k) }))
      .filter((x): x is { key: string; hit: { statement: 'SOA' | 'SFP'; entry: LineageEntry } } => !!x.hit)

    const isDirect = def.unit === 'currency' && !hasOperational && drillable.length === 1
    if (isDirect) {
      const { key, hit } = drillable[0]
      return {
        line: {
          label: def.label,
          value: hit.entry.value,
          metricKey,
          lineKey: key,
          statement: hit.statement,
          variant,
        },
        sources: hit.entry.sources.map((s) => ({ acct: s.acct, desc: s.desc })),
        sign: hit.entry.sign ?? 1,
        isBalance: hit.statement === 'SFP',
      }
    }
    return {
      line: baseLine,
      sources: [],
      sign: 1,
      isBalance: false,
      reason: 'ratio',
      components: drillable.map((d) => ({ lineKey: d.key, statement: d.hit.statement })),
    }
  }

  // ── QBO gates ─────────────────────────────────────────────────────────────
  private async isQuickbooksSourced(
    schoolId: string,
    periodId: string,
    variant: 'cy' | 'py' | 'audit',
  ): Promise<boolean> {
    const count = await this.prisma.import.count({
      where: {
        schoolId,
        fiscalPeriodId: periodId,
        role: variant as ImportRole,
        metadata: { path: ['source'], equals: 'quickbooks' },
      },
    })
    return count > 0
  }

  /** True when this school has no own connection but IS mapped in its org's feed. */
  private async isOrgFed(schoolId: string): Promise<boolean> {
    try {
      const school = await this.prisma.school.findUnique({ where: { id: schoolId } })
      if (!school) return false
      const orgConn = await this.prisma.orgQboConnection.findUnique({
        where: { organizationId: school.organizationId },
      })
      if (!orgConn) return false
      const rows = await this.prisma.orgQboMapping.count({
        where: { connectionId: orgConn.id, dimension: orgConn.dimension, schoolId },
      })
      return rows > 0
    } catch {
      return false
    }
  }

  // ── GL fetch + cache ────────────────────────────────────────────────────────
  private async fetchGl(
    schoolId: string,
    periodId: string,
    variant: string,
    basis: 'Accrual' | 'Cash',
    qboIds: string[],
    realmId: string,
    token: string,
    window: { start: string; end: string },
  ): Promise<GlTxn[]> {
    const accountKey = [...qboIds].sort().join(',')
    const key = `${schoolId}|${periodId}|${variant}|${basis}|${accountKey}`
    const hit = this.cache.get(key)
    if (hit && hit.expires > Date.now()) {
      // Refresh recency (Map keeps insertion order → oldest first).
      this.cache.delete(key)
      this.cache.set(key, hit)
      return hit.txns
    }
    const raw = await this.client.getGeneralLedger(realmId, token, {
      accountIds: qboIds,
      startDate: window.start,
      endDate: window.end,
      basis,
    })
    const txns = parseGeneralLedger(raw)
    this.store(key, txns)
    return txns
  }

  private store(key: string, txns: GlTxn[]): void {
    this.cache.set(key, { txns, expires: Date.now() + CACHE_TTL_MS })
    if (this.cache.size > CACHE_MAX) {
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) this.cache.delete(oldest)
    }
  }

  private matchesAccount(r: GlTxn, idSet: Set<string>, nameSet: Set<string>): boolean {
    if (r.acctId && idSet.has(r.acctId)) return true
    const name = (r.acctName ?? '').trim().toLowerCase()
    if (!name) return false
    return nameSet.has(name) || nameSet.has(leaf(name))
  }

  // ── Assembly + reconcile ────────────────────────────────────────────────────
  private assemble(
    resolved: Resolved,
    matched: GlTxn[],
    accounts: AccountLinkage[],
    qboIds: string[],
    window: { start: string; end: string; basis: 'Accrual' | 'Cash' },
    source: QbDrillResult['source'],
    env: QboEnvironment,
    limit: number,
  ): QbDrillResult {
    const lineValue = resolved.line.value
    const fallbackAcct = qboIds[0] ?? null

    // SIGN CONVENTION (settled by a LIVE sandbox tie-out): QBO GeneralLedger
    // `subt_nat_amount` is the account's NATURAL amount (income increase shown
    // positive, expense increase positive, asset increase positive), which already
    // matches the statement's display-positive magnitude. The lineage `sign` is
    // calibrated for TB debit−credit totals (credits negative) — applying it here
    // would DOUBLE-flip credit-normal lines (revenue, liabilities). So emit the
    // natural amount as-is; a revenue line's txns then sum to the positive revenue
    // total (verified: the +2× flip disappears against the live company).
    const reals: QbDrillTxn[] = matched.map((r) => ({
      txnId: r.txnId,
      date: r.date,
      type: r.type,
      docNumber: r.docNumber,
      payee: r.payee,
      memo: r.memo,
      amount: round2(r.amount),
      account: r.acctName,
      deepLink: buildDeepLink(r.type, r.txnId, env, r.acctId ?? fallbackAcct),
    }))

    const realsSum = round2(reals.reduce((s, t) => s + t.amount, 0))

    // SFP balance lines: synthesize an "Opening balance (prior years)" plug so
    // opening + FY activity = ending balance ties out.
    let opening: number | undefined
    const leadRows: QbDrillTxn[] = []
    if (resolved.isBalance && lineValue != null) {
      opening = round2(lineValue - realsSum)
      leadRows.push({
        txnId: null,
        date: window.start,
        type: 'Opening balance (prior years)',
        docNumber: null,
        payee: null,
        memo: 'Balance carried in before this fiscal year',
        amount: opening,
        account: resolved.line.lineKey ?? 'Opening balance',
        deepLink: null,
      })
    }

    // drilledSum over ALL rows (opening + every real), so the tie-out stays honest
    // even when the display list is capped.
    const drilledSum = round2((opening ?? 0) + realsSum)

    // Cap the reals by |amount| desc; opening row (if any) always leads.
    const sortedReals = [...reals].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    const shownReals = sortedReals.slice(0, limit)
    const transactions = [...leadRows, ...shownReals]

    const nonLinkable = accounts.filter((a) => !a.linkable)
    const notes: string[] = []
    if (nonLinkable.length) {
      notes.push(
        `${nonLinkable.length} account${nonLinkable.length > 1 ? 's' : ''} could not be linked to a QuickBooks account and are excluded from the total.`,
      )
    }
    if (opening != null && Math.abs(opening) > 0.01) {
      notes.push('Includes an opening-balance plug for activity before this fiscal year.')
    }

    const diff = lineValue == null ? 0 : round2(lineValue - drilledSum)
    const ties = lineValue != null && Math.abs(diff) <= 0.01
    if (lineValue == null) notes.push('No line total to reconcile against (accounts-only drill).')
    else if (!ties) {
      notes.push('Transactions do not fully tie to the line — reclass, timing, or accrual/cash basis.')
    }

    const drillable = true
    const isEmpty = reals.length === 0 && leadRows.length === 0
    return {
      drillable,
      ...(isEmpty ? { reason: 'empty' as const } : {}),
      line: resolved.line,
      window,
      accounts: this.toAccounts(accounts),
      transactions,
      reconcile: {
        lineValue,
        drilledSum,
        ...(opening != null ? { opening } : {}),
        diff,
        ties,
        shown: shownReals.length,
        total: reals.length,
        capped: reals.length > shownReals.length,
        ...(notes.length ? { note: notes.join(' ') } : {}),
      },
      source,
      ...(resolved.components ? { components: resolved.components } : {}),
    }
  }

  // ── Non-drillable / empty scaffolds ─────────────────────────────────────────
  private toAccounts(accounts: AccountLinkage[]): QbDrillAccount[] {
    return accounts.map((a) => ({
      acct: a.acct,
      name: a.name,
      qboAccountIds: a.qboAccountIds,
      linkable: a.linkable,
    }))
  }

  private baseResult(
    resolved: Resolved,
    window: { start: string; end: string; basis: 'Accrual' | 'Cash' },
    source: QbDrillResult['source'],
  ): QbDrillResult {
    return {
      drillable: false,
      line: resolved.line,
      window,
      accounts: [],
      transactions: [],
      reconcile: {
        lineValue: resolved.line.value,
        drilledSum: 0,
        diff: 0,
        ties: false,
        shown: 0,
        total: 0,
        capped: false,
      },
      source,
      ...(resolved.components ? { components: resolved.components } : {}),
    }
  }

  /** A non-drillable result carrying an explicit reason (falls back to resolved.reason). */
  private nonDrillable(
    resolved: Resolved,
    window: { start: string; end: string; basis: 'Accrual' | 'Cash' },
    source: QbDrillResult['source'] | null,
    reason?: DrillReason,
  ): QbDrillResult {
    const r = reason ?? resolved.reason
    return {
      ...this.baseResult(resolved, window, source ?? this.emptySource()),
      ...(r ? { reason: r } : {}),
    }
  }

  private emptySource(): QbDrillResult['source'] {
    return { realmId: '', environment: 'sandbox', companyName: null, topology: 'school' }
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
