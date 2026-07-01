import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { AccreditationStandard, AccreditationEvidence } from '@finrep/db'
import {
  computeStandardCoverage,
  summarizeCoverage,
  type CoverageStatus,
  type ReviewStatus,
  type SchoolCoverageSummary,
} from '@finrep/compliance'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import type { CreateStandardDto } from './dto/create-standard.dto.js'
import type { UpdateStandardDto } from './dto/update-standard.dto.js'
import {
  EVIDENCE_KINDS,
  type CreateEvidenceDto,
  type EvidenceKind,
  type EvidenceSourceType,
} from './dto/create-evidence.dto.js'

/** One standard as returned to the client, with COMPUTED coverage + review urgency. */
export interface StandardPublic {
  id: string
  code: string
  title: string
  category: string | null
  reviewDate: string | null
  owner: string | null
  notes: string | null
  /** COMPUTED (never stored) — from @finrep/compliance. */
  evidenceCount: number
  coverage: CoverageStatus
  reviewStatus: ReviewStatus
  daysUntilReview: number | null
  createdAt: string
  updatedAt: string
}

export interface EvidencePublic {
  id: string
  standardId: string
  title: string
  kind: EvidenceKind
  reference: string | null
  notes: string | null
  capturedAt: string | null
  createdByUserId: string | null
  /** 'manual' (free-text) or a linked operational artifact. */
  sourceType: EvidenceSourceType
  /** The linked artifact's uuid (null for manual). */
  sourceRef: string | null
  /** Resolved source-domain label for the badge ('Governance'/'Reports'); null for manual. */
  sourceLabel: string | null
  /** Deep-link route for the badge ('/governance'/'/reports'); null for manual. */
  sourceLink: string | null
  createdAt: string
  updatedAt: string
}

export interface StandardListResponse {
  standards: StandardPublic[]
  summary: SchoolCoverageSummary
}

export interface EvidenceListResponse {
  evidence: EvidencePublic[]
}

/** One discoverable operational artifact the school can attach as evidence. */
export interface EvidenceSource {
  sourceType: 'policy' | 'board_report'
  sourceRef: string
  label: string
  date: string | null // yyyy-mm-dd, for the picker subtitle
  link: string // deep-link route: '/governance' | '/reports'
}

export interface EvidenceSourcesResponse {
  policies: EvidenceSource[]
  boardReports: EvidenceSource[]
}

/**
 * Source-domain metadata for a LINKED evidence's badge. Keyed by the non-manual
 * sourceType. `label` is the DOMAIN name (shown as "from Governance" + the row's own
 * title); `link` is the react-router route the badge navigates to. v1 links to the
 * domain page, not a per-artifact anchor (per-artifact deep-link deferred).
 */
const SOURCE_META: Record<'policy' | 'board_report', { label: string; link: string }> = {
  policy: { label: 'Governance', link: '/governance' },
  board_report: { label: 'Reports', link: '/reports' },
}

/** Deterministic list order: no-evidence first, then review pressure, then code. */
const REVIEW_ORDER: Record<ReviewStatus, number> = {
  overdue: 0,
  'due-soon': 1,
  current: 2,
  unknown: 3,
}

/** Serialize a DB @db.Date to yyyy-mm-dd with no timezone drift (UTC-midnight round-trip). */
function toIsoDate(d: Date | null): string | null {
  if (!d) return null
  return d.toISOString().slice(0, 10)
}

/** Parse an incoming ISO date string to a UTC-midnight Date, or throw. Null passes. */
function parseIsoDate(s: string | null | undefined, field: string): Date | null | undefined {
  if (s === undefined) return undefined
  if (s === null) return null
  const d = new Date(`${s.slice(0, 10)}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`Invalid ${field}: ${s}.`)
  return d
}

function normalizeKind(k: string | null | undefined): EvidenceKind {
  return (EVIDENCE_KINDS as readonly string[]).includes(k ?? '') ? (k as EvidenceKind) : 'document'
}

/**
 * Phase 4 Accreditation v1 — the STANDARDS + EVIDENCE register service. School-scoped
 * (NOT period-scoped). TENANT ISOLATION is enforced on EVERY query: reads filter by
 * `schoolId`, and every mutation first resolves the row `where { id, schoolId }` — a
 * standardId/evidenceId owned by another school resolves to null → NotFoundException,
 * so a cross-tenant mutation is IMPOSSIBLE (the foreign row never even loads).
 *
 * EVIDENCE LINKAGE (the tenant-integrity crux): evidence must belong to a standard
 * that belongs to the PATH school. Every evidence op resolves the parent standard
 * FIRST via resolveStandard (the compound {id, schoolId} lookup), then derives
 * schoolId from the resolved standard (NEVER from the client) — so evidence can never
 * be created under, listed from, or deleted under a foreign/cross-tenant standard,
 * and the denormalized evidence.schoolId can never disagree with its parent.
 *
 * Every response is enriched with the pure computeStandardCoverage (injectable `now`),
 * so the register list and the briefing 'accreditation' STEP share one source of
 * truth and can never disagree.
 */
@Injectable()
export class AccreditationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private toStandardPublic(
    row: AccreditationStandard,
    evidenceCount: number,
    now: Date,
  ): StandardPublic {
    const cov = computeStandardCoverage({ evidenceCount, reviewDate: row.reviewDate }, now)
    return {
      id: row.id,
      code: row.code,
      title: row.title,
      category: row.category,
      reviewDate: toIsoDate(row.reviewDate),
      owner: row.owner,
      notes: row.notes,
      evidenceCount,
      coverage: cov.coverage,
      reviewStatus: cov.reviewStatus,
      daysUntilReview: cov.daysUntilReview,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private toEvidencePublic(row: AccreditationEvidence): EvidencePublic {
    // Legacy/manual rows have sourceType 'manual' (the column default) → no source badge.
    const st = (row.sourceType ?? 'manual') as EvidenceSourceType
    const meta = st === 'manual' ? null : SOURCE_META[st]
    return {
      id: row.id,
      standardId: row.standardId,
      title: row.title,
      kind: normalizeKind(row.kind),
      reference: row.reference,
      notes: row.notes,
      capturedAt: toIsoDate(row.capturedAt),
      createdByUserId: row.createdByUserId,
      sourceType: st,
      sourceRef: row.sourceRef ?? null,
      // Denormalized display: the row's own `title` already holds the artifact name
      // (auto-derived at create time), so the badge needs no second query at read time.
      sourceLabel: meta ? meta.label : null,
      sourceLink: meta ? meta.link : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  /**
   * Resolve a standard that belongs to the PATH school — the tenant + existence gate
   * in ONE query. A foreign/unknown standardId → null → 404, so evidence ops can
   * never touch a cross-tenant/cross-standard target.
   */
  private async resolveStandard(schoolId: string, standardId: string): Promise<AccreditationStandard> {
    const std = await this.prisma.accreditationStandard.findFirst({
      where: { id: standardId, schoolId },
    })
    if (!std) throw new NotFoundException('Standard not found.')
    return std
  }

  /** List all standards for one school, deterministically ordered + enriched, plus the summary. */
  async listStandards(schoolId: string, now = new Date()): Promise<StandardListResponse> {
    const rows = await this.prisma.accreditationStandard.findMany({ where: { schoolId } })
    // Batch-count evidence per standard in ONE groupBy (avoid N+1).
    const counts = await this.prisma.accreditationEvidence.groupBy({
      by: ['standardId'],
      where: { schoolId },
      _count: { _all: true },
    })
    const countBy = new Map<string, number>()
    for (const c of counts) countBy.set(c.standardId, c._count._all)

    const standards = rows
      .map((r) => this.toStandardPublic(r, countBy.get(r.id) ?? 0, now))
      .sort((a, b) => {
        // gaps first (no-evidence before covered)
        const g = (a.coverage === 'no-evidence' ? 0 : 1) - (b.coverage === 'no-evidence' ? 0 : 1)
        if (g !== 0) return g
        const r = REVIEW_ORDER[a.reviewStatus] - REVIEW_ORDER[b.reviewStatus]
        if (r !== 0) return r
        const c = a.code.localeCompare(b.code)
        if (c !== 0) return c
        const t = a.title.localeCompare(b.title)
        return t !== 0 ? t : a.id.localeCompare(b.id)
      })
    const summary = summarizeCoverage(standards)
    return { standards, summary }
  }

  async createStandard(schoolId: string, dto: CreateStandardDto, userId: string): Promise<StandardPublic> {
    const reviewDate = parseIsoDate(dto.reviewDate, 'reviewDate') ?? null
    const row = await this.prisma.accreditationStandard.create({
      data: {
        schoolId,
        code: dto.code,
        title: dto.title,
        category: dto.category ?? null,
        reviewDate,
        owner: dto.owner ?? null,
        notes: dto.notes ?? null,
        updatedByUserId: userId,
      },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'accreditation.standard.created',
      targetType: 'accreditation_standards',
      targetId: row.id,
    })
    // A fresh standard has zero evidence.
    return this.toStandardPublic(row, 0, new Date())
  }

  async updateStandard(
    schoolId: string,
    standardId: string,
    dto: UpdateStandardDto,
    userId: string,
  ): Promise<StandardPublic> {
    const existing = await this.resolveStandard(schoolId, standardId)
    const pick = <T>(v: T | undefined, current: T): T => (v === undefined ? current : v)
    const reviewDate = parseIsoDate(dto.reviewDate, 'reviewDate')

    const row = await this.prisma.accreditationStandard.update({
      where: { id: existing.id },
      data: {
        code: pick(dto.code, existing.code),
        title: pick(dto.title, existing.title),
        category: pick(dto.category, existing.category),
        reviewDate: pick(reviewDate, existing.reviewDate),
        owner: pick(dto.owner, existing.owner),
        notes: pick(dto.notes, existing.notes),
        updatedByUserId: userId,
      },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'accreditation.standard.updated',
      targetType: 'accreditation_standards',
      targetId: row.id,
    })
    const count = await this.prisma.accreditationEvidence.count({ where: { schoolId, standardId: row.id } })
    return this.toStandardPublic(row, count, new Date())
  }

  async removeStandard(schoolId: string, standardId: string, userId: string): Promise<{ id: string }> {
    const existing = await this.resolveStandard(schoolId, standardId)
    // Evidence cascades via the FK ON DELETE CASCADE (no manual sweep).
    await this.prisma.accreditationStandard.delete({ where: { id: existing.id } })
    await this.audit.write({
      schoolId,
      userId,
      action: 'accreditation.standard.deleted',
      targetType: 'accreditation_standards',
      targetId: existing.id,
    })
    return { id: existing.id }
  }

  // ── Evidence (nested under a standard) ──────────────────────────────────────
  async listEvidence(schoolId: string, standardId: string): Promise<EvidenceListResponse> {
    await this.resolveStandard(schoolId, standardId) // 404 if foreign/cross-tenant
    const rows = await this.prisma.accreditationEvidence.findMany({
      where: { standardId, schoolId },
    })
    const evidence = rows
      .map((r) => this.toEvidencePublic(r))
      .sort((a, b) => {
        // capturedAt desc (nulls last), then createdAt desc, then id.
        const ca = a.capturedAt ?? ''
        const cb = b.capturedAt ?? ''
        if (ca !== cb) return cb.localeCompare(ca)
        if (a.createdAt !== b.createdAt) return b.createdAt.localeCompare(a.createdAt)
        return a.id.localeCompare(b.id)
      })
    return { evidence }
  }

  async createEvidence(
    schoolId: string,
    standardId: string,
    dto: CreateEvidenceDto,
    userId: string,
  ): Promise<EvidencePublic> {
    // resolveStandard FIRST — a foreign/unknown standard 404s BEFORE any artifact query.
    const std = await this.resolveStandard(schoolId, standardId)
    const capturedAt = parseIsoDate(dto.capturedAt, 'capturedAt') ?? null

    const sourceType: EvidenceSourceType = dto.sourceType ?? 'manual'
    let sourceRef: string | null = null
    let title = (dto.title ?? '').trim()
    let kind = normalizeKind(dto.kind)
    let reference = dto.reference ?? null

    if (sourceType === 'manual') {
      // Byte-for-byte today's behavior: a non-empty title is required for manual.
      if (!title) throw new BadRequestException('A title is required for manual evidence.')
    } else {
      if (!dto.sourceRef) {
        throw new BadRequestException('sourceRef is required when linking an artifact.')
      }
      // The CROSS-TENANT gate: a schoolId-scoped findFirst on the source table, where
      // std.schoolId is derived from the RESOLVED standard (never raw client input). A
      // forged/foreign/nonexistent sourceRef resolves to null → 404, so the evidence
      // row is NEVER created for another school's artifact.
      if (sourceType === 'policy') {
        const p = await this.prisma.policy.findFirst({
          where: { id: dto.sourceRef, schoolId: std.schoolId },
        })
        if (!p) throw new NotFoundException('Linked policy not found.')
        sourceRef = p.id
        if (!title) title = `${p.title}${p.category ? ` (${p.category})` : ''}`
        if (!reference) reference = SOURCE_META.policy.link
        kind = 'link'
      } else {
        // sourceType === 'board_report' (the only remaining @IsIn value)
        const r = await this.prisma.boardReport.findFirst({
          where: { id: dto.sourceRef, schoolId: std.schoolId },
          include: { fiscalPeriod: { select: { label: true } } },
        })
        if (!r) throw new NotFoundException('Linked board report not found.')
        sourceRef = r.id
        if (!title) title = r.reportTitle?.trim() || `Board report — ${r.fiscalPeriod?.label ?? 'period'}`
        if (!reference) reference = SOURCE_META.board_report.link
        kind = 'link'
      }
    }

    const row = await this.prisma.accreditationEvidence.create({
      data: {
        // schoolId is COPIED from the resolved standard — never trusted from the client.
        schoolId: std.schoolId,
        standardId: std.id,
        title,
        kind,
        reference,
        notes: dto.notes ?? null,
        capturedAt,
        sourceType,
        sourceRef, // null for manual
        createdByUserId: userId,
      },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'accreditation.evidence.created',
      targetType: 'accreditation_evidence',
      targetId: row.id,
    })
    return this.toEvidencePublic(row)
  }

  /**
   * Discover the school's operational artifacts that can be attached as evidence
   * (v1: policies + board reports). PRISMA-DIRECT (no PoliciesService/BoardReportService
   * import — avoids the circular-dep the module guards against). Tenant-scoped: both
   * findMany filter by the path `schoolId`, so ONLY the caller-school's artifacts are
   * returned. v1 does NOT exclude already-attached artifacts (dedupe deferred — a school
   * may legitimately attach one policy to multiple standards).
   */
  async listEvidenceSources(schoolId: string): Promise<EvidenceSourcesResponse> {
    const [policies, reports] = await Promise.all([
      this.prisma.policy.findMany({
        where: { schoolId },
        select: {
          id: true,
          title: true,
          category: true,
          lastReviewedDate: true,
          adoptedDate: true,
        },
        orderBy: [{ category: 'asc' }, { title: 'asc' }],
      }),
      this.prisma.boardReport.findMany({
        where: { schoolId },
        select: {
          id: true,
          reportTitle: true,
          generatedAt: true,
          createdAt: true,
          fiscalPeriod: { select: { label: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ])
    return {
      policies: policies.map((p) => ({
        sourceType: 'policy' as const,
        sourceRef: p.id,
        label: `${p.title}${p.category ? ` (${p.category})` : ''}`,
        date: toIsoDate(p.lastReviewedDate ?? p.adoptedDate),
        link: SOURCE_META.policy.link,
      })),
      boardReports: reports.map((r) => ({
        sourceType: 'board_report' as const,
        sourceRef: r.id,
        label: r.reportTitle?.trim() || `Board report — ${r.fiscalPeriod?.label ?? 'period'}`,
        // generatedAt/createdAt are TIMESTAMP (not @db.Date); toIsoDate's slice(0,10) still yields yyyy-mm-dd.
        date: toIsoDate(r.generatedAt ?? r.createdAt),
        link: SOURCE_META.board_report.link,
      })),
    }
  }

  async removeEvidence(
    schoolId: string,
    standardId: string,
    evidenceId: string,
    userId: string,
  ): Promise<{ id: string }> {
    await this.resolveStandard(schoolId, standardId) // 404 if foreign/cross-tenant
    // All THREE filters: a cross-standard evidenceId (right school, wrong standard)
    // 404s on standardId; a cross-tenant one 404s on schoolId.
    const existing = await this.prisma.accreditationEvidence.findFirst({
      where: { id: evidenceId, standardId, schoolId },
    })
    if (!existing) throw new NotFoundException('Evidence not found.')
    await this.prisma.accreditationEvidence.delete({ where: { id: existing.id } })
    await this.audit.write({
      schoolId,
      userId,
      action: 'accreditation.evidence.deleted',
      targetType: 'accreditation_evidence',
      targetId: existing.id,
    })
    return { id: existing.id }
  }
}
