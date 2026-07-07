import { describe, expect, it, vi } from 'vitest'
import { BadRequestException, HttpException } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'
import type { Reflector } from '@nestjs/core'
import { StrategyService } from './strategy.service.js'
import { StrategyProgressService } from './strategy-progress.service.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import type { PrismaService } from '../prisma/prisma.service.js'
import type { AuditService } from '../common/audit/audit.service.js'
import type { BillingService } from '../billing/billing.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// StrategyService — the register CRUD guards. Proves: mix metric keys REJECTED at
// bind, unknown metric keys rejected, a non-metric goal cannot be rebaselined, and
// rebaseline FREEZES the metric's current value. Plus the 'strategy' entitlement
// 402 (MODULE_NOT_LICENSED) through the shared EntitlementGuard.
// ─────────────────────────────────────────────────────────────────────────────

const audit = { write: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService

function makeService(over?: {
  goalUpdate?: ReturnType<typeof vi.fn>
  resolveCurrentMetric?: ReturnType<typeof vi.fn>
  goal?: Record<string, unknown>
}) {
  const goalCreate = vi.fn().mockResolvedValue({
    id: 'g1', pillarId: 'p1', title: 't', description: null, goalType: 'metric', orderIndex: 0,
    ownerUserId: null, metricKey: 'operating_margin', targetValue: null, baselineValue: null,
    baselineDate: null, baselineMetricPeriodId: null, startDate: null, targetDate: null,
    manualProgressPct: null, milestones: null, createdAt: new Date(), updatedAt: new Date(), initiatives: [],
  })
  const goalUpdate = over?.goalUpdate ?? vi.fn().mockResolvedValue({
    id: 'g1', pillarId: 'p1', title: 't', description: null, goalType: 'metric', orderIndex: 0,
    ownerUserId: null, metricKey: 'operating_margin', targetValue: null, baselineValue: null,
    baselineDate: null, baselineMetricPeriodId: null, startDate: null, targetDate: null,
    manualProgressPct: null, milestones: null, createdAt: new Date(), updatedAt: new Date(), initiatives: [],
  })
  const existingGoal = over?.goal ?? { id: 'g1', schoolId: 'school-1', goalType: 'metric', metricKey: 'operating_margin', targetValue: null, baselineValue: null }
  const prisma = {
    strategyPillar: { findFirst: async () => ({ id: 'p1', schoolId: 'school-1' }) },
    strategyGoal: { findFirst: async () => existingGoal, create: goalCreate, update: goalUpdate },
    membership: { findFirst: async () => ({ id: 'm1', status: 'active' }) },
  } as unknown as PrismaService
  const progress = {
    resolveCurrentMetric: over?.resolveCurrentMetric ?? vi.fn().mockResolvedValue({ value: 0.03, periodId: 'period-1', date: new Date('2026-06-30T00:00:00.000Z') }),
  } as unknown as StrategyProgressService
  return { svc: new StrategyService(prisma, audit, progress), goalCreate, goalUpdate }
}

describe('StrategyService — metric bind validation', () => {
  it('REJECTS a mix metric key (revenue_mix) at bind', async () => {
    const { svc, goalCreate } = makeService()
    await expect(
      svc.createGoal('school-1', 'p1', { title: 'x', goalType: 'metric', metricKey: 'revenue_mix' }, 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(goalCreate).not.toHaveBeenCalled()
  })

  it('REJECTS expense_mix too', async () => {
    const { svc } = makeService()
    await expect(
      svc.createGoal('school-1', 'p1', { title: 'x', goalType: 'metric', metricKey: 'expense_mix' }, 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('REJECTS an unknown metric key', async () => {
    const { svc } = makeService()
    await expect(
      svc.createGoal('school-1', 'p1', { title: 'x', goalType: 'metric', metricKey: 'not_a_metric' }, 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('ACCEPTS a valid single-value metric key', async () => {
    const { svc, goalCreate } = makeService()
    await svc.createGoal('school-1', 'p1', { title: 'x', goalType: 'metric', metricKey: 'operating_margin' }, 'u1')
    expect(goalCreate).toHaveBeenCalledTimes(1)
  })
})

describe('StrategyService — rebaseline', () => {
  it('FREEZES the metric current value as the new baseline', async () => {
    const { svc, goalUpdate } = makeService()
    await svc.rebaseline('school-1', 'g1', 'u1')
    expect(goalUpdate).toHaveBeenCalledTimes(1)
    const arg = goalUpdate.mock.calls[0][0] as { data: { baselineValue: { toString(): string }; baselineMetricPeriodId: string } }
    expect(Number(arg.data.baselineValue)).toBeCloseTo(0.03, 6)
    expect(arg.data.baselineMetricPeriodId).toBe('period-1')
  })

  it('REJECTS rebaselining a non-metric goal', async () => {
    const { svc } = makeService({ goal: { id: 'g1', schoolId: 'school-1', goalType: 'milestone', metricKey: null } })
    await expect(svc.rebaseline('school-1', 'g1', 'u1')).rejects.toBeInstanceOf(BadRequestException)
  })

  it('metric unavailable → CLEARS the baseline (re-backfills on next read)', async () => {
    const { svc, goalUpdate } = makeService({ resolveCurrentMetric: vi.fn().mockResolvedValue(null) })
    await svc.rebaseline('school-1', 'g1', 'u1')
    const arg = goalUpdate.mock.calls[0][0] as { data: { baselineValue: unknown } }
    expect(arg.data.baselineValue).toBeNull()
  })
})

// ── Entitlement 402 through the shared guard (the 'strategy' gate) ──────────────
function ctx(): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: {}, params: { schoolId: 's1' }, body: {} }) }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext
}

function guardWith(licensed: boolean) {
  const billing = {
    isEntitled: vi.fn().mockResolvedValue(true),
    isEntitledForModule: vi.fn().mockResolvedValue(licensed),
  } as unknown as BillingService
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue('strategy') } as unknown as Reflector
  return new EntitlementGuard(billing, reflector)
}

describe('StrategyService — entitlement (strategy module gate)', () => {
  it('entitled + licensed strategy → passes (200)', async () => {
    await expect(guardWith(true).canActivate(ctx())).resolves.toBe(true)
  })

  it('entitled but NOT licensed strategy → 402 MODULE_NOT_LICENSED + module:strategy', async () => {
    let err: HttpException | null = null
    try {
      await guardWith(false).canActivate(ctx())
    } catch (e) {
      err = e as HttpException
    }
    expect(err).not.toBeNull()
    expect(err!.getStatus()).toBe(402)
    const body = err!.getResponse() as { code: string; module: string }
    expect(body.code).toBe('MODULE_NOT_LICENSED')
    expect(body.module).toBe('strategy')
  })
})
