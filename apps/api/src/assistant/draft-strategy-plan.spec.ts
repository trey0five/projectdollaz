import { describe, expect, it, vi } from 'vitest'
import { validateSync } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import type { User } from '@finrep/db'
import { AssistantService, type ProposedAction } from './assistant.service.js'
import { TOOL_SCHEMAS, TOOL_LABELS } from './assistant.tools.js'
import { ApplyActionDto } from './dto/apply-action.dto.js'

// ─────────────────────────────────────────────────────────────────────────────
// Penny draft_strategy_plan — the multi-create CONFIRM tool. Verifies: the drafter
// is called READ-ONLY at build (no writes); ONE proposal carrying the full §SEAM tree;
// applyAction creates plan → pillars → goals IN ORDER; a mid-tree failure triggers a
// compensating removePlan(planId) + rethrow (no orphan); reverseApplied cascades via
// removePlan; viewer denied; ApplyActionDto accepts every strategy kind.
// ─────────────────────────────────────────────────────────────────────────────

const USER = { id: 'caller-1', email: 'caller@school.test' } as unknown as User
const CTX = { schoolId: 'school-1', periodId: '', userId: USER.id, user: USER, role: 'owner' }

const DRAFT_TREE = () => ({
  name: 'FY2026–FY2028 Strategic Plan',
  mission: 'Sustain the school.',
  fyStartYear: 2026,
  fyEndYear: 2028,
  dataAsOf: '2026-06-30',
  isStarter: false,
  pillars: [
    {
      name: 'Financial Sustainability',
      description: null,
      orderIndex: 0,
      goals: [
        {
          title: 'Reach 60 days cash on hand',
          goalType: 'metric',
          metricKey: 'days_cash_on_hand',
          targetValue: 60,
          targetDate: '2028-06-30',
          milestones: null,
          rationale: 'Days cash on hand is 43 today; targets 60 by FY2028.',
          orderIndex: 0,
        },
        {
          title: 'Establish a quarterly financial review cadence',
          goalType: 'milestone',
          milestones: [{ label: 'Adopt the plan with the board' }],
          rationale: null,
          orderIndex: 1,
        },
      ],
    },
  ],
  counts: { pillars: 1, goals: 2 },
})

function makeService(opts: { failGoal?: boolean } = {}) {
  const calls: string[] = []
  const draft = vi.fn(async () => DRAFT_TREE())
  const strategy = {
    createPlan: vi.fn(async () => {
      calls.push('createPlan')
      return { id: 'plan1', name: 'FY2026–FY2028 Strategic Plan' }
    }),
    createPillar: vi.fn(async () => {
      calls.push('createPillar')
      return { id: 'pil1', name: 'Financial Sustainability' }
    }),
    createGoal: vi.fn(async () => {
      calls.push('createGoal')
      if (opts.failGoal) throw new Error('bad metric')
      return { id: 'goal1', title: 'Reach 60 days cash on hand' }
    }),
    removePlan: vi.fn(async () => {
      calls.push('removePlan')
      return { id: 'plan1' }
    }),
  }
  const stub = {} as never
  const svc = new AssistantService(
    stub as never, stub, stub, stub, stub, stub, stub, stub, stub, stub,
    stub, stub, stub, stub, stub, stub, stub, stub, stub, stub,
    stub, stub, stub, stub, stub, stub, stub, stub, stub, stub,
    stub, stub, stub,
    strategy as never, // strategy (34)
    { draft } as never, // planDrafter (35)
  )
  return { svc, strategy, draft, calls }
}

const build = (svc: AssistantService, args: Record<string, unknown>, ctx: Record<string, unknown> = CTX) =>
  (svc as unknown as { buildProposal: (n: string, a: unknown, c: unknown) => Promise<ProposedAction> })
    .buildProposal('draft_strategy_plan', args, ctx)

const apply = (svc: AssistantService, action: ProposedAction) =>
  (svc as unknown as { applyAction: (s: string, u: User, a: ProposedAction) => Promise<{ targetId: string | null; reversible: boolean }> })
    .applyAction('school-1', USER, action)

describe('draft_strategy_plan — buildProposal (drafter read-only, one proposal)', () => {
  it('calls the drafter and returns ONE proposal carrying the whole tree, no writes', async () => {
    const { svc, draft, strategy } = makeService()
    const action = await build(svc, {})
    expect(draft).toHaveBeenCalledTimes(1)
    expect(action.kind).toBe('draft_strategy_plan')
    expect(action.payload.name).toBe('FY2026–FY2028 Strategic Plan')
    expect((action.payload.pillars as unknown[]).length).toBe(1)
    expect(action.summary).toContain('1 pillars')
    expect(action.summary).toContain('2 goals')
    // NO writes at propose time.
    expect(strategy.createPlan).not.toHaveBeenCalled()
    expect(strategy.createPillar).not.toHaveBeenCalled()
    expect(strategy.createGoal).not.toHaveBeenCalled()
  })
})

describe('draft_strategy_plan — applyAction (multi-create)', () => {
  it('creates plan → pillars → goals IN ORDER and returns the plan id (reversible)', async () => {
    const { svc, strategy, calls } = makeService()
    const action: ProposedAction = {
      kind: 'draft_strategy_plan',
      periodId: '',
      summary: 'Draft a FY2026–FY2028 strategic plan: 1 pillars, 2 goals.',
      payload: DRAFT_TREE() as unknown as Record<string, unknown>,
    }
    const res = await apply(svc, action)
    expect(calls).toEqual(['createPlan', 'createPillar', 'createGoal', 'createGoal'])
    expect(strategy.removePlan).not.toHaveBeenCalled()
    expect(res).toMatchObject({ targetId: 'plan1', reversible: true })
  })

  it('on a mid-tree goal failure, runs a compensating removePlan(planId) and rethrows', async () => {
    const { svc, strategy, calls } = makeService({ failGoal: true })
    const action: ProposedAction = {
      kind: 'draft_strategy_plan',
      periodId: '',
      summary: 'Draft…',
      payload: DRAFT_TREE() as unknown as Record<string, unknown>,
    }
    await expect(apply(svc, action)).rejects.toThrow(/bad metric/i)
    expect(strategy.removePlan).toHaveBeenCalledTimes(1)
    const [schoolId, planId] = strategy.removePlan.mock.calls[0] as unknown as [string, string]
    expect(schoolId).toBe('school-1')
    expect(planId).toBe('plan1')
    expect(calls).toContain('removePlan')
  })
})

describe('draft_strategy_plan — reverse (undo cascades via removePlan)', () => {
  it('reverseApplied(draft_strategy_plan, planId) → strategy.removePlan', async () => {
    const { svc, strategy } = makeService()
    await (svc as unknown as { reverseApplied: (u: User, s: string, t: string, id: string) => Promise<void> })
      .reverseApplied(USER, 'school-1', 'draft_strategy_plan', 'plan1')
    expect(strategy.removePlan).toHaveBeenCalledWith('school-1', 'plan1', USER.id)
  })
})

describe('draft_strategy_plan — runToolCall routing', () => {
  const run = (svc: AssistantService, tc: unknown, ctx: unknown, sinks: unknown) =>
    (svc as unknown as { runToolCall: (t: unknown, c: unknown, s: unknown) => Promise<unknown> }).runToolCall(tc, ctx, sinks)
  const toolCall = () => ({ id: 'tc1', function: { name: 'draft_strategy_plan', arguments: '{}' } })
  const makeSinks = () => ({ onChart: vi.fn(), onProposal: vi.fn(), onNavigate: vi.fn(), onApplied: vi.fn(), onGuide: vi.fn() })

  it('owner: emits a proposal and does NOT apply', async () => {
    const { svc, strategy } = makeService()
    const sinks = makeSinks()
    const res = (await run(svc, toolCall(), CTX, sinks)) as { proposed?: boolean }
    expect(res.proposed).toBe(true)
    expect(sinks.onProposal).toHaveBeenCalledTimes(1)
    expect(strategy.createPlan).not.toHaveBeenCalled()
  })

  it('viewer: refused (no edit access), drafter never called', async () => {
    const { svc, draft } = makeService()
    const sinks = makeSinks()
    const res = (await run(svc, toolCall(), { ...CTX, role: 'viewer' }, sinks)) as { error?: string }
    expect(res.error).toMatch(/edit access/i)
    expect(sinks.onProposal).not.toHaveBeenCalled()
    expect(draft).not.toHaveBeenCalled()
  })
})

describe('strategy tools — registry + APPLY_KINDS sync (all 5 kinds)', () => {
  const KINDS = [
    'create_strategy_plan',
    'create_strategy_pillar',
    'create_strategy_goal',
    'create_strategy_initiative',
    'draft_strategy_plan',
  ] as const

  it('all 5 are registered tools with status labels', () => {
    const names = TOOL_SCHEMAS.map((t) => t.function.name)
    for (const k of KINDS) {
      expect(names).toContain(k)
      expect(TOOL_LABELS[k]).toBeTruthy()
    }
  })

  it('ApplyActionDto accepts every strategy kind (the byte-sync gotcha)', () => {
    for (const kind of KINDS) {
      const dto = plainToInstance(ApplyActionDto, { kind, periodId: '', summary: 's', payload: {} })
      expect(validateSync(dto), `kind ${kind} must validate`).toHaveLength(0)
    }
  })
})
