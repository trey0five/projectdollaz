import { Injectable } from '@nestjs/common'
import type { FiscalPeriod } from '@finrep/db'
import {
  GRADE_KEYS,
  MIN_CELL,
  assembleMetricResult,
  cohortIdOf,
  cohortPanelPlan,
  getMetric,
  gradeKeyOfRank,
  gradeRankOf,
  suppressSmallCell,
  type GradeKey,
  type MetricKey,
  type MetricResult,
  type PeriodFinancials,
  type PeriodOperational,
  type Suppressible,
} from '@finrep/analytics'
import { PrismaService } from '../../prisma/prisma.service.js'
import { PeriodsService } from '../../periods/periods.service.js'
import { BillingService } from '../../billing/billing.service.js'
import { toPeriodOperational } from '../../analytics/operational.service.js'
import {
  EnrollmentPlanService,
  type EnrollmentPlanResolution,
} from '../../analytics/enrollment-plan.js'
import { entitledModulesForSchool, filterMetricsByEntitlement } from '../../analytics/metric-gating.js'
import { EnrollmentService, fyEndForObservedOn } from '../enrollment.service.js'
import { StudentsService } from '../students/students.service.js'
import type { EnrollmentAnalyticsQueryDto } from './dto/enrollment-analytics.dto.js'

// ─────────────────────────────────────────────────────────────────────────────
// Enrollment Analytics (Phase 1) — everything the analytics tab draws, computed
// HERE.
//
// The contract with the web is that it paints and never calculates: every figure
// below is either a registry MetricResult or a field this service worked out, so
// two surfaces cannot disagree about a number by disagreeing about a rounding
// rule. That is also why there is no "raw byGrade" field — handing the client the
// maps and letting it total them is exactly the arithmetic this endpoint exists
// to absorb.
//
// ZERO Prisma changes. Every number here already existed in enrollment_snapshots,
// period_operational_data or the roster; what was missing was one place that
// reads them honestly.
// ─────────────────────────────────────────────────────────────────────────────

/** The four tiles the hero band asks for, in reading order. */
const TILE_KEYS: MetricKey[] = [
  'enrollment_headcount',
  'enrollment_vs_plan',
  'enrollment_change_yoy',
  'student_teacher_ratio',
]

/**
 * The tiles this service is actually allowed to compute.
 *
 * All four TILE_KEYS read PeriodOperational ONLY — none of them touches the
 * financial statements — which is what lets an enrollment page render before a
 * single trial balance has been uploaded. NO_FINANCIALS below encodes that, and
 * this filter enforces it: if a future edit adds a metric with a `financials`
 * input to TILE_KEYS, it is DROPPED here rather than reading a field off an empty
 * object and throwing at request time. Derived from the registry's own declared
 * input specs, so it cannot drift from what the metrics really consume.
 */
const OPERATIONAL_ONLY_TILE_KEYS: MetricKey[] = TILE_KEYS.filter((key) =>
  (getMetric(key).inputs ?? []).every((i) => i.source === 'operational'),
)

/**
 * The financial struct passed to the tile metrics: deliberately EMPTY.
 *
 * A zero-filled PeriodFinancials would be a lie — it says "this school reported
 * $0 of revenue", which is a claim, not an absence. None of the four tile metrics
 * dereferences it (see OPERATIONAL_ONLY_TILE_KEYS, which proves that from the
 * registry rather than from this comment), so the honest value to pass is nothing
 * at all.
 */
const NO_FINANCIALS = {} as PeriodFinancials

/**
 * How far apart two readings may sit in the school calendar and still be compared.
 *
 * Enrollment is seasonal: a September count and a January count differ by the
 * autumn's withdrawals, so subtracting one from the other measures the calendar,
 * not the school. Thirty days is roughly the width of the enrollment "plateau"
 * either side of a census date. Past it we refuse the subtraction and say why.
 */
const YOY_ALIGNMENT_TOLERANCE_DAYS = 30

/**
 * The smallest change in a cohort's size worth calling a direction.
 *
 * A cohort that goes 24 → 25 has not grown; it has admitted one child, and one
 * family moving town would undo it. Three students is roughly a fifth of a
 * section in a small school and is the smallest move a head of school would
 * describe out loud as the class getting bigger. TUNABLE product default, stated
 * in the payload's own explainer note rather than left implicit.
 */
const COHORT_MOVE_FLOOR = 3

/**
 * The cohort ladder's LENGTH — how many consecutive grades one panel follows.
 *
 * Panels of different lengths are not comparable. A class caught two rungs into
 * its time here has half the room to move of one followed for five, so a grid
 * that mixes them reads the short panels as the steady ones and the finding is
 * an artefact of the window. Every panel therefore has EXACTLY `window` legs —
 * a rung with no reading keeps its slot as a null — and the reader picks the
 * length, exactly as they do on the academics cohort view.
 *
 * The floor is 2 (one rung is a dot, not a progression) and the ceiling is 5,
 * which is also the ceiling on years of history this endpoint will read.
 */
const MIN_COHORT_WINDOW = 2
const MAX_COHORT_WINDOW = 5

/**
 * How many panels one screen may carry, matching the academics grid.
 *
 * A K-12 school at a two-grade window has thirteen possible ladders, which is a
 * wall rather than a comparison. The HIGHEST end grades are kept — the most
 * recent thing that happened to the oldest children on file — and the honest
 * denominator ships beside them as `panelsAvailable`.
 */
const MAX_COHORT_PANELS = 12

/** Beyond this many days a roster reading is described as possibly out of date. */
const STALE_AFTER_DAYS = 45

const DAY_MS = 24 * 60 * 60 * 1000

// ── Response shape ───────────────────────────────────────────────────────────

export interface EnrollmentAsOf {
  /** The real date the reading describes. Never "now" for a filed snapshot. */
  observedOn: string
  provider: string | null
  /** 'roster' = the live register; 'snapshot' = a dated file/sync reading. */
  source: 'roster' | 'snapshot'
  /** Age of the reading in days at the as-of date. */
  staleDays: number
  /** True past STALE_AFTER_DAYS — the web's amber chip, decided server-side. */
  stale: boolean
}

export interface EnrollmentTrendPoint {
  observedOn: string
  total: number
  provider: string
}

export interface EnrollmentYoY {
  /**
   * 'annual' compares the two fiscal periods' own canonical headcounts — like
   * with like by construction. 'dated' compares two snapshots and therefore has
   * to earn the comparison through day-of-year alignment.
   */
  basis: 'annual' | 'dated'
  current: { label: string; total: number } | null
  prior: { label: string; total: number } | null
  /** Days apart in the school calendar. Null on the annual basis (no day to align). */
  alignedWithinDays: number | null
  comparable: boolean
  /** Printed INSTEAD of a delta when comparable is false. */
  alignmentNote: string | null
  delta: number | null
  deltaPct: number | null
}

export interface EnrollmentTrend {
  points: EnrollmentTrendPoint[]
  /** Dashed reference line on the chart; null when no plan is set. */
  planTotal: number | null
}

export interface GradeYearCell {
  grade: GradeKey
  schoolYear: number
  count: Suppressible<number>
}

export interface GradeByYear {
  /** Ascending school years (the FY end year: 2025-26 => 2026). */
  years: number[]
  /** Only grades the school actually has — PK3..8 are ABSENT, not zeroed. */
  grades: GradeKey[]
  cells: GradeYearCell[]
  /** The observation each column was taken from, so the header can date itself. */
  observedByYear: { schoolYear: number; observedOn: string; total: number }[]
}

export interface LadderRow {
  grade: GradeKey
  count: Suppressible<number>
  /** DROPS whenever count is suppressed — a masked count beside a live share is
   *  trivially invertible (share × total = the count you just hid). */
  share: Suppressible<number>
}

export interface EnrollmentLadder {
  observedOn: string
  total: number
  rows: LadderRow[]
  /** Null when any rung is suppressed: the narrowest VISIBLE rung is not the
   *  narrowest rung, and calling it that would be false. */
  narrowestRung: { grade: GradeKey; count: number } | null
  narrowestRungWithheldReason: string | null
}

export interface CohortLegPoint {
  grade: GradeKey
  schoolYear: number
  /** value null + suppressed false = the year is simply missing (never zeroed,
   *  never interpolated); suppressed true = present but under the cell floor. */
  count: Suppressible<number>
}

export interface CohortSizeEntry {
  id: number
  /** "Class of 2030" — the year this cohort would finish grade 12. */
  label: string
  graduationYear: number
  startGrade: GradeKey
  endGrade: GradeKey
  startYear: number
  endYear: number
  legs: CohortLegPoint[]
  /** Strictly end − start. Null when either END is missing or suppressed. */
  netChange: number | null
  direction: 'grew' | 'shrank' | 'held' | 'unknown'
}

/**
 * The grades this school actually has, and what ladder lengths they support.
 *
 * DERIVED FROM THE READINGS ON FILE, never from the school profile — the same
 * argument the academics cohort span makes: the readings are a fact, the profile
 * field is a label somebody typed. A 9-12 school can then never be offered a
 * "grades 2 → 5" panel whatever its profile claims.
 */
export interface CohortGradeSpan {
  low: GradeKey | null
  high: GradeKey | null
  /** high − low + 1: the CONTIGUOUS span, so a school missing one middle grade
   *  still has its full ladder and that grade shows up as a missing rung. */
  gradeDepth: number
  /** School YEARS of grade-level readings in the window being drawn. */
  yearDepth: number
  /** The longest ladder both depths support; 0 when none is possible. */
  maxWindow: number
}

export interface CohortSize {
  cohorts: CohortSizeEntry[]
  /** Shared y-scale for the small multiples, so the panels are comparable. */
  maxCount: number | null
  /**
   * The ladder length the server ACTUALLY used. Every entry above has exactly
   * this many legs — the UI reads this rather than counting a panel's points,
   * which would make an all-missing panel look like a shorter cohort.
   */
  window: number
  /** What the caller asked for (or the server's own default when they did not),
   *  so the view can say "narrowed" ONLY when the server really narrowed it. A
   *  reader who deliberately picked two years is not told they compromised. */
  requestedWindow: number
  /** The lengths this school's data can support, ascending. A control cannot
   *  offer an option the data cannot answer. */
  availableWindows: number[]
  /** Every panel finishes in this school year — see buildCohortSize. */
  endYear: number
  gradeSpan: CohortGradeSpan
  /** Panels the span supports before the cap — the honest denominator. */
  panelsAvailable: number
  truncated: boolean
  /** Why the grid is empty at this length, when it is. Null when it is not. */
  reason: string | null
}

export interface VsPlanRow {
  grade: GradeKey
  actual: Suppressible<number>
  /** Suppressed WITH the actual: plan and gap re-derive it by subtraction. */
  plan: Suppressible<number>
  gap: Suppressible<number>
  gapPct: Suppressible<number>
}

export interface VsPlan {
  rows: VsPlanRow[]
  /**
   * School TOTALS are never suppressed — a whole-school figure identifies nobody
   * — and they are summed from the ROWS above, so the table a head of school
   * defends in a board meeting adds up.
   */
  totals: {
    actual: number
    plan: number
    gap: number
    gapPct: number | null
    /**
     * The period-anchored enrollment_vs_plan tile, carried alongside so the two
     * can be COMPARED rather than left to disagree on screen.
     *
     * The tile reads period_operational_data (the promoted headcount every other
     * surface quotes); this table reads the observation the page is drawing.
     * Identical whenever the register has not moved since the last promote —
     * which is what `agreesWithTile` states, and what a live call proved is not
     * always true (a table reading -3.11% under a tile reading -3.33%).
     */
    tileGapPct: number | null
    agreesWithTile: boolean
  }
  planSource: 'driver_budget' | 'planned_by_grade'
  /** Always false here: a resolve FAILURE yields vsPlan null + planFailed true. */
  planFailed: false
}

export interface DemographicCell {
  key: string
  count: Suppressible<number>
  share: Suppressible<number>
}

export interface DemographicDimension {
  cells: DemographicCell[]
  /** Present on race only (Blau/Simpson), computed by the canonical layer. */
  diversityIndex?: number
}

export interface EnrollmentDemographics {
  observedOn: string
  source: 'roster' | 'snapshot'
  totalEnrolled: number
  gender: DemographicDimension | null
  ethnicity: DemographicDimension | null
  race: DemographicDimension | null
}

export interface EnrollmentMix {
  status: { enrolled: number; waitlist: number; withdrawn: number; graduated: number }
  /** Support flags are suppressed HARD: one ELL child in a 40-pupil school is a name. */
  flags: { iep: Suppressible<number>; plan504: Suppressible<number>; ell: Suppressible<number>; any: Suppressible<number> }
  /**
   * What fraction of the register carries a start date. The OneRoster importer
   * writes enrolledOn: null, so on those rosters "new this year" would compute a
   * confident 0. `complete` false means the count below is withheld, not zero.
   */
  datedCoverage: { withStartDate: number; total: number; complete: boolean }
  newThisYear: Suppressible<number>
}

/**
 * The promoted, period-anchored headcount beside the reading on screen.
 *
 * The tiles come from period_operational_data (what the briefing, the scorecard
 * and the org roll-up all quote); the grade views come from the current reading.
 * Normally identical. They drift when the register moves after the last promote
 * — and a live call against real data found exactly that, 435 promoted against
 * 436 on the register. Publishing the pair with a flag turns a page that quietly
 * showed two different numbers into one that reports a reconciliation task.
 */
export interface EnrollmentReconciliation {
  /** period_operational_data.enrollment — what every other surface quotes. */
  promoted: number | null
  /** The reading the grade-level views on this page are drawn from. */
  currentReading: number | null
  diverged: boolean
}

export interface UnavailableChart {
  key: string
  label: string
  reason: string
}

export interface EnrollmentAnalyticsView {
  scope: 'school'
  schoolId: string
  period: { id: string; label: string; periodEndDate: string } | null
  asOf: EnrollmentAsOf | null
  tiles: MetricResult[]
  trend: EnrollmentTrend
  yoy: EnrollmentYoY | null
  gradeByYear: GradeByYear | null
  ladder: EnrollmentLadder | null
  cohortSize: CohortSize | null
  vsPlan: VsPlan | null
  /** True only when the plan READ errored — absence of a plan is planFailed false. */
  planFailed: boolean
  /** The promoted-vs-on-screen headcount pair; null when there is no reading. */
  reconciliation: EnrollmentReconciliation | null
  demographics: EnrollmentDemographics | null
  mix: EnrollmentMix | null
  /** Server-authored honesty lines. The web prints them; it does not compose them. */
  notes: string[]
  /** Charts the deck's reader will look for and we will NOT fake, each with a WHY. */
  unavailable: UnavailableChart[]
  /** The cell floor, so the UI's explainer and the server can never disagree. */
  minCell: number
}

// ── Helpers (pure) ───────────────────────────────────────────────────────────

const iso = (d: Date): string => d.toISOString().slice(0, 10)

/** The school YEAR a date belongs to: the FY end year (2025-09-15 => 2026). */
function schoolYearOf(observedOn: string): number {
  return Number(fyEndForObservedOn(observedOn).slice(0, 4))
}

/** Days from that school year's Jul 1 to the observation — the seasonal position. */
function dayOfSchoolYear(observedOn: string): number {
  const start = Date.UTC(schoolYearOf(observedOn) - 1, 6, 1)
  return Math.round((Date.parse(`${observedOn}T00:00:00.000Z`) - start) / DAY_MS)
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (Date.parse(`${toIso}T00:00:00.000Z`) - Date.parse(`${fromIso}T00:00:00.000Z`)) / DAY_MS,
  )
}

/** Keep only the canonical grade keys carrying a finite positive count. */
function cleanByGrade(raw: unknown): Partial<Record<GradeKey, number>> {
  const out: Partial<Record<GradeKey, number>> = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  const src = raw as Record<string, unknown>
  for (const g of GRADE_KEYS) {
    const n = src[g]
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) out[g] = n
  }
  return out
}

/** Suppress a COUNT by its own size (the count is both the value and the cohort). */
function cell(count: number | null): Suppressible<number> {
  return count === null ? { value: null, suppressed: false } : suppressSmallCell(count, count)
}

/** A dimension of counts → suppressed cells whose share DROPS with the count. */
function dimensionOf(
  counts: Record<string, number> | null | undefined,
  total: number,
  diversityIndex?: number,
): DemographicDimension | null {
  if (!counts || Object.keys(counts).length === 0) return null
  const cells: DemographicCell[] = Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, n]) => {
      const c = cell(n)
      return {
        key,
        count: c,
        share: c.suppressed
          ? { value: null, suppressed: true }
          : { value: total > 0 ? n / total : null, suppressed: false },
      }
    })
  return diversityIndex === undefined ? { cells } : { cells, diversityIndex }
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class EnrollmentAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: PeriodsService,
    private readonly billing: BillingService,
    private readonly enrollment: EnrollmentService,
    private readonly students: StudentsService,
    private readonly plan: EnrollmentPlanService,
  ) {}

  async analytics(
    schoolId: string,
    query: EnrollmentAnalyticsQueryDto = {},
  ): Promise<EnrollmentAnalyticsView> {
    const asOfDate = (query.asOf ?? new Date().toISOString()).slice(0, 10)
    const yearWindow = Math.min(Math.max(Number(query.years ?? 5) || 5, 1), 5)

    // Tenant isolation: an explicit periodId goes through getOwnedPeriod (throws
    // on a cross-tenant id); the implicit path only ever resolves periods that
    // are already scoped to this school.
    const period = query.periodId
      ? await this.periods.getOwnedPeriod(schoolId, query.periodId)
      : await this.resolveAnchorPeriod(schoolId, asOfDate)

    // The plan is resolved ONCE and shared by the tile metric, the per-grade
    // table and the trend's reference line, so a page cannot show a vs-plan tile
    // computed off one plan and a vs-plan table computed off another.
    const planRes: EnrollmentPlanResolution = period
      ? await this.plan
          .resolveDetailed(schoolId, period.id)
          .catch(() => ({ plan: null, failed: true }))
      : { plan: null, failed: false }

    const [summary, rows, tiles] = await Promise.all([
      this.enrollment.summary(schoolId, period?.id),
      this.readSnapshots(schoolId, asOfDate),
      this.buildTiles(schoolId, period, planRes),
    ])

    // ONE READING FEEDS EVERY GRADE-LEVEL VIEW. In roster mode the live register
    // is more current than the last filed snapshot, so summary() answers "today"
    // while the snapshot series stops at the last sync. Left unmerged, the ladder
    // read the register and the heatmap read the file, and a live call showed
    // grade 11 as 106 in one and 105 in the other — the exact disagreement this
    // endpoint exists to prevent. Folding the current reading in as its own dated
    // point makes the trend, the grid, the ladder, vs-plan and the cohort ends all
    // quote the same observation. In snapshot mode it is already the latest row,
    // so the merge is a no-op.
    const perDay = dedupeLatestPerDay([...rows, ...currentReadingRow(summary)])
    const perYear = latestPerSchoolYear(perDay)
    const windowYears = [...perYear.keys()].sort((a, b) => a - b).slice(-yearWindow)

    const asOf = this.buildAsOf(summary, asOfDate)
    const trend: EnrollmentTrend = {
      points: perDay.map((r) => ({
        observedOn: r.observedOn,
        total: r.totalEnrolled,
        provider: r.provider,
      })),
      planTotal: planRes.plan?.planTotal ?? null,
    }
    const yoy = await this.buildYoY(schoolId, period, perDay)
    const gradeByYear = buildGradeByYear(perYear, windowYears)
    const ladder = buildLadder(perDay, summary)
    // The ladder LENGTH is the reader's, clamped to what this school's grades
    // and history can evidence — see buildCohortSize.
    const cohortSize = buildCohortSize(gradeByYear, query.cohortWindow)
    const vsPlan = buildVsPlan(
      latestByGrade(perDay, summary),
      planRes,
      tiles.find((t) => t.key === 'enrollment_vs_plan')?.value ?? null,
    )

    const promoted = tiles.find((t) => t.key === 'enrollment_headcount')?.value ?? null
    const currentReading = summary.latest?.totalEnrolled ?? null
    const reconciliation: EnrollmentReconciliation | null =
      currentReading === null && promoted === null
        ? null
        : { promoted, currentReading, diverged: promoted !== null && promoted !== currentReading }

    const [demographics, mix] = await Promise.all([
      this.buildDemographics(schoolId, period?.id),
      summary.source === 'roster' ? this.buildMix(schoolId) : Promise.resolve(null),
    ])

    return {
      scope: 'school',
      schoolId,
      period: period
        ? { id: period.id, label: period.label, periodEndDate: iso(period.periodEndDate) }
        : null,
      asOf,
      tiles,
      trend,
      yoy,
      gradeByYear,
      ladder,
      cohortSize,
      vsPlan,
      planFailed: planRes.plan === null && planRes.failed,
      reconciliation,
      demographics,
      mix,
      notes: this.buildNotes({
        asOf,
        period,
        planRes,
        trend,
        yoy,
        gradeByYear,
        ladder,
        vsPlan,
        mix,
        summary,
        reconciliation,
      }),
      unavailable: UNAVAILABLE_CHARTS,
      minCell: MIN_CELL,
    }
  }

  // ── Reads ──────────────────────────────────────────────────────────────────

  /**
   * The anchor period when the caller named none: the CURRENT fiscal year,
   * resolved READ-ONLY (a GET must never create a period), falling back to the
   * school's most recent period so a school whose FY row was never created still
   * gets tiles instead of an empty page.
   */
  private async resolveAnchorPeriod(schoolId: string, asOfDate: string): Promise<FiscalPeriod | null> {
    const current = await this.periods.resolveExistingForImport(
      schoolId,
      fyEndForObservedOn(asOfDate),
    )
    if (current) return current
    return this.prisma.fiscalPeriod.findFirst({
      where: { schoolId, periodEndDate: { lte: new Date(`${asOfDate}T00:00:00.000Z`) } },
      orderBy: { periodEndDate: 'desc' },
    })
  }

  private async readSnapshots(schoolId: string, asOfDate: string): Promise<SnapshotRow[]> {
    const rows = await this.prisma.enrollmentSnapshot.findMany({
      where: { schoolId, observedOn: { lte: new Date(`${asOfDate}T00:00:00.000Z`) } },
      // Ascending on BOTH keys so "the last row for a day" is deterministically
      // the most recently written one — several readings land on one date (a file
      // import in the morning, the roster auto-sync after the registrar's edit).
      orderBy: [{ observedOn: 'asc' }, { createdAt: 'asc' }],
      select: { observedOn: true, provider: true, totalEnrolled: true, byGrade: true },
    })
    return rows.map((r) => ({
      observedOn: iso(r.observedOn),
      provider: r.provider as string,
      totalEnrolled: r.totalEnrolled,
      byGrade: cleanByGrade(r.byGrade),
    }))
  }

  // ── Tiles ──────────────────────────────────────────────────────────────────

  /**
   * The hero tiles, computed through the SAME registry the dashboard and the
   * briefing use, so the number on this page and the number on the scorecard are
   * one number by construction rather than by agreement.
   *
   * Only `available` metrics are returned: a tile that renders "—" teaches the
   * reader to ignore tiles. The module gate is applied too — a school licensed
   * for enrollment but not HR gets three tiles, not a fourth reading "unavailable".
   */
  private async buildTiles(
    schoolId: string,
    period: FiscalPeriod | null,
    planRes: EnrollmentPlanResolution,
  ): Promise<MetricResult[]> {
    if (!period) return []

    const curRow = await this.prisma.periodOperationalData.findUnique({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
    })
    if (!curRow) return []
    const curOp: PeriodOperational = toPeriodOperational(curRow)
    curOp.enrollmentPlan = planRes.plan?.planTotal ?? null

    // Nearest PRIOR period that actually carries an operational row, walking back
    // past periods that have none — a gap in the operational history must not
    // silently kill the year-over-year tile.
    const priorRow = await this.prisma.periodOperationalData.findFirst({
      where: { schoolId, fiscalPeriod: { periodEndDate: { lt: period.periodEndDate } } },
      orderBy: { fiscalPeriod: { periodEndDate: 'desc' } },
    })
    const priorOp = priorRow ? toPeriodOperational(priorRow) : undefined

    const results = OPERATIONAL_ONLY_TILE_KEYS.map((key) => {
      const def = getMetric(key)
      const out = def.compute(NO_FINANCIALS, undefined, curOp, priorOp)
      // Same period-over-period rule the shared evaluate() applies: recompute the
      // metric ON the prior period and subtract, only when BOTH resolved.
      let pop: number | null = null
      if (priorOp && out.available && out.value !== null) {
        const priorOut = def.compute(NO_FINANCIALS, undefined, priorOp, undefined)
        if (priorOut.available && priorOut.value !== null) pop = out.value - priorOut.value
      }
      return assembleMetricResult(def, out, pop)
    }).filter((m) => m.available)

    const entitled = await entitledModulesForSchool(schoolId, this.billing)
    return filterMetricsByEntitlement(results, entitled)
  }

  // ── As-of / freshness ──────────────────────────────────────────────────────

  private buildAsOf(
    summary: Awaited<ReturnType<EnrollmentService['summary']>>,
    asOfDate: string,
  ): EnrollmentAsOf | null {
    if (!summary.latest) return null
    const staleDays = Math.max(0, daysBetween(summary.latest.observedOn, asOfDate))
    return {
      observedOn: summary.latest.observedOn,
      provider: summary.provider,
      source: summary.source,
      staleDays,
      stale: staleDays > STALE_AFTER_DAYS,
    }
  }

  // ── E1 tail: year-over-year, like with like or not at all ──────────────────

  /**
   * Prefers the ANNUAL basis — the two fiscal periods' own stored headcounts —
   * because one canonical point per year is same-point-in-year by construction.
   * Only when that is unavailable does it fall back to comparing two dated
   * snapshots, and then it has to earn the comparison: the prior-year reading
   * closest in the school calendar, refused past the tolerance.
   */
  private async buildYoY(
    schoolId: string,
    period: FiscalPeriod | null,
    perDay: SnapshotRow[],
  ): Promise<EnrollmentYoY | null> {
    if (period) {
      const [cur, prior] = await Promise.all([
        this.prisma.periodOperationalData.findUnique({
          where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
          select: { enrollment: true },
        }),
        this.prisma.periodOperationalData.findFirst({
          where: {
            schoolId,
            enrollment: { not: null },
            fiscalPeriod: { periodEndDate: { lt: period.periodEndDate } },
          },
          orderBy: { fiscalPeriod: { periodEndDate: 'desc' } },
          select: { enrollment: true, fiscalPeriod: { select: { label: true } } },
        }),
      ])
      if (cur?.enrollment != null && prior?.enrollment != null && prior.enrollment > 0) {
        const delta = cur.enrollment - prior.enrollment
        return {
          basis: 'annual',
          current: { label: period.label, total: cur.enrollment },
          prior: { label: prior.fiscalPeriod?.label ?? 'Prior year', total: prior.enrollment },
          alignedWithinDays: null,
          comparable: true,
          alignmentNote: null,
          delta,
          deltaPct: delta / prior.enrollment,
        }
      }
    }

    const latest = perDay[perDay.length - 1]
    if (!latest) return null
    const curYear = schoolYearOf(latest.observedOn)
    const curDay = dayOfSchoolYear(latest.observedOn)
    const candidates = perDay.filter((r) => schoolYearOf(r.observedOn) === curYear - 1)
    if (candidates.length === 0) return null

    let best = candidates[0]
    let bestGap = Math.abs(dayOfSchoolYear(best.observedOn) - curDay)
    for (const c of candidates.slice(1)) {
      const gap = Math.abs(dayOfSchoolYear(c.observedOn) - curDay)
      if (gap < bestGap) {
        best = c
        bestGap = gap
      }
    }

    const comparable = bestGap <= YOY_ALIGNMENT_TOLERANCE_DAYS
    const delta = latest.totalEnrolled - best.totalEnrolled
    return {
      basis: 'dated',
      current: { label: latest.observedOn, total: latest.totalEnrolled },
      prior: { label: best.observedOn, total: best.totalEnrolled },
      alignedWithinDays: bestGap,
      comparable,
      alignmentNote: comparable
        ? null
        : `Last year's nearest reading is ${bestGap} days off this one in the school calendar — enrollment moves with the calendar, so the two are not a like-for-like comparison.`,
      // Withheld, not hidden: the numbers are both above, and the note says why
      // subtracting them would describe the calendar rather than the school.
      delta: comparable ? delta : null,
      deltaPct:
        comparable && best.totalEnrolled > 0 ? delta / best.totalEnrolled : null,
    }
  }

  // ── E5 demographics ────────────────────────────────────────────────────────

  private async buildDemographics(
    schoolId: string,
    periodId?: string,
  ): Promise<EnrollmentDemographics | null> {
    // Read through the service that owns the canonical shares + diversity index
    // rather than re-deriving them; this layer only adds the suppression the
    // register-gated endpoint deliberately leaves to its (row-level) callers.
    const view = await this.enrollment.demographics(schoolId, periodId)
    if (!view) return null
    const total = view.totalEnrolled
    return {
      observedOn: view.observedOn,
      source: view.source,
      totalEnrolled: total,
      gender: dimensionOf(view.gender?.counts, total),
      ethnicity: dimensionOf(view.ethnicity?.counts, total),
      race: dimensionOf(view.race?.counts, total, view.race?.diversityIndex),
    }
  }

  // ── E7 status & support mix (roster mode only) ─────────────────────────────

  /**
   * ROSTER MODE ONLY, and that is a claim about the world rather than a
   * convenience: a snapshot's byStatus is an artifact of one export file (how
   * many rows that CSV happened to mark withdrawn), whereas the register's
   * statuses are the school's current answer about living students.
   */
  private async buildMix(schoolId: string): Promise<EnrollmentMix | null> {
    const [agg, withStartDate, total] = await Promise.all([
      this.students.aggregate(schoolId, {}).catch(() => null),
      this.prisma.student.count({ where: { schoolId, status: 'enrolled', enrolledOn: { not: null } } }),
      this.prisma.student.count({ where: { schoolId, status: 'enrolled' } }),
    ])
    // One optional block on the page is not worth failing the whole read for: a
    // register aggregate that cannot be produced drops the mix card, it does not
    // take the headcount, the trend and the plan down with it.
    if (!agg?.counts) return null
    const complete = total > 0 && withStartDate === total
    return {
      status: {
        enrolled: agg.counts.status.enrolled ?? 0,
        waitlist: agg.counts.status.waitlist ?? 0,
        withdrawn: agg.counts.status.withdrawn ?? 0,
        graduated: agg.counts.status.graduated ?? 0,
      },
      flags: {
        iep: cell(agg.counts.flags.iep),
        plan504: cell(agg.counts.flags.plan504),
        ell: cell(agg.counts.flags.ell),
        any: cell(agg.counts.flags.any),
      },
      datedCoverage: { withStartDate, total, complete },
      // WITHHELD, not zeroed, when start dates are incomplete. The OneRoster
      // importer stores enrolledOn: null, so on those registers a "new this year"
      // count would be a confident 0 — the most damaging kind of wrong number,
      // because it looks like an answer.
      newThisYear: complete ? cell(agg.kpis.newThisYear) : { value: null, suppressed: true },
    }
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  private buildNotes(ctx: {
    asOf: EnrollmentAsOf | null
    period: FiscalPeriod | null
    planRes: EnrollmentPlanResolution
    trend: EnrollmentTrend
    yoy: EnrollmentYoY | null
    gradeByYear: GradeByYear | null
    ladder: EnrollmentLadder | null
    vsPlan: VsPlan | null
    mix: EnrollmentMix | null
    summary: Awaited<ReturnType<EnrollmentService['summary']>>
    reconciliation: EnrollmentReconciliation | null
  }): string[] {
    const notes: string[] = []

    if (!ctx.asOf) {
      notes.push(
        'No enrollment reading has been filed yet, so this page has nothing to describe. Connect a SIS, upload a roster, or enter a headcount to start it.',
      )
    } else if (ctx.asOf.source === 'roster') {
      notes.push(
        `These figures are counted live from your student register as it stands on ${ctx.asOf.observedOn}.`,
      )
    } else {
      notes.push(
        `These figures come from the enrollment reading filed for ${ctx.asOf.observedOn}${
          ctx.asOf.provider ? ` via ${ctx.asOf.provider}` : ''
        } — a dated file, not a live count.`,
      )
    }

    if (ctx.reconciliation?.diverged) {
      const { promoted, currentReading } = ctx.reconciliation
      notes.push(
        `The headcount promoted to ${
          ctx.period?.label ?? 'this year'
        } is ${promoted}, but the reading on this page counts ${currentReading}. The register has changed since the last promote, which is also why the tile and the vs-plan table differ — re-sync so the tiles, the board pack and this page quote one number.`,
      )
    }

    if (ctx.asOf?.stale) {
      notes.push(
        `That reading is ${ctx.asOf.staleDays} days old and may not reflect today's register.`,
      )
    }

    if (!ctx.period) {
      notes.push(
        'No fiscal year is set up for this date, so the year-anchored figures (plan, year-over-year, ratios) cannot be resolved.',
      )
    }

    if (ctx.planRes.plan === null && ctx.planRes.failed) {
      notes.push(
        'The enrollment plan could not be read, so actual-versus-plan is withheld. That is a read failure, not an absence of a plan.',
      )
    } else if (ctx.planRes.plan === null) {
      notes.push(
        `No enrollment plan has been entered${
          ctx.period ? ` for ${ctx.period.label}` : ''
        }, so there is nothing to compare actuals against yet.`,
      )
    } else if (ctx.planRes.plan.source === 'planned_by_grade') {
      notes.push(
        'The plan shown is the target entered on the enrollment form, not an approved budget grid.',
      )
    }

    if (ctx.trend.points.length === 1) {
      notes.push(
        'Only one reading is on file, so there is no line to draw yet — the trend starts with your next reading.',
      )
    }

    if (ctx.yoy?.comparable === false && ctx.yoy.alignmentNote) {
      notes.push(ctx.yoy.alignmentNote)
    }

    const years = ctx.gradeByYear?.years.length ?? 0
    if (years <= 1) {
      notes.push(
        'Only one school year of grade-level data is on file, so cohorts cannot be followed up the grades yet. That unlocks with next year’s reading.',
      )
    } else {
      notes.push(
        `Cohort panels follow a class up the grades; a move of fewer than ${COHORT_MOVE_FLOOR} students is reported as holding steady rather than as a direction. Following a rung is not following the same children — transfers in and out are invisible here, so this is class SIZE, not retention.`,
      )
    }

    const suppressed = countSuppressed(ctx)
    if (suppressed > 0) {
      notes.push(
        `${suppressed} figure${suppressed === 1 ? '' : 's'} on this page ${
          suppressed === 1 ? 'is' : 'are'
        } hidden because fewer than ${MIN_CELL} students would be identifiable. Hidden cells are blank, never zero, and their shares are dropped too.`,
      )
    }

    if (ctx.mix && !ctx.mix.datedCoverage.complete) {
      notes.push(
        `Start dates are recorded for ${ctx.mix.datedCoverage.withStartDate} of ${ctx.mix.datedCoverage.total} enrolled students, so "new this year" is withheld rather than reported as a number that would be wrong.`,
      )
    }

    if (ctx.summary.source === 'snapshot') {
      notes.push(
        'Status and support-needs mix are only shown for schools whose register lives here — a file export’s status counts describe the file, not the school.',
      )
    }

    return notes
  }
}

// ── Pure builders (unit-testable without a service) ──────────────────────────

interface SnapshotRow {
  observedOn: string
  provider: string
  totalEnrolled: number
  byGrade: Partial<Record<GradeKey, number>>
}

/**
 * ONE reading per calendar day — the last one written.
 *
 * Several rows legitimately share a date: a morning file import and the roster
 * auto-sync that fires after the registrar's afternoon edit. Plotting both draws
 * a vertical line on that day and makes the same day count twice in every
 * downstream total.
 */
export function dedupeLatestPerDay(rows: SnapshotRow[]): SnapshotRow[] {
  const byDay = new Map<string, SnapshotRow>()
  for (const r of rows) byDay.set(r.observedOn, r) // input is asc by (day, createdAt)
  return [...byDay.values()].sort((a, b) => a.observedOn.localeCompare(b.observedOn))
}

/**
 * The CURRENT reading as a dated row, so it can join the snapshot series.
 *
 * In roster mode this is the live register as of today, which is a real
 * observation and the most current one the school has. Returning it as a row
 * rather than special-casing it in four builders is what keeps the four builders
 * agreeing.
 */
function currentReadingRow(summary: {
  latest: { observedOn: string; totalEnrolled: number; byGrade: Partial<Record<GradeKey, number>> } | null
  provider: string | null
  source: 'roster' | 'snapshot'
}): SnapshotRow[] {
  if (!summary.latest) return []
  return [
    {
      observedOn: summary.latest.observedOn,
      provider: summary.provider ?? summary.source,
      totalEnrolled: summary.latest.totalEnrolled,
      byGrade: cleanByGrade(summary.latest.byGrade),
    },
  ]
}

/** The latest reading in each school year — the canonical column of the heatmap. */
function latestPerSchoolYear(perDay: SnapshotRow[]): Map<number, SnapshotRow> {
  const byYear = new Map<number, SnapshotRow>()
  for (const r of perDay) byYear.set(schoolYearOf(r.observedOn), r)
  return byYear
}

/** The grade map behind the headline number: the live roster when we are in
 *  roster mode, else the latest filed snapshot. */
function latestByGrade(
  perDay: SnapshotRow[],
  summary: { latest: { byGrade: Partial<Record<GradeKey, number>> } | null },
): Partial<Record<GradeKey, number>> {
  if (summary.latest) return cleanByGrade(summary.latest.byGrade)
  const last = perDay[perDay.length - 1]
  return last ? last.byGrade : {}
}

/** E2 — the grade × year heatmap source. */
function buildGradeByYear(
  perYear: Map<number, SnapshotRow>,
  years: number[],
): GradeByYear | null {
  if (years.length === 0) return null
  // Only grades the school actually has: a grade absent from every reading stays
  // ABSENT. Zeroing PK3..8 for a 9-12 high school would draw eight empty rows and
  // invite the question "why did preschool collapse".
  const grades = GRADE_KEYS.filter((g) => years.some((y) => (perYear.get(y)?.byGrade[g] ?? 0) > 0))
  const cells: GradeYearCell[] = []
  for (const schoolYear of years) {
    const row = perYear.get(schoolYear)
    if (!row) continue
    for (const grade of grades) {
      const n = row.byGrade[grade]
      // A grade missing from THIS year's reading gets no cell at all: blank means
      // "no reading", which is different from a zero and must not be interpolated.
      if (n === undefined) continue
      cells.push({ grade, schoolYear, count: cell(n) })
    }
  }
  return {
    years,
    grades,
    cells,
    observedByYear: years
      .filter((y) => perYear.has(y))
      .map((y) => {
        const r = perYear.get(y)!
        return { schoolYear: y, observedOn: r.observedOn, total: r.totalEnrolled }
      }),
  }
}

/** C3 — the grade ladder at the latest observation. */
function buildLadder(
  perDay: SnapshotRow[],
  summary: {
    latest: { observedOn: string; totalEnrolled: number; byGrade: Partial<Record<GradeKey, number>> } | null
  },
): EnrollmentLadder | null {
  const byGrade = latestByGrade(perDay, summary)
  const last = perDay[perDay.length - 1]
  const observedOn = summary.latest?.observedOn ?? last?.observedOn
  if (!observedOn) return null
  const total = summary.latest?.totalEnrolled ?? last?.totalEnrolled ?? 0

  const rows: LadderRow[] = GRADE_KEYS.filter((g) => byGrade[g] !== undefined).map((grade) => {
    const n = byGrade[grade]!
    const c = cell(n)
    return {
      grade,
      count: c,
      share: c.suppressed
        ? { value: null, suppressed: true }
        : { value: total > 0 ? n / total : null, suppressed: false },
    }
  })
  if (rows.length === 0) return null

  // Naming a "narrowest rung" while a thinner rung is masked would be a false
  // statement, not merely an incomplete one — so the callout is withheld whole.
  const anySuppressed = rows.some((r) => r.count.suppressed)
  let narrowest: { grade: GradeKey; count: number } | null = null
  if (!anySuppressed) {
    for (const r of rows) {
      const v = r.count.value!
      if (narrowest === null || v < narrowest.count) narrowest = { grade: r.grade, count: v }
    }
  }
  return {
    observedOn,
    total,
    rows,
    narrowestRung: narrowest,
    narrowestRungWithheldReason: anySuppressed
      ? 'At least one grade is too small to show, so the smallest visible grade is not the smallest grade.'
      : null,
  }
}

/**
 * E3 — cohort SIZE progression, at ONE ladder length.
 *
 * ── COHORT IDENTITY ─────────────────────────────────────────────────────────
 * One subtraction: schoolYear − gradeRank, reused from the academics layer
 * rather than re-derived, so "the class of 2030" means the same thing on both
 * pages. `gradeRankOf` / `gradeKeyOfRank` / `cohortIdOf` / `cohortPanelPlan`
 * are all imported for the same reason — two features that disagree about which
 * grade follows which are two features that draw different children.
 *
 * ── WHAT CHANGED, AND WHY ───────────────────────────────────────────────────
 * This used to emit every cohort at whatever span it happened to have: a class
 * caught for two rungs sat in the same grid as one followed for five. Panels of
 * different lengths are NOT comparable — the short ones read "steady" partly
 * because they had less room to move — so the grid quietly rewarded thin data.
 * Now the caller picks a LENGTH and every panel has exactly that many legs.
 *
 * ── THE ENUMERATION ─────────────────────────────────────────────────────────
 * Every run of `window` consecutive grades that FITS INSIDE the school's own
 * grade span, one panel each, all anchored on the SAME end year (the latest
 * year drawn). A K-8 school at four grades yields ladders ending in grades 3..8;
 * a 9-12 school at four yields exactly one, 9 → 12. Anchoring the end year is
 * what makes a screen of panels readable: they all finish in the same year, so
 * the reader compares classes rather than vintages of the calendar.
 *
 * ── THE INVARIANTS, UNCHANGED ───────────────────────────────────────────────
 * `legs.length === window`, always: a year with no reading, or one suppressed
 * for being too small, KEEPS ITS SLOT with a null count. It is never dropped
 * (which would shorten the ladder) and never interpolated (which would invent a
 * child). `netChange` is strictly end − start and null if either END is
 * unknown, and `direction` is decided here against the movement floor.
 */
function buildCohortSize(grid: GradeByYear | null, requested?: number): CohortSize | null {
  if (!grid || grid.years.length < 2) return null

  const span = cohortGradeSpan(grid)
  // No two consecutive grades and no two years => there is no ladder to draw at
  // ANY length, so there is nothing for a length control to control either.
  if (span.maxWindow < MIN_COHORT_WINDOW || span.low === null || span.high === null) return null

  const availableWindows: number[] = []
  for (let w = MIN_COHORT_WINDOW; w <= span.maxWindow; w += 1) availableWindows.push(w)

  // THE DEFAULT IS THE LONGEST THE DATA SUPPORTS. The question this view exists
  // to answer — "what has happened to this class over its time here" — is best
  // answered by the whole time on file; a reader who wants the tighter, more
  // recent read narrows it themselves. It is also the only default that cannot
  // silently discard history the school took the trouble to upload.
  const requestedWindow = clampInt(requested ?? span.maxWindow, MIN_COHORT_WINDOW, MAX_COHORT_WINDOW)
  // CLAMPED, not rejected. A link written for a five-year window and opened on a
  // school with three years of readings still renders — at three years, saying
  // so — because the alternative is a dead link or a grid of empty panels.
  const window = Math.min(requestedWindow, span.maxWindow)

  const lowRank = gradeRankOf(span.low)
  const highRank = gradeRankOf(span.high)
  if (lowRank === null || highRank === null) return null

  // ONE enumeration, shared with academics: which end grades a span supports at
  // this length, capped, with the honest count of what the cap dropped.
  const plan = cohortPanelPlan(
    { low: lowRank, high: highRank },
    { window, maxPanels: MAX_COHORT_PANELS },
  )

  // Every panel finishes here — see the header. The latest year DRAWN, not the
  // latest year on file, so the grid and the heatmap describe the same window.
  const endYear = grid.years[grid.years.length - 1]

  const cellAt = new Map<string, GradeYearCell>()
  for (const c of grid.cells) cellAt.set(`${c.schoolYear}|${c.grade}`, c)

  const cohorts: CohortSizeEntry[] = []
  let maxCount: number | null = null

  for (const endRank of plan.endRanks) {
    const legs: CohortLegPoint[] = []
    let present = 0
    let impossible = false

    for (let i = 0; i < window; i += 1) {
      const back = window - 1 - i
      const schoolYear = endYear - back
      const grade = gradeKeyForRank(endRank - back)
      // Outside PK3..12 there is no rung to name. The plan's own bounds make
      // this unreachable; the panel is abandoned rather than shortened if it
      // ever is reached, because a ladder with a missing tread is a lie about
      // its own length.
      if (grade === null) {
        impossible = true
        break
      }
      const hit = cellAt.get(`${schoolYear}|${grade}`)
      // THE SLOT IS ALWAYS KEPT. Missing (never filed) and suppressed (filed,
      // too small to show) are different absences and stay distinguishable:
      // value null + suppressed false vs value null + suppressed true.
      legs.push({ grade, schoolYear, count: hit ? hit.count : { value: null, suppressed: false } })
      if (hit) present += 1
      if (hit?.count.value != null) {
        maxCount = maxCount === null ? hit.count.value : Math.max(maxCount, hit.count.value)
      }
    }
    if (impossible) continue
    // A panel with one reading is a dot, and a panel with none is an empty plot
    // under a title — which reads as "this class vanished" rather than "nothing
    // was filed". Neither is drawn. A SUPPRESSED rung counts as present: it is
    // a reading the school made, withheld here, and saying so is the point.
    if (present < 2) continue

    const first = legs[0].count
    const last = legs[legs.length - 1].count
    // STRICTLY end − start. A suppressed end is not a zero and not the nearest
    // visible year: it is an unknown, and an unknown minus a number is unknown.
    const netChange = first.value !== null && last.value !== null ? last.value - first.value : null
    const direction: CohortSizeEntry['direction'] =
      netChange === null
        ? 'unknown'
        : netChange >= COHORT_MOVE_FLOOR
          ? 'grew'
          : netChange <= -COHORT_MOVE_FLOOR
            ? 'shrank'
            : 'held'

    // THE CANONICAL SUBTRACTION, not a local copy of it. `endYear − endRank` is
    // the same arithmetic, which is exactly why it must not be written twice:
    // the day PK4's rank moves, one of the two copies is wrong and the two
    // pages start disagreeing about which class is which.
    const endLeg = legs[legs.length - 1]
    const id = cohortIdOf(endLeg.schoolYear, endLeg.grade)
    if (id === null) continue
    cohorts.push({
      id,
      label: `Class of ${id + 12}`,
      graduationYear: id + 12,
      startGrade: legs[0].grade,
      endGrade: legs[legs.length - 1].grade,
      startYear: legs[0].schoolYear,
      endYear: legs[legs.length - 1].schoolYear,
      legs,
      netChange,
      direction,
    })
  }

  // ORDER IS THE PLAN'S, ascending end grade — the youngest ladder first, the
  // leavers last, the same order the academics grid reads in. No re-sort here:
  // two features that lay the same panels out differently are two features.

  return {
    cohorts,
    maxCount,
    window,
    requestedWindow,
    availableWindows,
    endYear,
    gradeSpan: span,
    panelsAvailable: plan.panelsAvailable,
    truncated: plan.truncated,
    // The block is returned even with nothing to draw, so the LENGTH CONTROL
    // survives a setting that empties the grid. Returning null here would take
    // away the only control that could undo the choice that emptied it.
    reason:
      cohorts.length > 0
        ? null
        : `No class has two readings across ${window} consecutive grades ending in ${endYear - 1}-${String(endYear).slice(2)}. A shorter cohort length may find one.`,
  }
}

/**
 * The grade span on file, and the ladder lengths it supports.
 *
 * BOTH depths bind. Grades decide how long a ladder can be (a 9-12 school has
 * no five-grade run); years decide how much of one can ever be filled (three
 * years of readings cannot evidence a five-year walk, and offering it would
 * yield panels whose first two legs are missing by construction).
 */
function cohortGradeSpan(grid: GradeByYear): CohortGradeSpan {
  const ranks = grid.grades
    .map((g) => gradeRankOf(g))
    .filter((r): r is number => r !== null)
    .sort((a, b) => a - b)
  if (ranks.length === 0) {
    return { low: null, high: null, gradeDepth: 0, yearDepth: grid.years.length, maxWindow: 0 }
  }
  const low = ranks[0]
  const high = ranks[ranks.length - 1]
  // CONTIGUOUS, deliberately: a school with no grade 5 on file still has a real
  // K-8 ladder, and that grade shows up honestly as a missing rung rather than
  // shortening everyone's panel.
  const gradeDepth = high - low + 1
  const yearDepth = grid.years.length
  const depth = Math.min(gradeDepth, yearDepth, MAX_COHORT_WINDOW)
  return {
    low: gradeKeyForRank(low),
    high: gradeKeyForRank(high),
    gradeDepth,
    yearDepth,
    maxWindow: depth >= MIN_COHORT_WINDOW ? depth : 0,
  }
}

/** Integer clamp for a query knob that has already passed the DTO's bounds. */
function clampInt(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(Math.trunc(n), lo), hi)
}

/**
 * GRADE_KEYS entry for a gradeRankOf() rank; null outside PK3..12.
 *
 * The INVERSE ITSELF is the canonical `gradeKeyOfRank` — this only narrows its
 * answer to this module's GradeKey union. Naming the rungs from a second table
 * is how the two cohort features would come to disagree about which grade
 * follows which, so there is exactly one, and it lives in @finrep/analytics.
 */
function gradeKeyForRank(rank: number): GradeKey | null {
  const key = gradeKeyOfRank(rank)
  return key === null ? null : (GRADE_KEYS.find((g) => g === key) ?? null)
}

/**
 * E4 — actual vs plan BY GRADE. The plan service already resolved planByGrade for
 * the vs-plan metric and every consumer to date has thrown it away; this is the
 * whole of the addition.
 */
function buildVsPlan(
  actualByGrade: Partial<Record<GradeKey, number>>,
  planRes: EnrollmentPlanResolution,
  tileGapPct: number | null,
): VsPlan | null {
  const plan = planRes.plan
  if (!plan) return null

  const grades = GRADE_KEYS.filter(
    (g) => actualByGrade[g] !== undefined || plan.planByGrade[g] !== undefined,
  )
  if (grades.length === 0) return null

  const rows: VsPlanRow[] = grades.map((grade) => {
    const a = actualByGrade[grade] ?? null
    const p = plan.planByGrade[grade] ?? null
    const actual = cell(a)
    // The plan and the gap are each one subtraction away from the actual, so
    // masking the actual and publishing them would mask nothing at all.
    const masked = actual.suppressed
    const planCell: Suppressible<number> = masked
      ? { value: null, suppressed: true }
      : { value: p, suppressed: false }
    const gapValue = !masked && a !== null && p !== null ? a - p : null
    return {
      grade,
      actual,
      plan: planCell,
      gap: masked ? { value: null, suppressed: true } : { value: gapValue, suppressed: false },
      gapPct: masked
        ? { value: null, suppressed: true }
        : { value: gapValue !== null && p !== null && p > 0 ? gapValue / p : null, suppressed: false },
    }
  })

  // TOTALS are computed from the TRUE counts, never from the masked rows — a
  // school total identifies nobody, and a total that quietly omitted the hidden
  // grades would disagree with the headcount tile.
  const actualTotal = grades.reduce((s, g) => s + (actualByGrade[g] ?? 0), 0)
  const planTotal = plan.planTotal
  const gap = actualTotal - planTotal
  const gapPct = planTotal > 0 ? gap / planTotal : null
  return {
    rows,
    totals: {
      actual: actualTotal,
      plan: planTotal,
      gap,
      gapPct,
      tileGapPct,
      // Exact equality on purpose. Both are the same single division, so any
      // difference at all means the two are describing DIFFERENT observations —
      // never a rounding artifact, and never something to paper over.
      agreesWithTile: tileGapPct === null || tileGapPct === gapPct,
    },
    planSource: plan.source,
    planFailed: false,
  }
}

/** How many figures the page is masking — for the honesty note, not for display. */
function countSuppressed(ctx: {
  gradeByYear: GradeByYear | null
  ladder: EnrollmentLadder | null
  vsPlan: VsPlan | null
  mix: EnrollmentMix | null
}): number {
  let n = 0
  for (const c of ctx.gradeByYear?.cells ?? []) if (c.count.suppressed) n++
  for (const r of ctx.ladder?.rows ?? []) if (r.count.suppressed) n++
  for (const r of ctx.vsPlan?.rows ?? []) if (r.actual.suppressed) n++
  if (ctx.mix) for (const f of Object.values(ctx.mix.flags)) if (f.suppressed) n++
  return n
}

/**
 * What this page cannot show, and WHY.
 *
 * The reader arrives from a diocesan deck that had a "91% full" gauge and an
 * average class size, and will hunt for them. Omitting them silently reads as an
 * oversight; naming them with the reason is the difference between a product that
 * does not have the data and one that appears not to have thought about it. None
 * of these can be faked from what is stored — each would require data nobody has
 * entered, and inventing any of them would poison the ones that are real.
 */
const UNAVAILABLE_CHARTS: UnavailableChart[] = [
  {
    key: 'capacity_utilization',
    label: 'Percent full / capacity',
    reason:
      'Building and per-grade capacity are not recorded anywhere yet, so a "percent full" figure would have an invented denominator.',
  },
  {
    key: 'average_class_size',
    label: 'Average class size',
    reason:
      'Class and section rosters are not imported — students are held per grade, not per section — so class size cannot be counted.',
  },
  {
    key: 'chronic_absence',
    label: 'Students with 20+ absences',
    reason: 'No attendance data is collected by this platform.',
  },
  {
    key: 'faith_participation',
    label: '% Catholic students and faculty',
    reason:
      'Religious affiliation is deliberately not stored on the student record, so it cannot be counted or estimated.',
  },
  {
    key: 'teacher_retention',
    label: 'Teacher retention and salary',
    reason:
      'Staff are held as aggregate FTE totals, not as people with start dates or salaries — and this is the enrollment page in any case.',
  },
]
