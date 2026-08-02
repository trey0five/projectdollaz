import { Injectable, Logger } from '@nestjs/common'
import type { ModuleKey } from '@finrep/db'
import { MODULE_META } from '@finrep/db'
import type { MetricKey, MetricTrend } from '@finrep/analytics'
import {
  computeReviewStatus,
  computeTrendSignal,
  daysFromCivil,
  suppressSmallCellSet,
  suppressSmallCells,
  toCivil,
  type SmallCell,
  type TrendSignal,
} from '@finrep/compliance'
import { PrismaService } from '../prisma/prisma.service.js'
import { BillingService } from '../billing/billing.service.js'
import { AnalyticsService } from '../analytics/analytics.service.js'
import { AccreditationEvidenceReadinessService } from '../accreditation/evidence-readiness.service.js'
import { StudentsService } from '../enrollment/students/students.service.js'
import { entitledModulesForSchool } from '../analytics/metric-gating.js'
import {
  TWIN_SIGNAL_CATALOG,
  staleAfterDaysFor,
} from './twin-signal-catalog.js'
import { isEvaluationOverdue, isInspectionOverdue } from './twin-contract.js'
import type {
  SignalAvailability,
  SignalChangeState,
  TwinSignal,
  TwinSignalDef,
  TwinSignalKey,
  TwinSignalSet,
} from './twin-contract.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase D — THE SIGNAL CATALOG, RESOLVED FOR ONE SCHOOL.
//
// I/O only. Every number here is read by something that already owns it — the
// analytics trend endpoint, the Phase-C currency service, the roster's own
// FERPA-safe aggregate — and every statistic is computed by the pure package.
// This file's whole job is to say, for all 36 catalog rows, either "here is the
// value and the date it describes" or "here is why not".
//
// FIVE THINGS THIS FILE WILL NOT DO:
//
//   1. IT WILL NOT OMIT A SIGNAL. All 36 come back for every school, in catalog
//      order, whatever happened. An omitted signal is an invisible hole.
//
//   2. IT WILL NOT ISSUE A QUERY FOR SOMETHING THE SCHOOL HAS NOT LICENSED. The
//      resolution order is declaredNotTracked -> entitlement -> collector, and
//      the collector is genuinely not invoked in the first two cases. A school
//      learns WHICH module would light a row; it never learns the number behind
//      a module it has not paid for. Entitlement is resolved ONCE per school and
//      is FAIL-CLOSED, exactly like metric-gating.ts.
//
//   3. IT WILL NOT QUERY STUDENT ROWS DIRECTLY. Acceptance criterion 5, enforced by
//      no-student-access.spec.ts, which greps this directory. Roster counts
//      arrive through StudentsService.aggregate — the service that owns them —
//      and every per-cohort cell passes through suppressSmallCellSet before it
//      can reach a payload. F11's leak vector is not a name; it is a per-grade
//      count of 3.
//
//   4. IT WILL NOT NAME A MEMBER OF STAFF. AIC Phase F added an ADULT-STAFF
//      EMPLOYMENT PII register, and the only thing that crosses into this
//      directory from it is three date/status columns and the COUNTS derived from
//      them. The evaluator's name and the person relation are never selected here, by
//      anything, ever — no-staff-pii.spec.ts greps this whole directory and fails
//      the BUILD, exactly as no-student-access.spec.ts does for students.
//
//   5. IT WILL NOT THROW. A collector that fails degrades to `no_data` for that
//      one signal, is logged at warn, and the other 35 are unaffected. This
//      service has no endpoint and must never take a nightly job down; when
//      Phase E routes it, it must never 500 a page. Same discipline as
//      signals.service.ts.
//
// AND ONE IT WILL NOT DO EVEN THOUGH IT COULD: it will not present a monthly
// series as a trend. `MonthlySnapshot` is cumulative YTD, so a month-over-month
// delta inside one FY is arithmetic nonsense; the API's own monthly sparkline
// fallback is exactly such a series. computeTrendSignal refuses it (two
// independent gates), and outside production it THROWS — which is caught here
// and reported as `no_data` carrying the refusal's own sentence. A refused trend
// is a signal with no reading, never a signal with a made-up one.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The register modules metric-gating.ts does NOT reach, resolved here the same
 * fail-closed way. Advancement is probed even though no Phase-D signal uses it:
 * the set is the school's licence picture, and Phase E's rules will want it.
 */
const REGISTER_MODULES: readonly ModuleKey[] = [
  'governance',
  'facilities',
  'advancement',
  'accreditation',
  'strategy',
]

/** How many recent findings are scanned to recover the previous run's values. */
const PRIOR_VALUE_SCAN = 50

/**
 * The metric keys the catalog binds FOR THIS SCHOOL — deduped, in catalog order,
 * and filtered by the same entitlement set that gates the signals themselves.
 *
 * DERIVED, never retyped: a thirteenth trend signal joins the shared batch by
 * existing. An unlicensed module's key is not merely hidden, it is never NAMED to
 * AnalyticsService — the property the entitlement spy asserts.
 */
function batchMetricKeys(entitled: ReadonlySet<ModuleKey>): MetricKey[] {
  const out: MetricKey[] = []
  for (const def of TWIN_SIGNAL_CATALOG) {
    const key = def.source.metricKey
    if (!key || def.declaredNotTracked) continue
    if (def.moduleKey !== null && !entitled.has(def.moduleKey)) continue
    if (!out.includes(key)) out.push(key)
  }
  return out
}

// ── Frozen copy. Rendered VERBATIM; never composed by a caller. ──────────────

const NO_READING = 'No reading is available for this signal yet.'

/**
 * AIC Phase F — THE EMPTY-REGISTER SENTENCES.
 *
 * Before Phase F these three signals were `declaredNotTracked`, and the catalog's
 * `unavailableReason` told the school exactly what would close the hole ("A
 * four-field staff-evaluation register unlocks this, and it is the highest-value
 * item on the list."). Phase F makes them readable — and a school with zero rows
 * therefore moved from that sentence to the GENERIC `NO_READING`, which names no
 * action at all. That is a regression in the program's own idiom: this product
 * names the intake that closes every hole it shows you.
 *
 * These restore the ask on the exact signals Phase F exists to make actionable.
 * They are `no_data`, not `not_tracked` — we CAN look now, and there is nothing
 * there — so the sentence describes an empty register rather than a missing
 * capability. "We looked and it's fine" (`available`, value 0) remains a third,
 * separate state and is never rendered with this copy.
 */
const EMPTY_REGISTER_READING: Readonly<Record<string, string>> = {
  'hr.staff_evaluations':
    'Your staff-evaluation register is empty. Record a cycle in HR — person, cycle, due date — and this reads from it.',
  'fac.inspections':
    'No facilities item declares what kind of compliance inspection it is. Set that field on an item in Facilities and this reads from it. We will not guess it from the title.',
  'acc.prior_visit_findings':
    'No findings from a previous accreditation visit are on file. Add them once, from your last visit report, and KYRO can tell you which are still open.',
}
const COLLECTOR_FAILED = 'We could not read this signal on this run.'
const NOT_LICENSED_PREFIX = 'Unlock the '

/**
 * Only reachable when computeTrendSignal throws in strict mode AND carries no
 * detail — the pure package supplies the sentence in every real refusal.
 */
const GRANULARITY_REFUSED =
  'These readings cannot be placed on a comparable time axis, so no direction can be read from them.'

// ── Small date helpers. Civil-date math is the shared Hinnant implementation. ─

/** UTC calendar day of a Date as yyyy-mm-dd. */
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Whole UTC days between two yyyy-mm-dd dates (b - a). Null on an unparseable input. */
function daysBetween(a: string, b: string): number | null {
  const ca = toCivil(a)
  const cb = toCivil(b)
  if (!ca || !cb) return null
  return daysFromCivil(cb.y, cb.m, cb.d) - daysFromCivil(ca.y, ca.m, ca.d)
}

/** yyyy-mm-dd for a nullable @db.Date column. */
function isoOrNull(d: Date | null | undefined): string | null {
  return d ? isoDay(d) : null
}

/** The latest of a set of dates, ignoring nulls. */
function maxDate(dates: readonly (Date | null | undefined)[]): Date | null {
  let best: Date | null = null
  for (const d of dates) {
    if (!d) continue
    if (best === null || d.getTime() > best.getTime()) best = d
  }
  return best
}

/** Memoise a loader so N signals in one group cost ONE query — and zero if unused. */
function once<T>(fn: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | null = null
  return () => {
    if (p === null) p = fn()
    return p
  }
}

/** What a collector returns. `null` means "nothing to read" -> no_data. */
interface Collected {
  value: number | string | boolean | null
  observedOn: string | null
  trend?: TrendSignal | null
  cells?: SmallCell[] | null
  /** Overrides the generic no-reading sentence when the source can explain itself. */
  noDataReason?: string
  /** Set when the collector deliberately reports a hole rather than a value. */
  noData?: boolean
  /** Narrows the lineage field for signals whose column depends on the row found. */
  lineageField?: string
}

@Injectable()
export class TwinSignalsService {
  private readonly logger = new Logger(TwinSignalsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
    private readonly billing: BillingService,
    private readonly evidenceReadiness: AccreditationEvidenceReadinessService,
    private readonly students: StudentsService,
  ) {}

  /** The static catalog, for specs and for Phase E's rule-authoring. */
  catalog(): readonly TwinSignalDef[] {
    return TWIN_SIGNAL_CATALOG
  }

  /**
   * Every catalog entry, resolved for one school. NEVER throws.
   *
   * Query budget: one entitlement resolution, one AnalyticsService.trends call per
   * distinct entitled metric (skipped entirely otherwise), one Prisma query per
   * register group, and one scan of the findings ledger for the previous run's
   * values. Nothing fans out across schools here — that limiter lives in the
   * reconciliation.
   */
  async collect(schoolId: string, opts: { now?: Date } = {}): Promise<TwinSignalSet> {
    const now = opts.now ?? new Date()
    const today = isoDay(now)

    // Outside production the pure engine THROWS on a granularity violation rather
    // than returning a refusal, so dev and CI blow up loudly on a mislabelled
    // series while production degrades honestly. Reading process.env happens
    // here, in apps/api — never in the pure package.
    const strict = process.env.NODE_ENV !== 'production'

    const entitled = await this.entitledModules(schoolId)
    const ctx = this.buildContext(schoolId, now, strict, entitled)
    const prior = await ctx.priorValues().catch(() => new Map<string, unknown>())

    const signals: TwinSignal[] = []
    for (const def of TWIN_SIGNAL_CATALOG) {
      signals.push(await this.resolveOne(def, entitled, ctx, today, prior))
    }

    const counts: Record<SignalAvailability, number> = {
      available: 0,
      not_licensed: 0,
      no_data: 0,
      not_tracked: 0,
    }
    for (const s of signals) counts[s.availability] += 1

    // Demo provenance is a property of the SERIES, inherited exactly as Phase A
    // inherits it. Only read when the accreditation signals were reachable at all;
    // an unlicensed school issues no readiness query and reports demoData false.
    const readiness = entitled.has('accreditation')
      ? await ctx.readiness().catch(() => null)
      : null

    return {
      schoolId,
      generatedAt: now.toISOString(),
      signals,
      counts,
      demoData: readiness?.isDemo ?? false,
      snapshotAsOf: readiness?.snapshotDate ?? null,
    }
  }

  // ── Entitlement, resolved ONCE per school, fail-closed ─────────────────────

  private async entitledModules(schoolId: string): Promise<Set<ModuleKey>> {
    // finance/enrollment/hr/planning through the SHARED helper, so a metric the
    // twin can see is provably a metric /metrics would also have shown.
    const set = await entitledModulesForSchool(schoolId, this.billing).catch(
      () => new Set<ModuleKey>(['finance']),
    )
    const results = await Promise.all(
      REGISTER_MODULES.map((k) =>
        this.billing
          .isEntitledForModule(schoolId, k)
          .catch(() => false)
          .then((ok) => [k, ok] as const),
      ),
    )
    for (const [k, ok] of results) if (ok) set.add(k)
    return set
  }

  // ── One signal ─────────────────────────────────────────────────────────────

  private async resolveOne(
    def: TwinSignalDef,
    entitled: Set<ModuleKey>,
    ctx: CollectContext,
    today: string,
    prior: Map<string, unknown>,
  ): Promise<TwinSignal> {
    const staleAfterDays = staleAfterDaysFor(def)

    // 1. DECLARED NOT TRACKED. The collector is never invoked and no query is
    //    issued. This is the visible hole Phases F/K close by changing one field.
    if (def.declaredNotTracked) {
      return this.blank(def, 'not_tracked', def.declaredNotTracked.reason, staleAfterDays)
    }

    // 2. NOT LICENSED. Still no query. value/cells/lineage all null — the school
    //    learns which module would light the row, never the number behind it.
    if (def.moduleKey !== null && !entitled.has(def.moduleKey)) {
      const label = MODULE_META[def.moduleKey]?.label ?? def.moduleKey
      return this.blank(
        def,
        'not_licensed',
        `${NOT_LICENSED_PREFIX}${label} module to see ${def.label}.`,
        staleAfterDays,
      )
    }

    // 3./4. The collector runs. A throw degrades to no_data for THIS signal only.
    let collected: Collected | null
    try {
      collected = await this.collectOne(def, ctx)
    } catch (err) {
      this.logger.warn(
        `twin signal ${def.key} failed for ${ctx.schoolId}: ${(err as Error).message}`,
      )
      return this.blank(def, 'no_data', COLLECTOR_FAILED, staleAfterDays)
    }

    if (collected === null || collected.noData === true) {
      return {
        ...this.blank(def, 'no_data', collected?.noDataReason ?? NO_READING, staleAfterDays),
        // A refused trend still explains itself: the refusal shape carries no
        // number, and Phase E needs to know WHY it cannot evaluate a rule.
        trend: collected?.trend ?? null,
      }
    }

    const observedOn = collected.observedOn
    const ageDays = observedOn ? daysBetween(observedOn, today) : null
    const changeState = this.changeStateFor(
      def.key,
      collected.value,
      observedOn,
      ageDays,
      staleAfterDays,
      prior,
    )

    const lineageField = collected.lineageField ?? def.source.field

    return {
      key: def.key,
      label: def.label,
      kind: def.kind,
      availability: 'available',
      unavailableReason: null,
      moduleKey: def.moduleKey,
      value: collected.value,
      trend: collected.trend ?? null,
      observedOn,
      ageDays,
      expectedCadenceDays: def.expectedCadenceDays,
      staleAfterDays,
      changeState,
      ferpaSensitive: def.ferpaSensitive,
      cells: collected.cells ?? null,
      domainKeys: [...def.domainKeys],
      lineage: {
        table: def.source.table,
        ...(lineageField ? { field: lineageField } : {}),
        ...(def.source.metricKey ? { metricKey: def.source.metricKey } : {}),
      },
    }
  }

  /**
   * F14. NOT a freshness ladder: `staleAfterDays` comes from the signal's OWN
   * expected cadence, so an annual artifact untouched for 200 days is `unchanged`
   * (200 <= 600) while a 45-day AR aging untouched for 70 is `stale_data`. Under
   * the naive "no update in N days is stale" rule the annual signal would have
   * been screaming for six months about a school doing nothing wrong.
   *
   * ABSENT ANY PRIOR OBSERVATION THE STATE IS `unchanged`, NEVER `moved`. The
   * first sighting of a value is not a movement.
   *
   * `never_observed` IS THE AGE AXIS, NOT THE CHANGE AXIS. Five signals report a
   * value with `observedOn: null` by design — a committee roster and the three
   * accreditation-state counts carry no as-of date, and the roster is a live
   * register rather than a dated observation. Returning `never_observed` for them
   * before the prior-value comparison ran meant a school could score twenty
   * previously-unscored standards between two nights and the payload would report
   * a value while claiming nothing was ever observed, with change detection
   * silently disabled for every one of those signals. So: staleness stays
   * unevaluable without a date (`ageDays` stays null), but a value that DIFFERS
   * from the one the last run recorded still reads as `moved`.
   */
  private changeStateFor(
    key: TwinSignalKey,
    value: number | string | boolean | null,
    observedOn: string | null,
    ageDays: number | null,
    staleAfterDays: number,
    prior: Map<string, unknown>,
  ): SignalChangeState {
    const movedFromPrior = prior.has(key) && prior.get(key) !== value
    if (observedOn === null) return movedFromPrior ? 'moved' : 'never_observed'
    if (ageDays !== null && ageDays > staleAfterDays) return 'stale_data'
    if (!prior.has(key)) return 'unchanged'
    return movedFromPrior ? 'moved' : 'unchanged'
  }

  /** A signal with NO value of any kind — the only shape an unavailable row takes. */
  private blank(
    def: TwinSignalDef,
    availability: Exclude<SignalAvailability, 'available'>,
    reason: string,
    staleAfterDays: number,
  ): TwinSignal {
    return {
      key: def.key,
      label: def.label,
      kind: def.kind,
      availability,
      unavailableReason: reason,
      moduleKey: def.moduleKey,
      value: null,
      trend: null,
      observedOn: null,
      ageDays: null,
      expectedCadenceDays: def.expectedCadenceDays,
      staleAfterDays,
      changeState: 'never_observed',
      ferpaSensitive: def.ferpaSensitive,
      cells: null,
      domainKeys: [...def.domainKeys],
      lineage: null,
    }
  }

  // ── The collectors ─────────────────────────────────────────────────────────

  private async collectOne(def: TwinSignalDef, ctx: CollectContext): Promise<Collected | null> {
    switch (def.key) {
      case 'fin.operating_margin':
      case 'fin.days_cash_on_hand':
      case 'fin.months_operating_reserve':
      case 'fin.tuition_dependency':
      case 'fin.tuition_discount_rate':
      case 'fin.cost_per_pupil':
      case 'fin.net_tuition_per_student':
      case 'aid.pct_students_on_aid':
      case 'hr.student_teacher_ratio':
      case 'hr.teaching_staff_share':
      case 'hr.total_staff_fte':
      case 'enr.enrollment_vs_plan':
        return this.collectTrend(def, ctx)

      case 'plan.plan_readiness':
        return this.collectMetricLevel(def, ctx)

      case 'fin.ar_aging':
        return this.collectArAging(ctx)
      case 'fin.budget_present':
        return this.collectBudgetPresent(ctx)

      case 'gov.minutes_lag':
        return this.collectMinutesLag(ctx)
      case 'gov.meeting_cadence':
        return this.collectMeetingCadence(ctx)
      case 'gov.policy_review':
        return this.collectPolicyReview(ctx)
      case 'gov.board_terms':
        return this.collectBoardTerms(ctx)
      case 'gov.committee_chairs':
        return this.collectCommitteeChairs(ctx)
      case 'curr.doc_review':
        return this.collectCurriculumReview(ctx)

      case 'strat.plan_horizon':
        return this.collectPlanHorizon(ctx)
      case 'fac.maintenance_backlog':
        return this.collectMaintenanceBacklog(ctx)
      case 'fac.inspections':
        return this.collectComplianceInspections(ctx)
      case 'hr.staff_evaluations':
        return this.collectStaffEvaluations(ctx)
      case 'acc.prior_visit_findings':
        return this.collectPriorVisitFindings(ctx)

      case 'enr.headcount':
        return this.collectHeadcount(ctx)
      case 'enr.feeder_grades':
        return this.collectFeederGrades(ctx)
      case 'svc.support_needs':
        return this.collectSupportNeeds(ctx)

      case 'acc.evidence_currency':
        return this.collectEvidenceCurrency(ctx)
      case 'acc.readiness_series':
        return this.collectReadinessSeries(ctx)
      case 'acc.unscored_standards':
        return this.collectUnscoredStandards(ctx)
      case 'acc.unsupported_score':
        return this.collectUnsupportedScore(ctx)

      default:
        // Unreachable: declaredNotTracked rows short-circuit before this point and
        // the catalog/key assertion guarantees no other key exists.
        return null
    }
  }

  /**
   * A metric TREND, statistics applied by the pure package.
   *
   * The refusal path matters more than the success path: a school with only
   * monthly snapshots gets the API's monthly fallback series, which is cumulative
   * YTD and cannot be differenced. That comes back here as `no_data` carrying the
   * engine's own sentence — never as a trend.
   */
  private async collectTrend(def: TwinSignalDef, ctx: CollectContext): Promise<Collected | null> {
    const metricKey = def.source.metricKey
    if (!metricKey) return null
    const trend = await ctx.metricTrend(metricKey)
    const usable = trend.points.filter((p) => p.available && p.value !== null)

    let signal: TrendSignal
    try {
      signal = computeTrendSignal(trend, { now: ctx.today, strict: ctx.strict })
    } catch (err) {
      // Strict mode. Only the three granularity refusals throw; anything else is
      // a real fault and is rethrown into the per-signal degradation above.
      const refusal = (err as { refusal?: unknown }).refusal
      if (typeof refusal !== 'string') throw err
      // THE PAYLOAD MUST NOT DIFFER BETWEEN DEV AND PRODUCTION. The strict throw
      // and the production return describe the SAME refusal, so the shape a Phase-E
      // rule reads (`signal.trend?.refusal` -> cannot_evaluate) has to be identical
      // in both. Recompute non-strict to obtain the refusal shape the production
      // branch would have returned; the throw stays, so dev and CI still blow up
      // loudly on a mislabelled series at the point the engine detects it.
      const detail = (err as { detail?: unknown }).detail
      const shaped = computeTrendSignal(trend, { now: ctx.today, strict: false })
      return {
        value: null,
        observedOn: null,
        trend: shaped,
        noData: true,
        noDataReason:
          shaped.reason ??
          (typeof detail === 'string' && detail.length > 0 ? detail : GRANULARITY_REFUSED),
      }
    }

    if (signal.refusal !== null || usable.length === 0) {
      return {
        value: null,
        observedOn: null,
        trend: signal,
        noData: true,
        noDataReason: signal.reason ?? NO_READING,
      }
    }

    const last = usable[usable.length - 1]
    return { value: last.value, observedOn: last.periodEndDate, trend: signal }
  }

  /**
   * A metric LEVEL. `plan_readiness` is a four-level coverage counter the pure
   * package (correctly) refuses to trend; the twin still needs the reading, so it
   * is collected as a level and no trend is attached.
   */
  private async collectMetricLevel(
    def: TwinSignalDef,
    ctx: CollectContext,
  ): Promise<Collected | null> {
    const metricKey = def.source.metricKey
    if (!metricKey) return null
    const trend = await ctx.metricTrend(metricKey)
    const usable = trend.points.filter((p) => p.available && p.value !== null)
    if (usable.length === 0) return null
    const last = usable[usable.length - 1]
    return { value: last.value, observedOn: last.periodEndDate }
  }

  private async collectArAging(ctx: CollectContext): Promise<Collected | null> {
    const row = await ctx.arAging()
    if (!row) return null
    return { value: row.ar90Plus, observedOn: isoDay(row.asOfDate) }
  }

  private async collectBudgetPresent(ctx: CollectContext): Promise<Collected | null> {
    const period = await ctx.newestPeriod()
    if (!period) return null
    // A boolean is a reading: "no budget on file for FY26" is a fact, not a hole.
    return { value: period.budgets.length > 0, observedOn: isoDay(period.periodEndDate) }
  }

  private async collectMinutesLag(ctx: CollectContext): Promise<Collected | null> {
    const meetings = await ctx.meetings()
    const held = meetings.filter((m) => m.status === 'held')
    const approved = held.filter(
      (m) => m.minutesStatus === 'approved' && m.minutesApprovedAt !== null,
    )
    if (approved.length === 0) {
      // Held meetings with no approved minutes at all is itself a hole, not a lag
      // of zero. Reporting 0 here would read as "minutes land the same day".
      return null
    }
    const newest = approved[0]
    const lag = daysBetween(isoDay(newest.scheduledAt), isoDay(newest.minutesApprovedAt as Date))
    if (lag === null) return null
    return { value: lag, observedOn: isoDay(newest.minutesApprovedAt as Date) }
  }

  private async collectMeetingCadence(ctx: CollectContext): Promise<Collected | null> {
    const meetings = await ctx.meetings()
    const held = meetings.filter((m) => m.status === 'held')
    if (held.length === 0) return null
    const cutoff = daysFromCivilIso(ctx.today) - 365
    const trailing = held.filter((m) => {
      const c = toCivil(m.scheduledAt)
      return c !== null && daysFromCivil(c.y, c.m, c.d) >= cutoff
    })
    return { value: trailing.length, observedOn: isoDay(held[0].scheduledAt) }
  }

  private async collectPolicyReview(ctx: CollectContext): Promise<Collected | null> {
    const policies = await ctx.policies()
    if (policies.length === 0) return null
    let overdue = 0
    for (const p of policies) {
      const res = computeReviewStatus(
        {
          status: p.status,
          adoptedDate: p.adoptedDate,
          lastReviewedDate: p.lastReviewedDate,
          reviewIntervalMonths: p.reviewIntervalMonths,
        },
        ctx.now,
      )
      if (res.status === 'overdue') overdue += 1
    }
    return {
      value: overdue,
      observedOn: isoOrNull(maxDate(policies.map((p) => p.lastReviewedDate))),
    }
  }

  /** The Phase-C documented convention: curriculum documents live in Policy. */
  private async collectCurriculumReview(ctx: CollectContext): Promise<Collected | null> {
    const policies = (await ctx.policies()).filter(
      (p) => (p.category ?? '').trim().toLowerCase() === 'curriculum',
    )
    if (policies.length === 0) return null
    let overdue = 0
    for (const p of policies) {
      const res = computeReviewStatus(
        {
          status: p.status,
          adoptedDate: p.adoptedDate,
          lastReviewedDate: p.lastReviewedDate,
          reviewIntervalMonths: p.reviewIntervalMonths,
        },
        ctx.now,
      )
      if (res.status === 'overdue') overdue += 1
    }
    return {
      value: overdue,
      observedOn: isoOrNull(maxDate(policies.map((p) => p.lastReviewedDate))),
    }
  }

  private async collectBoardTerms(ctx: CollectContext): Promise<Collected | null> {
    const people = await ctx.boardPeople()
    if (people.length === 0) return null
    const todayDays = daysFromCivilIso(ctx.today)
    let expired = 0
    for (const p of people) {
      const c = p.termEnd ? toCivil(p.termEnd) : null
      if (c !== null && daysFromCivil(c.y, c.m, c.d) < todayDays) expired += 1
    }
    // The most recent term START is the last dated thing this register recorded;
    // termEnd is a plan, not an observation.
    return { value: expired, observedOn: isoOrNull(maxDate(people.map((p) => p.termStart))) }
  }

  private async collectCommitteeChairs(ctx: CollectContext): Promise<Collected | null> {
    const committees = await ctx.committees()
    if (committees.length === 0) return null
    let without = 0
    for (const c of committees) {
      const hasChairMembership = c.memberships.some((m) => m.role === 'chair')
      const hasLegacyChair = (c.chair ?? '').trim().length > 0
      if (!hasChairMembership && !hasLegacyChair) without += 1
    }
    // A committee roster carries NO as-of date. `createdAt` is when WE wrote a row
    // and says nothing about the world, so this signal is honestly undated.
    return { value: without, observedOn: null }
  }

  private async collectPlanHorizon(ctx: CollectContext): Promise<Collected | null> {
    const plan = await ctx.strategicPlan()
    if (!plan) return null
    const end = isoOrNull(plan.endDate)
    if (end === null) return { value: plan.fyEndYear, observedOn: isoOrNull(plan.startDate), lineageField: 'fyEndYear' }
    return { value: end, observedOn: isoOrNull(plan.startDate) }
  }

  private async collectMaintenanceBacklog(ctx: CollectContext): Promise<Collected | null> {
    const items = await ctx.maintenanceItems()
    if (items.length === 0) return null
    const open = items.filter((i) => i.status !== 'resolved').length
    // The last time this register recorded work COMPLETED — a real dated event.
    return { value: open, observedOn: isoOrNull(maxDate(items.map((i) => i.resolvedAt))) }
  }

  /**
   * AIC Phase F — the STAFF EVALUATION register. COUNTS ONLY.
   *
   * The value is the number of evaluations past THEIR OWN RECORDED DUE DATE, which
   * is a documentary fact rather than a judgement about a person. Nothing about who
   * is overdue leaves this method: `ctx.staffEvaluations()` selects three columns
   * and neither the person relation nor the evaluator's name is among them.
   *
   * ZERO ROWS IS `no_data` ("we could not look"). A register that HAS rows and none
   * overdue is `available` with value 0 ("we looked and it is fine"). Those are
   * different facts and this catalog never conflates them.
   */
  private async collectStaffEvaluations(ctx: CollectContext): Promise<Collected | null> {
    const rows = await ctx.staffEvaluations()
    if (rows.length === 0)
      return { value: null, observedOn: null, noData: true, noDataReason: EMPTY_REGISTER_READING['hr.staff_evaluations'] }
    const overdue = rows.filter((r) => isEvaluationOverdue(r, ctx.today)).length
    // The last dated thing this register actually RECORDED. A dueDate is a plan,
    // not an observation — the gov.board_terms precedent.
    return {
      value: overdue,
      observedOn: isoOrNull(maxDate(rows.map((r) => r.completedDate))),
    }
  }

  /**
   * AIC Phase F — COMPLIANCE INSPECTIONS, read from the DECLARED `complianceKind`
   * on a facilities item. Never inferred from `title` or `category`, which are free
   * text: "an inspection of an unnamed kind is overdue" is a sentence this product
   * will not say.
   *
   * Shares the ONE memoised `ctx.maintenanceItems()` read with
   * `fac.maintenance_backlog`, whose collector is byte-identical to Phase D.
   */
  private async collectComplianceInspections(ctx: CollectContext): Promise<Collected | null> {
    const tracked = (await ctx.maintenanceItems()).filter((i) => i.complianceKind !== null)
    if (tracked.length === 0)
      return { value: null, observedOn: null, noData: true, noDataReason: EMPTY_REGISTER_READING['fac.inspections'] }
    const overdue = tracked.filter((i) => isInspectionOverdue(i, ctx.today)).length
    return { value: overdue, observedOn: isoOrNull(maxDate(tracked.map((i) => i.resolvedAt))) }
  }

  /**
   * AIC Phase F — PRIOR VISIT FINDINGS. The value is the count still recorded OPEN.
   *
   * `observedOn` is the most recent VISIT date: that is the day the world was
   * observed, and it is genuinely years old for most schools — which is why this
   * signal's expected cadence is a full accreditation term and not a year.
   */
  private async collectPriorVisitFindings(ctx: CollectContext): Promise<Collected | null> {
    const rows = await ctx.priorVisitFindings()
    if (rows.length === 0)
      return { value: null, observedOn: null, noData: true, noDataReason: EMPTY_REGISTER_READING['acc.prior_visit_findings'] }
    const open = rows.filter((r) => r.status === 'open').length
    return { value: open, observedOn: isoOrNull(maxDate(rows.map((r) => r.visitDate))) }
  }

  private async collectHeadcount(ctx: CollectContext): Promise<Collected | null> {
    const snap = await ctx.enrollmentSnapshot()
    if (!snap) return null
    // SCHOOL TOTAL — deliberately NOT small-cell suppressed (§2 carve-out).
    return { value: snap.totalEnrolled, observedOn: isoDay(snap.observedOn) }
  }

  /**
   * Per-grade cells, EVERY ONE of them suppressed before it can be serialised.
   *
   * `value` is deliberately null: the signal IS the cell set, and publishing a
   * scalar derived from the same rows would be a second place a small count could
   * leak. The cells carry `band` copy for anything below MIN_CELL, and
   * complementary suppression closes the subtract-from-the-total hole.
   */
  private async collectFeederGrades(ctx: CollectContext): Promise<Collected | null> {
    const snap = await ctx.enrollmentSnapshot()
    if (!snap) return null
    const raw = snap.byGrade as Record<string, unknown> | null
    if (!raw || typeof raw !== 'object') return null
    const cells = Object.entries(raw)
      .filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1]))
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([key, value]) => ({ key, value }))
    if (cells.length === 0) return null
    const suppressed = suppressSmallCellSet(cells, { total: snap.totalEnrolled })
    return { value: null, observedOn: isoDay(snap.observedOn), cells: suppressed.cells }
  }

  /**
   * The ONE roster-derived signal, and the ONE place StudentsService is injected.
   * No direct student-row query exists anywhere in this directory (acceptance 5).
   *
   * Flags are NOT a partition of the roster (a student may carry two), so no
   * `total` is supplied to the cell set: complementary suppression against a total
   * these cells do not sum to would hide a truthfully-published cohort while still
   * leaving the suppressed one bounded.
   *
   * THE HEADLINE IS THEREFORE SUPPRESSED WHENEVER ANY CELL IS. Publishing
   * `flags.any` beside an unprotected cell set is the differencing hole §2 calls
   * "primary suppression is theatre": with iep=4, plan504=30, ell=0 the reader
   * computes 34 - 30 - 0 = 4 and, from the suppression itself, iep <= 9 — "between
   * 4 and 9 students at this school have an IEP", and exactly 4 whenever the flags
   * do not overlap, which in a 200-student school they usually do not. Since
   * |I u P u E| <= |I| + |P| + |E|, the published headline is always a usable lower
   * bound on the hidden cell. Withholding it removes the subtraction entirely and
   * leaves exactly the primary-suppression guarantee: 1..9, nothing narrower. Same
   * discipline as enr.feeder_grades, which publishes no scalar at all.
   */
  private async collectSupportNeeds(ctx: CollectContext): Promise<Collected | null> {
    const agg = await ctx.rosterAggregate()
    if (!agg || agg.total === 0) return null
    const flags = agg.counts.flags
    const suppressedSet = suppressSmallCellSet([
      { key: 'iep', value: flags.iep },
      { key: 'plan504', value: flags.plan504 },
      { key: 'ell', value: flags.ell },
    ])
    const headline = suppressSmallCells(flags.any)
    const headlineValue = suppressedSet.suppressedCount > 0 ? null : headline.value
    // The roster has no as-of date of its own; it is a live register, not an
    // observation with a date attached.
    return { value: headlineValue, observedOn: null, cells: suppressedSet.cells }
  }

  private async collectEvidenceCurrency(ctx: CollectContext): Promise<Collected | null> {
    const currency = await ctx.evidenceCurrency()
    if (!currency) return null
    const entries = Object.entries(currency.byStandard)
    if (entries.length === 0) return null
    // Standards carrying at least one requirement that is not current. `not_tracked`
    // is excluded on purpose: a hole we chose not to dig is never a school's fault.
    let notCurrent = 0
    for (const [, rows] of entries) {
      if (rows.some((r) => r.state === 'stale' || r.state === 'missing' || r.state === 'expiring')) {
        notCurrent += 1
      }
    }
    return { value: notCurrent, observedOn: null }
  }

  private async collectReadinessSeries(ctx: CollectContext): Promise<Collected | null> {
    const readiness = await ctx.readiness()
    if (!readiness) return null
    return { value: readiness.readinessPct, observedOn: readiness.snapshotDate }
  }

  private async collectUnscoredStandards(ctx: CollectContext): Promise<Collected | null> {
    const standards = await ctx.standards()
    if (standards.length === 0) return null
    return { value: standards.filter((s) => s.rubricScore === null).length, observedOn: null }
  }

  private async collectUnsupportedScore(ctx: CollectContext): Promise<Collected | null> {
    const standards = await ctx.standards()
    if (standards.length === 0) return null
    const withEvidence = await ctx.evidenceCounts()
    const unsupported = standards.filter(
      (s) => s.rubricScore !== null && s.rubricScore >= 3 && (withEvidence.get(s.id) ?? 0) === 0,
    ).length
    return { value: unsupported, observedOn: null }
  }

  // ── The lazily-memoised query context ──────────────────────────────────────

  /**
   * Every loader below is `once`-wrapped: a group shared by two signals costs ONE
   * query, and a group whose signals are all not_licensed or not_tracked costs
   * ZERO — which is what makes the entitlement promise testable with a spy rather
   * than by reading the code.
   */
  private buildContext(
    schoolId: string,
    now: Date,
    strict: boolean,
    entitled: ReadonlySet<ModuleKey>,
  ): CollectContext {
    const today = isoDay(now)
    const prisma = this.prisma
    const trendCache = new Map<MetricKey, Promise<MetricTrend>>()
    const batchKeys = batchMetricKeys(entitled)
    let batch: Promise<Map<MetricKey, MetricTrend>> | null = null

    return {
      schoolId,
      now,
      today,
      strict,

      /**
       * ONE read for the WHOLE catalog's trend metrics, resolved lazily.
       *
       * `AnalyticsService.trends()` re-resolves entitlement and re-reads
       * FiscalPeriod + StatementSnapshot (full payload JSON, every period) +
       * PeriodOperationalData on EVERY call, so memoising per metric still cost
       * twelve entitlement resolutions and thirty-six register reads per school
       * per night. `trendsMany` shares one set of reads across the set and skips
       * unentitled keys without querying, so the entitlement promise is unchanged.
       *
       * Still LAZY: the batch is only issued the first time a LICENSED trend
       * signal asks for a value, so a school licensed for nothing issues no read
       * at all — which is what the entitlement spy asserts.
       */
      metricTrend: (metric: MetricKey) => {
        const hit = trendCache.get(metric)
        if (hit) return hit
        if (batch === null) batch = this.analytics.trendsMany(schoolId, batchKeys)
        const p = batch.then((m) => m.get(metric) ?? this.analytics.trends(schoolId, metric))
        trendCache.set(metric, p)
        return p
      },

      arAging: once(() =>
        prisma.arApAgingSnapshot.findFirst({
          where: { schoolId },
          orderBy: { asOfDate: 'desc' },
          select: { asOfDate: true, arTotal: true, ar90Plus: true },
        }),
      ),

      newestPeriod: once(() =>
        prisma.fiscalPeriod.findFirst({
          where: { schoolId },
          orderBy: { periodEndDate: 'desc' },
          select: {
            id: true,
            label: true,
            periodEndDate: true,
            budgets: { select: { id: true }, take: 1 },
          },
        }),
      ),

      meetings: once(() =>
        prisma.meeting.findMany({
          where: { schoolId },
          orderBy: { scheduledAt: 'desc' },
          select: {
            scheduledAt: true,
            status: true,
            minutesStatus: true,
            minutesApprovedAt: true,
          },
        }),
      ),

      policies: once(() =>
        prisma.policy.findMany({
          where: { schoolId },
          select: {
            status: true,
            category: true,
            adoptedDate: true,
            lastReviewedDate: true,
            reviewIntervalMonths: true,
          },
        }),
      ),

      boardPeople: once(() =>
        prisma.governancePerson.findMany({
          where: { schoolId, active: true, groups: { has: 'board' } },
          select: { termStart: true, termEnd: true },
        }),
      ),

      committees: once(() =>
        prisma.committee.findMany({
          where: { schoolId, active: true },
          select: { chair: true, memberships: { select: { role: true } } },
        }),
      ),

      strategicPlan: once(() =>
        prisma.strategicPlan.findFirst({
          where: { schoolId, status: 'adopted' },
          orderBy: [{ endDate: 'desc' }, { fyEndYear: 'desc' }],
          select: { startDate: true, endDate: true, fyEndYear: true, status: true },
        }),
      ),

      // ONE read serves BOTH fac.maintenance_backlog and (AIC Phase F)
      // fac.inspections. The select is widened by two columns; the backlog
      // collector and its predicate are byte-identical to Phase D and still count
      // EVERY open item, compliance-kinded or not.
      maintenanceItems: once(() =>
        prisma.maintenanceItem.findMany({
          where: { schoolId },
          select: { status: true, resolvedAt: true, complianceKind: true, targetDate: true },
        }),
      ),

      /**
       * AIC Phase F — ADULT-STAFF EMPLOYMENT PII. THREE COLUMNS AND NO MORE.
       *
       * This is the ONLY place under apps/api/src/twin/ that reads the register's
       * rows. No person, no evaluator, no cycle label, no notes — there
       * is no identity here to leak into a finding, a briefing, Penny or an export.
       * no-staff-pii.spec.ts parses this select and fails the BUILD on a fourth
       * column.
       */
      staffEvaluations: once(() =>
        prisma.staffEvaluation.findMany({
          where: { schoolId },
          select: { dueDate: true, completedDate: true, status: true },
        }),
      ),

      /**
       * AIC Phase F — the prior-visit register. `citedStandardCode` is selected
       * because the register view matches it against the school's own standards;
       * the free-text `text` of a citation is NEVER read on this path, and no
       * payload the twin produces carries it.
       */
      priorVisitFindings: once(() =>
        prisma.priorVisitFinding.findMany({
          where: { schoolId },
          select: { visitDate: true, status: true, citedStandardCode: true },
        }),
      ),

      enrollmentSnapshot: once(() =>
        prisma.enrollmentSnapshot.findFirst({
          where: { schoolId },
          orderBy: { observedOn: 'desc' },
          select: { observedOn: true, totalEnrolled: true, byGrade: true },
        }),
      ),

      rosterAggregate: once(() => this.students.aggregate(schoolId, {})),

      evidenceCurrency: once(() =>
        this.evidenceReadiness.getCurrencyByStandard(schoolId, {}, now),
      ),

      readiness: once(async () => {
        const row = await prisma.accreditationReadinessSnapshot.findFirst({
          where: { schoolId },
          orderBy: { snapshotDate: 'desc' },
          select: { snapshotDate: true, readinessPct: true, isDemo: true },
        })
        return row
          ? {
              snapshotDate: isoDay(row.snapshotDate),
              readinessPct: row.readinessPct,
              isDemo: row.isDemo,
            }
          : null
      }),

      standards: once(() =>
        prisma.accreditationStandard.findMany({
          where: { schoolId },
          select: { id: true, rubricScore: true },
        }),
      ),

      evidenceCounts: once(async () => {
        const rows = await prisma.accreditationEvidence.groupBy({
          by: ['standardId'],
          where: { schoolId },
          _count: { _all: true },
        })
        return new Map(rows.map((r) => [r.standardId, r._count._all]))
      }),

      /**
       * The previous run's values, recovered from the newest findings' basis chains.
       *
       * DEPLOY-ORDER SAFE: before the Phase-D migration lands this table does not
       * exist, and a missing table must not cost a school its whole signal set —
       * the throw is caught by the caller and every signal reports `unchanged`,
       * which is the correct answer when there is no prior observation anyway.
       */
      priorValues: once(async () => {
        const map = new Map<string, unknown>()
        const rows = await prisma.accreditationFinding.findMany({
          where: { schoolId },
          orderBy: { lastSeenAt: 'desc' },
          take: PRIOR_VALUE_SCAN,
          select: { evidencePayload: true },
        })
        for (const r of rows) {
          const payload = r.evidencePayload as { signals?: Record<string, { value?: unknown }> } | null
          const signals = payload?.signals
          if (!signals || typeof signals !== 'object') continue
          for (const [key, entry] of Object.entries(signals)) {
            if (!map.has(key) && entry && typeof entry === 'object' && 'value' in entry) {
              map.set(key, (entry as { value?: unknown }).value)
            }
          }
        }
        return map
      }),
    }
  }
}

/** Whole days since the civil epoch for a yyyy-mm-dd string (0 on an unparseable input). */
function daysFromCivilIso(iso: string): number {
  const c = toCivil(iso)
  return c ? daysFromCivil(c.y, c.m, c.d) : 0
}

/** The lazily-memoised per-school read surface. Every loader is schoolId-scoped. */
interface CollectContext {
  schoolId: string
  now: Date
  today: string
  strict: boolean
  metricTrend(metric: MetricKey): Promise<MetricTrend>
  arAging(): Promise<{ asOfDate: Date; arTotal: number; ar90Plus: number } | null>
  newestPeriod(): Promise<{
    id: string
    label: string
    periodEndDate: Date
    budgets: { id: string }[]
  } | null>
  meetings(): Promise<
    {
      scheduledAt: Date
      status: string
      minutesStatus: string
      minutesApprovedAt: Date | null
    }[]
  >
  policies(): Promise<
    {
      status: string
      category: string
      adoptedDate: Date | null
      lastReviewedDate: Date | null
      reviewIntervalMonths: number
    }[]
  >
  boardPeople(): Promise<{ termStart: Date | null; termEnd: Date | null }[]>
  committees(): Promise<{ chair: string | null; memberships: { role: string }[] }[]>
  strategicPlan(): Promise<{
    startDate: Date | null
    endDate: Date | null
    fyEndYear: number
    status: string
  } | null>
  maintenanceItems(): Promise<
    {
      status: string
      resolvedAt: Date | null
      complianceKind: string | null
      targetDate: Date | null
    }[]
  >
  /** AIC Phase F. COUNTS ONLY — three columns, no identity of any kind. */
  staffEvaluations(): Promise<
    { dueDate: Date; completedDate: Date | null; status: string }[]
  >
  /** AIC Phase F. */
  priorVisitFindings(): Promise<
    { visitDate: Date; status: string; citedStandardCode: string }[]
  >
  enrollmentSnapshot(): Promise<{
    observedOn: Date
    totalEnrolled: number
    byGrade: unknown
  } | null>
  rosterAggregate(): Promise<{
    total: number
    counts: { flags: { iep: number; plan504: number; ell: number; any: number } }
  }>
  evidenceCurrency(): Promise<{ byStandard: Record<string, { state: string }[]> } | null>
  readiness(): Promise<{ snapshotDate: string; readinessPct: number; isDemo: boolean } | null>
  standards(): Promise<{ id: string; rubricScore: number | null }[]>
  evidenceCounts(): Promise<Map<string, number>>
  priorValues(): Promise<Map<string, unknown>>
}
