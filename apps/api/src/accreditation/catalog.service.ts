import { Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common'
import type { AccreditationCatalogStandard } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import { FRAMEWORK_SEEDS, type FrameworkSeed } from './catalog-seed.js'

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
    return result
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
