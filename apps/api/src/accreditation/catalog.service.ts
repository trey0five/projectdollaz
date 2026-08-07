import { Injectable, Logger, NotFoundException, Optional, type OnModuleInit } from '@nestjs/common'
import { Prisma, type AccreditationCatalogStandard } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import { FRAMEWORK_SEEDS, type FrameworkSeed } from './catalog-seed.js'
import { FRAMEWORK_REQUIREMENT_SEEDS } from './catalog-requirements-seed.js'
import { AccreditationSnapshotService } from './readiness-snapshot.service.js'

/** One framework row as returned to the client (with per-school adoption facts). */
export interface FrameworkPublic {
  id: string
  code: string
  accreditor: string
  name: string
  version: string
  description: string | null
  rubricLabels: string[]
  statusBands: { min: number; label: string }[]
  indexMin: number | null
  indexMax: number | null
  defaultTarget: number | null
  /** Non-assurance LEAF standards in the catalog tree. */
  standardCount: number
  /** Assurance leaves (Cognia binary gates). */
  assuranceCount: number
  /** Parent (domain) nodes. */
  domainCount: number
  /** True when the school has ≥1 standard linked to this framework. */
  adopted: boolean
  /** School standards (domains + leaves + assurances) linked to this framework. */
  adoptedCount: number
}

export interface FrameworkListResponse {
  frameworks: FrameworkPublic[]
}

export interface AdoptResult {
  frameworkId: string
  created: number
  skipped: number
}

/**
 * WHAT REMOVING A FRAMEWORK WOULD COST, counted before anything is touched.
 *
 * Adopting is cheap and looks reversible; removing a framework a school has
 * spent a year scoring is neither. So the count comes first and the deletion
 * only happens on a second, informed call — the school reads exactly what it is
 * about to lose, in its own numbers, and then decides.
 */
export interface FrameworkRemovalImpact {
  frameworkId: string
  code: string
  name: string
  /** Register rows that would be deleted — parents, leaves and assurance gates. */
  standards: number
  /** Of those, how many carry a self-score the school entered. */
  rubricScored: number
  /** Of those, how many carry a rating other than the untouched default. */
  rated: number
  /** Evidence LINK rows. The documents themselves live in the doc store and stay. */
  evidenceLinks: number
  /**
   * Improvement initiatives raised from these standards. They are NOT deleted —
   * an initiative is a school's own plan of work, not the framework's property —
   * but their link back to a standard stops resolving, so they are counted and
   * named rather than silently orphaned.
   */
  initiativesOrphaned: number
}

export interface RemoveFrameworkResult extends FrameworkRemovalImpact {
  removed: number
}

/**
 * Accreditation Phase 3 — the platform FRAMEWORK CATALOG service. Two jobs:
 *
 * 1. BOOT SEED (OnModuleInit): idempotently upsert the 3 accreditor frameworks +
 *    their catalog trees from FRAMEWORK_SEEDS. Upsert key = framework `code` /
 *    (frameworkId, code) — a second boot is 0 creates, and drift in
 *    titles/labels/tags SELF-HEALS (update path rewrites them). parentId is set
 *    in a second pass by code lookup (parents may not exist yet in pass 1).
 *    FAIL-SOFT like the briefing: a seed failure logs a warning and NEVER
 *    crashes boot. Deliberately NOT in packages/db/seed.mjs (dev demo data) —
 *    the catalog must exist in prod.
 *
 * 2. ADOPTION: copy a framework's catalog tree into the school's own
 *    AccreditationStandard rows (frameworkId/catalogStandardId back-links,
 *    sortOrder = catalog orderIndex, category = domain title). IDEMPOTENT — a
 *    node whose catalogStandardId already exists for the school is skipped, so
 *    re-adopt fills gaps and never dupes. Double-click/concurrency safe via a
 *    pg_advisory_xact_lock per (school, framework) + a unique index on
 *    (school_id, catalog_standard_id) as the DB backstop.
 */
@Injectable()
export class AccreditationCatalogService implements OnModuleInit {
  private readonly logger = new Logger(AccreditationCatalogService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    // Phase A: adopting a framework STARTS a readiness series. @Optional so the
    // existing unit specs can still construct this service with two arguments.
    @Optional() private readonly snapshot?: AccreditationSnapshotService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.seedCatalog()
    } catch (err) {
      // Fail-soft: the register/readiness endpoints degrade gracefully without a
      // catalog; a crash loop over reference data would be strictly worse.
      this.logger.warn(
        `Accreditation catalog seed failed (continuing without): ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  /** Idempotent catalog upsert — safe to run on every boot. */
  async seedCatalog(): Promise<void> {
    for (const fw of FRAMEWORK_SEEDS) await this.seedFramework(fw)
  }

  private async seedFramework(fw: FrameworkSeed): Promise<void> {
    const data = {
      accreditor: fw.accreditor,
      name: fw.name,
      version: fw.version,
      description: fw.description ?? null,
      rubricLabels: fw.rubricLabels,
      statusBands: fw.statusBands,
      indexMin: fw.indexMin,
      indexMax: fw.indexMax,
      defaultTarget: fw.defaultTarget,
      active: true,
    }
    const row = await this.prisma.accreditationFramework.upsert({
      where: { code: fw.code },
      create: { code: fw.code, ...data },
      update: data,
    })

    // Pass 1: upsert every node by the (frameworkId, code) natural key.
    for (const [i, s] of fw.standards.entries()) {
      const nodeData = {
        title: s.title,
        description: s.description ?? null,
        orderIndex: i,
        evidenceTags: s.evidenceTags ?? [],
        isAssurance: s.isAssurance ?? false,
        // Phase B — seed-only domain map + signal binding. Present on BOTH the
        // create AND the update path, so the first boot of this image rewrites
        // every existing production catalog row (the same self-heal that already
        // fixes title/tag drift) and no backfill migration is needed. A map
        // correction likewise reaches every school on the next boot: schools
        // never store a domain, they resolve it through catalogStandardId.
        domainKey: s.domainKey,
        // Prisma.DbNull (SQL NULL), never a bare null: on a nullable Json column
        // that is the only way to CLEAR a value, so a standard whose split is
        // removed in a later seed self-heals back to "no split" instead of
        // keeping a stale one forever.
        domainWeights: (s.domainWeights ?? Prisma.DbNull) as Prisma.InputJsonValue,
        signalKeys: s.signalKeys ?? [],
      }
      await this.prisma.accreditationCatalogStandard.upsert({
        where: { frameworkId_code: { frameworkId: row.id, code: s.code } },
        create: { frameworkId: row.id, code: s.code, ...nodeData },
        update: nodeData,
      })
    }

    // Pass 2: wire parentId by code lookup (all nodes exist now).
    const nodes = await this.prisma.accreditationCatalogStandard.findMany({
      where: { frameworkId: row.id },
    })
    const byCode = new Map(nodes.map((n) => [n.code, n]))
    for (const s of fw.standards) {
      const node = byCode.get(s.code)
      if (!node) continue
      const parentId = s.parentCode ? (byCode.get(s.parentCode)?.id ?? null) : null
      if ((node.parentId ?? null) !== parentId) {
        await this.prisma.accreditationCatalogStandard.update({
          where: { id: node.id },
          data: { parentId },
        })
      }
    }

    // ── AIC Phase C, pass 3: the REQUIREMENT rows ───────────────────────────
    // Same self-heal discipline as the catalog nodes: upsert by the natural key
    // (catalogStandardId, tag) on BOTH create and update, then DELETE the
    // orphans — a requirement removed from the seed must disappear, or a retired
    // ask would haunt every school's Evidence Index forever with no way to clear
    // it. `nodes` and `byCode` are reused from pass 2; this adds no query.
    const reqs = FRAMEWORK_REQUIREMENT_SEEDS[fw.code] ?? []
    const seededIds = new Set<string>()
    for (const [j, r] of reqs.entries()) {
      const node = byCode.get(r.standardCode)
      if (!node) continue // fail-soft: seed drift never crashes boot
      const reqData = {
        label: r.label,
        windowMonths: r.windowMonths ?? null,
        windowKind: r.windowKind,
        dataAvailability: r.dataAvailability,
        sourceRegister: r.sourceRegister,
        notTrackedReason: r.notTrackedReason ?? null,
        orderIndex: j,
      }
      const reqRow = await this.prisma.accreditationCatalogRequirement.upsert({
        where: { catalogStandardId_tag: { catalogStandardId: node.id, tag: r.tag } },
        create: { catalogStandardId: node.id, tag: r.tag, ...reqData },
        update: reqData,
      })
      seededIds.add(reqRow.id)
    }
    // Orphan sweep, scoped to THIS framework's catalog nodes only. When the seed
    // is EMPTY this deletes every requirement row under those nodes, and that is
    // intended: an ask removed upstream must disappear rather than haunt every
    // school's Evidence Index forever. The conditional spread only avoids relying
    // on Prisma's always-TRUE treatment of `notIn: []` (identical behaviour,
    // stated explicitly instead of inherited).
    await this.prisma.accreditationCatalogRequirement.deleteMany({
      where: {
        catalogStandardId: { in: nodes.map((n) => n.id) },
        ...(seededIds.size > 0 ? { id: { notIn: [...seededIds] } } : {}),
      },
    })
  }

  /**
   * List the active frameworks with catalog shape counts + this school's
   * adoption facts. standardCount = non-assurance LEAVES; domainCount = parent
   * nodes; adoptedCount = the school's standards linked to the framework.
   */
  async listFrameworks(schoolId: string): Promise<FrameworkListResponse> {
    const [frameworks, adopted] = await Promise.all([
      this.prisma.accreditationFramework.findMany({
        where: { active: true },
        include: {
          standards: { select: { id: true, parentId: true, isAssurance: true } },
        },
        orderBy: { code: 'asc' },
      }),
      this.prisma.accreditationStandard.groupBy({
        by: ['frameworkId'],
        where: { schoolId, frameworkId: { not: null } },
        _count: { _all: true },
      }),
    ])
    const adoptedBy = new Map<string, number>()
    for (const a of adopted) {
      if (a.frameworkId) adoptedBy.set(a.frameworkId, a._count._all)
    }
    return {
      frameworks: frameworks.map((fw) => {
        const parentIds = new Set(fw.standards.map((s) => s.parentId).filter(Boolean))
        const leaves = fw.standards.filter((s) => !parentIds.has(s.id))
        const adoptedCount = adoptedBy.get(fw.id) ?? 0
        return {
          id: fw.id,
          code: fw.code,
          accreditor: fw.accreditor,
          name: fw.name,
          version: fw.version,
          description: fw.description ?? null,
          rubricLabels: (fw.rubricLabels as string[]) ?? [],
          statusBands: (fw.statusBands as { min: number; label: string }[]) ?? [],
          indexMin: fw.indexMin,
          indexMax: fw.indexMax,
          defaultTarget: fw.defaultTarget,
          standardCount: leaves.filter((s) => !s.isAssurance).length,
          assuranceCount: leaves.filter((s) => s.isAssurance).length,
          domainCount: parentIds.size,
          adopted: adoptedCount > 0,
          adoptedCount,
        }
      }),
    }
  }

  /**
   * Adopt a framework: copy its catalog tree into the school's standards
   * register. One $transaction; per-node idempotent skip on catalogStandardId
   * (re-adopt fills gaps, never dupes). Domains become parents (category = own
   * title, rating 'not_started'); leaves inherit their domain's title as
   * category and preserve accreditor order via sortOrder = orderIndex.
   */
  async adoptFramework(schoolId: string, code: string, userId: string): Promise<AdoptResult> {
    const framework = await this.prisma.accreditationFramework.findFirst({
      where: { code, active: true },
      include: { standards: true },
    })
    if (!framework) throw new NotFoundException('Framework not found.')

    const result = await this.prisma.$transaction(async (tx) => {
      // Serialize concurrent adopts of the same (school, framework): the loser
      // blocks here until the winner commits, then reads the winner's rows and
      // takes the idempotent skip path. Read-then-create alone is NOT race-safe
      // under READ COMMITTED; the unique index on (school_id,
      // catalog_standard_id) backstops any residual race.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}::text), hashtext(${framework.id}::text))`
      const nodes = this.topoSort(framework.standards)
      const byId = new Map(nodes.map((n) => [n.id, n]))
      const existing = await tx.accreditationStandard.findMany({
        where: { schoolId, catalogStandardId: { in: nodes.map((n) => n.id) } },
        select: { id: true, catalogStandardId: true },
      })
      // catalog node id → school standard id (pre-existing + created this pass).
      const schoolIdOf = new Map<string, string>()
      for (const e of existing) {
        if (e.catalogStandardId) schoolIdOf.set(e.catalogStandardId, e.id)
      }
      let created = 0
      let skipped = 0
      for (const node of nodes) {
        if (schoolIdOf.has(node.id)) {
          skipped += 1
          continue
        }
        const parentCatalog = node.parentId ? byId.get(node.parentId) : undefined
        const row = await tx.accreditationStandard.create({
          data: {
            schoolId,
            parentId: node.parentId ? (schoolIdOf.get(node.parentId) ?? null) : null,
            code: node.code,
            title: node.title,
            // A domain's category is its own title; a leaf inherits its domain's.
            category: parentCatalog ? parentCatalog.title : node.title,
            rating: 'not_started',
            notes: node.description ?? null,
            frameworkId: framework.id,
            catalogStandardId: node.id,
            sortOrder: node.orderIndex,
            rubricScore: null,
            updatedByUserId: userId,
          },
        })
        schoolIdOf.set(node.id, row.id)
        created += 1
      }
      return { frameworkId: framework.id, created, skipped }
    })

    await this.audit.write({
      schoolId,
      userId,
      action: 'accreditation.framework.adopted',
      targetType: 'accreditation_frameworks',
      targetId: result.frameworkId,
    })

    // Adopting a framework is the moment a series can first exist. Without this
    // the head of school who adopts at 10am stares at "Tracking starts today —
    // earlier readiness was not recorded" over an empty strip until the 3AM
    // cron. Fire-and-forget and debounced, exactly like the rubric/evidence
    // write paths — an adopt must never be slowed or failed by snapshotting.
    this.snapshot?.captureOnEvent(schoolId)
    return result
  }

  /**
   * Count what removing this framework would take with it. READ-ONLY.
   *
   * Scoped to standards carrying THIS frameworkId, so a hand-made standard the
   * school typed itself is never in scope — those belong to nobody's catalog and
   * survive every framework change.
   */
  async removalImpact(schoolId: string, code: string): Promise<FrameworkRemovalImpact> {
    const framework = await this.prisma.accreditationFramework.findFirst({
      where: { code, active: true },
      select: { id: true, code: true, name: true },
    })
    if (!framework) throw new NotFoundException('Framework not found.')

    const rows = await this.prisma.accreditationStandard.findMany({
      where: { schoolId, frameworkId: framework.id },
      select: { id: true, rubricScore: true, rating: true },
    })
    const ids = rows.map((r) => r.id)

    // Two independent counts, both over the SAME id set, so the sentence the
    // school reads cannot disagree with what the delete then does.
    const [evidenceLinks, initiativesOrphaned] = await Promise.all([
      ids.length
        ? this.prisma.accreditationEvidence.count({ where: { schoolId, standardId: { in: ids } } })
        : Promise.resolve(0),
      ids.length
        ? this.prisma.improvementInitiative.count({
            // A SOFT link — originRef holds a standardId with no foreign key, so
            // nothing in the database would tell us these had gone stale.
            where: { schoolId, originRef: { in: ids } },
          })
        : Promise.resolve(0),
    ])

    return {
      frameworkId: framework.id,
      code: framework.code,
      name: framework.name,
      standards: rows.length,
      rubricScored: rows.filter((r) => r.rubricScore != null).length,
      rated: rows.filter((r) => r.rating && r.rating !== 'not_started').length,
      evidenceLinks,
      initiativesOrphaned,
    }
  }

  /**
   * Remove a framework from a school's register.
   *
   * ALWAYS PERMITTED, and that is the decision: refusing to remove a framework
   * the school had already scored would strand anyone who adopted the wrong one
   * and noticed late — exactly the mistake this product now invites by offering
   * seven frameworks and encouraging more than one. What protects the school is
   * the COUNT, not a locked door: `removalImpact` names the loss in the school's
   * own numbers and the UI makes it read it first.
   *
   * WHAT IS NOT DELETED, deliberately:
   *   • the documents behind evidence links — they live in the doc store, serve
   *     other standards, and are the school's records, not the framework's;
   *   • improvement initiatives raised from these standards — an initiative is a
   *     plan of work the school committed to, and deleting somebody's plan
   *     because they changed accreditor would be indefensible. Their originRef
   *     stops resolving, which is why it is counted and told.
   *
   * Idempotent: removing a framework the school does not hold deletes nothing
   * and reports zero rather than throwing.
   */
  async removeFramework(
    schoolId: string,
    code: string,
    userId: string,
  ): Promise<RemoveFrameworkResult> {
    const impact = await this.removalImpact(schoolId, code)

    // Evidence rows carry an FK to the standard; delete them first rather than
    // relying on a cascade that the schema may or may not declare. The parent/
    // child hierarchy is SetNull on delete, so children re-parent harmlessly
    // even though every row in this set is going anyway.
    const removed = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.accreditationStandard.findMany({
        where: { schoolId, frameworkId: impact.frameworkId },
        select: { id: true },
      })
      const ids = rows.map((r) => r.id)
      if (ids.length === 0) return 0
      await tx.accreditationEvidence.deleteMany({ where: { schoolId, standardId: { in: ids } } })
      const del = await tx.accreditationStandard.deleteMany({ where: { id: { in: ids } } })
      return del.count
    })

    await this.audit.write({
      schoolId,
      userId,
      action: 'accreditation.framework.removed',
      targetType: 'accreditation_frameworks',
      targetId: impact.frameworkId,
    })

    // Readiness changed the instant those standards left. Same fire-and-forget
    // debounced capture as adopt — a removal must never be slowed by a snapshot.
    this.snapshot?.captureOnEvent(schoolId)
    return { ...impact, removed }
  }

  /** Parents-first order (roots by orderIndex, then children) — safe for creates. */
  private topoSort(nodes: AccreditationCatalogStandard[]): AccreditationCatalogStandard[] {
    const ids = new Set(nodes.map((n) => n.id))
    const out: AccreditationCatalogStandard[] = []
    const emitted = new Set<string>()
    const byOrder = [...nodes].sort((a, b) => a.orderIndex - b.orderIndex || a.code.localeCompare(b.code))
    // Bounded passes (tree depth is tiny); a dangling parentId emits as a root.
    let guard = 0
    while (emitted.size < nodes.length && guard < nodes.length + 2) {
      for (const n of byOrder) {
        if (emitted.has(n.id)) continue
        const pid = n.parentId
        if (!pid || !ids.has(pid) || emitted.has(pid)) {
          out.push(n)
          emitted.add(n.id)
        }
      }
      guard += 1
    }
    return out
  }
}
