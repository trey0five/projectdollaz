// Phase 6 — QuickBooks Online connector orchestration. Owns the per-school OAuth
// connection (connect / refresh / disconnect) and the "sync" that pulls the trial
// balance and feeds it through the SAME path as a file upload (ImportsService →
// StatementsService.generate), which auto-scans on snapshot creation. Config-gated:
// disabled (501-able) when QB_OAUTH_CLIENT_ID is unset.
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import type { ImportRole, QboConnection, User } from '@finrep/db'
import { SCOA_CATEGORIES, type SCoaCategory } from '@finrep/engine'
import { PrismaService } from '../prisma/prisma.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import { ImportsService } from '../imports/imports.service.js'
import { StatementsService } from '../statements/statements.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import { BillingService } from '../billing/billing.service.js'
import { MonthlySnapshotsService } from '../monthly/monthly-snapshots.service.js'
import { MappingService } from '../mapping/mapping.service.js'
import { fyMonthKeys, fyStartYearForPeriodEnd } from '../monthly/fy-elapsed.js'
import type { MonthlyRowDto } from '../monthly/dto/create-monthly-snapshot.dto.js'
import type { QbSyncScopeDto } from './dto/qbo.dto.js'
import { QboClient, qboPlSection } from './qbo.client.js'
import { QboAgingService } from './qbo-aging.service.js'
import { decToken, encToken } from './qbo-crypto.js'
import { suggestCategory } from './qbo-review.suggest.js'

/** Shift an ISO 'YYYY-MM-DD' by whole years (period-ends are month-ends, so the day is stable). */
function shiftYears(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-')
  return `${Number(y) + delta}-${m}-${d}`
}

/** Last calendar day of a 'YYYY-MM' month, as an ISO 'YYYY-MM-DD' string. */
function monthEndISO(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  const day = new Date(Date.UTC(y, m, 0)).getUTCDate() // day 0 of next month = last of this
  return `${monthKey}-${String(day).padStart(2, '0')}`
}

/**
 * The fiscal-year START for an annual period END date: one year earlier + 1 day
 * (2026-06-30 → 2025-07-01). Works for any year-end convention, not just Jun 30.
 */
function fyStartISO(periodEndISO: string): string {
  const d = new Date(`${shiftYears(periodEndISO, -1)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export interface QboStatus {
  configured: boolean
  connected: boolean
  realmId: string | null
  companyName: string | null
  environment: string | null
  connectedAt: string | null
  lastSyncedAt: string | null
  lastSyncRowCount: number | null
  lastSyncFiscalPeriodId: string | null
  /**
   * Non-null when this school has NO connection of its own but IS mapped in
   * its organization's company-level connection (Topology B) — its data
   * arrives via the org import, and the UI says so instead of "not connected".
   */
  orgFed: {
    orgId: string
    companyName: string | null
    dimension: string
    valueNames: string[]
    lastImportedAt: string | null
  } | null
  /**
   * Automated nightly sync state (from the connection row). Null observability
   * fields until the scheduler (or the run-now hook) has acted on this school.
   */
  autoSync: {
    enabled: boolean
    needsReauth: boolean
    lastRunAt: string | null
    lastStatus: string | null
    lastError: string | null
  }
}

/**
 * The classified result of ONE scheduled sync attempt. runScheduledSync NEVER
 * throws — it maps every path to one of these so the scheduler can persist status
 * + decide on the reconnect email without a try/catch of its own.
 *  - synced       TB pulled + statements generated + aging captured (rowCount set)
 *  - no_data      TB returned no balances (token still refreshed → keepalive kept)
 *  - not_entitled subscription lapsed → skipped the TB pull but refreshed the token
 *  - reauth       dead/revoked refresh token (needs a human to reconnect)
 *  - error        transient failure (network / 5xx / generate hiccup) — retry later
 *  - no_actor     no connectedByUserId and no owner membership to attribute imports
 */
export interface ScheduledSyncOutcome {
  status: 'synced' | 'no_data' | 'not_entitled' | 'reauth' | 'error' | 'no_actor'
  rowCount?: number
  error?: string
}

export interface QboDisconnectResult extends QboStatus {
  /** Non-null when the caller asked to purge QuickBooks-imported data. */
  removed: { imports: number; monthly: number; periods: number } | null
}

export interface QboSyncHistoryEntry {
  syncedAt: string
  fiscalPeriodId: string | null
  rowCount: number | null
}

export interface QboSyncAllItem {
  periodId: string
  label: string
  ok: boolean
  rowCount?: number
  error?: string
}

export interface QboSyncAllResult {
  total: number
  succeeded: number
  failed: number
  results: QboSyncAllItem[]
}

/** One reviewable QuickBooks P&L account (engine 40000/60000 blocks). */
export interface QboReviewAccount {
  acct: number
  /** `desc` from the newest import row containing this acct. */
  name: string
  /** Derived ONLY from the acct block, never from the amount's sign. */
  section: 'revenue' | 'expense'
  /** SIGNED engine total (debit+/credit−) from the newest period's row. */
  amount: number
  periodLabel: string | null
  /** Current SCoA key: active mapping entry, else the block default. */
  category: string
  /** true while still on the auto-default ('other' / 'fixedOther'). */
  isDefault: boolean
  /** Name-heuristic SCoA key; always null once the user has picked a category. */
  suggestion: string | null
}

export interface QboReviewAccountsResult {
  accounts: QboReviewAccount[]
  summary: { total: number; needsReview: number; revenue: number; expense: number }
}

export interface QboReviewApplyResult {
  merged: number
  statements: { rebuilt: number; failed: string[] }
  monthly: { rebuilt: number; failed: string[] }
}

interface QboScopeOutcome {
  ok: boolean
  rowCount?: number
  error?: string
}

export interface QboSyncScopeResult {
  currentYear?: QboScopeOutcome
  priorYear?: QboScopeOutcome
  monthly?: { imported: number; skipped: number; errors: string[] }
  history?: Array<{ year: number } & QboScopeOutcome>
}

/**
 * True when a pulled trial balance carries any actual balances. QuickBooks'
 * TrialBalance report returns the full ACCOUNT LIST even for as-of dates before
 * the company existed (every total 0.00) — so "rows came back" is NOT "has data".
 */
function hasBalances(rows: Array<{ total: number }>): boolean {
  return rows.some((r) => r.total !== 0)
}

/** A short, DB-safe error message for the connection's last_scheduled_sync_error. */
function shortMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  return raw.slice(0, 300)
}

/** Defensively read the keys we write into a `qbo.synced` audit row's Json metadata. */
function readSyncMeta(metadata: unknown): { fiscalPeriodId: string | null; rowCount: number | null } {
  const m = (metadata ?? {}) as { fiscalPeriodId?: unknown; rowCount?: unknown }
  return {
    fiscalPeriodId: typeof m.fiscalPeriodId === 'string' ? m.fiscalPeriodId : null,
    rowCount: typeof m.rowCount === 'number' ? m.rowCount : null,
  }
}

@Injectable()
export class QboService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly client: QboClient,
    private readonly periods: PeriodsService,
    private readonly imports: ImportsService,
    private readonly statements: StatementsService,
    private readonly monthlySnapshots: MonthlySnapshotsService,
    private readonly mapping: MappingService,
    private readonly audit: AuditService,
    // Entitlement gate for scheduled syncs (mirrors syncOrg's per-school check). No
    // cycle: BillingService does not depend on QboService, so a plain injection.
    private readonly billing: BillingService,
    // AR/AP aging capture (best-effort tail of sync()/syncScope()). QboService ⇄
    // QboAgingService is a mutual dependency; a constructor injection (even forwardRef)
    // crashes at MODULE LOAD because emitDecoratorMetadata references the paramtype at
    // class-eval while the other class is still in the ESM temporal dead zone. So we
    // resolve QboAgingService LAZILY via ModuleRef inside captureAging (never at eval).
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * Best-effort AR/AP aging capture (as-of TODAY) after a sync. NEVER throws — a
   * failing aging pull must not abort the TB sync (mirrors companyName()'s posture).
   * Deliberately called ONLY from sync()/syncScope() (the "current period the user is
   * looking at" entry points), NOT syncOnePeriod()/history loops — aging is a "right
   * now" concept, never captured as-of a historical period end.
   */
  private async captureAging(schoolId: string, conn: QboConnection): Promise<void> {
    try {
      // Lazy-resolve to break the eval-time import cycle (see the ctor note).
      const aging = this.moduleRef.get(QboAgingService, { strict: false })
      await aging.captureFromSync(schoolId, { realmId: conn.realmId, environment: conn.environment })
    } catch (e) {
      // Log + swallow (no logger on this service; a failed capture is non-fatal and
      // the page/briefing simply keep the last snapshot).
      void e
    }
  }

  /**
   * Pull a trial balance and merge any type-derived P&L mapping entries into the
   * school's chart mapping (revenue → 'other', expense → 'fixedOther') so the
   * generated statements classify QuickBooks accounts out of the box. Merging is
   * idempotent; a merge failure must not abort the sync (rows still import).
   */
  private async pullTrialBalance(
    schoolId: string,
    realmId: string,
    token: string,
    startDate: string,
    endDate: string,
  ) {
    const { rows, plEntries } = await this.client.getTrialBalance(realmId, token, startDate, endDate)
    if (rows.length > 0 && Object.keys(plEntries).length > 0) {
      try {
        await this.mapping.mergeEntries(schoolId, plEntries)
      } catch {
        /* keep the sync alive; unmapped accounts surface in review instead */
      }
    }
    return rows
  }

  /** The Intuit consent URL for a school (or null when the connector isn't configured). */
  authorizeUrl(schoolId: string): string {
    if (!this.client.isConfigured()) {
      throw new BadRequestException('QuickBooks connector is not configured on this server.')
    }
    return this.client.buildAuthorizeUrl(schoolId)
  }

  async status(schoolId: string): Promise<QboStatus> {
    const conn = await this.prisma.qboConnection.findUnique({ where: { schoolId } })
    // Last-synced is derived from the most recent 'qbo.synced' audit row (no schema
    // change). Independent of `connected` — a school's sync history survives a
    // reconnect; the UI only surfaces it while connected.
    const last = await this.prisma.auditLog.findFirst({
      where: { schoolId, action: 'qbo.synced' },
      orderBy: { createdAt: 'desc' },
    })
    const lastMeta = readSyncMeta(last?.metadata)
    return {
      configured: this.client.isConfigured(),
      connected: !!conn,
      realmId: conn?.realmId ?? null,
      // Lazy backfill for connections made before we stored the name.
      companyName: conn ? await this.companyName(conn) : null,
      environment: conn?.environment ?? null,
      connectedAt: conn?.createdAt ? conn.createdAt.toISOString() : null,
      lastSyncedAt: last ? last.createdAt.toISOString() : null,
      lastSyncRowCount: lastMeta.rowCount,
      lastSyncFiscalPeriodId: lastMeta.fiscalPeriodId,
      // A direct connection always wins — only a connection-less school can be org-fed.
      orgFed: conn ? null : await this.orgFed(schoolId),
      autoSync: {
        // Defaults mirror the schema so a connection-less school reads sensibly.
        enabled: conn?.autoSyncEnabled ?? true,
        needsReauth: conn?.needsReauth ?? false,
        lastRunAt: conn?.lastScheduledSyncAt ? conn.lastScheduledSyncAt.toISOString() : null,
        lastStatus: conn?.lastScheduledSyncStatus ?? null,
        lastError: conn?.lastScheduledSyncError ?? null,
      },
    }
  }

  /**
   * Topology-B feed detection for a school WITHOUT its own connection: mapped
   * (schoolId set) in its org's OrgQboConnection under the ACTIVE dimension.
   * lastImportedAt = the newest 'qbo.synced' audit row stamped via:'org'
   * (fallback: newest 'qbo.synced' at all, for rows written before the stamp).
   */
  private async orgFed(schoolId: string): Promise<QboStatus['orgFed']> {
    const school = await this.prisma.school.findUnique({ where: { id: schoolId } })
    if (!school) return null
    const orgConn = await this.prisma.orgQboConnection.findUnique({
      where: { organizationId: school.organizationId },
    })
    if (!orgConn) return null
    const rows = await this.prisma.orgQboMapping.findMany({
      where: { connectionId: orgConn.id, dimension: orgConn.dimension, schoolId },
      orderBy: { qboName: 'asc' },
    })
    if (rows.length === 0) return null
    const lastOrg =
      (await this.prisma.auditLog.findFirst({
        where: { schoolId, action: 'qbo.synced', metadata: { path: ['via'], equals: 'org' } },
        orderBy: { createdAt: 'desc' },
      })) ??
      (await this.prisma.auditLog.findFirst({
        where: { schoolId, action: 'qbo.synced' },
        orderBy: { createdAt: 'desc' },
      }))
    return {
      orgId: school.organizationId,
      companyName: orgConn.companyName,
      dimension: orgConn.dimension,
      valueNames: rows.map((r) => r.qboName),
      lastImportedAt: lastOrg?.createdAt.toISOString() ?? null,
    }
  }

  /**
   * What QuickBooks data ALREADY exists for a period — so the import chooser can
   * reflect reality (checkboxes are otherwise transient form state that resets to
   * defaults on reload). currentYear/priorYear = a QBO cy/py import on the period;
   * monthly = QBO monthly snapshots; historyYears = distinct EARLIER periods that
   * carry a QBO cy import (the "prior years of history" already pulled).
   */
  async importScope(
    schoolId: string,
    periodId: string,
  ): Promise<{ currentYear: boolean; priorYear: boolean; monthly: boolean; historyYears: number }> {
    const empty = { currentYear: false, priorYear: false, monthly: false, historyYears: 0 }
    if (!periodId) return empty
    const period = await this.prisma.fiscalPeriod.findFirst({ where: { id: periodId, schoolId } })
    if (!period) return empty
    const qbo = { path: ['source'], equals: 'quickbooks' } as const
    const [cy, py, monthly, historyPeriods] = await Promise.all([
      this.prisma.import.count({ where: { schoolId, fiscalPeriodId: periodId, role: 'cy' as ImportRole, metadata: qbo } }),
      this.prisma.import.count({ where: { schoolId, fiscalPeriodId: periodId, role: 'py' as ImportRole, metadata: qbo } }),
      this.prisma.monthlySnapshot.count({ where: { schoolId, fiscalPeriodId: periodId, sourceName: 'QuickBooks Online' } }),
      this.prisma.import.findMany({
        where: {
          schoolId,
          role: 'cy' as ImportRole,
          metadata: qbo,
          fiscalPeriod: { periodEndDate: { lt: period.periodEndDate } },
        },
        select: { fiscalPeriodId: true },
        distinct: ['fiscalPeriodId'],
      }),
    ])
    return { currentYear: cy > 0, priorYear: py > 0, monthly: monthly > 0, historyYears: historyPeriods.length }
  }

  /** Recent 'qbo.synced' audit rows for the school (newest-first, capped). */
  async syncHistory(schoolId: string): Promise<QboSyncHistoryEntry[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: { schoolId, action: 'qbo.synced' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    return rows.map((r) => {
      const meta = readSyncMeta(r.metadata)
      return {
        syncedAt: r.createdAt.toISOString(),
        fiscalPeriodId: meta.fiscalPeriodId,
        rowCount: meta.rowCount,
      }
    })
  }

  /** Complete the OAuth handshake: exchange the code + realmId and store the connection. */
  async connect(schoolId: string, code: string, realmId: string, userId: string): Promise<QboStatus> {
    if (!this.client.isConfigured()) {
      throw new BadRequestException('QuickBooks connector is not configured on this server.')
    }
    // Topology-B guard: one company must not be connected at both levels. The
    // check runs BEFORE the code exchange so the one-time code isn't burned.
    const school = await this.prisma.school.findUnique({ where: { id: schoolId } })
    if (school) {
      const orgConn = await this.prisma.orgQboConnection.findUnique({
        where: { organizationId: school.organizationId },
      })
      if (orgConn && orgConn.realmId === realmId) {
        throw new ConflictException(
          'This QuickBooks company is connected at the organization level. Map this school to one of its locations instead.',
        )
      }
    }
    const tokens = await this.client.exchangeCode(code)
    const expiresAt = new Date(Date.now() + tokens.expiresInSec * 1000)
    const environment = this.config.get<string>('quickbooks.environment') ?? 'sandbox'
    const data = {
      realmId,
      accessToken: encToken(tokens.accessToken),
      refreshToken: encToken(tokens.refreshToken),
      expiresAt,
      environment,
      connectedByUserId: userId,
      // Re-arm auto-sync on (re)connect: a fresh token clears any dead-token episode
      // so the next nightly sweep resumes and a future death re-notifies. Mirrors
      // AlertService re-enabling an edge trigger. Leaves autoSyncEnabled untouched
      // (create defaults it true; a reconnect respects a prior opt-out).
      needsReauth: false,
      reauthNotifiedAt: null,
      autoSyncFailures: 0,
    }
    await this.prisma.qboConnection.upsert({
      where: { schoolId },
      create: { schoolId, ...data },
      update: data,
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'qbo.connected',
      targetType: 'qbo_connections',
      metadata: { realmId, environment },
    })
    return this.status(schoolId)
  }

  async disconnect(actor: User, schoolId: string, removeData = false): Promise<QboDisconnectResult> {
    const removed = removeData ? await this.removeQboData(actor, schoolId) : null
    await this.prisma.qboConnection.deleteMany({ where: { schoolId } })
    await this.audit.write({
      schoolId,
      userId: actor.id,
      action: 'qbo.disconnected',
      targetType: 'qbo_connections',
      metadata: { removedData: removeData, ...(removed ?? {}) },
    })
    const status = await this.status(schoolId)
    return { ...status, removed }
  }

  /**
   * Delete everything imported FROM QuickBooks (metadata.source='quickbooks'
   * imports + 'QuickBooks Online' monthly snapshots) and reconcile each affected
   * period's statements: regenerate from a remaining (e.g. uploaded) CY import, or
   * clear the snapshots when none remains. A period left completely empty — no
   * imports, monthly snapshots, or budget (i.e. a history year QuickBooks created)
   * — is removed too. Uploaded files and any period with other data are untouched.
   */
  private async removeQboData(
    actor: User,
    schoolId: string,
  ): Promise<{ imports: number; monthly: number; periods: number }> {
    const qboImports = await this.prisma.import.findMany({
      where: { schoolId, metadata: { path: ['source'], equals: 'quickbooks' } },
      select: { id: true, fiscalPeriodId: true },
    })
    const qboMonthly = await this.prisma.monthlySnapshot.findMany({
      where: { schoolId, sourceName: 'QuickBooks Online' },
      select: { id: true, fiscalPeriodId: true },
    })
    const periodIds = new Set<string>([
      ...qboImports.map((i) => i.fiscalPeriodId),
      ...qboMonthly.map((m) => m.fiscalPeriodId),
    ])

    if (qboImports.length) {
      await this.prisma.import.deleteMany({ where: { id: { in: qboImports.map((i) => i.id) } } })
    }
    if (qboMonthly.length) {
      await this.prisma.monthlySnapshot.deleteMany({ where: { id: { in: qboMonthly.map((m) => m.id) } } })
    }

    let periodsDeleted = 0
    for (const periodId of periodIds) {
      const cyRemaining = await this.prisma.import.count({
        where: { schoolId, fiscalPeriodId: periodId, role: 'cy' as ImportRole },
      })
      if (cyRemaining > 0) {
        // A non-QBO CY (an uploaded file) still exists → rebuild statements from it.
        try {
          await this.statements.generate(actor, schoolId, periodId, {})
        } catch {
          /* leave the prior snapshot rather than half-clearing */
        }
      } else {
        await this.prisma.statementSnapshot.deleteMany({ where: { schoolId, fiscalPeriodId: periodId } })
      }
      // Drop a period only when nothing user-owned remains (a QBO-created history
      // year). Guarded on imports + monthly + budget so we never cascade real data.
      const [importsLeft, monthlyLeft, budgetLeft] = await Promise.all([
        this.prisma.import.count({ where: { fiscalPeriodId: periodId } }),
        this.prisma.monthlySnapshot.count({ where: { fiscalPeriodId: periodId } }),
        this.prisma.periodBudget.count({ where: { fiscalPeriodId: periodId } }),
      ])
      if (importsLeft === 0 && monthlyLeft === 0 && budgetLeft === 0) {
        await this.prisma.fiscalPeriod.delete({ where: { id: periodId } })
        periodsDeleted++
      }
    }

    return { imports: qboImports.length, monthly: qboMonthly.length, periods: periodsDeleted }
  }

  /**
   * The QuickBooks company display name — returns the stored value, or fetches it
   * from QBO and persists it (best-effort; null on any failure so status never
   * breaks). This backfills connections made before the name was stored.
   */
  private async companyName(conn: QboConnection): Promise<string | null> {
    if (conn.companyName) return conn.companyName
    try {
      const token = await this.accessToken(conn)
      const name = await this.client.getCompanyName(conn.realmId, token)
      if (name) {
        await this.prisma.qboConnection.update({ where: { schoolId: conn.schoolId }, data: { companyName: name } })
        conn.companyName = name
      }
      return name
    } catch {
      return null
    }
  }

  /**
   * PUBLIC read-only token accessor for same-tenant consumers (the transaction
   * drill-down) that need to call the QBO API on a school's behalf. Loads the
   * school's connection and returns it alongside a valid access token via the SAME
   * refresh-and-persist path `sync` uses (the private accessToken below). Returns
   * null when the school has no direct connection. This does NOT alter refresh
   * semantics — it only exposes read access; the rotation/persist logic is untouched.
   */
  async connectionForSchool(
    schoolId: string,
  ): Promise<{ conn: QboConnection; token: string } | null> {
    const conn = await this.prisma.qboConnection.findUnique({ where: { schoolId } })
    if (!conn) return null
    const token = await this.accessToken(conn)
    return { conn, token }
  }

  /** A valid access token, refreshing (and persisting the rotated refresh token) when near expiry. */
  private async accessToken(conn: QboConnection): Promise<string> {
    // Stored tokens may be encrypted (v1:) or legacy plaintext — decToken handles both.
    if (conn.expiresAt.getTime() - Date.now() > 60_000) return decToken(conn.accessToken)
    const tokens = await this.client.refresh(decToken(conn.refreshToken))
    const expiresAt = new Date(Date.now() + tokens.expiresInSec * 1000)
    await this.prisma.qboConnection.update({
      where: { schoolId: conn.schoolId },
      data: {
        accessToken: encToken(tokens.accessToken),
        refreshToken: encToken(tokens.refreshToken),
        expiresAt,
      },
    })
    // Keep the IN-MEMORY conn in sync. sync-all reuses one `conn` object across
    // every period; QBO rotates the refresh token on each refresh, so without
    // this the next period would re-refresh with the now-invalid old token and
    // fail. After this, conn.expiresAt is far out, so later calls short-circuit.
    conn.accessToken = tokens.accessToken
    conn.refreshToken = tokens.refreshToken
    conn.expiresAt = expiresAt
    return tokens.accessToken
  }

  /**
   * Pull the QBO trial balance as of the period end and run it through the import →
   * generate pipeline (which auto-scans). Returns the generated snapshot summary.
   */
  async sync(actor: User, schoolId: string, periodId: string) {
    const conn = await this.prisma.qboConnection.findUnique({ where: { schoolId } })
    if (!conn) throw new NotFoundException('QuickBooks is not connected for this school.')
    const { snapshot } = await this.syncOnePeriod(actor, schoolId, conn, periodId)
    await this.captureAging(schoolId, conn) // best-effort, as-of today; never aborts the sync
    return snapshot
  }

  /**
   * CONSERVATIVE dead-token classifier. The token endpoint throws
   * `QBO token exchange failed (400)` when Intuit rejects a revoked/expired refresh
   * token (invalid_grant) — a 400/401 there is the one unambiguous "reconnect"
   * signal. Everything else — a 400 on a report call, a 5xx, a network blip — is
   * treated as TRANSIENT (retry), NEVER as dead-token (disable). Erring toward
   * retry is deliberate: a misclassified transient must not silently pause a school.
   */
  private isAuthError(e: unknown): boolean {
    const msg = (e instanceof Error ? e.message : String(e)).toLowerCase()
    // Explicit OAuth failure signals (belt-and-suspenders if the client surfaces them).
    if (msg.includes('invalid_grant') || msg.includes('invalid_token')) return true
    // The refresh endpoint returning 400/401 == a dead/revoked refresh token; a 5xx
    // there is transient and must NOT match.
    if (msg.includes('token exchange failed') && (msg.includes('(400)') || msg.includes('(401)'))) {
      return true
    }
    // A bare 401 unauthorized on any QBO API call (token rejected).
    if (msg.includes('(401)') || msg.includes('unauthorized')) return true
    return false
  }

  /**
   * Resolve a real User to attribute a headless scheduled sync to (imports.uploadedBy
   * + audit userId). Prefers the connection's connectedByUserId; falls back to an
   * owner membership of the school. Null when neither exists → the scheduler records
   * `no_actor` and skips (never syncs with a fabricated actor).
   */
  private async resolveScheduledActor(schoolId: string, conn: QboConnection): Promise<User | null> {
    if (conn.connectedByUserId) {
      const u = await this.prisma.user.findUnique({ where: { id: conn.connectedByUserId } })
      if (u) return u
    }
    const owner = await this.prisma.membership.findFirst({
      where: { schoolId, role: 'owner', status: 'active' },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    })
    return owner?.user ?? null
  }

  /**
   * The current-FY base period for a scheduled sync: the school's newest period NOT
   * ending beyond the current fiscal year (Jul–Jun), bootstrapping the current FY
   * period when the school has none. INLINED from QboOrgService.resolveBasePeriod
   * (identical rule) rather than injected — a QboService↔QboOrgService constructor
   * dep would crash at ESM load (QboOrgService injects QboService; the paramtype
   * would be in the temporal dead zone). Only depends on the already-injected
   * PeriodsService. Keep in sync with QboOrgService.resolveBasePeriod.
   */
  private async resolveBasePeriod(schoolId: string): Promise<{ id: string; label: string }> {
    const now = new Date()
    const endYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() + 1 : now.getUTCFullYear()
    const fyEnd = `${endYear}-06-30`
    const list = await this.periods.listPeriods(schoolId) // newest-first
    const eligible = list.find((p) => p.periodEndDate.slice(0, 10) <= fyEnd)
    if (eligible) return { id: eligible.id, label: eligible.label }
    const { period } = await this.periods.resolveForImport(schoolId, fyEnd, undefined, `FY ${endYear}`)
    return { id: period.id, label: period.label }
  }

  /**
   * The ONE place a SCHEDULED sync happens. NEVER throws — every path resolves to a
   * classified {@link ScheduledSyncOutcome} the scheduler persists. Runs the SAME
   * TB + captureAging path the manual `sync()` uses (so statements/aging/briefing are
   * identical whether a human or the timer triggered it, and the `qbo.synced` audit
   * row that sync-history reads is still written by syncOnePeriod).
   */
  async runScheduledSync(schoolId: string): Promise<ScheduledSyncOutcome> {
    try {
      const conn = await this.prisma.qboConnection.findUnique({ where: { schoolId } })
      if (!conn) return { status: 'error', error: 'QuickBooks is not connected for this school.' }

      const actor = await this.resolveScheduledActor(schoolId, conn)
      if (!actor) return { status: 'no_actor' }

      // Entitlement gate (like syncOrg). Lapsed → SKIP the TB pull but still refresh
      // the token via connectionForSchool (KEEPALIVE), so a paused account's refresh
      // token stays alive and reactivation needs no QBO reconnect.
      if (!(await this.billing.isEntitled(schoolId))) {
        try {
          await this.connectionForSchool(schoolId) // runs the refresh-and-persist path
        } catch (e) {
          if (this.isAuthError(e)) return { status: 'reauth' }
          return { status: 'error', error: shortMessage(e) }
        }
        return { status: 'not_entitled' }
      }

      // Entitled → the current-FY base period, then the SAME path sync() uses.
      const base = await this.resolveBasePeriod(schoolId)
      const { rowCount } = await this.syncOnePeriod(actor, schoolId, conn, base.id)
      await this.captureAging(schoolId, conn) // best-effort, as-of today; never aborts
      return { status: 'synced', rowCount }
    } catch (e) {
      // Classify (order matters: a dead token can surface mid-pull too).
      if (this.isAuthError(e)) return { status: 'reauth' }
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('no trial-balance data')) return { status: 'no_data' }
      return { status: 'error', error: shortMessage(e) }
    }
  }

  /**
   * Toggle a school's automatic nightly sync. On ENABLE, also re-arm: clear
   * needsReauth / reauthNotifiedAt / autoSyncFailures so a stale dead-token episode
   * doesn't keep the row out of the next sweep (mirrors AlertService re-enable).
   * Audited. Returns the refreshed status so the caller renders the autoSync block.
   */
  async setAutoSync(schoolId: string, enabled: boolean, userId: string): Promise<QboStatus> {
    const conn = await this.prisma.qboConnection.findUnique({ where: { schoolId } })
    if (!conn) throw new NotFoundException('QuickBooks is not connected for this school.')
    await this.prisma.qboConnection.update({
      where: { schoolId },
      data: {
        autoSyncEnabled: enabled,
        ...(enabled ? { needsReauth: false, reauthNotifiedAt: null, autoSyncFailures: 0 } : {}),
      },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'qbo.auto_sync.configured',
      targetType: 'qbo_connections',
      metadata: { enabled },
    })
    return this.status(schoolId)
  }

  /**
   * Shared single-period sync body. Pulls the QBO trial balance as of the period
   * end and runs it through the import → generate pipeline (which auto-scans),
   * then logs a 'qbo.synced' audit row. Takes an already-loaded `conn` so the
   * caller controls connection loading (and sync-all loads it once for the batch).
   */
  private async syncOnePeriod(
    actor: User,
    schoolId: string,
    conn: QboConnection,
    periodId: string,
  ): Promise<{ snapshot: Awaited<ReturnType<StatementsService['generate']>>; rowCount: number; label: string }> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)
    const endDate = period.periodEndDate.toISOString().slice(0, 10)
    const token = await this.accessToken(conn)
    const rows = await this.pullTrialBalance(schoolId, conn.realmId, token, fyStartISO(endDate), endDate)
    if (rows.length === 0 || !hasBalances(rows)) {
      throw new BadRequestException('QuickBooks has no trial-balance data for this period.')
    }

    await this.imports.create(actor, schoolId, {
      role: 'cy',
      periodEndDate: endDate,
      periodType: period.periodType,
      label: period.label ?? undefined,
      sourceName: 'QuickBooks Online',
      rows,
      metadata: { source: 'quickbooks', realmId: conn.realmId },
    })

    const snapshot = await this.statements.generate(actor, schoolId, periodId, {})

    await this.audit.write({
      schoolId,
      userId: actor.id,
      action: 'qbo.synced',
      targetType: 'statement_snapshots',
      metadata: { fiscalPeriodId: periodId, rowCount: rows.length },
    })
    return { snapshot, rowCount: rows.length, label: period.label }
  }

  /**
   * Scoped import: pull a chosen mix from QuickBooks in ONE action. Every scope
   * runs under its own try/catch so a partial failure (or a year/month the sandbox
   * has no data for) never aborts the rest. All pulls use the SAME trial-balance
   * report at different "as of" dates. Returns a per-scope summary.
   *  - currentYear (default on): the period's CY trial balance → statements.
   *  - priorYear: the prior FY-end TB → the period's PY comparative → regenerate.
   *  - monthly: a TB as of each month-end in the period's FY → monthly snapshots.
   *  - historyYears N: each older FY-end → its own period's CY (multi-year trend).
   */
  async syncScope(actor: User, schoolId: string, dto: QbSyncScopeDto): Promise<QboSyncScopeResult> {
    const conn = await this.prisma.qboConnection.findUnique({ where: { schoolId } })
    if (!conn) throw new NotFoundException('QuickBooks is not connected for this school.')
    const period = await this.periods.getOwnedPeriod(schoolId, dto.periodId)
    const endDate = period.periodEndDate.toISOString().slice(0, 10)
    const token = await this.accessToken(conn) // refresh once up front; reused below
    const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))
    const result: QboSyncScopeResult = {}

    // 1. Current year (CY) — the base. Reuses the single-period helper (audits too).
    if (dto.currentYear !== false) {
      try {
        const r = await this.syncOnePeriod(actor, schoolId, conn, dto.periodId)
        result.currentYear = { ok: true, rowCount: r.rowCount }
      } catch (e) {
        result.currentYear = { ok: false, error: msg(e) }
      }
    }

    // 2. Prior-year comparative (PY) for THIS period (prior FY-end, same period slot).
    if (dto.priorYear) {
      try {
        const priorEnd = shiftYears(endDate, -1)
        const rows = await this.pullTrialBalance(schoolId, conn.realmId, token, fyStartISO(priorEnd), priorEnd)
        if (rows.length === 0 || !hasBalances(rows)) {
          throw new BadRequestException('QuickBooks has no prior-year trial-balance data.')
        }
        await this.imports.create(actor, schoolId, {
          role: 'py',
          periodEndDate: endDate,
          periodType: period.periodType,
          label: period.label ?? undefined,
          sourceName: 'QuickBooks Online',
          rows,
          metadata: { source: 'quickbooks', realmId: conn.realmId },
        })
        await this.statements.generate(actor, schoolId, dto.periodId, {})
        result.priorYear = { ok: true, rowCount: rows.length }
      } catch (e) {
        result.priorYear = { ok: false, error: msg(e) }
      }
    }

    // 3. Monthly snapshots — a TB as of each month-end in the period's FY.
    if (dto.monthly) {
      const monthKeys = fyMonthKeys(fyStartYearForPeriodEnd(period.periodEndDate))
      let imported = 0
      let skipped = 0
      const errors: string[] = []
      for (const mk of monthKeys) {
        const monthEnd = monthEndISO(mk)
        if (monthEnd > endDate) {
          skipped++ // month falls after the period end → no data yet
          continue
        }
        try {
          // Cumulative fiscal-YTD: from the period's FY start through this month-end.
          const rows = await this.pullTrialBalance(schoolId, conn.realmId, token, fyStartISO(endDate), monthEnd)
          if (rows.length === 0 || !hasBalances(rows)) {
            skipped++ // month predates the company's books (all-zero balances)
            continue
          }
          await this.monthlySnapshots.create(actor, schoolId, dto.periodId, {
            monthKey: mk,
            sourceName: 'QuickBooks Online',
            rows,
          })
          imported++
        } catch (e) {
          errors.push(`${mk}: ${msg(e)}`)
        }
      }
      result.monthly = { imported, skipped, errors }
    }

    // 4. Multiple prior years — each older FY-end into its OWN period (CY).
    // allHistory scans back until QuickBooks returns an empty year (bounded by a
    // hard cap); otherwise it's the exact count requested.
    const HISTORY_CAP = 30
    const allHistory = dto.allHistory === true
    const historyYears = allHistory ? HISTORY_CAP : Math.max(0, Math.min(dto.historyYears ?? 0, 25))
    if (historyYears > 0) {
      result.history = []
      for (let y = 1; y <= historyYears; y++) {
        const yEnd = shiftYears(endDate, -y)
        const yearNum = Number(yEnd.slice(0, 4))
        try {
          const rows = await this.pullTrialBalance(schoolId, conn.realmId, token, fyStartISO(yEnd), yEnd)
          if (rows.length === 0 || !hasBalances(rows)) {
            if (allHistory) break // reached the years before the company's books began → stop
            result.history.push({ year: yearNum, ok: false, error: 'No QuickBooks data for this year.' })
            continue
          }
          const imp = await this.imports.create(actor, schoolId, {
            role: 'cy',
            periodEndDate: yEnd,
            periodType: period.periodType,
            label: `FY ${yearNum}`,
            sourceName: 'QuickBooks Online',
            rows,
            metadata: { source: 'quickbooks', realmId: conn.realmId },
          })
          await this.statements.generate(actor, schoolId, imp.fiscalPeriodId, {})
          await this.audit.write({
            schoolId,
            userId: actor.id,
            action: 'qbo.synced',
            targetType: 'statement_snapshots',
            metadata: { fiscalPeriodId: imp.fiscalPeriodId, rowCount: rows.length },
          })
          result.history.push({ year: yearNum, ok: true, rowCount: rows.length })
        } catch (e) {
          result.history.push({ year: yearNum, ok: false, error: msg(e) })
        }
      }
    }

    await this.captureAging(schoolId, conn) // best-effort, as-of today; never aborts the sync
    return result
  }

  /**
   * Sync every period for the school, reusing the single-period helper. Resilient:
   * each period runs under its own try/catch so one period failing (e.g. QBO has no
   * trial-balance rows for it) never aborts the batch. Sequential by design — token
   * refresh and the import/generate stack shouldn't stampede. Returns a per-period
   * summary; HTTP 200 even when some/all periods fail (404 only if not connected).
   */
  async syncAll(actor: User, schoolId: string): Promise<QboSyncAllResult> {
    const conn = await this.prisma.qboConnection.findUnique({ where: { schoolId } })
    if (!conn) throw new NotFoundException('QuickBooks is not connected for this school.')

    const periods = await this.periods.listPeriods(schoolId)
    const results: QboSyncAllItem[] = []
    for (const p of periods) {
      try {
        const r = await this.syncOnePeriod(actor, schoolId, conn, p.id)
        results.push({ periodId: p.id, label: p.label, ok: true, rowCount: r.rowCount })
      } catch (err) {
        results.push({
          periodId: p.id,
          label: p.label,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    const succeeded = results.filter((r) => r.ok).length
    return { total: results.length, succeeded, failed: results.length - succeeded, results }
  }

  /**
   * Every QuickBooks P&L account (engine 40000/60000 blocks) with its current
   * category, for the "review your categories" step. Reads only LOCAL imports +
   * mapping — works without a live connection (review survives a
   * disconnect-keep-data). ALL import roles contribute (a QBO py comparative
   * carries accounts too); the newest period's active import supplies each
   * account's name/amount/periodLabel, older periods only ADD accounts.
   */
  async reviewAccounts(schoolId: string): Promise<QboReviewAccountsResult> {
    const { mapping } = await this.mapping.ensureActive(schoolId)
    const entries = (mapping.entries ?? {}) as Record<string, string>

    const imports = await this.prisma.import.findMany({
      where: { schoolId, metadata: { path: ['source'], equals: 'quickbooks' } },
      include: { fiscalPeriod: { select: { label: true, periodEndDate: true } } },
      orderBy: { createdAt: 'desc' },
    })

    // Keep only the ACTIVE import per (period, role) — newest createdAt wins,
    // and the list is already createdAt-desc so first-seen per key IS the
    // active one. Then walk the survivors newest-period-first with cy BEFORE
    // py/audit within a period — otherwise a later-created py comparative on
    // the same period would win the first-seen union and the review card would
    // show prior-year amounts for accounts that exist in both years.
    const ROLE_PRIORITY: Record<string, number> = { cy: 0, py: 1, audit: 2 }
    const activeByKey = new Map<string, (typeof imports)[number]>()
    for (const imp of imports) {
      const key = `${imp.fiscalPeriodId}/${imp.role}`
      if (!activeByKey.has(key)) activeByKey.set(key, imp)
    }
    const survivors = [...activeByKey.values()].sort(
      (a, b) =>
        b.fiscalPeriod.periodEndDate.getTime() - a.fiscalPeriod.periodEndDate.getTime() ||
        (ROLE_PRIORITY[a.role] ?? 9) - (ROLE_PRIORITY[b.role] ?? 9),
    )

    const byAcct = new Map<number, QboReviewAccount>()
    for (const imp of survivors) {
      const rows = (imp.rows ?? []) as Array<{ acct: number; desc: string; total: number }>
      for (const row of rows) {
        const section = qboPlSection(row.acct)
        if (!section || byAcct.has(row.acct)) continue // first-seen (newest) wins
        const def = section === 'revenue' ? 'other' : 'fixedOther'
        const category = entries[String(row.acct)] ?? def
        const isDefault = category === def
        // Only suggest while still on the default, and never echo the current pick.
        const suggested = isDefault ? suggestCategory(row.desc, section) : null
        // A py-sourced row's amount is the PRIOR year's balance — say so.
        const label = imp.fiscalPeriod.label ?? null
        byAcct.set(row.acct, {
          acct: row.acct,
          name: row.desc,
          section,
          amount: row.total,
          periodLabel: imp.role === 'py' && label ? `${label} · prior year` : label,
          category,
          isDefault,
          suggestion: suggested === category ? null : suggested,
        })
      }
    }

    // Contract order: revenue before expense; within a section needs-review
    // first, then |amount| descending, tie-broken by acct ascending.
    const accounts = [...byAcct.values()].sort(
      (a, b) =>
        (a.section === 'revenue' ? 0 : 1) - (b.section === 'revenue' ? 0 : 1) ||
        Number(b.isDefault) - Number(a.isDefault) ||
        Math.abs(b.amount) - Math.abs(a.amount) ||
        a.acct - b.acct,
    )
    return {
      accounts,
      summary: {
        total: accounts.length,
        needsReview: accounts.filter((a) => a.isDefault).length,
        revenue: accounts.filter((a) => a.section === 'revenue').length,
        expense: accounts.filter((a) => a.section === 'expense').length,
      },
    }
  }

  /**
   * Persist the user's category picks for QuickBooks P&L accounts and recompute
   * everything derived from the mapping. Validation is all-or-nothing (400
   * BEFORE any persist); the ONE canonical persist is mergeEntries. Recomputes
   * are resilient like syncAll — the mapping is already saved, so partial
   * rebuild failures return 200 with the failed ids listed, never a 5xx.
   */
  async applyReview(
    actor: User,
    schoolId: string,
    entries: Record<string, string>,
  ): Promise<QboReviewApplyResult> {
    const problems: string[] = []
    for (const [key, value] of Object.entries(entries ?? {})) {
      // No leading zeros: '040012' would persist verbatim yet never match the
      // engine's String(acct) lookups — a dangling entry.
      const section = /^[1-9]\d*$/.test(key) ? qboPlSection(Number(key)) : null
      if (!section) {
        problems.push(`Account ${key} is not a QuickBooks P&L account`)
        continue
      }
      // Pickable = a real SCoA category of the same section that rolls into
      // totals ('ancillary' excluded) and isn't statement-only ('studActExp').
      const def = SCOA_CATEGORIES[value as SCoaCategory]
      if (!def || def.section !== section || def.includedInTotals === false || value === 'studActExp') {
        problems.push(`Category ${value} is not valid for account ${key}`)
      }
    }
    if (problems.length) throw new BadRequestException(problems)

    // The one canonical persist (re-validates categories — harmless). If it
    // throws, nothing below runs and nothing was changed.
    const { merged } = await this.mapping.mergeEntries(schoolId, entries)

    // Rebuild statements for every period with ANY QuickBooks import (a py
    // comparative feeds generate too). generate() re-reads the active mapping,
    // so cy + py columns both reclassify; when a period's active cy is an
    // uploaded file the rebuild is a harmless regenerate of the same source.
    const statements = { rebuilt: 0, failed: [] as string[] }
    const qboImports = await this.prisma.import.findMany({
      where: { schoolId, metadata: { path: ['source'], equals: 'quickbooks' } },
      select: { fiscalPeriodId: true },
    })
    for (const periodId of new Set(qboImports.map((i) => i.fiscalPeriodId))) {
      // A period holding ONLY a py comparative (its cy pull failed) can't
      // generate — skip it instead of failing on every save forever.
      const cyCount = await this.prisma.import.count({
        where: { schoolId, fiscalPeriodId: periodId, role: 'cy' as ImportRole },
      })
      if (cyCount === 0) continue
      try {
        await this.statements.generate(actor, schoolId, periodId, {})
        statements.rebuilt++
      } catch {
        statements.failed.push(periodId)
      }
    }

    // Rebuild QBO monthly snapshots from their STORED sourceRows — create() is
    // an upsert on (period, monthKey) that re-runs the engine with the CURRENT
    // mapping and stamps the new mappingVersion. Non-QBO months are untouched.
    const monthly = { rebuilt: 0, failed: [] as string[] }
    const months = await this.prisma.monthlySnapshot.findMany({
      where: { schoolId, sourceName: 'QuickBooks Online' },
      select: { fiscalPeriodId: true, monthKey: true, sourceRows: true },
    })
    for (const m of months) {
      try {
        await this.monthlySnapshots.create(actor, schoolId, m.fiscalPeriodId, {
          monthKey: m.monthKey,
          sourceName: 'QuickBooks Online',
          rows: m.sourceRows as unknown as MonthlyRowDto[],
        })
        monthly.rebuilt++
      } catch {
        monthly.failed.push(`${m.fiscalPeriodId}/${m.monthKey}`)
      }
    }

    await this.audit.write({
      schoolId,
      userId: actor.id,
      action: 'qbo.categories_reviewed',
      targetType: 'mapping',
      targetId: schoolId,
      metadata: {
        merged,
        statementsRebuilt: statements.rebuilt,
        monthlyRebuilt: monthly.rebuilt,
        failures: [...statements.failed, ...monthly.failed],
      },
    })

    return { merged, statements, monthly }
  }
}
