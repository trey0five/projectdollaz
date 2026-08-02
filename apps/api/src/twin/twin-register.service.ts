import { Injectable, Logger } from '@nestjs/common'
import {
  DOMAIN_KEYS,
  SIGNAL_ATTRIBUTION_MIN_WEIGHT,
  daysFromCivil,
  toCivil,
  type CurrencyState,
  type DataAvailability,
  type DomainKey,
  type RequirementCurrency,
  type TwinComplianceInspectionSummaryView,
  type TwinEvidenceGroupView,
  type TwinPriorVisitCitationView,
  type TwinRegisterView,
  type TwinRequirementView,
  type TwinStaffEvaluationSummaryView,
  type TwinStandardView,
} from '@finrep/compliance'
import { PrismaService } from '../prisma/prisma.service.js'
import {
  LIFE_SAFETY_COMPLIANCE_KINDS,
  MAINTENANCE_COMPLIANCE_KINDS,
} from '../facilities/dto/create-maintenance.dto.js'
import { isEvaluationOverdue, isInspectionOverdue } from './twin-contract.js'
import { AccreditationService, type StandardPublic } from '../accreditation/accreditation.service.js'
import { AccreditationReadinessService } from '../accreditation/readiness.service.js'
import { AccreditationEvidenceReadinessService } from '../accreditation/evidence-readiness.service.js'
import { buildDomainMap, type CatalogDomainRow } from '../accreditation/domain-map.js'
import type { DomainWeightIndex } from './fact-domains.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase E — THE REGISTER VIEW: the second argument to `deriveTwin`.
//
// The pure engine is handed a school's ACCREDITATION REGISTER on two axes at
// once, because the rules genuinely read both:
//
//   standards[]      the STANDARD axis — one row per school standard, with its
//                    rubric score, its assurance gate result, its evidence count,
//                    its domain weights, its bound metric keys, and the
//                    per-requirement currency FOR THAT STANDARD.
//
//   evidenceGroups[] the ARTIFACT axis — Phase C's payoff line: one audit, nine
//                    standards. FIN-AUDIT-STALE, EVI-STALE and
//                    EVI-MISSING-REQUIRED are facts about an ARTIFACT, not about
//                    a standard, and re-deriving tag currency from per-standard
//                    rows would be a second copy of computeRequirementCurrency —
//                    the precise defect `getCurrencyByStandard` exists to prevent.
//
// FOUR READS AND NOT ONE MORE. Every field below already belongs to a service
// that owns it, and none of it is recomputed here:
//
//   • the standards tree            AccreditationService.listStandards — which
//     already resolves the catalog columns (isAssurance, domainKey,
//     domainWeights, signalKeys), so THIS FILE ISSUES NO CATALOG QUERY. The rows
//     are re-shaped into `CatalogDomainRow`s and pushed back through the SAME
//     `buildDomainMap` every other surface uses: one >= 0.5 rule, never a second.
//   • the assurance gate results    AccreditationReadinessService (computeAssurances)
//   • per-standard currency         AccreditationEvidenceReadinessService.getCurrencyByStandard
//   • per-artifact currency         …getEvidenceReadiness — the SAME build, projected
//     on the other axis, which is exactly why Phase C exposes both projections.
//
// FAIL-SOFT PER SOURCE, AND NEVER PER-VIEW. A standards read that throws costs
// the standards slice; an evidence read that throws costs the evidence slice.
// Each degradation is HONEST downstream — a rule with `needsRegister` and zero
// standards reports `no_standards`, which is a truthful "we could not look", not
// a silent pass. This service NEVER throws.
//
// WHY IT LIVES IN apps/api/src/twin/ AND NOT IN accreditation/: the module rule.
// TwinModule imports AccreditationModule; AccreditationModule must never import
// TwinModule. Putting this file the other side of that edge would create the
// cycle the whole phase is arranged to avoid.
// ─────────────────────────────────────────────────────────────────────────────

/** Frameworks the Phase-E rule catalog carries standard codes for. */
const KNOWN_FRAMEWORK_CODES = new Set(['cognia_2022', 'msa_cess_2022', 'nsbecs'])

function isoDate(d: Date | null | undefined): string | null {
  if (!d) return null
  return d.toISOString().slice(0, 10)
}

/**
 * AIC Phase F — the ONE normalisation applied to a cited standard code, on BOTH
 * sides of the comparison: `trim()` + `toUpperCase()` and NOTHING ELSE.
 *
 * No prefix match, no substring match, no Levenshtein, no "COG-A3 ≈ COG-3", no
 * separator normalising, no framework-prefix stripping. `citedStandardCode` is free
 * text lifted from a PDF, and a citation matched to the WRONG standard is worse
 * than an unmatched one — so an unmatched code never reaches this view at all. It
 * is shown AS UNMATCHED on the register endpoint instead, never dropped.
 */
function normaliseCode(code: string): string {
  return code.trim().toUpperCase()
}

/** Whole UTC days between two yyyy-mm-dd dates (b - a); 0 on an unparseable input. */
function daysBetweenIso(a: string, b: string): number {
  const ca = toCivil(a)
  const cb = toCivil(b)
  if (!ca || !cb) return 0
  return daysFromCivil(cb.y, cb.m, cb.d) - daysFromCivil(ca.y, ca.m, ca.d)
}

/** An empty-but-COMPLETE view. A degraded read is a SHAPE, never a null. */
export function emptyTwinRegister(): TwinRegisterView {
  return {
    frameworkCode: null,
    standards: [],
    evidenceGroups: [],
    // AIC Phase F. `[]` and `null` are the DEGRADED shapes, and they are not the
    // same statement: an empty citation array with an `available` signal is a
    // legitimate PASS ("you have a visit history and nothing is open"), while a
    // null summary makes the rule refuse `value_not_usable` rather than invent a
    // zero. The signal is what gates each rule; these carry the structure.
    priorVisitCitations: [],
    staffEvaluations: null,
    complianceInspections: null,
    demoData: false,
    snapshotAsOf: null,
  }
}

/**
 * The register view PLUS the domain-weight index the API side needs for
 * `resolvePrimaryDomains`.
 *
 * They travel together deliberately. The weights are derived from the very rows
 * the view is built from, in one pass, so the map and the view can never describe
 * two different populations read a millisecond apart — the same defect
 * `getCurrencyByStandard` was introduced to prevent on the currency axis.
 *
 * The index is keyed by BOTH school-standard id and standard CODE, because a rule
 * declares its `standardTags` in whichever vocabulary suits it. `buildDomainMap`
 * stays the single authority for the weights themselves; this only adds an alias.
 */
export interface TwinRegisterBuild {
  register: TwinRegisterView
  weights: DomainWeightIndex
  /**
   * DID THE STANDARDS READ ACTUALLY SUCCEED?
   *
   * `build` never throws, so a transient failure of `listStandards` and a school
   * that genuinely has no standards both arrive here as an empty register — and
   * they are not the same fact. Every rule needs a school standard code (G3), so
   * an unreadable register makes EVERY rule refuse, which looks identical to
   * "everything stopped firing". Downstream, the nightly reconciliation's
   * stopped-firing sweep would then clear the school's whole ledger stamped
   * `resolutionKind: 'improved'` — the live signals are healthy, so `resolutionFor`
   * has no way to tell either. `false` means the read failed; `true` means the
   * register is what it says it is, including legitimately empty.
   */
  registerAvailable: boolean
}

@Injectable()
export class TwinRegisterService {
  private readonly logger = new Logger(TwinRegisterService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly accreditation: AccreditationService,
    private readonly readiness: AccreditationReadinessService,
    private readonly evidenceReadiness: AccreditationEvidenceReadinessService,
  ) {}

  /** One school's register, on both axes, plus its domain weights. NEVER throws. */
  async build(schoolId: string, now: Date = new Date()): Promise<TwinRegisterBuild> {
    const [
      standardsRes,
      readinessRes,
      byStandardRes,
      evidenceRes,
      snapshotAsOf,
      staffEvaluations,
      complianceInspections,
      citationRows,
    ] = await Promise.all([
      this.accreditation.listStandards(schoolId, now).catch((err) => {
        this.logger.warn(`twin register: standards read failed: ${(err as Error).message}`)
        return null
      }),
      this.readiness.getReadiness(schoolId, {}, now).catch(() => null),
      this.evidenceReadiness.getCurrencyByStandard(schoolId, {}, now).catch(() => null),
      this.evidenceReadiness.getEvidenceReadiness(schoolId, {}, now).catch(() => null),
      this.snapshotAsOf(schoolId),
      // AIC Phase F — three more fail-soft-per-source reads. Each degrades to the
      // shape that makes its rule REFUSE, never to one that makes it pass.
      this.staffEvaluationSummary(schoolId, now),
      this.complianceInspectionSummary(schoolId, now),
      this.priorVisitRows(schoolId),
    ])

    // The read FAILED (null) vs the school genuinely has no standards ([]) — one
    // boolean, carried out so callers with authority over the ledger can tell.
    const registerAvailable = standardsRes !== null
    const rows: StandardPublic[] = standardsRes?.standards ?? []
    if (rows.length === 0) {
      return {
        register: {
          ...emptyTwinRegister(),
          snapshotAsOf,
          // The summaries survive an empty STANDARDS register: they describe HR and
          // facilities, not accreditation. Every rule that reads them still needs a
          // school standard code (G3), so nothing can fire off them here — but a
          // truthful summary is never thrown away on the way past.
          staffEvaluations,
          complianceInspections,
        },
        weights: {},
        registerAvailable,
      }
    }

    // ── Assurance SATISFACTION. `computeAssurances` (reached through the
    //    readiness read) is the ONE authority on whether a binary gate is met;
    //    re-deriving "evidenceCount > 0" here would be a second copy of that rule.
    //    A degraded readiness read leaves satisfaction UNKNOWN (null), which the
    //    engine treats as "cannot say" — never as an unmet gate.
    const satisfiedById = new Map<string, boolean>()
    for (const a of readinessRes?.assurances ?? []) satisfiedById.set(a.standardId, a.satisfied)

    const { weights, signalKeys } = this.domainBindings(rows)
    const byStandard = byStandardRes?.byStandard ?? {}

    const standards: TwinStandardView[] = rows.map((s) => {
      const w = weights[s.id] ?? {}
      return {
        standardId: s.id,
        code: s.code,
        title: s.title,
        isAssurance: s.isAssurance === true,
        assuranceSatisfied:
          s.isAssurance === true && satisfiedById.has(s.id) ? satisfiedById.get(s.id)! : null,
        rubricScore: s.rubricScore ?? null,
        evidenceCount: s.evidenceCount,
        domainKeys: DOMAIN_KEYS.filter((d) => (w[d] ?? 0) >= SIGNAL_ATTRIBUTION_MIN_WEIGHT),
        primaryDomainKey: this.primaryDomainFor(w),
        boundMetricKeys: signalKeys[s.id] ?? [],
        requirements: (byStandard[s.id] ?? []).map((r) => this.toRequirementView(r)),
      }
    })

    // ── The ARTIFACT axis. `servesAssurance` is precomputed HERE, not in the pure
    //    engine, because it needs the register's own assurance flags.
    const assuranceIds = new Set(rows.filter((r) => r.isAssurance === true).map((r) => r.id))
    const evidenceGroups: TwinEvidenceGroupView[] = (evidenceRes?.groups ?? []).map((g) => ({
      tag: g.tag,
      label: g.label,
      state: g.state as CurrencyState,
      dataAvailability: g.dataAvailability as DataAvailability,
      expiresOn: g.expiresOn,
      daysUntilExpiry: g.daysUntilExpiry,
      servesStandards: g.servesStandards.map((s) => ({ standardId: s.standardId, code: s.code })),
      servesAssurance: g.servesStandards.some((s) => assuranceIds.has(s.standardId)),
    }))

    return {
      register: {
        frameworkCode: this.frameworkCodeFrom(
          readinessRes?.framework?.code ?? evidenceRes?.framework?.code ?? null,
        ),
        standards,
        evidenceGroups,
        // AIC Phase F — matched HERE, against the standards this same build already
        // read, so the codes the engine is handed are the school's own verbatim.
        priorVisitCitations: this.matchCitations(citationRows, rows),
        staffEvaluations,
        complianceInspections,
        // Demo provenance is a property of the SERIES and is INHERITED, never set.
        demoData: evidenceRes?.demoData ?? byStandardRes?.demoData ?? false,
        snapshotAsOf,
      },
      weights: this.weightIndex(rows, weights),
      registerAvailable,
    }
  }

  /**
   * The weight map, aliased by standard CODE as well as by id. A duplicate code
   * (the register tolerates them) keeps the FIRST binding, so the alias is
   * deterministic rather than last-write-wins — the same rule the reconciliation's
   * own index applies.
   */
  private weightIndex(
    rows: readonly StandardPublic[],
    weights: Record<string, Readonly<Partial<Record<DomainKey, number>>>>,
  ): DomainWeightIndex {
    const index: Record<string, Readonly<Partial<Record<DomainKey, number>>>> = { ...weights }
    for (const s of rows) {
      const w = weights[s.id]
      if (w && !(s.code in index)) index[s.code] = w
    }
    return index
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private toRequirementView(r: RequirementCurrency): TwinRequirementView {
    return {
      tag: r.tag,
      label: r.label,
      state: r.state,
      dataAvailability: r.dataAvailability,
      expiresOn: r.expiresOn,
      daysUntilExpiry: r.daysUntilExpiry,
    }
  }

  /**
   * Domain weights + bound metric keys, through the SHARED `buildDomainMap`.
   *
   * The standards list already carries the catalog columns (AccreditationService
   * resolves them in the same read that resolves `isAssurance`), so the rows are
   * re-shaped into `CatalogDomainRow`s and normalised by the one authority rather
   * than re-queried and re-normalised here. A standard with no catalog link maps
   * to no domain, which downstream reads as "not measured", never as a zero.
   */
  private domainBindings(rows: readonly StandardPublic[]): {
    weights: Record<string, Readonly<Partial<Record<DomainKey, number>>>>
    signalKeys: Record<string, string[]>
  } {
    const catalogRows: CatalogDomainRow[] = []
    const seen = new Set<string>()
    for (const r of rows) {
      const id = r.catalogStandardId
      if (!id || seen.has(id)) continue
      seen.add(id)
      catalogRows.push({
        id,
        isAssurance: r.isAssurance,
        domainKey: r.domainKey,
        domainWeights: r.domainWeights,
        signalKeys: r.signalKeys,
      })
    }
    const { map, signalKeys } = buildDomainMap(
      rows.map((r) => ({ id: r.id, catalogStandardId: r.catalogStandardId })),
      catalogRows,
    )
    return { weights: map, signalKeys }
  }

  /**
   * The standard's PRIMARY domain — the heaviest weight, with DOMAIN_KEYS order as
   * the frozen tie-break (the same rule `resolvePrimaryDomains` applies to a fact,
   * applied here to one row). `DOMAIN_KEYS[0]` when nothing maps: the engine only
   * ever consults this as a last-resort fallback, and a hand-made standard still
   * has to land somewhere deterministic.
   */
  private primaryDomainFor(w: Readonly<Partial<Record<DomainKey, number>>>): DomainKey {
    let best: DomainKey = DOMAIN_KEYS[0]
    let bestVal = -Infinity
    for (const d of DOMAIN_KEYS) {
      const v = w[d]
      if (typeof v !== 'number' || !Number.isFinite(v)) continue
      if (v > bestVal) {
        best = d
        bestVal = v
      }
    }
    return best
  }

  /** Only the three frameworks the rule catalog carries codes for; else null. */
  private frameworkCodeFrom(code: string | null): string | null {
    if (!code) return null
    return KNOWN_FRAMEWORK_CODES.has(code) ? code : null
  }

  // ── AIC Phase F — the three registers the new rules read ───────────────────
  //
  // WHY THEY ARE READ HERE AND NOT CARRIED OFF THE SIGNAL SET: a `TwinSignal`
  // carries ONE SCALAR, and these rules need a basis chain (a register size, the
  // age of the oldest overdue row, the distinct kinds overdue) and, for the
  // citations, per-STANDARD structure. The REGISTER axis is where per-standard
  // structure belongs — it is the axis `deriveTwin` already takes for exactly this
  // reason. The arithmetic itself is NOT duplicated: both overdue predicates are
  // imported from twin-contract.ts, the one place they are defined, so the count a
  // rationale renders and the count that gated the rule can never disagree.
  //
  // ADULT-STAFF PII: `staffEvaluationSummary` selects three date/status columns and
  // publishes THREE INTEGERS. No person, no evaluator, no cycle label, no id.

  /** THREE INTEGERS, or null when the register is unreadable or empty. */
  private async staffEvaluationSummary(
    schoolId: string,
    now: Date,
  ): Promise<TwinStaffEvaluationSummaryView | null> {
    try {
      const rows = await this.prisma.staffEvaluation.findMany({
        where: { schoolId },
        select: { dueDate: true, completedDate: true, status: true },
      })
      if (rows.length === 0) return null
      const today = isoDate(now) as string
      const overdue = rows.filter((r) => isEvaluationOverdue(r, today))
      // The OLDEST still-overdue row, in days past ITS OWN recorded due date. 0 when
      // none is overdue — a real reading, not a missing one.
      let oldest = 0
      for (const r of overdue) {
        const days = daysBetweenIso(isoDate(r.dueDate) as string, today)
        if (days > oldest) oldest = days
      }
      return { registerSize: rows.length, overdueCount: overdue.length, oldestOverdueDays: oldest }
    } catch {
      // Unreadable is NOT "zero overdue". Null makes the rule refuse.
      return null
    }
  }

  /** The compliance-inspection subset of the facilities register, as counts. */
  private async complianceInspectionSummary(
    schoolId: string,
    now: Date,
  ): Promise<TwinComplianceInspectionSummaryView | null> {
    try {
      const rows = await this.prisma.maintenanceItem.findMany({
        // `complianceKind IS NOT NULL` is the whole filter. The kind is DECLARED by
        // the school; it is never guessed from `title`, `category` or `location`.
        where: { schoolId, complianceKind: { not: null } },
        select: { status: true, targetDate: true, complianceKind: true },
      })
      if (rows.length === 0) return null
      const today = isoDate(now) as string
      const overdue = rows.filter((r) => isInspectionOverdue(r, today))
      let oldest = 0
      for (const r of overdue) {
        const days = daysBetweenIso(isoDate(r.targetDate) as string, today)
        if (days > oldest) oldest = days
      }
      // DISTINCT kinds among the OVERDUE items, in the frozen vocabulary order —
      // never in row order, which would make the rendered sentence depend on
      // insertion sequence. A kind outside the vocabulary cannot occur (the DTO's
      // @IsIn is the only writer) and is dropped rather than printed raw.
      const seen = new Set(overdue.map((r) => r.complianceKind))
      const overdueKinds = MAINTENANCE_COMPLIANCE_KINDS.filter((k) => seen.has(k))
      const lifeSafety = new Set<string>(LIFE_SAFETY_COMPLIANCE_KINDS)
      return {
        trackedCount: rows.length,
        overdueCount: overdue.length,
        oldestOverdueDays: oldest,
        overdueKinds,
        anyLifeSafety: overdueKinds.some((k) => lifeSafety.has(k)),
      }
    } catch {
      return null
    }
  }

  /** The raw prior-visit rows. `[]` on any read failure — fail-soft per source. */
  private async priorVisitRows(
    schoolId: string,
  ): Promise<{ visitDate: Date; status: string; citedStandardCode: string }[]> {
    try {
      return await this.prisma.priorVisitFinding.findMany({
        where: { schoolId },
        // The free-text `text` of a citation is NOT read here and never enters the
        // twin payload (which feeds the briefing, Penny and every export). The
        // register endpoint is where a school reads what the team actually wrote.
        select: { visitDate: true, status: true, citedStandardCode: true },
      })
    } catch {
      return []
    }
  }

  /**
   * OPEN citations, matched to the school's OWN standards by EXACT EQUALITY after
   * trim + uppercase, grouped by (CODE, VISIT DATE), sorted by code then date.
   *
   * THE VISIT IS PART OF THE KEY, and that is the whole point. Grouping by code
   * alone and quoting the newest date would render "2 citations against COG-A4
   * from the visit of 12 March 2021" for a school whose 2015 team wrote one of
   * them — a sentence out-running its own arithmetic, which is exactly the class
   * of claim Phase E had rewritten in review. One group = one code + one visit, so
   * `openCount` and `visitDate` are true about the same set of rows.
   *
   * A row with an unreadable `visitDate` is DROPPED rather than grouped under an
   * empty date: the rule's only sentence names the visit, and "the visit of " is
   * not a sentence. The register endpoint still shows the row.
   *
   * An UNMATCHED citation never reaches this array: G3 forbids a finding that
   * cannot name a real standard code, and fuzzy-matching one into a standard the
   * visiting team did not cite would be worse than saying nothing. It is not
   * dropped from the product — the register endpoint returns every row with
   * `unmatched: true` and its own frozen sentence.
   *
   * The emitted `code` is the SCHOOL STANDARD's code VERBATIM, not the normalised
   * form: the engine renders it into a sentence a head of school reads.
   */
  private matchCitations(
    rows: readonly { visitDate: Date; status: string; citedStandardCode: string }[],
    standards: readonly StandardPublic[],
  ): TwinPriorVisitCitationView[] {
    if (rows.length === 0 || standards.length === 0) return []
    const codeByNormalised = new Map<string, string>()
    for (const s of standards) {
      const n = normaliseCode(s.code)
      // A duplicate code keeps the FIRST binding — deterministic rather than
      // last-write-wins, the same rule `weightIndex` applies.
      if (!codeByNormalised.has(n)) codeByNormalised.set(n, s.code)
    }

    const grouped = new Map<string, TwinPriorVisitCitationView>()
    for (const r of rows) {
      if (r.status !== 'open') continue
      const code = codeByNormalised.get(normaliseCode(r.citedStandardCode))
      if (code === undefined) continue
      const visitDate = isoDate(r.visitDate)
      if (visitDate === null) continue
      const key = `${code}@${visitDate}`
      const hit = grouped.get(key)
      if (!hit) {
        grouped.set(key, { code, visitDate, openCount: 1 })
        continue
      }
      hit.openCount += 1
    }
    // Determinism: the reconciliation hashes this payload. Code first, then the
    // visit — so a standard cited twice reads oldest-visit-first, in date order.
    return [...grouped.values()].sort(
      (a, b) => a.code.localeCompare(b.code) || a.visitDate.localeCompare(b.visitDate),
    )
  }

  /**
   * The newest readiness snapshot's date. Same discipline as Phase D's signal
   * set: a finding cites a reading that actually exists, never today's date.
   */
  private async snapshotAsOf(schoolId: string): Promise<string | null> {
    try {
      const row = await this.prisma.accreditationReadinessSnapshot.findFirst({
        where: { schoolId },
        orderBy: { snapshotDate: 'desc' },
        select: { snapshotDate: true },
      })
      return isoDate(row?.snapshotDate ?? null)
    } catch {
      return null
    }
  }
}
