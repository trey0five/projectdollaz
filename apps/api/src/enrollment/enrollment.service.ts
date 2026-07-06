// Phase 2 — Enrollment Intelligence connector orchestration. Owns the per-school
// enrollment source (OAuth connect / key connect / disconnect), the intake pipeline
// (normalize → resolve FY period → upsert an immutable snapshot → PROMOTE into the
// mutable PeriodOperationalData.enrollment), and the read surfaces (status / snapshots
// / summary). Mirrors QboService: a stateless EnrollmentClient owns OAuth/HTTP; this
// service owns persistence + token refresh (rotate + 60s buffer). It imports ONLY the
// @finrep/analytics/@finrep/ingestion PACKAGES (GradeKey, the CSV parser) — never the
// analytics API module — so there is no api-module cycle.
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { EnrollmentProvider, EnrollmentSource, NormalizedEnrollmentSnapshot, User } from '@finrep/db'
import { GRADE_KEYS, type GradeKey } from '@finrep/analytics'
import { parseOneRosterCsv } from '@finrep/ingestion/oneroster'
import { PrismaService } from '../prisma/prisma.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import { EnrollmentClient } from './enrollment.client.js'
import { normalizeManualSnapshot } from './enrollment.normalize.js'
import type { EnrollmentAdapter } from './adapters/adapter.js'
import { OneRosterCsvAdapter } from './adapters/oneroster-csv.adapter.js'
import { BlackbaudAdapter } from './adapters/blackbaud.adapter.js'
import { OneRosterApiAdapter } from './adapters/oneroster-api.adapter.js'
import { FactsAdapter } from './adapters/facts.adapter.js'
import { VeracrossAdapter } from './adapters/veracross.adapter.js'
import { KEY_PROVIDERS } from './dto/enrollment.dto.js'

/** The multer memory-storage file (subset we read) — parallels Knowledge's upload. */
export interface UploadedRosterFile {
  buffer: Buffer
  originalname: string
  mimetype: string
  size: number
}

export interface EnrollmentStatus {
  configured: boolean
  connected: boolean
  provider: EnrollmentProvider | null
  environment: string | null
  lastSyncedAt: string | null
  latest: { observedOn: string; totalEnrolled: number } | null
}

export interface EnrollmentIntakeResult {
  snapshot: { observedOn: string; totalEnrolled: number; byGrade: Partial<Record<GradeKey, number>> }
  promoted: boolean
  warnings: string[]
}

export interface EnrollmentSnapshotView {
  id: string
  observedOn: string
  totalEnrolled: number
  byGrade: Partial<Record<GradeKey, number>>
  provider: EnrollmentProvider
}

export interface EnrollmentSummary {
  latest: { observedOn: string; totalEnrolled: number; byGrade: Partial<Record<GradeKey, number>> } | null
  vsPlan: { planTotal: number; gap: number; gapPct: number } | null
  provider: EnrollmentProvider | null
}

const ZIP_SIGNATURE = [0x50, 0x4b] // 'PK'
const iso = (d: Date): string => d.toISOString().slice(0, 10)

/**
 * The fiscal-year END date (Jun 30) for an observed date, per the FY Jul–Jun
 * convention: Jul–Dec belongs to NEXT June; Jan–Jun to THIS June. The resolved
 * period is then found-or-created via PeriodsService.resolveForImport (which reuses
 * an existing FY period regardless of its historical periodType).
 */
function fyEndForObservedOn(observedOn: string): string {
  const [y, m] = observedOn.split('-').map(Number)
  const endYear = (m ?? 1) >= 7 ? (y ?? 0) + 1 : y ?? 0
  return `${endYear}-06-30`
}

@Injectable()
export class EnrollmentService {
  private readonly adapters: Record<EnrollmentProvider, EnrollmentAdapter>

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly client: EnrollmentClient,
    private readonly periods: PeriodsService,
    private readonly audit: AuditService,
    onerosterCsv: OneRosterCsvAdapter,
    blackbaud: BlackbaudAdapter,
    onerosterApi: OneRosterApiAdapter,
    facts: FactsAdapter,
    veracross: VeracrossAdapter,
  ) {
    this.adapters = {
      oneroster_csv: onerosterCsv,
      blackbaud,
      oneroster_api: onerosterApi,
      facts,
      veracross,
      // `manual` has no live adapter; the manual path builds a snapshot directly.
      manual: onerosterCsv,
    }
  }

  // ── Status ─────────────────────────────────────────────────────────────────

  async status(schoolId: string): Promise<EnrollmentStatus> {
    const [source, latest] = await Promise.all([
      this.prisma.enrollmentSource.findUnique({ where: { schoolId } }),
      this.prisma.enrollmentSnapshot.findFirst({ where: { schoolId }, orderBy: { observedOn: 'desc' } }),
    ])
    return {
      // "configured" advertises the ONE live OAuth provider (Blackbaud); the CSV
      // upload path is always available regardless of server config.
      configured: this.client.isConfigured(),
      connected: !!source,
      provider: source?.provider ?? latest?.provider ?? null,
      environment: source?.environment ?? null,
      lastSyncedAt: source?.lastSyncedAt ? source.lastSyncedAt.toISOString() : null,
      latest: latest ? { observedOn: iso(latest.observedOn), totalEnrolled: latest.totalEnrolled } : null,
    }
  }

  // ── Connect / disconnect ─────────────────────────────────────────────────────

  /** The Blackbaud consent URL (or a clear 400 when the connector isn't configured). */
  authorizeUrl(schoolId: string): string {
    if (!this.client.isConfigured()) {
      throw new BadRequestException('The Blackbaud enrollment connector is not configured on this server.')
    }
    return this.client.buildAuthorizeUrl(schoolId)
  }

  /** Complete the Blackbaud OAuth handshake and persist the source. */
  async connect(schoolId: string, code: string, userId: string): Promise<EnrollmentStatus> {
    if (!this.client.isConfigured()) {
      throw new BadRequestException('The Blackbaud enrollment connector is not configured on this server.')
    }
    const tokens = await this.client.exchangeCode(code)
    const expiresAt = new Date(Date.now() + tokens.expiresInSec * 1000)
    const environment = this.config.get<string>('enrollment.blackbaud.environment') ?? 'sandbox'
    // Preserve a subscription key the user may have set via connect-key first.
    const existing = await this.prisma.enrollmentSource.findUnique({ where: { schoolId } })
    const data = {
      provider: 'blackbaud' as EnrollmentProvider,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt,
      environment,
      status: 'connected',
      lastError: null,
      subscriptionKey: existing?.subscriptionKey ?? null,
      connectedByUserId: userId,
    }
    await this.prisma.enrollmentSource.upsert({
      where: { schoolId },
      create: { schoolId, ...data },
      update: data,
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'enrollment.connected',
      targetType: 'enrollment_sources',
      metadata: { provider: 'blackbaud', environment },
    })
    return this.status(schoolId)
  }

  /** Connect a key/basic provider (FACTS, Veracross, OneRoster REST, or a Blackbaud
   *  subscription key). Upserts the per-school source with the supplied credentials. */
  async connectKey(
    schoolId: string,
    dto: {
      provider: EnrollmentProvider
      apiKeyId?: string
      apiKeySecret?: string
      baseUrl?: string
      externalOrgId?: string
      subscriptionKey?: string
    },
    userId: string,
  ): Promise<EnrollmentStatus> {
    if (!(KEY_PROVIDERS as string[]).includes(dto.provider)) {
      throw new BadRequestException(
        `Provider "${dto.provider}" is not connected with API keys. Use the OAuth connect or file upload instead.`,
      )
    }
    const environment = this.config.get<string>('enrollment.blackbaud.environment') ?? 'sandbox'
    const data = {
      provider: dto.provider,
      apiKeyId: dto.apiKeyId ?? null,
      apiKeySecret: dto.apiKeySecret ?? null,
      baseUrl: dto.baseUrl ?? null,
      externalOrgId: dto.externalOrgId ?? null,
      subscriptionKey: dto.subscriptionKey ?? null,
      environment,
      status: 'connected',
      lastError: null,
      connectedByUserId: userId,
    }
    await this.prisma.enrollmentSource.upsert({
      where: { schoolId },
      create: { schoolId, ...data },
      update: data,
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'enrollment.connected',
      targetType: 'enrollment_sources',
      metadata: { provider: dto.provider },
    })
    return this.status(schoolId)
  }

  /** Disconnect. `removeData` purges every snapshot + clears connector-stamped
   *  operational.enrollment (a manual entry — no stamp — is left untouched). */
  async disconnect(actor: User, schoolId: string, removeData = false): Promise<EnrollmentStatus> {
    if (removeData) {
      await this.prisma.enrollmentSnapshot.deleteMany({ where: { schoolId } })
      // Clear ONLY values a connector stamped; a hand-entered enrollment (null stamp) stays.
      await this.prisma.periodOperationalData.updateMany({
        where: { schoolId, enrollmentSourceProvider: { not: null } },
        data: { enrollment: null, enrollmentSourceProvider: null },
      })
    }
    await this.prisma.enrollmentSource.deleteMany({ where: { schoolId } })
    await this.audit.write({
      schoolId,
      userId: actor.id,
      action: 'enrollment.disconnected',
      targetType: 'enrollment_sources',
      metadata: { removedData: removeData },
    })
    return this.status(schoolId)
  }

  // ── Intake surfaces (upload / sync / manual) ─────────────────────────────────

  /** Parse an uploaded OneRoster export (ZIP, or a bare users.csv) and run intake. */
  async upload(
    actor: User,
    schoolId: string,
    file: UploadedRosterFile | undefined,
    observedOn?: string,
  ): Promise<EnrollmentIntakeResult> {
    if (!file || !file.buffer || file.size === 0) {
      throw new BadRequestException('No file uploaded.')
    }
    const zip = looksLikeZip(file.buffer) ? file.buffer : wrapCsvAsZip(file.buffer)
    let normalized: NormalizedEnrollmentSnapshot
    try {
      normalized = parseOneRosterCsv(zip, observedOn ? { observedOn } : undefined)
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Could not parse the OneRoster export.')
    }
    // CSV/manual carry sourceId=null + a provider stamp on the snapshot (no source row).
    return this.intake(actor, schoolId, normalized, null)
  }

  /** Live sync the connected provider (Blackbaud/OneRoster REST/FACTS/Veracross). */
  async sync(actor: User, schoolId: string, asOf?: string): Promise<EnrollmentIntakeResult> {
    const source = await this.prisma.enrollmentSource.findUnique({ where: { schoolId } })
    if (!source) throw new NotFoundException('No enrollment provider is connected for this school.')
    const adapter = this.adapters[source.provider]
    if (!adapter || !adapter.isConfigured()) {
      throw new BadRequestException(`The ${source.provider} connector is not configured on this server.`)
    }
    // Refresh + persist the OAuth token (rotate) for providers that use one.
    if (source.refreshToken && source.expiresAt) {
      await this.ensureAccessToken(source)
    }
    let normalized: NormalizedEnrollmentSnapshot
    try {
      normalized = await adapter.fetch(source, asOf)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Enrollment sync failed.'
      await this.prisma.enrollmentSource
        .update({ where: { schoolId }, data: { status: 'error', lastError: message } })
        .catch(() => undefined)
      throw new BadRequestException(message)
    }
    const result = await this.intake(actor, schoolId, normalized, source.id)
    await this.prisma.enrollmentSource
      .update({ where: { schoolId }, data: { status: 'connected', lastError: null, lastSyncedAt: new Date() } })
      .catch(() => undefined)
    return result
  }

  /** Save a hand-entered roster snapshot (byGrade validated against GRADE_KEYS). */
  async manual(
    actor: User,
    schoolId: string,
    observedOn: string,
    byGrade: Record<string, number>,
  ): Promise<EnrollmentIntakeResult> {
    // Reject an entry with NO recognizable grade so the user gets a clear 400
    // instead of a silently-empty snapshot.
    const known = Object.keys(byGrade ?? {}).filter((k) => (GRADE_KEYS as readonly string[]).includes(k))
    if (known.length === 0) {
      throw new BadRequestException(
        `byGrade must include at least one valid grade key (${GRADE_KEYS.join(', ')}).`,
      )
    }
    const normalized = normalizeManualSnapshot(byGrade, observedOn)
    return this.intake(actor, schoolId, normalized, null)
  }

  // ── Reads ────────────────────────────────────────────────────────────────────

  async snapshots(schoolId: string, periodId?: string): Promise<EnrollmentSnapshotView[]> {
    const rows = await this.prisma.enrollmentSnapshot.findMany({
      where: { schoolId, ...(periodId ? { fiscalPeriodId: periodId } : {}) },
      orderBy: { observedOn: 'desc' },
    })
    return rows.map((r) => ({
      id: r.id,
      observedOn: iso(r.observedOn),
      totalEnrolled: r.totalEnrolled,
      byGrade: (r.byGrade ?? {}) as Partial<Record<GradeKey, number>>,
      provider: r.provider,
    }))
  }

  async summary(schoolId: string, periodId?: string): Promise<EnrollmentSummary> {
    const [latest, source] = await Promise.all([
      this.prisma.enrollmentSnapshot.findFirst({
        where: { schoolId, ...(periodId ? { fiscalPeriodId: periodId } : {}) },
        orderBy: { observedOn: 'desc' },
      }),
      this.prisma.enrollmentSource.findUnique({ where: { schoolId } }),
    ])
    const provider = latest?.provider ?? source?.provider ?? null
    if (!latest) return { latest: null, vsPlan: null, provider }

    const resolvedPeriodId = periodId ?? latest.fiscalPeriodId
    const planTotal = resolvedPeriodId ? await this.planTotalFor(schoolId, resolvedPeriodId) : null
    const total = latest.totalEnrolled
    const vsPlan =
      planTotal != null && planTotal > 0
        ? { planTotal, gap: total - planTotal, gapPct: (total - planTotal) / planTotal }
        : null
    return {
      latest: {
        observedOn: iso(latest.observedOn),
        totalEnrolled: total,
        byGrade: (latest.byGrade ?? {}) as Partial<Record<GradeKey, number>>,
      },
      vsPlan,
      provider,
    }
  }

  // ── Internals ─────────────────────────────────────────────────────────────────

  /**
   * The shared intake pipeline: resolve the FY period from observedOn, upsert an
   * idempotent snapshot (schoolId + sourceId + observedOn), then PROMOTE the
   * headcount into PeriodOperationalData.enrollment. Audits imported (+ promoted).
   */
  private async intake(
    actor: User,
    schoolId: string,
    normalized: NormalizedEnrollmentSnapshot,
    sourceId: string | null,
  ): Promise<EnrollmentIntakeResult> {
    const fiscalPeriodId = await this.resolveFiscalPeriodId(schoolId, normalized.observedOn)
    const observedOn = new Date(normalized.observedOn)
    const provider = normalized.provider as EnrollmentProvider

    const snapshotData = {
      provider,
      totalEnrolled: normalized.totalEnrolled,
      byGrade: normalized.byGrade as object,
      byStatus: (normalized.byStatus ?? undefined) as object | undefined,
      fte: normalized.fte ?? null,
      raw: (normalized.raw ?? undefined) as object | undefined,
      fiscalPeriodId,
    }
    // Idempotent by (school, source, observedOn). Prisma's ON CONFLICT can't match a
    // NULL sourceId, so we find-then-update/create explicitly to keep re-imports clean.
    const existing = await this.prisma.enrollmentSnapshot.findFirst({
      where: { schoolId, sourceId, observedOn },
    })
    const snapshot = existing
      ? await this.prisma.enrollmentSnapshot.update({ where: { id: existing.id }, data: snapshotData })
      : await this.prisma.enrollmentSnapshot.create({
          data: { schoolId, sourceId, observedOn, createdByUserId: actor.id, ...snapshotData },
        })

    await this.audit.write({
      schoolId,
      userId: actor.id,
      action: 'enrollment.imported',
      targetType: 'enrollment_snapshots',
      targetId: snapshot.id,
      metadata: { provider, observedOn: normalized.observedOn, totalEnrolled: normalized.totalEnrolled, fiscalPeriodId },
    })

    const promoted = await this.promote(actor, schoolId, fiscalPeriodId, normalized)
    return {
      snapshot: {
        observedOn: normalized.observedOn,
        totalEnrolled: normalized.totalEnrolled,
        byGrade: normalized.byGrade,
      },
      promoted,
      warnings: normalized.warnings ?? [],
    }
  }

  /**
   * PROMOTE the headcount into the mutable PeriodOperationalData.enrollment. Fill
   * rule: write when the value is null OR was previously connector-stamped
   * (enrollmentSourceProvider set) — NEVER overwrite a manual entry (a non-null
   * enrollment with a null stamp). On write, stamp enrollmentSourceProvider so a
   * later re-import may refresh it. Direct prisma upsert (does NOT import Eng2's
   * operational.service). Audits enrollment.promoted only when it actually wrote.
   */
  private async promote(
    actor: User,
    schoolId: string,
    fiscalPeriodId: string,
    normalized: NormalizedEnrollmentSnapshot,
  ): Promise<boolean> {
    const existing = await this.prisma.periodOperationalData.findUnique({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId } },
    })
    const isManual = !!existing && existing.enrollment != null && existing.enrollmentSourceProvider == null
    if (isManual) return false // never clobber a hand-entered enrollment

    const total = normalized.totalEnrolled
    const providerStamp = normalized.provider
    await this.prisma.periodOperationalData.upsert({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId } },
      create: {
        schoolId,
        fiscalPeriodId,
        enrollment: total,
        enrollmentFte: normalized.fte ?? null,
        enrollmentSourceProvider: providerStamp,
        updatedByUserId: actor.id,
      },
      update: {
        enrollment: total,
        // Only overwrite FTE when the source reported one, so a manual FTE survives.
        ...(normalized.fte != null ? { enrollmentFte: normalized.fte } : {}),
        enrollmentSourceProvider: providerStamp,
        updatedByUserId: actor.id,
      },
    })
    await this.audit.write({
      schoolId,
      userId: actor.id,
      action: 'enrollment.promoted',
      targetType: 'period_operational_data',
      metadata: { fiscalPeriodId, enrollment: total, provider: providerStamp },
    })
    return true
  }

  /** Resolve (find-or-create) the FY period for an observed date via the periods helper. */
  private async resolveFiscalPeriodId(schoolId: string, observedOn: string): Promise<string> {
    const fyEnd = fyEndForObservedOn(observedOn)
    const { period } = await this.periods.resolveForImport(schoolId, fyEnd, 'fy')
    return period.id
  }

  /** A valid access token, refreshing (rotate + persist) within a 60s expiry buffer. */
  private async ensureAccessToken(source: EnrollmentSource): Promise<void> {
    if (!source.expiresAt || !source.refreshToken) return
    if (source.expiresAt.getTime() - Date.now() > 60_000) return
    const tokens = await this.client.refresh(source.refreshToken)
    const expiresAt = new Date(Date.now() + tokens.expiresInSec * 1000)
    await this.prisma.enrollmentSource.update({
      where: { schoolId: source.schoolId },
      data: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt },
    })
    // Keep the in-memory source current so the adapter reads the fresh token.
    source.accessToken = tokens.accessToken
    source.refreshToken = tokens.refreshToken
    source.expiresAt = expiresAt
  }

  /**
   * The planned enrollment total for a period — LOCAL, no analytics import: prefer a
   * driver budget's assumptions.enrollmentByGrade, else PeriodOperationalData's
   * plannedEnrollmentByGrade. Null when neither carries a positive plan.
   */
  private async planTotalFor(schoolId: string, fiscalPeriodId: string): Promise<number | null> {
    const [budget, op] = await Promise.all([
      this.prisma.periodBudget.findUnique({ where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId } } }),
      this.prisma.periodOperationalData.findUnique({
        where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId } },
      }),
    ])
    const lines = (budget?.lines ?? null) as { assumptions?: { enrollmentByGrade?: unknown }; enrollmentByGrade?: unknown } | null
    const fromBudget = sumGradeMap(lines?.assumptions?.enrollmentByGrade ?? lines?.enrollmentByGrade)
    if (fromBudget != null && fromBudget > 0) return fromBudget
    const fromPlanned = sumGradeMap(op?.plannedEnrollmentByGrade)
    if (fromPlanned != null && fromPlanned > 0) return fromPlanned
    return null
  }
}

/** Sum the numeric values of a grade→count JSON map; null when it isn't an object. */
function sumGradeMap(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object') return null
  let sum = 0
  for (const v of Object.values(raw as Record<string, unknown>)) {
    const n = Number(v)
    if (Number.isFinite(n)) sum += n
  }
  return sum
}

/** True when the buffer starts with the ZIP local-file-header magic ('PK'). */
function looksLikeZip(buf: Buffer): boolean {
  return buf.length >= 2 && buf[0] === ZIP_SIGNATURE[0] && buf[1] === ZIP_SIGNATURE[1]
}

/**
 * Wrap a bare users.csv buffer into a minimal STORED (uncompressed) ZIP so the pure
 * OneRoster ZIP parser can consume a single-CSV upload too. Correct CRC32 so the
 * archive is spec-valid.
 */
function wrapCsvAsZip(csv: Buffer): Buffer {
  const name = Buffer.from('users.csv', 'utf8')
  const crc = crc32(csv)
  const lh = Buffer.alloc(30)
  lh.writeUInt32LE(0x04034b50, 0)
  lh.writeUInt16LE(20, 4)
  lh.writeUInt16LE(0, 8) // STORED
  lh.writeUInt32LE(crc, 14)
  lh.writeUInt32LE(csv.length, 18)
  lh.writeUInt32LE(csv.length, 22)
  lh.writeUInt16LE(name.length, 26)
  const ch = Buffer.alloc(46)
  ch.writeUInt32LE(0x02014b50, 0)
  ch.writeUInt16LE(20, 4)
  ch.writeUInt16LE(20, 6)
  ch.writeUInt16LE(0, 10)
  ch.writeUInt32LE(crc, 16)
  ch.writeUInt32LE(csv.length, 20)
  ch.writeUInt32LE(csv.length, 24)
  ch.writeUInt16LE(name.length, 28)
  ch.writeUInt32LE(0, 42)
  const local = Buffer.concat([lh, name, csv])
  const central = Buffer.concat([ch, name])
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(1, 8)
  eocd.writeUInt16LE(1, 10)
  eocd.writeUInt32LE(central.length, 12)
  eocd.writeUInt32LE(local.length, 16)
  return Buffer.concat([local, central, eocd])
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
