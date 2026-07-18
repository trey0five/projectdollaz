import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import type { User } from '@finrep/db'
import type { ReportBundle } from '@finrep/engine'
import {
  computeMetricsForPeriod,
  computeOrgMetrics,
  computePeerStats,
  dimMatches,
  formatMetricDelta,
  formatMetricValue,
  fromBundle,
  ordinal,
  resolveDisplayUnit,
  resolvePeerGroup,
  sampleTierOf,
  sizeBandLabel,
  sizeBandOf,
  DEFAULT_PEER_DIMS,
  METRIC_KEYS,
  PEER_DIMS,
  type MatchTier,
  type MetricKey,
  type MetricResult,
  type OrgMetricResult,
  type PeerDim,
  type PeerProfile,
  type SampleTier,
  type SchoolPeriodInputs,
  type SizeBandKey,
} from '@finrep/analytics'
import { PrismaService } from '../prisma/prisma.service.js'
import { BillingService } from '../billing/billing.service.js'
import { OperationalService } from './operational.service.js'
import {
  entitledModulesForOrg,
  entitledModulesForSchool,
  filterMetricsByEntitlement,
} from './metric-gating.js'

// ─────────────────────────────────────────────────────────────────────────────
// Canonical semantic layer v1 — the ORG-SCOPE metrics endpoint service.
//
// Org metric value = the metric's OWN formula (def.compute) applied to the
// FIELD-BY-FIELD SUM of its schools' extensive components — the pure
// @finrep/analytics computeOrgMetrics does that math. This service is the thin
// API shell: it RESOLVES the in-org, caller-visible schools + each school's
// latest snapshot for the FY (the SAME membership/Jul–Jun logic the shipped
// StatementsRollupService + OrgBriefingService use), adapts each snapshot to
// PeriodFinancials, loads each school's operational row, and hands the list to the
// pure engine. It adds NO math — the metric values come entirely from the package
// (so org + per-school can never disagree).
//
// Org isolation mirrors StatementsRollupService EXACTLY (additive — the shipped
// service is untouched): the rollup only ever spans schools the caller has an
// active membership on AND that belong to :orgId. The org-resolution block is
// COPIED (not extracted) to avoid touching the live, shipped rollup/briefing
// services; the fyStartOf Jul–Jun convention is byte-identical so org metrics and
// the statements rollup always agree on which snapshot is "the FY".
// ─────────────────────────────────────────────────────────────────────────────

/** A school that contributed to the org sums, for the response's disclosure list. */
export interface OrgMetricContributor {
  schoolId: string
  name: string
  /** YYYY-MM-DD of the chosen snapshot's period end. */
  periodEndDate: string | null
  /** Whether that snapshot carried a balance sheet (drives SFP-metric coverage). */
  hasSFP: boolean
  /** Whether the school had an operational row (drives Tier-2 coverage). */
  hasOperational: boolean
}

export interface OrgMetricsResponse {
  orgId: string
  fiscalYearStart: string | null
  /** Set in the SERVICE (the impure clock lives here, never in the pure package). */
  generatedAt: string
  /** Org-level MetricResult[] in canonical order — the SAME type the dashboard renders. */
  metrics: OrgMetricResult[]
  /** Schools whose financials were folded into the org sums. */
  contributingSchools: OrgMetricContributor[]
  /** In-org schools with no snapshot for the FY (NOT zero-filled into the sums). */
  notReported: { schoolId: string; name: string }[]
  /** Schools that reported (== contributingSchools.length). */
  reportedCount: number
  /** Total in-org schools the caller can see. */
  schoolCount: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase D — per-school COMPARE surface. Same resolution as getMetrics, but instead
// of computeOrgMetrics(Σ components) it runs the ALREADY-EXPORTED per-school engine
// (computeMetricsForPeriod — the SAME engine the single-school dashboard uses) once
// per contributing school, gates each with the SCHOOL-scoped entitlement (NOT the
// org widest-set), and stamps registry-formatted strings. ZERO new metric math.
// ─────────────────────────────────────────────────────────────────────────────

/** One school's registry metric, flattened + registry-formatted, for the compare table. */
export interface CompareSchoolMetric {
  key: MetricKey
  label: string
  unit: MetricResult['unit']
  value: number | null
  /** formatMetricValue(value, resolveDisplayUnit(key, unit)). */
  formatted: string
  status: MetricResult['status']
  bands: MetricResult['bands']
  available: boolean
  periodOverPeriodDelta: number | null
  /** formatMetricDelta(delta, resolveDisplayUnit(key, unit)) — null when no delta. */
  formattedDelta: string | null
  goodDirection: MetricResult['goodDirection']
}

/**
 * School Comparison — the peer-benchmarking profile block on a CompareSchool.
 * The demographic + size dimensions the peer group is formed on. schoolType /
 * county / district / gradeLow / gradeHigh come from the School record; enrollment
 * comes from the FY's loaded operational row; sizeBand is DERIVED (never stored).
 */
export interface CompareSchoolProfile {
  county: string | null
  district: string | null
  schoolType: string | null
  gradeLow: string | null
  gradeHigh: string | null
  /** Headcount from the loaded operational row for the FY, or null. */
  enrollment: number | null
  /** sizeBandOf(enrollment); null when enrollment is null. */
  sizeBand: SizeBandKey | null
  /** Human label for the size band; null when sizeBand is null. */
  sizeBandLabel: string | null
}

/** The raw (non-derived) profile fields as stored on the School record. */
interface SchoolProfileRaw {
  county: string | null
  district: string | null
  schoolType: string | null
  gradeLow: string | null
  gradeHigh: string | null
}

/** A reporting school + its keyed registry metrics for the FY. */
export interface CompareSchool {
  schoolId: string
  schoolName: string
  /** YYYY-MM-DD of the chosen snapshot's period end. */
  periodEndDate: string | null
  /** Whether the chosen snapshot carried a balance sheet (SFP-metric coverage). */
  hasSFP: boolean
  /** Whether the school had an operational row (Tier-2 coverage). */
  hasOperational: boolean
  /** True when all 5 stored profile fields are non-null. */
  profileComplete: boolean
  /** Peer-benchmarking profile (demographics + derived size band). */
  profile: CompareSchoolProfile
  /** Registry metrics keyed by MetricKey (already school-scoped entitlement-gated). */
  metrics: Record<string, CompareSchoolMetric>
}

// ── School Comparison — peer-benchmark response shapes ────────────────────────

/** One metric's peer distribution + the focus school's standing within it. */
export interface PeerStatEntry {
  count: number
  median: number
  mean: number
  p25: number
  p75: number
  min: number
  max: number
  focusValue: number | null
  rank: number
  percentile: number
  sample: SampleTier
  goodDirection: 'higher' | 'lower'
  focusFormatted: string
  medianFormatted: string
}

/** A peer school (a CompareSchool) + which dims it shares with the focus. */
export interface PeerBenchmarkPeer extends CompareSchool {
  matchReasons: string[]
}

export interface PeerGroupBlock {
  matchTier: MatchTier
  activeDims: PeerDim[]
  relaxedDims: PeerDim[]
  groupDescription: string
  peerCount: number
  peerIds: string[]
  sample: SampleTier
}

export interface PeerBenchmarkResponse {
  orgId: string
  fiscalYearStart: string | null
  generatedAt: string
  requestedDims: PeerDim[]
  focus: CompareSchool
  group: PeerGroupBlock
  peers: PeerBenchmarkPeer[]
  stats: Record<string, PeerStatEntry>
  insights: string[]
  emptyState: { reason: 'single_school' | 'no_peers'; message: string } | null
}

/** Options for getPeerBenchmark (dims may arrive as CSV or an array). */
export interface PeerBenchmarkOptions {
  fiscalYearStart?: string | null
  dims?: string | string[] | null
  minPeers?: number
}

// ── Pure profile helpers (module-level; no I/O) ──────────────────────────────

/** Read the 5 stored profile fields off a School record, defensively (empty → null). */
function readProfileFields(school: unknown): SchoolProfileRaw {
  const s = (school ?? {}) as Record<string, unknown>
  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.trim().length ? v : null
  return {
    county: str(s.county),
    district: str(s.district),
    schoolType: str(s.schoolType),
    gradeLow: str(s.gradeLow),
    gradeHigh: str(s.gradeHigh),
  }
}

function isProfileComplete(raw: SchoolProfileRaw): boolean {
  return (
    raw.county != null &&
    raw.district != null &&
    raw.schoolType != null &&
    raw.gradeLow != null &&
    raw.gradeHigh != null
  )
}

function buildCompareProfile(raw: SchoolProfileRaw, enrollment: number | null): CompareSchoolProfile {
  const band = sizeBandOf(enrollment)
  return {
    county: raw.county,
    district: raw.district,
    schoolType: raw.schoolType,
    gradeLow: raw.gradeLow,
    gradeHigh: raw.gradeHigh,
    enrollment,
    sizeBand: band,
    sizeBandLabel: sizeBandLabel(band),
  }
}

function toPeerProfile(schoolId: string, p: CompareSchoolProfile): PeerProfile {
  return {
    schoolId,
    enrollment: p.enrollment,
    county: p.county,
    district: p.district,
    schoolType: p.schoolType,
    gradeLow: p.gradeLow,
    gradeHigh: p.gradeHigh,
  }
}

/** Parse the dims input (CSV or array) into a de-duped valid PeerDim[] (default when empty). */
function parseDims(dims: string | string[] | null | undefined): PeerDim[] {
  const arr = Array.isArray(dims)
    ? dims
    : typeof dims === 'string' && dims.length
      ? dims.split(',')
      : []
  const out: PeerDim[] = []
  for (const raw of arr) {
    const d = String(raw).trim()
    if ((PEER_DIMS as readonly string[]).includes(d) && !out.includes(d as PeerDim)) {
      out.push(d as PeerDim)
    }
  }
  return out.length ? out : [...DEFAULT_PEER_DIMS]
}

/** Integer count formatting for the synthetic enrollment stat. */
function formatCount(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return Math.round(n).toLocaleString('en-US')
}

const DIM_REASON_LABEL: Record<PeerDim, string> = {
  size: 'same size band',
  county: 'same county',
  district: 'same district',
  type: 'same type',
  grade: 'overlapping grades',
}

/** Which of the requested dims a peer actually shares with the focus. */
function matchReasonsFor(
  focus: PeerProfile,
  cand: PeerProfile,
  requestedDims: PeerDim[],
): string[] {
  return requestedDims.filter((d) => dimMatches(focus, cand, d)).map((d) => DIM_REASON_LABEL[d])
}

/** Plain-English description of the resolved peer group. */
function describeGroup(profile: CompareSchoolProfile, activeDims: PeerDim[]): string {
  if (activeDims.length === 0) return 'all your schools'
  const typeActive = activeDims.includes('type') && profile.schoolType
  const base = typeActive ? `${profile.schoolType} schools` : 'schools'
  const quals: string[] = []
  if (activeDims.includes('size')) quals.push('of similar size')
  if (activeDims.includes('county') && profile.county) quals.push(`in ${profile.county} County`)
  if (activeDims.includes('district') && profile.district) quals.push(`in ${profile.district}`)
  if (activeDims.includes('grade')) quals.push('with a similar grade range')
  return quals.length ? `${base} ${quals.join(', ')}` : base
}

/** Headline metrics the peer insights + KPI tiles focus on. */
const HEADLINE_METRICS = [
  'days_cash_on_hand',
  'operating_margin',
  'months_operating_reserve',
  'tuition_dependency',
  'cost_per_pupil',
]

export interface CompareMetricsResponse {
  orgId: string
  fiscalYearStart: string | null
  /** Set in the SERVICE (the impure clock lives here, never in the pure package). */
  generatedAt: string
  /** In-org reporting schools, each with its keyed registry metrics. */
  schools: CompareSchool[]
  /** In-org schools with no snapshot for the FY. */
  notReported: { schoolId: string; name: string }[]
  /** Canonical registry order (ALL_METRICS order) — the column order the compare UI walks. */
  metricOrder: MetricKey[]
}

@Injectable()
export class OrgMetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operational: OperationalService,
    // MODULE-SCOPED METRIC GATING (org surface). Gates enrollment/hr org metrics by
    // the WIDEST licensed set across contributing schools (any-school-licenses),
    // mirroring the shipped org-lens-ceiling precedent. finance-family always kept.
    private readonly billing: BillingService,
  ) {}

  /**
   * The latest snapshot of the NEAREST prior fiscal period that has one, for a
   * school. REPLICATED (not extracted) from AnalyticsService.nearestPriorBundle —
   * the org-resolution block is deliberately copied across the shipped
   * rollup/briefing/metrics services (documented above) to avoid touching the live
   * services; staying with copy-not-extract keeps this slice additive. Walks back
   * from `before` by periodEndDate, skipping any prior period that never produced a
   * snapshot, so org PoP deltas survive gaps. schoolId-scoped (from the caller's
   * in-org set) → no cross-tenant leak. Null when no prior period has a snapshot.
   */
  private async nearestPriorBundle(
    schoolId: string,
    before: Date,
  ): Promise<{ bundle: ReportBundle; periodId: string } | null> {
    const priorWithSnap = await this.prisma.fiscalPeriod.findFirst({
      where: {
        schoolId,
        periodEndDate: { lt: before },
        statementSnapshots: { some: {} },
      },
      orderBy: { periodEndDate: 'desc' },
    })
    if (!priorWithSnap) return null
    const snap = await this.prisma.statementSnapshot.findFirst({
      where: { schoolId, fiscalPeriodId: priorWithSnap.id },
      orderBy: { createdAt: 'desc' },
    })
    return snap
      ? { bundle: snap.payload as unknown as ReportBundle, periodId: priorWithSnap.id }
      : null
  }

  async getMetrics(
    user: User,
    orgId: string,
    fiscalYearStart: string | null,
  ): Promise<OrgMetricsResponse> {
    const generatedAt = new Date().toISOString()

    // ── ORG RESOLUTION + PER-SCHOOL PERIOD PICK ──────────────────────────────
    // Mirrors StatementsRollupService.getRollup steps 1-4 EXACTLY.
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

    const schoolMap = new Map<string, { id: string; name: string }>()
    for (const m of inOrg) schoolMap.set(m.school.id, { id: m.school.id, name: m.school.name })
    const schools = [...schoolMap.values()]

    const snapshots = await this.prisma.statementSnapshot.findMany({
      where: { schoolId: { in: schools.map((s) => s.id) } },
      include: { fiscalPeriod: true },
      orderBy: { createdAt: 'desc' },
    })

    // Same Jul–Jun fyStartOf as StatementsRollupService/OrgBriefingService so the
    // query param and a snapshot's FY agree byte-for-byte across the org views.
    const fyStartOf = (s: (typeof snapshots)[number]): string | null => {
      const end = s.fiscalPeriod?.periodEndDate
      if (!end) return null
      const y = end.getUTCFullYear()
      const m = end.getUTCMonth() + 1
      const startYear = m <= 6 ? y - 1 : y
      return `${startYear}-07`
    }

    const notReported: { schoolId: string; name: string }[] = []
    // Reported schools, each carrying the chosen snapshot + its period id.
    const reported: {
      schoolId: string
      name: string
      periodId: string
      periodEndDate: string | null
      /** The chosen period's end as a Date, for the nearest-prior query. */
      periodEnd: Date | null
      bundle: ReportBundle
    }[] = []

    for (const s of schools) {
      const chosen = snapshots.find(
        (snap) =>
          snap.schoolId === s.id && (!fiscalYearStart || fyStartOf(snap) === fiscalYearStart),
      )
      if (!chosen) {
        notReported.push({ schoolId: s.id, name: s.name })
        continue
      }
      reported.push({
        schoolId: s.id,
        name: s.name,
        periodId: chosen.fiscalPeriodId,
        periodEndDate: chosen.fiscalPeriod?.periodEndDate?.toISOString().slice(0, 10) ?? null,
        periodEnd: chosen.fiscalPeriod?.periodEndDate ?? null,
        bundle: chosen.payload as unknown as ReportBundle,
      })
    }

    // ── ADAPT + LOAD OPERATIONAL + NEAREST-PRIOR (in parallel) → pure inputs ──
    // operationalFor does no tenant check (the period id came from a snapshot we
    // already resolved within the caller's in-org school set, so it is safe); the
    // same holds for the prior period id, which comes from nearestPriorBundle's
    // schoolId-scoped query. The nearest-prior snapshot + prior operational let the
    // pure engine light up org PoP deltas + org enrollment YoY (additive — the
    // deltas ride MetricResult.periodOverPeriodDelta, response shape unchanged).
    const inputs: SchoolPeriodInputs[] = await Promise.all(
      reported.map(async (r) => {
        const financials = fromBundle(r.bundle)
        const operational = await this.operational.operationalFor(r.schoolId, r.periodId)
        const prior = r.periodEnd ? await this.nearestPriorBundle(r.schoolId, r.periodEnd) : null
        const priorFinancials = prior ? fromBundle(prior.bundle) : null
        const priorOperational = prior
          ? await this.operational.operationalFor(r.schoolId, prior.periodId)
          : null
        return { schoolId: r.schoolId, financials, operational, priorFinancials, priorOperational }
      }),
    )

    // ── PURE ORG COMPUTE (all the math lives in @finrep/analytics) ───────────
    const allMetrics = computeOrgMetrics(inputs)

    // MODULE-SCOPED METRIC GATING (surface 3 of 3). Gate enrollment/hr org metrics
    // by the WIDEST licensed set across the contributing schools: keep the org
    // metric if ANY reported school is entitled to the module (mirrors the org
    // ceiling = widest-in-org precedent). finance-family metrics are always kept.
    // A fully finance-only org sees neither org enrollment_change_yoy nor
    // student_teacher_ratio; trials resolve like active subs (NULL → finance-only).
    const entitled = await entitledModulesForOrg(
      reported.map((r) => r.schoolId),
      this.billing,
    )
    const metrics = filterMetricsByEntitlement(allMetrics, entitled)

    const contributingSchools: OrgMetricContributor[] = reported.map((r, i) => ({
      schoolId: r.schoolId,
      name: r.name,
      periodEndDate: r.periodEndDate,
      hasSFP: inputs[i].financials.hasSFP,
      hasOperational: inputs[i].operational != null,
    }))

    return {
      orgId,
      fiscalYearStart: fiscalYearStart ?? null,
      generatedAt,
      metrics,
      contributingSchools,
      notReported,
      reportedCount: reported.length,
      schoolCount: schools.length,
    }
  }

  /**
   * Phase D COMPARE surface — GET /organizations/:orgId/metrics/by-school.
   *
   * ZERO-RECOMPUTE: reuses getMetrics' org-resolution + per-school period pick
   * VERBATIM (same membership/in-org filter, same Jul–Jun fyStartOf, same snapshot
   * pick + nearest-prior walk), then — instead of computeOrgMetrics(Σ components) —
   * loops the resolved schools calling the ALREADY-EXPORTED per-school engine
   * `computeMetricsForPeriod` once per school (the SAME engine the single-school
   * dashboard uses), gates each with the SCHOOL-scoped entitlement
   * (entitledModulesForSchool — NOT the org widest-set), and stamps registry
   * formatters. No new metric math; @finrep/analytics is consumed, never modified.
   */
  async getMetricsBySchool(
    user: User,
    orgId: string,
    fiscalYearStart: string | null,
  ): Promise<CompareMetricsResponse> {
    const generatedAt = new Date().toISOString()

    // ── ORG RESOLUTION + PER-SCHOOL PERIOD PICK ──────────────────────────────
    // Byte-identical to getMetrics (mirrors StatementsRollupService steps 1-4).
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

    // Carry the School's peer-benchmarking profile fields alongside id/name so the
    // enriched CompareSchool.profile can be assembled without a second query.
    const schoolMap = new Map<string, { id: string; name: string; profile: SchoolProfileRaw }>()
    for (const m of inOrg) {
      schoolMap.set(m.school.id, {
        id: m.school.id,
        name: m.school.name,
        profile: readProfileFields(m.school),
      })
    }
    const schools = [...schoolMap.values()]

    const snapshots = await this.prisma.statementSnapshot.findMany({
      where: { schoolId: { in: schools.map((s) => s.id) } },
      include: { fiscalPeriod: true },
      orderBy: { createdAt: 'desc' },
    })

    // Same Jul–Jun fyStartOf as getMetrics/StatementsRollupService/OrgBriefingService.
    const fyStartOf = (s: (typeof snapshots)[number]): string | null => {
      const end = s.fiscalPeriod?.periodEndDate
      if (!end) return null
      const y = end.getUTCFullYear()
      const m = end.getUTCMonth() + 1
      const startYear = m <= 6 ? y - 1 : y
      return `${startYear}-07`
    }

    const notReported: { schoolId: string; name: string }[] = []
    const reported: {
      schoolId: string
      name: string
      profileRaw: SchoolProfileRaw
      periodId: string
      periodEndDate: string | null
      periodEnd: Date | null
      bundle: ReportBundle
    }[] = []

    for (const s of schools) {
      const chosen = snapshots.find(
        (snap) =>
          snap.schoolId === s.id && (!fiscalYearStart || fyStartOf(snap) === fiscalYearStart),
      )
      if (!chosen) {
        notReported.push({ schoolId: s.id, name: s.name })
        continue
      }
      reported.push({
        schoolId: s.id,
        name: s.name,
        profileRaw: s.profile,
        periodId: chosen.fiscalPeriodId,
        periodEndDate: chosen.fiscalPeriod?.periodEndDate?.toISOString().slice(0, 10) ?? null,
        periodEnd: chosen.fiscalPeriod?.periodEndDate ?? null,
        bundle: chosen.payload as unknown as ReportBundle,
      })
    }

    // ── PER-SCHOOL COMPUTE (the SAME per-school engine + SCHOOL-scoped gate) ──
    // Resolve each school's operational + nearest-prior (byte-identical to
    // getMetrics' input assembly, but keeping the raw ReportBundles because
    // computeMetricsForPeriod adapts them itself), run the per-school engine, gate
    // by the SCHOOL's own entitlement, then stamp registry-formatted strings.
    const schoolResults: CompareSchool[] = await Promise.all(
      reported.map(async (r) => {
        const operational = await this.operational.operationalFor(r.schoolId, r.periodId)
        const prior = r.periodEnd ? await this.nearestPriorBundle(r.schoolId, r.periodEnd) : null
        const priorOperational = prior
          ? await this.operational.operationalFor(r.schoolId, prior.periodId)
          : null

        // The per-school engine — same one the single-school dashboard renders.
        const allMetrics = computeMetricsForPeriod({
          current: r.bundle,
          prior: prior?.bundle ?? null,
          currentOperational: operational ?? null,
          priorOperational: priorOperational ?? null,
        })

        // SCHOOL-scoped entitlement gate (NOT the org widest-set): a finance-only
        // school in the org drops its enrollment/hr metrics here, independently.
        const entitled = await entitledModulesForSchool(r.schoolId, this.billing)
        const gated = filterMetricsByEntitlement(allMetrics, entitled)

        const metrics: Record<string, CompareSchoolMetric> = {}
        for (const m of gated) {
          // resolveDisplayUnit is MANDATORY — revenue_mix/expense_mix carry unit
          // 'share' but their scalar .value (and PoP delta) is a currency total.
          // Applied to BOTH value and delta so the compare table matches the
          // single-school dashboard/scorecard byte-for-byte (value parity).
          const displayUnit = resolveDisplayUnit(m.key, m.unit)
          metrics[m.key] = {
            key: m.key,
            label: m.label,
            unit: m.unit,
            value: m.value,
            formatted: formatMetricValue(m.value, displayUnit),
            status: m.status,
            bands: m.bands,
            available: m.available,
            periodOverPeriodDelta: m.periodOverPeriodDelta,
            formattedDelta: formatMetricDelta(m.periodOverPeriodDelta, displayUnit),
            goodDirection: m.goodDirection,
          }
        }

        // Enrich with the peer-benchmarking profile: stored demographics + the
        // FY's enrollment (from the loaded operational row) → derived size band.
        const profile = buildCompareProfile(r.profileRaw, operational?.enrollment ?? null)

        return {
          schoolId: r.schoolId,
          schoolName: r.name,
          periodEndDate: r.periodEndDate,
          hasSFP: fromBundle(r.bundle).hasSFP,
          hasOperational: operational != null,
          profileComplete: isProfileComplete(r.profileRaw),
          profile,
          metrics,
        }
      }),
    )

    return {
      orgId,
      fiscalYearStart: fiscalYearStart ?? null,
      generatedAt,
      schools: schoolResults,
      notReported,
      // Canonical registry order — ALL_METRICS order (METRIC_KEYS is its key list).
      metricOrder: [...METRIC_KEYS],
    }
  }

  /**
   * School Comparison — GET /organizations/:orgId/metrics/peers/:schoolId.
   *
   * Benchmarks ONE owned school against its comparable peers in the same org.
   * REUSES getMetricsBySchool internally (same org resolution, isolation, per-school
   * metrics + the enriched profile) — no risky extraction, both endpoints benefit.
   * Forms the peer group with the PURE relaxation ladder (@finrep/analytics
   * resolvePeerGroup), computes direction-aware distribution stats
   * (computePeerStats), and adds plain-English insights. Degrades gracefully:
   * single-school org / no reporters this FY → an emptyState, never a crash.
   */
  async getPeerBenchmark(
    user: User,
    orgId: string,
    schoolId: string,
    opts: PeerBenchmarkOptions = {},
  ): Promise<PeerBenchmarkResponse> {
    const generatedAt = new Date().toISOString()
    const fiscalYearStart = opts.fiscalYearStart ?? null
    const requestedDims = parseDims(opts.dims)
    const minPeers = Math.min(50, Math.max(1, Math.trunc(opts.minPeers ?? 3)))

    // Reuse the compare surface (org resolution + isolation + per-school metrics +
    // profile). Throws NotFound/Forbidden exactly like the sibling metrics routes.
    const compare = await this.getMetricsBySchool(user, orgId, fiscalYearStart)

    const reportedById = new Map(compare.schools.map((s) => [s.schoolId, s]))
    const notReportedIds = new Set(compare.notReported.map((n) => n.schoolId))
    const totalInOrg = compare.schools.length + compare.notReported.length

    // Cross-tenant guard: the focus must be an in-org school the caller can see.
    if (!reportedById.has(schoolId) && !notReportedIds.has(schoolId)) {
      throw new ForbiddenException('That school is not in your organization.')
    }

    // Focus block — the reported CompareSchool if it reported this FY, else a
    // metrics-less shell carrying just its stored profile.
    let focus: CompareSchool
    const focusReported = reportedById.get(schoolId)
    if (focusReported) {
      focus = focusReported
    } else {
      const rec = await this.prisma.school.findUnique({ where: { id: schoolId } })
      const raw = readProfileFields(rec)
      focus = {
        schoolId,
        schoolName:
          rec?.name ??
          compare.notReported.find((n) => n.schoolId === schoolId)?.name ??
          'This school',
        periodEndDate: null,
        hasSFP: false,
        hasOperational: false,
        profileComplete: isProfileComplete(raw),
        profile: buildCompareProfile(raw, null),
        metrics: {},
      }
    }

    // Candidate pool = reported schools other than the focus (peers need metrics).
    const candidates = compare.schools.filter((s) => s.schoolId !== schoolId)

    const focusPeerProfile = toPeerProfile(schoolId, focus.profile)
    const candProfiles = candidates.map((c) => toPeerProfile(c.schoolId, c.profile))
    const grp = resolvePeerGroup(focusPeerProfile, candProfiles, requestedDims, { minPeers })

    // No peers → friendly empty state (single-school org vs. no reporters this FY).
    if (grp.matchTier === 'none' || grp.peerIds.length === 0) {
      const reason: 'single_school' | 'no_peers' = totalInOrg <= 1 ? 'single_school' : 'no_peers'
      const message =
        reason === 'single_school'
          ? 'Add another school to unlock peer benchmarking.'
          : "Your other schools haven't reported this year yet."
      return {
        orgId,
        fiscalYearStart,
        generatedAt,
        requestedDims,
        focus,
        group: {
          matchTier: 'none',
          activeDims: [],
          relaxedDims: grp.relaxedDims,
          groupDescription: describeGroup(focus.profile, []),
          peerCount: 0,
          peerIds: [],
          sample: 'none',
        },
        peers: [],
        stats: {},
        insights: [],
        emptyState: { reason, message },
      }
    }

    // Materialize peers (preserve resolvePeerGroup order) + their match reasons.
    const peers: PeerBenchmarkPeer[] = grp.peerIds
      .map((id) => candidates.find((c) => c.schoolId === id))
      .filter((c): c is CompareSchool => c != null)
      .map((c) => ({
        ...c,
        matchReasons: matchReasonsFor(
          focusPeerProfile,
          toPeerProfile(c.schoolId, c.profile),
          requestedDims,
        ),
      }))

    // Distribution stats: one per metric present on the focus + synthetic enrollment.
    const stats: Record<string, PeerStatEntry> = {}
    for (const key of Object.keys(focus.metrics)) {
      const fm = focus.metrics[key]
      const peerValues = peers
        .map((p) => p.metrics[key]?.value)
        .filter((v): v is number => v != null)
      // GoodDirection can be 'neutral' in the type; the peer stats are strictly
      // direction-aware, so a neutral metric is treated as 'higher-is-better'.
      const dir: 'higher' | 'lower' = fm.goodDirection === 'lower' ? 'lower' : 'higher'
      const st = computePeerStats(fm.value, peerValues, dir)
      const displayUnit = resolveDisplayUnit(key as MetricKey, fm.unit)
      stats[key] = {
        ...st,
        focusValue: fm.value,
        goodDirection: dir,
        focusFormatted: fm.formatted,
        medianFormatted: formatMetricValue(st.median, displayUnit),
      }
    }
    // Synthetic enrollment stat (goodDirection 'higher', integer-count formatting).
    const focusEnroll = focus.profile.enrollment
    const peerEnroll = peers
      .map((p) => p.profile.enrollment)
      .filter((v): v is number => v != null)
    const enrollStats = computePeerStats(focusEnroll, peerEnroll, 'higher')
    stats.enrollment = {
      ...enrollStats,
      focusValue: focusEnroll,
      goodDirection: 'higher',
      focusFormatted: formatCount(focusEnroll),
      medianFormatted: formatCount(enrollStats.median),
    }

    // Insights (built here — they need labels). Enrollment standing + quartiles.
    const insights: string[] = []
    if (focusEnroll != null && enrollStats.count >= 2) {
      const typeLabel = focus.profile.schoolType ?? 'school'
      insights.push(`${ordinal(enrollStats.rank)}-largest ${typeLabel} in your organization`)
    }
    for (const key of HEADLINE_METRICS) {
      const st = stats[key]
      if (!st || st.focusValue == null || st.count < 2 || st.sample === 'none') continue
      const label = (focus.metrics[key]?.label ?? key).toLowerCase()
      if (st.percentile >= 0.75) insights.push(`Top quartile on ${label}`)
      else if (st.percentile <= 0.25) insights.push(`Bottom quartile on ${label}`)
    }

    return {
      orgId,
      fiscalYearStart,
      generatedAt,
      requestedDims,
      focus,
      group: {
        matchTier: grp.matchTier,
        activeDims: grp.activeDims,
        relaxedDims: grp.relaxedDims,
        groupDescription: describeGroup(focus.profile, grp.activeDims),
        peerCount: peers.length,
        peerIds: peers.map((p) => p.schoolId),
        sample: sampleTierOf(peers.length),
      },
      peers,
      stats,
      insights,
      emptyState: null,
    }
  }
}
