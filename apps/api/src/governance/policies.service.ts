import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { Policy } from '@finrep/db'
import { computeReviewStatus, type ReviewStatus } from '@finrep/compliance'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import type { CreatePolicyDto, PolicyStatus } from './dto/create-policy.dto.js'
import type { UpdatePolicyDto } from './dto/update-policy.dto.js'

/** One policy as returned to the client, with the COMPUTED review status flattened. */
export interface PolicyPublic {
  id: string
  title: string
  category: string
  status: PolicyStatus
  owner: string | null
  adoptedDate: string | null
  lastReviewedDate: string | null
  reviewIntervalMonths: number
  notes: string | null
  /** COMPUTED (never stored) — from @finrep/compliance computeReviewStatus. */
  reviewStatus: ReviewStatus
  nextReviewDate: string | null
  daysUntilDue: number | null
  createdAt: string
  updatedAt: string
}

export interface PolicyListResponse {
  policies: PolicyPublic[]
}

const POLICY_STATUSES = ['active', 'draft', 'retired'] as const

/** Deterministic list order: overdue → due-soon → current → unknown, then title. */
const REVIEW_ORDER: Record<ReviewStatus, number> = {
  overdue: 0,
  'due-soon': 1,
  current: 2,
  unknown: 3,
}

/**
 * Serialize a DB Date (@db.Date) to yyyy-mm-dd with no timezone drift.
 * LOAD-BEARING: relies on Prisma materializing @db.Date as a Date pinned to UTC
 * midnight, so the UTC .toISOString() slice matches the civil date — the SAME
 * UTC-accessor contract computeReviewStatus reads (and parseIsoDate writes back as
 * Z-midnight). If the driver ever returned a local-midnight Date this could roll
 * back a day; keep the round-trip UTC-only.
 */
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

function normalizeStatus(s: string | null | undefined): PolicyStatus {
  return (POLICY_STATUSES as readonly string[]).includes(s ?? '')
    ? (s as PolicyStatus)
    : 'active'
}

/**
 * Phase 3 Governance v1 — the POLICY REGISTER service. School-scoped (NOT
 * period-scoped). TENANT ISOLATION is enforced on EVERY query: reads filter by
 * `schoolId`, and update/delete first resolve the row `where { id, schoolId }` —
 * a policyId owned by another school resolves to null → NotFoundException, so a
 * cross-tenant mutation is IMPOSSIBLE (it never even loads the foreign row).
 *
 * Every response is enriched with the pure computeReviewStatus (injectable `now`),
 * so the register list and the briefing 'governance' STEP share one source of
 * truth and can never disagree.
 */
@Injectable()
export class PoliciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Map a DB row → the public shape, attaching the computed review status. */
  private toPublic(row: Policy, now = new Date()): PolicyPublic {
    const review = computeReviewStatus(
      {
        adoptedDate: toIsoDate(row.adoptedDate),
        lastReviewedDate: toIsoDate(row.lastReviewedDate),
        reviewIntervalMonths: row.reviewIntervalMonths,
        status: row.status,
      },
      now,
    )
    return {
      id: row.id,
      title: row.title,
      category: row.category,
      status: normalizeStatus(row.status),
      owner: row.owner,
      adoptedDate: toIsoDate(row.adoptedDate),
      lastReviewedDate: toIsoDate(row.lastReviewedDate),
      reviewIntervalMonths: row.reviewIntervalMonths,
      notes: row.notes,
      reviewStatus: review.status,
      nextReviewDate: review.nextReviewDate,
      daysUntilDue: review.daysUntilDue,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  /** List all policies for one school, deterministically ordered + enriched. */
  async list(schoolId: string, now = new Date()): Promise<PolicyListResponse> {
    const rows = await this.prisma.policy.findMany({ where: { schoolId } })
    const policies = rows
      .map((r) => this.toPublic(r, now))
      .sort((a, b) => {
        const r = REVIEW_ORDER[a.reviewStatus] - REVIEW_ORDER[b.reviewStatus]
        if (r !== 0) return r
        const t = a.title.localeCompare(b.title)
        return t !== 0 ? t : a.id.localeCompare(b.id)
      })
    return { policies }
  }

  async create(schoolId: string, dto: CreatePolicyDto, userId: string): Promise<PolicyPublic> {
    const adoptedDate = parseIsoDate(dto.adoptedDate, 'adoptedDate') ?? null
    const lastReviewedDate = parseIsoDate(dto.lastReviewedDate, 'lastReviewedDate') ?? null
    const row = await this.prisma.policy.create({
      data: {
        schoolId,
        title: dto.title,
        category: dto.category,
        status: normalizeStatus(dto.status),
        owner: dto.owner ?? null,
        adoptedDate,
        lastReviewedDate,
        reviewIntervalMonths: dto.reviewIntervalMonths ?? 12,
        notes: dto.notes ?? null,
        updatedByUserId: userId,
      },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'policy.created',
      targetType: 'policies',
      targetId: row.id,
    })
    return this.toPublic(row)
  }

  async update(
    schoolId: string,
    policyId: string,
    dto: UpdatePolicyDto,
    userId: string,
  ): Promise<PolicyPublic> {
    // Tenant-safe ownership check: a foreign/unknown id is a 404, never a mutation.
    const existing = await this.prisma.policy.findFirst({
      where: { id: policyId, schoolId },
    })
    if (!existing) throw new NotFoundException('Policy not found.')

    // Merge-pick: undefined = keep, explicit null = clear (for nullable fields).
    const pick = <T>(v: T | undefined, current: T): T => (v === undefined ? current : v)
    const adoptedDate = parseIsoDate(dto.adoptedDate, 'adoptedDate')
    const lastReviewedDate = parseIsoDate(dto.lastReviewedDate, 'lastReviewedDate')

    const row = await this.prisma.policy.update({
      where: { id: existing.id },
      data: {
        title: pick(dto.title, existing.title),
        category: pick(dto.category, existing.category),
        status: pick(dto.status ? normalizeStatus(dto.status) : undefined, existing.status),
        owner: pick(dto.owner, existing.owner),
        adoptedDate: pick(adoptedDate, existing.adoptedDate),
        lastReviewedDate: pick(lastReviewedDate, existing.lastReviewedDate),
        reviewIntervalMonths: pick(dto.reviewIntervalMonths, existing.reviewIntervalMonths),
        notes: pick(dto.notes, existing.notes),
        updatedByUserId: userId,
      },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'policy.updated',
      targetType: 'policies',
      targetId: row.id,
    })
    return this.toPublic(row)
  }

  async remove(schoolId: string, policyId: string, userId: string): Promise<{ id: string }> {
    const existing = await this.prisma.policy.findFirst({
      where: { id: policyId, schoolId },
    })
    if (!existing) throw new NotFoundException('Policy not found.')
    await this.prisma.policy.delete({ where: { id: existing.id } })
    await this.audit.write({
      schoolId,
      userId,
      action: 'policy.deleted',
      targetType: 'policies',
      targetId: existing.id,
    })
    return { id: existing.id }
  }
}
