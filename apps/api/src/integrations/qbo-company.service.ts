// Diocesan QuickBooks (Topology B) — ONE QuickBooks company for the whole
// organization, split by Location (QBO API: Department) or Class. A diocese
// keeps every school's books in a single QBO file; this service maps each
// dimension value onto a platform school and imports per-school trial balances
// SYNTHESIZED from summarized P&L + Balance Sheet reports (the TrialBalance
// report ignores summarize_column_by — verified), via the pure
// qbo-company.synth module. Coexists with the per-school connector: a school's
// own QboConnection always wins (the org import skips it).
//
// Org isolation + per-school role/entitlement mirror QboOrgService exactly
// (JwtAuthGuard-only routes — RolesGuard/EntitlementGuard can't resolve a
// schoolId here). Window-outer import: each window's two reports are pulled
// ONCE and served to every school, so cost scales with windows, not schools.
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { ImportRole, OrgQboConnection, OrgQboMapping, User } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { BillingService } from '../billing/billing.service.js'
import { ImportsService } from '../imports/imports.service.js'
import { StatementsService } from '../statements/statements.service.js'
import { MonthlySnapshotsService } from '../monthly/monthly-snapshots.service.js'
import { MappingService } from '../mapping/mapping.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import { fyMonthKeys, fyStartYearForPeriodEnd } from '../monthly/fy-elapsed.js'
import { QboClient, type QboAccountMetaMaps, type QboDimensionEntity } from './qbo.client.js'
import { decToken, encToken } from './qbo-crypto.js'
import { QboOrgService } from './qbo-org.service.js'
import {
  applyBalancePlug,
  buildSchoolRows,
  flattenRows,
  matchColumns,
  notSpecifiedTotals,
  sumColumn,
  NOT_SPECIFIED_ID,
  type MatchedColumns,
  type FlatRow,
} from './qbo-company.synth.js'
import type { OrgQbCompanyImportDto, OrgQbMappingDto } from './dto/qbo.dto.js'

// Local copies of qbo.service's private date helpers (that file is surgical-
// change-only; these are three lines each and the FY convention is platform-wide).

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

/** The fiscal-year START for an annual period END date (2026-06-30 → 2025-07-01). */
function fyStartISO(periodEndISO: string): string {
  const d = new Date(`${shiftYears(periodEndISO, -1)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** The CURRENT fiscal year's end (Jun 30, Jul–Jun platform convention). */
function currentFyEndISO(): string {
  const now = new Date()
  const endYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() + 1 : now.getUTCFullYear()
  return `${endYear}-06-30`
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

const NO_DATA_REASON = "QuickBooks has no data for this school's location(s) in this window."

// ── Response shapes (the web builds against these verbatim) ───────────────────

export interface OrgQboCompanyStatus {
  configured: boolean
  connected: boolean
  realmId: string | null
  companyName: string | null
  environment: string | null
  /** Active split dimension — 'department' even when disconnected (the default). */
  dimension: 'department' | 'class'
  connectedAt: string | null
  lastImportedAt: string | null
  /** Stored decisions for the ACTIVE dimension; null when disconnected. */
  mapping: { mappedCount: number; ignoredCount: number } | null
}

export interface OrgQboValue {
  qboId: string
  name: string
  active: boolean
  parentId: string | null
  schoolId: string | null
  ignored: boolean
  mapped: boolean
  /** CY P&L gross activity in this value's column (best-effort; null on failure). */
  activityCY: number | null
}

export interface OrgQboNotSpecifiedState {
  schoolId: string | null
  ignored: boolean
  mapped: boolean
}

export interface OrgQboMappingView {
  dimension: 'department' | 'class'
  values: { department: OrgQboValue[]; class: OrgQboValue[] }
  notSpecified: { department: OrgQboNotSpecifiedState; class: OrgQboNotSpecifiedState }
  schools: Array<{ id: string; name: string; canManage: boolean; directConnection: boolean }>
}

interface OrgScopeOutcome {
  ok: boolean
  rowCount?: number
  imbalance?: number
  error?: string
}

export interface OrgQboImportRow {
  schoolId: string
  name: string
  status: 'synced' | 'failed' | 'skipped'
  reason?: string
  /** Current QBO names of the dimension values feeding this school. */
  dimensionNames: string[]
  periodId?: string
  periodLabel?: string
  /** CY plug amount when an acct-399 interlocation plug row was added. */
  balancePlug?: number
  scope?: {
    currentYear?: OrgScopeOutcome
    priorYear?: OrgScopeOutcome
    monthly?: { imported: number; skipped: number; errors: string[] }
  }
}

export interface OrgQboImportResult {
  total: number
  synced: number
  failed: number
  skipped: number
  /** CY P&L totals left in "Not Specified" (0s when it's mapped to a school). */
  notSpecified: { revenue: number; expense: number }
  results: OrgQboImportRow[]
}

/** One window's two reports, flattened + column-matched once for every school. */
interface WindowReports {
  pnlFlat: FlatRow[]
  bsFlat: FlatRow[]
  pnlCols: MatchedColumns
  bsCols: MatchedColumns
}

/** Per-school working state across the window-outer import loop. */
interface SchoolPrep {
  schoolId: string
  name: string
  /** Mapped values still present in QBO ('__unspecified__' is always "present"). */
  validQboIds: string[]
  dimensionNames: string[]
  /** Stored names of mapped values that vanished from QBO (noted on the row). */
  lostNames: string[]
  skipReason: string | null
  period: { id: string; label: string; endISO: string; periodType: string } | null
  scope: NonNullable<OrgQboImportRow['scope']>
  cyFailed: string | null
  importedAny: boolean
  balancePlug: number | null
}

@Injectable()
export class OrgQboCompanyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly client: QboClient,
    private readonly qboOrg: QboOrgService,
    private readonly billing: BillingService,
    private readonly imports: ImportsService,
    private readonly statements: StatementsService,
    private readonly monthlySnapshots: MonthlySnapshotsService,
    private readonly mapping: MappingService,
    private readonly audit: AuditService,
  ) {}

  /** "Manager" for org-company actions = owner|accountant on ≥1 org school. */
  private requireManager(inOrg: Array<{ role: string }>): void {
    if (!inOrg.some((m) => m.role === 'owner' || m.role === 'accountant')) {
      throw new ForbiddenException(
        'You need owner or accountant access to manage the organization QuickBooks connection.',
      )
    }
  }

  /**
   * A valid access token for the ORG connection, refreshing (and persisting the
   * rotated refresh token) when near expiry — the OrgQboConnection twin of
   * QboService.accessToken, same rotation discipline.
   */
  private async accessToken(conn: OrgQboConnection): Promise<string> {
    // Stored tokens may be encrypted (v1:) or legacy plaintext — decToken handles both.
    if (conn.expiresAt.getTime() - Date.now() > 60_000) return decToken(conn.accessToken)
    const tokens = await this.client.refresh(decToken(conn.refreshToken))
    const expiresAt = new Date(Date.now() + tokens.expiresInSec * 1000)
    await this.prisma.orgQboConnection.update({
      where: { id: conn.id },
      data: {
        accessToken: encToken(tokens.accessToken),
        refreshToken: encToken(tokens.refreshToken),
        expiresAt,
      },
    })
    // Keep the IN-MEMORY conn in sync: QBO rotates the refresh token on every
    // refresh, so a later refresh in the same batch would otherwise replay the
    // now-invalid old token and fail. Fresh expiresAt short-circuits above.
    conn.accessToken = tokens.accessToken
    conn.refreshToken = tokens.refreshToken
    conn.expiresAt = expiresAt
    return tokens.accessToken
  }

  private activeDimension(conn: OrgQboConnection | null): 'department' | 'class' {
    return conn?.dimension === 'class' ? 'class' : 'department'
  }

  // ── Status ──────────────────────────────────────────────────────────────────

  /** DB-only status (cheap — no Intuit call). Any org member may read it. */
  async status(user: User, orgId: string): Promise<OrgQboCompanyStatus> {
    await this.qboOrg.orgMemberships(user, orgId)
    return this.statusBody(orgId)
  }

  private async statusBody(orgId: string): Promise<OrgQboCompanyStatus> {
    const conn = await this.prisma.orgQboConnection.findUnique({ where: { organizationId: orgId } })
    // Last-imported derives from the newest org-scoped import audit row (no
    // schema field), matching the per-school lastSyncedAt approach. Bounded to
    // THIS connection's lifetime so a disconnect→reconnect to a different
    // company doesn't inherit the previous company's import time.
    const last = conn
      ? await this.prisma.auditLog.findFirst({
          where: {
            organizationId: orgId,
            action: 'qbo.org_company_imported',
            createdAt: { gte: conn.createdAt },
          },
          orderBy: { createdAt: 'desc' },
        })
      : null
    const dimension = this.activeDimension(conn)
    let mapping: OrgQboCompanyStatus['mapping'] = null
    if (conn) {
      const [mappedCount, ignoredCount] = await Promise.all([
        this.prisma.orgQboMapping.count({
          where: { connectionId: conn.id, dimension, schoolId: { not: null } },
        }),
        this.prisma.orgQboMapping.count({
          where: { connectionId: conn.id, dimension, schoolId: null },
        }),
      ])
      mapping = { mappedCount, ignoredCount }
    }
    return {
      configured: this.client.isConfigured(),
      connected: !!conn,
      realmId: conn?.realmId ?? null,
      companyName: conn?.companyName ?? null,
      environment: conn?.environment ?? null,
      dimension,
      connectedAt: conn?.createdAt.toISOString() ?? null,
      lastImportedAt: last?.createdAt.toISOString() ?? null,
      mapping,
    }
  }

  // ── Connect / disconnect ────────────────────────────────────────────────────

  /** The Intuit consent URL; state carries `org:<orgId>` so the callback page can route. */
  async connectUrl(user: User, orgId: string): Promise<{ url: string }> {
    const inOrg = await this.qboOrg.orgMemberships(user, orgId)
    this.requireManager(inOrg)
    if (!this.client.isConfigured()) {
      throw new BadRequestException('QuickBooks connector is not configured on this server.')
    }
    return { url: this.client.buildAuthorizeUrl(`org:${orgId}`) }
  }

  /**
   * Complete the OAuth handshake for the ORG connection. Any per-school
   * connection in this org pointing at the SAME realm is FOLDED in (the row is
   * deleted, imported data untouched) — one company must not be connected at
   * two levels at once; the school is fed through its mapping instead.
   */
  async callback(
    user: User,
    orgId: string,
    code: string,
    realmId: string,
  ): Promise<OrgQboCompanyStatus & { replacedSchoolConnections: string[] }> {
    const inOrg = await this.qboOrg.orgMemberships(user, orgId)
    this.requireManager(inOrg)
    if (!this.client.isConfigured()) {
      throw new BadRequestException('QuickBooks connector is not configured on this server.')
    }
    const tokens = await this.client.exchangeCode(code)
    const expiresAt = new Date(Date.now() + tokens.expiresInSec * 1000)
    const environment = this.config.get<string>('quickbooks.environment') ?? 'sandbox'
    const companyName = await this.client.getCompanyName(realmId, tokens.accessToken)
    const data = {
      realmId,
      accessToken: encToken(tokens.accessToken),
      refreshToken: encToken(tokens.refreshToken),
      expiresAt,
      environment,
      connectedByUserId: user.id,
    }
    // Reconnecting to a DIFFERENT company invalidates every stored mapping
    // (the qboIds belong to the old realm) — drop them rather than letting
    // stale values resurface as "no longer exists" confusion later.
    const existing = await this.prisma.orgQboConnection.findUnique({
      where: { organizationId: orgId },
      select: { id: true, realmId: true },
    })
    if (existing && existing.realmId !== realmId) {
      await this.prisma.orgQboMapping.deleteMany({ where: { connectionId: existing.id } })
    }
    await this.prisma.orgQboConnection.upsert({
      where: { organizationId: orgId },
      create: { organizationId: orgId, companyName, ...data },
      // On reconnect a failed name fetch must not clobber a previously good name.
      update: { ...data, ...(companyName ? { companyName } : {}) },
    })

    const sameRealm = await this.prisma.qboConnection.findMany({
      where: { realmId, school: { organizationId: orgId } },
      include: { school: { select: { name: true } } },
    })
    if (sameRealm.length > 0) {
      await this.prisma.qboConnection.deleteMany({
        where: { id: { in: sameRealm.map((c) => c.id) } },
      })
    }
    const replaced = sameRealm.map((c) => c.school.name).sort((a, b) => a.localeCompare(b))

    await this.audit.write({
      organizationId: orgId,
      userId: user.id,
      action: 'qbo.org_connected',
      targetType: 'org_qbo_connections',
      metadata: { realmId, environment, replacedSchoolConnections: replaced },
    })
    return { ...(await this.statusBody(orgId)), replacedSchoolConnections: replaced }
  }

  /**
   * Delete the org connection (mappings cascade). removeData=true additionally
   * purges what THIS connection imported: imports stamped with its id in
   * metadata.orgConnectionId, plus 'QuickBooks Online' monthly snapshots for
   * mapped schools with NO direct QboConnection (monthlies carry no metadata,
   * so a school with its own connection keeps everything — its monthlies may
   * be the direct connection's). Keep-data is the default.
   */
  async disconnect(
    user: User,
    orgId: string,
    removeData = false,
  ): Promise<{ disconnected: true; removedData: boolean; schoolsAffected: number }> {
    const inOrg = await this.qboOrg.orgMemberships(user, orgId)
    this.requireManager(inOrg)
    const conn = await this.prisma.orgQboConnection.findUnique({
      where: { organizationId: orgId },
      include: { mappings: true },
    })
    if (!conn) throw new NotFoundException('QuickBooks is not connected for this organization.')

    let schoolsAffected = 0
    if (removeData) {
      // Every school EVER mapped (any dimension) may hold this connection's data.
      const mappedIds = [
        ...new Set(
          conn.mappings.map((m) => m.schoolId).filter((id): id is string => id != null),
        ),
      ]
      for (const schoolId of mappedIds) {
        if (await this.removeOrgQboData(user, schoolId, conn.id)) schoolsAffected++
      }
    }
    await this.prisma.orgQboConnection.delete({ where: { id: conn.id } })
    await this.audit.write({
      organizationId: orgId,
      userId: user.id,
      action: 'qbo.org_disconnected',
      targetType: 'org_qbo_connections',
      metadata: { removedData: removeData, schoolsAffected },
    })
    return { disconnected: true, removedData: removeData, schoolsAffected }
  }

  /**
   * One school's purge, adapted from QboService.removeQboData: delete this org
   * connection's imports (+ direct-connection-free monthlies), then reconcile
   * each touched period — regenerate statements when a CY import (e.g. an
   * uploaded file) remains, clear the snapshots when none does. Returns whether
   * anything was actually removed.
   */
  private async removeOrgQboData(actor: User, schoolId: string, connId: string): Promise<boolean> {
    const orgImports = await this.prisma.import.findMany({
      where: { schoolId, metadata: { path: ['orgConnectionId'], equals: connId } },
      select: { id: true, fiscalPeriodId: true },
    })
    const direct = await this.prisma.qboConnection.findUnique({ where: { schoolId } })
    const monthlies = direct
      ? []
      : await this.prisma.monthlySnapshot.findMany({
          where: { schoolId, sourceName: 'QuickBooks Online' },
          select: { id: true, fiscalPeriodId: true },
        })
    if (orgImports.length === 0 && monthlies.length === 0) return false

    if (orgImports.length) {
      await this.prisma.import.deleteMany({ where: { id: { in: orgImports.map((i) => i.id) } } })
    }
    if (monthlies.length) {
      await this.prisma.monthlySnapshot.deleteMany({
        where: { id: { in: monthlies.map((m) => m.id) } },
      })
    }

    const periodIds = new Set<string>([
      ...orgImports.map((i) => i.fiscalPeriodId),
      ...monthlies.map((m) => m.fiscalPeriodId),
    ])
    for (const periodId of periodIds) {
      const cyRemaining = await this.prisma.import.count({
        where: { schoolId, fiscalPeriodId: periodId, role: 'cy' as ImportRole },
      })
      if (cyRemaining > 0) {
        try {
          await this.statements.generate(actor, schoolId, periodId, {})
        } catch {
          /* leave the prior snapshot rather than half-clearing */
        }
      } else {
        await this.prisma.statementSnapshot.deleteMany({
          where: { schoolId, fiscalPeriodId: periodId },
        })
      }
    }
    return true
  }

  // ── Mapping ─────────────────────────────────────────────────────────────────

  /**
   * LIVE mapping view: QBO's current Departments + Classes merged with the
   * stored decisions and the org's schools. Best-effort throughout — an
   * unreachable entity list falls back to stored rows (screen still renders),
   * and activityCY is null everywhere when its one P&L pull per dimension fails.
   */
  async mappingView(user: User, orgId: string): Promise<OrgQboMappingView> {
    const inOrg = await this.qboOrg.orgMemberships(user, orgId)
    const conn = await this.prisma.orgQboConnection.findUnique({ where: { organizationId: orgId } })
    if (!conn) throw new NotFoundException('QuickBooks is not connected for this organization.')

    const stored = await this.prisma.orgQboMapping.findMany({ where: { connectionId: conn.id } })
    const storedFor = (dimension: string, qboId: string): OrgQboMapping | undefined =>
      stored.find((r) => r.dimension === dimension && r.qboId === qboId)

    // Token refresh can itself fail (revoked consent, Intuit outage) — that
    // must degrade to stored rows exactly like an unreachable entity list,
    // never 500 the mapping screen.
    const token = await this.accessToken(conn).catch(() => null)
    const [departments, classes] = token
      ? await Promise.all([
          this.client.listDimensions(conn.realmId, token, 'department').catch(() => null),
          this.client.listDimensions(conn.realmId, token, 'class').catch(() => null),
        ])
      : [null, null]
    const [depActivity, classActivity] = token
      ? await Promise.all([
          this.activityCY(conn, token, 'department', departments),
          this.activityCY(conn, token, 'class', classes),
        ])
      : [null, null]

    // Refresh stored qboName snapshots that drifted (display-only; best-effort).
    const drifted: Array<{ id: string; name: string }> = []
    for (const [dim, live] of [
      ['department', departments],
      ['class', classes],
    ] as const) {
      for (const e of live ?? []) {
        const row = storedFor(dim, e.id)
        if (row && row.qboName !== e.name) drifted.push({ id: row.id, name: e.name })
      }
    }
    if (drifted.length) {
      await Promise.all(
        drifted.map((d) =>
          this.prisma.orgQboMapping
            .update({ where: { id: d.id }, data: { qboName: d.name } })
            .catch(() => undefined),
        ),
      )
    }

    const buildValues = (
      dim: 'department' | 'class',
      live: QboDimensionEntity[] | null,
      activity: Map<string, number> | null,
    ): OrgQboValue[] => {
      if (live) {
        return live.map((e) => {
          const row = storedFor(dim, e.id)
          return {
            qboId: e.id,
            name: e.name,
            active: e.active,
            parentId: e.parentId,
            schoolId: row?.schoolId ?? null,
            ignored: !!row && row.schoolId == null,
            mapped: !!row && row.schoolId != null,
            activityCY: activity?.get(e.id) ?? null,
          }
        })
      }
      // QBO unreachable → stored decisions only, so prior work still shows.
      return stored
        .filter((r) => r.dimension === dim && r.qboId !== NOT_SPECIFIED_ID)
        .map((r) => ({
          qboId: r.qboId,
          name: r.qboName,
          active: true,
          parentId: null,
          schoolId: r.schoolId,
          ignored: r.schoolId == null,
          mapped: r.schoolId != null,
          activityCY: null,
        }))
    }

    const notSpecifiedState = (dim: 'department' | 'class'): OrgQboNotSpecifiedState => {
      const row = storedFor(dim, NOT_SPECIFIED_ID)
      // No row = the default decision: untagged money stays ignored until a
      // manager explicitly routes it to a school.
      if (!row) return { schoolId: null, ignored: true, mapped: false }
      return { schoolId: row.schoolId, ignored: row.schoolId == null, mapped: row.schoolId != null }
    }

    const orgSchools = await this.prisma.school.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true, qboConnection: { select: { id: true } } },
      orderBy: { name: 'asc' },
    })
    const roleBySchool = new Map(inOrg.map((m) => [m.schoolId, m.role]))
    const schools = orgSchools.map((s) => {
      const role = roleBySchool.get(s.id)
      return {
        id: s.id,
        name: s.name,
        canManage: role === 'owner' || role === 'accountant',
        directConnection: !!s.qboConnection,
      }
    })

    return {
      dimension: this.activeDimension(conn),
      values: {
        department: buildValues('department', departments, depActivity),
        class: buildValues('class', classes, classActivity),
      },
      notSpecified: {
        department: notSpecifiedState('department'),
        class: notSpecifiedState('class'),
      },
      schools,
    }
  }

  /**
   * CY P&L gross activity per dimension value — ONE report call per dimension
   * type actually present, null on any failure (a mapping screen must never
   * 500 because a hint couldn't be computed).
   */
  private async activityCY(
    conn: OrgQboConnection,
    token: string,
    dim: 'department' | 'class',
    entities: QboDimensionEntity[] | null,
  ): Promise<Map<string, number> | null> {
    if (!entities || entities.length === 0) return null
    try {
      const fyEnd = currentFyEndISO()
      const report = await this.client.getSummarizedReport(
        conn.realmId,
        token,
        'ProfitAndLoss',
        fyStartISO(fyEnd),
        fyEnd,
        dim,
      )
      const cols = matchColumns(report.Columns?.Column ?? [], entities)
      const flat = flattenRows(report)
      const out = new Map<string, number>()
      for (const [qboId, idx] of cols.valueByQboId) out.set(qboId, sumColumn(flat, idx))
      return out
    } catch {
      return null
    }
  }

  /**
   * Persist the decisions for ONE dimension (full replace) and make it the
   * active split. All validation runs BEFORE any write, in the contract order;
   * mapping a school that has a direct QboConnection is allowed — the import
   * skips it (direct connection takes precedence) until that connection goes.
   */
  async saveMapping(
    user: User,
    orgId: string,
    dto: OrgQbMappingDto,
  ): Promise<{ saved: number; dimension: string }> {
    const conn = await this.prisma.orgQboConnection.findUnique({ where: { organizationId: orgId } })
    if (!conn) throw new NotFoundException('QuickBooks is not connected for this organization.')
    const inOrg = await this.qboOrg.orgMemberships(user, orgId)
    this.requireManager(inOrg)

    // Each entry: exactly one of schoolId / ignored(true).
    for (const e of dto.entries) {
      const hasSchool = e.schoolId != null
      if (hasSchool === (e.ignored === true)) {
        throw new BadRequestException(
          `"${e.qboName}" must either be mapped to a school or ignored — exactly one.`,
        )
      }
    }
    const qboIds = dto.entries.map((e) => e.qboId)
    if (new Set(qboIds).size !== qboIds.length) {
      throw new BadRequestException('Each QuickBooks value may appear only once.')
    }

    const mappedSchoolIds = [
      ...new Set(dto.entries.map((e) => e.schoolId).filter((id): id is string => id != null)),
    ]
    if (mappedSchoolIds.length > 0) {
      const orgSchools = await this.prisma.school.findMany({
        where: { id: { in: mappedSchoolIds }, organizationId: orgId },
        select: { id: true },
      })
      const inOrgIds = new Set(orgSchools.map((s) => s.id))
      const outside = mappedSchoolIds.filter((id) => !inOrgIds.has(id))
      if (outside.length > 0) {
        throw new BadRequestException(
          `These schools are not in this organization: ${outside.join(', ')}`,
        )
      }
      const roleBySchool = new Map(inOrg.map((m) => [m.schoolId, m.role]))
      const denied = mappedSchoolIds.filter((id) => {
        const role = roleBySchool.get(id)
        return role !== 'owner' && role !== 'accountant'
      })
      if (denied.length > 0) {
        const names = await this.prisma.school.findMany({
          where: { id: { in: denied } },
          select: { name: true },
          orderBy: { name: 'asc' },
        })
        throw new ForbiddenException(
          `You need owner or accountant access on every mapped school. Missing: ${names
            .map((n) => n.name)
            .join(', ')}`,
        )
      }
    }

    // Every real qboId must still exist in QBO for this dimension — a stale
    // picker must not persist a value the import could never find.
    let live: QboDimensionEntity[]
    try {
      const token = await this.accessToken(conn)
      live = await this.client.listDimensions(conn.realmId, token, dto.dimension)
    } catch {
      throw new BadRequestException('Could not verify locations with QuickBooks — try again.')
    }
    const liveIds = new Set(live.map((l) => l.id))
    const unknown = dto.entries
      .filter((e) => e.qboId !== NOT_SPECIFIED_ID && !liveIds.has(e.qboId))
      .map((e) => e.qboName)
    if (unknown.length > 0) {
      throw new BadRequestException(
        `These values no longer exist in QuickBooks: ${unknown.join(', ')}`,
      )
    }

    // One transaction: full replace for this dimension + activate it.
    await this.prisma.$transaction([
      this.prisma.orgQboMapping.deleteMany({
        where: { connectionId: conn.id, dimension: dto.dimension },
      }),
      this.prisma.orgQboMapping.createMany({
        data: dto.entries.map((e) => ({
          connectionId: conn.id,
          dimension: dto.dimension,
          qboId: e.qboId,
          qboName: e.qboName,
          schoolId: e.schoolId ?? null,
        })),
      }),
      this.prisma.orgQboConnection.update({
        where: { id: conn.id },
        data: { dimension: dto.dimension },
      }),
    ])

    const mapped = dto.entries.filter((e) => e.schoolId != null).length
    await this.audit.write({
      organizationId: orgId,
      userId: user.id,
      action: 'qbo.org_mapping_saved',
      targetType: 'org_qbo_mappings',
      targetId: conn.id,
      metadata: { dimension: dto.dimension, mapped, ignored: dto.entries.length - mapped },
    })
    return { saved: dto.entries.length, dimension: dto.dimension }
  }

  // ── Import ──────────────────────────────────────────────────────────────────

  /**
   * Import every mapped school (or the explicit dto.schoolIds subset — [] means
   * none) from the ONE org company. Window-OUTER: each window's P&L + BS are
   * pulled once and reused for every school, so Intuit sees O(windows) calls
   * however many schools the diocese maps. Per-school failures never abort the
   * batch; 'failed' only when the school's CY processing itself failed.
   */
  async import(user: User, orgId: string, dto: OrgQbCompanyImportDto): Promise<OrgQboImportResult> {
    const conn = await this.prisma.orgQboConnection.findUnique({ where: { organizationId: orgId } })
    if (!conn) throw new NotFoundException('QuickBooks is not connected for this organization.')
    const inOrg = await this.qboOrg.orgMemberships(user, orgId)
    this.requireManager(inOrg)
    const dimension = this.activeDimension(conn)

    const mappings = await this.prisma.orgQboMapping.findMany({
      where: { connectionId: conn.id, dimension, schoolId: { not: null } },
    })
    if (mappings.length === 0) {
      throw new BadRequestException('No locations are mapped to schools yet.')
    }
    const bySchool = new Map<string, OrgQboMapping[]>()
    for (const m of mappings) {
      const list = bySchool.get(m.schoolId as string) ?? []
      list.push(m)
      bySchool.set(m.schoolId as string, list)
    }

    // An explicit schoolIds array — even [] — means "exactly these" (QbOrgSyncDto semantics).
    const requested = dto.schoolIds != null ? new Set(dto.schoolIds) : null
    const targetIds = [...bySchool.keys()].filter((id) => !requested || requested.has(id))
    // A requested school with NO mapping still gets a result row (skipped with a
    // reason) — silently dropping it would make the school-card "Import now"
    // render another school's outcome.
    const unmappedRequested = requested ? [...requested].filter((id) => !bySchool.has(id)) : []

    // Token refresh failure is "QuickBooks unreachable" too — the contract's
    // 400, never an unhandled 500.
    let token: string
    let live: Map<string, QboDimensionEntity>
    let meta: QboAccountMetaMaps
    try {
      token = await this.accessToken(conn)
      const [entities, accounts] = await Promise.all([
        this.client.listDimensions(conn.realmId, token, dimension),
        this.client.accountMeta(conn.realmId, token),
      ])
      live = new Map(entities.map((e) => [e.id, e]))
      meta = accounts
    } catch {
      throw new BadRequestException('Could not reach QuickBooks — try again.')
    }

    const schoolRows = await this.prisma.school.findMany({
      where: { id: { in: [...targetIds, ...unmappedRequested] }, organizationId: orgId },
      select: { id: true, name: true, qboConnection: { select: { id: true } } },
      orderBy: { name: 'asc' },
    })
    const roleBySchool = new Map(inOrg.map((m) => [m.schoolId, m.role]))

    // Up-front skip determination — one pass, contract reason strings.
    const preps: SchoolPrep[] = []
    for (const s of schoolRows) {
      const valid: Array<{ qboId: string; name: string }> = []
      const lost: string[] = []
      for (const m of bySchool.get(s.id) ?? []) {
        if (m.qboId === NOT_SPECIFIED_ID) {
          valid.push({ qboId: m.qboId, name: 'Not Specified' })
        } else {
          const e = live.get(m.qboId)
          if (e) valid.push({ qboId: m.qboId, name: e.name })
          else lost.push(m.qboName)
        }
      }
      const prep: SchoolPrep = {
        schoolId: s.id,
        name: s.name,
        validQboIds: valid.map((v) => v.qboId),
        dimensionNames: valid.map((v) => v.name),
        lostNames: lost,
        skipReason: null,
        period: null,
        scope: {},
        cyFailed: null,
        importedAny: false,
        balancePlug: null,
      }
      const role = roleBySchool.get(s.id)
      const hasAnyMapping = (bySchool.get(s.id) ?? []).length > 0
      if (role !== 'owner' && role !== 'accountant') {
        prep.skipReason = 'You need owner or accountant access to sync this school.'
      } else if (!(await this.billing.isEntitled(s.id))) {
        prep.skipReason = 'Subscription required to import data for this school.'
      } else if (s.qboConnection) {
        prep.skipReason =
          'This school has its own QuickBooks connection — the direct connection takes precedence.'
      } else if (!hasAnyMapping) {
        prep.skipReason = 'No QuickBooks locations are mapped to this school.'
      } else if (valid.length === 0) {
        prep.skipReason = 'This location no longer exists in QuickBooks.'
      }
      preps.push(prep)
    }
    const active = preps.filter((p) => p.skipReason == null)

    // Resolve each active school's target period once (may create the current
    // FY period — same shared helper the org batch sync uses).
    for (const p of active) {
      try {
        const base = await this.qboOrg.resolveBasePeriod(p.schoolId)
        const row = await this.prisma.fiscalPeriod.findUnique({ where: { id: base.id } })
        if (!row) throw new Error('Resolved period disappeared.')
        p.period = {
          id: base.id,
          label: base.label,
          endISO: row.periodEndDate.toISOString().slice(0, 10),
          periodType: row.periodType,
        }
      } catch (e) {
        p.cyFailed = msg(e)
      }
    }
    const runnable = active.filter((p) => p.period != null)

    // Windows are keyed to EACH school's RESOLVED period end — never today's
    // calendar FY. resolveBasePeriod hands back the just-ended FY for a school
    // still closing it (days after Jun 30), so a today-keyed window would
    // overwrite that period's statements with days of new-FY activity and file
    // the old year as its own "prior-year" comparative. Group schools by end
    // date (almost always one group) and pull each distinct window once.
    const groups = new Map<string, SchoolPrep[]>()
    for (const p of runnable) {
      const list = groups.get(p.period!.endISO) ?? []
      list.push(p)
      groups.set(p.period!.endISO, list)
    }
    // The Not-Specified callout reports the NEWEST group's unallocated CY money.
    const newestEnd = [...groups.keys()].sort().pop() ?? null

    const windowCache = new Map<string, WindowReports>()
    const fetchWindow = async (start: string, end: string): Promise<WindowReports> => {
      const key = `${start}..${end}`
      const hit = windowCache.get(key)
      if (hit) return hit
      const [pnl, bs] = await Promise.all([
        this.client.getSummarizedReport(conn.realmId, token, 'ProfitAndLoss', start, end, dimension),
        this.client.getSummarizedReport(conn.realmId, token, 'BalanceSheet', start, end, dimension),
      ])
      const entityList = [...live.values()]
      const out: WindowReports = {
        pnlFlat: flattenRows(pnl),
        bsFlat: flattenRows(bs),
        pnlCols: matchColumns(pnl.Columns?.Column ?? [], entityList),
        bsCols: matchColumns(bs.Columns?.Column ?? [], entityList),
      }
      windowCache.set(key, out)
      return out
    }
    const colIdxsFor = (p: SchoolPrep, w: WindowReports): { pnl: number[]; bs: number[] } => {
      const pick = (cols: MatchedColumns): number[] =>
        p.validQboIds
          .map((id) => (id === NOT_SPECIFIED_ID ? cols.notSpecified : cols.valueByQboId.get(id)))
          .filter((i): i is number => i != null)
      return { pnl: pick(w.pnlCols), bs: pick(w.bsCols) }
    }

    // Whether the CY "Not Specified" money is already routed to a school — the
    // response callout only reports what stays UNALLOCATED.
    const unspecifiedMapped = mappings.some((m) => m.qboId === NOT_SPECIFIED_ID)
    let notSpecified = { revenue: 0, expense: 0 }

    // 1. Current year — the base import (skipped only on explicit currentYear:false).
    if (dto.currentYear !== false) {
      for (const [endISO, group] of groups) {
      const cyStart = fyStartISO(endISO)
      let w: WindowReports | null = null
      let werr: string | null = null
      try {
        w = await fetchWindow(cyStart, endISO)
      } catch (e) {
        werr = msg(e)
      }
      if (w && !unspecifiedMapped && endISO === newestEnd) {
        notSpecified = notSpecifiedTotals(w.pnlFlat, w.pnlCols.notSpecified, meta)
      }
      for (const p of group) {
        if (!w) {
          p.scope.currentYear = { ok: false, error: werr ?? 'Current-year pull failed.' }
          p.cyFailed = werr ?? 'Current-year pull failed.'
          continue
        }
        try {
          const built = buildSchoolRows(w.pnlFlat, w.bsFlat, colIdxsFor(p, w), meta)
          if (built.rows.length === 0) {
            p.scope.currentYear = { ok: false, error: NO_DATA_REASON }
            continue
          }
          const plugged = applyBalancePlug(built.rows)
          await this.mergeEntriesBestEffort(p.schoolId, built.plEntries)
          const cyImp = await this.imports.create(user, p.schoolId, {
            role: 'cy',
            periodEndDate: p.period!.endISO,
            periodType: p.period!.periodType,
            label: p.period!.label,
            sourceName: 'QuickBooks Online',
            rows: plugged.rows,
            metadata: this.importMetadata(conn, p, plugged.balancePlug),
          })
          await this.statements.generate(user, p.schoolId, p.period!.id, {}, {
            trigger: 'quickbooks_sync',
            sourceImportId: cyImp.id,
          })
          // Same action as a direct sync (keeps every lastSyncedAt surface
          // working) with via:'org' so the school status can tell them apart.
          await this.audit.write({
            schoolId: p.schoolId,
            userId: user.id,
            action: 'qbo.synced',
            targetType: 'statement_snapshots',
            metadata: { fiscalPeriodId: p.period!.id, rowCount: plugged.rows.length, via: 'org' },
          })
          p.scope.currentYear = {
            ok: true,
            rowCount: plugged.rows.length,
            ...(plugged.balancePlug != null ? { imbalance: plugged.imbalance } : {}),
          }
          if (plugged.balancePlug != null) p.balancePlug = plugged.balancePlug
          p.importedAny = true
        } catch (e) {
          p.scope.currentYear = { ok: false, error: msg(e) }
          p.cyFailed = msg(e)
        }
      }
      }
    }

    // 2. Prior-year comparative — same period slot, role 'py'.
    if (dto.priorYear) {
      for (const [endISO, group] of groups) {
      const cyStart = fyStartISO(endISO)
      let w: WindowReports | null = null
      let werr: string | null = null
      try {
        w = await fetchWindow(shiftYears(cyStart, -1), shiftYears(endISO, -1))
      } catch (e) {
        werr = msg(e)
      }
      for (const p of group) {
        if (!w) {
          p.scope.priorYear = { ok: false, error: werr ?? 'Prior-year pull failed.' }
          continue
        }
        try {
          const built = buildSchoolRows(w.pnlFlat, w.bsFlat, colIdxsFor(p, w), meta)
          if (built.rows.length === 0) {
            p.scope.priorYear = { ok: false, error: 'QuickBooks has no prior-year data for this school.' }
            continue
          }
          const plugged = applyBalancePlug(built.rows)
          await this.mergeEntriesBestEffort(p.schoolId, built.plEntries)
          const pyImp = await this.imports.create(user, p.schoolId, {
            role: 'py',
            periodEndDate: p.period!.endISO,
            periodType: p.period!.periodType,
            label: p.period!.label,
            sourceName: 'QuickBooks Online',
            rows: plugged.rows,
            metadata: this.importMetadata(conn, p, plugged.balancePlug),
          })
          await this.statements.generate(user, p.schoolId, p.period!.id, {}, {
            trigger: 'quickbooks_sync',
            sourceImportId: pyImp.id,
          })
          p.scope.priorYear = {
            ok: true,
            rowCount: plugged.rows.length,
            ...(plugged.balancePlug != null ? { imbalance: plugged.imbalance } : {}),
          }
          p.importedAny = true
        } catch (e) {
          p.scope.priorYear = { ok: false, error: msg(e) }
        }
      }
      }
    }

    // 3. Monthly snapshots — cumulative fiscal-YTD windows keyed to each
    //    group's period (months past the period end are skipped, matching the
    //    Topology-A monthly pull), one pull per month shared within a group.
    if (dto.monthly) {
      for (const p of runnable) p.scope.monthly = { imported: 0, skipped: 0, errors: [] }
      for (const [endISO, group] of groups) {
      const cyStart = fyStartISO(endISO)
      const fyStartYear = fyStartYearForPeriodEnd(new Date(`${endISO}T00:00:00Z`))
      for (const mk of fyMonthKeys(fyStartYear)) {
        const monthEnd = monthEndISO(mk)
        if (monthEnd > endISO) {
          for (const p of group) p.scope.monthly!.skipped++
          continue
        }
        let w: WindowReports | null = null
        let werr: string | null = null
        try {
          w = await fetchWindow(cyStart, monthEnd)
        } catch (e) {
          werr = msg(e)
        }
        for (const p of group) {
          if (!w) {
            p.scope.monthly!.errors.push(`${mk}: ${werr}`)
            continue
          }
          try {
            const built = buildSchoolRows(w.pnlFlat, w.bsFlat, colIdxsFor(p, w), meta)
            if (built.rows.length === 0) {
              p.scope.monthly!.skipped++ // month predates (or postdates) the books
              continue
            }
            const plugged = applyBalancePlug(built.rows)
            await this.mergeEntriesBestEffort(p.schoolId, built.plEntries)
            await this.monthlySnapshots.create(user, p.schoolId, p.period!.id, {
              monthKey: mk,
              sourceName: 'QuickBooks Online',
              rows: plugged.rows,
            })
            p.scope.monthly!.imported++
            p.importedAny = true
          } catch (e) {
            p.scope.monthly!.errors.push(`${mk}: ${msg(e)}`)
          }
        }
      }
      }
    }

    // Every SYNCED school gets a 'qbo.synced' audit row (the CY leg writes its
    // own) — a priorYear/monthly-only run must too, or the school's
    // lastSyncedAt/orgFed.lastImportedAt surfaces never advance.
    for (const p of runnable) {
      if (p.importedAny && p.scope.currentYear?.ok !== true) {
        await this.audit.write({
          schoolId: p.schoolId,
          userId: user.id,
          action: 'qbo.synced',
          targetType: 'statement_snapshots',
          metadata: {
            fiscalPeriodId: p.period!.id,
            rowCount: p.scope.priorYear?.rowCount ?? 0,
            via: 'org',
          },
        })
      }
    }

    // Roll up per-school outcomes. 'failed' strictly = the CY path failed
    // (mirrors qbo-org's cyFailed); nothing-imported-anywhere = the no-data skip.
    const results: OrgQboImportRow[] = preps.map((p) => {
      const lostNote =
        p.lostNames.length > 0
          ? `No longer in QuickBooks (not imported): ${p.lostNames.join(', ')}.`
          : null
      if (p.skipReason != null) {
        return {
          schoolId: p.schoolId,
          name: p.name,
          status: 'skipped' as const,
          reason: p.skipReason,
          dimensionNames: p.dimensionNames,
        }
      }
      const base = {
        schoolId: p.schoolId,
        name: p.name,
        dimensionNames: p.dimensionNames,
        ...(p.period ? { periodId: p.period.id, periodLabel: p.period.label } : {}),
        ...(p.balancePlug != null ? { balancePlug: p.balancePlug } : {}),
        scope: p.scope,
      }
      if (p.cyFailed != null) {
        return { ...base, status: 'failed' as const, reason: p.cyFailed }
      }
      if (!p.importedAny) {
        return { ...base, status: 'skipped' as const, reason: NO_DATA_REASON }
      }
      return { ...base, status: 'synced' as const, ...(lostNote ? { reason: lostNote } : {}) }
    })

    const summary = {
      total: results.length,
      synced: results.filter((r) => r.status === 'synced').length,
      failed: results.filter((r) => r.status === 'failed').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
    }
    await this.audit.write({
      organizationId: orgId,
      userId: user.id,
      action: 'qbo.org_company_imported',
      targetType: 'organizations',
      targetId: orgId,
      metadata: {
        ...summary,
        scope: {
          currentYear: dto.currentYear ?? true,
          priorYear: dto.priorYear ?? false,
          monthly: dto.monthly ?? false,
          schoolIds: dto.schoolIds ?? null,
        },
      },
    })
    return { ...summary, notSpecified, results }
  }

  /** Import-row metadata stamped so disconnect(removeData) can find OUR rows. */
  private importMetadata(
    conn: OrgQboConnection,
    p: SchoolPrep,
    balancePlug: number | null,
  ): Record<string, unknown> {
    return {
      source: 'quickbooks',
      realmId: conn.realmId,
      orgConnectionId: conn.id,
      dimension: conn.dimension,
      qboIds: p.validQboIds,
      ...(balancePlug != null ? { balancePlug } : {}),
    }
  }

  /** Type-derived P&L category merge — idempotent; a failure must not abort an import. */
  private async mergeEntriesBestEffort(
    schoolId: string,
    plEntries: Record<string, string>,
  ): Promise<void> {
    if (Object.keys(plEntries).length === 0) return
    try {
      await this.mapping.mergeEntries(schoolId, plEntries)
    } catch {
      /* unmapped accounts surface in the review step instead */
    }
  }
}
