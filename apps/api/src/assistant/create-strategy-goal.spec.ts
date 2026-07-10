import { describe, expect, it, vi } from 'vitest'
import { validateSync } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import type { User } from '@finrep/db'
import { AssistantService, type ProposedAction } from './assistant.service.js'
import { TOOL_SCHEMAS, TOOL_LABELS } from './assistant.tools.js'
import { ApplyActionDto } from './dto/apply-action.dto.js'

// Penny create_strategy_goal — CONFIRM tool. Verifies pillarName resolution (+ambiguity),
// metric-key validation at PROPOSE time (unknown reject, mix reject), milestone normalize,
// apply routes to StrategyService.createGoal, and ApplyActionDto sync.

const USER = { id: 'caller-1', email: 'caller@school.test' } as unknown as User
const CTX = { schoolId: 'school-1', periodId: '', userId: USER.id, user: USER, role: 'owner' }

function makeService(pillarMatches: { id: string; name: string }[] = [{ id: 'pil1', name: 'Financial Sustainability' }]) {
  const prisma = {
    strategyPillar: {
      findFirst: vi.fn(async (q: { where: { id?: string } }) => (q.where.id ? { id: q.where.id, name: 'Financial Sustainability' } : null)),
      findMany: vi.fn(async () => pillarMatches),
    },
    strategicPlan: {
      findFirst: vi.fn(async (q: { where: { status?: string } }) => (q.where.status === 'adopted' ? { id: 'plan1', name: 'Plan A' } : null)),
    },
  }
  const createGoal = vi.fn(async () => ({ id: 'goal1', title: 'Reach 60 days cash on hand' }))
  const strategy = { createGoal }
  const stub = {} as never
  const svc = new AssistantService(
    prisma as never, stub, stub, stub, stub, stub, stub, stub, stub, stub,
    stub, stub, stub, stub, stub, stub, stub, stub, stub, stub,
    stub, stub, stub, stub, stub, stub, stub, stub, stub, stub,
    stub, stub, stub,
    strategy as never, // strategy (34)
    stub, // planDrafter (35)
  )
  return { svc, createGoal }
}

const build = (svc: AssistantService, args: Record<string, unknown>) =>
  (svc as unknown as { buildProposal: (n: string, a: unknown, c: unknown) => Promise<ProposedAction> })
    .buildProposal('create_strategy_goal', args, CTX)

const apply = (svc: AssistantService, action: ProposedAction) =>
  (svc as unknown as { applyAction: (s: string, u: User, a: ProposedAction) => Promise<{ targetId: string | null }> })
    .applyAction('school-1', USER, action)

describe('create_strategy_goal — buildProposal', () => {
  it('resolves pillarName → id and carries a metric binding, no mutation', async () => {
    const { svc, createGoal } = makeService()
    const action = await build(svc, {
      pillarName: 'Financial Sustainability',
      title: 'Reach 60 days cash on hand',
      goalType: 'metric',
      metricKey: 'days_cash_on_hand',
      targetValue: 60,
      targetDate: '2028-06-30',
    })
    expect(action.payload).toMatchObject({ pillarId: 'pil1', goalType: 'metric', metricKey: 'days_cash_on_hand', targetValue: 60 })
    expect(createGoal).not.toHaveBeenCalled()
  })

  it('rejects an unknown metricKey at PROPOSE time', async () => {
    const { svc } = makeService()
    await expect(build(svc, { pillarId: 'pil1', title: 'X', goalType: 'metric', metricKey: 'made_up' })).rejects.toThrow(/metricKey/i)
  })

  it('rejects a mix metricKey (revenue_mix) at PROPOSE time', async () => {
    const { svc } = makeService()
    await expect(build(svc, { pillarId: 'pil1', title: 'X', goalType: 'metric', metricKey: 'revenue_mix' })).rejects.toThrow(/mix/i)
  })

  it('errors on an ambiguous pillarName', async () => {
    const { svc } = makeService([{ id: 'a', name: 'Financial Sustainability' }, { id: 'b', name: 'Financial Sustainability' }])
    await expect(build(svc, { pillarName: 'Financial Sustainability', title: 'X', goalType: 'milestone' })).rejects.toThrow(/more than one/i)
  })

  it('normalizes milestones for a milestone goal', async () => {
    const { svc } = makeService()
    const action = await build(svc, {
      pillarId: 'pil1',
      title: 'Adopt the plan',
      goalType: 'milestone',
      milestones: [{ label: 'Board adopts' }, { label: 'Kickoff', done: true }, { nope: 1 }],
    })
    expect(action.payload.goalType).toBe('milestone')
    expect(action.payload.milestones).toEqual([{ label: 'Board adopts' }, { label: 'Kickoff', done: true }])
  })
})

describe('create_strategy_goal — applyAction', () => {
  it('routes to strategy.createGoal with the pillarId and captures the id', async () => {
    const { svc, createGoal } = makeService()
    const action: ProposedAction = {
      kind: 'create_strategy_goal',
      periodId: '',
      summary: 'Add goal.',
      payload: { pillarId: 'pil1', title: 'Reach 60 days cash on hand', goalType: 'metric', metricKey: 'days_cash_on_hand', targetValue: 60 },
    }
    const res = await apply(svc, action)
    expect(createGoal).toHaveBeenCalledTimes(1)
    const [schoolId, pillarId] = createGoal.mock.calls[0] as unknown as [string, string]
    expect(schoolId).toBe('school-1')
    expect(pillarId).toBe('pil1')
    expect(res.targetId).toBe('goal1')
  })
})

describe('create_strategy_goal — registry + DTO sync', () => {
  it('is registered with a label', () => {
    expect(TOOL_SCHEMAS.map((t) => t.function.name)).toContain('create_strategy_goal')
    expect(TOOL_LABELS.create_strategy_goal).toBeTruthy()
  })
  it('ApplyActionDto accepts create_strategy_goal', () => {
    const dto = plainToInstance(ApplyActionDto, {
      kind: 'create_strategy_goal',
      periodId: '',
      summary: 'Add goal.',
      payload: { pillarId: 'pil1', title: 'X', goalType: 'metric', metricKey: 'days_cash_on_hand' },
    })
    expect(validateSync(dto)).toHaveLength(0)
  })
})
