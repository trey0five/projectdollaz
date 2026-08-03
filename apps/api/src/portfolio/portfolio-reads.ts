import type { PrismaService } from '../prisma/prisma.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase I — THE BOUNDED READ LAYER. This file is the whole point of the phase.
//
// THE RULE: a superintendent portfolio over a forty-school diocese must issue a
// FIXED number of queries, independent of N. Not 5N. Not one per school. A live
// twin collects 36 signals and evaluates 29 rules; forty of those is a connection
// pool exhaustion and a P2024 before anything returns. Everything below reads
// PERSISTED snapshots and PERSISTED ledgers, set-based, and nothing in here calls
// a domain service.
//
// ── WHY groupBy + tuple findMany AND NOT `DISTINCT ON` ───────────────────────
// The literal ask was "one findMany with DISTINCT ON (school_id, series_key)".
// Two things make that the wrong shape in THIS repo, and a reviewer will
// otherwise "restore" it:
//
//   1. There is ZERO `$queryRaw` anywhere under apps/api/src and this is not the
//      place to introduce the first one. A raw statement over a multi-tenant table
//      is exactly where a tenancy filter gets lost.
//   2. Prisma's `distinct` option is NOT a Postgres DISTINCT ON. Without the
//      `nativeDistinct` preview feature — which packages/db/prisma/schema.prisma
//      does not enable — the query engine applies it in memory AFTER the rows come
//      back, so `distinct` would still transfer every historical snapshot row for
//      every school. That is the opposite of the intent.
//
// `groupBy(_max: snapshotDate)` → `findMany(OR of (schoolId, seriesKey, snapshotDate)
// tuples)` is set-based, bounded by the number of SERIES rather than the number of
// DAYS, rides the existing `@@index([schoolId, seriesKey, snapshotDate(sort: Desc)])`,
// and delivers exactly what DISTINCT ON was asked for. Two queries instead of one,
// and both of them bounded.
//
// Every read carries an explicit deterministic `orderBy`. Nothing here relies on a
// database's natural row order — acceptance 6 is a byte-identity claim and a
// natural order is not a guarantee.
// ─────────────────────────────────────────────────────────────────────────────

/** The projection of a readiness snapshot the portfolio actually needs. */
export interface SnapshotRow {
  schoolId: string
  seriesKey: string
  snapshotDate: Date
  frameworkId: string | null
  readinessPct: number
  selfScoredPct: number
  verifiedPct: number
  projectedIndex: number | null
  band: string | null
  leafCount: number
  domainScores: unknown
  engineVersion: string
  verifiedBasis: string
  isDemo: boolean
}

const SNAPSHOT_SELECT = {
  schoolId: true,
  seriesKey: true,
  snapshotDate: true,
  frameworkId: true,
  readinessPct: true,
  selfScoredPct: true,
  verifiedPct: true,
  projectedIndex: true,
  band: true,
  leafCount: true,
  domainScores: true,
  engineVersion: true,
  verifiedBasis: true,
  isDemo: true,
} as const

/**
 * Open (still-live) findings: not resolved/dismissed by a human, not cleared.
 *
 * BOTH halves are required. `status` is only ever moved by a HUMAN (the Phase-D
 * invariant — reconciliation may never touch it), and `clearedAt` is the COMPUTED
 * statement that the rule stopped firing. Counting on either one alone reports a
 * different ledger from the one the twin shows.
 */
function openFindingWhere() {
  return { status: { notIn: ['resolved', 'dismissed'] }, clearedAt: null }
}

/** One open finding, projected down to the five columns the portfolio counts on. */
export interface FindingRow {
  schoolId: string
  severity: string
  initiativeId: string | null
  ruleId: string
  horizonKind: string
  horizonDate: Date | null
}

/**
 * One initiative, projected to what "overdue" and "stale" are computed from —
 * plus the two columns the VELOCITY path needs to be honest.
 *
 * `id` lets velocity join an observation back to the initiative that owns it, so
 * a CLOSED initiative can be excluded from the measurement side of the ratio by
 * exactly the rule that excludes it from the count side. `progressSource` is the
 * initiative's declared measurement series, and differencing across two series is
 * the same category error §2.2 refuses for trajectory.
 */
export interface InitiativeRow {
  id: string
  schoolId: string
  status: string
  dueDate: Date | null
  updatedAt: Date
  progressSource: string | null
}

export interface FrameworkRow {
  id: string
  code: string
  name: string
  indexMin: number | null
  indexMax: number | null
}

/** Latest recorded enrollment per school, for peer-group resolution. */
export interface EnrollmentRow {
  schoolId: string
  enrollment: number | null
  periodEndDate: Date | null
}

/**
 * QUERY 3 + 4 — the LATEST snapshot row per `(schoolId, seriesKey)`.
 *
 * Returns `[]` without issuing a second query when the group-by is empty, so a
 * diocese with no captured readiness costs one query rather than two.
 */
export async function readLatestSnapshots(
  prisma: PrismaService,
  schoolIds: readonly string[],
): Promise<SnapshotRow[]> {
  if (schoolIds.length === 0) return []
  const latest = await prisma.accreditationReadinessSnapshot.groupBy({
    by: ['schoolId', 'seriesKey'],
    where: { schoolId: { in: [...schoolIds] } },
    _max: { snapshotDate: true },
    orderBy: [{ schoolId: 'asc' }, { seriesKey: 'asc' }],
  })
  return readSnapshotTuples(prisma, latest)
}

/**
 * QUERY 5 + 6 — the TRAJECTORY BASELINE: the newest snapshot per series that is on
 * or before `baselineDay`. Same two-query shape, same index.
 */
export async function readBaselineSnapshots(
  prisma: PrismaService,
  schoolIds: readonly string[],
  baselineDay: Date,
): Promise<SnapshotRow[]> {
  if (schoolIds.length === 0) return []
  const baseline = await prisma.accreditationReadinessSnapshot.groupBy({
    by: ['schoolId', 'seriesKey'],
    where: { schoolId: { in: [...schoolIds] }, snapshotDate: { lte: baselineDay } },
    _max: { snapshotDate: true },
    orderBy: [{ schoolId: 'asc' }, { seriesKey: 'asc' }],
  })
  return readSnapshotTuples(prisma, baseline)
}

/** The shared second half: materialise the rows named by a group-by result. */
async function readSnapshotTuples(
  prisma: PrismaService,
  groups: readonly { schoolId: string; seriesKey: string; _max: { snapshotDate: Date | null } }[],
): Promise<SnapshotRow[]> {
  const tuples = groups
    .filter((g) => g._max.snapshotDate != null)
    .map((g) => ({
      schoolId: g.schoolId,
      seriesKey: g.seriesKey,
      snapshotDate: g._max.snapshotDate as Date,
    }))
  // An `OR: []` matches nothing; not issuing the query at all is both cheaper and
  // honest about the budget.
  if (tuples.length === 0) return []
  const rows = await prisma.accreditationReadinessSnapshot.findMany({
    where: { OR: tuples },
    select: SNAPSHOT_SELECT,
    orderBy: [{ schoolId: 'asc' }, { seriesKey: 'asc' }],
  })
  return rows as SnapshotRow[]
}

/**
 * QUERY 7 — the OPEN FINDINGS ledger, in ONE read.
 *
 * [DEVIATION, and it makes the budget SMALLER.] The read plan called for a
 * `groupBy(schoolId, severity)` plus a second `groupBy` for `initiativeId: null`.
 * The portfolio needs a THIRD fact from the same ledger — whether an open
 * prior-visit citation is past its stated horizon, which drives urgency 3 — and a
 * third `groupBy` on `accreditationFinding` would breach the query-budget spec's
 * "no model method is called more than twice" rule, which is the rule that
 * actually catches an O(N) fan-out. One narrow `findMany` over six scalar columns
 * answers all three, is a single round trip, and is bounded by open findings
 * (rules × scopes), not by history.
 */
export async function readOpenFindings(
  prisma: PrismaService,
  schoolIds: readonly string[],
): Promise<FindingRow[]> {
  if (schoolIds.length === 0) return []
  const rows = await prisma.accreditationFinding.findMany({
    where: { schoolId: { in: [...schoolIds] }, ...openFindingWhere() },
    select: {
      schoolId: true,
      severity: true,
      initiativeId: true,
      ruleId: true,
      horizonKind: true,
      horizonDate: true,
    },
    orderBy: [{ schoolId: 'asc' }, { id: 'asc' }],
  })
  return rows as FindingRow[]
}

/** QUERY 8 — every initiative for the in-scope schools, six columns wide. */
export async function readInitiatives(
  prisma: PrismaService,
  schoolIds: readonly string[],
): Promise<InitiativeRow[]> {
  if (schoolIds.length === 0) return []
  const rows = await prisma.improvementInitiative.findMany({
    where: { schoolId: { in: [...schoolIds] } },
    select: {
      id: true,
      schoolId: true,
      status: true,
      dueDate: true,
      updatedAt: true,
      progressSource: true,
    },
    orderBy: [{ schoolId: 'asc' }, { id: 'asc' }],
  })
  return rows as InitiativeRow[]
}

/** QUERY 9 — code / name / index scale for the frameworks actually in play. */
export async function readFrameworks(
  prisma: PrismaService,
  frameworkIds: readonly string[],
): Promise<FrameworkRow[]> {
  if (frameworkIds.length === 0) return []
  const rows = await prisma.accreditationFramework.findMany({
    where: { id: { in: [...frameworkIds] } },
    select: { id: true, code: true, name: true, indexMin: true, indexMax: true },
    orderBy: [{ code: 'asc' }],
  })
  return rows as FrameworkRow[]
}

/**
 * QUERY 10 + 11 — the nearest BINDING review date per school, future OR LAPSED.
 *
 * `AccreditationStandard.reviewDate` is the only persisted "next binding
 * accreditation date" in the schema; there is no visit-window table.
 *
 * ── WHY TWO GROUP-BYS AND NOT ONE `gte: today` ───────────────────────────────
 * A single future-only read reports a school whose review lapsed six months ago
 * as having NO review at all — urgency 0, reason `'no_scheduled_review'` — which
 * is (a) a false statement about a school that has one, and (b) backwards, since
 * a lapsed review is the MOST urgent calendar state there is. Inside one attention
 * band the most overdue school would sort BELOW a school whose visit is two years
 * out. That is precisely the "an at-risk school looks healthier than it is"
 * failure the phase exists to prevent.
 *
 * So: the earliest FUTURE date wins (that is the next binding one), and only when
 * a school has none does the latest PAST date stand in — the most recent lapse,
 * not the oldest. The caller converts to a day count, which comes out NEGATIVE
 * for a lapsed date; `computeUrgency` maps a negative count to urgency 3 with its
 * own reason, `'review_overdue'`.
 *
 * Two calls on `accreditationStandard.groupBy` keeps the "no model method more
 * than twice" query-budget rule intact and stays O(1) in the school count.
 */
export async function readNextReviewDays(
  prisma: PrismaService,
  schoolIds: readonly string[],
  today: Date,
): Promise<Map<string, Date>> {
  const out = new Map<string, Date>()
  if (schoolIds.length === 0) return out
  const ids = [...schoolIds]
  const [future, lapsed] = await Promise.all([
    prisma.accreditationStandard.groupBy({
      by: ['schoolId'],
      where: { schoolId: { in: ids }, reviewDate: { gte: today } },
      _min: { reviewDate: true },
      orderBy: [{ schoolId: 'asc' }],
    }),
    prisma.accreditationStandard.groupBy({
      by: ['schoolId'],
      where: { schoolId: { in: ids }, reviewDate: { lt: today } },
      _max: { reviewDate: true },
      orderBy: [{ schoolId: 'asc' }],
    }),
  ])
  // The lapsed pass first, so the future pass overwrites it wherever both exist.
  for (const g of lapsed as { schoolId: string; _max: { reviewDate: Date | null } }[]) {
    if (g._max?.reviewDate) out.set(g.schoolId, g._max.reviewDate)
  }
  for (const g of future) {
    if (g._min.reviewDate) out.set(g.schoolId, g._min.reviewDate)
  }
  return out
}

/**
 * QUERY 11 — latest recorded enrollment per school, for `resolvePeerGroup`.
 *
 * ONE read joined to the fiscal period, then the newest `periodEndDate` per school
 * is picked in memory. `PeriodOperationalData` carries no date of its own, so a
 * `groupBy(_max)` cannot express "latest period" without a second read anyway; the
 * row count here is (schools × periods), which is small and already bounded by the
 * same tenancy filter as everything else.
 */
export async function readLatestEnrollment(
  prisma: PrismaService,
  schoolIds: readonly string[],
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>()
  if (schoolIds.length === 0) return out
  const rows = (await prisma.periodOperationalData.findMany({
    where: { schoolId: { in: [...schoolIds] } },
    select: {
      schoolId: true,
      enrollment: true,
      fiscalPeriod: { select: { periodEndDate: true } },
    },
    orderBy: [{ schoolId: 'asc' }, { fiscalPeriodId: 'asc' }],
  })) as unknown as {
    schoolId: string
    enrollment: number | null
    fiscalPeriod: { periodEndDate: Date | null } | null
  }[]

  const best = new Map<string, EnrollmentRow>()
  for (const r of rows) {
    const end = r.fiscalPeriod?.periodEndDate ?? null
    const prev = best.get(r.schoolId)
    // Deterministic pick: latest period end wins; a row with no period end only
    // wins when nothing better exists.
    if (
      !prev ||
      (end != null && (prev.periodEndDate == null || end > prev.periodEndDate))
    ) {
      best.set(r.schoolId, { schoolId: r.schoolId, enrollment: r.enrollment, periodEndDate: end })
    }
  }
  for (const [schoolId, row] of best) out.set(schoolId, row.enrollment)
  return out
}

/** One per-school clone of a catalog standard, for the intervention priorities. */
export interface SchoolStandardRow {
  id: string
  schoolId: string
  catalogStandardId: string
  code: string
  rubricScore: number | null
}

/** §5 QUERY 1 — every catalog-linked standard clone across the in-scope schools. */
export async function readCatalogLinkedStandards(
  prisma: PrismaService,
  schoolIds: readonly string[],
): Promise<SchoolStandardRow[]> {
  if (schoolIds.length === 0) return []
  const rows = await prisma.accreditationStandard.findMany({
    where: { schoolId: { in: [...schoolIds] }, catalogStandardId: { not: null } },
    select: { id: true, schoolId: true, catalogStandardId: true, code: true, rubricScore: true },
    orderBy: [{ schoolId: 'asc' }, { id: 'asc' }],
  })
  return rows as SchoolStandardRow[]
}

/**
 * §5 QUERY 2 — evidence counts per school standard.
 *
 * `AccreditationStandard` carries no `evidenceCount` column, so the count comes
 * from a `groupBy` on the evidence table rather than from a per-standard `count`
 * in a loop. A standard with no evidence has no group and reads as 0.
 */
export async function readEvidenceCounts(
  prisma: PrismaService,
  schoolIds: readonly string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (schoolIds.length === 0) return out
  const groups = await prisma.accreditationEvidence.groupBy({
    by: ['standardId'],
    where: { schoolId: { in: [...schoolIds] } },
    _count: { _all: true },
    orderBy: [{ standardId: 'asc' }],
  })
  for (const g of groups) out.set(g.standardId, g._count._all)
  return out
}

/** §5 QUERY 3 — the shared catalog rows the clones point at. */
export interface CatalogStandardRow {
  id: string
  frameworkId: string
  code: string
  title: string
  domainKey: string | null
}

export async function readCatalogStandards(
  prisma: PrismaService,
  catalogIds: readonly string[],
): Promise<CatalogStandardRow[]> {
  if (catalogIds.length === 0) return []
  const rows = await prisma.accreditationCatalogStandard.findMany({
    where: { id: { in: [...catalogIds] } },
    select: { id: true, frameworkId: true, code: true, title: true, domainKey: true },
    orderBy: [{ code: 'asc' }, { id: 'asc' }],
  })
  return rows as CatalogStandardRow[]
}

/**
 * §4.5(3) — progress observations inside the velocity window, in one read.
 *
 * `source` IS READ, and it is load-bearing rather than decorative:
 * `ImprovementProgressEvent` is uniquely keyed on `(initiativeId, observedOn,
 * source)`, so ONE initiative can legitimately carry a `manual` reading and a
 * `metric` reading on the SAME DAY. Differencing across the two draws a direction
 * between two incomparable series — and the school's own improvement drawer,
 * which filters to the initiative's declared `progressSource`, would then disagree
 * with the diocesan page about whether the work moved.
 */
export interface ProgressEventRow {
  schoolId: string
  initiativeId: string
  observedOn: Date
  source: string
  pct: unknown
}

export async function readProgressEvents(
  prisma: PrismaService,
  schoolIds: readonly string[],
  fromDay: Date,
): Promise<ProgressEventRow[]> {
  if (schoolIds.length === 0) return []
  const rows = await prisma.improvementProgressEvent.findMany({
    where: { schoolId: { in: [...schoolIds] }, observedOn: { gte: fromDay } },
    select: { schoolId: true, initiativeId: true, observedOn: true, source: true, pct: true },
    // `id` LAST, so the order is TOTAL. Without it two rows sharing an initiative
    // and a day tie, and their relative order is the database's natural order —
    // which is not a guarantee, and which two refreshes may report differently.
    // Acceptance 6 is a byte-identity claim; it cannot rest on a tie.
    orderBy: [
      { schoolId: 'asc' },
      { initiativeId: 'asc' },
      { observedOn: 'asc' },
      { id: 'asc' },
    ],
  })
  return rows as ProgressEventRow[]
}
