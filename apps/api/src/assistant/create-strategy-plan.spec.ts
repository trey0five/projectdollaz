import { describe, expect, it, vi } from 'vitest'
import { validateSync } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import type { User } from '@finrep/db'
import { AssistantService, type ProposedAction } from './assistant.service.js'
import { TOOL_SCHEMAS, TOOL_LABELS } from './assistant.tools.js'
import { ApplyActionDto } from './dto/apply-action.dto.js'

// ─────────────────────────────────────────────────────────────────────────────
// Penny create_strategy_plan slice — a CONFIRM tool (propose → confirm → /apply).
// Verifies (WITHOUT booting Nest/Prisma): build shape + NO mutation; applyAction
// routes to StrategyService.createPlan (reversible); viewer denied; registry wiring;
// ApplyActionDto accepts the kind (the APPLY_KINDS sync gotcha).
// ─────────────────────────────────────────────────────────────────────────────

const USER = { id: 'caller-1', email: 'caller@school.test' } as unknown as User
const CTX = { schoolId: 'school-1', periodId: 'period-1', userId: USER.id, user: USER, role: 'owner' }

function makeService() {
  const createPlan = vi.fn(async () => ({ id: 'plan1', name: 'FY2026–FY2028 Strategic Plan' }))
  const strategy = { createPlan }
  const stub = {} as never
  const svc = new AssistantService(
    stub as never, stub, stub, stub, stub, stub, stub, stub, stub, stub,
    stub, stub, stub, stub, stub, stub, stub, stub, stub, stub,
    stub, stub, stub, stub, stub, stub, stub, stub, stub, stub,
    stub, stub, stub,
    strategy as never, // strategy (34)
    stub, // planDrafter (35)
  )
  return { svc, createPlan }
}

const build = (svc: AssistantService, args: Record<string, unknown>, ctx: Record<string, unknown>) =>
  (svc as unknown as { buildProposal: (n: string, a: unknown, c: unknown) => Promise<ProposedAction> })
    .buildProposal('create_strategy_plan', args, ctx)

const apply = (svc: AssistantService, action: ProposedAction) =>
  (svc as unknown as {
    applyAction: (s: string, u: User, a: ProposedAction) => Promise<{ applied: boolean; targetId: string | null; reversible: boolean }>
  }).applyAction('school-1', USER, action)

describe('create_strategy_plan — buildProposal (confirmable, no mutation)', () => {
  it('builds a plan proposal and does NOT write', async () => {
    const { svc, createPlan } = makeService()
    const action = await build(svc, { name: 'My Plan', fyStartYear: 2026, fyEndYear: 2028 }, CTX)
    expect(action.kind).toBe('create_strategy_plan')
    expect(action.payload).toMatchObject({ name: 'My Plan', fyStartYear: 2026, fyEndYear: 2028 })
    expect(createPlan).not.toHaveBeenCalled()
  })

  it('rejects fyEndYear before fyStartYear', async () => {
    const { svc } = makeService()
    await expect(build(svc, { name: 'X', fyStartYear: 2028, fyEndYear: 2026 }, CTX)).rejects.toThrow(/fyEndYear/i)
  })

  it('rejects a missing name', async () => {
    const { svc } = makeService()
    await expect(build(svc, { fyStartYear: 2026, fyEndYear: 2028 }, CTX)).rejects.toThrow(/name/i)
  })
})

describe('create_strategy_plan — applyAction (real write via StrategyService)', () => {
  it('calls strategy.createPlan and returns a reversible result with the captured id', async () => {
    const { svc, createPlan } = makeService()
    const action: ProposedAction = {
      kind: 'create_strategy_plan',
      periodId: '',
      summary: 'Create strategic plan.',
      payload: { name: 'My Plan', fyStartYear: 2026, fyEndYear: 2028 },
    }
    const res = await apply(svc, action)
    expect(createPlan).toHaveBeenCalledTimes(1)
    const [schoolId, dto, userId] = createPlan.mock.calls[0] as unknown as [string, Record<string, unknown>, string]
    expect(schoolId).toBe('school-1')
    expect(userId).toBe(USER.id)
    expect(dto).toMatchObject({ name: 'My Plan', fyStartYear: 2026, fyEndYear: 2028 })
    expect(res).toMatchObject({ applied: true, targetType: 'create_strategy_plan', targetId: 'plan1', reversible: true })
  })
})

describe('create_strategy_plan — runToolCall routing', () => {
  const run = (svc: AssistantService, tc: unknown, ctx: unknown, sinks: unknown) =>
    (svc as unknown as { runToolCall: (t: unknown, c: unknown, s: unknown) => Promise<unknown> }).runToolCall(tc, ctx, sinks)
  const toolCall = (args: Record<string, unknown>) => ({ id: 'tc1', function: { name: 'create_strategy_plan', arguments: JSON.stringify(args) } })
  const makeSinks = () => ({ onChart: vi.fn(), onProposal: vi.fn(), onNavigate: vi.fn(), onApplied: vi.fn(), onGuide: vi.fn() })

  it('owner: emits a proposal and does NOT apply', async () => {
    const { svc, createPlan } = makeService()
    const sinks = makeSinks()
    const res = (await run(svc, toolCall({ name: 'X', fyStartYear: 2026, fyEndYear: 2028 }), CTX, sinks)) as { proposed?: boolean }
    expect(res.proposed).toBe(true)
    expect(sinks.onProposal).toHaveBeenCalledTimes(1)
    expect(createPlan).not.toHaveBeenCalled()
  })

  it('viewer: refused (no edit access)', async () => {
    const { svc, createPlan } = makeService()
    const sinks = makeSinks()
    const res = (await run(svc, toolCall({ name: 'X', fyStartYear: 2026, fyEndYear: 2028 }), { ...CTX, role: 'viewer' }, sinks)) as { error?: string }
    expect(res.error).toMatch(/edit access/i)
    expect(sinks.onProposal).not.toHaveBeenCalled()
    expect(createPlan).not.toHaveBeenCalled()
  })
})

describe('create_strategy_plan — registry + DTO sync', () => {
  it('is a registered tool with a status label', () => {
    expect(TOOL_SCHEMAS.map((t) => t.function.name)).toContain('create_strategy_plan')
    expect(TOOL_LABELS.create_strategy_plan).toBeTruthy()
  })
  it('ApplyActionDto accepts kind create_strategy_plan (the APPLY_KINDS sync gotcha)', () => {
    const dto = plainToInstance(ApplyActionDto, {
      kind: 'create_strategy_plan',
      periodId: '',
      summary: 'Create strategic plan.',
      payload: { name: 'X', fyStartYear: 2026, fyEndYear: 2028 },
    })
    expect(validateSync(dto)).toHaveLength(0)
  })
})
