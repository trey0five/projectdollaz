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
  environment: string | null
  connectedAt: string | null
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
    return {
      configured: this.client.isConfigured(),
      connected: !!conn,
      realmId: conn?.realmId ?? null,
      environment: conn?.environment ?? null,
      connectedAt: conn?.createdAt ? conn.createdAt.toISOString() : null,
    }
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

  /** A valid access token, refreshing (and persisting the rotated refresh token) when near expiry. */
  private async accessToken(conn: QboConnection): Promise<string> {
    if (conn.expiresAt.getTime() - Date.now() > 60_000) return conn.accessToken
    const tokens = await this.client.refresh(conn.refreshToken)
    await this.prisma.qboConnection.update({
      where: { schoolId: conn.schoolId },
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: new Date(Date.now() + tokens.expiresInSec * 1000),
      },
    })
    return tokens.accessToken
  }

  /**
   * Pull the QBO trial balance as of the period end and run it through the import →
   * generate pipeline (which auto-scans). Returns the generated snapshot summary.
   */
  async sync(actor: User, schoolId: string, periodId: string) {
    const conn = await this.prisma.qboConnection.findUnique({ where: { schoolId } })
    if (!conn) throw new NotFoundException('QuickBooks is not connected for this school.')

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
    return snapshot
  }
}
