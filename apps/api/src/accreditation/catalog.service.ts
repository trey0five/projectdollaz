import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  type OnModuleInit,
} from '@nestjs/common'
import { Prisma, type AccreditationCatalogStandard } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import { FRAMEWORK_SEEDS, type FrameworkSeed } from './catalog-seed.js'
import { FRAMEWORK_REQUIREMENT_SEEDS } from './catalog-requirements-seed.js'
import { AccreditationSnapshotService } from './readiness-snapshot.service.js'
import { divisionsFor, sealLineFor } from './divisions.js'
import { recognitionsFor } from './recognitions.js'

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
  // ── WS1/WS2 (all additive; the frozen ARCH-1 §4.1 seam) ──
  /** Searchable alternate names ("NCA CASI" finds the Cognia framework). */
  aliases: string[]
  /** Divisions this framework's accreditor operates ([] for most frameworks). */
  divisions: { code: string; name: string; fullName: string }[]
  /** THIS school's division choice from its profile row, or null. */
  division: string | null
  /** Server-composed display line for that choice; null when no division set. */
  sealLine: string | null
  /** Recognition-body badges (NCPSA/ICAISA) — resolved from the closed
   *  constant; [] for accreditors on neither list (a verified absence). */
  recognitions: { code: string; name: string; line: string }[]
  /** Resolved at read time from supersededByCode; a dangling code reads null. */
  supersededBy: { code: string; name: string; version: string } | null
  /** Present only when supersededBy != null AND the school holds rows here. */
  upgrade: { available: boolean; crosswalk: 'code_identity' | 'none' } | null
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
 * WS2 — WHAT THE UPGRADE WOULD CARRY, counted before anything is touched. The
 * `removalImpact` pattern applied to the supersession upgrade: the school reads
 * exactly what moves, what arrives unscored, and what blocks, in its own
 * numbers, then makes the second informed call.
 */
export interface FrameworkUpgradeImpact {
  from: { code: string; name: string; rubricLabels: string[] }
  to: { code: string; name: string; rubricLabels: string[] }
  /** School rows that would be re-pointed (parents, leaves, assurances). */
  standardsToMove: number
  /** Of those, rows carrying a self-score — carried VERBATIM. */
  scoredCarried: number
  /** Rows with a rating other than the untouched default — carried VERBATIM. */
  ratedCarried: number
  /** Evidence link rows on those standards — untouched (ids preserved). */
  evidenceCarried: number
  /** Successor codes the school does not hold — they arrive UNSCORED. */
  newStandards: string[]
  /** Rows whose title no longer matches the old catalog (school edits respected). */
  editedTitleKept: number
  /** Old codes with no successor counterpart (empty for Cognia); they stay put. */
  unmappedKept: string[]
  /** The trend-continuity sentence, rendered verbatim by the confirm dialog. */
  seriesNote: string
  blockers: string[]
}

export interface FrameworkUpgradeResult {
  from: string
  to: string
  moved: number
  created: number
  keptEditedTitles: number
  scoredCarried: number
  evidenceCarried: number
  alreadyUpgraded: boolean
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
      // ── WS1/WS2 framework versioning — on BOTH create and update paths so
      // the fields self-heal like everything else (and CLEAR when a seed drops
      // them: `?? null` / DbNull, never a stale leftover).
      aliases: fw.aliases ?? [],
      supersededByCode: fw.supersededByCode ?? null,
      rubricDescriptors: (fw.rubricDescriptors ?? Prisma.DbNull) as Prisma.InputJsonValue,
      indexReference: (fw.indexReference ?? Prisma.DbNull) as Prisma.InputJsonValue,
      // Recognition badges (NCPSA/ICAISA) — accreditor metadata, [] = verified
      // absence. Self-heals like aliases.
      recognitions: fw.recognitions ?? [],
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
        // WS3 F3 — the authored plain-language layer; null clears (self-heal).
        plainLanguage: s.plainLanguage ?? null,
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
    const [frameworks, adopted, profiles] = await Promise.all([
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
      // WS1 — the school's profile rows (division choices). OPTIONAL METADATA:
      // a profile never makes a framework `adopted` (spec-pinned invariant);
      // fail-soft so a pre-migration image lists frameworks without divisions.
      Promise.resolve()
        .then(() => this.prisma.accreditationFrameworkProfile.findMany({ where: { schoolId } }))
        .catch(() => [] as { frameworkId: string; division: string | null }[]),
    ])
    const adoptedBy = new Map<string, number>()
    for (const a of adopted) {
      if (a.frameworkId) adoptedBy.set(a.frameworkId, a._count._all)
    }
    const profileByFw = new Map(profiles.map((p) => [p.frameworkId, p]))
    // Read-time supersession resolution: code → row. A dangling code (successor
    // not seeded) resolves to nothing and reads as "not superseded" (fail-soft).
    const byCode = new Map(frameworks.map((f) => [f.code, f]))
    return {
      frameworks: frameworks.map((fw) => {
        const parentIds = new Set(fw.standards.map((s) => s.parentId).filter(Boolean))
        const leaves = fw.standards.filter((s) => !parentIds.has(s.id))
        const adoptedCount = adoptedBy.get(fw.id) ?? 0
        const profile = profileByFw.get(fw.id) ?? null
        const successor = fw.supersededByCode ? (byCode.get(fw.supersededByCode) ?? null) : null
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
          aliases: fw.aliases ?? [],
          divisions: divisionsFor(fw.code).map((d) => ({
            code: d.code,
            name: d.name,
            fullName: d.fullName,
          })),
          division: profile?.division ?? null,
          sealLine: sealLineFor(fw.code, profile?.division ?? null),
          recognitions: recognitionsFor(fw.recognitions).map((r) => ({
            code: r.code,
            name: r.name,
            line: r.line,
          })),
          supersededBy: successor
            ? { code: successor.code, name: successor.name, version: successor.version }
            : null,
          upgrade:
            successor && adoptedCount > 0
              ? {
                  // The Cognia crosswalk is a code identity; a future successor
                  // with no crosswalk would surface 'none' and the adopt-then-
                  // remove path instead (the ACSI shape, deferred this run).
                  available: true,
                  crosswalk: 'code_identity' as const,
                }
              : null,
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

    // ── WS2 R12 — superseded frameworks are closed to NEW adopters only. A
    // school already holding rows keeps this exact call as the idempotent
    // gap-filler it has always been (re-adopt fills gaps); a school with zero
    // rows is steered to the successor. Dangling successor code → not blocked
    // (fail-soft, same read-time rule as everywhere else).
    //
    // FAST PATH ONLY — the authoritative check re-runs INSIDE the transaction
    // after the advisory lock (see below): between here and the lock a
    // concurrent removeFramework can take this school's last rows, which would
    // turn a legal gap-fill into a brand-new adoption of a superseded framework.
    await this.assertNotClosedToNewAdopters(this.prisma, schoolId, framework)

    const result = await this.prisma.$transaction(async (tx) => {
      // Serialize concurrent adopts of the same (school, framework): the loser
      // blocks here until the winner commits, then reads the winner's rows and
      // takes the idempotent skip path. Read-then-create alone is NOT race-safe
      // under READ COMMITTED; the unique index on (school_id,
      // catalog_standard_id) backstops any residual race.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}::text), hashtext(${framework.id}::text))`
      // R12, re-checked NOW THAT THE LOCK HOLDS. The early check read state that
      // may be stale by the time we own the lock (TOCTOU); this one is
      // serialized against every remove/upgrade of this pair, so its answer is
      // the one the write acts on.
      await this.assertNotClosedToNewAdopters(tx, schoolId, framework)
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
   * WS2 R12 — the adopt guard for superseded frameworks, shared by the
   * pre-transaction fast path and the authoritative in-lock re-check (A5).
   * 409s ONLY a NEW adopter (zero held rows) of a superseded framework whose
   * successor is actually seeded; an existing holder passes (adopt stays the
   * idempotent gap-filler) and a dangling successor code fails soft.
   */
  private async assertNotClosedToNewAdopters(
    db: Pick<PrismaService, 'accreditationFramework' | 'accreditationStandard'>,
    schoolId: string,
    framework: { id: string; name: string; supersededByCode: string | null },
  ): Promise<void> {
    if (!framework.supersededByCode) return
    const successor = await db.accreditationFramework.findFirst({
      where: { code: framework.supersededByCode, active: true },
      select: { code: true, name: true },
    })
    if (!successor) return
    const held = await db.accreditationStandard.count({
      where: { schoolId, frameworkId: framework.id },
    })
    if (held === 0) {
      throw new ConflictException({
        code: 'FRAMEWORK_SUPERSEDED',
        message: `${framework.name} has been superseded — adopt ${successor.name} (${successor.code}) instead.`,
        supersededBy: successor.code,
      })
    }
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
      // Serialize against concurrent adopt/upgrade of the SAME (school,
      // framework) — the same advisory-lock discipline those paths take, so the
      // upgrade's "serializes against remove" claim is actually two-sided. The
      // row-id set is read AFTER the lock, so a winner's writes are visible.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}::text), hashtext(${impact.frameworkId}::text))`
      const rows = await tx.accreditationStandard.findMany({
        where: { schoolId, frameworkId: impact.frameworkId },
        select: { id: true },
      })
      const ids = rows.map((r) => r.id)
      // WS1 — the profile row (division/cycle metadata) goes with the register,
      // rows or not: a remnant profile must never survive to imply adoption.
      await Promise.resolve()
        .then(() =>
          tx.accreditationFrameworkProfile.deleteMany({
            where: { schoolId, frameworkId: impact.frameworkId },
          }),
        )
        .catch(() => undefined) // pre-migration image / narrow mocks: nothing to delete
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

  // ── WS1 — the per-(school, framework) PROFILE (division/seal choice) ────────

  /**
   * Set or clear the school's accreditor-division choice for one framework.
   * 400s when the framework has no divisions (the only legal value there is
   * null, and PATCHing a division onto MSA would be a claim about an accreditor
   * that has none). The profile row is OPTIONAL METADATA — writing it never
   * makes the framework `adopted` (spec-pinned invariant).
   */
  async setProfile(
    schoolId: string,
    code: string,
    division: string | null,
    userId: string,
  ): Promise<{ frameworkId: string; code: string; division: string | null; sealLine: string | null }> {
    const framework = await this.prisma.accreditationFramework.findFirst({
      where: { code, active: true },
      select: { id: true, code: true },
    })
    if (!framework) throw new NotFoundException('Framework not found.')

    const divisions = divisionsFor(framework.code)
    if (division !== null) {
      if (divisions.length === 0) {
        throw new BadRequestException(
          'This framework has no accreditor divisions — the only valid division here is none.',
        )
      }
      if (!divisions.some((d) => d.code === division)) {
        throw new BadRequestException('Unknown division for this framework.')
      }
    }

    const row = await this.prisma.accreditationFrameworkProfile.upsert({
      where: { schoolId_frameworkId: { schoolId, frameworkId: framework.id } },
      create: { schoolId, frameworkId: framework.id, division, updatedByUserId: userId },
      update: { division, updatedByUserId: userId },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'accreditation.framework.profile.updated',
      targetType: 'accreditation_framework_profiles',
      targetId: row.id,
    })
    return {
      frameworkId: framework.id,
      code: framework.code,
      division: row.division ?? null,
      sealLine: sealLineFor(framework.code, row.division ?? null),
    }
  }

  // ── WS2 — the SUPERSESSION UPGRADE (preflight + single-transaction re-point) ─

  /**
   * Optional per-pair exception table for a future successor whose crosswalk is
   * NOT a code identity. EMPTY for Cognia (COG-* codes are identical across
   * editions — spec-pinned); its existence is what lets a non-identity successor
   * reuse this flow without redesign.
   */
  private static readonly FRAMEWORK_CROSSWALKS: Readonly<
    Record<string, Readonly<Record<string, string>>>
  > = {}

  private crosswalkCode(fromCode: string, toCode: string, standardCode: string): string {
    const table =
      AccreditationCatalogService.FRAMEWORK_CROSSWALKS[`${fromCode}->${toCode}`] ?? null
    return table?.[standardCode] ?? standardCode
  }

  /** Resolve (old framework, seeded successor) for :code, or 404. */
  private async resolveUpgradePair(code: string) {
    const from = await this.prisma.accreditationFramework.findFirst({
      where: { code, active: true },
      include: { standards: true },
    })
    if (!from) throw new NotFoundException('Framework not found.')
    if (!from.supersededByCode) {
      throw new NotFoundException('This framework is not superseded — there is nothing to upgrade to.')
    }
    const to = await this.prisma.accreditationFramework.findFirst({
      where: { code: from.supersededByCode, active: true },
      include: { standards: true },
    })
    if (!to) {
      throw new NotFoundException('The successor framework is not available on this server yet.')
    }
    return { from, to }
  }

  /**
   * READ-ONLY preflight — the `removalImpact` twin for the upgrade. Counts, in
   * the school's own numbers, exactly what the transaction would carry and what
   * would arrive unscored. The web confirm dialog renders this verbatim (the
   * informed-second-call pattern).
   */
  async upgradeImpact(schoolId: string, code: string): Promise<FrameworkUpgradeImpact> {
    const { from, to } = await this.resolveUpgradePair(code)

    const [rows, successorHeld] = await Promise.all([
      this.prisma.accreditationStandard.findMany({
        where: { schoolId, frameworkId: from.id },
      }),
      this.prisma.accreditationStandard.count({ where: { schoolId, frameworkId: to.id } }),
    ])

    const oldById = new Map(from.standards.map((n) => [n.id, n]))
    const newByCode = new Map(to.standards.map((n) => [n.code, n]))

    const movable = rows.filter((r) => {
      const node = r.catalogStandardId ? oldById.get(r.catalogStandardId) : undefined
      return node !== undefined && newByCode.has(this.crosswalkCode(from.code, to.code, node.code))
    })
    const movableIds = movable.map((r) => r.id)
    const unmappedKept = rows
      .filter((r) => !movableIds.includes(r.id))
      .map((r) => r.code)
      .sort()

    const evidenceCarried =
      movableIds.length > 0
        ? await this.prisma.accreditationEvidence.count({
            where: { schoolId, standardId: { in: movableIds } },
          })
        : 0

    const heldNewCodes = new Set(
      movable.map((r) => {
        const node = oldById.get(r.catalogStandardId as string) as AccreditationCatalogStandard
        return this.crosswalkCode(from.code, to.code, node.code)
      }),
    )
    const newStandards = to.standards
      .map((n) => n.code)
      .filter((c) => !heldNewCodes.has(c))
      .sort()

    const editedTitleKept = movable.filter((r) => {
      const node = oldById.get(r.catalogStandardId as string) as AccreditationCatalogStandard
      return r.title !== node.title
    }).length

    return {
      from: { code: from.code, name: from.name, rubricLabels: (from.rubricLabels as string[]) ?? [] },
      to: { code: to.code, name: to.name, rubricLabels: (to.rubricLabels as string[]) ?? [] },
      standardsToMove: movable.length,
      scoredCarried: movable.filter((r) => r.rubricScore != null).length,
      ratedCarried: movable.filter((r) => r.rating && r.rating !== 'not_started').length,
      evidenceCarried,
      newStandards,
      editedTitleKept,
      unmappedKept,
      seriesNote:
        'Your readiness trend continues with an explicit break at the upgrade date. Readings before and after it are not directly comparable.',
      blockers: successorHeld > 0 ? ['successor_already_adopted'] : [],
    }
  }

  /**
   * THE UPGRADE — a single-transaction RE-POINT of the school's existing rows
   * onto the successor framework. Row ids are load-bearing (evidence FKs,
   * findings `standard:<id>` scope keys, initiative originRefs, the parent/child
   * hierarchy), so nothing is copied and nothing is deleted: `frameworkId` /
   * `catalogStandardId` / `sortOrder` move, text follows the catalog ONLY where
   * the school never touched it, and every score, rating, provenance stamp,
   * evidence row and finding is left byte-identical. Gap-fill creates the
   * successor codes the school lacks — UNSCORED, `not_started`: a score
   * invented for a standard the school never assessed would be the one
   * dishonest write in this flow.
   */
  async upgradeFramework(
    schoolId: string,
    code: string,
    userId: string,
  ): Promise<FrameworkUpgradeResult> {
    const { from, to } = await this.resolveUpgradePair(code)

    const result = await this.prisma.$transaction(async (tx) => {
      // Advisory locks on BOTH (school, framework) pairs — serializes against
      // concurrent adopt/remove/upgrade of either framework (adopt's own lock
      // discipline, doubled).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}::text), hashtext(${from.id}::text))`
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}::text), hashtext(${to.id}::text))`

      // Guard 1: nothing to move. An idempotent RETRY (zero old rows, and the
      // successor profile already records this upgrade) is a 200 no-op —
      // checked FIRST, because after a successful upgrade the school holds
      // successor rows by definition and the dual-adopt 409 below must never
      // swallow the retry. Anything else with zero rows is a 404-shaped refusal.
      const rows = await tx.accreditationStandard.findMany({
        where: { schoolId, frameworkId: from.id },
      })
      if (rows.length === 0) {
        const successorProfile = await tx.accreditationFrameworkProfile.findFirst({
          where: { schoolId, frameworkId: to.id },
          select: { upgradedFromFrameworkId: true },
        })
        if (successorProfile?.upgradedFromFrameworkId) {
          return {
            from: from.code,
            to: to.code,
            moved: 0,
            created: 0,
            keptEditedTitles: 0,
            scoredCarried: 0,
            evidenceCarried: 0,
            alreadyUpgraded: true,
          }
        }
        throw new NotFoundException('This school holds no standards on that framework — nothing to upgrade.')
      }

      // Guard 2: a school holding BOTH registers (the dual-adopt edge) must
      // finish via adopt + removal — a merge of two live registers is not a
      // re-point, and the `@@unique([schoolId, catalogStandardId])` would
      // collide anyway.
      const successorHeld = await tx.accreditationStandard.count({
        where: { schoolId, frameworkId: to.id },
      })
      if (successorHeld > 0) {
        throw new ConflictException({
          code: 'SUCCESSOR_ALREADY_ADOPTED',
          message: `This school already holds ${to.name} standards. Finish adopting the successor directly, then remove the ${from.name} register via the removal flow.`,
        })
      }

      const oldById = new Map(from.standards.map((n) => [n.id, n]))
      const newByCode = new Map(to.standards.map((n) => [n.code, n]))
      const newById = new Map(to.standards.map((n) => [n.id, n]))

      // ── Crosswalk injectivity guard (n3). A crosswalk table that maps two old
      // codes onto ONE successor code would send two school rows at the same
      // successor catalog node — a guaranteed unique-violation on
      // (schoolId, catalogStandardId) halfway through the loop. Detect it up
      // front and refuse with a clean 409 instead of a raw 500; the code-identity
      // default can never trip this (codes are unique per framework).
      {
        const targetTakenBy = new Map<string, string>() // successor node id → old code
        for (const row of rows) {
          const oldNode = row.catalogStandardId ? oldById.get(row.catalogStandardId) : undefined
          if (!oldNode) continue
          const newNode = newByCode.get(this.crosswalkCode(from.code, to.code, oldNode.code))
          if (!newNode) continue
          const prior = targetTakenBy.get(newNode.id)
          if (prior !== undefined) {
            throw new ConflictException({
              code: 'CROSSWALK_NOT_INJECTIVE',
              message: `The ${from.code} → ${to.code} crosswalk maps both ${prior} and ${oldNode.code} onto ${newNode.code}; the upgrade cannot re-point two standards onto one successor. Fix the crosswalk table before retrying.`,
            })
          }
          targetTakenBy.set(newNode.id, oldNode.code)
        }
      }

      // catalog node (successor) id → school row id, built as we re-point, so
      // gap-fill can wire parents against the already-re-pointed rows.
      const schoolIdOfNewNode = new Map<string, string>()
      let moved = 0
      let keptEditedTitles = 0
      let scoredCarried = 0

      for (const row of rows) {
        const oldNode = row.catalogStandardId ? oldById.get(row.catalogStandardId) : undefined
        if (!oldNode) continue // hand-made / catalog-orphaned rows are never touched
        const newNode = newByCode.get(this.crosswalkCode(from.code, to.code, oldNode.code))
        if (!newNode) continue // no successor counterpart: stays on the old framework, reported by preflight

        // Untouched text follows the catalog; school edits are respected. The
        // same rule the adopt path used to derive each field, re-applied.
        const oldParent = oldNode.parentId ? oldById.get(oldNode.parentId) : undefined
        const newParent = newNode.parentId ? newById.get(newNode.parentId) : undefined
        const oldDerivedCategory = oldParent ? oldParent.title : oldNode.title
        const newDerivedCategory = newParent ? newParent.title : newNode.title
        const titleUntouched = row.title === oldNode.title
        await tx.accreditationStandard.update({
          where: { id: row.id },
          data: {
            frameworkId: to.id,
            catalogStandardId: newNode.id,
            sortOrder: newNode.orderIndex,
            title: titleUntouched ? newNode.title : row.title,
            notes: row.notes === (oldNode.description ?? null) ? (newNode.description ?? null) : row.notes,
            category:
              row.category === oldDerivedCategory ? newDerivedCategory : row.category,
            // DELIBERATELY ABSENT: rating, rubricScore, scoreProvenance,
            // rubricScoredAt/ByUserId, reviewDate, owner, ownerUserId, parentId,
            // strategySource*, updatedByUserId — a re-point is not a score
            // change and must not restart any provenance clock.
          },
        })
        schoolIdOfNewNode.set(newNode.id, row.id)
        moved += 1
        if (!titleUntouched) keptEditedTitles += 1
        if (row.rubricScore != null) scoredCarried += 1
      }

      // Gap-fill: successor catalog nodes the school still lacks (COG-31 for a
      // pre-Std-31 adopter) arrive UNSCORED, rating 'not_started' — the adopt
      // path's own create shape, wired against the re-pointed rows.
      const missing = this.topoSort(to.standards).filter((n) => !schoolIdOfNewNode.has(n.id))
      let created = 0
      for (const node of missing) {
        const parentCatalog = node.parentId ? newById.get(node.parentId) : undefined
        const createdRow = await tx.accreditationStandard.create({
          data: {
            schoolId,
            parentId: node.parentId ? (schoolIdOfNewNode.get(node.parentId) ?? null) : null,
            code: node.code,
            title: node.title,
            category: parentCatalog ? parentCatalog.title : node.title,
            rating: 'not_started',
            notes: node.description ?? null,
            frameworkId: to.id,
            catalogStandardId: node.id,
            sortOrder: node.orderIndex,
            rubricScore: null,
            updatedByUserId: userId,
          },
        })
        schoolIdOfNewNode.set(node.id, createdRow.id)
        created += 1
      }

      // n14 (accepted as-is): counted over ALL old rows, not just the movable
      // set — evidence on an unmapped row is still carried (the row stays put).
      const evidenceCarried = await tx.accreditationEvidence.count({
        where: { schoolId, standardId: { in: rows.map((r) => r.id) } },
      })

      // Carry the WHOLE profile (division + cycle anchor + target) to the
      // successor, stamp the upgrade provenance, and delete the old row — the
      // one-profile-per-live-framework rule that kills the orphan problem.
      //
      // A6 — a successor profile may ALREADY exist (someone set a cycle or a
      // target against the 2025 framework before upgrading; metadata never
      // implies adoption, so guard 2 does not rule this out). Its values are the
      // NEWER intent: prefer them, and fill only its nulls from the old profile.
      // The upgrade provenance stamp is always ours.
      const oldProfile = await tx.accreditationFrameworkProfile.findFirst({
        where: { schoolId, frameworkId: from.id },
      })
      const successorProfile = await tx.accreditationFrameworkProfile.findFirst({
        where: { schoolId, frameworkId: to.id },
      })
      await tx.accreditationFrameworkProfile.upsert({
        where: { schoolId_frameworkId: { schoolId, frameworkId: to.id } },
        create: {
          schoolId,
          frameworkId: to.id,
          division: oldProfile?.division ?? null,
          lastReviewDate: oldProfile?.lastReviewDate ?? null,
          nextReviewDate: oldProfile?.nextReviewDate ?? null,
          termYears: oldProfile?.termYears ?? 6,
          targetIndex: oldProfile?.targetIndex ?? null,
          upgradedFromFrameworkId: from.id,
          upgradedAt: new Date(),
          updatedByUserId: userId,
        },
        update: {
          division: successorProfile?.division ?? oldProfile?.division ?? null,
          lastReviewDate:
            successorProfile?.lastReviewDate ?? oldProfile?.lastReviewDate ?? null,
          nextReviewDate:
            successorProfile?.nextReviewDate ?? oldProfile?.nextReviewDate ?? null,
          termYears: successorProfile?.termYears ?? oldProfile?.termYears ?? 6,
          targetIndex: successorProfile?.targetIndex ?? oldProfile?.targetIndex ?? null,
          upgradedFromFrameworkId: from.id,
          upgradedAt: new Date(),
          updatedByUserId: userId,
        },
      })
      if (oldProfile) {
        await tx.accreditationFrameworkProfile.delete({ where: { id: oldProfile.id } })
      }

      return {
        from: from.code,
        to: to.code,
        moved,
        created,
        keptEditedTitles,
        scoredCarried,
        evidenceCarried,
        alreadyUpgraded: false,
      }
    })

    if (!result.alreadyUpgraded) {
      // n16 (accepted as-is): audit lands AFTER commit — the adopt/remove
      // precedent; a crashed-between window loses only the audit line.
      await this.audit.write({
        schoolId,
        userId,
        action: 'accreditation.framework.upgraded',
        targetType: 'accreditation_frameworks',
        targetId: to.id,
      })
      // The first successor-series snapshot lands same-day; the old series
      // simply stops accruing. Fire-and-forget, exactly like adopt.
      this.snapshot?.captureOnEvent(schoolId)
    }
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
