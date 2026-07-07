import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@finrep/db'
import { isMetricKey } from '@finrep/analytics'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import { StrategyProgressService } from './strategy-progress.service.js'
import { MIX_METRIC_KEYS } from './strategy.constants.js'
import type { CreatePlanDto } from './dto/create-plan.dto.js'
import type { UpdatePlanDto } from './dto/update-plan.dto.js'
import type { CreatePillarDto } from './dto/create-pillar.dto.js'
import type { UpdatePillarDto } from './dto/update-pillar.dto.js'
import type { CreateGoalDto, MilestoneInputDto } from './dto/create-goal.dto.js'
import type { UpdateGoalDto } from './dto/update-goal.dto.js'
import type { CreateInitiativeDto } from './dto/create-initiative.dto.js'
import type { UpdateInitiativeDto } from './dto/update-initiative.dto.js'
import type { NoPlanPayload, StrategyComputed } from './strategy.types.js'

const NO_PLAN: NoPlanPayload = { hasPlan: false }

/** dec: Prisma Decimal → number (null-safe), so the raw tree is JSON-clean. */
function dec(v: Prisma.Decimal | number | null | undefined): number | null {
  if (v === null || v === undefined) return null
  return typeof v === 'number' ? v : Number(v)
}

/** yyyy-mm-dd for a @db.Date (no timezone drift), or null. */
function isoDate(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null
}

/** Display name for an owner relation (firstName lastName, else email), or null. */
function ownerName(u: { firstName: string | null; lastName: string | null; email: string } | null | undefined): string | null {
  if (!u) return null
  const full = [u.firstName, u.lastName].filter(Boolean).join(' ').trim()
  return full || u.email
}

/** The owner select shared by the raw-tree initiative reads. */
const OWNER_SELECT = { select: { firstName: true, lastName: true, email: true } } as const

/** Parse an incoming ISO date to UTC-midnight; undefined passes, null clears, bad → 400. */
function parseIsoDate(s: string | null | undefined, field: string): Date | null | undefined {
  if (s === undefined) return undefined
  if (s === null) return null
  const d = new Date(`${s.slice(0, 10)}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`Invalid ${field}: ${s}.`)
  return d
}

/** FY is Jul–Jun: startDate = Jul 1 of fyStartYear, endDate = Jun 30 of fyEndYear. */
function fyStart(year: number): Date {
  return new Date(Date.UTC(year, 6, 1)) // July = month index 6
}
function fyEnd(year: number): Date {
  return new Date(Date.UTC(year, 5, 30)) // June = month index 5
}

/** Normalize the milestone input list into the stored JSON (assign ids, default done). */
function normalizeMilestones(items: MilestoneInputDto[] | null | undefined): Prisma.InputJsonValue | undefined {
  if (items === undefined) return undefined
  if (items === null) return [] as unknown as Prisma.InputJsonValue
  return items.map((m, i) => ({
    id: m.id?.trim() || `m${i + 1}-${Math.random().toString(36).slice(2, 8)}`,
    label: m.label,
    done: m.done === true,
  })) as unknown as Prisma.InputJsonValue
}

/**
 * Phase 5 Strategic Planning — the register CRUD + the ACTIVE-plan reads the briefing/
 * Penny/web hero consume. School-scoped, TENANT-ISOLATED on every query (reads filter
 * by schoolId; every mutation resolves the row `where {id, schoolId}` first → a foreign
 * id 404s, so a cross-tenant mutation is impossible). Injects PrismaService + AuditService
 * + StrategyProgressService ONLY — never AnalyticsService/OperationalService/BriefingService
 * (the boot-safety rule). The heavy metric compute lives in StrategyProgressService.
 */
@Injectable()
export class StrategyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly progress: StrategyProgressService,
  ) {}

  // ── Membership guard (owner assignment) — clone of TasksService.assertAssigneeIsMember ──
  private async assertOwnerIsMember(schoolId: string, ownerUserId: string): Promise<void> {
    const m = await this.prisma.membership.findFirst({
      where: { schoolId, userId: ownerUserId, status: 'active' },
    })
    if (!m) throw new BadRequestException('Owner must be an active member of this school.')
  }

  /** Validate a proposed metric binding: known key + NOT a mix key. */
  private assertMetricBindable(metricKey: string): void {
    if (!isMetricKey(metricKey)) {
      throw new BadRequestException(`Unknown metric '${metricKey}'.`)
    }
    if ((MIX_METRIC_KEYS as readonly string[]).includes(metricKey)) {
      throw new BadRequestException(
        `Metric '${metricKey}' is a mix breakdown and cannot be a goal target — pick a single-value metric.`,
      )
    }
  }

  // ── Raw serializers (the editor tree; the hero/cards read the COMPUTED payload) ──
  private rawInitiative(
    i: {
      id: string; goalId: string; title: string; description: string | null; status: string
      ownerUserId: string | null; orderIndex: number; createdAt: Date; updatedAt: Date
      owner?: { firstName: string | null; lastName: string | null; email: string } | null
    },
    linkedTaskCounts: { total: number; done: number } | null = null,
  ) {
    return {
      id: i.id,
      goalId: i.goalId,
      title: i.title,
      description: i.description,
      status: i.status,
      ownerUserId: i.ownerUserId,
      // Owner name + per-initiative linked-task rollup so the web Initiatives tab is
      // real against live data (not fixture-only). Populated by getPlan; null on the
      // single create/update returns (the web refetches the tree after a write).
      ownerName: ownerName(i.owner),
      linkedTaskCounts,
      orderIndex: i.orderIndex,
      createdAt: i.createdAt.toISOString(),
      updatedAt: i.updatedAt.toISOString(),
    }
  }

  private rawGoal(g: {
    id: string; pillarId: string; title: string; description: string | null; goalType: string
    orderIndex: number; ownerUserId: string | null; metricKey: string | null
    targetValue: Prisma.Decimal | null; baselineValue: Prisma.Decimal | null; baselineDate: Date | null
    baselineMetricPeriodId: string | null; startDate: Date | null; targetDate: Date | null
    manualProgressPct: Prisma.Decimal | null; milestones: Prisma.JsonValue | null
    createdAt: Date; updatedAt: Date; initiatives?: Parameters<StrategyService['rawInitiative']>[0][]
  }) {
    return {
      id: g.id,
      pillarId: g.pillarId,
      title: g.title,
      description: g.description,
      goalType: g.goalType,
      orderIndex: g.orderIndex,
      ownerUserId: g.ownerUserId,
      metricKey: g.metricKey,
      targetValue: dec(g.targetValue),
      baselineValue: dec(g.baselineValue),
      baselineDate: isoDate(g.baselineDate),
      baselineMetricPeriodId: g.baselineMetricPeriodId,
      startDate: isoDate(g.startDate),
      targetDate: isoDate(g.targetDate),
      manualProgressPct: dec(g.manualProgressPct),
      milestones: g.milestones ?? null,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
      initiatives: (g.initiatives ?? []).map((i) => this.rawInitiative(i)),
    }
  }

  private rawPillar(p: {
    id: string; planId: string; name: string; description: string | null; orderIndex: number
    createdAt: Date; updatedAt: Date; goals?: Parameters<StrategyService['rawGoal']>[0][]
  }) {
    return {
      id: p.id,
      planId: p.planId,
      name: p.name,
      description: p.description,
      orderIndex: p.orderIndex,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      goals: (p.goals ?? []).map((g) => this.rawGoal(g)),
    }
  }

  private rawPlan(p: {
    id: string; name: string; mission: string | null; status: string; fyStartYear: number
    fyEndYear: number; startDate: Date | null; endDate: Date | null; adoptedAt: Date | null
    nextReviewDate: Date | null; createdAt: Date; updatedAt: Date
    pillars?: Parameters<StrategyService['rawPillar']>[0][]
  }) {
    return {
      id: p.id,
      name: p.name,
      mission: p.mission,
      status: p.status,
      fyStartYear: p.fyStartYear,
      fyEndYear: p.fyEndYear,
      startDate: isoDate(p.startDate),
      endDate: isoDate(p.endDate),
      adoptedAt: p.adoptedAt ? p.adoptedAt.toISOString() : null,
      nextReviewDate: isoDate(p.nextReviewDate),
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      pillars: (p.pillars ?? []).map((pi) => this.rawPillar(pi)),
    }
  }

  // ── Resolvers (tenant gate) ─────────────────────────────────────────────────────
  private async resolvePlan(schoolId: string, planId: string) {
    const plan = await this.prisma.strategicPlan.findFirst({ where: { id: planId, schoolId } })
    if (!plan) throw new NotFoundException('Strategic plan not found.')
    return plan
  }
  private async resolvePillar(schoolId: string, pillarId: string) {
    const pillar = await this.prisma.strategyPillar.findFirst({ where: { id: pillarId, schoolId } })
    if (!pillar) throw new NotFoundException('Pillar not found.')
    return pillar
  }
  private async resolveGoal(schoolId: string, goalId: string) {
    const goal = await this.prisma.strategyGoal.findFirst({ where: { id: goalId, schoolId } })
    if (!goal) throw new NotFoundException('Goal not found.')
    return goal
  }
  private async resolveInitiative(schoolId: string, initiativeId: string) {
    const ini = await this.prisma.strategyInitiative.findFirst({ where: { id: initiativeId, schoolId } })
    if (!ini) throw new NotFoundException('Initiative not found.')
    return ini
  }

  // ── Plans ────────────────────────────────────────────────────────────────────────
  async listPlans(schoolId: string) {
    const plans = await this.prisma.strategicPlan.findMany({
      where: { schoolId },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    })
    return { plans: plans.map((p) => this.rawPlan(p)) }
  }

  async getPlan(schoolId: string, planId: string) {
    await this.resolvePlan(schoolId, planId)
    const plan = await this.prisma.strategicPlan.findFirst({
      where: { id: planId, schoolId },
      include: {
        pillars: {
          orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
          include: {
            goals: {
              orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
              include: {
                initiatives: {
                  orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
                  include: { owner: OWNER_SELECT },
                },
              },
            },
          },
        },
      },
    })
    const raw = this.rawPlan(plan!)
    // Per-initiative linked-task rollup — ONE groupBy over every initiative in the tree
    // (mirrors StrategyProgressService), then injected so the Initiatives tab shows real
    // {done}/{total} bars against live tasks (sourceType='strategy', sourceRef=initiativeId).
    const counts = await this.linkedTaskCountsFor(schoolId, plan!)
    for (const pil of raw.pillars) {
      for (const g of pil.goals) {
        for (const ini of g.initiatives) ini.linkedTaskCounts = counts.get(ini.id) ?? null
      }
    }
    return raw
  }

  /** Map of initiativeId → {total, done} from linked workflow tasks (empty on any error). */
  private async linkedTaskCountsFor(
    schoolId: string,
    plan: { pillars: { goals: { initiatives: { id: string }[] }[] }[] },
  ): Promise<Map<string, { total: number; done: number }>> {
    const ids: string[] = []
    for (const pil of plan.pillars) for (const g of pil.goals) for (const i of g.initiatives) ids.push(i.id)
    const map = new Map<string, { total: number; done: number }>()
    if (ids.length === 0) return map
    const grouped = await this.prisma.task
      .groupBy({
        by: ['sourceRef', 'status'],
        where: { schoolId, sourceType: 'strategy', sourceRef: { in: ids } },
        _count: { _all: true },
      })
      .catch(() => [] as { sourceRef: string | null; status: string; _count: { _all: number } }[])
    for (const row of grouped) {
      const ref = row.sourceRef
      if (!ref) continue
      const bucket = map.get(ref) ?? { total: 0, done: 0 }
      bucket.total += row._count._all
      if (row.status === 'done') bucket.done += row._count._all
      map.set(ref, bucket)
    }
    return map
  }

  async createPlan(schoolId: string, dto: CreatePlanDto, userId: string) {
    if (dto.fyEndYear < dto.fyStartYear) {
      throw new BadRequestException('fyEndYear cannot be before fyStartYear.')
    }
    const status = dto.status ?? 'draft'
    const row = await this.prisma.strategicPlan.create({
      data: {
        schoolId,
        name: dto.name,
        mission: dto.mission ?? null,
        status,
        fyStartYear: dto.fyStartYear,
        fyEndYear: dto.fyEndYear,
        startDate: fyStart(dto.fyStartYear),
        endDate: fyEnd(dto.fyEndYear),
        adoptedAt: status === 'adopted' ? new Date() : null,
        nextReviewDate: parseIsoDate(dto.nextReviewDate, 'nextReviewDate') ?? null,
        updatedByUserId: userId,
      },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'strategy.plan.created',
      targetType: 'strategic_plans',
      targetId: row.id,
    })
    return this.rawPlan(row)
  }

  async updatePlan(schoolId: string, planId: string, dto: UpdatePlanDto, userId: string) {
    const existing = await this.resolvePlan(schoolId, planId)
    const pick = <T>(v: T | undefined, current: T): T => (v === undefined ? current : v)
    const fyStartYear = pick(dto.fyStartYear, existing.fyStartYear)
    const fyEndYear = pick(dto.fyEndYear, existing.fyEndYear)
    if (fyEndYear < fyStartYear) throw new BadRequestException('fyEndYear cannot be before fyStartYear.')

    const nextStatus = pick(dto.status, existing.status)
    // Stamp adoptedAt the first time the plan flips to 'adopted' (keep it stable after).
    const adoptedAt =
      nextStatus === 'adopted' ? (existing.adoptedAt ?? new Date()) : existing.adoptedAt

    const reviewDate = parseIsoDate(dto.nextReviewDate, 'nextReviewDate')
    const row = await this.prisma.strategicPlan.update({
      where: { id: existing.id },
      data: {
        name: pick(dto.name, existing.name),
        mission: pick(dto.mission, existing.mission),
        status: nextStatus,
        fyStartYear,
        fyEndYear,
        startDate: fyStart(fyStartYear),
        endDate: fyEnd(fyEndYear),
        adoptedAt,
        nextReviewDate: pick(reviewDate, existing.nextReviewDate),
        updatedByUserId: userId,
      },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'strategy.plan.updated',
      targetType: 'strategic_plans',
      targetId: row.id,
    })
    return this.rawPlan(row)
  }

  async removePlan(schoolId: string, planId: string, userId: string) {
    const existing = await this.resolvePlan(schoolId, planId)
    // Pillars/goals/initiatives cascade via FK ON DELETE CASCADE.
    await this.prisma.strategicPlan.delete({ where: { id: existing.id } })
    await this.audit.write({
      schoolId,
      userId,
      action: 'strategy.plan.deleted',
      targetType: 'strategic_plans',
      targetId: existing.id,
    })
    return { id: existing.id }
  }

  // ── COMPUTED reads (briefing / Penny / web hero) ─────────────────────────────────
  /** The COMPUTED payload for a specific plan (tenant-checked first). */
  async getPlanProgress(schoolId: string, planId: string): Promise<StrategyComputed> {
    await this.resolvePlan(schoolId, planId)
    return this.progress.computeForPlan(schoolId, planId)
  }

  /**
   * The COMPUTED payload for the school's ACTIVE plan, or { hasPlan:false }. FROZEN
   * resolution: the single `adopted` plan with the newest adoptedAt; else the most-
   * recently-updated `draft`; else none. NEVER THROWS — every path fail-softs to
   * { hasPlan:false } so the briefing/Penny can never 500 off this call.
   */
  async getActivePlanComputed(schoolId: string): Promise<StrategyComputed> {
    try {
      const planId = await this.resolveActivePlanId(schoolId)
      if (!planId) return NO_PLAN
      return await this.progress.computeForPlan(schoolId, planId)
    } catch {
      return NO_PLAN
    }
  }

  /** The active plan id per the frozen rule (adopted-newest → draft-newest → none). */
  private async resolveActivePlanId(schoolId: string): Promise<string | null> {
    const adopted = await this.prisma.strategicPlan.findFirst({
      where: { schoolId, status: 'adopted' },
      orderBy: [{ adoptedAt: 'desc' }, { updatedAt: 'desc' }],
      select: { id: true },
    })
    if (adopted) return adopted.id
    const draft = await this.prisma.strategicPlan.findFirst({
      where: { schoolId, status: 'draft' },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    })
    return draft?.id ?? null
  }

  // ── Pillars ────────────────────────────────────────────────────────────────────
  async createPillar(schoolId: string, planId: string, dto: CreatePillarDto, userId: string) {
    await this.resolvePlan(schoolId, planId)
    const row = await this.prisma.strategyPillar.create({
      data: {
        schoolId,
        planId,
        name: dto.name,
        description: dto.description ?? null,
        orderIndex: dto.orderIndex ?? 0,
        updatedByUserId: userId,
      },
    })
    await this.audit.write({ schoolId, userId, action: 'strategy.pillar.created', targetType: 'strategy_pillars', targetId: row.id })
    return this.rawPillar(row)
  }

  async updatePillar(schoolId: string, pillarId: string, dto: UpdatePillarDto, userId: string) {
    const existing = await this.resolvePillar(schoolId, pillarId)
    const pick = <T>(v: T | undefined, current: T): T => (v === undefined ? current : v)
    const row = await this.prisma.strategyPillar.update({
      where: { id: existing.id },
      data: {
        name: pick(dto.name, existing.name),
        description: pick(dto.description, existing.description),
        orderIndex: pick(dto.orderIndex, existing.orderIndex),
        updatedByUserId: userId,
      },
    })
    await this.audit.write({ schoolId, userId, action: 'strategy.pillar.updated', targetType: 'strategy_pillars', targetId: row.id })
    return this.rawPillar(row)
  }

  async removePillar(schoolId: string, pillarId: string, userId: string) {
    const existing = await this.resolvePillar(schoolId, pillarId)
    await this.prisma.strategyPillar.delete({ where: { id: existing.id } })
    await this.audit.write({ schoolId, userId, action: 'strategy.pillar.deleted', targetType: 'strategy_pillars', targetId: existing.id })
    return { id: existing.id }
  }

  // ── Goals ────────────────────────────────────────────────────────────────────────
  async createGoal(schoolId: string, pillarId: string, dto: CreateGoalDto, userId: string) {
    await this.resolvePillar(schoolId, pillarId)
    const goalType = dto.goalType ?? 'metric'
    if (dto.ownerUserId != null) await this.assertOwnerIsMember(schoolId, dto.ownerUserId)

    let metricKey: string | null = null
    if (goalType === 'metric') {
      if (!dto.metricKey) {
        throw new BadRequestException("A metric goal requires a metricKey (or pick 'milestone').")
      }
      this.assertMetricBindable(dto.metricKey)
      metricKey = dto.metricKey
    }

    const row = await this.prisma.strategyGoal.create({
      data: {
        schoolId,
        pillarId,
        title: dto.title,
        description: dto.description ?? null,
        goalType,
        orderIndex: dto.orderIndex ?? 0,
        ownerUserId: dto.ownerUserId ?? null,
        metricKey,
        targetValue: dto.targetValue != null ? new Prisma.Decimal(dto.targetValue) : null,
        startDate: parseIsoDate(dto.startDate, 'startDate') ?? null,
        targetDate: parseIsoDate(dto.targetDate, 'targetDate') ?? null,
        manualProgressPct:
          goalType === 'manual' && dto.manualProgressPct != null
            ? new Prisma.Decimal(dto.manualProgressPct)
            : null,
        milestones: goalType === 'milestone' ? (normalizeMilestones(dto.milestones ?? []) ?? Prisma.JsonNull) : Prisma.JsonNull,
        updatedByUserId: userId,
      },
    })
    await this.audit.write({ schoolId, userId, action: 'strategy.goal.created', targetType: 'strategy_goals', targetId: row.id })
    return this.rawGoal(row)
  }

  async updateGoal(schoolId: string, goalId: string, dto: UpdateGoalDto, userId: string) {
    const existing = await this.resolveGoal(schoolId, goalId)
    const pick = <T>(v: T | undefined, current: T): T => (v === undefined ? current : v)
    if (dto.ownerUserId != null) await this.assertOwnerIsMember(schoolId, dto.ownerUserId)

    const goalType = pick(dto.goalType, existing.goalType)

    // Re-bind metric: validate + mix-reject, and RE-FREEZE the baseline (a changed
    // METRIC invalidates the old frozen baseline — clear it so the next read backfills
    // a fresh one for the new binding). A target change does NOT re-baseline (see below).
    let metricKey: string | null | undefined = undefined
    let clearBaseline = false
    if (dto.metricKey !== undefined || (dto.goalType !== undefined && goalType === 'metric')) {
      const nextKey = dto.metricKey !== undefined ? dto.metricKey : existing.metricKey
      if (goalType === 'metric') {
        if (!nextKey) throw new BadRequestException('A metric goal requires a metricKey.')
        this.assertMetricBindable(nextKey)
        metricKey = nextKey
        if (nextKey !== existing.metricKey) clearBaseline = true
      } else {
        metricKey = null
        clearBaseline = true
      }
    }

    const data: Prisma.StrategyGoalUpdateInput = {
      title: pick(dto.title, existing.title),
      description: pick(dto.description, existing.description),
      goalType,
      orderIndex: pick(dto.orderIndex, existing.orderIndex),
      updatedByUser: userId ? { connect: { id: userId } } : undefined,
    }
    if (dto.ownerUserId !== undefined) {
      data.owner = dto.ownerUserId === null ? { disconnect: true } : { connect: { id: dto.ownerUserId } }
    }
    if (metricKey !== undefined) data.metricKey = metricKey
    if (dto.targetValue !== undefined) {
      // A target change moves only the DESTINATION, not the metric — the frozen
      // baseline (the "from" anchor) must survive so reported progress is stable.
      // Re-baselining happens only on a metricKey change (above) or the explicit
      // rebaseline endpoint. (Baseline-stability rule: frozen at bind, never silently moved.)
      data.targetValue = dto.targetValue === null ? null : new Prisma.Decimal(dto.targetValue)
    }
    const startDate = parseIsoDate(dto.startDate, 'startDate')
    if (startDate !== undefined) data.startDate = startDate
    const targetDate = parseIsoDate(dto.targetDate, 'targetDate')
    if (targetDate !== undefined) data.targetDate = targetDate
    if (dto.manualProgressPct !== undefined) {
      data.manualProgressPct = dto.manualProgressPct === null ? null : new Prisma.Decimal(dto.manualProgressPct)
    }
    if (dto.milestones !== undefined) {
      data.milestones = normalizeMilestones(dto.milestones) ?? Prisma.JsonNull
    }
    if (clearBaseline) {
      data.baselineValue = null
      data.baselineDate = null
      data.baselineMetricPeriodId = null
    }

    const row = await this.prisma.strategyGoal.update({ where: { id: existing.id }, data })
    await this.audit.write({ schoolId, userId, action: 'strategy.goal.updated', targetType: 'strategy_goals', targetId: row.id })
    return this.rawGoal(row)
  }

  async removeGoal(schoolId: string, goalId: string, userId: string) {
    const existing = await this.resolveGoal(schoolId, goalId)
    await this.prisma.strategyGoal.delete({ where: { id: existing.id } })
    await this.audit.write({ schoolId, userId, action: 'strategy.goal.deleted', targetType: 'strategy_goals', targetId: existing.id })
    return { id: existing.id }
  }

  /**
   * Intentional baseline RESET for a metric goal — refreeze the baseline to the
   * metric's CURRENT canonical value (the ONE dashboard value) + today's period. When
   * the metric is unavailable (no snapshot yet), the baseline is CLEARED so the next
   * read backfills a fresh one. 400 for a non-metric goal.
   */
  async rebaseline(schoolId: string, goalId: string, userId: string) {
    const existing = await this.resolveGoal(schoolId, goalId)
    if (existing.goalType !== 'metric' || !existing.metricKey) {
      throw new BadRequestException('Only a metric-bound goal can be rebaselined.')
    }
    const current = await this.progress.resolveCurrentMetric(schoolId, existing.metricKey)
    const row = await this.prisma.strategyGoal.update({
      where: { id: existing.id },
      data: current
        ? {
            baselineValue: new Prisma.Decimal(current.value),
            baselineDate: current.date,
            baselineMetricPeriodId: current.periodId,
            updatedByUserId: userId,
          }
        : { baselineValue: null, baselineDate: null, baselineMetricPeriodId: null, updatedByUserId: userId },
    })
    await this.audit.write({ schoolId, userId, action: 'strategy.goal.rebaselined', targetType: 'strategy_goals', targetId: row.id })
    return this.rawGoal(row)
  }

  // ── Initiatives ────────────────────────────────────────────────────────────────
  async createInitiative(schoolId: string, goalId: string, dto: CreateInitiativeDto, userId: string) {
    await this.resolveGoal(schoolId, goalId)
    if (dto.ownerUserId != null) await this.assertOwnerIsMember(schoolId, dto.ownerUserId)
    const row = await this.prisma.strategyInitiative.create({
      data: {
        schoolId,
        goalId,
        title: dto.title,
        description: dto.description ?? null,
        status: dto.status ?? 'planned',
        ownerUserId: dto.ownerUserId ?? null,
        orderIndex: dto.orderIndex ?? 0,
        updatedByUserId: userId,
      },
      include: { owner: OWNER_SELECT },
    })
    await this.audit.write({ schoolId, userId, action: 'strategy.initiative.created', targetType: 'strategy_initiatives', targetId: row.id })
    return this.rawInitiative(row)
  }

  async updateInitiative(schoolId: string, initiativeId: string, dto: UpdateInitiativeDto, userId: string) {
    const existing = await this.resolveInitiative(schoolId, initiativeId)
    const pick = <T>(v: T | undefined, current: T): T => (v === undefined ? current : v)
    if (dto.ownerUserId != null) await this.assertOwnerIsMember(schoolId, dto.ownerUserId)
    const data: Prisma.StrategyInitiativeUpdateInput = {
      title: pick(dto.title, existing.title),
      description: pick(dto.description, existing.description),
      status: pick(dto.status, existing.status),
      orderIndex: pick(dto.orderIndex, existing.orderIndex),
      updatedByUser: userId ? { connect: { id: userId } } : undefined,
    }
    if (dto.ownerUserId !== undefined) {
      data.owner = dto.ownerUserId === null ? { disconnect: true } : { connect: { id: dto.ownerUserId } }
    }
    const row = await this.prisma.strategyInitiative.update({
      where: { id: existing.id },
      data,
      include: { owner: OWNER_SELECT },
    })
    await this.audit.write({ schoolId, userId, action: 'strategy.initiative.updated', targetType: 'strategy_initiatives', targetId: row.id })
    return this.rawInitiative(row)
  }

  async removeInitiative(schoolId: string, initiativeId: string, userId: string) {
    const existing = await this.resolveInitiative(schoolId, initiativeId)
    await this.prisma.strategyInitiative.delete({ where: { id: existing.id } })
    await this.audit.write({ schoolId, userId, action: 'strategy.initiative.deleted', targetType: 'strategy_initiatives', targetId: existing.id })
    return { id: existing.id }
  }
}
