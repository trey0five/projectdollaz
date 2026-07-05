// Phase 6 — QuickBooks Online connector orchestration. Owns the per-school OAuth
// connection (connect / refresh / disconnect) and the "sync" that pulls the trial
// balance and feeds it through the SAME path as a file upload (ImportsService →
// StatementsService.generate), which auto-scans on snapshot creation. Config-gated:
// disabled (501-able) when QB_OAUTH_CLIENT_ID is unset.
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { ImportRole, QboConnection, User } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import { ImportsService } from '../imports/imports.service.js'
import { StatementsService } from '../statements/statements.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import { MonthlySnapshotsService } from '../monthly/monthly-snapshots.service.js'
import { fyMonthKeys, fyStartYearForPeriodEnd } from '../monthly/fy-elapsed.js'
import type { QbSyncScopeDto } from './dto/qbo.dto.js'
import { QboClient } from './qbo.client.js'

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
    private readonly audit: AuditService,
  ) {}

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
    }
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
    const tokens = await this.client.exchangeCode(code)
    const expiresAt = new Date(Date.now() + tokens.expiresInSec * 1000)
    const environment = this.config.get<string>('quickbooks.environment') ?? 'sandbox'
    const data = {
      realmId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt,
      environment,
      connectedByUserId: userId,
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

  /** A valid access token, refreshing (and persisting the rotated refresh token) when near expiry. */
  private async accessToken(conn: QboConnection): Promise<string> {
    if (conn.expiresAt.getTime() - Date.now() > 60_000) return conn.accessToken
    const tokens = await this.client.refresh(conn.refreshToken)
    const expiresAt = new Date(Date.now() + tokens.expiresInSec * 1000)
    await this.prisma.qboConnection.update({
      where: { schoolId: conn.schoolId },
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
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
    return snapshot
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
    const rows = await this.client.getTrialBalance(conn.realmId, token, endDate)
    if (rows.length === 0) {
      throw new BadRequestException('QuickBooks returned no trial-balance rows for this period.')
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
        const rows = await this.client.getTrialBalance(conn.realmId, token, priorEnd)
        if (rows.length === 0) {
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
          const rows = await this.client.getTrialBalance(conn.realmId, token, monthEnd)
          if (rows.length === 0) {
            skipped++
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
          const rows = await this.client.getTrialBalance(conn.realmId, token, yEnd)
          if (rows.length === 0) {
            if (allHistory) break // reached the years before the company existed → stop
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
}
