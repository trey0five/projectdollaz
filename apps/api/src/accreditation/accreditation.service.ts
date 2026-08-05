import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common'
import type { AccreditationStandard, AccreditationEvidence } from '@finrep/db'
import {
  computeStandardCoverage,
  summarizeCoverage,
  summarizeRatings,
  normalizeRating,
  type CoverageStatus,
  type EvidenceTag,
  type ReviewStatus,
  type SchoolCoverageSummary,
  type StandardRating,
  type RatingSummary,
} from '@finrep/compliance'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import { AccreditationSnapshotService } from './readiness-snapshot.service.js'
import { readCatalogDomainRows } from './domain-map.js'
import type { CreateStandardDto } from './dto/create-standard.dto.js'
import type { UpdateStandardDto } from './dto/update-standard.dto.js'
import {
  EVIDENCE_KINDS,
  type CreateEvidenceDto,
  type EvidenceKind,
  type EvidenceSourceType,
} from './dto/create-evidence.dto.js'
import type { UpdateEvidenceDto } from './dto/update-evidence.dto.js'
// ONE knowledge-document matcher, shared with the Phase-C auto-satisfaction
// resolver. Two copies of these literals would drift the day someone adds a
// pattern to one of them, and the drawer would then suggest a document the
// Evidence Index refuses to auto-link — the same file, two answers.
import { KNOWLEDGE_TAG_PATTERNS } from './evidence-tag-match.js'

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
  // ── Phase 3 catalog/rubric depth (ADDITIVE — existing fields byte-identical) ──
  /** Accreditor self-score 1..4; null = unscored. */
  rubricScore: number | null
  /** Framework rubric label for rubricScore; null when unscored/frameworkless. */
  rubricLabel: string | null
  // ── Score PROVENANCE (hand-off "O7"). Recorded since Phase A on every score
  // change and, until now, shown to NOBODY — an honesty ledger with no reader.
  // A rubric self-score is an ASSERTION; these say whose, and when. ──────────
  /** 'self' today; 'peer_reviewed'/'externally_validated' reserved for real external inputs. */
  scoreProvenance: string
  /** When the CURRENT score was asserted; null when never scored. */
  rubricScoredAt: string | null
  /** Who asserted it — display name, or null (scorer deleted: SetNull keeps the score, drops the name). */
  rubricScoredBy: string | null
  frameworkId: string | null
  catalogStandardId: string | null
  /** Accreditor order on adopted trees; null on hand-made rows. */
  sortOrder: number | null
  /** Cognia binary assurance gate (from the catalog row; false when uncataloged). */
  isAssurance: boolean
  // ── Phase B catalog domain map (ADDITIVE; catalog-derived, never stored on the
  // school row, so a map correction reaches every school with no migration) ──
  /** Lead accreditation domain from the catalog (null on hand-made rows). */
  domainKey: string | null
  /** Fractional split when the standard straddles domains (null otherwise). */
  domainWeights: Record<string, number> | null
  /**
   * Bound @finrep/analytics metric keys ([] when none). Lets the drawer say
   * "3 signals bound" even if the /signals call is degraded — it costs zero
   * extra queries, because the catalog read that resolves isAssurance is the
   * same read.
   */
  signalKeys: string[]
  /** Soft link to a StrategicPlan/StrategyGoal ('strategic_plan' | 'strategy_goal'). */
  strategySourceType: string | null
  strategySourceRef: string | null
  /** Linked plan name / goal title (batched lookup; null when unlinked/dangling). */
  strategyLabel: string | null
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
  // ── AIC Phase C — evidence CURRENCY (all additive; existing fields unmoved) ─
  /** Requirement tag this artifact answers; null when unclassified. */
  tag: string | null
  /** "Which period does this cover?" — yyyy-mm-dd. NEVER inferred from a
   *  createdAt or a capturedAt; null means we genuinely do not know. */
  effectiveDate: string | null
  /** Explicit school-set expiry; wins over every computed horizon. */
  expiresAt: string | null
  /** School-asserted. NULL = NOT ASSERTED, and renders as "—", never as "No". */
  alsoInPortal: boolean | null
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
  // ── Phase 3 ADDITIVE sibling groups (policies/boardReports byte-identical) ──
  /** Approved-minutes board meetings only. */
  meetings: { id: string; label: string; date: string | null }[]
  strategicPlans: {
    id: string
    label: string
    fyStartYear: number
    fyEndYear: number
    /** True when the plan spans ≥5 fiscal years (fyEndYear - fyStartYear >= 4). */
    fiveYear: boolean
  }[]
  knowledgeDocuments: { id: string; label: string; date: string | null }[]
  /** The governance report is a VIRTUAL artifact — available when ≥1 person exists. */
  governanceReport: { available: boolean }
}

/** One deterministic tag-matched artifact suggestion for a catalog-linked standard. */
export interface EvidenceSuggestion {
  tag: EvidenceTag
  sourceType: Exclude<EvidenceSourceType, 'manual'>
  /** null only for the virtual governance_report. */
  sourceRef: string | null
  label: string
  date: string | null
  alreadyAttached: boolean
  /** Present ('strategy') on strategic-plan rows so the UI can offer "Link to plan". */
  linkAction?: 'strategy'
}

export interface SuggestionsResponse {
  suggestions: EvidenceSuggestion[]
}

/**
 * Source-domain metadata for a LINKED evidence's badge. Keyed by the non-manual
 * sourceType. `label` is the DOMAIN name (shown as "from Governance" + the row's own
 * title); `link` is the react-router route the badge navigates to. v1 links to the
 * domain page, not a per-artifact anchor (per-artifact deep-link deferred).
 */
const SOURCE_META: Record<Exclude<EvidenceSourceType, 'manual'>, { label: string; link: string }> = {
  policy: { label: 'Governance', link: '/governance' },
  board_report: { label: 'Reports', link: '/reports' },
  // Phase 3 — MUST stay in lockstep with EVIDENCE_SOURCE_TYPES or badges blank.
  meeting: { label: 'Meeting minutes', link: '/governance' },
  governance_report: { label: 'Governance report', link: '/governance/report/print' },
  strategic_plan: { label: 'Strategic plan', link: '/strategy' },
  knowledge_document: { label: 'Document', link: '/knowledge' },
}

/** Phase B — the catalog facts a standard inherits from its catalog row. */
interface CatalogDomainFacts {
  domainKey: string | null
  domainWeights: Record<string, number> | null
  signalKeys: string[]
}

/** Batched Phase-3 lookups threaded through toStandardPublic (see buildEnrichmentCtx). */
interface StandardEnrichmentCtx {
  /** frameworkId → rubricLabels array[4] (index i = label for score i+1). */
  rubricLabelsByFramework: Map<string, string[]>
  /** Catalog ids flagged isAssurance (Cognia binary gates). */
  assuranceCatalogIds: Set<string>
  /** Phase B — catalogStandardId → its domain map + signal binding. */
  catalogDomains: Map<string, CatalogDomainFacts>
  /** `${strategySourceType}:${strategySourceRef}` → plan name / goal title. */
  strategyLabels: Map<string, string>
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
    // Phase A: fire-and-forget readiness capture after a write that can MOVE
    // readiness. @Optional because the write paths must work with or without it —
    // snapshotting is observability, and observability must never be able to
    // fail a user's save (it is also why every call below is unawaited).
    @Optional() private readonly snapshot?: AccreditationSnapshotService,
  ) {}

  /** Extra computed tree fields; when omitted (single-row create/update response), the
   *  row is treated as a top-level LEAF whose leafSummary rolls up just its own rating.
   *  `ctx` carries the BATCHED Phase-3 lookups (framework rubric labels, catalog
   *  assurance flags, strategy labels) — when omitted those resolve to null/false. */
  private toStandardPublic(
    row: AccreditationStandard & {
      rubricScoredByUser?: { firstName: string | null; lastName: string | null } | null
    },
    evidenceCount: number,
    now: Date,
    tree?: { depth: number; isLeaf: boolean; leafSummary: RatingSummary },
    ctx?: StandardEnrichmentCtx,
  ): StandardPublic {
    const cov = computeStandardCoverage({ evidenceCount, reviewDate: row.reviewDate }, now)
    const rating = normalizeRating(row.rating)
    const rubricScore = row.rubricScore ?? null
    const frameworkId = row.frameworkId ?? null
    const catalogStandardId = row.catalogStandardId ?? null
    const strategySourceType = row.strategySourceType ?? null
    const strategySourceRef = row.strategySourceRef ?? null
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
      rubricScore,
      rubricLabel:
        rubricScore != null && frameworkId
          ? (ctx?.rubricLabelsByFramework.get(frameworkId)?.[rubricScore - 1] ?? null)
          : null,
      scoreProvenance: row.scoreProvenance ?? 'self',
      rubricScoredAt: rubricScore != null ? toIsoDate(row.rubricScoredAt ?? null) : null,
      rubricScoredBy:
        rubricScore != null && row.rubricScoredByUser
          ? [row.rubricScoredByUser.firstName, row.rubricScoredByUser.lastName]
              .filter(Boolean)
              .join(' ') || null
          : null,
      frameworkId,
      catalogStandardId,
      sortOrder: row.sortOrder ?? null,
      isAssurance:
        catalogStandardId != null && (ctx?.assuranceCatalogIds.has(catalogStandardId) ?? false),
      domainKey:
        (catalogStandardId != null ? ctx?.catalogDomains.get(catalogStandardId)?.domainKey : null) ??
        null,
      domainWeights:
        (catalogStandardId != null
          ? ctx?.catalogDomains.get(catalogStandardId)?.domainWeights
          : null) ?? null,
      signalKeys:
        (catalogStandardId != null
          ? ctx?.catalogDomains.get(catalogStandardId)?.signalKeys
          : undefined) ?? [],
      strategySourceType,
      strategySourceRef,
      strategyLabel:
        strategySourceType && strategySourceRef
          ? (ctx?.strategyLabels.get(`${strategySourceType}:${strategySourceRef}`) ?? null)
          : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  /**
   * Batched Phase-3 enrichment lookups for one school's standards. EVERY query is
   * SKIPPED entirely when no row references it (hand-made registers stay two
   * queries total; dangling strategy refs simply resolve to a null label).
   */
  private async buildEnrichmentCtx(
    schoolId: string,
    rows: AccreditationStandard[],
  ): Promise<StandardEnrichmentCtx> {
    const frameworkIds = [
      ...new Set(rows.map((r) => r.frameworkId).filter((id): id is string => !!id)),
    ]
    const catalogIds = [
      ...new Set(rows.map((r) => r.catalogStandardId).filter((id): id is string => !!id)),
    ]
    const planRefs = [
      ...new Set(
        rows
          .filter((r) => r.strategySourceType === 'strategic_plan' && r.strategySourceRef)
          .map((r) => r.strategySourceRef as string),
      ),
    ]
    const goalRefs = [
      ...new Set(
        rows
          .filter((r) => r.strategySourceType === 'strategy_goal' && r.strategySourceRef)
          .map((r) => r.strategySourceRef as string),
      ),
    ]

    const rubricLabelsByFramework = new Map<string, string[]>()
    if (frameworkIds.length > 0) {
      const fws = await this.prisma.accreditationFramework.findMany({
        where: { id: { in: frameworkIds } },
        select: { id: true, rubricLabels: true },
      })
      for (const fw of fws) rubricLabelsByFramework.set(fw.id, (fw.rubricLabels as string[]) ?? [])
    }
    // ONE catalog read now carries the assurance flag AND the Phase-B domain map
    // + signal binding (same findMany, wider select, assurance derived in
    // memory) — the drawer can report "3 signals bound" with zero extra queries.
    const assuranceCatalogIds = new Set<string>()
    const catalogDomains = new Map<string, CatalogDomainFacts>()
    if (catalogIds.length > 0) {
      // DEPLOY-ORDER SAFE. This is the CORE standards register — it predates
      // Phase B and must survive an image that starts before the migration
      // lands. A missing-column error degrades the domain facts to nulls; the
      // register itself never 500s. See readCatalogDomainRows.
      const cats = await readCatalogDomainRows(
        () =>
          this.prisma.accreditationCatalogStandard.findMany({
            where: { id: { in: catalogIds } },
            select: {
              id: true,
              isAssurance: true,
              domainKey: true,
              domainWeights: true,
              signalKeys: true,
            },
          }),
        () =>
          this.prisma.accreditationCatalogStandard.findMany({
            where: { id: { in: catalogIds } },
            select: { id: true, isAssurance: true },
          }),
      )
      for (const c of cats) {
        if (c.isAssurance) assuranceCatalogIds.add(c.id)
        catalogDomains.set(c.id, {
          domainKey: c.domainKey ?? null,
          domainWeights:
            c.domainWeights && typeof c.domainWeights === 'object' && !Array.isArray(c.domainWeights)
              ? (c.domainWeights as Record<string, number>)
              : null,
          signalKeys: c.signalKeys ?? [],
        })
      }
    }
    const strategyLabels = new Map<string, string>()
    if (planRefs.length > 0) {
      const plans = await this.prisma.strategicPlan.findMany({
        where: { id: { in: planRefs }, schoolId },
        select: { id: true, name: true },
      })
      for (const p of plans) strategyLabels.set(`strategic_plan:${p.id}`, p.name)
    }
    if (goalRefs.length > 0) {
      const goals = await this.prisma.strategyGoal.findMany({
        where: { id: { in: goalRefs }, schoolId },
        select: { id: true, title: true },
      })
      for (const g of goals) strategyLabels.set(`strategy_goal:${g.id}`, g.title)
    }
    return { rubricLabelsByFramework, assuranceCatalogIds, catalogDomains, strategyLabels }
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
    const rows = await this.prisma.accreditationStandard.findMany({
      where: { schoolId },
      // The scorer's NAME for the provenance chip — the one place the join is
      // needed; create/update return paths resolve through this tree anyway.
      include: { rubricScoredByUser: { select: { firstName: true, lastName: true } } },
    })
    const counts = await this.prisma.accreditationEvidence.groupBy({
      by: ['standardId'],
      where: { schoolId },
      _count: { _all: true },
    })
    const countBy = new Map<string, number>()
    for (const c of counts) countBy.set(c.standardId, c._count._all)

    // Phase 3 enrichment (rubric labels / assurance flags / strategy labels) —
    // every lookup is batched and SKIPPED when no row references it.
    const ctx = await this.buildEnrichmentCtx(schoolId, rows)

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

    // Sibling comparator: accreditor sortOrder FIRST — but ONLY when BOTH siblings
    // carry a non-null sortOrder (adopted trees keep catalog order); otherwise the
    // EXISTING gaps-first → review → code → title → id order applies unchanged,
    // so hand-made trees sort byte-identically to before (the frozen rule).
    const publicOf = new Map<string, StandardPublic>()
    const cmp = (a: AccreditationStandard, b: AccreditationStandard): number => {
      const soA = a.sortOrder ?? null
      const soB = b.sortOrder ?? null
      if (soA != null && soB != null && soA !== soB) return soA - soB
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
      const pub = this.toStandardPublic(
        r,
        countBy.get(r.id) ?? 0,
        now,
        {
          depth,
          isLeaf: kids.length === 0,
          leafSummary: summarizeRatings(leaves.map((rating) => ({ rating }))),
        },
        ctx,
      )
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
      // Phase C: projection only. listEvidence does NOT compute currency — it
      // keeps its exact query count, and the panel gets currency from the
      // /evidence-readiness payload the page already holds.
      tag: row.tag ?? null,
      effectiveDate: toIsoDate(row.effectiveDate),
      expiresAt: toIsoDate(row.expiresAt),
      alsoInPortal: row.alsoInPortal ?? null,
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

  /**
   * Validate + resolve the strategy soft-link pair for a write. `undefined` when
   * the caller touched NEITHER field (PATCH leaves the link alone). Explicit null
   * on both (or on the only-set one at create) CLEARS the link; setting a type
   * requires a ref and vice versa (400). The ref is validated ∈ the path school
   * (StrategicPlan/StrategyGoal both carry a denormalized schoolId) — a forged/
   * foreign/nonexistent ref → 404, never linked (the evidence sourceRef pattern).
   */
  private async resolveStrategyLink(
    schoolId: string,
    type: string | null | undefined,
    ref: string | null | undefined,
    existing?: { type: string | null; ref: string | null },
  ): Promise<{ type: string | null; ref: string | null } | undefined> {
    if (type === undefined && ref === undefined) return undefined
    const nextType = type !== undefined ? type : (existing?.type ?? null)
    const nextRef = ref !== undefined ? ref : (existing?.ref ?? null)
    if (nextType == null && nextRef == null) return { type: null, ref: null }
    if (nextType == null || nextRef == null) {
      throw new BadRequestException(
        'strategySourceType and strategySourceRef must be set together (or both cleared).',
      )
    }
    if (nextType === 'strategic_plan') {
      const plan = await this.prisma.strategicPlan.findFirst({
        where: { id: nextRef, schoolId },
        select: { id: true },
      })
      if (!plan) throw new NotFoundException('Linked strategic plan not found.')
    } else {
      // 'strategy_goal' (the only other @IsIn value)
      const goal = await this.prisma.strategyGoal.findFirst({
        where: { id: nextRef, schoolId },
        select: { id: true },
      })
      if (!goal) throw new NotFoundException('Linked strategy goal not found.')
    }
    return { type: nextType, ref: nextRef }
  }

  async createStandard(schoolId: string, dto: CreateStandardDto, userId: string): Promise<StandardPublic> {
    const reviewDate = parseIsoDate(dto.reviewDate, 'reviewDate') ?? null
    const parentId =
      dto.parentId != null ? await this.validateParent(schoolId, undefined, dto.parentId) : null
    const strategy = await this.resolveStrategyLink(
      schoolId,
      dto.strategySourceType,
      dto.strategySourceRef,
    )
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
        rubricScore: dto.rubricScore ?? null,
        strategySourceType: strategy?.type ?? null,
        strategySourceRef: strategy?.ref ?? null,
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

    // Strategy soft-link: undefined = untouched; validated ∈ school otherwise.
    const strategy = await this.resolveStrategyLink(
      schoolId,
      dto.strategySourceType,
      dto.strategySourceRef,
      {
        type: existing.strategySourceType ?? null,
        ref: existing.strategySourceRef ?? null,
      },
    )

    // ── Phase A score PROVENANCE ────────────────────────────────────────────
    // A rubric self-score is an ASSERTION, so we record who asserted it and
    // when. Stamped ONLY when the score actually CHANGES: renaming a standard,
    // re-parenting it or editing its notes must not restart its provenance
    // clock, or "scored 3 days ago" becomes a number nobody can trust.
    const nextRubricScore = pick(dto.rubricScore, existing.rubricScore ?? null)
    const rubricChanged = (existing.rubricScore ?? null) !== nextRubricScore

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
        // Explicit null clears the self-score; omitted keeps it.
        rubricScore: nextRubricScore,
        ...(rubricChanged
          ? {
              // 'self' is the only provenance the product writes in v1 — the
              // school scoring itself. Peer-reviewed / externally-validated are
              // reserved for a real external input, never inferred.
              scoreProvenance: 'self',
              rubricScoredAt: new Date(),
              rubricScoredByUserId: userId,
            }
          : {}),
        strategySourceType: strategy ? strategy.type : (existing.strategySourceType ?? null),
        strategySourceRef: strategy ? strategy.ref : (existing.strategySourceRef ?? null),
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
    // Readiness moved → record it today rather than waiting for the nightly run.
    if (rubricChanged) this.snapshot?.captureOnEvent(schoolId)
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
    // Phase C. capturedAt is UNTOUCHED and is NEVER read as an anchor — it means
    // "when we captured this row", and reading it as a document date is the
    // exact guess this phase exists to ban.
    const effectiveDate = parseIsoDate(dto.effectiveDate, 'effectiveDate') ?? null
    const expiresAt = parseIsoDate(dto.expiresAt, 'expiresAt') ?? null

    const sourceType: EvidenceSourceType = dto.sourceType ?? 'manual'
    let sourceRef: string | null = null
    let title = (dto.title ?? '').trim()
    let kind = normalizeKind(dto.kind)
    let reference = dto.reference ?? null

    if (sourceType === 'manual') {
      // Byte-for-byte today's behavior: a non-empty title is required for manual.
      if (!title) throw new BadRequestException('A title is required for manual evidence.')
    } else if (sourceType === 'governance_report') {
      // VIRTUAL artifact — the server-composed governance report has no row to
      // link. sourceRef must be null/omitted; no lookup; auto-title.
      if (dto.sourceRef) {
        throw new BadRequestException('governance_report is a virtual artifact — omit sourceRef.')
      }
      sourceRef = null
      if (!title) title = 'Governance report'
      if (!reference) reference = SOURCE_META.governance_report.link
      if (dto.kind === undefined) kind = 'link'
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
        if (dto.kind === undefined) kind = 'link'
      } else if (sourceType === 'board_report') {
        const r = await this.prisma.boardReport.findFirst({
          where: { id: dto.sourceRef, schoolId: std.schoolId },
          include: { fiscalPeriod: { select: { label: true } } },
        })
        if (!r) throw new NotFoundException('Linked board report not found.')
        sourceRef = r.id
        if (!title) title = r.reportTitle?.trim() || `Board report — ${r.fiscalPeriod?.label ?? 'period'}`
        if (!reference) reference = SOURCE_META.board_report.link
        if (dto.kind === undefined) kind = 'link'
      } else if (sourceType === 'meeting') {
        // Approved minutes only — a draft/pending meeting is not board evidence.
        const m = await this.prisma.meeting.findFirst({
          where: { id: dto.sourceRef, schoolId: std.schoolId, minutesStatus: 'approved' },
        })
        if (!m) throw new NotFoundException('Linked meeting with approved minutes not found.')
        sourceRef = m.id
        if (!title) title = `${m.title} — ${toIsoDate(m.scheduledAt) ?? 'undated'}`
        if (!reference) reference = SOURCE_META.meeting.link
        if (dto.kind === undefined) kind = 'link'
      } else if (sourceType === 'strategic_plan') {
        const plan = await this.prisma.strategicPlan.findFirst({
          where: { id: dto.sourceRef, schoolId: std.schoolId },
        })
        if (!plan) throw new NotFoundException('Linked strategic plan not found.')
        sourceRef = plan.id
        if (!title) title = plan.name
        if (!reference) reference = SOURCE_META.strategic_plan.link
        if (dto.kind === undefined) kind = 'link'
      } else {
        // sourceType === 'knowledge_document' (the only remaining @IsIn value)
        const doc = await this.prisma.knowledgeDocument.findFirst({
          where: { id: dto.sourceRef, schoolId: std.schoolId },
        })
        if (!doc) throw new NotFoundException('Linked document not found.')
        sourceRef = doc.id
        if (!title) title = doc.title
        if (!reference) reference = SOURCE_META.knowledge_document.link
        if (dto.kind === undefined) kind = 'link'
      }
    }

    const tag = await this.resolveEvidenceTag(dto.tag, sourceType, std.catalogStandardId ?? null)

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
        tag,
        effectiveDate,
        expiresAt,
        alsoInPortal: dto.alsoInPortal ?? null,
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
    // Evidence coverage moved → the DEFENSIBLE half of readiness moved with it.
    this.snapshot?.captureOnEvent(schoolId)
    return this.toEvidencePublic(row)
  }

  /**
   * The requirement TAG an artifact answers.
   *
   * Taken from the DTO when the client supplies one — listSuggestions already
   * computes a tag per suggestion and threw it away on attach, and persisting
   * what we already knew is the free win of this phase.
   *
   * SERVER BACKSTOP, deliberately bounded: when the caller sends no tag, the
   * evidence is LINKED (not free-text), and the parent standard's catalog row
   * carries EXACTLY ONE evidenceTag, we adopt that one. Ambiguity (0 or ≥2 tags)
   * leaves the tag null rather than picking. This is a CATEGORISATION, never a
   * date — it can move a row onto the Evidence Index, and it can never make a
   * stale artifact look current.
   */
  private async resolveEvidenceTag(
    dtoTag: string | null | undefined,
    sourceType: EvidenceSourceType,
    catalogStandardId: string | null,
  ): Promise<string | null> {
    if (dtoTag !== undefined) return dtoTag ?? null
    if (sourceType === 'manual' || !catalogStandardId) return null
    const catalog = await this.prisma.accreditationCatalogStandard.findFirst({
      where: { id: catalogStandardId },
      select: { evidenceTags: true },
    })
    const tags = (catalog?.evidenceTags ?? []) as string[]
    return tags.length === 1 ? tags[0] : null
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
    const [policies, reports, meetings, plans, documents, peopleCount] = await Promise.all([
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
      // Phase 3 siblings — approved minutes ONLY (a draft is not board evidence).
      this.prisma.meeting.findMany({
        where: { schoolId, minutesStatus: 'approved' },
        select: { id: true, title: true, scheduledAt: true },
        orderBy: { scheduledAt: 'desc' },
      }),
      this.prisma.strategicPlan.findMany({
        where: { schoolId },
        select: { id: true, name: true, fyStartYear: true, fyEndYear: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.knowledgeDocument.findMany({
        where: { schoolId },
        select: { id: true, title: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.governancePerson.count({ where: { schoolId } }),
    ])
    return {
      meetings: meetings.map((m) => ({
        id: m.id,
        label: `${m.title} — ${toIsoDate(m.scheduledAt) ?? 'undated'}`,
        date: toIsoDate(m.scheduledAt),
      })),
      strategicPlans: plans.map((p) => ({
        id: p.id,
        label: p.name,
        fyStartYear: p.fyStartYear,
        fyEndYear: p.fyEndYear,
        fiveYear: p.fyEndYear - p.fyStartYear >= 4,
      })),
      knowledgeDocuments: documents.map((d) => ({
        id: d.id,
        label: d.title,
        date: toIsoDate(d.createdAt),
      })),
      governanceReport: { available: peopleCount > 0 },
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
   * Phase 3 — deterministic tag-matched artifact SUGGESTIONS for one standard
   * (no LLM). [] for uncataloged (hand-made) standards. Each catalog evidenceTag
   * maps to fixed, schoolId-scoped queries (§ the frozen matcher table); results
   * are deduped by (sourceType, sourceRef) and flagged alreadyAttached from the
   * standard's existing evidence (governance_report matches on sourceType alone —
   * it is virtual and has no ref). Strategic-plan rows carry linkAction:'strategy'
   * so the UI can offer "Link to plan" (PATCH strategySource*) beside "Add as
   * evidence".
   */
  async listSuggestions(schoolId: string, standardId: string): Promise<SuggestionsResponse> {
    const std = await this.resolveStandard(schoolId, standardId)
    if (!std.catalogStandardId) return { suggestions: [] }
    const catalog = await this.prisma.accreditationCatalogStandard.findFirst({
      where: { id: std.catalogStandardId },
      select: { evidenceTags: true },
    })
    const tags = (catalog?.evidenceTags ?? []) as EvidenceTag[]
    if (tags.length === 0) return { suggestions: [] }

    const attached = await this.prisma.accreditationEvidence.findMany({
      where: { standardId: std.id, schoolId },
      select: { sourceType: true, sourceRef: true },
    })
    const attachedKeys = new Set(attached.map((e) => `${e.sourceType}:${e.sourceRef ?? ''}`))
    const attachedTypes = new Set(attached.map((e) => e.sourceType))
    const isAttached = (type: string, ref: string | null): boolean =>
      type === 'governance_report' ? attachedTypes.has(type) : attachedKeys.has(`${type}:${ref ?? ''}`)

    const suggestions: EvidenceSuggestion[] = []
    const seen = new Set<string>()
    const push = (s: EvidenceSuggestion): void => {
      const key = `${s.sourceType}:${s.sourceRef ?? ''}`
      if (seen.has(key)) return
      seen.add(key)
      suggestions.push(s)
    }
    const pushDocs = async (tag: EvidenceTag, patterns: string[]): Promise<void> => {
      const docs = await this.prisma.knowledgeDocument.findMany({
        where: {
          schoolId,
          OR: patterns.map((p) => ({ title: { contains: p, mode: 'insensitive' as const } })),
        },
        select: { id: true, title: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      })
      for (const d of docs) {
        push({
          tag,
          sourceType: 'knowledge_document',
          sourceRef: d.id,
          label: d.title,
          date: toIsoDate(d.createdAt),
          alreadyAttached: isAttached('knowledge_document', d.id),
        })
      }
    }
    // Cache cross-tag facts so budget+fiscal_resources don't double-query.
    let governanceAvailable: boolean | null = null
    const hasGovernance = async (): Promise<boolean> => {
      if (governanceAvailable === null) {
        governanceAvailable = (await this.prisma.governancePerson.count({ where: { schoolId } })) > 0
      }
      return governanceAvailable
    }
    const pushBudgetReport = async (tag: EvidenceTag): Promise<void> => {
      const budget = await this.prisma.periodBudget.findFirst({
        where: { schoolId },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
      if (budget) {
        const report = await this.prisma.boardReport.findFirst({
          where: { schoolId },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            reportTitle: true,
            generatedAt: true,
            createdAt: true,
            fiscalPeriod: { select: { label: true } },
          },
        })
        if (report) {
          push({
            tag,
            sourceType: 'board_report',
            sourceRef: report.id,
            label:
              report.reportTitle?.trim() || `Board report — ${report.fiscalPeriod?.label ?? 'period'}`,
            date: toIsoDate(report.generatedAt ?? report.createdAt),
            alreadyAttached: isAttached('board_report', report.id),
          })
        }
      }
      // Both 'budget' and 'fiscal_resources' look for BUDGET documents — the tag
      // labels the suggestion, the pattern set is the budget one either way.
      await pushDocs(tag, KNOWLEDGE_TAG_PATTERNS.budget as string[])
    }

    for (const tag of tags) {
      switch (tag) {
        case 'governance': {
          if (await hasGovernance()) {
            push({
              tag,
              sourceType: 'governance_report',
              sourceRef: null,
              label: 'Governance report',
              date: null,
              alreadyAttached: isAttached('governance_report', null),
            })
          }
          break
        }
        case 'board_minutes': {
          if (await hasGovernance()) {
            push({
              tag,
              sourceType: 'governance_report',
              sourceRef: null,
              label: 'Governance report',
              date: null,
              alreadyAttached: isAttached('governance_report', null),
            })
          }
          const meetings = await this.prisma.meeting.findMany({
            where: { schoolId, minutesStatus: 'approved' },
            select: { id: true, title: true, scheduledAt: true },
            orderBy: { scheduledAt: 'desc' },
            take: 3,
          })
          for (const m of meetings) {
            push({
              tag,
              sourceType: 'meeting',
              sourceRef: m.id,
              label: `${m.title} — ${toIsoDate(m.scheduledAt) ?? 'undated'} (minutes approved)`,
              date: toIsoDate(m.scheduledAt),
              alreadyAttached: isAttached('meeting', m.id),
            })
          }
          break
        }
        case 'policy_manual': {
          const policies = await this.prisma.policy.findMany({
            where: { schoolId },
            select: { id: true, title: true, category: true, lastReviewedDate: true, adoptedDate: true },
            orderBy: { updatedAt: 'desc' },
            take: 5,
          })
          for (const p of policies) {
            push({
              tag,
              sourceType: 'policy',
              sourceRef: p.id,
              label: `${p.title}${p.category ? ` (${p.category})` : ''}`,
              date: toIsoDate(p.lastReviewedDate ?? p.adoptedDate),
              alreadyAttached: isAttached('policy', p.id),
            })
          }
          break
        }
        case 'financial_audit':
          await pushDocs(tag, KNOWLEDGE_TAG_PATTERNS.financial_audit as string[])
          break
        case 'budget':
        case 'fiscal_resources':
          await pushBudgetReport(tag)
          break
        case 'strategic_plan': {
          const plans = await this.prisma.strategicPlan.findMany({
            where: { schoolId },
            select: { id: true, name: true, fyStartYear: true, fyEndYear: true, startDate: true },
            orderBy: { createdAt: 'desc' },
          })
          // 5-year plans first (the accreditor ask), then most recent.
          plans.sort((a, b) => {
            const fa = a.fyEndYear - a.fyStartYear >= 4 ? 0 : 1
            const fb = b.fyEndYear - b.fyStartYear >= 4 ? 0 : 1
            return fa - fb
          })
          for (const p of plans) {
            push({
              tag,
              sourceType: 'strategic_plan',
              sourceRef: p.id,
              label: p.name,
              date: toIsoDate(p.startDate),
              alreadyAttached: isAttached('strategic_plan', p.id),
              linkAction: 'strategy',
            })
          }
          break
        }
        case 'enrollment_data':
          await pushDocs(tag, KNOWLEDGE_TAG_PATTERNS.enrollment_data as string[])
          break
        case 'staff_credentials':
          await pushDocs(tag, KNOWLEDGE_TAG_PATTERNS.staff_credentials as string[])
          break
        case 'safety_plan':
          await pushDocs(tag, KNOWLEDGE_TAG_PATTERNS.safety_plan as string[])
          break
        case 'survey':
          await pushDocs(tag, KNOWLEDGE_TAG_PATTERNS.survey as string[])
          break
        case 'marketing':
          await pushDocs(tag, KNOWLEDGE_TAG_PATTERNS.marketing as string[])
          break
        default:
          break
      }
    }
    return { suggestions }
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
    // Phase C. capturedAt stays exactly what it was and is never copied here.
    const effectiveDate = parseIsoDate(dto.effectiveDate, 'effectiveDate')
    const expiresAt = parseIsoDate(dto.expiresAt, 'expiresAt')

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
      } else if (nextType === 'governance_report') {
        // Virtual artifact — never carries a sourceRef.
        if (dto.sourceRef) {
          throw new BadRequestException('governance_report is a virtual artifact — omit sourceRef.')
        }
        sourceType = 'governance_report'
        sourceRef = null
        if (dto.reference === undefined) reference = SOURCE_META.governance_report.link
        if (dto.kind === undefined) kind = 'link'
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
        } else if (nextType === 'board_report') {
          const r = await this.prisma.boardReport.findFirst({ where: { id: ref, schoolId } })
          if (!r) throw new NotFoundException('Linked board report not found.')
          sourceRef = r.id
          if (dto.reference === undefined) reference = SOURCE_META.board_report.link
        } else if (nextType === 'meeting') {
          const m = await this.prisma.meeting.findFirst({
            where: { id: ref, schoolId, minutesStatus: 'approved' },
          })
          if (!m) throw new NotFoundException('Linked meeting with approved minutes not found.')
          sourceRef = m.id
          if (dto.reference === undefined) reference = SOURCE_META.meeting.link
        } else if (nextType === 'strategic_plan') {
          const plan = await this.prisma.strategicPlan.findFirst({ where: { id: ref, schoolId } })
          if (!plan) throw new NotFoundException('Linked strategic plan not found.')
          sourceRef = plan.id
          if (dto.reference === undefined) reference = SOURCE_META.strategic_plan.link
        } else {
          // nextType === 'knowledge_document' (the only remaining @IsIn value)
          const doc = await this.prisma.knowledgeDocument.findFirst({ where: { id: ref, schoolId } })
          if (!doc) throw new NotFoundException('Linked document not found.')
          sourceRef = doc.id
          if (dto.reference === undefined) reference = SOURCE_META.knowledge_document.link
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
        tag: pick(dto.tag === undefined ? undefined : (dto.tag ?? null), existing.tag ?? null),
        effectiveDate: pick(effectiveDate, existing.effectiveDate),
        expiresAt: pick(expiresAt, existing.expiresAt),
        alsoInPortal: pick(
          dto.alsoInPortal === undefined ? undefined : (dto.alsoInPortal ?? null),
          existing.alsoInPortal ?? null,
        ),
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
    // Evidence coverage moved → the DEFENSIBLE half of readiness moved with it.
    this.snapshot?.captureOnEvent(schoolId)
    return { id: existing.id }
  }
}
