// ─────────────────────────────────────────────────────────────────────────────
// Granular diocesan enrollment — the two-step ORG import orchestrator.
//
// Step 1 (preview): parse ONE org file (all schools) → name-match every row →
// PERSIST a durable DiocesanEnrollmentImport(reviewing) + rows → return the review
// payload (so a 40-school review survives reload/resume).
// Step 2 (apply): merge the reviewer's per-row decisions over the persisted state,
// then for each matched + permitted + entitled row fan out into the EXISTING
// per-school EnrollmentService.intakeNormalized (snapshot + promote), superseding a
// manual entry reversibly, and learn name aliases. Un-permitted/un-entitled schools
// become `skipped` with a reason — never blocking the batch.
//
// JwtAuthGuard-only route: org isolation is enforced HERE (active membership in the
// org → 403 otherwise, the QBO-org precedent); per-school owner|accountant + the
// `enrollment` entitlement are enforced inside apply().
// ─────────────────────────────────────────────────────────────────────────────
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import type { NormalizedEnrollmentSnapshot, User } from '@finrep/db'
import { parseDiocesanEnrollment } from '@finrep/ingestion/diocesan'
import { PrismaService } from '../../prisma/prisma.service.js'
import { BillingService } from '../../billing/billing.service.js'
import { AuditService } from '../../common/audit/audit.service.js'
import { PeriodsService } from '../../periods/periods.service.js'
import { EnrollmentService, type UploadedRosterFile } from '../enrollment.service.js'
import { NameMatchService, type OrgMatchIndex } from './name-match.service.js'
import type { DiocesanApplyDto, RowDecisionInput } from '../dto/diocesan.dto.js'

const iso = (d: Date): string => d.toISOString().slice(0, 10)
const todayIso = (): string => new Date().toISOString().slice(0, 10)

/** FY-end (Jun 30) for an observed date, per the Jul–Jun convention. */
function fyEndForObservedOn(observedOn: string): string {
  const [y, m] = observedOn.split('-').map(Number)
  const endYear = (m ?? 1) >= 7 ? (y ?? 0) + 1 : y ?? 0
  return `${endYear}-06-30`
}

// ── Review payload shapes ─────────────────────────────────────────────────────

export interface DiocesanReviewRow {
  rowId: string
  sourceName: string
  normalizedName: string
  tier: string
  decision: string
  match: { schoolId: string; name: string | null; confidence: number | null; matchTier: string; viaAlias: boolean } | null
  candidates: unknown
  total: number
  byGrade: Record<string, number>
  byStatus: Record<string, number> | null
  byDemographics: unknown
  warnings: string[]
  supersedes: { hasManual: boolean; manualTotal: number | null }
}

export interface DiocesanReviewPayload {
  importId: string
  orgId: string
  sourceShape: string
  observedOn: string | null
  status: string
  fileName: string | null
  summary: {
    totalRows: number
    autoMatched: number
    needsReview: number
    unmatched: number
    skipped: number
    totalStudents: number
  }
  schoolOptions: { schoolId: string; name: string; alreadyMatchedRowId: string | null; hasManualEntry: boolean }[]
  rows: DiocesanReviewRow[]
  warnings: string[]
}

export interface DiocesanApplyResult {
  total: number
  applied: number
  superseded: number
  skipped: number
  failed: number
  results: {
    schoolId: string | null
    name: string
    status: 'applied' | 'superseded' | 'skipped' | 'failed'
    totalEnrolled?: number
    supersededManual?: number | null
    reason?: string
  }[]
}

@Injectable()
export class DiocesanEnrollmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly enrollment: EnrollmentService,
    private readonly nameMatch: NameMatchService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
    private readonly periods: PeriodsService,
  ) {}

  /**
   * The persistent per-school EnrollmentSource id for the DIOCESAN channel (provider
   * 'diocesan_csv'), so a diocesan snapshot carries a DISTINCT non-null sourceId and
   * never collides with a hand-entered MANUAL snapshot (sourceId=null) on the shared
   * @@unique[schoolId, sourceId, observedOn] key. Reuses the school's existing source
   * row when one is already present (any provider) — schoolId is unique, so we never
   * clobber a live SIS connection; re-imports stay idempotent on the same id.
   */
  private async diocesanSourceIdFor(schoolId: string, userId: string): Promise<string> {
    const existing = await this.prisma.enrollmentSource.findUnique({ where: { schoolId } })
    if (existing) return existing.id
    const created = await this.prisma.enrollmentSource.create({
      data: {
        schoolId,
        provider: 'diocesan_csv',
        status: 'connected',
        connectedByUserId: userId,
      },
    })
    return created.id
  }

  /** The caller's active memberships inside `orgId` (403 when none). */
  private async orgMemberships(user: User, orgId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId: user.id, status: 'active' },
      include: { school: true },
    })
    const inOrg = memberships.filter((m) => m.school.organizationId === orgId)
    if (inOrg.length === 0) {
      throw new ForbiddenException('You do not have access to this organization.')
    }
    return inOrg
  }

  // ── Step 1 — parse + match + persist (NO promote) ────────────────────────────

  async preview(
    user: User,
    orgId: string,
    file: UploadedRosterFile | undefined,
    observedOnOverride?: string,
  ): Promise<DiocesanReviewPayload> {
    await this.orgMemberships(user, orgId)
    if (!file || !file.buffer || file.size === 0) {
      throw new NotFoundException('No file uploaded.')
    }
    const parsed = parseDiocesanEnrollment(file.buffer, observedOnOverride ? { observedOn: observedOnOverride } : undefined)
    const observedOn = observedOnOverride ?? parsed.observedOn ?? null

    const index = await this.nameMatch.buildIndex(orgId)

    const created = await this.prisma.diocesanEnrollmentImport.create({
      data: {
        organizationId: orgId,
        observedOn: observedOn ? new Date(observedOn) : null,
        sourceShape: parsed.sourceShape,
        provider: 'diocesan_csv',
        status: 'reviewing',
        fileName: file.originalname ?? null,
        totalRows: parsed.rows.length,
        raw: { warnings: parsed.warnings } as object,
        uploadedByUserId: user.id,
      },
    })

    // Match + persist every row.
    for (const r of parsed.rows) {
      const m = this.nameMatch.matchOne(r.sourceName, index)
      await this.prisma.diocesanEnrollmentRow.create({
        data: {
          importId: created.id,
          sourceName: r.sourceName,
          normalizedName: m.normalizedName,
          matchedSchoolId: m.matchedSchoolId,
          matchStatus: m.decision, // auto | review | unmatched
          confidence: m.confidence,
          matchTier: m.tier,
          candidates: m.candidates as object,
          total: r.total,
          byGrade: (r.byGrade ?? {}) as object,
          byStatus: (r.byStatus ?? undefined) as object | undefined,
          byDemographics: (r.byDemographics ?? undefined) as object | undefined,
          warnings: (r.warnings ?? []) as object,
        },
      })
    }

    await this.audit.write({
      organizationId: orgId,
      userId: user.id,
      action: 'enrollment.diocesan_import_previewed',
      targetType: 'diocesan_enrollment_imports',
      targetId: created.id,
      metadata: { sourceShape: parsed.sourceShape, totalRows: parsed.rows.length },
    })

    return this.buildReviewPayload(orgId, created.id, index)
  }

  /**
   * Penny one-shot: preview (persist the staging batch) then apply with NO reviewer
   * overrides — so ONLY the high-confidence auto-matched rows land, and the ambiguous
   * rows stay in `reviewing`… except apply() flips the import to `applied`; for the
   * Penny path we keep the durable batch so the user can still open the review screen
   * for the leftovers. Returns the apply result + the importId.
   */
  async importFromPenny(
    user: User,
    orgId: string,
    file: UploadedRosterFile | undefined,
    observedOn?: string,
  ): Promise<DiocesanApplyResult & { importId: string }> {
    const preview = await this.preview(user, orgId, file, observedOn)
    const result = await this.apply(user, orgId, preview.importId, {})
    return { importId: preview.importId, ...result }
  }

  // ── Re-fetch (resume after reload) ───────────────────────────────────────────

  async getImport(user: User, orgId: string, importId: string): Promise<DiocesanReviewPayload> {
    await this.orgMemberships(user, orgId)
    const index = await this.nameMatch.buildIndex(orgId)
    return this.buildReviewPayload(orgId, importId, index)
  }

  private async buildReviewPayload(
    orgId: string,
    importId: string,
    index: OrgMatchIndex,
  ): Promise<DiocesanReviewPayload> {
    const imp = await this.prisma.diocesanEnrollmentImport.findFirst({
      where: { id: importId, organizationId: orgId },
      include: { rows: { orderBy: { createdAt: 'asc' } } },
    })
    if (!imp) throw new NotFoundException('Import not found.')

    const observedOn = imp.observedOn ? iso(imp.observedOn) : null
    // Manual-entry lookup for the supersede hints (best-effort; no period creation).
    const manualBySchool = await this.manualEntriesFor(
      index.candidates.map((c) => c.schoolId),
      observedOn,
    )

    // Which school is currently claimed by which row (blocks double-assign).
    const claimedBy = new Map<string, string>()
    for (const r of imp.rows) {
      if (r.matchedSchoolId && r.matchStatus !== 'skipped' && r.matchStatus !== 'unmatched') {
        if (!claimedBy.has(r.matchedSchoolId)) claimedBy.set(r.matchedSchoolId, r.id)
      }
    }

    const rows: DiocesanReviewRow[] = imp.rows.map((r) => {
      const manual = r.matchedSchoolId ? manualBySchool.get(r.matchedSchoolId) : undefined
      return {
        rowId: r.id,
        sourceName: r.sourceName,
        normalizedName: r.normalizedName,
        tier: r.matchTier ?? 'none',
        decision: r.matchStatus,
        match: r.matchedSchoolId
          ? {
              schoolId: r.matchedSchoolId,
              name: index.candidates.find((c) => c.schoolId === r.matchedSchoolId)?.name ?? null,
              confidence: r.confidence,
              matchTier: r.matchTier ?? 'none',
              viaAlias: r.matchTier === 'alias',
            }
          : null,
        candidates: r.candidates ?? [],
        total: r.total,
        byGrade: (r.byGrade ?? {}) as Record<string, number>,
        byStatus: (r.byStatus ?? null) as Record<string, number> | null,
        byDemographics: r.byDemographics ?? null,
        warnings: (r.warnings ?? []) as string[],
        supersedes: { hasManual: manual != null, manualTotal: manual ?? null },
      }
    })

    const summary = {
      totalRows: rows.length,
      autoMatched: imp.rows.filter((r) => r.matchStatus === 'auto' || r.matchStatus === 'applied').length,
      needsReview: imp.rows.filter((r) => r.matchStatus === 'review').length,
      unmatched: imp.rows.filter((r) => r.matchStatus === 'unmatched').length,
      skipped: imp.rows.filter((r) => r.matchStatus === 'skipped').length,
      totalStudents: rows.reduce((s, r) => s + (r.total || 0), 0),
    }

    const schoolOptions = index.candidates
      .map((c) => ({
        schoolId: c.schoolId,
        name: c.name,
        alreadyMatchedRowId: claimedBy.get(c.schoolId) ?? null,
        hasManualEntry: manualBySchool.has(c.schoolId),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    const warnings: string[] = []
    const rawWarnings = (imp.raw as { warnings?: string[] } | null)?.warnings
    if (Array.isArray(rawWarnings)) warnings.push(...rawWarnings)
    if (summary.unmatched > 0) warnings.push(`${summary.unmatched} row(s) could not be matched to a school.`)

    return {
      importId: imp.id,
      orgId,
      sourceShape: imp.sourceShape,
      observedOn,
      status: imp.status,
      fileName: imp.fileName,
      summary,
      schoolOptions,
      rows,
      warnings,
    }
  }

  /** Map schoolId → manual enrollment total, for schools with a hand-entered value in
   *  the FY resolved from `observedOn`. Resolves the SAME period apply() will target
   *  (PeriodsService.resolveExistingForImport — read-only, no period creation) so the
   *  supersede hint matches what apply actually does. Empty when unknown. */
  private async manualEntriesFor(schoolIds: string[], observedOn: string | null): Promise<Map<string, number>> {
    const out = new Map<string, number>()
    if (schoolIds.length === 0 || !observedOn) return out
    const fyEnd = fyEndForObservedOn(observedOn)
    await Promise.all(
      schoolIds.map(async (schoolId) => {
        const period = await this.periods.resolveExistingForImport(schoolId, fyEnd)
        if (!period) return
        const op = await this.prisma.periodOperationalData.findUnique({
          where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
          select: { enrollment: true, enrollmentSourceProvider: true },
        })
        // Only a hand-entered value (no connector stamp) counts as a manual entry.
        if (op && op.enrollment != null && op.enrollmentSourceProvider == null) {
          out.set(schoolId, op.enrollment)
        }
      }),
    )
    return out
  }

  // ── Reviewer override (persisted) ────────────────────────────────────────────

  async patchRow(
    user: User,
    orgId: string,
    importId: string,
    rowId: string,
    dto: { action: 'match' | 'skip' | 'unmatch'; schoolId?: string; learnAlias?: boolean },
  ): Promise<DiocesanReviewPayload> {
    await this.orgMemberships(user, orgId)
    const row = await this.prisma.diocesanEnrollmentRow.findFirst({
      where: { id: rowId, import: { id: importId, organizationId: orgId } },
    })
    if (!row) throw new NotFoundException('Row not found.')

    if (dto.action === 'skip') {
      await this.prisma.diocesanEnrollmentRow.update({
        where: { id: rowId },
        data: { matchStatus: 'skipped' },
      })
    } else if (dto.action === 'unmatch') {
      await this.prisma.diocesanEnrollmentRow.update({
        where: { id: rowId },
        data: { matchStatus: 'unmatched', matchedSchoolId: null },
      })
    } else {
      // match — a reviewer confirmation becomes an auto-apply row (tier retained).
      const schoolId = dto.schoolId ?? row.matchedSchoolId
      if (!schoolId) throw new NotFoundException('A school must be chosen to match this row.')
      await this.prisma.diocesanEnrollmentRow.update({
        where: { id: rowId },
        data: { matchStatus: 'auto', matchedSchoolId: schoolId },
      })
    }
    const index = await this.nameMatch.buildIndex(orgId)
    return this.buildReviewPayload(orgId, importId, index)
  }

  // ── Step 2 — apply ───────────────────────────────────────────────────────────

  async apply(user: User, orgId: string, importId: string, dto: DiocesanApplyDto): Promise<DiocesanApplyResult> {
    const inOrg = await this.orgMemberships(user, orgId)
    const roleBySchool = new Map<string, string>()
    for (const m of inOrg) roleBySchool.set(m.schoolId, m.role)
    const nameBySchool = new Map<string, string>()
    for (const m of inOrg) nameBySchool.set(m.schoolId, m.school.name)

    const imp = await this.prisma.diocesanEnrollmentImport.findFirst({
      where: { id: importId, organizationId: orgId },
      include: { rows: { orderBy: { createdAt: 'asc' } } },
    })
    if (!imp) throw new NotFoundException('Import not found.')

    const observedOn = dto.observedOn ?? (imp.observedOn ? iso(imp.observedOn) : null) ?? todayIso()
    const overrides = new Map<string, RowDecisionInput>()
    for (const r of dto.rows ?? []) overrides.set(r.rowId, r)

    const results: DiocesanApplyResult['results'] = []
    // Guard against two rows in one file targeting the same school at the same
    // observedOn (a diocesan file with duplicate/near-duplicate lines) — the first
    // wins; the second is skipped rather than silently overwriting it.
    const appliedSchoolIds = new Set<string>()

    for (const row of imp.rows) {
      const ov = overrides.get(row.id)
      // Resolve the FINAL action for this row (override merged over persisted state).
      let action: 'match' | 'skip' | 'unmatch' | 'none'
      let schoolId: string | null
      let learnAlias: boolean
      if (ov) {
        action = ov.action
        schoolId = ov.action === 'match' ? (ov.schoolId ?? row.matchedSchoolId) : null
        learnAlias = ov.learnAlias !== false
      } else if (row.matchStatus === 'auto' || row.matchStatus === 'applied') {
        action = 'match'
        schoolId = row.matchedSchoolId
        learnAlias = false
      } else {
        action = 'none' // review/unmatched/skipped, never confirmed → not applied
        schoolId = null
        learnAlias = false
      }

      const displayName =
        (schoolId ? nameBySchool.get(schoolId) : null) ?? row.sourceName

      if (action !== 'match' || !schoolId) {
        results.push({
          schoolId,
          name: displayName,
          status: 'skipped',
          reason:
            action === 'skip'
              ? 'skipped by reviewer'
              : row.matchStatus === 'unmatched'
                ? 'no school match'
                : 'needs review',
        })
        continue
      }

      // Double-assign guard: a school already imported by an earlier row in this file.
      if (appliedSchoolIds.has(schoolId)) {
        results.push({
          schoolId,
          name: displayName,
          status: 'skipped',
          reason: 'already imported from another row in this file',
        })
        continue
      }

      // Per-school permission + entitlement (this org route can't carry the guards).
      const role = roleBySchool.get(schoolId)
      if (role !== 'owner' && role !== 'accountant') {
        results.push({ schoolId, name: displayName, status: 'skipped', reason: 'no owner/accountant access to this school' })
        continue
      }
      if (!(await this.billing.isEntitledForModule(schoolId, 'enrollment').catch(() => false))) {
        results.push({ schoolId, name: displayName, status: 'skipped', reason: 'not licensed for enrollment' })
        continue
      }

      try {
        const normalized: NormalizedEnrollmentSnapshot = {
          observedOn,
          provider: 'diocesan_csv',
          totalEnrolled: row.total,
          byGrade: (row.byGrade ?? {}) as NormalizedEnrollmentSnapshot['byGrade'],
          byStatus: (row.byStatus ?? undefined) as NormalizedEnrollmentSnapshot['byStatus'],
          byDemographics: (row.byDemographics ?? null) as NormalizedEnrollmentSnapshot['byDemographics'],
          warnings: [],
        }
        // Diocesan imports carry a DISTINCT non-null sourceId so they never collide
        // with a hand-entered manual snapshot (sourceId=null) — the manual survives
        // and promote() flags it superseded (reversible) instead of overwriting it.
        const diocesanSourceId = await this.diocesanSourceIdFor(schoolId, user.id)
        const res = await this.enrollment.intakeNormalized(user, schoolId, normalized, {
          sourceId: diocesanSourceId,
          supersedeManual: true,
        })
        appliedSchoolIds.add(schoolId)
        if (learnAlias) {
          await this.nameMatch.learnAlias(orgId, row.normalizedName, schoolId, user.id)
        }
        await this.prisma.diocesanEnrollmentRow.update({
          where: { id: row.id },
          data: { matchStatus: 'applied', matchedSchoolId: schoolId },
        })
        results.push({
          schoolId,
          name: displayName,
          status: res.superseded ? 'superseded' : 'applied',
          totalEnrolled: row.total,
          ...(res.superseded ? { supersededManual: res.supersededManual ?? null } : {}),
        })
      } catch (e) {
        results.push({
          schoolId,
          name: displayName,
          status: 'failed',
          reason: e instanceof Error ? e.message : String(e),
        })
      }
    }

    const applied = results.filter((r) => r.status === 'applied' || r.status === 'superseded').length
    const superseded = results.filter((r) => r.status === 'superseded').length
    const skipped = results.filter((r) => r.status === 'skipped').length
    const failed = results.filter((r) => r.status === 'failed').length

    await this.prisma.diocesanEnrollmentImport.update({
      where: { id: imp.id },
      data: { status: 'applied', appliedAt: new Date() },
    })
    await this.audit.write({
      organizationId: orgId,
      userId: user.id,
      action: 'enrollment.diocesan_import_applied',
      targetType: 'diocesan_enrollment_imports',
      targetId: imp.id,
      metadata: { total: results.length, applied, superseded, skipped, failed },
    })

    return { total: results.length, applied, superseded, skipped, failed, results }
  }

  // ── Discard / aliases ────────────────────────────────────────────────────────

  async discard(user: User, orgId: string, importId: string): Promise<{ discarded: boolean }> {
    await this.orgMemberships(user, orgId)
    const imp = await this.prisma.diocesanEnrollmentImport.findFirst({
      where: { id: importId, organizationId: orgId },
    })
    if (!imp) throw new NotFoundException('Import not found.')
    await this.prisma.diocesanEnrollmentImport.delete({ where: { id: imp.id } })
    return { discarded: true }
  }

  async listAliases(user: User, orgId: string) {
    await this.orgMemberships(user, orgId)
    const aliases = await this.prisma.schoolNameAlias.findMany({
      where: { organizationId: orgId },
      include: { school: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return aliases.map((a) => ({
      id: a.id,
      alias: a.alias,
      schoolId: a.schoolId,
      schoolName: a.school.name,
      origin: a.origin,
      hitCount: a.hitCount,
    }))
  }

  async deleteAlias(user: User, orgId: string, id: string): Promise<{ deleted: boolean }> {
    await this.orgMemberships(user, orgId)
    const alias = await this.prisma.schoolNameAlias.findFirst({ where: { id, organizationId: orgId } })
    if (!alias) throw new NotFoundException('Alias not found.')
    await this.prisma.schoolNameAlias.delete({ where: { id } })
    return { deleted: true }
  }
}
