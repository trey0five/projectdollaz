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
import {
  GRADE_KEYS,
  diversityIndex,
  gradeMixShares,
  toShares,
  type GradeKey,
} from '@finrep/analytics'
import type { DemographicBreakdown } from '@finrep/db'
import { parseOneRosterCsv } from '@finrep/ingestion/oneroster'
import { PrismaService } from '../prisma/prisma.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import { EnrollmentClient } from './enrollment.client.js'
import { normalizeManualSnapshot } from './enrollment.normalize.js'
import type { RawStudentRow } from './enrollment.normalize.js'
import { rosterRollup } from './students/roster-rollup.js'
import type { AdapterRoster, EnrollmentAdapter } from './adapters/adapter.js'
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
  /**
   * Phase 5 — deterministic coexistence mode: 'sis' ⇔ an EnrollmentSource row
   * exists (the SIS ALWAYS wins, regardless of students); 'roster' ⇔ no source
   * AND the school has ≥1 Student row; 'none' otherwise. Additive field.
   */
  rosterMode: 'sis' | 'roster' | 'none'
  studentCount: number
}

export interface EnrollmentIntakeResult {
  snapshot: { observedOn: string; totalEnrolled: number; byGrade: Partial<Record<GradeKey, number>> }
  promoted: boolean
  /** True when this intake superseded a hand-entered manual enrollment (org import). */
  superseded?: boolean
  /** The manual value that was backed up when superseding (null otherwise). */
  supersededManual?: number | null
  /**
   * The FY period the snapshot landed in (resolved from observedOn). ADDITIVE:
   * callers that report "this period's enrollment is now N" need the period id to
   * offer a revert, and re-deriving it in the caller would be a second, drifting
   * resolution of the same date.
   */
  fiscalPeriodId: string
  warnings: string[]
}

/** Options for the shared intake pipeline. */
export interface IntakeOptions {
  /** The connector source row id (null for CSV/manual/diocesan). */
  sourceId?: string | null
  /**
   * The fiscal year this reading counts for, CHOSEN rather than inferred.
   *
   * Absent = the previous behaviour exactly: derive it from `observedOn`, which
   * defaults to today. That default is what silently filed an August upload under
   * the NEXT fiscal year (Jul-Jun), leaving a school's finance metrics computing
   * from a stale hand-entered figure while the roster sat in a year with no ledger.
   */
  fiscalPeriodId?: string
  /**
   * When true (org diocesan import only), a hand-entered manual enrollment is
   * SUPERSEDED (backed up + overwritten) rather than left untouched. Reversible.
   */
  supersedeManual?: boolean
  /**
   * When FALSE, the snapshot + `enrollment.imported` audit are written exactly as
   * usual but the PROMOTE is skipped entirely (returns `promoted:false`).
   *
   * The roster upload uses this: when that upload also created Student rows, the
   * headcount is promoted from the ROSTER (recomputed over every student row the
   * register now holds) and this snapshot is kept for file history only. Two
   * writers racing over one periodOperationalData.enrollment is the failure this
   * flag exists to make impossible. Defaults to true — every existing call site
   * promotes exactly as before.
   */
  promote?: boolean
}

/** Latest-snapshot demographic + grade mix read surface. */
export interface EnrollmentDemographicsView {
  observedOn: string
  provider: EnrollmentProvider
  totalEnrolled: number
  gender: { counts: Record<string, number>; shares: Record<string, number> } | null
  ethnicity: { counts: Record<string, number>; shares: Record<string, number> } | null
  race: {
    counts: Record<string, number>
    shares: Record<string, number>
    diversityIndex: number
  } | null
  gradeMix: { counts: Partial<Record<GradeKey, number>>; shares: Partial<Record<GradeKey, number>> }
  /** Phase 5 — 'roster' when computed live from Student rows; 'snapshot' otherwise. */
  source: 'roster' | 'snapshot'
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
  /**
   * Reconciliation state (Decision C): the backed-up hand-entered MANUAL enrollment
   * that a diocesan import superseded for this period — the web "superseded by import"
   * banner + Restore-manual button read this. Null when nothing is superseded.
   */
  supersededManual: { value: number; fte: number | null; at: string } | null
  /** Phase 5 — 'roster' when computed live from Student rows; 'snapshot' otherwise. */
  source: 'roster' | 'snapshot'
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
  // Partial: the diocesan providers have no live per-school adapter (org file-upload
  // path), so they are intentionally absent — sync() guards on a missing adapter.
  private readonly adapters: Partial<Record<EnrollmentProvider, EnrollmentAdapter>>

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
    const [source, latest, studentCount] = await Promise.all([
      this.prisma.enrollmentSource.findUnique({ where: { schoolId } }),
      this.prisma.enrollmentSnapshot.findFirst({ where: { schoolId }, orderBy: { observedOn: 'desc' } }),
      this.prisma.student.count({ where: { schoolId } }),
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
      // Phase 5 — an SIS source ALWAYS wins; roster mode needs no source + ≥1 student.
      rosterMode: source ? 'sis' : studentCount > 0 ? 'roster' : 'none',
      studentCount,
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
      // A purge that would blank a value which SUPERSEDED a manual entry instead
      // RESTORES the backed-up manual figure (Decision C — reversible), so a
      // hand-entered number is never silently lost by a disconnect.
      const superseded = await this.prisma.periodOperationalData.findMany({
        where: { schoolId, enrollmentSupersededAt: { not: null } },
      })
      for (const op of superseded) {
        await this.prisma.periodOperationalData.update({
          where: { id: op.id },
          data: {
            enrollment: op.enrollmentSupersededManual,
            enrollmentFte: op.enrollmentSupersededManualFte,
            enrollmentSourceProvider: null,
            enrollmentSupersededManual: null,
            enrollmentSupersededManualFte: null,
            enrollmentSupersededAt: null,
          },
        })
      }
      // Clear ONLY the remaining connector-stamped values; a hand-entered enrollment
      // (null stamp) stays.
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
    return this.intakeNormalized(actor, schoolId, normalized, { sourceId: null })
  }

  /**
   * Live sync the connected provider (Blackbaud/OneRoster REST/FACTS/Veracross).
   *
   * INTERNAL — returns the provider's per-student ROWS alongside the intake result,
   * and those rows carry student NAMES. It is deliberately not what the controller
   * returns: RosterUploadService.sync() consumes the rows to create records and
   * hands back a counts-only response. Renamed from `sync` so no caller can return
   * this value to a client by reflex.
   *
   * Records are created by RosterUploadService, not here: StudentsService imports
   * THIS service, so this one can never import StudentsService (the same cycle that
   * made the upload path a third service).
   */
  async syncAndIntake(
    actor: User,
    schoolId: string,
    asOf?: string,
  ): Promise<{ intake: EnrollmentIntakeResult; rows: readonly RawStudentRow[] }> {
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
    let roster: AdapterRoster
    try {
      roster = await adapter.fetch(source, asOf)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Enrollment sync failed.'
      await this.prisma.enrollmentSource
        .update({ where: { schoolId }, data: { status: 'error', lastError: message } })
        .catch(() => undefined)
      throw new BadRequestException(message)
    }
    const result = await this.intakeNormalized(actor, schoolId, roster.snapshot, { sourceId: source.id })
    await this.prisma.enrollmentSource
      .update({ where: { schoolId }, data: { status: 'connected', lastError: null, lastSyncedAt: new Date() } })
      .catch(() => undefined)
    return { intake: result, rows: roster.rows }
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
    return this.intakeNormalized(actor, schoolId, normalized, { sourceId: null })
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
    // Phase 5 — LIVE roster branch: no SIS source + ≥1 student ⇒ compute from
    // Student rows (enrolled only), resolving vsPlan through the SAME plan path.
    // The live roster describes TODAY, so it only answers unscoped or current-FY
    // requests; a historical periodId falls through to the snapshot branch (the
    // daily provider:'roster' snapshots carry the history).
    const rosterRows = (await this.rosterPeriodIsCurrent(schoolId, periodId))
      ? await this.rosterModeRows(schoolId)
      : null
    if (rosterRows) {
      const { totalEnrolled, byGrade } = rosterRollup(rosterRows)
      const observedOn = new Date().toISOString().slice(0, 10)
      // READ-ONLY period resolution (resolveExistingForImport — a GET must not create).
      const resolvedPeriodId =
        periodId ??
        (await this.periods.resolveExistingForImport(schoolId, fyEndForObservedOn(observedOn)))?.id ??
        null
      const supersededManual = resolvedPeriodId
        ? await this.supersededManualFor(schoolId, resolvedPeriodId)
        : null
      const planTotal = resolvedPeriodId ? await this.planTotalFor(schoolId, resolvedPeriodId) : null
      const vsPlan =
        planTotal != null && planTotal > 0
          ? { planTotal, gap: totalEnrolled - planTotal, gapPct: (totalEnrolled - planTotal) / planTotal }
          : null
      return {
        latest: { observedOn, totalEnrolled, byGrade },
        vsPlan,
        provider: 'roster',
        supersededManual,
        source: 'roster',
      }
    }

    const [latest, source] = await Promise.all([
      this.prisma.enrollmentSnapshot.findFirst({
        where: { schoolId, ...(periodId ? { fiscalPeriodId: periodId } : {}) },
        orderBy: { observedOn: 'desc' },
      }),
      this.prisma.enrollmentSource.findUnique({ where: { schoolId } }),
    ])
    const provider = latest?.provider ?? source?.provider ?? null
    const resolvedPeriodId = periodId ?? latest?.fiscalPeriodId ?? null
    const supersededManual = resolvedPeriodId
      ? await this.supersededManualFor(schoolId, resolvedPeriodId)
      : null
    if (!latest) return { latest: null, vsPlan: null, provider, supersededManual, source: 'snapshot' }

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
      supersededManual,
      source: 'snapshot',
    }
  }

  /**
   * The backed-up manual enrollment that a diocesan import superseded for this period
   * (Decision C), read from the PeriodOperationalData supersede columns. Null when the
   * period has no superseded manual entry. Drives the web reconciliation banner.
   */
  private async supersededManualFor(
    schoolId: string,
    fiscalPeriodId: string,
  ): Promise<{ value: number; fte: number | null; at: string } | null> {
    const op = await this.prisma.periodOperationalData.findUnique({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId } },
      select: {
        enrollmentSupersededManual: true,
        enrollmentSupersededManualFte: true,
        enrollmentSupersededAt: true,
      },
    })
    if (!op || op.enrollmentSupersededAt == null || op.enrollmentSupersededManual == null) return null
    return {
      value: op.enrollmentSupersededManual,
      fte: op.enrollmentSupersededManualFte != null ? Number(op.enrollmentSupersededManualFte) : null,
      at: op.enrollmentSupersededAt.toISOString(),
    }
  }

  // ── Internals ─────────────────────────────────────────────────────────────────

  /**
   * The shared intake pipeline (PUBLIC — the org diocesan fan-out calls it per
   * school): resolve the FY period from observedOn, upsert an idempotent snapshot
   * (schoolId + sourceId + observedOn, now carrying byDemographics), then PROMOTE
   * the headcount into PeriodOperationalData.enrollment. `opts.supersedeManual`
   * (org import only) lets the promote overwrite a hand-entered manual value with a
   * reversible backup. Audits imported (+ promoted / superseded).
   */
  async intakeNormalized(
    actor: User,
    schoolId: string,
    normalized: NormalizedEnrollmentSnapshot,
    opts: IntakeOptions = {},
  ): Promise<EnrollmentIntakeResult> {
    const sourceId = opts.sourceId ?? null
    // AN EXPLICIT YEAR WINS OVER THE DATE-DERIVED ONE. `observedOn` still dates the
    // reading (it is the time axis and the idempotency key); it just no longer gets
    // to DECIDE the year by itself. Absent an explicit id this is byte-identical to
    // the previous behaviour, so every existing caller is unaffected.
    const fiscalPeriodId =
      opts.fiscalPeriodId ?? (await this.resolveFiscalPeriodId(schoolId, normalized.observedOn))
    const observedOn = new Date(normalized.observedOn)
    const provider = normalized.provider as EnrollmentProvider

    const snapshotData = {
      provider,
      totalEnrolled: normalized.totalEnrolled,
      byGrade: normalized.byGrade as object,
      byStatus: (normalized.byStatus ?? undefined) as object | undefined,
      byDemographics: (normalized.byDemographics ?? undefined) as object | undefined,
      fte: normalized.fte ?? null,
      raw: (normalized.raw ?? undefined) as object | undefined,
      fiscalPeriodId,
    }
    // Idempotent by (school, source, observedOn). Prisma's ON CONFLICT can't match a
    // NULL sourceId, so we find-then-update/create explicitly to keep re-imports clean.
    //
    // …and with a NULL sourceId the PROVIDER is part of the key. NULLs are distinct
    // in Postgres, so the (schoolId, sourceId, observedOn) unique does not apply to
    // sourceId-NULL rows at all: that slot is shared by every source-less writer —
    // 'manual', 'roster', 'oneroster_csv', 'diocesan'. Without the provider filter a
    // roster upload's file snapshot silently OVERWROTE the provider:'roster'
    // snapshot the register had written seconds earlier in the same request (flipping
    // its provider while keeping its demographics), and the next roster sync, finding
    // no 'roster' row for that day, inserted a second one — two same-day snapshots
    // with different totals and no tiebreaker for readers that take "the latest".
    // With a REAL sourceId the unique constraint is the key, and the provider is
    // fixed by the source row, so the lookup there is left exactly as it was.
    const existing = await this.prisma.enrollmentSnapshot.findFirst({
      where: { schoolId, sourceId, observedOn, ...(sourceId === null ? { provider } : {}) },
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

    // opts.promote === false ⇒ file history only; another writer owns the headcount.
    const promo =
      opts.promote === false
        ? { promoted: false, superseded: false, supersededManual: null }
        : await this.promote(actor, schoolId, fiscalPeriodId, normalized, {
            supersedeManual: opts.supersedeManual ?? false,
          })
    return {
      snapshot: {
        observedOn: normalized.observedOn,
        totalEnrolled: normalized.totalEnrolled,
        byGrade: normalized.byGrade,
      },
      promoted: promo.promoted,
      superseded: promo.superseded,
      supersededManual: promo.supersededManual,
      fiscalPeriodId,
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
    opts: { supersedeManual?: boolean; skipAudit?: boolean } = {},
  ): Promise<{ promoted: boolean; superseded: boolean; supersededManual: number | null }> {
    const existing = await this.prisma.periodOperationalData.findUnique({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId } },
    })
    // A "manual" operational enrollment is one a human entered: either the
    // operational-data form (no stamp → null) OR the enrollment manual() endpoint
    // (stamped 'manual'). Both are eligible to be superseded by an org import.
    const isManual =
      !!existing &&
      existing.enrollment != null &&
      (existing.enrollmentSourceProvider == null || existing.enrollmentSourceProvider === 'manual')

    // BACKWARD-COMPATIBLE per-school guard: without opts.supersedeManual, a manual
    // entry is left untouched exactly as before.
    if (isManual && !opts.supersedeManual) {
      return { promoted: false, superseded: false, supersededManual: null }
    }

    const total = normalized.totalEnrolled
    const providerStamp = normalized.provider
    let superseded = false
    let supersededManual: number | null = null

    // ORG-IMPORT SUPERSEDE (Decision C): back up the ORIGINAL manual value once
    // (preserve it across repeat re-imports), then overwrite. Reversible via
    // revertManual. Mark the school's manual snapshot rows superseded for history.
    const backup: Record<string, unknown> = {}
    if (isManual && opts.supersedeManual && existing) {
      superseded = true
      supersededManual = existing.enrollment
      if (existing.enrollmentSupersededAt == null) {
        backup.enrollmentSupersededManual = existing.enrollment
        backup.enrollmentSupersededManualFte = existing.enrollmentFte
        backup.enrollmentSupersededAt = new Date()
      }
    }

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
        ...backup,
      },
    })

    if (superseded) {
      // Flag the school's manual snapshot rows for THIS period as superseded history.
      await this.prisma.enrollmentSnapshot.updateMany({
        where: { schoolId, fiscalPeriodId, provider: 'manual', supersededByImport: false },
        data: { supersededByImport: true, supersededAt: new Date() },
      })
      await this.audit.write({
        schoolId,
        userId: actor.id,
        action: 'enrollment.superseded_manual',
        targetType: 'period_operational_data',
        metadata: { fiscalPeriodId, enrollment: total, provider: providerStamp, supersededManual },
      })
    }

    // Phase 5 — the roster AUTO-SYNC promotes on every mutation; those calls pass
    // skipAudit (the mutation itself is audited) so the log isn't flooded.
    if (!opts.skipAudit) {
      await this.audit.write({
        schoolId,
        userId: actor.id,
        action: 'enrollment.promoted',
        targetType: 'period_operational_data',
        metadata: { fiscalPeriodId, enrollment: total, provider: providerStamp },
      })
    }
    return { promoted: true, superseded, supersededManual }
  }

  /**
   * REVERT a manual-supersede (Decision C, reversible). Restores the backed-up
   * manual `enrollment`/`fte`, clears the connector stamp + backup columns, and
   * un-flags the period's manual snapshot rows. No-op-safe when nothing was
   * superseded. Audits enrollment.reverted_to_manual.
   */
  async revertManual(actor: User, schoolId: string, periodId: string): Promise<{ reverted: boolean; enrollment: number | null }> {
    const op = await this.prisma.periodOperationalData.findUnique({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: periodId } },
    })
    if (!op || op.enrollmentSupersededAt == null || op.enrollmentSupersededManual == null) {
      return { reverted: false, enrollment: op?.enrollment ?? null }
    }
    const restored = op.enrollmentSupersededManual
    await this.prisma.periodOperationalData.update({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: periodId } },
      data: {
        enrollment: restored,
        enrollmentFte: op.enrollmentSupersededManualFte,
        enrollmentSourceProvider: null, // back to a hand-entered (manual) value
        enrollmentSupersededManual: null,
        enrollmentSupersededManualFte: null,
        enrollmentSupersededAt: null,
        updatedByUserId: actor.id,
      },
    })
    await this.prisma.enrollmentSnapshot.updateMany({
      where: { schoolId, fiscalPeriodId: periodId, provider: 'manual', supersededByImport: true },
      data: { supersededByImport: false, supersededAt: null },
    })
    await this.audit.write({
      schoolId,
      userId: actor.id,
      action: 'enrollment.reverted_to_manual',
      targetType: 'period_operational_data',
      metadata: { fiscalPeriodId: periodId, enrollment: restored },
    })
    return { reverted: true, enrollment: restored }
  }

  /**
   * Latest-snapshot demographic + grade mix for a school (optionally period-scoped).
   * Shares + Blau/Simpson diversity computed by the canonical @finrep/analytics
   * (never inlined). Null dimensions when the latest snapshot carried no demographics.
   */
  async demographics(schoolId: string, periodId?: string): Promise<EnrollmentDemographicsView | null> {
    // Phase 5 — LIVE roster branch (enrolled students only, canonical counts).
    // Same period rule as summary(): live answers only unscoped/current-FY
    // requests; a historical periodId uses the period-filtered snapshot branch.
    const rosterRows = (await this.rosterPeriodIsCurrent(schoolId, periodId))
      ? await this.rosterModeRows(schoolId)
      : null
    if (rosterRows) {
      const { totalEnrolled, byGrade, byDemographics } = rosterRollup(rosterRows)
      const gender = byDemographics.gender && Object.keys(byDemographics.gender).length
        ? { counts: byDemographics.gender as Record<string, number>, shares: toShares(byDemographics.gender) }
        : null
      const ethnicity = byDemographics.ethnicity && Object.keys(byDemographics.ethnicity).length
        ? { counts: byDemographics.ethnicity as Record<string, number>, shares: toShares(byDemographics.ethnicity) }
        : null
      const race = byDemographics.race && Object.keys(byDemographics.race).length
        ? {
            counts: byDemographics.race as Record<string, number>,
            shares: toShares(byDemographics.race),
            diversityIndex: diversityIndex(byDemographics.race),
          }
        : null
      return {
        observedOn: new Date().toISOString().slice(0, 10),
        provider: 'roster',
        totalEnrolled,
        gender,
        ethnicity,
        race,
        gradeMix: { counts: byGrade, shares: gradeMixShares(byGrade) },
        source: 'roster',
      }
    }

    const latest = await this.prisma.enrollmentSnapshot.findFirst({
      where: { schoolId, ...(periodId ? { fiscalPeriodId: periodId } : {}) },
      orderBy: { observedOn: 'desc' },
    })
    if (!latest) return null
    const demo = (latest.byDemographics ?? {}) as DemographicBreakdown
    const byGrade = (latest.byGrade ?? {}) as Partial<Record<GradeKey, number>>

    const gender = demo.gender && Object.keys(demo.gender).length
      ? { counts: demo.gender as Record<string, number>, shares: toShares(demo.gender) }
      : null
    const ethnicity = demo.ethnicity && Object.keys(demo.ethnicity).length
      ? { counts: demo.ethnicity as Record<string, number>, shares: toShares(demo.ethnicity) }
      : null
    const race = demo.race && Object.keys(demo.race).length
      ? {
          counts: demo.race as Record<string, number>,
          shares: toShares(demo.race),
          diversityIndex: diversityIndex(demo.race),
        }
      : null

    return {
      observedOn: iso(latest.observedOn),
      provider: latest.provider,
      totalEnrolled: latest.totalEnrolled,
      gender,
      ethnicity,
      race,
      gradeMix: { counts: byGrade, shares: gradeMixShares(byGrade) },
      source: 'snapshot',
    }
  }

  /**
   * Phase 5 — may a live-roster read answer this request? True when unscoped or
   * when the requested period IS the current FY period (READ-ONLY resolution —
   * a GET must never create periods). A historical periodId returns false so the
   * caller falls through to the period-filtered snapshot branch instead of
   * mislabelling today's roster as that period's data.
   */
  private async rosterPeriodIsCurrent(schoolId: string, periodId?: string): Promise<boolean> {
    if (!periodId) return true
    const today = new Date().toISOString().slice(0, 10)
    const current = await this.periods.resolveExistingForImport(schoolId, fyEndForObservedOn(today))
    return current?.id === periodId
  }

  /**
   * Phase 5 — the roster rows WHEN the school is in 'roster' mode (no SIS source
   * + ≥1 student); null otherwise so callers fall through to the snapshot branch
   * byte-identical to before. Selects only rollup fields — never names.
   */
  private async rosterModeRows(
    schoolId: string,
  ): Promise<{ status: string; grade: string; gender: string | null; race: string | null; ethnicity: string | null }[] | null> {
    const source = await this.prisma.enrollmentSource.findUnique({ where: { schoolId } })
    if (source) return null
    const rows = await this.prisma.student.findMany({
      where: { schoolId },
      select: { status: true, grade: true, gender: true, race: true, ethnicity: true },
    })
    return rows.length > 0 ? rows : null
  }

  /**
   * Phase 5 — PUBLIC thin wrapper over the existing private promote path for
   * roster-derived snapshots: resolves the FY period from observedOn, promotes
   * with the 'roster' stamp (fill-when-null / overwrite-own-stamp only, so a
   * hand-entered manual value is never clobbered), and stays QUIET (no
   * enrollment.promoted audit row — the roster mutation was already audited).
   *
   * `opts.supersedeManual` (default FALSE — the background auto-sync after a
   * single student edit must never touch a head of school's own number) opts a
   * DELIBERATE, explicit roster upload into the reversible Decision-C supersede.
   */
  async promoteRoster(
    actor: User,
    schoolId: string,
    normalized: NormalizedEnrollmentSnapshot,
    opts: { supersedeManual?: boolean; fiscalPeriodId?: string } = {},
  ): Promise<{
    fiscalPeriodId: string
    promoted: boolean
    superseded: boolean
    supersededManual: number | null
  }> {
    // THE ROSTER PATH NEEDS THE CHOSEN YEAR TOO. When an upload creates records the
    // ROSTER promotes, not the file — so threading the chosen year only into
    // intakeNormalized left the picker inert for exactly the uploads that matter.
    // Verified: an upload sent explicitly at FY 2026 still landed in FY 2027.
    const fiscalPeriodId =
      opts.fiscalPeriodId ?? (await this.resolveFiscalPeriodId(schoolId, normalized.observedOn))
    const res = await this.promote(actor, schoolId, fiscalPeriodId, normalized, {
      skipAudit: true,
      supersedeManual: opts.supersedeManual ?? false,
    })
    return {
      fiscalPeriodId,
      promoted: res.promoted,
      superseded: res.superseded,
      supersededManual: res.supersededManual,
    }
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

/** True when the buffer starts with the ZIP local-file-header magic ('PK').
 *  EXPORTED (unchanged behaviour) so the roster-upload orchestrator normalizes an
 *  upload with the SAME two helpers this service uses — one reader, not two. */
export function looksLikeZip(buf: Buffer): boolean {
  return buf.length >= 2 && buf[0] === ZIP_SIGNATURE[0] && buf[1] === ZIP_SIGNATURE[1]
}

/**
 * Wrap a bare users.csv buffer into a minimal STORED (uncompressed) ZIP so the pure
 * OneRoster ZIP parser can consume a single-CSV upload too. Correct CRC32 so the
 * archive is spec-valid.
 */
export function wrapCsvAsZip(csv: Buffer): Buffer {
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
