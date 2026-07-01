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
import { EVIDENCE_KINDS, type CreateEvidenceDto, type EvidenceKind } from './dto/create-evidence.dto.js'

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
    return {
      id: row.id,
      standardId: row.standardId,
      title: row.title,
      kind: normalizeKind(row.kind),
      reference: row.reference,
      notes: row.notes,
      capturedAt: toIsoDate(row.capturedAt),
      createdByUserId: row.createdByUserId,
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
    const std = await this.resolveStandard(schoolId, standardId)
    const capturedAt = parseIsoDate(dto.capturedAt, 'capturedAt') ?? null
    const row = await this.prisma.accreditationEvidence.create({
      data: {
        // schoolId is COPIED from the resolved standard — never trusted from the client.
        schoolId: std.schoolId,
        standardId: std.id,
        title: dto.title,
        kind: normalizeKind(dto.kind),
        reference: dto.reference ?? null,
        notes: dto.notes ?? null,
        capturedAt,
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
