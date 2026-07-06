import { describe, expect, it, vi } from 'vitest'
import type { User } from '@finrep/db'
import { AssistantService, type ProposedAction } from './assistant.service.js'
import { TOOL_SCHEMAS, TOOL_LABELS } from './assistant.tools.js'

// ─────────────────────────────────────────────────────────────────────────────
// Penny submit_for_approval / decide_approval CONFIRM tools + list_open_tasks READ
// tool. Verifies (no Nest/Prisma boot; every dep a hand-mock):
//   • buildProposal shape + NO mutation (deferred resolution)
//   • applyAction re-resolves approvers ("me"/email) + re-validates, delegates to
//     tasks.submitForApproval / tasks.decide (which own the 403 identity gate)
//   • runToolCall routing: owner proposes (no apply); a viewer is refused
//     submit_for_approval but ALLOWED to be offered decide_approval (board-chair)
//   • list_open_tasks is a read tool routed to tasks.list (no confirm)
// ─────────────────────────────────────────────────────────────────────────────

const USER = { id: 'caller-1', email: 'caller@school.test' } as unknown as User
const A_TASK_ID = '11111111-1111-4111-8111-111111111111'

function makeService(opts: { member?: { userId: string } | null } = {}) {
  const membershipFindFirst = vi.fn(async () => opts.member ?? null)
  const prisma = { membership: { findFirst: membershipFindFirst } }
  const submitForApproval = vi.fn(
    async (_schoolId: string, _taskId: string, _ids: string[], _userId: string) => ({ id: A_TASK_ID }),
  )
  const decide = vi.fn(
    async (_schoolId: string, _taskId: string, _decision: string, _note: string | null, _user: User) => ({
      id: A_TASK_ID,
    }),
  )
  const list = vi.fn(async (_schoolId: string, filters: { status?: string }) => ({
    tasks:
      filters.status === 'open'
        ? [{ id: A_TASK_ID, title: 'Approve budget', status: 'open', approvalStatus: 'pending', approver: { email: 'chair@school.test' } }]
        : [],
  }))
  const tasks = { submitForApproval, decide, list }
  const stub = {} as never
  const svc = new AssistantService(
    // prisma, periods, analytics, budget, rollup, briefing, compliance, reconciliation,
    // correctiveAction, boardReport, operational, client, files, imports, monthlySnapshots, statements
    prisma as never, stub, stub, stub, stub, stub, stub, stub, stub, stub, stub, stub, stub, stub, stub, stub,
    tasks as never, // tasks
    stub, // documents
    stub, // documentStorage
    stub, stub, stub, stub, stub, stub, // policies, committees, meetings, accreditation, facilities, advancement
    stub, // orgBriefing
    stub, // audit
    stub, // alerts
    stub, // schools (LAST) — only invite_member paths touch it
    stub, // qboDrill (LAST) — only get_account_transactions touches it
  )
  return { svc, submitForApproval, decide, list, membershipFindFirst }
}

const build = (svc: AssistantService, name: string, args: Record<string, unknown>, ctx: Record<string, unknown>) =>
  (svc as unknown as { buildProposal: (n: string, a: unknown, c: unknown) => Promise<ProposedAction> })
    .buildProposal(name, args, ctx)

const apply = (svc: AssistantService, action: ProposedAction) =>
  (svc as unknown as {
    applyAction: (s: string, u: User, a: ProposedAction) => Promise<{ applied: boolean; summary: string }>
  }).applyAction('school-1', USER, action)

const CTX = { schoolId: 'school-1', periodId: 'period-1', userId: USER.id, user: USER, role: 'owner' }

describe('submit_for_approval — buildProposal (confirmable, no mutation)', () => {
  it('carries the RAW ordered approvers unresolved; no membership lookup', async () => {
    const { svc, submitForApproval, membershipFindFirst } = makeService()
    const action = await build(svc, 'submit_for_approval', { taskId: A_TASK_ID, approvers: ['me', 'chair@school.test'] }, CTX)
    expect(action.kind).toBe('submit_for_approval')
    expect(action.payload.taskId).toBe(A_TASK_ID)
    expect(action.payload.approvers).toEqual(['me', 'chair@school.test'])
    expect(action.summary).toContain('you')
    expect(submitForApproval).not.toHaveBeenCalled()
    expect(membershipFindFirst).not.toHaveBeenCalled()
  })

  it('rejects a bad taskId and an empty approver list', async () => {
    const { svc } = makeService()
    await expect(build(svc, 'submit_for_approval', { taskId: 'nope', approvers: ['me'] }, CTX)).rejects.toThrow(/taskId/i)
    await expect(build(svc, 'submit_for_approval', { taskId: A_TASK_ID, approvers: [] }, CTX)).rejects.toThrow(/approver/i)
  })
})

describe('submit_for_approval — applyAction (re-resolve + delegate)', () => {
  const action = (payload: Record<string, unknown>): ProposedAction => ({
    kind: 'submit_for_approval', periodId: '', summary: 'Route for sign-off', payload,
  })

  it('re-resolves "me"→caller + email→member (order preserved) then calls tasks.submitForApproval', async () => {
    const { svc, submitForApproval } = makeService({ member: { userId: 'u2' } })
    await apply(svc, action({ taskId: A_TASK_ID, approvers: ['me', 'jane@school.test'] }))
    expect(submitForApproval).toHaveBeenCalledTimes(1)
    const [schoolId, taskId, ids] = submitForApproval.mock.calls[0]
    expect(schoolId).toBe('school-1')
    expect(taskId).toBe(A_TASK_ID)
    expect(ids).toEqual([USER.id, 'u2']) // "me" first, then the resolved email
  })

  it('an unknown approver email → error, never submits', async () => {
    const { svc, submitForApproval } = makeService({ member: null })
    await expect(apply(svc, action({ taskId: A_TASK_ID, approvers: ['ghost@x.test'] }))).rejects.toThrow(/no active member/i)
    expect(submitForApproval).not.toHaveBeenCalled()
  })

  it('a forged bad taskId in the payload → error, never submits', async () => {
    const { svc, submitForApproval } = makeService()
    await expect(apply(svc, action({ taskId: 'forged', approvers: ['me'] }))).rejects.toThrow(/taskId/i)
    expect(submitForApproval).not.toHaveBeenCalled()
  })
})

describe('decide_approval — buildProposal + applyAction', () => {
  it('buildProposal validates decision; no mutation', async () => {
    const { svc, decide } = makeService()
    const action = await build(svc, 'decide_approval', { taskId: A_TASK_ID, decision: 'approve', note: 'ok' }, CTX)
    expect(action.kind).toBe('decide_approval')
    expect(action.payload.decision).toBe('approve')
    expect(action.payload.note).toBe('ok')
    expect(decide).not.toHaveBeenCalled()
    await expect(build(svc, 'decide_approval', { taskId: A_TASK_ID, decision: 'maybe' }, CTX)).rejects.toThrow(/approve or reject/i)
  })

  it('applyAction delegates to tasks.decide (which enforces the caller===approver 403)', async () => {
    const { svc, decide } = makeService()
    await apply(svc, { kind: 'decide_approval', periodId: '', summary: 'Approve', payload: { taskId: A_TASK_ID, decision: 'approve', note: 'good' } })
    expect(decide).toHaveBeenCalledTimes(1)
    const [schoolId, taskId, decision, note, u] = decide.mock.calls[0]
    expect(schoolId).toBe('school-1')
    expect(taskId).toBe(A_TASK_ID)
    expect(decision).toBe('approve')
    expect(note).toBe('good')
    expect(u).toBe(USER)
  })
})

describe('runToolCall routing (confirm-then-apply + read tool)', () => {
  const toolCall = (name: string, args: Record<string, unknown>) => ({
    id: 'tc1', function: { name, arguments: JSON.stringify(args) },
  })
  const makeSinks = () => ({ onChart: vi.fn(), onProposal: vi.fn(), onNavigate: vi.fn(), onApplied: vi.fn(), onGuide: vi.fn() })
  const run = (svc: AssistantService, tc: unknown, ctx: unknown, sinks: unknown) =>
    (svc as unknown as { runToolCall: (t: unknown, c: unknown, s: unknown) => Promise<unknown> }).runToolCall(tc, ctx, sinks)

  it('owner: submit_for_approval emits a proposal and does NOT apply', async () => {
    const { svc, submitForApproval } = makeService()
    const sinks = makeSinks()
    const res = (await run(svc, toolCall('submit_for_approval', { taskId: A_TASK_ID, approvers: ['me'] }), CTX, sinks)) as { proposed?: boolean }
    expect(res.proposed).toBe(true)
    expect(sinks.onProposal).toHaveBeenCalledTimes(1)
    expect(submitForApproval).not.toHaveBeenCalled()
  })

  it('viewer: submit_for_approval is refused (operator action)', async () => {
    const { svc } = makeService()
    const sinks = makeSinks()
    const res = (await run(svc, toolCall('submit_for_approval', { taskId: A_TASK_ID, approvers: ['me'] }), { ...CTX, role: 'viewer' }, sinks)) as { error?: string }
    expect(res.error).toMatch(/edit access/i)
    expect(sinks.onProposal).not.toHaveBeenCalled()
  })

  it('viewer: decide_approval IS offered (a board-chair approver may sign off)', async () => {
    const { svc } = makeService()
    const sinks = makeSinks()
    const res = (await run(svc, toolCall('decide_approval', { taskId: A_TASK_ID, decision: 'approve' }), { ...CTX, role: 'viewer' }, sinks)) as { proposed?: boolean }
    expect(res.proposed).toBe(true)
    expect(sinks.onProposal).toHaveBeenCalledTimes(1)
  })

  it('list_open_tasks: read-only, routed to tasks.list, no proposal/apply', async () => {
    const { svc, list } = makeService()
    const sinks = makeSinks()
    const res = (await run(svc, toolCall('list_open_tasks', {}), CTX, sinks)) as Array<{ id: string; approver: string | null }>
    expect(Array.isArray(res)).toBe(true)
    expect(res[0].id).toBe(A_TASK_ID)
    expect(res[0].approver).toBe('chair@school.test')
    expect(list).toHaveBeenCalled()
    expect(sinks.onProposal).not.toHaveBeenCalled()
  })
})

describe('registry wiring', () => {
  it('the three tools are registered with status labels', () => {
    const names = TOOL_SCHEMAS.map((t) => t.function.name)
    expect(names).toContain('submit_for_approval')
    expect(names).toContain('decide_approval')
    expect(names).toContain('list_open_tasks')
    expect(TOOL_LABELS.submit_for_approval).toBeTruthy()
    expect(TOOL_LABELS.decide_approval).toBeTruthy()
    expect(TOOL_LABELS.list_open_tasks).toBeTruthy()
  })
})
