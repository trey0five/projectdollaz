// Phase 6 — QuickBooks Online connector orchestration. Owns the per-school OAuth
// connection (connect / refresh / disconnect) and the "sync" that pulls the trial
// balance and feeds it through the SAME path as a file upload (ImportsService →
// StatementsService.generate), which auto-scans on snapshot creation. Config-gated:
// disabled (501-able) when QB_OAUTH_CLIENT_ID is unset.
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { QboConnection, User } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import { ImportsService } from '../imports/imports.service.js'
import { StatementsService } from '../statements/statements.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import { QboClient } from './qbo.client.js'

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

  async disconnect(schoolId: string, userId: string): Promise<QboStatus> {
    await this.prisma.qboConnection.deleteMany({ where: { schoolId } })
    await this.audit.write({
      schoolId,
      userId,
      action: 'qbo.disconnected',
      targetType: 'qbo_connections',
      metadata: {},
    })
    return this.status(schoolId)
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
