// Org-level QuickBooks console. One screen's worth of backend: a per-school
// connection OVERVIEW across the caller's organization, and a batch SYNC that
// runs the existing per-school scoped import for every connected school —
// so a multi-school org connects/syncs from one place instead of swapping the
// active school N times. NOTE Intuit's OAuth model is strictly one token per
// company (realm), so per-school authorization is irreducible; this console
// removes every OTHER swap. Org isolation follows OrgBriefingService: filter
// the caller's active memberships to the org, 403 when none (JwtAuthGuard-only
// route — RolesGuard/EntitlementGuard can't resolve a schoolId here, so role +
// entitlement are enforced PER SCHOOL below, mirroring the school routes).
import { ForbiddenException, Injectable } from '@nestjs/common'
import type { User } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import { BillingService } from '../billing/billing.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import { QboClient } from './qbo.client.js'
import { QboService, type QboSyncScopeResult } from './qbo.service.js'
import type { QbOrgSyncDto } from './dto/qbo.dto.js'

export interface QboOrgSchool {
  schoolId: string
  name: string
  role: string
  /** Whether the CALLER can connect/sync this school (owner/accountant). */
  canManage: boolean
  connected: boolean
  companyName: string | null
  environment: string | null
  connectedAt: string | null
  lastSyncedAt: string | null
  periodCount: number
  newestPeriod: { id: string; label: string } | null
}

export interface QboOrgOverview {
  configured: boolean
  connectedCount: number
  schools: QboOrgSchool[]
}

export interface QboOrgSyncItem {
  schoolId: string
  name: string
  status: 'synced' | 'failed' | 'skipped'
  /** Present for skipped/failed rows: why nothing (or not everything) happened. */
  reason?: string
  periodId?: string
  periodLabel?: string
  scope?: QboSyncScopeResult
}

export interface QboOrgSyncResult {
  total: number
  synced: number
  failed: number
  skipped: number
  results: QboOrgSyncItem[]
}

@Injectable()
export class QboOrgService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: PeriodsService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
    private readonly client: QboClient,
    private readonly qbo: QboService,
  ) {}

  /** The caller's active memberships inside `orgId` (403 when they have none).
   *  PUBLIC: OrgQboCompanyService reuses the exact same org-isolation gate. */
  async orgMemberships(user: User, orgId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId: user.id, status: 'active' },
      include: { school: true },
      orderBy: { createdAt: 'asc' },
    })
    const inOrg = memberships.filter((m) => m.school.organizationId === orgId)
    if (inOrg.length === 0) {
      throw new ForbiddenException('You do not have access to this organization.')
    }
    return inOrg
  }

  /**
   * Per-school QuickBooks status across the org — connection, company, last sync,
   * period coverage. companyName is the STORED value only (no per-school network
   * fetch; the school-level status endpoint lazily backfills it on first view).
   */
  async overview(user: User, orgId: string): Promise<QboOrgOverview> {
    const inOrg = await this.orgMemberships(user, orgId)
    const schools = await Promise.all(
      inOrg.map(async (m): Promise<QboOrgSchool> => {
        const [conn, last, newest, periodCount] = await Promise.all([
          this.prisma.qboConnection.findUnique({ where: { schoolId: m.schoolId } }),
          this.prisma.auditLog.findFirst({
            where: { schoolId: m.schoolId, action: 'qbo.synced' },
            orderBy: { createdAt: 'desc' },
          }),
          this.prisma.fiscalPeriod.findFirst({
            where: { schoolId: m.schoolId },
            orderBy: { periodEndDate: 'desc' },
          }),
          this.prisma.fiscalPeriod.count({ where: { schoolId: m.schoolId } }),
        ])
        return {
          schoolId: m.schoolId,
          name: m.school.name,
          role: m.role,
          canManage: m.role === 'owner' || m.role === 'accountant',
          connected: !!conn,
          companyName: conn?.companyName ?? null,
          environment: conn?.environment ?? null,
          connectedAt: conn?.createdAt.toISOString() ?? null,
          lastSyncedAt: last?.createdAt.toISOString() ?? null,
          periodCount,
          newestPeriod: newest ? { id: newest.id, label: newest.label } : null,
        }
      }),
    )
    schools.sort((a, b) => a.name.localeCompare(b.name))
    return {
      configured: this.client.isConfigured(),
      connectedCount: schools.filter((s) => s.connected).length,
      schools,
    }
  }

  /**
   * The period a batch sync should target: the school's newest period that does
   * NOT end beyond the current fiscal year (Jul–Jun platform convention). The
   * upper bound matters — "newest" alone would let a future-FY budget shell
   * (e.g. an FY+1 period created for next year's budget) swallow current-year
   * actuals as a phantom snapshot. When the school has no eligible period,
   * resolve-or-create the current FY via resolveForImport (end-date keyed, so a
   * periodType-string mismatch can't spawn a duplicate period).
   * PUBLIC: OrgQboCompanyService targets the same base period per school.
   */
  async resolveBasePeriod(schoolId: string): Promise<{ id: string; label: string }> {
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
   * Batch scoped import across the org. Every in-scope school gets a result row
   * (synced / failed / skipped+reason) and one school's failure never aborts the
   * rest. Sequential by design, like syncAll — the import→generate stack and
   * Intuit token refreshes shouldn't stampede. Role + entitlement are enforced
   * per school here because this org route can't carry the school-level guards.
   */
  async syncOrg(user: User, orgId: string, dto: QbOrgSyncDto): Promise<QboOrgSyncResult> {
    const inOrg = await this.orgMemberships(user, orgId)
    // An explicit schoolIds array — even [] — means "exactly these": an empty
    // list syncs nothing rather than falling through to the full org.
    const requested = dto.schoolIds != null ? new Set(dto.schoolIds) : null
    const targets = requested ? inOrg.filter((m) => requested.has(m.schoolId)) : inOrg

    const results: QboOrgSyncItem[] = []
    for (const m of targets) {
      const base = { schoolId: m.schoolId, name: m.school.name }
      if (m.role !== 'owner' && m.role !== 'accountant') {
        results.push({ ...base, status: 'skipped', reason: 'You need owner or accountant access to sync this school.' })
        continue
      }
      const conn = await this.prisma.qboConnection.findUnique({ where: { schoolId: m.schoolId } })
      if (!conn) {
        results.push({ ...base, status: 'skipped', reason: 'QuickBooks is not connected for this school.' })
        continue
      }
      if (!(await this.billing.isEntitled(m.schoolId))) {
        results.push({ ...base, status: 'skipped', reason: 'Subscription required to import data for this school.' })
        continue
      }
      try {
        const period = await this.resolveBasePeriod(m.schoolId)
        const scope = await this.qbo.syncScope(user, m.schoolId, {
          periodId: period.id,
          currentYear: dto.currentYear,
          priorYear: dto.priorYear,
          monthly: dto.monthly,
          historyYears: dto.historyYears,
          allHistory: dto.allHistory,
        })
        // syncScope is per-scope resilient; surface an overall failure only when
        // the base CY pull itself failed (comparative/monthly gaps stay visible
        // in `scope` without failing the school).
        const cyFailed = scope.currentYear && scope.currentYear.ok === false
        results.push({
          ...base,
          status: cyFailed ? 'failed' : 'synced',
          ...(cyFailed ? { reason: scope.currentYear?.error ?? 'Current-year import failed.' } : {}),
          periodId: period.id,
          periodLabel: period.label,
          scope,
        })
      } catch (e) {
        results.push({
          ...base,
          status: 'failed',
          reason: e instanceof Error ? e.message : String(e),
        })
      }
    }

    const summary = {
      total: results.length,
      synced: results.filter((r) => r.status === 'synced').length,
      failed: results.filter((r) => r.status === 'failed').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
    }
    // Org-level trace of the batch itself (who ran it, scope, outcome counts) —
    // per-school successes already audit 'qbo.synced' inside syncScope, but
    // skipped/failed schools would otherwise leave no trace.
    await this.audit.write({
      organizationId: orgId,
      userId: user.id,
      action: 'qbo.org_synced',
      targetType: 'organizations',
      targetId: orgId,
      metadata: {
        ...summary,
        scope: {
          currentYear: dto.currentYear ?? true,
          priorYear: dto.priorYear ?? false,
          monthly: dto.monthly ?? false,
          historyYears: dto.historyYears ?? 0,
          allHistory: dto.allHistory ?? false,
          schoolIds: dto.schoolIds ?? null,
        },
      },
    })
    return { ...summary, results }
  }
}
