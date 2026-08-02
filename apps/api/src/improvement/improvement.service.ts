import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Prisma } from '@finrep/db'
import {
  formatMetricValue,
  getMetric,
  isMetricKey,
  resolveDisplayUnit,
  type MetricUnit,
} from '@finrep/analytics'
import {
  computeRecommendations,
  type DomainKey,
  type ImprovementAssuranceInput,
  type ImprovementFindingInput,
  type ImprovementGapInput,
  type Recommendation,
} from '@finrep/compliance'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import { BillingService } from '../billing/billing.service.js'
import { AccreditationReadinessService } from '../accreditation/readiness.service.js'
import { StrategyProgressService } from '../strategy/strategy-progress.service.js'
import { rollUpInitiatives, ownerName } from '../strategy/initiative-rollup.js'
import { STALE_INITIATIVE_DAYS } from '../strategy/strategy.constants.js'
import type { InitiativeStatusCounts, MilestoneView } from '../strategy/strategy.types.js'
import {
  computeInitiativeProgress,
  type InitiativeProgress,
  type ProgressObservation,
  type ProgressSource,
} from './improvement-progress.js'
import { INITIATIVE_AUDIT_TARGET } from './improvement.constants.js'
import type { CreateImprovementInitiativeDto, ImprovementMilestoneDto } from './dto/create-improvement-initiative.dto.js'
import type { UpdateImprovementInitiativeDto } from './dto/update-improvement-initiative.dto.js'
import type { AdoptRecommendationDto } from './dto/adopt-recommendation.dto.js'
import type { RecordProgressDto } from './dto/record-progress.dto.js'

/**
 * Marks an `adopt` result that RETURNED AN EXISTING initiative rather than making
 * one. A symbol, so it can never be serialised into the JSON response or collide
 * with a real field — the controller reads it, strips nothing, and answers 200.
 */
export const ADOPT_REUSED = Symbol('adopt.reused')


// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase G — THE CONTINUOUS IMPROVEMENT MANAGER.
//
// The problem this exists to solve: an early warning, today, is a sentence a head
// of school reads and then has nowhere to put. It gives that sentence an owner, a
// date, a milestone plan, and progress COMPUTED FROM THE SCHOOL'S OWN NUMBERS.
//
// THE FLAT READ IS GOAL-AGNOSTIC, AND THAT IS THE PHASE. `/strategy` reaches
// initiatives by walking plan.pillars[].goals[].initiatives[] and is therefore
// structurally blind to a row with no goal — which is exactly why a strategy-only
// school reads byte-identically after this phase, and why an accreditation-only
// school can own improvement work at all. The query below is the ONLY one written
// goal-agnostically, and `goal` is a nullable include rather than a join.
//
// ONE ROLLUP, ONE PACE, ONE STALENESS RULE. The status counter and the stale
// detector are `rollUpInitiatives`, shared verbatim with the plan traversal; the
// pace verdict is `computePace`, shared verbatim through
// `computeInitiativeProgress`. The failure this avoids is an initiative counted
// "blocked" on /strategy and "planned" on /improvement.
//
// BOOT SAFETY: Prisma + AuditService + two already-exported domain services, and
// NOT AnalyticsModule — the mutual-service dependency class that has crash-looped
// this container twice.
// ─────────────────────────────────────────────────────────────────────────────

/** Prisma Decimal → plain number (null-safe) BEFORE any pure fn touches it. */
function dec(v: Prisma.Decimal | number | null | undefined): number | null {
  if (v === null || v === undefined) return null
  return typeof v === 'number' ? v : Number(v)
}

/** yyyy-mm-dd for a @db.Date / timestamp, no timezone drift. */
function isoDate(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null
}

/** Parse an incoming ISO date to UTC-midnight; undefined passes, null clears, bad → 400. */
function parseIsoDate(s: string | null | undefined, field: string): Date | null | undefined {
  if (s === undefined) return undefined
  if (s === null) return null
  const d = new Date(`${s.slice(0, 10)}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`Invalid ${field}: ${s}.`)
  return d
}

/** Coerce the stored milestones JSON into a clean [{id,label,done}] list. */
function coerceMilestones(v: unknown): MilestoneView[] | null {
  if (!Array.isArray(v)) return null
  const out: MilestoneView[] = []
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue
    const o = raw as Record<string, unknown>
    const label = typeof o.label === 'string' ? o.label : null
    if (!label) continue
    out.push({ id: typeof o.id === 'string' ? o.id : label, label, done: o.done === true })
  }
  return out
}

/** Normalize an incoming milestone list into the stored JSON. */
function normalizeMilestones(
  items: ImprovementMilestoneDto[] | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (items === undefined) return undefined
  if (items === null) return Prisma.JsonNull
  return items.map((m, i) => ({
    id: m.id ?? `m${i + 1}`,
    label: m.label,
    done: m.done === true,
  }))
}

const OWNER_SELECT = { select: { id: true, firstName: true, lastName: true, email: true } } as const

/** The nullable goal include. NOT a join — a goal-less row must survive it. */
const GOAL_SELECT = {
  select: { id: true, title: true, pillar: { select: { name: true } } },
} as const

/** Re-exported under the improvement name; the SHAPE is strategy's, unchanged. */
export type ImprovementMilestoneView = MilestoneView

export interface ImprovementInitiativeView extends InitiativeProgress {
  id: string
  title: string
  description: string | null
  status: string
  orderIndex: number
  goalId: string | null
  goalTitle: string | null
  pillarName: string | null
  owner: { userId: string; name: string } | null
  originType: string
  originRef: string | null
  findingKey: string | null
  startDate: string | null
  dueDate: string | null
  completedAt: string | null
  lastProgressAt: string | null
  metricKey: string | null
  metricLabel: string | null
  unit: string | null
  baseline: number | null
  current: number | null
  target: number | null
  formattedBaseline: string | null
  formattedCurrent: string | null
  formattedTarget: string | null
  targetRubricScore: number | null
  milestones: ImprovementMilestoneView[] | null
  linkedTaskCounts: { total: number; done: number } | null
  trend: { date: string; value: number | null; pct: number | null }[]
  staleDays: number
}

export interface ImprovementRecommendationsPayload {
  recommendations: Recommendation[]
  adoptedKeys: string[]
  /**
   * WHY the rail holds what it holds. `recommendations: []` is not one fact: it
   * is "nothing left to work", "no framework adopted yet" or "this school does
   * not license accreditation", and only the first of those is good news.
   */
  basis: {
    /** False ⇒ the accreditation-derived sources were never read at all. */
    accreditationLicensed: boolean
    frameworkAdopted: boolean
  }
}

export interface ImprovementPayload {
  initiatives: ImprovementInitiativeView[]
  counts: InitiativeStatusCounts
  summary: {
    total: number
    overdue: number
    behind: number
    unowned: number
    statusOnly: number
    meanProgressPct: number | null
  }
  dataAsOf: string | null
}

@Injectable()
export class ImprovementService {
  private readonly logger = new Logger(ImprovementService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly progress: StrategyProgressService,
    private readonly readiness: AccreditationReadinessService,
    // THE SECOND GATE. The controller's @RequiresModule is OR over
    // ('accreditation','strategy') and that is right for the PAGE — but the
    // recommendation rail is built from accreditation-module data, so it needs
    // its own per-source check. See getRecommendations.
    private readonly billing: BillingService,
  ) {}

  // ── Resolvers (tenant gate) ────────────────────────────────────────────────
  private async resolveInitiative(schoolId: string, initiativeId: string) {
    const ini = await this.prisma.improvementInitiative.findFirst({
      where: { id: initiativeId, schoolId },
    })
    if (!ini) throw new NotFoundException('Initiative not found.')
    return ini
  }

  /** ONLY called when a goalId is actually supplied (M8: goal-less is a real path). */
  private async resolveGoal(schoolId: string, goalId: string) {
    const goal = await this.prisma.strategyGoal.findFirst({ where: { id: goalId, schoolId } })
    if (!goal) throw new NotFoundException('Goal not found.')
    return goal
  }

  private async assertOwnerIsMember(schoolId: string, ownerUserId: string): Promise<void> {
    const m = await this.prisma.membership.findFirst({
      where: { schoolId, userId: ownerUserId, status: 'active' },
    })
    if (!m) throw new BadRequestException('Owner must be an active member of this school.')
  }

  // ── THE READ ───────────────────────────────────────────────────────────────

  /**
   * The flat, school-scoped, GOAL-AGNOSTIC register.
   *
   * `goal` is a nullable relation include, so this cannot assume a goal
   * (acceptance 2). The linked-task rollup is ONE groupBy over the flat id list —
   * the same query shape the plan traversal uses, with no goal join.
   */
  async getImprovement(schoolId: string, asOf: Date = new Date()): Promise<ImprovementPayload> {
    const rows = await this.prisma.improvementInitiative.findMany({
      where: { schoolId },
      include: { owner: OWNER_SELECT, goal: GOAL_SELECT },
      orderBy: [{ dueDate: 'asc' }, { orderIndex: 'asc' }, { createdAt: 'asc' }],
    })

    const ids = rows.map((r) => r.id)
    const tasksByInitiative = await this.linkedTaskCounts(schoolId, ids)
    const eventsByInitiative = await this.progressEvents(schoolId, ids)

    // The metric basis, resolved ONCE for every metric-bound initiative — the
    // same one-period-one-compute path /strategy uses, so a bound number here is
    // the SAME number the dashboard shows.
    const metrics = await this.progress.resolveCurrentMetrics(schoolId).catch(() => null)
    const dataAsOf = metrics ? metrics.date.toISOString() : null

    const asOfIso = asOf.toISOString()
    const views: ImprovementInitiativeView[] = rows.map((r) => {
      const staleDays = Math.floor((asOf.getTime() - r.updatedAt.getTime()) / 86_400_000)
      const milestones = coerceMilestones(r.milestones)
      const linkedTaskCounts = tasksByInitiative.get(r.id) ?? null
      const progressSource = (r.progressSource ?? null) as ProgressSource

      let metricLabel: string | null = null
      let unit: string | null = null
      let current: number | null = null
      // The DISPLAY unit, not the raw one: @finrep/analytics owns the mapping
      // (a `share` renders as a percent, and so on), and typing it as MetricUnit
      // rather than string is what stops a stray unit string reaching the
      // formatter — the registry is the only source of a legal unit.
      let displayUnit: MetricUnit | null = null
      if (r.metricKey && isMetricKey(r.metricKey)) {
        const def = getMetric(r.metricKey)
        metricLabel = def.label
        unit = def.unit
        displayUnit = resolveDisplayUnit(r.metricKey, def.unit)
        const m = metrics?.byKey.get(r.metricKey)
        current = m && m.available ? m.value : null
      }
      const baseline = dec(r.baselineValue)
      const target = dec(r.targetValue)

      const progress = computeInitiativeProgress({
        progressSource,
        status: r.status,
        startDate: isoDate(r.startDate),
        dueDate: isoDate(r.dueDate),
        asOf: asOfIso,
        baselineValue: baseline,
        currentValue: current,
        targetValue: target,
        metricLabel,
        metricKey: r.metricKey,
        milestones,
        linkedTaskCounts,
        manualProgressPct: dec(r.manualProgressPct),
        staleDays,
        riskLevel: r.riskLevel,
        riskNote: r.riskNote,
        events: eventsByInitiative.get(r.id) ?? [],
      })

      return {
        id: r.id,
        title: r.title,
        description: r.description,
        status: r.status,
        orderIndex: r.orderIndex,
        goalId: r.goalId,
        goalTitle: r.goal?.title ?? null,
        pillarName: r.goal?.pillar?.name ?? null,
        owner: r.owner ? { userId: r.owner.id, name: ownerName(r.owner) } : null,
        originType: r.originType,
        originRef: r.originRef,
        findingKey: r.findingKey,
        startDate: isoDate(r.startDate),
        dueDate: isoDate(r.dueDate),
        completedAt: r.completedAt ? r.completedAt.toISOString() : null,
        lastProgressAt: r.lastProgressAt ? r.lastProgressAt.toISOString() : null,
        metricKey: r.metricKey,
        metricLabel,
        unit,
        baseline,
        current,
        target,
        formattedBaseline: baseline !== null && displayUnit ? formatMetricValue(baseline, displayUnit) : null,
        formattedCurrent: current !== null && displayUnit ? formatMetricValue(current, displayUnit) : null,
        formattedTarget: target !== null && displayUnit ? formatMetricValue(target, displayUnit) : null,
        targetRubricScore: r.targetRubricScore,
        milestones,
        linkedTaskCounts,
        trend: (eventsByInitiative.get(r.id) ?? []).map((e) => ({
          date: e.observedOn,
          value: e.value,
          pct: e.pct,
        })),
        staleDays,
        ...progress,
      }
    })

    // THE SHARED COUNTER. Not a second implementation of "how many are blocked".
    const { initiativeStatusCounts } = rollUpInitiatives(rows, tasksByInitiative, asOf)

    // The mean is over rows that COUNT — never over hand-set percentages, and
    // NULL rather than 0 when nothing qualifies. A 0% that means "we do not
    // measure this" is the lie this guards against.
    const rollupPcts = views
      .filter((v) => v.countsTowardRollup && v.progressPct !== null)
      .map((v) => v.progressPct as number)
    const meanProgressPct =
      rollupPcts.length > 0 ? rollupPcts.reduce((a, b) => a + b, 0) / rollupPcts.length : null

    return {
      initiatives: views,
      counts: initiativeStatusCounts,
      summary: {
        total: views.length,
        overdue: views.filter((v) => v.riskSignal === 'overdue').length,
        // COUNTED FROM THE PACE VERDICT, not from the precedence-ranked signal.
        // `riskSignal` returns 'overdue' before it ever tests pace, so counting
        // signals here reported "0 behind pace / all measured work on pace" for a
        // school whose work was genuinely behind AND late — the reassuring half
        // of a KPI pair, about the very rows that needed the attention.
        behind: views.filter((v) => v.paceStatus === 'behind').length,
        unowned: views.filter((v) => v.owner === null).length,
        statusOnly: views.filter((v) => v.progressSource === null).length,
        meanProgressPct,
      },
      dataAsOf,
    }
  }

  /** ONE groupBy over the FLAT id list. No goal join — see the file note. */
  private async linkedTaskCounts(
    schoolId: string,
    ids: readonly string[],
  ): Promise<Map<string, { total: number; done: number }>> {
    const out = new Map<string, { total: number; done: number }>()
    if (ids.length === 0) return out
    const grouped = await this.prisma.task
      .groupBy({
        by: ['sourceRef', 'status'],
        where: { schoolId, sourceType: 'strategy', sourceRef: { in: [...ids] } },
        _count: { _all: true },
      })
      .catch(() => [] as { sourceRef: string | null; status: string; _count: { _all: number } }[])
    for (const row of grouped) {
      const ref = row.sourceRef
      if (!ref) continue
      const bucket = out.get(ref) ?? { total: 0, done: 0 }
      bucket.total += row._count._all
      if (row.status === 'done') bucket.done += row._count._all
      out.set(ref, bucket)
    }
    return out
  }

  /** The recorded observation series, oldest first, per initiative. */
  private async progressEvents(
    schoolId: string,
    ids: readonly string[],
  ): Promise<Map<string, (ProgressObservation & { value: number | null })[]>> {
    const out = new Map<string, (ProgressObservation & { value: number | null })[]>()
    if (ids.length === 0) return out
    const rows = await this.prisma.improvementProgressEvent
      .findMany({
        where: { schoolId, initiativeId: { in: [...ids] } },
        orderBy: [{ observedOn: 'asc' }, { createdAt: 'asc' }],
      })
      .catch((err: unknown) => {
        this.logger.warn(`progress events unreadable for ${schoolId}: ${(err as Error).message}`)
        return []
      })
    for (const r of rows) {
      const list = out.get(r.initiativeId) ?? []
      list.push({
        observedOn: isoDate(r.observedOn) as string,
        source: r.source as ProgressObservation['source'],
        pct: dec(r.pct),
        value: dec(r.value),
      })
      out.set(r.initiativeId, list)
    }
    return out
  }

  // ── THE WRITES ─────────────────────────────────────────────────────────────

  /**
   * Create an initiative. NOT a widened `StrategyService.createInitiative`: that
   * one calls `resolveGoal` unconditionally, and a goal-less path is a different
   * method, not a looser argument. The audit action strings and the
   * `targetType` are byte-identical to the strategy path — the table did not
   * change, so neither does its audit trail.
   */
  async createInitiative(schoolId: string, dto: CreateImprovementInitiativeDto, userId: string) {
    if (dto.goalId != null) await this.resolveGoal(schoolId, dto.goalId)
    if (dto.ownerUserId != null) await this.assertOwnerIsMember(schoolId, dto.ownerUserId)
    const row = await this.prisma.improvementInitiative.create({
      data: {
        schoolId,
        goalId: dto.goalId ?? null,
        title: dto.title,
        description: dto.description ?? null,
        status: dto.status ?? 'planned',
        ownerUserId: dto.ownerUserId ?? null,
        orderIndex: dto.orderIndex ?? 0,
        originType: dto.originType ?? 'manual',
        originRef: dto.originRef ?? null,
        findingKey: dto.findingKey ?? null,
        startDate: parseIsoDate(dto.startDate, 'startDate') ?? null,
        dueDate: parseIsoDate(dto.dueDate, 'dueDate') ?? null,
        progressSource: dto.progressSource ?? null,
        milestones: normalizeMilestones(dto.milestones),
        manualProgressPct:
          dto.manualProgressPct == null ? null : new Prisma.Decimal(dto.manualProgressPct),
        metricKey: dto.metricKey ?? null,
        targetValue: dto.targetValue == null ? null : new Prisma.Decimal(dto.targetValue),
        targetRubricScore: dto.targetRubricScore ?? null,
        riskLevel: dto.riskLevel ?? null,
        riskNote: dto.riskNote ?? null,
        updatedByUserId: userId,
      },
      include: { owner: OWNER_SELECT },
    })
    // The metric baseline is FROZEN at bind — never recomputed on read, exactly
    // as a strategic goal's is.
    if (row.progressSource === 'metric' && row.metricKey && row.baselineValue === null) {
      await this.freezeBaseline(schoolId, row.id, row.metricKey)
    }
    await this.audit.write({
      schoolId,
      userId,
      action: 'strategy.initiative.created',
      targetType: INITIATIVE_AUDIT_TARGET,
      targetId: row.id,
    })
    return this.rawInitiative(row)
  }

  async updateInitiative(
    schoolId: string,
    initiativeId: string,
    dto: UpdateImprovementInitiativeDto,
    userId: string,
  ) {
    const existing = await this.resolveInitiative(schoolId, initiativeId)
    if (dto.goalId != null) await this.resolveGoal(schoolId, dto.goalId)
    if (dto.ownerUserId != null) await this.assertOwnerIsMember(schoolId, dto.ownerUserId)
    const pick = <T>(v: T | undefined, current: T): T => (v === undefined ? current : v)

    const data: Prisma.ImprovementInitiativeUpdateInput = {
      title: pick(dto.title, existing.title),
      description: pick(dto.description, existing.description),
      status: pick(dto.status, existing.status),
      orderIndex: pick(dto.orderIndex, existing.orderIndex),
      originType: pick(dto.originType, existing.originType),
      originRef: pick(dto.originRef, existing.originRef),
      findingKey: pick(dto.findingKey, existing.findingKey),
      progressSource: pick(dto.progressSource, existing.progressSource),
      metricKey: pick(dto.metricKey, existing.metricKey),
      targetRubricScore: pick(dto.targetRubricScore, existing.targetRubricScore),
      // ECHOED HUMAN JUDGEMENT. Never written from the computed riskSignal.
      riskLevel: pick(dto.riskLevel, existing.riskLevel),
      riskNote: pick(dto.riskNote, existing.riskNote),
      updatedByUser: userId ? { connect: { id: userId } } : undefined,
    }
    const startDate = parseIsoDate(dto.startDate, 'startDate')
    if (startDate !== undefined) data.startDate = startDate
    const dueDate = parseIsoDate(dto.dueDate, 'dueDate')
    if (dueDate !== undefined) data.dueDate = dueDate
    const milestones = normalizeMilestones(dto.milestones)
    if (milestones !== undefined) data.milestones = milestones
    if (dto.manualProgressPct !== undefined) {
      data.manualProgressPct =
        dto.manualProgressPct === null ? null : new Prisma.Decimal(dto.manualProgressPct)
    }
    if (dto.targetValue !== undefined) {
      data.targetValue = dto.targetValue === null ? null : new Prisma.Decimal(dto.targetValue)
    }
    if (dto.goalId !== undefined) {
      data.goal = dto.goalId === null ? { disconnect: true } : { connect: { id: dto.goalId } }
    }
    if (dto.ownerUserId !== undefined) {
      data.owner = dto.ownerUserId === null ? { disconnect: true } : { connect: { id: dto.ownerUserId } }
    }
    // Completing the work stamps the date; reopening it clears the stamp rather
    // than leaving a completedAt on an initiative that is not complete.
    if (dto.status !== undefined && dto.status !== existing.status) {
      data.completedAt = dto.status === 'done' ? new Date() : null
    }

    const row = await this.prisma.improvementInitiative.update({
      where: { id: existing.id },
      data,
      include: { owner: OWNER_SELECT },
    })
    if (row.progressSource === 'metric' && row.metricKey && row.baselineValue === null) {
      await this.freezeBaseline(schoolId, row.id, row.metricKey)
    }
    await this.audit.write({
      schoolId,
      userId,
      action: 'strategy.initiative.updated',
      targetType: INITIATIVE_AUDIT_TARGET,
      targetId: row.id,
    })
    return this.rawInitiative(row)
  }

  async removeInitiative(schoolId: string, initiativeId: string, userId: string) {
    const existing = await this.resolveInitiative(schoolId, initiativeId)
    await this.prisma.improvementInitiative.delete({ where: { id: existing.id } })
    await this.audit.write({
      schoolId,
      userId,
      action: 'strategy.initiative.deleted',
      targetType: INITIATIVE_AUDIT_TARGET,
      targetId: existing.id,
    })
    return { id: existing.id }
  }

  /**
   * Freeze the baseline from the CURRENT canonical metric reading. Persist on
   * first bind; never recomputed on read, and never a fabricated "earliest
   * available" number.
   */
  private async freezeBaseline(schoolId: string, initiativeId: string, metricKey: string) {
    const current = await this.progress.resolveCurrentMetric(schoolId, metricKey).catch(() => null)
    if (!current) return
    await this.prisma.improvementInitiative
      .update({
        where: { id: initiativeId },
        data: {
          baselineValue: new Prisma.Decimal(current.value),
          baselineDate: current.date,
          baselineMetricPeriodId: current.periodId,
        },
      })
      .catch(() => undefined)
  }

  /** The single-row shape the create/update/adopt routes return. */
  private rawInitiative(i: {
    id: string
    schoolId: string
    goalId: string | null
    title: string
    description: string | null
    status: string
    ownerUserId: string | null
    orderIndex: number
    originType: string
    originRef: string | null
    findingKey: string | null
    startDate: Date | null
    dueDate: Date | null
    completedAt: Date | null
    progressSource: string | null
    milestones: Prisma.JsonValue | null
    manualProgressPct: Prisma.Decimal | null
    metricKey: string | null
    targetValue: Prisma.Decimal | null
    targetRubricScore: number | null
    riskLevel: string | null
    riskNote: string | null
    createdAt: Date
    updatedAt: Date
    owner?: { id: string; firstName: string | null; lastName: string | null; email: string } | null
  }) {
    return {
      id: i.id,
      goalId: i.goalId,
      title: i.title,
      description: i.description,
      status: i.status,
      ownerUserId: i.ownerUserId,
      ownerName: i.owner ? ownerName(i.owner) : null,
      orderIndex: i.orderIndex,
      originType: i.originType,
      originRef: i.originRef,
      findingKey: i.findingKey,
      startDate: isoDate(i.startDate),
      dueDate: isoDate(i.dueDate),
      completedAt: i.completedAt ? i.completedAt.toISOString() : null,
      progressSource: i.progressSource,
      milestones: coerceMilestones(i.milestones),
      manualProgressPct: dec(i.manualProgressPct),
      metricKey: i.metricKey,
      targetValue: dec(i.targetValue),
      targetRubricScore: i.targetRubricScore,
      riskLevel: i.riskLevel,
      riskNote: i.riskNote,
      createdAt: i.createdAt.toISOString(),
      updatedAt: i.updatedAt.toISOString(),
    }
  }

  // ── RECOMMENDATIONS, AND ADOPTING ONE ──────────────────────────────────────

  /**
   * The recommendation rail.
   *
   * WHERE EVERY NUMBER COMES FROM. The lifts (`nextStepLift`, `fullLift`), the
   * rubric scores and the evidence-gap flags are taken VERBATIM from
   * `AccreditationReadinessService.getReadiness` — the same call the hero renders
   * — so a recommendation can never quote a lift the readiness page disagrees
   * with. The finding side reads the PERSISTED ledger and looks its consequence
   * sentence up in the frozen rule catalog; nothing here composes a new sentence
   * about a finding.
   */
  async getRecommendations(
    schoolId: string,
    opts: { limit?: number } = {},
    now: Date = new Date(),
  ): Promise<ImprovementRecommendationsPayload> {
    // Already-worked keys are EXCLUDED, never re-offered. A school that adopted a
    // gap does not get told to adopt it again on the next page load. These are the
    // school's OWN initiative rows, so they are read whatever it licenses.
    const adopted = await this.prisma.improvementInitiative.findMany({
      where: { schoolId, status: { notIn: ['cancelled'] } },
      select: { originRef: true, findingKey: true },
    })
    const adoptedKeys = [
      ...new Set(
        adopted.flatMap((a) => [a.originRef, a.findingKey].filter((v): v is string => v !== null)),
      ),
    ]

    // ── THE SECOND ENTITLEMENT GATE, AND WHY IT IS NOT THE CONTROLLER'S ───────
    // `@RequiresModule('accreditation','strategy')` is OR, and OR is correct for
    // the PAGE: a strategy-only school owns improvement work. But BOTH sources
    // below — the readiness gaps with their real index-point lifts, and the
    // findings ledger with the twin's consequence sentences — are accreditation
    // module data. `/accreditation/readiness` and `/twin` answer 402
    // MODULE_NOT_LICENSED for exactly this school; serving the same standard
    // codes, rubric ratings, index lifts and early-warning sentences here would
    // be the OR gate handing out a module nobody bought. Fail CLOSED: an
    // unreadable billing row yields no recommendations, never all of them. This
    // mirrors assistant.service.ts's `get_early_warnings` check.
    const accreditationLicensed = await this.billing
      .isEntitledForModule(schoolId, 'accreditation')
      .catch((err: unknown) => {
        this.logger.warn(`entitlement unreadable for ${schoolId}: ${(err as Error).message}`)
        return false
      })
    if (!accreditationLicensed) {
      return {
        recommendations: [],
        adoptedKeys,
        basis: { accreditationLicensed: false, frameworkAdopted: false },
      }
    }

    const readiness = await this.readiness.getReadiness(schoolId, {}, now)

    // Catalog facts (domain + bound metric keys) for the leaves the gaps name.
    const standardIds = [
      ...readiness.gaps.map((g) => g.standardId),
      ...readiness.assurances.map((a) => a.standardId),
    ]
    const routing = await this.catalogRouting(schoolId, standardIds)

    const gaps: ImprovementGapInput[] = readiness.gaps.map((g) => ({
      standardId: g.standardId,
      code: g.code,
      title: g.title,
      rubricScore: g.rubricScore,
      evidenceGap: g.evidenceGap,
      // VERBATIM. Never recomputed here — recomputing is how the rail and the
      // hero start quoting different numbers for the same move.
      nextStepLift: g.nextStepLift,
      fullLift: g.fullLift,
      primaryDomainKey: routing.get(g.standardId)?.domainKey ?? 'continuous_improvement',
      boundMetricKeys: routing.get(g.standardId)?.signalKeys ?? [],
    }))
    const assurances: ImprovementAssuranceInput[] = readiness.assurances.map((a) => ({
      standardId: a.standardId,
      code: a.code,
      title: a.title,
      satisfied: a.satisfied,
      primaryDomainKey: routing.get(a.standardId)?.domainKey ?? 'continuous_improvement',
    }))

    const findings = await this.openFindings(schoolId)

    const recommendations = computeRecommendations({
      gaps,
      assurances,
      findings,
      adoptedKeys,
      now: now.toISOString().slice(0, 10),
      limit: opts.limit,
    })
    return {
      recommendations,
      adoptedKeys,
      // WHY THE CLIENT IS TOLD WHAT IT IS LOOKING AT. An empty rail has three
      // very different causes — nothing left to work, no framework adopted, and
      // no accreditation licence — and the rail used to render the first one's
      // sentence ("Every open gap, unmet assurance and non-informational warning
      // is already being worked") for all three. That is a positive claim about
      // work that, in two of the three cases, was never evaluated at all.
      basis: { accreditationLicensed: true, frameworkAdopted: readiness.framework != null },
    }
  }

  /**
   * The still-open findings, from the LEDGER.
   *
   * WHERE THE SENTENCE COMES FROM, AND WHY IT IS NOT THE RULE DEFINITION.
   * `consequence` does not exist on `TwinRuleDef` and must not: it lives on
   * `TwinFindingDraft`, composed when a rule actually FIRES, because several rules
   * carry two frozen template variants for two genuinely different facts (a lapsed
   * artifact vs an expiring one) and the variant is chosen at fire time. Taking a
   * consequence from the static definition would therefore state the wrong one
   * roughly half the time it differed.
   *
   * The sentence the rule actually composed is copied VERBATIM into the ledger
   * row's `evidencePayload` by `toFiredFinding` (twin-rules.ts), and that payload
   * is what `EarlyWarningService.fromLedgerRow` and the briefing already read. This
   * reads exactly the same field, so the recommendation rail, the briefing and the
   * early-warning list can never quote three different consequences for one
   * finding.
   *
   * A row with NO stored consequence is SKIPPED rather than given an empty string:
   * the pure module echoes this sentence as the recommendation's entire rationale,
   * so an empty one is a recommendation that claims nothing — and composing a
   * replacement here is precisely what this phase must not do.
   */
  private async openFindings(schoolId: string): Promise<ImprovementFindingInput[]> {
    const rows = await this.prisma.accreditationFinding
      .findMany({
        where: { schoolId, status: { notIn: ['resolved', 'dismissed'] }, clearedAt: null },
        orderBy: [{ severity: 'asc' }, { firstSeenAt: 'asc' }],
      })
      .catch((err: unknown) => {
        this.logger.warn(`findings ledger unreadable for ${schoolId}: ${(err as Error).message}`)
        return []
      })
    const out: ImprovementFindingInput[] = []
    for (const r of rows) {
      const payload = (r.evidencePayload ?? {}) as Record<string, unknown>
      const consequence = typeof payload.consequence === 'string' ? payload.consequence.trim() : ''
      if (consequence === '') continue
      out.push({
        ruleId: r.ruleId,
        scopeKey: r.scopeKey,
        // Same precedence as fromLedgerRow: the stored title, else the rule id.
        // Never a numeral either way — a finding title is a headline, not a fact.
        title: typeof payload.title === 'string' && payload.title ? payload.title : r.ruleId,
        severity: r.severity as ImprovementFindingInput['severity'],
        standardTags: r.standardTags,
        primaryDomainKey: r.primaryDomainKey as DomainKey,
        consequence,
      })
    }
    return out
  }

  /** schoolStandardId → { domainKey, signalKeys } from the CATALOG rows. */
  private async catalogRouting(
    schoolId: string,
    standardIds: readonly string[],
  ): Promise<Map<string, { domainKey: DomainKey | null; signalKeys: string[] }>> {
    const out = new Map<string, { domainKey: DomainKey | null; signalKeys: string[] }>()
    if (standardIds.length === 0) return out
    const standards = await this.prisma.accreditationStandard
      .findMany({
        where: { schoolId, id: { in: [...standardIds] } },
        select: { id: true, catalogStandardId: true },
      })
      .catch(() => [] as { id: string; catalogStandardId: string | null }[])
    const catalogIds = standards
      .map((s) => s.catalogStandardId)
      .filter((v): v is string => v !== null)
    if (catalogIds.length === 0) return out
    const catalog = await this.prisma.accreditationCatalogStandard
      .findMany({
        where: { id: { in: catalogIds } },
        select: { id: true, domainKey: true, signalKeys: true },
      })
      .catch(() => [] as { id: string; domainKey: string | null; signalKeys: string[] | null }[])
    const byCatalogId = new Map(catalog.map((c) => [c.id, c]))
    for (const s of standards) {
      const c = s.catalogStandardId ? byCatalogId.get(s.catalogStandardId) : undefined
      out.set(s.id, {
        domainKey: (c?.domainKey as DomainKey | null) ?? null,
        signalKeys: c?.signalKeys ?? [],
      })
    }
    return out
  }

  /**
   * ADOPT A RECOMMENDATION — idempotent (acceptance 5).
   *
   * The second click returns the FIRST initiative, not a duplicate. Finding-derived
   * adoptions dedupe on the database's `@@unique([schoolId, findingKey])`;
   * gap/assurance adoptions dedupe on `(originType, originRef)`. A school that
   * double-clicks does not end up managing two copies of one commitment.
   */
  async adopt(schoolId: string, dto: AdoptRecommendationDto, userId: string) {
    const existing = await this.prisma.improvementInitiative.findFirst({
      where: dto.findingKey
        ? { schoolId, findingKey: dto.findingKey }
        : { schoolId, originType: dto.originType, originRef: dto.originRef },
      include: { owner: OWNER_SELECT },
    })
    // Signalled to the controller so it can answer 200, not 201. Nothing was
    // created on this call, and a client that toasts "Created" on a 201 would tell
    // the user it made a second commitment it did not make. The RESPONSE BODY is
    // unchanged — only the status code differs.
    if (existing) return { ...this.rawInitiative(existing), [ADOPT_REUSED]: true }

    const created = await this.createInitiative(
      schoolId,
      {
        title: dto.title,
        goalId: null,
        originType: dto.originType,
        originRef: dto.originRef,
        findingKey: dto.findingKey ?? null,
        ownerUserId: dto.ownerUserId ?? null,
        dueDate: dto.dueDate ?? null,
        targetRubricScore: dto.targetRubricScore ?? null,
        metricKey: dto.metricKey ?? null,
        targetValue: dto.targetValue ?? null,
        // AN ADOPTED RECOMMENDATION CAN BE MEASURABLE AT BIRTH. The wizard's KPI
        // picker used to collect a metricKey that the adopt path stored with a
        // NULL progressSource — so the drawer told the school "bind it to a KPI"
        // directly above the KPI it had just bound, and `freezeBaseline` (gated
        // on progressSource === 'metric') never ran. Choosing a KPI IS choosing
        // to measure against it; no KPI still means status only, unchanged.
        // `undefined` (not null) so createInitiative's own `?? null` still owns
        // the stored value — one place decides what "no source" is written as.
        progressSource: dto.progressSource ?? (dto.metricKey ? 'metric' : undefined),
      },
      userId,
    ).catch(async (err: unknown) => {
      // A concurrent adopt lost the unique-index race. The right answer is still
      // "here is the one initiative", not a 500 and not a second row.
      if ((err as { code?: string }).code === 'P2002' && dto.findingKey) {
        const row = await this.prisma.improvementInitiative.findFirst({
          where: { schoolId, findingKey: dto.findingKey },
          include: { owner: OWNER_SELECT },
        })
        if (row) return this.rawInitiative(row)
      }
      throw err
    })

    // Link the ledger row back, best-effort: the finding is the record of the
    // problem, the initiative is the record of the response, and neither owns
    // the other. Deliberately NOT an FK (Phase D reserved the column without one).
    if (dto.findingKey) {
      await this.prisma.accreditationFinding
        .updateMany({
          where: { schoolId, findingKey: dto.findingKey, initiativeId: null },
          data: { initiativeId: created.id },
        })
        .catch(() => undefined)
    }
    return created
  }

  /** Append ONE observation. Re-recording the same day/source updates that reading. */
  async recordProgress(
    schoolId: string,
    initiativeId: string,
    dto: RecordProgressDto,
    userId: string,
  ) {
    const ini = await this.resolveInitiative(schoolId, initiativeId)
    const observedOn = parseIsoDate(dto.observedOn, 'observedOn') as Date
    const row = await this.prisma.improvementProgressEvent.upsert({
      where: {
        initiativeId_observedOn_source: { initiativeId: ini.id, observedOn, source: dto.source },
      },
      create: {
        schoolId,
        initiativeId: ini.id,
        observedOn,
        source: dto.source,
        value: dto.value == null ? null : new Prisma.Decimal(dto.value),
        pct: dto.pct == null ? null : new Prisma.Decimal(dto.pct),
        note: dto.note ?? null,
        createdByUserId: userId,
      },
      update: {
        value: dto.value == null ? null : new Prisma.Decimal(dto.value),
        pct: dto.pct == null ? null : new Prisma.Decimal(dto.pct),
        note: dto.note ?? null,
      },
    })
    await this.prisma.improvementInitiative
      .update({ where: { id: ini.id }, data: { lastProgressAt: new Date() } })
      .catch(() => undefined)
    await this.audit.write({
      schoolId,
      userId,
      action: 'improvement.progress.recorded',
      targetType: INITIATIVE_AUDIT_TARGET,
      targetId: ini.id,
    })
    return {
      id: row.id,
      initiativeId: row.initiativeId,
      observedOn: isoDate(row.observedOn),
      source: row.source,
      value: dec(row.value),
      pct: dec(row.pct),
      note: row.note,
    }
  }

  /** The shared staleness threshold, re-exported so callers never re-declare it. */
  static readonly STALE_AFTER_DAYS = STALE_INITIATIVE_DAYS
}
