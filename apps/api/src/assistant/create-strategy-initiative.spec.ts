import { describe, expect, it, vi } from 'vitest'
import { validateSync } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import type { User } from '@finrep/db'
import { AssistantService, type ProposedAction } from './assistant.service.js'
import { TOOL_SCHEMAS, TOOL_LABELS } from './assistant.tools.js'
import { ApplyActionDto } from './dto/apply-action.dto.js'

// Penny create_strategy_initiative — CONFIRM tool. Verifies goalName resolution
// (+ambiguity), status clamp, apply routes to StrategyService.createInitiative, and
// ApplyActionDto sync.

const USER = { id: 'caller-1', email: 'caller@school.test' } as unknown as User
const CTX = { schoolId: 'school-1', periodId: '', userId: USER.id, user: USER, role: 'owner' }

function makeService(goalMatches: { id: string; title: string }[] = [{ id: 'goal1', title: 'Reach 60 days cash on hand' }]) {
  const prisma = {
    strategyGoal: {
      findFirst: vi.fn(async (q: { where: { id?: string } }) => (q.where.id ? { id: q.where.id, title: 'Reach 60 days cash on hand' } : null)),
      findMany: vi.fn(async () => goalMatches),
    },
    strategicPlan: {
      findFirst: vi.fn(async (q: { where: { status?: string } }) => (q.where.status === 'adopted' ? { id: 'plan1', name: 'Plan A' } : null)),
    },
  }
  const createInitiative = vi.fn(async () => ({ id: 'ini1', title: 'Draft a cash policy' }))
  const strategy = { createInitiative }
  const stub = {} as never
  const svc = new AssistantService(
    prisma as never, stub, stub, stub, stub, stub, stub, stub, stub, stub,
    stub, stub, stub, stub, stub, stub, stub, stub, stub, stub,
    stub, stub, stub, stub, stub, stub, stub, stub, stub, stub,
    stub, stub, stub,
    strategy as never, // strategy (34)
    stub, // planDrafter (35)
  )
  return { svc, createInitiative }
}

const build = (svc: AssistantService, args: Record<string, unknown>) =>
  (svc as unknown as { buildProposal: (n: string, a: unknown, c: unknown) => Promise<ProposedAction> })
    .buildProposal('create_strategy_initiative', args, CTX)

const apply = (svc: AssistantService, action: ProposedAction) =>
  (svc as unknown as { applyAction: (s: string, u: User, a: ProposedAction) => Promise<{ targetId: string | null }> })
    .applyAction('school-1', USER, action)

describe('create_strategy_initiative — buildProposal', () => {
  it('resolves goalName → id and clamps status, no mutation', async () => {
    const { svc, createInitiative } = makeService()
    const action = await build(svc, {
      goalName: 'Reach 60 days cash on hand',
      title: 'Draft a cash policy',
      status: 'in_progress',
    })
    expect(action.payload).toMatchObject({ goalId: 'goal1', title: 'Draft a cash policy', status: 'in_progress' })
    expect(createInitiative).not.toHaveBeenCalled()
  })

  it('drops an unknown status (clamped away)', async () => {
    const { svc } = makeService()
    const action = await build(svc, { goalId: 'goal1', title: 'X', status: 'bogus' })
    expect(action.payload.status).toBeUndefined()
  })

  it('errors on an ambiguous goalName', async () => {
    const { svc } = makeService([{ id: 'a', title: 'Grow' }, { id: 'b', title: 'Grow' }])
    await expect(build(svc, { goalName: 'Grow', title: 'X' })).rejects.toThrow(/more than one/i)
  })
})

describe('create_strategy_initiative — applyAction', () => {
  it('routes to strategy.createInitiative with the goalId and captures the id', async () => {
    const { svc, createInitiative } = makeService()
    const action: ProposedAction = {
      kind: 'create_strategy_initiative',
      periodId: '',
      summary: 'Add initiative.',
      payload: { goalId: 'goal1', title: 'Draft a cash policy', status: 'planned' },
    }
    const res = await apply(svc, action)
    expect(createInitiative).toHaveBeenCalledTimes(1)
    const [schoolId, goalId] = createInitiative.mock.calls[0] as unknown as [string, string]
    expect(schoolId).toBe('school-1')
    expect(goalId).toBe('goal1')
    expect(res.targetId).toBe('ini1')
  })
})

describe('create_strategy_initiative — registry + DTO sync', () => {
  it('is registered with a label', () => {
    expect(TOOL_SCHEMAS.map((t) => t.function.name)).toContain('create_strategy_initiative')
    expect(TOOL_LABELS.create_strategy_initiative).toBeTruthy()
  })
  it('ApplyActionDto accepts create_strategy_initiative', () => {
    const dto = plainToInstance(ApplyActionDto, {
      kind: 'create_strategy_initiative',
      periodId: '',
      summary: 'Add initiative.',
      payload: { goalId: 'goal1', title: 'X' },
    })
    expect(validateSync(dto)).toHaveLength(0)
  })
})
