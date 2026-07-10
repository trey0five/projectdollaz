import { describe, expect, it, vi } from 'vitest'
import { validateSync } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import type { User } from '@finrep/db'
import { AssistantService, type ProposedAction } from './assistant.service.js'
import { TOOL_SCHEMAS, TOOL_LABELS } from './assistant.tools.js'
import { ApplyActionDto } from './dto/apply-action.dto.js'

// Penny create_strategy_pillar — CONFIRM tool. Verifies build shape + active-plan
// resolution + missing-plan error + apply routes to StrategyService.createPillar +
// ApplyActionDto sync.

const USER = { id: 'caller-1', email: 'caller@school.test' } as unknown as User
const CTX = { schoolId: 'school-1', periodId: '', userId: USER.id, user: USER, role: 'owner' }

function makeService(planRow: { id: string; name: string } | null = { id: 'plan1', name: 'Plan A' }) {
  const strategicPlanFindFirst = vi.fn(async (q: { where: { status?: string; id?: string } }) => {
    if (q.where.id) return planRow ? { id: q.where.id, name: planRow.name } : null
    if (q.where.status === 'adopted') return planRow
    return null // no draft
  })
  const createPillar = vi.fn(async () => ({ id: 'pil1', name: 'Financial Sustainability' }))
  const prisma = { strategicPlan: { findFirst: strategicPlanFindFirst } }
  const strategy = { createPillar }
  const stub = {} as never
  const svc = new AssistantService(
    prisma as never, stub, stub, stub, stub, stub, stub, stub, stub, stub,
    stub, stub, stub, stub, stub, stub, stub, stub, stub, stub,
    stub, stub, stub, stub, stub, stub, stub, stub, stub, stub,
    stub, stub, stub,
    strategy as never, // strategy (34)
    stub, // planDrafter (35)
  )
  return { svc, createPillar, strategicPlanFindFirst }
}

const build = (svc: AssistantService, args: Record<string, unknown>) =>
  (svc as unknown as { buildProposal: (n: string, a: unknown, c: unknown) => Promise<ProposedAction> })
    .buildProposal('create_strategy_pillar', args, CTX)

const apply = (svc: AssistantService, action: ProposedAction) =>
  (svc as unknown as { applyAction: (s: string, u: User, a: ProposedAction) => Promise<{ targetId: string | null }> })
    .applyAction('school-1', USER, action)

describe('create_strategy_pillar — buildProposal', () => {
  it('resolves the active plan when no planId is given, no mutation', async () => {
    const { svc, createPillar } = makeService()
    const action = await build(svc, { name: 'Financial Sustainability' })
    expect(action.kind).toBe('create_strategy_pillar')
    expect(action.payload).toMatchObject({ planId: 'plan1', name: 'Financial Sustainability' })
    expect(createPillar).not.toHaveBeenCalled()
  })

  it('errors clearly when the school has no plan', async () => {
    const { svc } = makeService(null)
    await expect(build(svc, { name: 'X' })).rejects.toThrow(/no strategic plan/i)
  })

  it('errors on a foreign planId', async () => {
    const { svc } = makeService(null)
    await expect(build(svc, { name: 'X', planId: 'nope' })).rejects.toThrow(/not found/i)
  })
})

describe('create_strategy_pillar — applyAction', () => {
  it('routes to strategy.createPillar with the planId and captures the id', async () => {
    const { svc, createPillar } = makeService()
    const action: ProposedAction = {
      kind: 'create_strategy_pillar',
      periodId: '',
      summary: 'Add pillar.',
      payload: { planId: 'plan1', name: 'Financial Sustainability' },
    }
    const res = await apply(svc, action)
    expect(createPillar).toHaveBeenCalledTimes(1)
    const [schoolId, planId] = createPillar.mock.calls[0] as unknown as [string, string]
    expect(schoolId).toBe('school-1')
    expect(planId).toBe('plan1')
    expect(res.targetId).toBe('pil1')
  })
})

describe('create_strategy_pillar — registry + DTO sync', () => {
  it('is registered with a label', () => {
    expect(TOOL_SCHEMAS.map((t) => t.function.name)).toContain('create_strategy_pillar')
    expect(TOOL_LABELS.create_strategy_pillar).toBeTruthy()
  })
  it('ApplyActionDto accepts create_strategy_pillar', () => {
    const dto = plainToInstance(ApplyActionDto, {
      kind: 'create_strategy_pillar',
      periodId: '',
      summary: 'Add pillar.',
      payload: { planId: 'plan1', name: 'X' },
    })
    expect(validateSync(dto)).toHaveLength(0)
  })
})
