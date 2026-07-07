import { describe, expect, it, vi } from 'vitest'
import type { User } from '@finrep/db'
import { AssistantService, type ProposedAction } from './assistant.service.js'
import { TOOL_SCHEMAS, TOOL_LABELS } from './assistant.tools.js'

// ─────────────────────────────────────────────────────────────────────────────
// Penny create_task slice — the confirm-then-create WRITE tool. Verifies (WITHOUT
// booting Nest/Prisma, every dep a hand-mock):
//   • buildProposal(create_task) shape + NO mutation (tasks.create never called,
//     membership never queried — resolution is deferred to apply)
//   • applyAction assignee resolution: me / valid email / bad email → error /
//     omitted → unassigned, and the membership query is tenant-scoped (schoolId)
//   • sourceType clamp (governance → manual; compliance passes through)
//   • runToolCall routing: owner → onProposal (NOT applied, NO create); viewer →
//     no-edit-access error  (proves confirm-then-create, never a silent write)
//   • the tool is registered
// ─────────────────────────────────────────────────────────────────────────────

const USER = { id: 'caller-1', email: 'caller@school.test' } as unknown as User

/** A create_task-focused AssistantService: prisma.membership + tasks.create are the
 *  only live mocks; everything else is an inert stub (unused by these paths). */
function makeService(opts: {
  member?: { userId: string } | null
  membershipSpy?: ReturnType<typeof vi.fn>
} = {}) {
  const membershipFindFirst =
    opts.membershipSpy ?? vi.fn(async () => opts.member ?? null)
  // task.findFirst backs the anti-duplicate guard in create_task apply; default to no
  // existing task so the create path runs.
  const prisma = {
    membership: { findFirst: membershipFindFirst },
    task: { findFirst: vi.fn(async () => null) },
  }
  const tasksCreate = vi.fn(async (schoolId: string, dto: unknown) => ({ id: 't1', schoolId, dto }))
  const tasks = { create: tasksCreate }
  const stub = {} as never
  const svc = new AssistantService(
    prisma as never, // prisma
    stub, // periods
    stub, // analytics
    stub, // budget
    stub, // rollup
    stub, // briefing
    stub, // compliance
    stub, // reconciliation
    stub, // correctiveAction
    stub, // boardReport
    stub, // operational
    stub, // client
    stub, // files
    stub, // imports
    stub, // monthlySnapshots
    stub, // statements
    tasks as never, // tasks
    stub, // documents
    stub, // documentStorage
    stub, // policies
    stub, // committees
    stub, // meetings
    stub, // accreditation
    stub, // facilities
    stub, // advancement
    stub, // orgBriefing
    stub, // audit
    stub, // alerts
    stub, // schools (LAST) — only invite_member paths touch it
    stub, // qboDrill — only get_account_transactions touches it
    stub, // aging — only get_cash_collections touches it
    stub, // snapshotHistory — only get_value_history touches it
    stub, // cashFlow (LAST) — only get_cash_flow touches it
    stub, // strategy (LAST) — only get_plan_status touches it
  )
  return { svc, tasksCreate, membershipFindFirst }
}

// buildProposal / applyAction are private — reach them through an `any` cast, the
// same convention the other assistant/analytics internal specs use.
const build = (svc: AssistantService, args: Record<string, unknown>, ctx: Record<string, unknown>) =>
  (svc as unknown as { buildProposal: (n: string, a: unknown, c: unknown) => Promise<ProposedAction> })
    .buildProposal('create_task', args, ctx)

const apply = (svc: AssistantService, action: ProposedAction) =>
  (svc as unknown as {
    applyAction: (s: string, u: User, a: ProposedAction) => Promise<{ applied: boolean; summary: string }>
  }).applyAction('school-1', USER, action)

const CTX = { schoolId: 'school-1', periodId: 'period-1', userId: USER.id, user: USER, role: 'owner' }

describe('create_task — buildProposal (confirmable, no mutation)', () => {
  it('returns a create_task ProposedAction carrying the RAW (unresolved) assignee', async () => {
    const { svc, tasksCreate, membershipFindFirst } = makeService()
    const action = await build(
      svc,
      {
        title: '  Review overdue policy  ',
        assignee: 'jane@school.test',
        dueDate: '2026-08-01',
        priority: 'high',
        sourceType: 'policy',
        sourceRef: 'policy-9',
      },
      CTX,
    )
    expect(action.kind).toBe('create_task')
    expect(action.payload.title).toBe('Review overdue policy') // trimmed
    expect(action.payload.assignee).toBe('jane@school.test') // UNRESOLVED string
    expect(action.payload.dueDate).toBe('2026-08-01')
    expect(action.payload.priority).toBe('high')
    expect(action.payload.sourceType).toBe('policy')
    expect(action.payload.sourceRef).toBe('policy-9')
    expect(action.summary).toContain('Review overdue policy')
    expect(action.summary).toContain('jane@school.test')
    // NO MUTATION and NO membership lookup during buildProposal.
    expect(tasksCreate).not.toHaveBeenCalled()
    expect(membershipFindFirst).not.toHaveBeenCalled()
  })

  it('clamps an invalid briefing source (governance) to a valid TASK_SOURCE_TYPE', async () => {
    const { svc } = makeService()
    const action = await build(svc, { title: 'X', sourceType: 'governance' }, CTX)
    expect(action.payload.sourceType).toBe('manual')
  })

  it('throws when no title is given', async () => {
    const { svc } = makeService()
    await expect(build(svc, { title: '   ' }, CTX)).rejects.toThrow(/title/i)
  })
})

describe('create_task — applyAction (assignee resolution, real write)', () => {
  const baseAction = (payload: Record<string, unknown>): ProposedAction => ({
    kind: 'create_task',
    periodId: '',
    summary: 'Create task',
    payload,
  })

  it('assignee "me" → tasks.create receives the caller userId', async () => {
    const { svc, tasksCreate } = makeService()
    await apply(svc, baseAction({ title: 'T', assignee: 'me' }))
    expect(tasksCreate).toHaveBeenCalledTimes(1)
    const [schoolId, dto] = tasksCreate.mock.calls[0]
    expect(schoolId).toBe('school-1')
    expect((dto as { assigneeUserId?: string }).assigneeUserId).toBe(USER.id)
  })

  it('valid member email → resolves to that member userId, query scoped to schoolId', async () => {
    const { svc, tasksCreate, membershipFindFirst } = makeService({ member: { userId: 'u2' } })
    await apply(svc, baseAction({ title: 'T', assignee: 'Jane@School.test' }))
    const [dto] = tasksCreate.mock.calls[0].slice(1)
    expect((dto as { assigneeUserId?: string }).assigneeUserId).toBe('u2')
    // Tenant scope: the membership lookup filters by schoolId + active status.
    const where = membershipFindFirst.mock.calls[0][0].where
    expect(where.schoolId).toBe('school-1')
    expect(where.status).toBe('active')
  })

  it('unknown email (no active membership) → rejects with a clear error, create NOT called', async () => {
    const { svc, tasksCreate } = makeService({ member: null })
    await expect(apply(svc, baseAction({ title: 'T', assignee: 'ghost@x.test' }))).rejects.toThrow(
      /no active member/i,
    )
    expect(tasksCreate).not.toHaveBeenCalled()
  })

  it('omitted assignee → task is created unassigned (no assigneeUserId)', async () => {
    const { svc, tasksCreate } = makeService()
    await apply(svc, baseAction({ title: 'T' }))
    const [dto] = tasksCreate.mock.calls[0].slice(1)
    expect((dto as { assigneeUserId?: string }).assigneeUserId).toBeUndefined()
  })

  it('re-clamps a bad sourceType from an untrusted payload; passes valid ones through', async () => {
    const { svc, tasksCreate } = makeService()
    await apply(svc, baseAction({ title: 'T', sourceType: 'workflow' }))
    expect((tasksCreate.mock.calls[0].slice(1)[0] as { sourceType?: string }).sourceType).toBe('manual')
    tasksCreate.mockClear()
    await apply(svc, baseAction({ title: 'T', sourceType: 'compliance' }))
    expect((tasksCreate.mock.calls[0].slice(1)[0] as { sourceType?: string }).sourceType).toBe(
      'compliance',
    )
  })

  it('returns { applied: true, summary } (+ additive action-log fields)', async () => {
    const { svc } = makeService()
    const res = await apply(svc, baseAction({ title: 'T' }))
    // Backward-compatible core contract preserved; extra fields are additive. A
    // created task is reversible and carries its captured id.
    expect(res).toMatchObject({
      applied: true,
      summary: 'Create task',
      targetType: 'create_task',
      targetId: 't1',
      reversible: true,
    })
  })
})

describe('create_task — runToolCall routing (confirm-then-create)', () => {
  const toolCall = (args: Record<string, unknown>) => ({
    id: 'tc1',
    function: { name: 'create_task', arguments: JSON.stringify(args) },
  })
  const makeSinks = () => ({
    onChart: vi.fn(),
    onProposal: vi.fn(),
    onNavigate: vi.fn(),
    onApplied: vi.fn(),
    onGuide: vi.fn(),
  })
  const run = (svc: AssistantService, tc: unknown, ctx: unknown, sinks: unknown) =>
    (svc as unknown as {
      runToolCall: (t: unknown, c: unknown, s: unknown) => Promise<unknown>
    }).runToolCall(tc, ctx, sinks)

  it('owner: emits a proposal (onProposal) and does NOT apply/create', async () => {
    const { svc, tasksCreate } = makeService()
    const sinks = makeSinks()
    const res = (await run(svc, toolCall({ title: 'Do the thing' }), CTX, sinks)) as {
      proposed?: boolean
    }
    expect(res.proposed).toBe(true)
    expect(sinks.onProposal).toHaveBeenCalledTimes(1)
    expect(sinks.onApplied).not.toHaveBeenCalled()
    expect(tasksCreate).not.toHaveBeenCalled()
  })

  it('viewer: is refused (no edit access), no proposal, no create', async () => {
    const { svc, tasksCreate } = makeService()
    const sinks = makeSinks()
    const res = (await run(svc, toolCall({ title: 'X' }), { ...CTX, role: 'viewer' }, sinks)) as {
      error?: string
    }
    expect(res.error).toMatch(/edit access/i)
    expect(sinks.onProposal).not.toHaveBeenCalled()
    expect(tasksCreate).not.toHaveBeenCalled()
  })
})

describe('create_task — registry wiring', () => {
  it('is a registered tool with a status label', () => {
    const names = TOOL_SCHEMAS.map((t) => t.function.name)
    expect(names).toContain('create_task')
    expect(TOOL_LABELS.create_task).toBeTruthy()
  })
})
