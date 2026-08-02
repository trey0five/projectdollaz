import { Injectable } from '@nestjs/common'
import type { AccreditationFramework, AccreditationStandard } from '@finrep/db'
import {
  CURRENCY_RANK,
  UNEARNED_REGISTER_LEAD,
  computeEvidenceHealth,
  computeRequirementCurrency,
  type ArtifactInput,
  type CurrencyBasis,
  type CurrencyState,
  type DataAvailability,
  type EvidenceHealth,
  type RequirementCurrency,
  type RequirementInput,
  type SourceRegister,
  type WindowKind,
} from '@finrep/compliance'
import { PrismaService } from '../prisma/prisma.service.js'
import { leavesOf } from './leaf-scope.js'
import { frameworkIdsIn, pickDominantFramework } from './framework-scope.js'
import {
  CURRICULUM_CONVENTION_NOTE,
  MODULE_GATED_REGISTERS,
  POLICY_AGGREGATE_NOTE,
  REGISTER_DOMAIN_LABEL,
  REGISTER_ROUTE,
  createAnchorResolver,
  type AnchorPrisma,
  type ResolvedArtifact,
} from './evidence-anchors.js'
import { READINESS_DISCLAIMER } from './readiness-history.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase C — THE EVIDENCE INDEX.
//
// The one page a school hands a visiting team, and the only surface in the
// product that answers the accreditor's actual question: not "what have you
// got?" but "what would they ASK FOR, do you have it, is it dated, and is it
// still current?"
//
// THREE DESIGN DECISIONS WORTH DEFENDING IN REVIEW:
//
//   1. GROUPED BY TAG, ACROSS STANDARDS. One external audit answers COG-15 and
//      COG-A2 and MSA-4. Rendering it three times would teach a school that
//      accreditation is data entry. Grouping it once, with `servesStandards`
//      listing every standard it answers, is "enter data once" made visible.
//
//   2. REQUIREMENT-DRIVEN, NOT EVIDENCE-DRIVEN. Attached evidence whose tag
//      matches no requirement in the school's framework is INVISIBLE here and
//      affects nothing — it still counts toward evidenceCount and readinessPct
//      exactly as today. This page is the accreditor's checklist, not an
//      inventory of the school's folder.
//
//   3. NOTHING IS EVER WRITTEN. Auto-satisfaction is a live read of the register
//      that already owns the artifact. No evidence row is created, ever.
//
// EVERY DEGRADED STATE RETURNS 200 WITH A COMPLETE PAYLOAD: no framework, no
// standards, zero requirement rows, a register that throws. A red box teaches a
// school nothing and a 500 teaches them less.
// ─────────────────────────────────────────────────────────────────────────────

export type EvidenceCtaKind = 'start_tracking' | 'add_date' | 'upload' | 'review'

export interface EvidenceCta {
  kind: EvidenceCtaKind
  label: string
  /** NO FAKE LINKS. Null renders as a disabled pill carrying the reason. */
  link: string | null
}

export interface EvidenceGroupStandard {
  standardId: string
  code: string
  title: string
  state: CurrencyState
  expiresOn: string | null
}

export interface EvidenceGroup {
  tag: string
  label: string
  dataAvailability: DataAvailability
  sourceRegister: string | null
  windowKind: WindowKind
  windowMonths: number | null
  state: CurrencyState
  message: string
  basis: CurrencyBasis
  expiresOn: string | null
  daysUntilExpiry: number | null
  autoSatisfied: boolean
  alsoInPortal: boolean | null
  /** THE PAYOFF LINE: one audit, nine standards. Sorted by code asc. */
  servesStandards: EvidenceGroupStandard[]
  artifacts: RequirementCurrency['artifacts']
  /** Aggregate registers only (policy_manual); null everywhere else. */
  sourceCount: number | null
  undatedSourceCount: number | null
  /** Frozen sub-line for aggregate/convention rows; null otherwise. */
  note: string | null
  cta: EvidenceCta | null
}

export interface EvidenceNudge {
  kind: 'date_unknown' | 'not_tracked' | 'stale' | 'missing'
  severity: 'info' | 'warn'
  tag: string
  message: string
  link: string | null
}

export interface EvidenceReadinessResponse {
  framework: { id: string; code: string; name: string } | null
  generatedAt: string
  health: EvidenceHealth
  counts: {
    /**
     * ARTIFACT counts — the SAME population `health.basis` counts, so the card
     * can never print two different denominators for one quantity. One tag = one
     * artifact, however many standards ask for it.
     */
    artifacts: number
    /** dataAvailability === 'platform' ONLY. An honest hole is never a duty. */
    artifactsTracked: number
    /** ROW counts — one per (standard, ask). Always ≥ the artifact counts. */
    requirements: number
    requiredTracked: number
    standardsWithRequirements: number
    /** Zero requirement rows → today's binary evidence behaviour, byte-for-byte. */
    standardsLegacy: number
  }
  groups: EvidenceGroup[]
  nudges: EvidenceNudge[]
  demoData: boolean
  disclaimer: string
}

/** At most this many nudges, so the rail is a prompt and not a wall. */
const MAX_NUDGES = 8

interface RequirementRow {
  catalogStandardId: string
  tag: string
  label: string
  windowMonths: number | null
  windowKind: string
  dataAvailability: string
  sourceRegister: string | null
  notTrackedReason: string | null
  orderIndex: number
}

interface EvidenceRow {
  id: string
  standardId: string
  title: string
  sourceType: string | null
  sourceRef: string | null
  reference: string | null
  tag: string | null
  effectiveDate: Date | null
  expiresAt: Date | null
  alsoInPortal: boolean | null
}

function isoDate(d: Date | null | undefined): string | null {
  if (!d) return null
  return d.toISOString().slice(0, 10)
}

@Injectable()
export class AccreditationEvidenceReadinessService {
  constructor(private readonly prisma: PrismaService) {}

  async getEvidenceReadiness(
    schoolId: string,
    opts: { frameworkId?: string } = {},
    now: Date = new Date(),
  ): Promise<EvidenceReadinessResponse> {
    const built = await this.build(schoolId, opts, now)
    const { framework, groups, scopedLeaves, requirements, demoData, downgradedTags } = built

    const standardsWithRequirements = new Set(
      requirements.map((r) => r.catalogStandardId),
    )
    const scopedCatalogIds = scopedLeaves
      .map((s) => s.catalogStandardId)
      .filter((id): id is string => !!id)

    return {
      framework: framework ? { id: framework.id, code: framework.code, name: framework.name } : null,
      generatedAt: now.toISOString(),
      health: computeEvidenceHealth(groups.map((g) => g.currency)),
      counts: {
        artifacts: groups.length,
        artifactsTracked: groups.filter((g) => g.group.dataAvailability === 'platform').length,
        requirements: requirements.length,
        // AIC Phase F — a row DOWNGRADED by the module gate is not a duty either.
        // Counting a `platform` row as tracked while the group it belongs to renders
        // `not_tracked` would print two different answers for one row, and would
        // move this number for every school on the platform. `downgradedTags` is
        // empty for every pre-Phase-F tag, so this is byte-identical to today.
        requiredTracked: requirements.filter(
          (r) => r.dataAvailability === 'platform' && !downgradedTags.has(r.tag),
        ).length,
        standardsWithRequirements: scopedCatalogIds.filter((id) => standardsWithRequirements.has(id))
          .length,
        standardsLegacy: scopedLeaves.filter(
          (s) => !s.catalogStandardId || !standardsWithRequirements.has(s.catalogStandardId),
        ).length,
      },
      groups: groups.map((g) => g.group),
      nudges: this.nudgesFor(groups.map((g) => g.group)),
      demoData,
      disclaimer: READINESS_DISCLAIMER,
    }
  }

  /**
   * The SAME computation, keyed by school standard — what the commendations
   * engine consumes. Exposed as its own method so commendations and the Evidence
   * Index can never describe two different currency states read a millisecond
   * apart.
   */
  async getCurrencyByStandard(
    schoolId: string,
    opts: { frameworkId?: string } = {},
    now: Date = new Date(),
  ): Promise<{
    byStandard: Record<string, RequirementCurrency[]>
    framework: AccreditationFramework | null
    demoData: boolean
  }> {
    const { groups, framework, demoData } = await this.build(schoolId, opts, now)
    const byStandard: Record<string, RequirementCurrency[]> = {}
    for (const g of groups) {
      for (const s of g.perStandard) {
        const list = byStandard[s.standardId] ?? []
        list.push(s.currency)
        byStandard[s.standardId] = list
      }
    }
    return { byStandard, framework, demoData }
  }

  // ── The one build ──────────────────────────────────────────────────────────

  private async build(
    schoolId: string,
    opts: { frameworkId?: string },
    now: Date,
  ): Promise<{
    framework: AccreditationFramework | null
    scopedLeaves: AccreditationStandard[]
    requirements: RequirementRow[]
    groups: {
      group: EvidenceGroup
      currency: RequirementCurrency
      perStandard: { standardId: string; currency: RequirementCurrency }[]
    }[]
    demoData: boolean
    /** AIC Phase F — tags read back as `intake` by the module gate. Empty pre-F. */
    downgradedTags: ReadonlySet<string>
  }> {
    const rows = await this.prisma.accreditationStandard.findMany({ where: { schoolId } })
    const framework = await this.resolveFramework(rows, opts.frameworkId)

    // Leaves AND assurance gates: a visiting team asks for assurance artifacts
    // first, so excluding them here would drop the highest-value rows in the
    // catalog off the very page they are meant to be on.
    const scoped = framework ? rows.filter((r) => r.frameworkId === framework.id) : rows
    const scopedLeaves = leavesOf(rows, scoped)
    const catalogIds = scopedLeaves
      .map((r) => r.catalogStandardId)
      .filter((id): id is string => !!id)

    const [requirements, evidence, demoData] = await Promise.all([
      this.readRequirements(catalogIds),
      this.readEvidence(schoolId),
      this.readDemoFlag(schoolId),
    ])

    if (requirements.length === 0) {
      return { framework, scopedLeaves, requirements, groups: [], demoData, downgradedTags: new Set() }
    }

    // catalogStandardId → the school standards that adopted it (a school can
    // legitimately hold two rows pointing at one catalog node across frameworks).
    const standardsByCatalog = new Map<string, AccreditationStandard[]>()
    for (const s of scopedLeaves) {
      if (!s.catalogStandardId) continue
      const list = standardsByCatalog.get(s.catalogStandardId) ?? []
      list.push(s)
      standardsByCatalog.set(s.catalogStandardId, list)
    }

    // Attached artifacts pooled BY TAG across the whole school — the same audit
    // answers every standard that asks for one, wherever it happens to hang.
    const attachedByTag = new Map<string, ArtifactInput[]>()
    for (const e of evidence) {
      if (!e.tag) continue
      const list = attachedByTag.get(e.tag) ?? []
      list.push(this.toAttachedArtifact(e))
      attachedByTag.set(e.tag, list)
    }

    const resolver = createAnchorResolver(this.prisma as unknown as AnchorPrisma, schoolId, now)

    // ── Group by TAG ────────────────────────────────────────────────────────
    const byTag = new Map<string, RequirementRow[]>()
    for (const r of requirements) {
      const list = byTag.get(r.tag) ?? []
      list.push(r)
      byTag.set(r.tag, list)
    }

    const built: {
      group: EvidenceGroup
      currency: RequirementCurrency
      perStandard: { standardId: string; currency: RequirementCurrency }[]
    }[] = []
    const downgradedTags = new Set<string>()

    for (const [tag, rowsForTag] of byTag) {
      // The representative row: lowest orderIndex wins, tie → label asc. Its
      // label and window are what the group renders.
      const rep = [...rowsForTag].sort(
        (a, b) => a.orderIndex - b.orderIndex || a.label.localeCompare(b.label),
      )[0]
      const repReq = this.toRequirementInput(rep)

      const auto = await resolver.resolve(repReq)
      // AIC PHASE F — THE MODULE-GATED DOWNGRADE, applied in exactly one place per
      // judged row and nowhere else. A `platform` row whose owning register belongs
      // to a licensable module and produced NO ARTIFACT for this school is judged as
      // `intake`, so it renders `not_tracked` with its own frozen sentence — the
      // behaviour it had before the flip. The condition is EXACTLY `auto === null`:
      // no billing call, no extra query, no new constructor parameter (this service
      // injects only PrismaService and must keep it that way — injecting
      // BillingService here risks a module cycle). A school that hand-attached
      // evidence but has no register rows is therefore also downgraded, deliberately:
      // that is precisely what it did before this phase.
      const gated = this.gateIfUnearned(repReq, auto)
      if (gated.dataAvailability !== repReq.dataAvailability) downgradedTags.add(tag)
      // A LINKED row hands back the live anchor of the register it points at
      // (policy review cycle / plan term), so attaching a copy of something the
      // school already maintains never turns a judged row into an undated one.
      const attached = await Promise.all(
        (attachedByTag.get(tag) ?? []).map((a) => resolver.enrichAttached(a)),
      )
      const pool = this.poolFor(attached, auto)

      const currency = computeRequirementCurrency(gated, pool, now)

      // Per-standard: the SAME artifact pool, judged against each standard's own
      // requirement row (a framework may ask for a shorter window than another).
      const perStandard: { standardId: string; currency: RequirementCurrency }[] = []
      const serves: EvidenceGroupStandard[] = []
      for (const row of rowsForTag) {
        for (const std of standardsByCatalog.get(row.catalogStandardId) ?? []) {
          // The SAME downgrade, because the per-standard projection and the group
          // must never describe two different states of one row: the group is what
          // the Evidence Index renders, the projection is what the twin's
          // `acc.evidence_currency` signal counts.
          const c = computeRequirementCurrency(
            this.gateIfUnearned(this.toRequirementInput(row), auto),
            pool,
            now,
          )
          perStandard.push({ standardId: std.id, currency: c })
          serves.push({
            standardId: std.id,
            code: std.code,
            title: std.title,
            state: c.state,
            expiresOn: c.expiresOn,
          })
        }
      }
      serves.sort((a, b) => a.code.localeCompare(b.code) || a.standardId.localeCompare(b.standardId))

      built.push({
        group: this.toGroup(currency, serves, auto, downgradedTags.has(tag)),
        currency,
        perStandard,
      })
    }

    // WORST FIRST — except `not_tracked`, which always sorts LAST so an honest
    // hole never buries a real gap.
    built.sort((a, b) => {
      const an = a.group.state === 'not_tracked' ? 1 : 0
      const bn = b.group.state === 'not_tracked' ? 1 : 0
      if (an !== bn) return an - bn
      const r = CURRENCY_RANK[b.group.state] - CURRENCY_RANK[a.group.state]
      if (r !== 0) return r
      return a.group.tag.localeCompare(b.group.tag)
    })

    return { framework, scopedLeaves, requirements, groups: built, demoData, downgradedTags }
  }

  // ── Reads (each fail-soft; every one schoolId- or catalog-scoped) ──────────

  private async readRequirements(catalogIds: string[]): Promise<RequirementRow[]> {
    if (catalogIds.length === 0) return []
    try {
      return (await this.prisma.accreditationCatalogRequirement.findMany({
        where: { catalogStandardId: { in: catalogIds } },
        select: {
          catalogStandardId: true,
          tag: true,
          label: true,
          windowMonths: true,
          windowKind: true,
          dataAvailability: true,
          sourceRegister: true,
          notTrackedReason: true,
          orderIndex: true,
        },
      })) as unknown as RequirementRow[]
    } catch {
      // DEPLOY-ORDER SAFE: an image that boots before the migration lands sees
      // zero requirements, which is exactly the sparse (pre-Phase-C) behaviour.
      return []
    }
  }

  private async readEvidence(schoolId: string): Promise<EvidenceRow[]> {
    try {
      return (await this.prisma.accreditationEvidence.findMany({
        where: { schoolId },
        select: {
          id: true,
          standardId: true,
          title: true,
          sourceType: true,
          sourceRef: true,
          reference: true,
          tag: true,
          effectiveDate: true,
          expiresAt: true,
          alsoInPortal: true,
        },
      })) as unknown as EvidenceRow[]
    } catch {
      return []
    }
  }

  private async readDemoFlag(schoolId: string): Promise<boolean> {
    try {
      const row = await this.prisma.accreditationReadinessSnapshot.findFirst({
        where: { schoolId, isDemo: true },
        select: { isDemo: true },
      })
      return row !== null
    } catch {
      return false
    }
  }

  private async resolveFramework(
    rows: AccreditationStandard[],
    explicitId?: string,
  ): Promise<AccreditationFramework | null> {
    if (explicitId) {
      return this.prisma.accreditationFramework.findFirst({ where: { id: explicitId } })
    }
    const ids = frameworkIdsIn(rows)
    if (ids.length === 0) return null
    const candidates = await this.prisma.accreditationFramework.findMany({
      where: { id: { in: ids } },
    })
    // The SAME dominance rule the readiness hero uses, so the Evidence tab and
    // the hero above it always describe one framework.
    return pickDominantFramework(rows, candidates)
  }

  // ── Shaping ────────────────────────────────────────────────────────────────

  private toRequirementInput(r: RequirementRow): RequirementInput {
    return {
      tag: r.tag,
      label: r.label,
      windowMonths: r.windowMonths,
      windowKind: (r.windowKind === 'source_interval' ? 'source_interval' : 'fixed') as WindowKind,
      dataAvailability: r.dataAvailability as DataAvailability,
      sourceRegister: r.sourceRegister,
      notTrackedReason: r.notTrackedReason,
    }
  }

  /**
   * AIC Phase F — read a MODULE-GATED `platform` row back as `intake` when its
   * owning register produced no artifact for this school. See
   * MODULE_GATED_REGISTERS. Every other row is returned UNCHANGED (identity), so
   * this can only ever affect the two registers named there.
   *
   * THE LEAD IS OVERRIDDEN AT THE SAME TIME, and that is not cosmetic. The
   * `intake` lead is "<label> isn't tracked yet." — true of a register KYRO does
   * not have, and FALSE here: this register is in KYRO and the school may already
   * be looking at rows in it. A school that has recorded three staff evaluations
   * with no completed date, or three inspection items not yet resolved, was told
   * its register "isn't tracked yet" while the same school's /hr page showed a
   * live overdue count. `UNEARNED_REGISTER_LEAD` says what is actually true —
   * nothing in the register answers this row YET — and the seed's
   * `notTrackedReason` (which now names the completion condition) follows it.
   */
  private gateIfUnearned(req: RequirementInput, auto: ResolvedArtifact | null): RequirementInput {
    if (auto !== null) return req
    if (req.dataAvailability !== 'platform') return req
    if (!(req.sourceRegister !== null && req.sourceRegister in MODULE_GATED_REGISTERS)) return req
    return {
      ...req,
      dataAvailability: 'intake',
      notTrackedLead: UNEARNED_REGISTER_LEAD(req.label),
    }
  }

  /**
   * THE ARTIFACT POOL for one requirement — and the one rule that keeps
   * "attached wins" from meaning "attached erases".
   *
   *   1. KEY COLLISION → MERGE, NEVER REPLACE. The school's own effectiveDate /
   *      expiresAt / alsoInPortal win (they are assertions we did not make), but
   *      the auto-resolved twin's LIVE CYCLE is inherited, because the register
   *      still owns the clock. Discarding it would let attaching an overdue
   *      policy to a standard flip that requirement from "Out of date by N days"
   *      to "we don't know which period it covers" — and quietly lift
   *      evidenceHealthPct by dropping a rated row out of the denominator.
   *
   *   2. AN AGGREGATE REGISTER IS ONE ARTIFACT. When the resolver returns an
   *      aggregate (policy: `sourceCount` non-null, "only as current as its most
   *      overdue policy"), the individual member rows a school happens to have
   *      attached are ALREADY counted inside it. Letting one attached, current
   *      member outrank the aggregate would hide an overdue register behind the
   *      single policy someone remembered to link, so same-register attached rows
   *      do not compete — the register's own reading stands.
   */
  private poolFor(attached: ArtifactInput[], auto: ResolvedArtifact | null): ArtifactInput[] {
    if (auto === null) return attached
    const isAggregate = auto.sourceCount != null
    const merged = attached.map((a) =>
      a.key === auto.key
        ? {
            ...a,
            cycle: a.cycle ?? auto.cycle,
            effectiveDate: a.effectiveDate ?? auto.effectiveDate,
            link: a.link ?? auto.link,
          }
        : a,
    )
    const kept = isAggregate
      ? merged.filter((a) => a.key === auto.key || a.sourceType !== auto.sourceType)
      : merged
    const collided = kept.some((a) => a.key === auto.key)
    return collided ? kept : [...kept, auto]
  }

  private toAttachedArtifact(e: EvidenceRow): ArtifactInput {
    const sourceType = e.sourceType ?? 'manual'
    return {
      // Manual rows have no artifact identity of their own, so they key on the
      // evidence row; linked rows key on the artifact, which is what lets an
      // attached copy override the auto-resolved view of the SAME artifact.
      key: sourceType === 'manual' ? `evidence:${e.id}` : `${sourceType}:${e.sourceRef ?? ''}`,
      origin: 'attached',
      sourceType,
      sourceRef: e.sourceRef,
      label: e.title,
      effectiveDate: isoDate(e.effectiveDate),
      expiresAt: isoDate(e.expiresAt),
      // An evidence row stores NO cycle of its own — we never copy a date. The
      // live one is handed back before judging: from the register the row links
      // (resolver.enrichAttached) or from the auto-resolved twin on key collision
      // (poolFor). A row that links nothing we can read stays undated, and
      // `unknown` is the honest answer for a copy nobody dated.
      cycle: null,
      alsoInPortal: e.alsoInPortal,
      link: e.reference,
      autoLinkedNote: null,
    }
  }

  private toGroup(
    c: RequirementCurrency,
    serves: EvidenceGroupStandard[],
    auto: ResolvedArtifact | null,
    /** True when `gateIfUnearned` read this row back as `intake` (AIC Phase F). */
    downgraded = false,
  ): EvidenceGroup {
    return {
      tag: c.tag,
      label: c.label,
      dataAvailability: c.dataAvailability,
      sourceRegister: c.sourceRegister,
      windowKind: c.windowKind,
      windowMonths: c.windowMonths,
      state: c.state,
      message: c.message,
      basis: c.basis,
      expiresOn: c.expiresOn,
      daysUntilExpiry: c.daysUntilExpiry,
      autoSatisfied: c.autoSatisfied,
      alsoInPortal: c.alsoInPortal,
      servesStandards: serves,
      artifacts: c.artifacts,
      sourceCount: auto?.sourceCount ?? null,
      undatedSourceCount: auto?.undatedSourceCount ?? null,
      note: this.noteFor(c, auto),
      cta: this.ctaFor(c, downgraded),
    }
  }

  /** The frozen sub-lines. Composed HERE, never on the web. */
  private noteFor(c: RequirementCurrency, auto: ResolvedArtifact | null): string | null {
    if (c.tag === 'policy_manual' && auto && auto.sourceCount != null) {
      const undated = auto.undatedSourceCount ?? 0
      const counts = `${auto.sourceCount} active polic${auto.sourceCount === 1 ? 'y' : 'ies'}`
      return undated > 0
        ? `${POLICY_AGGREGATE_NOTE} ${counts} · ${undated} with no review date`
        : POLICY_AGGREGATE_NOTE
    }
    if (c.tag === 'curriculum_review' && c.state === 'missing') return CURRICULUM_CONVENTION_NOTE
    return null
  }

  private ctaFor(c: RequirementCurrency, downgraded = false): EvidenceCta | null {
    const register = c.sourceRegister as SourceRegister | null
    if (c.state === 'not_tracked') {
      // AIC Phase F — THE ONE `not_tracked` ROW THAT HAS SOMEWHERE TO GO.
      //
      // A MODULE-GATED row is a `platform` row that `gateIfUnearned` read back as
      // `intake` because its register has not answered it yet. The register EXISTS
      // (that is what this phase shipped), so a link to it is not a fake link — it
      // is the only navigating CTA on the screen that sent the user looking for it.
      // Without this the flow dead-ends: "Start tracking" renders as a
      // non-navigating span, `nudgesFor` propagates a null link, and /hr and
      // /facilities are reachable only from the `stale`/`expiring` branch below,
      // which requires an already-resolved artifact aged past its window — i.e.
      // never, for the school that has just been told to start tracking.
      if (downgraded && register !== null && register in MODULE_GATED_REGISTERS) {
        const link = REGISTER_ROUTE[register] ?? null
        if (link !== null) {
          return {
            kind: 'start_tracking',
            label: `Start tracking in ${REGISTER_DOMAIN_LABEL[register] ?? register}`,
            link,
          }
        }
      }
      // NO FAKE LINKS. There is no register to open yet; the web renders a
      // disabled pill whose title is the reason.
      if (c.dataAvailability === 'intake') return { kind: 'start_tracking', label: 'Start tracking', link: null }
      if (c.dataAvailability === 'integration') {
        return { kind: 'start_tracking', label: 'See what this needs', link: null }
      }
      return { kind: 'start_tracking', label: 'Where this lives', link: null }
    }
    if (c.state === 'unknown') {
      return { kind: 'add_date', label: 'Which period does this cover?', link: null }
    }
    if (c.state === 'missing') {
      if (register === 'knowledge_document') {
        return { kind: 'upload', label: 'Upload to your document store', link: '/knowledge' }
      }
      if (c.tag === 'curriculum_review') {
        return { kind: 'review', label: 'Add a Curriculum policy', link: '/governance' }
      }
      return null
    }
    if (c.state === 'stale' || c.state === 'expiring') {
      if (register === null) return null
      return {
        kind: 'review',
        label: `Renew in ${REGISTER_DOMAIN_LABEL[register] ?? register}`,
        link: REGISTER_ROUTE[register] ?? null,
      }
    }
    return null
  }

  /** At most one per group, worst-first, capped. No briefing wiring in Phase C. */
  private nudgesFor(groups: EvidenceGroup[]): EvidenceNudge[] {
    const KIND: Partial<Record<CurrencyState, EvidenceNudge['kind']>> = {
      unknown: 'date_unknown',
      not_tracked: 'not_tracked',
      stale: 'stale',
      missing: 'missing',
    }
    const out: EvidenceNudge[] = []
    // WORST FIRST, exactly like the group list this rail summarises — otherwise
    // the 8-item cap would spend itself on `info` "date unknown" prompts and
    // truncate the `warn` gaps underneath them. `not_tracked` still sorts last:
    // an honest hole never buries a real gap, here or in the list.
    for (const g of [...groups].sort((a, b) => {
      const an = a.state === 'not_tracked' ? 1 : 0
      const bn = b.state === 'not_tracked' ? 1 : 0
      if (an !== bn) return an - bn
      return CURRENCY_RANK[b.state] - CURRENCY_RANK[a.state] || a.tag.localeCompare(b.tag)
    })) {
      const kind = KIND[g.state]
      if (!kind) continue
      out.push({
        kind,
        // A hole we chose not to dig, and a date we simply do not have, are
        // information — not failures. Only a real gap is a warning.
        severity: kind === 'stale' || kind === 'missing' ? 'warn' : 'info',
        tag: g.tag,
        message: g.message,
        link: g.cta?.link ?? null,
      })
      if (out.length >= MAX_NUDGES) break
    }
    return out
  }
}
