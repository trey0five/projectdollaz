import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { validateSync } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import type { User } from '@finrep/db'
import { AssistantService, type ProposedAction } from './assistant.service.js'
import { TOOL_SCHEMAS, TOOL_LABELS } from './assistant.tools.js'
import { ApplyActionDto } from './dto/apply-action.dto.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase G — Penny's `create_initiative`.
//
// Cloned from `create-strategy-initiative.spec.ts`, which is left BYTE-IDENTICAL:
// its remaining green is the proof that the deprecated alias still behaves exactly
// as it shipped.
//
// THE ONE BEHAVIOURAL DIFFERENCE, AND WHY IT MATTERS: `goalId` is optional. An
// accreditation-only school has no strategic plan, no pillars and no goals, so
// until this tool existed Penny could not record a single piece of improvement
// work for it — an early warning was a sentence with nowhere to put it.
//
// THE SYNC ASSERTIONS BELOW ARE NOT CEREMONY. A `kind` present in
// `ProposedAction['kind']` but missing from `APPLY_KINDS` 400s at the validation
// boundary before `applyAction` ever runs, and that exact desync has shipped twice
// in this repository. Every link of the chain is asserted here, in one place.
// ─────────────────────────────────────────────────────────────────────────────

const USER = { id: 'caller-1', email: 'caller@school.test' } as unknown as User
const CTX = { schoolId: 'school-1', periodId: '', userId: USER.id, user: USER, role: 'owner' }

// Positional DI, matching the sibling specs. The indices are DERIVED from the
// constructor's own arity rather than retyped — `improvement` sits immediately
// ahead of the two Phase-E deps, which `get-early-warnings.spec.ts` pins at
// `arity - 2` / `arity - 1`. A future dependency added anywhere cannot silently
// shift this without one of the two specs saying so.
const ARITY = AssistantService.length
const IMPROVEMENT_ARG_INDEX = ARITY - 3
const STRATEGY_ARG_INDEX = 33

function makeService(
  goalMatches: { id: string; title: string }[] = [{ id: 'goal1', title: 'Reach 60 days cash on hand' }],
) {
  const prisma = {
    strategyGoal: {
      findFirst: vi.fn(async (q: { where: { id?: string } }) =>
        q.where.id ? { id: q.where.id, title: 'Reach 60 days cash on hand' } : null,
      ),
      findMany: vi.fn(async () => goalMatches),
    },
    strategicPlan: {
      findFirst: vi.fn(async (q: { where: { status?: string } }) =>
        q.where.status === 'adopted' ? { id: 'plan1', name: 'Plan A' } : null,
      ),
    },
  }
  const createInitiative = vi.fn(async () => ({ id: 'ini1', title: 'Close the COG-2.3 evidence gap' }))
  const removeInitiative = vi.fn(async () => ({ id: 'ini1' }))
  // The STRATEGY service's createInitiative — asserted NEVER to be called, so a
  // regression that routes the new kind through the goal-requiring path is caught
  // rather than merely producing a confusing error.
  const strategyCreateInitiative = vi.fn(async () => ({ id: 'wrong-service' }))

  const args: unknown[] = new Array(ARITY).fill({} as never)
  args[0] = prisma
  args[STRATEGY_ARG_INDEX] = { createInitiative: strategyCreateInitiative, removeInitiative: vi.fn() }
  args[IMPROVEMENT_ARG_INDEX] = { createInitiative, removeInitiative }
  const svc = new (AssistantService as unknown as new (...a: unknown[]) => AssistantService)(...args)
  return { svc, createInitiative, removeInitiative, strategyCreateInitiative }
}

const build = (svc: AssistantService, args: Record<string, unknown>) =>
  (
    svc as unknown as {
      buildProposal: (n: string, a: unknown, c: unknown) => Promise<ProposedAction>
    }
  ).buildProposal('create_initiative', args, CTX)

const apply = (svc: AssistantService, action: ProposedAction) =>
  (
    svc as unknown as {
      applyAction: (s: string, u: User, a: ProposedAction) => Promise<{ targetId: string | null }>
    }
  ).applyAction('school-1', USER, action)

describe('create_initiative — buildProposal with NO goal, which is the point of the phase', () => {
  it('builds without any goal reference and carries goalId: null EXPLICITLY', async () => {
    const { svc, createInitiative } = makeService()
    const action = await build(svc, { title: 'Close the COG-2.3 evidence gap' })
    expect(action.kind).toBe('create_initiative')
    expect(action.payload.goalId).toBeNull()
    expect(action.payload.title).toBe('Close the COG-2.3 evidence gap')
    // Null rather than absent: the apply branch must be able to tell "no goal"
    // from "the field never made it through".
    expect('goalId' in action.payload).toBe(true)
    // A PROPOSAL is not a write.
    expect(createInitiative).not.toHaveBeenCalled()
  })

  it('the summary of a goal-less initiative does not invent a goal to name', async () => {
    const { svc } = makeService()
    const action = await build(svc, { title: 'Rebuild the advising rubric' })
    expect(action.summary).toBe('Add improvement initiative “Rebuild the advising rubric”.')
    expect(action.summary).not.toMatch(/goal/i)
  })

  it('still resolves a goal when one IS named, and says so', async () => {
    const { svc } = makeService()
    const action = await build(svc, {
      goalName: 'Reach 60 days cash on hand',
      title: 'Draft a cash policy',
    })
    expect(action.payload.goalId).toBe('goal1')
    expect(action.summary).toContain('Reach 60 days cash on hand')
  })

  it('a goal reference that cannot be resolved still FAILS — silence would drop the link', async () => {
    const { svc } = makeService([])
    await expect(build(svc, { goalName: 'No such goal', title: 'X' })).rejects.toThrow(/No goal titled/i)
  })

  it('an ambiguous goalName is still an error, exactly as on the alias', async () => {
    const { svc } = makeService([
      { id: 'a', title: 'Grow' },
      { id: 'b', title: 'Grow' },
    ])
    await expect(build(svc, { goalName: 'Grow', title: 'X' })).rejects.toThrow(/more than one/i)
  })

  it('a missing title is rejected — an initiative with no title is not work', async () => {
    const { svc } = makeService()
    await expect(build(svc, {})).rejects.toThrow(/needs a title/i)
  })

  it('clamps the Phase G vocabularies and DROPS what the DTO would reject', async () => {
    const { svc } = makeService()
    const action = await build(svc, {
      title: 'Work the finding',
      originType: 'finding',
      findingKey: 'GOV-MINUTES-STALE:school',
      dueDate: '2027-03-31',
      status: 'in_progress',
    })
    expect(action.payload).toMatchObject({
      originType: 'finding',
      findingKey: 'GOV-MINUTES-STALE:school',
      dueDate: '2027-03-31',
      status: 'in_progress',
    })

    const junk = await build(svc, {
      title: 'Work the finding',
      originType: 'invented',
      status: 'bogus',
      dueDate: 'next spring',
    })
    // Dropped, not passed through: a stray enum riding into /apply is a 400 under
    // the global forbidNonWhitelisted pipe, which is a worse outcome than a
    // defaulted field.
    expect(junk.payload.originType).toBeUndefined()
    expect(junk.payload.status).toBeUndefined()
    expect(junk.payload.dueDate).toBeUndefined()
  })
})

describe('create_initiative — applyAction routes to the IMPROVEMENT service', () => {
  it('creates with goalId: null and captures the created id', async () => {
    const { svc, createInitiative, strategyCreateInitiative } = makeService()
    const action: ProposedAction = {
      kind: 'create_initiative',
      periodId: '',
      summary: 'Add improvement initiative “Close the COG-2.3 evidence gap”.',
      payload: { goalId: null, title: 'Close the COG-2.3 evidence gap' },
    }
    const res = await apply(svc, action)
    expect(createInitiative).toHaveBeenCalledTimes(1)
    const [schoolId, dto, userId] = createInitiative.mock.calls[0] as unknown as [
      string,
      { goalId: string | null; title: string },
      string,
    ]
    expect(schoolId).toBe('school-1')
    expect(dto.goalId).toBeNull()
    expect(dto.title).toBe('Close the COG-2.3 evidence gap')
    expect(userId).toBe(USER.id)
    expect(res.targetId).toBe('ini1')
    // NOT the goal-requiring path. StrategyService.createInitiative throws on a
    // null goal, so routing there would break the whole point of the phase.
    expect(strategyCreateInitiative).not.toHaveBeenCalled()
  })

  it('passes a supplied goalId through unchanged', async () => {
    const { svc, createInitiative } = makeService()
    await apply(svc, {
      kind: 'create_initiative',
      periodId: '',
      summary: 'Add.',
      payload: { goalId: 'goal1', title: 'Draft a cash policy' },
    })
    const [, dto] = createInitiative.mock.calls[0] as unknown as [string, { goalId: string | null }]
    expect(dto.goalId).toBe('goal1')
  })

  it('RE-CLAMPS at apply time — the payload comes back over the wire untrusted', async () => {
    // ApplyActionDto validates `kind`/`periodId`/`summary` and that `payload` is an
    // object. It does NOT validate the payload's contents, so a hand-rolled /apply
    // body reaches this branch unchecked.
    const { svc, createInitiative } = makeService()
    await apply(svc, {
      kind: 'create_initiative',
      periodId: '',
      summary: 'Add.',
      payload: {
        goalId: null,
        title: 'X',
        status: 'not-a-status',
        originType: 'not-an-origin',
        dueDate: 'whenever',
      },
    })
    const [, dto] = createInitiative.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ]
    expect(dto.status).toBeUndefined()
    expect(dto.originType).toBeUndefined()
    expect(dto.dueDate).toBeUndefined()
  })

  it('a titleless payload is rejected at apply, not written as an empty row', async () => {
    const { svc, createInitiative } = makeService()
    await expect(
      apply(svc, { kind: 'create_initiative', periodId: '', summary: 'Add.', payload: { goalId: null } }),
    ).rejects.toThrow(/needs a title/i)
    expect(createInitiative).not.toHaveBeenCalled()
  })
})

describe('create_initiative — the UNDO reverses through the improvement service', () => {
  it('reverseApplied deletes the captured row', async () => {
    const { svc, removeInitiative } = makeService()
    await (
      svc as unknown as {
        reverseApplied: (u: User, s: string, t: string, id: string) => Promise<void>
      }
    ).reverseApplied(USER, 'school-1', 'create_initiative', 'ini1')
    expect(removeInitiative).toHaveBeenCalledWith('school-1', 'ini1', USER.id)
  })

  it('the DEPRECATED ALIAS still reverses through the STRATEGY service, untouched', async () => {
    const { svc } = makeService()
    const strategyRemove = (
      svc as unknown as { strategy: { removeInitiative: ReturnType<typeof vi.fn> } }
    ).strategy.removeInitiative
    await (
      svc as unknown as {
        reverseApplied: (u: User, s: string, t: string, id: string) => Promise<void>
      }
    ).reverseApplied(USER, 'school-1', 'create_strategy_initiative', 'ini1')
    expect(strategyRemove).toHaveBeenCalledWith('school-1', 'ini1', USER.id)
  })
})

describe('create_initiative — THE FIVE-WAY SYNC. This is the acceptance-7 assertion.', () => {
  const src = readFileSync(fileURLToPath(new URL('./assistant.service.ts', import.meta.url)), 'utf8')

  it('is registered in TOOL_SCHEMAS with a TOOL_LABELS entry', () => {
    expect(TOOL_SCHEMAS.map((t) => t.function.name)).toContain('create_initiative')
    expect(TOOL_LABELS.create_initiative).toBeTruthy()
  })

  it('ApplyActionDto ACCEPTS the kind — the assertion that catches the 400', () => {
    const dto = plainToInstance(ApplyActionDto, {
      kind: 'create_initiative',
      periodId: '',
      summary: 'Add improvement initiative.',
      payload: { goalId: null, title: 'X' },
    })
    expect(validateSync(dto)).toHaveLength(0)
  })

  it('REFRESH, REVERSIBLE_KINDS and CONFIRM_TOOLS all name it', () => {
    // REFRESH is a Record TOTAL over ProposedAction['kind'], so its entry is
    // enforced by the compiler; the other two are plain Sets and are not.
    expect(src).toMatch(/create_initiative: \['strategy', 'accreditation'\]/)
    const reversible = /const REVERSIBLE_KINDS = new Set<ProposedAction\['kind'\]>\(\[([\s\S]*?)\]\)/.exec(src)
    expect(reversible?.[1]).toContain("'create_initiative'")
    const confirm = /const CONFIRM_TOOLS = new Set\(\[([\s\S]*?)\]\)/.exec(src)
    expect(confirm?.[1]).toContain("'create_initiative'")
  })

  it('every TOOL_SCHEMAS confirm/write tool has a TOOL_LABELS entry — no orphans', () => {
    for (const t of TOOL_SCHEMAS) {
      expect(TOOL_LABELS[t.function.name], `no TOOL_LABELS entry for ${t.function.name}`).toBeTruthy()
    }
  })
})

describe('create_strategy_initiative — the DEPRECATED ALIAS is unchanged', () => {
  it('is still offered, still labelled, and still accepted by ApplyActionDto', () => {
    expect(TOOL_SCHEMAS.map((t) => t.function.name)).toContain('create_strategy_initiative')
    expect(TOOL_LABELS.create_strategy_initiative).toBeTruthy()
    const dto = plainToInstance(ApplyActionDto, {
      kind: 'create_strategy_initiative',
      periodId: '',
      summary: 'Add initiative.',
      payload: { goalId: 'goal1', title: 'X' },
    })
    expect(validateSync(dto)).toHaveLength(0)
  })

  it('its description SAYS it is deprecated, so the model prefers the new tool', () => {
    const alias = TOOL_SCHEMAS.find((t) => t.function.name === 'create_strategy_initiative')
    expect(alias?.function.description).toContain('deprecated')
    expect(alias?.function.description).toContain('create_initiative')
  })

  it('still HARD-REQUIRES a goalId — widening it was never the plan', async () => {
    const { svc } = makeService()
    await expect(
      apply(svc, {
        kind: 'create_strategy_initiative',
        periodId: '',
        summary: 'Add.',
        payload: { title: 'X' },
      }),
    ).rejects.toThrow(/needs a goalId/i)
  })
})
