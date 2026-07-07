import { Injectable } from '@nestjs/common'
import { Prisma } from '@finrep/db'
import type { ReportBundle } from '@finrep/engine'
import {
  bandsFor,
  computeMetricsForPeriod,
  formatMetricValue,
  getMetric,
  healthStatus,
  isMetricKey,
  resolveDisplayUnit,
  type MetricResult,
  type PeriodOperational,
} from '@finrep/analytics'
import { PrismaService } from '../prisma/prisma.service.js'
import { computePace, meanFraction, worstPace, type PaceStatus } from './strategy-progress.js'
import { STALE_INITIATIVE_DAYS } from './strategy.constants.js'
import type {
  GoalComputed,
  GoalCounts,
  InitiativeStatusCounts,
  MilestoneView,
  PillarComputed,
  StrategyComputed,
  TrendPoint,
} from './strategy.types.js'

/** Prisma Decimal -> plain number (null-safe) BEFORE any pure fn touches it. */
function dec(v: Prisma.Decimal | number | null | undefined): number | null {
  if (v === null || v === undefined) return null
  return typeof v === 'number' ? v : Number(v)
}

/** yyyy-mm-dd for a @db.Date / timestamp, no timezone drift. */
function isoDate(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null
}

/** Human display name for an owner row (firstName lastName, else email). */
function ownerName(u: { firstName: string | null; lastName: string | null; email: string } | null): string {
  if (!u) return ''
  const full = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()
  return full || u.email
}

const EMPTY_INITIATIVE_COUNTS = (): InitiativeStatusCounts => ({
  planned: 0,
  in_progress: 0,
  blocked: 0,
  done: 0,
  cancelled: 0,
})

const EMPTY_GOAL_COUNTS = (): GoalCounts => ({
  total: 0,
  onTrack: 0,
  atRisk: 0,
  behind: 0,
  achieved: 0,
  noData: 0,
})

function tallyGoal(counts: GoalCounts, status: PaceStatus): void {
  counts.total += 1
  if (status === 'on_track') counts.onTrack += 1
  else if (status === 'at_risk') counts.atRisk += 1
  else if (status === 'behind') counts.behind += 1
  else if (status === 'achieved') counts.achieved += 1
  else counts.noData += 1
}

type PlanTree = Prisma.StrategicPlanGetPayload<{
  include: {
    pillars: {
      include: {
        goals: {
          include: {
            owner: { select: { id: true; firstName: true; lastName: true; email: true } }
            initiatives: {
              include: {
                owner: { select: { id: true; firstName: true; lastName: true; email: true } }
              }
            }
          }
        }
      }
    }
  }
}>

/**
 * Phase 5 Strategic Planning — the PROGRESS SPINE. BOOT-SAFE BY CONSTRUCTION: it
 * injects **PrismaService ONLY** + the PURE @finrep/analytics functions. It NEVER
 * injects AnalyticsService / OperationalService / TasksService / BriefingService —
 * that mutual-service class of dep is exactly what crash-looped the container twice
 * on prior features ("Cannot access 'X' before initialization"). Every metric goal's
 * number is the ONE canonical value (computeMetricsForPeriod + getMetric + bandsFor/
 * healthStatus + formatMetricValue), byte-identical to the analytics dashboard —
 * never reimplemented. The snapshot→compute path is copied from analytics.service.ts
 * computeMetricsResponse; the persisted-read pattern from briefing.service.ts.
 *
 * ONE-PERIOD-ONE-COMPUTE: the current annual period + its snapshot + operational row
 * + the full MetricResult set are resolved ONCE and reused across every metric goal;
 * linked-task counts come from a SINGLE groupBy over the plan's initiatives.
 */
@Injectable()
export class StrategyProgressService {
  constructor(private readonly prisma: PrismaService) {}

  /** Latest ANNUAL statement snapshot period for the school (the v1 metric basis). A
   *  monthly YTD snapshot lives in a different table, so `statementSnapshots: some`
   *  only ever matches the annual path. Null when the school has never generated one. */
  private async resolveCurrentPeriod(schoolId: string) {
    return this.prisma.fiscalPeriod.findFirst({
      where: { schoolId, statementSnapshots: { some: {} } },
      orderBy: [{ periodEndDate: 'desc' }, { createdAt: 'desc' }],
    })
  }

  /**
   * The current canonical value of a metric for the school (the ONE dashboard value),
   * with the period it came from + that period's end date. Used to FREEZE a goal's
   * baseline at bind / rebaseline. Null when there is no snapshot or the metric is
   * unavailable. Prisma-only + pure @finrep/analytics — no service injection.
   */
  async resolveCurrentMetric(
    schoolId: string,
    metricKey: string,
  ): Promise<{ value: number; periodId: string; date: Date } | null> {
    if (!isMetricKey(metricKey)) return null
    const period = await this.resolveCurrentPeriod(schoolId)
    if (!period) return null
    const snap = await this.prisma.statementSnapshot.findFirst({
      where: { schoolId, fiscalPeriodId: period.id },
      orderBy: { createdAt: 'desc' },
    })
    if (!snap) return null
    const opRow = await this.prisma.periodOperationalData.findUnique({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
    })
    const operational: PeriodOperational | null = opRow
      ? {
          enrollment: opRow.enrollment,
          enrollmentFte: dec(opRow.enrollmentFte),
          studentsOnAid: opRow.studentsOnAid,
          financialAidTotal: dec(opRow.financialAidTotal),
          teachingFte: dec(opRow.teachingFte),
          totalStaffFte: dec(opRow.totalStaffFte),
        }
      : null
    const results = computeMetricsForPeriod({
      current: snap.payload as unknown as ReportBundle,
      prior: null,
      currentOperational: operational,
      priorOperational: null,
    })
    const r = results.find((m) => m.key === metricKey)
    if (!r || !r.available || r.value === null) return null
    return { value: r.value, periodId: period.id, date: period.periodEndDate }
  }

  /**
   * Compute the FROZEN payload for one plan. Loads the plan tree, resolves the
   * period/snapshot/operational/metrics ONCE, backfills any unfrozen metric baselines
   * (persist-on-first-read — never recompute "earliest available"), then assembles
   * pillars → goals with the pure pace verdict. Returns { hasPlan:false } when the
   * plan is missing/foreign (so the fail-soft caller can't 500).
   */
  async computeForPlan(schoolId: string, planId: string, asOf: Date = new Date()): Promise<StrategyComputed> {
    const plan = (await this.prisma.strategicPlan.findFirst({
      where: { id: planId, schoolId },
      include: {
        pillars: {
          orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
          include: {
            goals: {
              orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
              include: {
                owner: { select: { id: true, firstName: true, lastName: true, email: true } },
                initiatives: {
                  orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
                  include: {
                    owner: { select: { id: true, firstName: true, lastName: true, email: true } },
                  },
                },
              },
            },
          },
        },
      },
    })) as PlanTree | null
    if (!plan) return { hasPlan: false }

    const asOfIso = asOf.toISOString()

    // ── Resolve the metric basis ONCE (snapshot + operational + metrics) ──────────
    const period = await this.resolveCurrentPeriod(schoolId)
    let metricsByKey = new Map<string, MetricResult>()
    let dataAsOf: string | null = null
    if (period) {
      const snap = await this.prisma.statementSnapshot.findFirst({
        where: { schoolId, fiscalPeriodId: period.id },
        orderBy: { createdAt: 'desc' },
      })
      if (snap) {
        dataAsOf = snap.createdAt.toISOString()
        const bundle = snap.payload as unknown as ReportBundle
        const opRow = await this.prisma.periodOperationalData.findUnique({
          where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
        })
        const operational: PeriodOperational | null = opRow
          ? {
              enrollment: opRow.enrollment,
              enrollmentFte: dec(opRow.enrollmentFte),
              studentsOnAid: opRow.studentsOnAid,
              financialAidTotal: dec(opRow.financialAidTotal),
              teachingFte: dec(opRow.teachingFte),
              totalStaffFte: dec(opRow.totalStaffFte),
            }
          : null
        // enrollment_vs_plan has NO plan threaded here (Prisma-only, no
        // EnrollmentPlanService) → available:false → a bound goal reads no_data, per
        // the contract. Every other metric computes byte-identically to the dashboard.
        const results = computeMetricsForPeriod({
          current: bundle,
          prior: null,
          currentOperational: operational,
          priorOperational: null,
        })
        for (const r of results) metricsByKey.set(r.key, r)
      }
    }

    // ── Linked-task rollup — ONE groupBy over the plan's initiatives ──────────────
    const initiativeIds: string[] = []
    for (const pil of plan.pillars) for (const g of pil.goals) for (const i of g.initiatives) initiativeIds.push(i.id)
    const tasksByInitiative = new Map<string, { total: number; done: number }>()
    if (initiativeIds.length > 0) {
      const grouped = await this.prisma.task
        .groupBy({
          by: ['sourceRef', 'status'],
          where: { schoolId, sourceType: 'strategy', sourceRef: { in: initiativeIds } },
          _count: { _all: true },
        })
        .catch(() => [] as { sourceRef: string | null; status: string; _count: { _all: number } }[])
      for (const row of grouped) {
        const ref = row.sourceRef
        if (!ref) continue
        const bucket = tasksByInitiative.get(ref) ?? { total: 0, done: 0 }
        bucket.total += row._count._all
        if (row.status === 'done') bucket.done += row._count._all
        tasksByInitiative.set(ref, bucket)
      }
    }

    // ── Pillars → goals ───────────────────────────────────────────────────────────
    const pillars: PillarComputed[] = []
    const allGoalStatuses: PaceStatus[] = []
    const planGoalCounts = EMPTY_GOAL_COUNTS()
    const behindPaceGoals: StrategyComputedBehind[] = []
    const staleInitiatives: StaleAcc[] = []
    // Backfills to persist AFTER the loop (one updateMany-per-goal, fire-and-forget-safe).
    const baselineBackfills: { goalId: string; value: number; date: Date; periodId: string }[] = []

    for (const pil of plan.pillars) {
      const goals: GoalComputed[] = []
      const pillarGoalCounts = EMPTY_GOAL_COUNTS()
      const pillarStatuses: PaceStatus[] = []
      const pillarFractions: (number | null)[] = []

      for (const g of pil.goals) {
        // Initiative status rollup for this goal + stale detection.
        const initiativeStatusCounts = EMPTY_INITIATIVE_COUNTS()
        let linkedTotal = 0
        let linkedDone = 0
        for (const ini of g.initiatives) {
          const st = ini.status as keyof InitiativeStatusCounts
          if (st in initiativeStatusCounts) initiativeStatusCounts[st] += 1
          const t = tasksByInitiative.get(ini.id)
          if (t) {
            linkedTotal += t.total
            linkedDone += t.done
          }
          const staleDays = Math.floor((asOf.getTime() - ini.updatedAt.getTime()) / 86_400_000)
          if ((ini.status === 'planned' || ini.status === 'in_progress') && staleDays > STALE_INITIATIVE_DAYS) {
            staleInitiatives.push({
              title: ini.title,
              ownerName: ini.owner ? ownerName(ini.owner) : null,
              status: ini.status,
              staleDays,
            })
          }
        }

        const built = this.buildGoal(g, pil.name, {
          metricsByKey,
          dataAsOf,
          periodId: period?.id ?? null,
          periodEndDate: period ? isoDate(period.periodEndDate) : null,
          planStartDate: isoDate(plan.startDate),
          asOfIso,
          asOf,
          initiativeStatusCounts,
          linkedTaskCounts: g.goalType === 'task_rollup' ? { total: linkedTotal, done: linkedDone } : null,
          baselineBackfills,
          behindPaceGoals,
        })

        goals.push(built)
        pillarStatuses.push(built.paceStatus)
        pillarFractions.push(built.pctToTarget)
        allGoalStatuses.push(built.paceStatus)
        tallyGoal(pillarGoalCounts, built.paceStatus)
        tallyGoal(planGoalCounts, built.paceStatus)
      }

      pillars.push({
        id: pil.id,
        name: pil.name,
        description: pil.description,
        orderIndex: pil.orderIndex,
        progressPct: meanFraction(pillarFractions),
        paceStatus: worstPace(pillarStatuses),
        goalCounts: pillarGoalCounts,
        goals,
      })
    }

    // Persist baseline backfills (best-effort; a write hiccup never fails the read).
    for (const b of baselineBackfills) {
      await this.prisma.strategyGoal
        .update({
          where: { id: b.goalId },
          data: {
            baselineValue: new Prisma.Decimal(b.value),
            baselineDate: b.date,
            baselineMetricPeriodId: b.periodId,
          },
        })
        .catch(() => undefined)
    }

    const overallProgressPct = meanFraction(pillars.map((p) => p.progressPct))
    const overallPaceStatus = worstPace(allGoalStatuses)

    // Review-due-this-month (calendar month of asOf).
    const nextReviewDate = isoDate(plan.nextReviewDate)
    const reviewDueThisMonth =
      !!plan.nextReviewDate &&
      plan.nextReviewDate.getUTCFullYear() === asOf.getUTCFullYear() &&
      plan.nextReviewDate.getUTCMonth() === asOf.getUTCMonth()

    behindPaceGoals.sort((a, b) => (a.pctToTarget ?? 1) - (b.pctToTarget ?? 1))
    staleInitiatives.sort((a, b) => b.staleDays - a.staleDays)

    return {
      hasPlan: true,
      plan: {
        id: plan.id,
        name: plan.name,
        mission: plan.mission,
        status: plan.status,
        fyStartYear: plan.fyStartYear,
        fyEndYear: plan.fyEndYear,
        startDate: isoDate(plan.startDate),
        endDate: isoDate(plan.endDate),
        adoptedAt: plan.adoptedAt ? plan.adoptedAt.toISOString() : null,
        nextReviewDate,
        overallProgressPct,
        overallPaceStatus,
        goalCounts: planGoalCounts,
        dataAsOf,
      },
      summary: {
        overallProgressPct,
        overallPaceStatus,
        behindPaceGoalCount: planGoalCounts.behind,
        atRiskGoalCount: planGoalCounts.atRisk,
        staleInitiativeCount: staleInitiatives.length,
        reviewDueThisMonth,
        nextReviewDate,
        behindPaceGoals: behindPaceGoals.map((b) => ({
          title: b.title,
          pillar: b.pillar,
          metricKey: b.metricKey,
          metricLabel: b.metricLabel,
          formattedCurrent: b.formattedCurrent,
          formattedTarget: b.formattedTarget,
          targetDate: b.targetDate,
        })),
        staleInitiatives: staleInitiatives.map((s) => ({
          title: s.title,
          ownerName: s.ownerName,
          status: s.status,
          staleDays: s.staleDays,
        })),
      },
      pillars,
    }
  }

  /** Assemble ONE goal's computed view. Pure once the metric map is resolved (the
   *  only side effect is queuing a baseline backfill for an unfrozen metric goal). */
  private buildGoal(
    g: PlanTree['pillars'][number]['goals'][number],
    pillarName: string,
    ctx: {
      metricsByKey: Map<string, MetricResult>
      dataAsOf: string | null
      periodId: string | null
      periodEndDate: string | null
      planStartDate: string | null
      asOfIso: string
      asOf: Date
      initiativeStatusCounts: InitiativeStatusCounts
      linkedTaskCounts: { total: number; done: number } | null
      baselineBackfills: { goalId: string; value: number; date: Date; periodId: string }[]
      behindPaceGoals: StrategyComputedBehind[]
    },
  ): GoalComputed {
    const startDate = isoDate(g.startDate) ?? ctx.planStartDate
    const targetDate = isoDate(g.targetDate)
    const initiativeCount = g.initiatives.length

    let metricKey: string | null = null
    let metricLabel: string | null = null
    let unit: string | null = null
    let baseline: number | null = null
    let current: number | null = null
    let target: number | null = dec(g.targetValue)
    let formattedBaseline: string | null = null
    let formattedCurrent: string | null = null
    let formattedTarget: string | null = null
    let bandStatus: string | null = null
    let trend: TrendPoint[] = []
    let dataAsOf: string | null = null
    let manualProgressPct: number | null = null
    let milestones: MilestoneView[] | null = null

    // paceInput drives the ONE pure verdict, uniform across goal types.
    let paceBaseline: number | null = null
    let paceCurrent: number | null = null
    let paceTarget: number | null = null

    if (g.goalType === 'metric' && g.metricKey && isMetricKey(g.metricKey)) {
      const key = g.metricKey
      const def = getMetric(key)
      metricKey = key
      metricLabel = def.label
      unit = def.unit
      const displayUnit = resolveDisplayUnit(key, def.unit)
      const r = ctx.metricsByKey.get(key)
      current = r && r.available ? r.value : null

      // Baseline: FROZEN value if present; else backfill from the current reading.
      baseline = dec(g.baselineValue)
      if (baseline === null && current !== null && ctx.periodId) {
        baseline = current
        ctx.baselineBackfills.push({
          goalId: g.id,
          value: current,
          date: ctx.periodEndDate ? new Date(`${ctx.periodEndDate}T00:00:00.000Z`) : ctx.asOf,
          periodId: ctx.periodId,
        })
      }

      dataAsOf = ctx.dataAsOf
      bandStatus = current !== null ? healthStatus(current, bandsFor(key), true) : null
      formattedBaseline = baseline !== null ? formatMetricValue(baseline, displayUnit) : null
      formattedCurrent = current !== null ? formatMetricValue(current, displayUnit) : null
      formattedTarget = target !== null ? formatMetricValue(target, displayUnit) : null

      paceBaseline = baseline
      paceCurrent = current
      paceTarget = target
    } else if (g.goalType === 'milestone') {
      const items = coerceMilestones(g.milestones)
      milestones = items
      const total = items.length
      const done = items.filter((m) => m.done).length
      paceBaseline = 0
      paceCurrent = done
      paceTarget = total > 0 ? total : null
    } else if (g.goalType === 'task_rollup') {
      const lc = ctx.linkedTaskCounts ?? { total: 0, done: 0 }
      paceBaseline = 0
      paceCurrent = lc.done
      paceTarget = lc.total > 0 ? lc.total : null
    } else {
      // 'manual'
      manualProgressPct = dec(g.manualProgressPct)
      paceBaseline = 0
      paceCurrent = manualProgressPct
      paceTarget = manualProgressPct !== null ? 1 : null
    }

    const pace = computePace({
      baseline: paceBaseline,
      current: paceCurrent,
      target: paceTarget,
      startDate,
      targetDate,
      asOf: ctx.asOfIso,
    })

    // Metric trend: cheap 2-pt (baseline, current) + the expected-pace ghost line.
    if (g.goalType === 'metric' && baseline !== null && target !== null) {
      const expEnd =
        pace.expectedPct !== null ? baseline + pace.expectedPct * (target - baseline) : null
      trend = [
        { date: startDate ?? isoDate(g.baselineDate) ?? ctx.asOfIso.slice(0, 10), value: baseline, expected: baseline },
        { date: (dataAsOf ?? ctx.asOfIso).slice(0, 10), value: current, expected: expEnd },
      ]
    }

    if (pace.paceStatus === 'behind') {
      ctx.behindPaceGoals.push({
        title: g.title,
        pillar: pillarName,
        metricKey,
        metricLabel,
        formattedCurrent,
        formattedTarget,
        targetDate,
        pctToTarget: pace.pctToTarget,
      })
    }

    return {
      id: g.id,
      title: g.title,
      description: g.description,
      goalType: g.goalType,
      orderIndex: g.orderIndex,
      owner: g.owner ? { userId: g.owner.id, name: ownerName(g.owner) } : null,
      metricKey,
      metricLabel,
      unit,
      baseline,
      current,
      target,
      formattedBaseline,
      formattedCurrent,
      formattedTarget,
      pctToTarget: pace.pctToTarget,
      expectedPct: pace.expectedPct,
      paceStatus: pace.paceStatus,
      bandStatus,
      overshoot: pace.overshoot,
      startDate,
      targetDate,
      trend,
      dataAsOf,
      initiativeCount,
      initiativeStatusCounts: ctx.initiativeStatusCounts,
      linkedTaskCounts: ctx.linkedTaskCounts,
      milestones,
      manualProgressPct,
    }
  }
}

/** Internal accumulator carrying pctToTarget for behind-goal sorting (dropped in output). */
interface StrategyComputedBehind {
  title: string
  pillar: string
  metricKey: string | null
  metricLabel: string | null
  formattedCurrent: string | null
  formattedTarget: string | null
  targetDate: string | null
  pctToTarget: number | null
}

interface StaleAcc {
  title: string
  ownerName: string | null
  status: string
  staleDays: number
}

/** Coerce the stored milestones JSON into a clean [{id,label,done}] list. */
function coerceMilestones(v: unknown): MilestoneView[] {
  if (!Array.isArray(v)) return []
  const out: MilestoneView[] = []
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue
    const o = raw as Record<string, unknown>
    const label = typeof o.label === 'string' ? o.label : null
    if (!label) continue
    out.push({
      id: typeof o.id === 'string' ? o.id : label,
      label,
      done: o.done === true,
    })
  }
  return out
}
