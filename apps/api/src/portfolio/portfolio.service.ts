import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import type { MembershipRole, User } from '@finrep/db'
import {
  assessTrajectoryComparability,
  computePortfolio,
  isDomainKey,
  PORTFOLIO_PRIORITY_VERSION,
  scoreDomainExposure,
  scoreEarlyWarning,
  scoreEvidenceCurrency,
  scoreImprovement,
  scoreReadinessLevel,
  scoreTrajectory,
  trajectoryBaselineCutoff,
  type PortfolioComponentInput,
  type PortfolioComponentKey,
  type PortfolioInsufficientRow,
  type PortfolioResult,
  type PortfolioRow,
  type PortfolioSchoolInput,
  type PortfolioWeakestDomain,
  type TrajectoryReading,
} from '@finrep/compliance'
import {
  computePeerStats,
  DEFAULT_PEER_DIMS,
  resolvePeerGroup,
  sampleTierOf,
  type MatchTier,
  type PeerDim,
  type PeerProfile,
} from '@finrep/analytics'
import { PrismaService } from '../prisma/prisma.service.js'
import { BillingService } from '../billing/billing.service.js'
import { READINESS_DISCLAIMER } from '../accreditation/readiness-history.service.js'
import { STALE_INITIATIVE_DAYS } from '../strategy/strategy.constants.js'
import { MIN_PROJECTION_SPAN_DAYS } from '../improvement/improvement-progress.js'
import {
  availableLensesFor,
  clampLens,
  widestOrgRole,
  type Lens,
} from '../analytics/briefing-lens.js'
import { mapWithConcurrency, ORG_FANOUT_CONCURRENCY } from '../common/concurrency.js'
import { shapeForLens } from './portfolio-lens.js'
import {
  readBaselineSnapshots,
  readCatalogLinkedStandards,
  readCatalogStandards,
  readEvidenceCounts,
  readFrameworks,
  readInitiatives,
  readLatestEnrollment,
  readLatestSnapshots,
  readNextReviewDays,
  readOpenFindings,
  readProgressEvents,
  type FindingRow,
  type FrameworkRow,
  type InitiativeRow,
  type SnapshotRow,
} from './portfolio-reads.js'
import type { PortfolioQueryDto } from './dto/portfolio-query.dto.js'
import type { PortfolioStandardsQueryDto } from './dto/portfolio-standards-query.dto.js'
import { DEFAULT_VELOCITY_WINDOW_DAYS, type VelocityQueryDto } from './dto/velocity-query.dto.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase I — THE SUPERINTENDENT PORTFOLIO.
//
// ONE PAGE THAT ANSWERS FOUR QUESTIONS for a whole diocese: which schools need
// attention AND WHY IN WORDS, which schools we cannot honestly rank AND WHAT IS
// MISSING, which single standard is weak at enough schools to justify one diocesan
// workshop instead of nine school projects, and whether the improvement work
// already adopted is actually moving.
//
// ── THE THING THIS SERVICE MUST NEVER DO ─────────────────────────────────────
// No live twin, no live readiness, no live briefing, computed per school across an
// organization. A live twin collects 36 signals and evaluates 29 rules; forty of
// them is a connection-pool exhaustion and a P2024 before anything returns. This
// service therefore injects PrismaService and BillingService and NOTHING ELSE —
// no TwinService, no AccreditationReadinessService, no BriefingService, no
// EvidenceReadinessService, no VisitService — and reads persisted snapshots and
// persisted ledgers through the fixed query budget in portfolio-reads.ts. Spec
// API-6 asserts that over this file's source text, because the failure mode is an
// innocent-looking `constructor(private readonly twin: TwinService)` in six
// months' time.
//
// ── WHAT IT ADDS TO WHAT IS ALREADY PERSISTED: NOTHING ───────────────────────
// Phase I adds ZERO tables, ZERO columns, ZERO indexes and ZERO migrations, and I
// agree with that explicitly. Readiness level, the documented/defensible pair, the
// band, the leaf counts, the domain exposure and the evidence-currency definition
// in force are all columns on AccreditationReadinessSnapshot. The early-warning
// load is the Phase-D findings ledger. The improvement response is Phase G's
// initiative + progress-event tables. The comparable standard identity is
// `AccreditationStandard.catalogStandardId`. If a column looks missing, the answer
// is a NAMED ABSENCE in the payload, never DDL.
// ─────────────────────────────────────────────────────────────────────────────

/** The per-school licence this whole surface is gated on. */
const ACCREDITATION_MODULE = 'accreditation'

/**
 * Peers below this count get a RANK but no PERCENTILE (acceptance 5).
 *
 * Re-exported from @finrep/analytics rather than declared here: the peer
 * benchmark surface had NO such gate and was quoting "100th pctile" over a group
 * of two, so the two surfaces are now the same number by construction.
 */
export { MIN_PEERS_FOR_PERCENTILE } from '@finrep/analytics'
// …and imported for use inside this file (a re-export creates no local binding).
import { MIN_PEERS_FOR_PERCENTILE } from '@finrep/analytics'

/**
 * The rubric score at or below which a standard is "below the improvement
 * threshold". Emitted as a NUMBER: the API does not invent a rubric label table —
 * `rubricLabels` lives on the framework and the web renders the word from its
 * existing picker. One source of label truth.
 */
export const INTERVENTION_THRESHOLD_SCORE = 2

/**
 * THE SENTINEL `seriesKey` FOR A SCHOOL WITH NO FRAMEWORK.
 *
 * `AccreditationReadinessSnapshot.seriesKey` is documented as
 * `framework.code | 'none'` (schema.prisma:1659), so a school that has adopted no
 * framework still writes a snapshot — under the literal string `'none'`. Treating
 * that as a framework CODE makes "these schools follow 2 different accreditation
 * frameworks" a false sentence about an org where only one school has a framework
 * at all, prints the word "none" where a framework name goes, and makes the pure
 * engine's purpose-built `UNKNOWN_FRAMEWORK_NOTE` branch unreachable.
 */
const NO_FRAMEWORK_SERIES_KEY = 'none'

/**
 * The frozen sentence naming what this product cannot see about prior-visit
 * citations. Emitted on every ranked portfolio because the absence is permanent,
 * not situational: no table in this schema records a citation RESPONSE DUE DATE.
 */
export const CITATION_NOT_ASSESSED_NOTE =
  'A due date for responding to a prior-visit citation is not recorded anywhere in this product, ' +
  'so "citation response overdue" is not assessed for any school here. It is reported as not ' +
  'assessed rather than as no.'

/** Initiative statuses that are finished or abandoned — never overdue, never stale. */
const CLOSED_INITIATIVE_STATUSES: ReadonlySet<string> = new Set(['done', 'cancelled'])

const DAY_MS = 86_400_000

/** yyyy-mm-dd for a Date, in UTC — the house civil-day convention. */
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** UTC midnight for a yyyy-mm-dd string. */
function civilDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

/** Whole civil days from a to b (negative when b is before a). */
function daysBetween(a: Date, b: Date): number {
  return Math.round((civilDate(isoDay(b)).getTime() - civilDate(isoDay(a)).getTime()) / DAY_MS)
}

/**
 * A component the service knows, with the phrase naming where the number came from.
 *
 * `score` always arrives from one of `@finrep/compliance`'s six exported scorers.
 * NOTHING IN THIS FILE RE-TYPES `100 - verifiedPct` OR ANY OTHER COMPONENT
 * FORMULA: every score is 0..100 where HIGHER MEANS MORE ATTENTION NEEDED, this is
 * an attention score and not a health score, and inverting one by hand in a service
 * is the most likely silent defect on the whole path. The direction of each scale
 * is a property of the portfolio contract and it lives with the contract.
 */
function knownComponent(score: number, basis: string): PortfolioComponentInput {
  return { known: true, score, basis, reason: null }
}

/** A component the service does NOT know, with the reason it will be named by. */
function unknownComponent(reason: string): PortfolioComponentInput {
  return { known: false, score: null, basis: null, reason }
}

/**
 * A scorer's answer, turned into a component. `null` from a scorer means "cannot
 * be scored" and becomes UNKNOWN WITH A REASON — never a plausible number.
 */
function fromScore(
  score: number | null,
  basis: string,
  reason: string,
): PortfolioComponentInput {
  return score === null ? unknownComponent(reason) : knownComponent(score, basis)
}

export interface PortfolioPeerPanel {
  peerCount: number
  /**
   * The schools this panel's `peerCount`, `rank` and `percentile` were computed
   * over — `resolvePeerGroup`'s own members, which is a SUBSET of the ranked org.
   *
   * Exposed because a consumer that wants to list the peers has otherwise no way to
   * reconstruct the group, and the one that tried listed every ranked school in the
   * organization beside a `peerCount` that described three of them. `peerIds.length`
   * is `peerCount` by construction.
   */
  peerIds: string[]
  matchTier: MatchTier
  activeDims: PeerDim[]
  relaxedDims: PeerDim[]
  /** READINESS rank inside the peer group: 1 = highest verifiedPct = BEST. Note this
   *  is the OPPOSITE polarity to `PortfolioRow.rank`, which is the org-wide ATTENTION
   *  rank where 1 = needs the most attention. */
  rank: number
  /** NULL whenever peerCount < MIN_PEERS_FOR_PERCENTILE. Never computed downstream. */
  percentile: number | null
  sample: ReturnType<typeof sampleTierOf>
}

export type PortfolioRankedRow = PortfolioRow & { peers: PortfolioPeerPanel | null }

/**
 * A school EXCLUDED BY THE `?frameworkCode=` FILTER — not a school we cannot
 * measure.
 *
 * These two are different facts and this payload refuses to merge them. A fully
 * measured MSA school, viewed through `?frameworkCode=cognia_2022`, used to land
 * in `insufficientData[]` with the NAMED reasons `no_readiness_snapshot` and
 * `no_latest_reading` — every one of which is false of a school with a current
 * nightly snapshot — under a heading that reads "missing too much for a rank to
 * mean anything". A superintendent was pointed at a capture failure that did not
 * exist. The filter is a VIEW CHOICE the caller made; saying so is the honest
 * encoding.
 */
export interface PortfolioOtherFrameworkRow {
  schoolId: string
  name: string
  frameworkCode: string | null
  frameworkName: string | null
}

export interface PortfolioResponse {
  orgId: string
  generatedAt: string
  asOf: string
  lens: Lens
  callerRole: Lens
  availableLenses: Lens[]
  schoolCount: number
  rankedCount: number
  indexComparable: boolean
  bandDistribution: PortfolioResult['bandDistribution']
  ranked: PortfolioRankedRow[]
  insufficientData: PortfolioInsufficientRow[]
  /** NAME ONLY. No readiness, no band, no score, no counts, no confidence. */
  notLicensed: { schoolId: string; name: string }[]
  /** Measured, but on ANOTHER framework than the one the caller filtered to. */
  otherFramework: PortfolioOtherFrameworkRow[]
  notes: string[]
  engineVersion: string
  disclaimer: string
}

/**
 * One in-org school, carrying exactly the columns this phase reads: its name and
 * the five peer-profile dimensions `peers.ts` already understands. `PeriodOperational
 * Data.enrollment` — the sixth — is fetched in the bounded pair of reads, never per
 * school.
 */
export interface OrgSchool {
  id: string
  name: string
  role: MembershipRole
  county: string | null
  district: string | null
  schoolType: string | null
  gradeLow: string | null
  gradeHigh: string | null
}

export interface OrgScope {
  orgRole: Lens
  schools: OrgSchool[]
  /** schoolId → the caller's role at that school, for the bulk-adopt write check. */
  roleBySchool: Map<string, MembershipRole>
}

@Injectable()
export class PortfolioService {
  private readonly logger = new Logger(PortfolioService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  // ── ORG RESOLUTION + TENANCY ───────────────────────────────────────────────
  /**
   * Query 1 + 2 of the budget. Verbatim in shape from OrgBriefingService: the
   * caller's ACTIVE memberships are the only tenancy boundary in this phase, and
   * no query below ever widens past the school ids resolved here.
   */
  async resolveOrgScope(user: User, orgId: string): Promise<OrgScope> {
    const memberships = await this.prisma.membership.findMany({
      where: { userId: user.id, status: 'active' },
      include: { school: true },
    })
    if (memberships.length === 0) {
      throw new NotFoundException('You do not belong to an organization yet.')
    }
    const inOrg = memberships.filter((m) => m.school.organizationId === orgId)
    if (inOrg.length === 0) {
      throw new ForbiddenException('You do not have access to this organization.')
    }
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } })
    if (!org) throw new NotFoundException('Organization not found.')

    const byId = new Map<string, OrgSchool>()
    const roleBySchool = new Map<string, MembershipRole>()
    for (const m of inOrg) {
      // A user can hold more than one membership row at a school; the WIDEST wins,
      // by exactly the rule the org lens ceiling uses. Two definitions of "what may
      // this caller do here" is how an authorization check ends up disagreeing with
      // the lens that shaped the page it was clicked from.
      const existing = roleBySchool.get(m.school.id)
      const widest = existing ? widestOrgRole([existing, m.role]) : m.role
      roleBySchool.set(m.school.id, widest)
      byId.set(m.school.id, {
        id: m.school.id,
        name: m.school.name,
        role: widest,
        county: m.school.county,
        district: m.school.district,
        schoolType: m.school.schoolType,
        gradeLow: m.school.gradeLow,
        gradeHigh: m.school.gradeHigh,
      })
    }
    // Deterministic school order feeds a deterministic payload; the comparator's
    // final key makes it irrelevant to RANKING, but it also fixes the order of
    // notLicensed[] and every fixed-budget `in` clause.
    const schools = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

    return {
      orgRole: widestOrgRole(inOrg.map((m) => m.role)),
      schools,
      roleBySchool,
    }
  }

  /**
   * Per-school `accreditation` entitlement, through the limiter and FAIL-CLOSED.
   *
   * A read error is `false`, not `true`: the safe direction for an entitlement
   * check is to disclose less. Mirrors improvement.service.ts. Bounded at four in
   * flight because this is the one place the portfolio touches something per
   * school at all.
   */
  async resolveLicensed(schoolIds: readonly string[]): Promise<Set<string>> {
    const settled = await mapWithConcurrency(schoolIds, ORG_FANOUT_CONCURRENCY, (id) =>
      this.billing.isEntitledForModule(id, ACCREDITATION_MODULE),
    )
    const out = new Set<string>()
    settled.forEach((res, i) => {
      if (res.status === 'fulfilled') {
        if (res.value) out.add(schoolIds[i])
      } else {
        this.logger.warn(
          `entitlement read failed for school ${schoolIds[i]}; treating as NOT licensed`,
        )
      }
    })
    return out
  }

  // ── 1. THE PORTFOLIO ───────────────────────────────────────────────────────

  async getPortfolio(
    user: User,
    orgId: string,
    query: PortfolioQueryDto,
  ): Promise<PortfolioResponse> {
    const generatedAt = new Date().toISOString()
    const today = civilDate(isoDay(new Date()))
    const asOf = isoDay(today)

    const scope = await this.resolveOrgScope(user, orgId)
    const lens = clampLens(scope.orgRole, query.lens)

    const allIds = scope.schools.map((s) => s.id)
    const licensed = await this.resolveLicensed(allIds)
    const licensedSchools = scope.schools.filter((s) => licensed.has(s.id))
    const licensedIds = licensedSchools.map((s) => s.id)

    // ACCEPTANCE 3. An unlicensed school is resolved to a NAME and then never
    // appears in another query. There is no readiness to accidentally leak
    // downstream because none was ever read.
    const notLicensed = scope.schools
      .filter((s) => !licensed.has(s.id))
      .map((s) => ({ schoolId: s.id, name: s.name }))

    // The 90-day cutoff is derived by the PURE package, not subtracted again here.
    // The alternative is the same arithmetic typed twice, and the two copies
    // disagreeing is a trajectory drawn across the wrong baseline.
    const baselineDay = civilDate(trajectoryBaselineCutoff(asOf) ?? asOf)

    // THE FIXED QUERY BUDGET. Every one of these is set-based over `licensedIds`.
    // Run in parallel: they are independent reads, and the count — not the
    // wall-clock — is what the pool cares about.
    const [latestRows, baselineRows, findings, initiatives, reviewDates, enrollment] =
      await Promise.all([
        readLatestSnapshots(this.prisma, licensedIds).catch((e: unknown) => {
          this.logger.warn(`portfolio: readiness snapshots unreadable: ${String(e)}`)
          return null
        }),
        readBaselineSnapshots(this.prisma, licensedIds, baselineDay).catch(() => null),
        readOpenFindings(this.prisma, licensedIds).catch((e: unknown) => {
          this.logger.warn(`portfolio: findings ledger unreadable: ${String(e)}`)
          return null
        }),
        readInitiatives(this.prisma, licensedIds).catch(() => null),
        readNextReviewDays(this.prisma, licensedIds, today).catch(
          () => new Map<string, Date>(),
        ),
        readLatestEnrollment(this.prisma, licensedIds).catch(
          () => new Map<string, number | null>(),
        ),
      ])

    const frameworkIds = [
      ...new Set((latestRows ?? []).map((r) => r.frameworkId).filter((v): v is string => !!v)),
    ].sort()
    const frameworks = await readFrameworks(this.prisma, frameworkIds).catch(
      () => [] as FrameworkRow[],
    )
    const frameworkById = new Map(frameworks.map((f) => [f.id, f]))

    // ── THE FRAMEWORK FILTER PARTITIONS; IT DOES NOT DEGRADE ─────────────────
    // A school measured on ANOTHER framework is excluded from the inputs and said
    // to be excluded, by name, with its own framework named. It is NOT pushed
    // through the scorers with every component unknown, which would report it as
    // "missing too much to rank" with reasons that are false of it.
    const inputs: PortfolioSchoolInput[] = []
    const otherFramework: PortfolioOtherFrameworkRow[] = []
    for (const school of licensedSchools) {
      const resolved = this.resolveSeries(
        school.id,
        latestRows ?? [],
        frameworkById,
        query.frameworkCode ?? null,
      )
      if (resolved.excludedBy) {
        otherFramework.push({
          schoolId: school.id,
          name: school.name,
          frameworkCode: resolved.excludedBy.code,
          frameworkName: resolved.excludedBy.name,
        })
        continue
      }
      inputs.push(
        this.buildSchoolInput({
          school,
          today,
          latest: resolved.latest,
          baselineRows: baselineRows ?? [],
          findings,
          initiatives,
          reviewDates,
          frameworkById,
        }),
      )
    }

    const result = computePortfolio(inputs, asOf)

    // ── PEERS (acceptance 5) ─────────────────────────────────────────────────
    const ranked = this.attachPeers(result.ranked, scope, enrollment)

    const notes = [...result.notes]
    if (notLicensed.length > 0) {
      notes.push(
        `${notLicensed.length} school(s) in this organization do not license the accreditation module and are listed by name only.`,
      )
    }
    if (otherFramework.length > 0) {
      notes.push(
        `${otherFramework.length} school(s) are measured on a different accreditation framework and are excluded by this framework filter. They are listed by name — this is a filter, not a gap in their data.`,
      )
    }
    if (latestRows === null) {
      notes.push('Readiness snapshots could not be read for this organization on this request.')
    }
    // A NAMED ABSENCE, not a silent `false`. Nothing in this product records the
    // date by which a prior-visit citation response is due — `PriorVisitFinding`
    // has open/closed and a closed date, and no due date — so "is a citation
    // response overdue" is a question we cannot answer for ANY school. It is
    // reported as `citationOverdue: null` (not assessed) rather than as `false`,
    // which would read as "we checked, and it is not".
    if (result.ranked.length > 0) {
      notes.push(CITATION_NOT_ASSESSED_NOTE)
    }

    const payload: PortfolioResponse = {
      orgId,
      generatedAt,
      asOf,
      lens,
      callerRole: scope.orgRole,
      availableLenses: availableLensesFor(scope.orgRole),
      schoolCount: scope.schools.length,
      rankedCount: result.ranked.length,
      indexComparable: result.indexComparable,
      bandDistribution: result.bandDistribution,
      ranked,
      insufficientData: result.insufficientData,
      notLicensed,
      otherFramework,
      notes,
      engineVersion: PORTFOLIO_PRIORITY_VERSION,
      // A FIRST-CLASS PAYLOAD FIELD, never UI chrome, and never re-typed here.
      disclaimer: READINESS_DISCLAIMER,
    }

    return shapeForLens(payload, lens)
  }

  /**
   * The RESOLVED SERIES for one school: newest snapshot, `seriesKey` ascending on
   * a tie — and, when the caller filtered to a framework, whether this school is
   * simply ON ANOTHER ONE.
   *
   * The distinction is the whole point. "No snapshot" and "a snapshot on a
   * framework you filtered out" are different facts; collapsing the second into
   * the first is how a fully-measured school gets reported as unmeasurable.
   */
  private resolveSeries(
    schoolId: string,
    latestRows: readonly SnapshotRow[],
    frameworkById: Map<string, FrameworkRow>,
    frameworkCode: string | null,
  ): { latest: SnapshotRow | null; excludedBy: { code: string | null; name: string | null } | null } {
    const mine = latestRows
      .filter((r) => r.schoolId === schoolId)
      .sort((a, b) => {
        const d = b.snapshotDate.getTime() - a.snapshotDate.getTime()
        if (d !== 0) return d
        return a.seriesKey < b.seriesKey ? -1 : a.seriesKey > b.seriesKey ? 1 : 0
      })
    if (mine.length === 0) return { latest: null, excludedBy: null }

    const codeOf = (r: SnapshotRow): string | null =>
      (r.frameworkId ? frameworkById.get(r.frameworkId)?.code : undefined) ??
      (r.seriesKey === NO_FRAMEWORK_SERIES_KEY ? null : r.seriesKey)

    if (!frameworkCode) return { latest: mine[0], excludedBy: null }

    const matching = mine.filter((r) => codeOf(r) === frameworkCode)
    if (matching.length > 0) return { latest: matching[0], excludedBy: null }

    // Measured — just not on the framework asked for.
    const top = mine[0]
    const fw = top.frameworkId ? frameworkById.get(top.frameworkId) : undefined
    return {
      latest: null,
      excludedBy: { code: codeOf(top), name: fw?.name ?? null },
    }
  }

  /**
   * Turn one school's persisted rows into the pure module's input.
   *
   * EVERY COMPONENT SCORE IS 0..100 WHERE HIGHER MEANS MORE ATTENTION NEEDED.
   * This is an attention score, not a health score — inverting one by mistake is
   * the most likely silent defect on this path.
   */
  private buildSchoolInput(args: {
    school: { id: string; name: string }
    today: Date
    latest: SnapshotRow | null
    baselineRows: readonly SnapshotRow[]
    findings: FindingRow[] | null
    initiatives: InitiativeRow[] | null
    reviewDates: Map<string, Date>
    frameworkById: Map<string, FrameworkRow>
  }): PortfolioSchoolInput {
    const { school, today, latest, findings, initiatives, reviewDates, frameworkById } = args
    const framework = latest?.frameworkId ? frameworkById.get(latest.frameworkId) : undefined

    const mine = (rows: FindingRow[] | null) =>
      rows === null ? null : rows.filter((f) => f.schoolId === school.id)
    const myFindings = mine(findings)
    const myInitiatives =
      initiatives === null ? null : initiatives.filter((i) => i.schoolId === school.id)

    // ── findings counts ──────────────────────────────────────────────────────
    const openFindings = { critical: 0, warn: 0, info: 0 }
    let unresponded = 0
    for (const f of myFindings ?? []) {
      if (f.severity === 'critical') openFindings.critical += 1
      else if (f.severity === 'warn') openFindings.warn += 1
      else openFindings.info += 1
      if (f.initiativeId === null) unresponded += 1
    }

    // ── initiative counts ────────────────────────────────────────────────────
    const staleBefore = new Date(today.getTime() - STALE_INITIATIVE_DAYS * DAY_MS)
    let open = 0
    let overdue = 0
    let stale = 0
    for (const i of myInitiatives ?? []) {
      if (CLOSED_INITIATIVE_STATUSES.has(i.status)) continue
      open += 1
      if (i.dueDate != null && i.dueDate.getTime() < today.getTime()) overdue += 1
      if (i.updatedAt.getTime() < staleBefore.getTime()) stale += 1
    }

    // ── domain exposure ──────────────────────────────────────────────────────
    const exposure = scoreDomainExposure(this.domainPctMap(latest?.domainScores))
    const weakestDomain: PortfolioWeakestDomain | null = exposure
      ? { domainKey: exposure.domainKey, pct: exposure.pct }
      : null

    // ── trajectory ───────────────────────────────────────────────────────────
    const baseline =
      latest === null
        ? undefined
        : args.baselineRows.find(
            (b) => b.schoolId === latest.schoolId && b.seriesKey === latest.seriesKey,
          )
    // The four comparability predicates are the SAME four
    // AccreditationReadinessHistoryService.detectBreaks tests, and they are
    // evaluated by the pure package rather than re-derived here. We do not draw a
    // direction across a break anywhere else in this product and we do not start
    // here: the chart draws a gap, and so does this component.
    const comparability = assessTrajectoryComparability(
      this.toReading(latest),
      this.toReading(baseline ?? null),
    )

    const components: Record<PortfolioComponentKey, PortfolioComponentInput> = {
      readinessLevel: fromScore(
        scoreReadinessLevel(latest?.verifiedPct ?? null),
        latest
          ? `Defensible readiness ${latest.verifiedPct}% across ${latest.leafCount} standards`
          : '',
        'no_readiness_snapshot',
      ),

      // A PASS IS NOT AN ABSENCE. Zero open findings is KNOWN with score 0; only an
      // unreadable ledger (or an unlicensed school, which never gets here) is unknown.
      earlyWarning:
        myFindings === null
          ? unknownComponent('findings_ledger_unreadable')
          : fromScore(scoreEarlyWarning(openFindings), 'Open findings ledger', 'findings_ledger_unreadable'),

      // THE PHASE-C HARD BLOCKER, MADE MECHANICAL. Before evidence CURRENCY is the
      // definition in force for a school, the evidence dimension is ABSENT AND SAID
      // TO BE ABSENT — never silently folded in at full confidence. It costs no
      // extra query: `verifiedBasis` is a column on the row already read, and the
      // scorer itself refuses to answer unless that column says 'current'.
      evidenceCurrency: fromScore(
        scoreEvidenceCurrency(
          latest?.selfScoredPct ?? null,
          latest?.verifiedPct ?? null,
          latest?.verifiedBasis ?? null,
        ),
        latest ? `Documented ${latest.selfScoredPct}% vs defensible ${latest.verifiedPct}%` : '',
        latest ? 'evidence_currency_not_in_force' : 'no_readiness_snapshot',
      ),

      domainExposure: exposure
        ? knownComponent(exposure.score, `Weakest domain at ${exposure.pct}%`)
        : unknownComponent('no_domain_scores'),

      improvement:
        myFindings === null || myInitiatives === null
          ? unknownComponent('improvement_registers_unreadable')
          : fromScore(
              scoreImprovement({ unresponded, overdue, stale }),
              'Improvement register',
              'improvement_registers_unreadable',
            ),

      trajectory: comparability.known
        ? fromScore(
            scoreTrajectory(latest?.verifiedPct ?? null, baseline?.verifiedPct ?? null),
            `Defensible readiness moved ${comparability.deltaPct} points over ${comparability.spanDays} days`,
            'no_baseline_reading',
          )
        : unknownComponent(comparability.reason ?? 'no_baseline_reading'),
    }

    const reviewDate = reviewDates.get(school.id) ?? null

    return {
      schoolId: school.id,
      name: school.name,
      seriesKey: latest?.seriesKey ?? null,
      // The `'none'` SENTINEL IS NOT A FRAMEWORK CODE. Sending it through would
      // count a school with no framework as a distinct framework in the
      // multi-framework note and would make the pure engine's own
      // UNKNOWN_FRAMEWORK_NOTE branch — written for exactly this school —
      // unreachable. `null` routes it there.
      frameworkCode:
        framework?.code ??
        (latest && latest.seriesKey !== NO_FRAMEWORK_SERIES_KEY ? latest.seriesKey : null),
      frameworkName: framework?.name ?? null,
      // A framework with no index scale (MSA, NSBECS) is never index-comparable —
      // the same predicate readiness-history.service.ts uses.
      indexComparable: framework?.indexMax != null,
      verifiedPct: latest?.verifiedPct ?? null,
      selfScoredPct: latest?.selfScoredPct ?? null,
      readinessPct: latest?.readinessPct ?? null,
      projectedIndex: latest?.projectedIndex ?? null,
      band: latest?.band ?? null,
      leafCount: latest?.leafCount ?? null,
      snapshotDate: latest ? isoDay(latest.snapshotDate) : null,
      demoData: latest?.isDemo ?? false,
      components,
      // NEGATIVE for a review date that has already gone by — passed straight
      // through, because `computeUrgency` maps a negative count to urgency 3 with
      // its own reason ('review_overdue'). A lapsed review used to resolve to no
      // row at all and therefore to urgency 0 / 'no scheduled review', which
      // sorted the most overdue school in a band BELOW one whose visit is two
      // years out.
      urgencyDaysToReview: reviewDate ? daysBetween(today, reviewDate) : null,
      // NOT ASSESSED, and said so. `PriorVisitFinding` records open/closed and a
      // closed date; nothing in this schema records the date a citation RESPONSE
      // is due, and the one rule that could have carried it
      // (ACC-PRIOR-FINDING-OPEN) is defined with NO_HORIZON, so the by-date test
      // this used to run could never be true for any school. A permanently-false
      // boolean reads as "we checked"; `null` says what is actually the case, and
      // the payload names the absence in `notes[]`.
      citationOverdue: null,
      openFindings,
      initiatives: { open, overdue, stale, unresponded },
      weakestDomain,
      // Load-bearing for the trajectory DRIVER: the pure module refuses to name a
      // figure the row does not carry, so a row with no delta gets a driver that
      // states a direction and no number. Supplying it is what lets the sentence be
      // specific instead of vague.
      trajectoryDeltaPct: comparability.known ? comparability.deltaPct : null,
    }
  }

  /**
   * The stored `domainScores` JSON, reshaped into the `{ domainKey: pct }` map the
   * pure scorer reads, on the DEFENSIBLE term.
   *
   * TWO THINGS ARE DELIBERATE HERE.
   *
   * `verifiedPct`, not `readinessPct` and not `selfScoredPct`, for the same reason
   * the whole portfolio is driven by the evidence term: a portfolio that reads a
   * self-score tells fourteen principals that the way to move down the
   * superintendent's list is to score themselves more generously.
   *
   * And the column is treated as UNTRUSTED. It is `Json?`, written by a nightly
   * capture that has changed shape once already (it is `DomainScoreRecord[]` today
   * and was NULL for all of Phase A), so an unknown domain key, a non-numeric pct
   * or an unexpected container yields nothing at all — which the caller turns into
   * a NAMED missing component, never a plausible number.
   */
  private domainPctMap(raw: unknown): Record<string, number> | null {
    if (raw === null || raw === undefined || typeof raw !== 'object') return null
    const rows: unknown[] = Array.isArray(raw) ? raw : Object.values(raw as Record<string, unknown>)
    const out: Record<string, number> = {}
    for (const row of rows) {
      if (typeof row !== 'object' || row === null) continue
      const r = row as { domainKey?: unknown; verifiedPct?: unknown }
      if (typeof r.domainKey !== 'string' || !isDomainKey(r.domainKey)) continue
      if (typeof r.verifiedPct !== 'number' || !Number.isFinite(r.verifiedPct)) continue
      // A duplicate domain key keeps the FIRST binding, so the map is deterministic
      // rather than last-write-wins.
      if (!(r.domainKey in out)) out[r.domainKey] = r.verifiedPct
    }
    return Object.keys(out).length === 0 ? null : out
  }

  /** A snapshot row as the pure comparability check wants to see it. */
  private toReading(row: SnapshotRow | null): TrajectoryReading | null {
    if (!row) return null
    return {
      day: isoDay(row.snapshotDate),
      engineVersion: row.engineVersion,
      leafCount: row.leafCount,
      frameworkId: row.frameworkId,
      verifiedBasis: row.verifiedBasis,
      verifiedPct: row.verifiedPct,
    }
  }

  /**
   * Peer panels for the ranked rows.
   *
   * `resolvePeerGroup` / `computePeerStats` / `sampleTierOf` come from
   * `@finrep/analytics` VERBATIM — peers.ts is not edited, forked, wrapped or
   * re-exported by this phase. The one thing this phase decides is GATING:
   * `percentile` is null below MIN_PEERS_FOR_PERCENTILE peers. A percentile over
   * three peers is a number with the shape of a statistic and none of the content;
   * the rank over three peers is simply true. The statistics are not ours to
   * change, and the web never computes a percentile of its own.
   */
  private attachPeers(
    rows: readonly PortfolioRow[],
    scope: OrgScope,
    enrollment: Map<string, number | null>,
  ): PortfolioRankedRow[] {
    const profileSource = new Map(scope.schools.map((s) => [s.id, s]))
    const valueOf = new Map(rows.map((r) => [r.schoolId, r.verifiedPct]))

    // Only ranked schools are candidates: a peer you cannot measure is not a peer
    // you can be ranked against. The profile shape is copied from
    // org-metrics.service.ts's `toPeerProfile` — copying the SHAPE is fine, editing
    // peers.ts is not, and this phase does neither to that file.
    const profiles: PeerProfile[] = rows.map((r) => {
      const s = profileSource.get(r.schoolId)
      return {
        schoolId: r.schoolId,
        enrollment: enrollment.get(r.schoolId) ?? null,
        county: s?.county ?? null,
        district: s?.district ?? null,
        schoolType: s?.schoolType ?? null,
        gradeLow: s?.gradeLow ?? null,
        gradeHigh: s?.gradeHigh ?? null,
      }
    })

    return rows.map((row) => {
      const focus = profiles.find((p) => p.schoolId === row.schoolId)
      if (!focus || profiles.length < 2) return { ...row, peers: null }
      const candidates = profiles.filter((p) => p.schoolId !== row.schoolId)
      const grp = resolvePeerGroup(focus, candidates, [...DEFAULT_PEER_DIMS] as PeerDim[], {
        minPeers: 1,
      })
      if (grp.matchTier === 'none' || grp.peerIds.length === 0) return { ...row, peers: null }
      const peerValues = grp.peerIds
        .map((id) => valueOf.get(id) ?? null)
        .filter((v): v is number => v != null)
      const stats = computePeerStats(row.verifiedPct, peerValues, 'higher')
      const peerCount = grp.peerIds.length
      return {
        ...row,
        peers: {
          peerCount,
          peerIds: [...grp.peerIds],
          matchTier: grp.matchTier,
          activeDims: grp.activeDims,
          relaxedDims: grp.relaxedDims,
          rank: stats.rank,
          percentile: peerCount < MIN_PEERS_FOR_PERCENTILE ? null : stats.percentile,
          sample: sampleTierOf(peerCount),
        },
      }
    })
  }

  // ── 2. INTERVENTION PRIORITIES (§5) ────────────────────────────────────────

  /**
   * Aggregated by `catalogStandardId`, WHICH IS THE ONLY LEGAL IDENTITY.
   *
   * `AccreditationStandard` rows are PER-SCHOOL CLONES of catalog rows: fourteen
   * schools have fourteen different `AccreditationStandard.id`s for the same
   * standard, and `code` is free text on the clone that drifts the moment one
   * school edits it. Aggregating on `standardId`, `code` or `title` is aggregating
   * on a coincidence. `catalogStandardId` is the FK to the shared catalog row and
   * is comparable by construction. That is a defect distinction, not a style one.
   *
   * BECAUSE A CATALOG STANDARD BELONGS TO EXACTLY ONE FRAMEWORK, no cross-framework
   * mixing can occur INSIDE one priorities[] row. Nobody needs to "add framework
   * filtering" on top of a property that already holds. What DOES need care is the
   * DENOMINATOR: `schoolsInScope` counts only schools that adopted the framework
   * owning that catalog standard. A cross-framework denominator would understate
   * every share and is the single easiest way to make this endpoint lie.
   */
  async getInterventionPriorities(
    user: User,
    orgId: string,
    query: PortfolioStandardsQueryDto,
  ) {
    const generatedAt = new Date().toISOString()
    const scope = await this.resolveOrgScope(user, orgId)
    const lens = clampLens(scope.orgRole, query.lens)
    const limit = query.limit ?? 10

    const licensed = await this.resolveLicensed(scope.schools.map((s) => s.id))
    const schools = scope.schools.filter((s) => licensed.has(s.id))
    const ids = schools.map((s) => s.id)
    const nameOf = new Map(schools.map((s) => [s.id, s.name]))

    const [standards, evidenceCounts] = await Promise.all([
      readCatalogLinkedStandards(this.prisma, ids),
      readEvidenceCounts(this.prisma, ids),
    ])
    const catalogIds = [...new Set(standards.map((s) => s.catalogStandardId))].sort()
    const catalog = await readCatalogStandards(this.prisma, catalogIds)
    const catalogById = new Map(catalog.map((c) => [c.id, c]))

    const frameworkIds = [...new Set(catalog.map((c) => c.frameworkId))].sort()
    const frameworks = await readFrameworks(this.prisma, frameworkIds)
    const frameworkById = new Map(frameworks.map((f) => [f.id, f]))

    // Which schools hold which framework — the honest denominator.
    const schoolsPerFramework = new Map<string, Set<string>>()
    for (const s of standards) {
      const cat = catalogById.get(s.catalogStandardId)
      if (!cat) continue
      const set = schoolsPerFramework.get(cat.frameworkId) ?? new Set<string>()
      set.add(s.schoolId)
      schoolsPerFramework.set(cat.frameworkId, set)
    }

    const wanted = query.frameworkCode ?? null
    const byCatalog = new Map<string, typeof standards>()
    for (const s of standards) {
      const cat = catalogById.get(s.catalogStandardId)
      if (!cat) continue
      if (wanted && frameworkById.get(cat.frameworkId)?.code !== wanted) continue
      byCatalog.set(s.catalogStandardId, [...(byCatalog.get(s.catalogStandardId) ?? []), s])
    }

    const priorities = [...byCatalog.entries()].map(([catalogStandardId, clones]) => {
      const cat = catalogById.get(catalogStandardId)!
      const schoolsInScope = schoolsPerFramework.get(cat.frameworkId)?.size ?? clones.length
      const scored = clones.filter((c) => c.rubricScore != null)
      const below = clones.filter(
        (c) => c.rubricScore != null && c.rubricScore <= INTERVENTION_THRESHOLD_SCORE,
      )
      const evidenceGap = clones.filter((c) => (evidenceCounts.get(c.id) ?? 0) === 0)
      const sorted = scored.map((c) => c.rubricScore as number).sort((a, b) => a - b)
      const medianRubricScore =
        sorted.length === 0
          ? null
          : sorted.length % 2 === 1
            ? sorted[(sorted.length - 1) / 2]
            : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      return {
        catalogStandardId,
        code: cat.code,
        title: cat.title,
        domainKey: cat.domainKey,
        schoolsInScope,
        schoolsScored: scored.length,
        schoolsBelowThreshold: below.length,
        schoolsWithEvidenceGap: evidenceGap.length,
        sharePct: schoolsInScope === 0 ? 0 : Math.round((100 * below.length) / schoolsInScope),
        medianRubricScore,
        schools: clones
          .map((c) => ({
            schoolId: c.schoolId,
            name: nameOf.get(c.schoolId) ?? '',
            rubricScore: c.rubricScore,
            evidenceCount: evidenceCounts.get(c.id) ?? 0,
          }))
          .sort((a, b) => (a.schoolId < b.schoolId ? -1 : a.schoolId > b.schoolId ? 1 : 0)),
        // ONE frozen template and nothing else. `thresholdScore` travels as a
        // NUMBER; the web renders the accreditor's rubric word from its own label
        // table, so there is exactly one source of label truth.
        headline: `${cat.code} is below the improvement threshold at ${below.length} of ${schoolsInScope} schools.`,
      }
    })

    // FROZEN ORDERING. Total and deterministic; no client override exists.
    priorities.sort(
      (a, b) =>
        b.schoolsBelowThreshold - a.schoolsBelowThreshold ||
        b.sharePct - a.sharePct ||
        (a.code < b.code ? -1 : a.code > b.code ? 1 : 0) ||
        (a.catalogStandardId < b.catalogStandardId ? -1 : 1),
    )

    const frameworkCodes = [...new Set(frameworks.map((f) => f.code))].sort()
    const notes: string[] = []
    if (!wanted && frameworkCodes.length > 1) {
      notes.push(
        `These schools follow ${frameworkCodes.length} different accreditation frameworks. Each priority is counted only against the schools that adopted its own framework.`,
      )
    }
    // A DENOMINATOR THAT QUIETLY SHRANK IS A DENOMINATOR THAT LIES. An unlicensed
    // school contributes no standards, so "9 of 14" would silently become "9 of 11"
    // with nothing on the page saying why.
    const unlicensedCount = scope.schools.length - schools.length
    if (unlicensedCount > 0) {
      notes.push(
        `${unlicensedCount} school(s) in this organization do not license the accreditation module and are excluded from every count below.`,
      )
    }

    const payload = {
      orgId,
      generatedAt,
      lens,
      callerRole: scope.orgRole,
      availableLenses: availableLensesFor(scope.orgRole),
      frameworkCode: wanted,
      indexComparable: frameworkCodes.length === 1 && frameworks[0]?.indexMax != null,
      thresholdScore: INTERVENTION_THRESHOLD_SCORE,
      schoolsConsidered: schools.length,
      schoolsWithFramework: new Set(standards.map((s) => s.schoolId)).size,
      // A TRUNCATED LIST THAT DOES NOT SAY IT IS TRUNCATED reads as the complete
      // answer to "which standards are weak across the diocese". `limit` and
      // `totalPriorities` are both on the payload so the panel can say
      // "showing the top 10 of 47" instead of quietly withholding 37.
      limit,
      totalPriorities: priorities.length,
      priorities: priorities.slice(0, limit),
      notes,
      engineVersion: PORTFOLIO_PRIORITY_VERSION,
      disclaimer: READINESS_DISCLAIMER,
    }
    return shapeForLens(payload, lens)
  }

  // ── 3. IMPROVEMENT VELOCITY (§4.5(3)) ──────────────────────────────────────

  /**
   * IS THE WORK ALREADY ADOPTED ACTUALLY MOVING?
   *
   * TWO bounded queries over the whole organization: one `findMany` over
   * `ImprovementProgressEvent` inside the window, one over `ImprovementInitiative`.
   * No per-school fan-out and no live progress compute — `computeInitiativeProgress`
   * is deliberately NOT called here, because forty schools' worth of it is the same
   * cliff wearing a different hat.
   *
   * A delta is emitted only from >= 2 observations spanning >=
   * MIN_PROJECTION_SPAN_DAYS, which is IMPORTED from Phase G's
   * improvement-progress.ts rather than re-typed as `14`. Everything else says
   * `insufficient` WITH A REASON. A velocity of "0.0" for a school with one reading
   * is the exact lie this endpoint exists to avoid.
   */
  async getVelocity(user: User, orgId: string, query: VelocityQueryDto) {
    const generatedAt = new Date().toISOString()
    const today = civilDate(isoDay(new Date()))
    const windowDays = query.windowDays ?? DEFAULT_VELOCITY_WINDOW_DAYS
    const fromDay = new Date(today.getTime() - windowDays * DAY_MS)

    const scope = await this.resolveOrgScope(user, orgId)
    const lens = clampLens(scope.orgRole, query.lens)

    const licensed = await this.resolveLicensed(scope.schools.map((s) => s.id))
    const schools = scope.schools.filter((s) => licensed.has(s.id))
    const ids = schools.map((s) => s.id)

    const [events, initiatives, findings] = await Promise.all([
      readProgressEvents(this.prisma, ids, fromDay),
      readInitiatives(this.prisma, ids),
      readOpenFindings(this.prisma, ids).catch(() => [] as FindingRow[]),
    ])

    const initiativeById = new Map(initiatives.map((i) => [i.id, i]))

    // ── ONE DEFINITION OF "AN INITIATIVE IN THIS WINDOW", FOR BOTH HALVES ─────
    // The count side (`org.initiatives`) excludes closed work; the measurement
    // side must too, or the payload renders "8 of 2 initiatives carry
    // observations" — a ratio whose numerator exceeds its denominator — and a
    // diocese that FINISHED everything last quarter reports +80 pts of current
    // "velocity" against 2 open initiatives.
    //
    // ── AND ONE SERIES PER INITIATIVE ────────────────────────────────────────
    // `ImprovementProgressEvent` is uniquely keyed on (initiativeId, observedOn,
    // source), so one initiative can carry a `manual` reading and a `metric`
    // reading on the same day. Differencing a milestone fraction against a manual
    // one draws a direction across two incomparable series — exactly what §2.2
    // refuses for trajectory, and exactly what Phase G's own
    // `computeInitiativeProgress` avoids by filtering on the initiative's declared
    // `progressSource`. Same predicate here, so the diocesan page and the school's
    // own improvement drawer can never report opposite movement for one initiative.
    const byInitiative = new Map<
      string,
      { schoolId: string; points: { day: Date; pct: number }[] }
    >()
    for (const e of events) {
      const pct = e.pct == null ? null : Number(e.pct)
      if (pct == null || !Number.isFinite(pct)) continue
      const initiative = initiativeById.get(e.initiativeId)
      if (!initiative) continue
      if (CLOSED_INITIATIVE_STATUSES.has(initiative.status)) continue
      // A "status only" initiative (progressSource null) reports no series at all,
      // so it contributes no delta and falls through to `insufficient` with a
      // reason — the honest outcome, and Phase G's.
      if (initiative.progressSource === null) continue
      if (e.source !== initiative.progressSource) continue
      const entry = byInitiative.get(e.initiativeId) ?? { schoolId: e.schoolId, points: [] }
      entry.points.push({ day: e.observedOn, pct })
      byInitiative.set(e.initiativeId, entry)
    }

    interface Measured {
      schoolId: string
      deltaPoints: number
    }
    const measured: Measured[] = []
    let initiativesWithObservations = 0
    const comparableBySchool = new Map<string, number>()
    for (const entry of byInitiative.values()) {
      initiativesWithObservations += 1
      const pts = entry.points
      comparableBySchool.set(entry.schoolId, (comparableBySchool.get(entry.schoolId) ?? 0) + pts.length)
      if (pts.length < 2) continue
      const first = pts[0]
      const last = pts[pts.length - 1]
      if (daysBetween(first.day, last.day) < MIN_PROJECTION_SPAN_DAYS) continue
      // pct is a 0..1 fraction on the record; the payload speaks PERCENTAGE POINTS.
      measured.push({ schoolId: entry.schoolId, deltaPoints: round1((last.pct - first.pct) * 100) })
    }

    const openInitiativesBySchool = new Map<string, number>()
    for (const i of initiatives) {
      if (CLOSED_INITIATIVE_STATUSES.has(i.status)) continue
      openInitiativesBySchool.set(i.schoolId, (openInitiativesBySchool.get(i.schoolId) ?? 0) + 1)
    }
    const unrespondedBySchool = new Map<string, number>()
    for (const f of findings) {
      if (f.initiativeId !== null) continue
      unrespondedBySchool.set(f.schoolId, (unrespondedBySchool.get(f.schoolId) ?? 0) + 1)
    }
    const observationsBySchool = new Map<string, number>()
    for (const e of events) {
      observationsBySchool.set(e.schoolId, (observationsBySchool.get(e.schoolId) ?? 0) + 1)
    }

    const schoolRows = schools.map((s) => {
      const mine = measured.filter((m) => m.schoolId === s.id)
      // The LEDGER count — every observation recorded in the window, which is a
      // true statement about the ledger even when none of them is comparable.
      const observations = observationsBySchool.get(s.id) ?? 0
      const comparable = comparableBySchool.get(s.id) ?? 0
      const initiativeCount = openInitiativesBySchool.get(s.id) ?? 0
      if (mine.length === 0) {
        return {
          schoolId: s.id,
          name: s.name,
          initiatives: initiativeCount,
          observations,
          comparableObservations: comparable,
          deltaPctPoints: null,
          basis: 'insufficient' as const,
          // Each sentence is true of the case it describes; a single template
          // covering all three would be false in two of them.
          reason:
            observations === 0
              ? 'No progress observations recorded in this window.'
              : comparable === 0
                ? "Observations were recorded, but none on an open initiative's own declared measurement series, so no movement can be compared."
                : `No open initiative has two observations on its own measurement series at least ${MIN_PROJECTION_SPAN_DAYS} days apart in this window.`,
        }
      }
      return {
        schoolId: s.id,
        name: s.name,
        initiatives: initiativeCount,
        observations,
        comparableObservations: comparable,
        deltaPctPoints: round1(mine.reduce((sum, m) => sum + m.deltaPoints, 0) / mine.length),
        basis: 'observed' as const,
        reason: null,
      }
    })

    const improved = measured.filter((m) => m.deltaPoints > 0).length
    const flat = measured.filter((m) => m.deltaPoints === 0).length
    const declined = measured.filter((m) => m.deltaPoints < 0).length

    const payload = {
      orgId,
      generatedAt,
      windowDays,
      asOf: isoDay(today),
      lens,
      callerRole: scope.orgRole,
      availableLenses: availableLensesFor(scope.orgRole),
      org: {
        // BOTH SIDES OF THE RATIO COUNT THE SAME THING: open initiatives.
        // `initiativesWithObservations` can never exceed `initiatives`.
        initiatives: [...openInitiativesBySchool.values()].reduce((a, b) => a + b, 0),
        initiativesWithObservations,
        observations: events.length,
        comparableObservations: [...comparableBySchool.values()].reduce((a, b) => a + b, 0),
        improved,
        flat,
        declined,
        unresponded: [...unrespondedBySchool.values()].reduce((a, b) => a + b, 0),
        basis: measured.length > 0 ? ('observed' as const) : ('insufficient' as const),
        reason:
          measured.length > 0
            ? null
            : `No open initiative in this organization has two observations on its own measurement series at least ${MIN_PROJECTION_SPAN_DAYS} days apart in this window.`,
      },
      schools: schoolRows,
      notes: [
        `A movement figure is only reported from at least two observations spanning at least ${MIN_PROJECTION_SPAN_DAYS} days. Everything else is reported as insufficient, with the reason.`,
        // The two exclusions, stated rather than silent. A superintendent who
        // recorded a hand-set percentage against a metric-driven initiative, or
        // who finished the work last quarter, is entitled to know why it is not
        // in the movement figure.
        "Only OPEN initiatives count, and only observations on an initiative's own declared measurement series — a completed initiative is not current velocity, and two different measurement sources are not one series.",
        // Stated, not silent — a school missing from the list for a licensing
        // reason must not read as a school with no improvement work.
        ...(scope.schools.length > schools.length
          ? [
              `${scope.schools.length - schools.length} school(s) in this organization do not license the accreditation module and are not listed below.`,
            ]
          : []),
      ],
      engineVersion: PORTFOLIO_PRIORITY_VERSION,
    }
    return shapeForLens(payload, lens)
  }
}

/** One decimal place, deterministically. */
function round1(n: number): number {
  return Math.round(n * 10) / 10
}
