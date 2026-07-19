import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { AccreditationStandard, AccreditationEvidence } from '@finrep/db'
import {
  computeStandardCoverage,
  summarizeCoverage,
  summarizeRatings,
  normalizeRating,
  type CoverageStatus,
  type ReviewStatus,
  type SchoolCoverageSummary,
  type StandardRating,
  type RatingSummary,
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
import type { UpdateEvidenceDto } from './dto/update-evidence.dto.js'

/** One standard as returned to the client, with COMPUTED coverage + review urgency. */
export interface StandardPublic {
  id: string
  code: string
  title: string
  category: string | null
  /** Parent standard in the nested hierarchy (null = top-level). */
  parentId: string | null
  /** Accreditor rating (met/partial/not-met lifecycle); 'not_started' default. */
  rating: StandardRating
  reviewDate: string | null
  owner: string | null
  notes: string | null
  /** COMPUTED (never stored) — from @finrep/compliance. */
  evidenceCount: number
  coverage: CoverageStatus
  reviewStatus: ReviewStatus
  daysUntilReview: number | null
  /** Depth in the tree (0 = top-level) — drives the UI indent. COMPUTED, never stored. */
  depth: number
  /** True when this standard has NO children (rating/coverage roll up over leaves). */
  isLeaf: boolean
  /** Rating rollup over THIS node's descendant leaves (a leaf rolls up just itself). */
  leafSummary: RatingSummary
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
  /** UNCHANGED evidence-coverage summary (pctCovered/gaps/withEvidence/total). */
  summary: SchoolCoverageSummary
  /** ADDITIVE, sibling-not-nested (keeps `summary`'s exact shape for the briefing +
   *  existing specs): the met/partial/not-met rollup over LEAF standards. */
  ratingSummary: RatingSummary
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

  /** Extra computed tree fields; when omitted (single-row create/update response), the
   *  row is treated as a top-level LEAF whose leafSummary rolls up just its own rating. */
  private toStandardPublic(
    row: AccreditationStandard,
    evidenceCount: number,
    now: Date,
    tree?: { depth: number; isLeaf: boolean; leafSummary: RatingSummary },
  ): StandardPublic {
    const cov = computeStandardCoverage({ evidenceCount, reviewDate: row.reviewDate }, now)
    const rating = normalizeRating(row.rating)
    return {
      id: row.id,
      code: row.code,
      title: row.title,
      category: row.category,
      parentId: row.parentId ?? null,
      rating,
      reviewDate: toIsoDate(row.reviewDate),
      owner: row.owner,
      notes: row.notes,
      evidenceCount,
      coverage: cov.coverage,
      reviewStatus: cov.reviewStatus,
      daysUntilReview: cov.daysUntilReview,
      depth: tree?.depth ?? 0,
      isLeaf: tree?.isLeaf ?? true,
      leafSummary: tree?.leafSummary ?? summarizeRatings([{ rating }]),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  /**
   * Build the full standard TREE for one school in memory — loads all standards ONCE
   * + one groupBy for evidence counts (NO N+1), then:
   *   • sibling order = the existing gaps-first comparator, applied within each level,
   *   • output = PRE-ORDER DFS (parent immediately followed by its subtree) with a
   *     `depth` for the UI indent,
   *   • per-node `leafSummary` = rating rollup over that node's DESCENDANT leaves (a
   *     leaf rolls up just itself),
   *   • `summary` = the UNCHANGED evidence coverage (summarizeCoverage) so the briefing
   *     + existing specs never regress,
   *   • `ratingSummary` = the rating rollup over ALL leaf standards school-wide.
   * A parentId pointing outside the loaded set (shouldn't happen intra-school) is
   * treated as a top-level root, so a broken link can never drop a node from the list.
   */
  private async computeStandardsTree(
    schoolId: string,
    now: Date,
  ): Promise<{
    standards: StandardPublic[]
    summary: SchoolCoverageSummary
    ratingSummary: RatingSummary
    byId: Map<string, StandardPublic>
  }> {
    const rows = await this.prisma.accreditationStandard.findMany({ where: { schoolId } })
    const counts = await this.prisma.accreditationEvidence.groupBy({
      by: ['standardId'],
      where: { schoolId },
      _count: { _all: true },
    })
    const countBy = new Map<string, number>()
    for (const c of counts) countBy.set(c.standardId, c._count._all)

    const byRowId = new Map<string, AccreditationStandard>()
    for (const r of rows) byRowId.set(r.id, r)

    // Adjacency: parentId → children. A row whose parentId is null OR points outside the
    // school set is a ROOT (defensive against a dangling link).
    const childrenOf = new Map<string, AccreditationStandard[]>()
    const roots: AccreditationStandard[] = []
    for (const r of rows) {
      const pid = r.parentId ?? null
      if (pid && byRowId.has(pid)) {
        const arr = childrenOf.get(pid) ?? []
        arr.push(r)
        childrenOf.set(pid, arr)
      } else {
        roots.push(r)
      }
    }

    // Post-order: gather each node's descendant-leaf ratings (a leaf → just itself).
    const leafRatingsOf = new Map<string, StandardRating[]>()
    const collectLeaves = (r: AccreditationStandard, guard: Set<string>): StandardRating[] => {
      if (guard.has(r.id)) return [] // cycle safety (writes are guarded, but never loop)
      guard.add(r.id)
      const kids = childrenOf.get(r.id) ?? []
      let out: StandardRating[]
      if (kids.length === 0) {
        out = [normalizeRating(r.rating)]
      } else {
        out = []
        for (const k of kids) out.push(...collectLeaves(k, guard))
      }
      leafRatingsOf.set(r.id, out)
      return out
    }
    for (const r of rows) if (!leafRatingsOf.has(r.id)) collectLeaves(r, new Set())

    // Sibling comparator: the EXISTING gaps-first → review → code → title → id order.
    const publicOf = new Map<string, StandardPublic>()
    const cmp = (a: AccreditationStandard, b: AccreditationStandard): number => {
      const pa = this.toStandardPublic(a, countBy.get(a.id) ?? 0, now)
      const pb = this.toStandardPublic(b, countBy.get(b.id) ?? 0, now)
      const g = (pa.coverage === 'no-evidence' ? 0 : 1) - (pb.coverage === 'no-evidence' ? 0 : 1)
      if (g !== 0) return g
      const rr = REVIEW_ORDER[pa.reviewStatus] - REVIEW_ORDER[pb.reviewStatus]
      if (rr !== 0) return rr
      const c = pa.code.localeCompare(pb.code)
      if (c !== 0) return c
      const t = pa.title.localeCompare(pb.title)
      return t !== 0 ? t : pa.id.localeCompare(pb.id)
    }

    // Pre-order DFS from sorted roots, carrying depth.
    const standards: StandardPublic[] = []
    const walk = (r: AccreditationStandard, depth: number, guard: Set<string>) => {
      if (guard.has(r.id)) return
      guard.add(r.id)
      const kids = (childrenOf.get(r.id) ?? []).slice().sort(cmp)
      const leaves = leafRatingsOf.get(r.id) ?? []
      const pub = this.toStandardPublic(r, countBy.get(r.id) ?? 0, now, {
        depth,
        isLeaf: kids.length === 0,
        leafSummary: summarizeRatings(leaves.map((rating) => ({ rating }))),
      })
      standards.push(pub)
      publicOf.set(r.id, pub)
      for (const k of kids) walk(k, depth + 1, guard)
    }
    const guard = new Set<string>()
    for (const root of roots.slice().sort(cmp)) walk(root, 0, guard)

    // Evidence coverage summary is UNCHANGED (over every standard, leaf or not).
    const summary = summarizeCoverage(standards)
    // Rating rollup is over LEAF standards only (a parent is scored via its indicators).
    const ratingSummary = summarizeRatings(
      standards.filter((s) => s.isLeaf).map((s) => ({ rating: s.rating })),
    )
    return { standards, summary, ratingSummary, byId: publicOf }
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

  /**
   * List all standards for one school as a PRE-ORDER TREE (parent then subtree, with a
   * `depth` indent), enriched with coverage + review urgency + the per-node rating
   * rollup, plus the UNCHANGED evidence-coverage `summary` AND the additive
   * `ratingSummary`. One findMany + one groupBy (NO N+1).
   */
  async listStandards(schoolId: string, now = new Date()): Promise<StandardListResponse> {
    const { standards, summary, ratingSummary } = await this.computeStandardsTree(schoolId, now)
    return { standards, summary, ratingSummary }
  }

  /**
   * Validate a proposed parentId for the hierarchy and return the resolved id (or null).
   * GUARDS: (1) parent must belong to the SAME school (a foreign/unknown id 400s);
   * (2) a node cannot be its OWN parent; (3) no CYCLES — walk UP the proposed parent's
   * ancestor chain and reject if we reach `nodeId` (i.e. the proposed parent is the node
   * itself or a descendant of it). `nodeId` is undefined on CREATE (a brand-new node has
   * no descendants, so only the same-school check applies). The walk is school-scoped +
   * iteration-capped so a pre-existing corrupt cycle can never loop forever.
   */
  private async validateParent(
    schoolId: string,
    nodeId: string | undefined,
    parentId: string,
  ): Promise<string> {
    if (nodeId && parentId === nodeId) {
      throw new BadRequestException('A standard cannot be its own parent.')
    }
    const parent = await this.prisma.accreditationStandard.findFirst({
      where: { id: parentId, schoolId },
    })
    if (!parent) throw new BadRequestException('Parent standard not found in this school.')
    if (nodeId) {
      let cursor: string | null = parent.parentId ?? null
      let guard = 0
      while (cursor && guard < 10000) {
        if (cursor === nodeId) {
          throw new BadRequestException('That parent would create a cycle in the hierarchy.')
        }
        const next: { parentId: string | null } | null =
          await this.prisma.accreditationStandard.findFirst({
            where: { id: cursor, schoolId },
            select: { parentId: true },
          })
        cursor = next?.parentId ?? null
        guard += 1
      }
    }
    return parent.id
  }

  async createStandard(schoolId: string, dto: CreateStandardDto, userId: string): Promise<StandardPublic> {
    const reviewDate = parseIsoDate(dto.reviewDate, 'reviewDate') ?? null
    const parentId =
      dto.parentId != null ? await this.validateParent(schoolId, undefined, dto.parentId) : null
    const row = await this.prisma.accreditationStandard.create({
      data: {
        schoolId,
        parentId,
        code: dto.code,
        title: dto.title,
        category: dto.category ?? null,
        rating: normalizeRating(dto.rating),
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
    // Return the row placed in the (freshly recomputed) tree so depth/isLeaf/leafSummary
    // are correct; a fresh leaf falls back to a top-level self-rollup if the tree query
    // returns nothing (only happens under mocks — real DB always contains the new row).
    const tree = await this.computeStandardsTree(schoolId, new Date())
    return tree.byId.get(row.id) ?? this.toStandardPublic(row, 0, new Date())
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

    // Re-parent: omitted → keep; explicit null → top-level; a UUID → validate (same
    // school + no self-parent + no cycle) BEFORE writing.
    let parentId: string | null | undefined = undefined
    if (dto.parentId !== undefined) {
      parentId =
        dto.parentId === null
          ? null
          : await this.validateParent(schoolId, standardId, dto.parentId)
    }

    const row = await this.prisma.accreditationStandard.update({
      where: { id: existing.id },
      data: {
        parentId: pick(parentId, existing.parentId ?? null),
        code: pick(dto.code, existing.code),
        title: pick(dto.title, existing.title),
        category: pick(dto.category, existing.category),
        rating: pick(dto.rating, normalizeRating(existing.rating)),
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
    const tree = await this.computeStandardsTree(schoolId, new Date())
    const count = await this.prisma.accreditationEvidence.count({ where: { schoolId, standardId: row.id } })
    return tree.byId.get(row.id) ?? this.toStandardPublic(row, count, new Date())
  }

  async removeStandard(schoolId: string, standardId: string, userId: string): Promise<{ id: string }> {
    const existing = await this.resolveStandard(schoolId, standardId)
    // Evidence cascades via the FK ON DELETE CASCADE (no manual sweep). CHILDREN are NOT
    // cascade-deleted: the self-relation FK is ON DELETE SET NULL, so a deleted parent's
    // children RE-PARENT to top-level (no accidental subtree mass-delete).
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

  /**
   * PATCH an evidence artifact (Phase 4 depth — evidence is now EDITABLE). Same tenant +
   * cross-standard gate as delete: resolveStandard FIRST (foreign standard → 404), then
   * the 3-filter findFirst (id + standardId + schoolId) — a cross-tenant/cross-standard
   * evidenceId → 404, never mutated. Merge-pick: omitted keeps, explicit null clears the
   * nullable fields. RE-LINKING (changing sourceType/sourceRef) is re-validated ∈ the
   * path school exactly like create; manual evidence still requires a non-empty title.
   */
  async updateEvidence(
    schoolId: string,
    standardId: string,
    evidenceId: string,
    dto: UpdateEvidenceDto,
    userId: string,
  ): Promise<EvidencePublic> {
    await this.resolveStandard(schoolId, standardId) // 404 if foreign/cross-tenant
    const existing = await this.prisma.accreditationEvidence.findFirst({
      where: { id: evidenceId, standardId, schoolId },
    })
    if (!existing) throw new NotFoundException('Evidence not found.')

    const pick = <T>(v: T | undefined, current: T): T => (v === undefined ? current : v)
    const capturedAt = parseIsoDate(dto.capturedAt, 'capturedAt')

    let sourceType: EvidenceSourceType = (existing.sourceType ?? 'manual') as EvidenceSourceType
    let sourceRef: string | null = existing.sourceRef ?? null
    const title = pick(dto.title, existing.title)
    let kind = dto.kind !== undefined ? normalizeKind(dto.kind) : normalizeKind(existing.kind)
    let reference = pick(dto.reference, existing.reference)

    // Re-link only when the caller touches sourceType or sourceRef.
    if (dto.sourceType !== undefined || dto.sourceRef !== undefined) {
      const nextType: EvidenceSourceType = dto.sourceType ?? sourceType
      if (nextType === 'manual') {
        sourceType = 'manual'
        sourceRef = null
      } else {
        const ref = dto.sourceRef !== undefined ? dto.sourceRef : sourceRef
        if (!ref) throw new BadRequestException('sourceRef is required when linking an artifact.')
        // schoolId is the RESOLVED path school (== existing.schoolId): the same cross-tenant
        // gate as create — a forged/foreign sourceRef → 404, evidence never re-linked.
        if (nextType === 'policy') {
          const p = await this.prisma.policy.findFirst({ where: { id: ref, schoolId } })
          if (!p) throw new NotFoundException('Linked policy not found.')
          sourceRef = p.id
          if (dto.reference === undefined) reference = SOURCE_META.policy.link
        } else {
          const r = await this.prisma.boardReport.findFirst({ where: { id: ref, schoolId } })
          if (!r) throw new NotFoundException('Linked board report not found.')
          sourceRef = r.id
          if (dto.reference === undefined) reference = SOURCE_META.board_report.link
        }
        sourceType = nextType
        if (dto.kind === undefined) kind = 'link'
      }
    }

    if (sourceType === 'manual' && !(title ?? '').trim()) {
      throw new BadRequestException('A title is required for manual evidence.')
    }

    const row = await this.prisma.accreditationEvidence.update({
      where: { id: existing.id },
      data: {
        title,
        kind,
        reference,
        notes: pick(dto.notes, existing.notes),
        capturedAt: pick(capturedAt, existing.capturedAt),
        sourceType,
        sourceRef,
      },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'accreditation.evidence.updated',
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
