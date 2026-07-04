import { describe, expect, it, vi } from 'vitest'
import { validateSync } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import type { User } from '@finrep/db'
import { AssistantService, type ProposedAction } from './assistant.service.js'
import { TOOL_SCHEMAS, TOOL_LABELS } from './assistant.tools.js'
import { ApplyActionDto } from './dto/apply-action.dto.js'

// ─────────────────────────────────────────────────────────────────────────────
// Penny invite_member slice — a CONFIRM tool (propose → confirm → /apply) that is
// additionally OWNER-ONLY (mirrors POST /schools/:id/invitations @Roles('owner')).
// Verifies (WITHOUT booting Nest/Prisma):
//   • buildProposal(invite_member) shape + NO mutation (schools.createInvitation
//     never called) + email/role validation
//   • applyAction routes to SchoolsService.createInvitation and captures the
//     created invitation id (reversible → Undo)
//   • authorization: an ACCOUNTANT (allowed on /apply generally) is rejected at
//     dispatch — inviting is owner-only; same for the revoke undo path
//   • anti-duplicate: an existing PENDING invitation is reused, no second email
//   • runToolCall: owner → onProposal (NOT applied); accountant → owner-only
//     error; viewer → no-edit-access error
//   • registry wiring: tool schema + status label + ApplyActionDto @IsIn accepts
//     the kind (the APPLY_KINDS sync gotcha)
// ─────────────────────────────────────────────────────────────────────────────

const USER = { id: 'caller-1', email: 'caller@school.test' } as unknown as User

function makeService(opts?: {
  callerRole?: 'owner' | 'accountant' | 'viewer' | null
  pendingInvite?: { id: string; role: string } | null
}) {
  const callerRole = opts?.callerRole === undefined ? 'owner' : opts.callerRole
  const pendingInvite = opts?.pendingInvite ?? null
  const createInvitation = vi.fn(async (schoolId: string, dto: unknown) => ({
    message: 'Invitation sent.',
    invitation: { id: 'inv1', email: (dto as { email: string }).email, role: (dto as { role: string }).role, expires_at: 'x' },
  }))
  const revokeInvitation = vi.fn(
    async (_actor: User, _schoolId: string, _invitationId: string) => ({
      message: 'Invitation revoked.',
    }),
  )
  const schools = { createInvitation, revokeInvitation }
  // resolveRole reads membership.findUnique; the dedup guard reads invitation.findFirst.
  const prisma = {
    membership: {
      findUnique: vi.fn(async () => (callerRole ? { role: callerRole, status: 'active' } : null)),
    },
    invitation: {
      findFirst: vi.fn(async () => pendingInvite),
    },
  }
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
    stub, // tasks
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
    schools as never, // schools (LAST)
  )
  return { svc, createInvitation, revokeInvitation, prisma }
}

const build = (svc: AssistantService, args: Record<string, unknown>, ctx: Record<string, unknown>) =>
  (svc as unknown as { buildProposal: (n: string, a: unknown, c: unknown) => Promise<ProposedAction> })
    .buildProposal('invite_member', args, ctx)

const apply = (svc: AssistantService, action: ProposedAction) =>
  (svc as unknown as {
    applyAction: (
      s: string,
      u: User,
      a: ProposedAction,
    ) => Promise<{ applied: boolean; targetId: string | null; reversible: boolean; summary: string }>
  }).applyAction('school-1', USER, action)

const reverse = (svc: AssistantService, targetId: string) =>
  (svc as unknown as {
    reverseApplied: (u: User, s: string, tool: string, t: string) => Promise<void>
  }).reverseApplied(USER, 'school-1', 'invite_member', targetId)

const CTX = { schoolId: 'school-1', periodId: 'period-1', userId: USER.id, user: USER, role: 'owner' }

const INVITE_ACTION: ProposedAction = {
  kind: 'invite_member',
  periodId: '',
  summary: 'Invite jane@school.org as accountant — they’ll receive an email invitation.',
  payload: { email: 'jane@school.org', role: 'accountant' },
}

describe('invite_member — buildProposal (confirmable, no mutation)', () => {
  it('builds a proposal carrying email/role, normalizes the email, no mutation', async () => {
    const { svc, createInvitation } = makeService()
    const action = await build(svc, { email: '  Jane@School.org ', role: 'accountant' }, CTX)
    expect(action.kind).toBe('invite_member')
    expect(action.payload).toMatchObject({ email: 'jane@school.org', role: 'accountant' })
    expect(action.payload.orgWide).toBeUndefined()
    expect(action.summary).toContain('jane@school.org')
    expect(action.summary).toContain('accountant')
    expect(createInvitation).not.toHaveBeenCalled()
  })

  it('orgWide: carried in the payload and reflected in the summary', async () => {
    const { svc } = makeService()
    const action = await build(svc, { email: 'jane@school.org', role: 'viewer', orgWide: true }, CTX)
    expect(action.payload).toMatchObject({ email: 'jane@school.org', role: 'viewer', orgWide: true })
    expect(action.summary).toContain('all schools in the organization')
  })

  it('rejects a missing/invalid email', async () => {
    const { svc } = makeService()
    await expect(build(svc, { role: 'viewer' }, CTX)).rejects.toThrow(/email/i)
    await expect(build(svc, { email: 'not-an-email', role: 'viewer' }, CTX)).rejects.toThrow(/email/i)
  })

  it('rejects a missing/unknown role', async () => {
    const { svc } = makeService()
    await expect(build(svc, { email: 'jane@school.org' }, CTX)).rejects.toThrow(/role/i)
    await expect(build(svc, { email: 'jane@school.org', role: 'admin' }, CTX)).rejects.toThrow(/role/i)
  })
})

describe('invite_member — applyAction (real write via SchoolsService)', () => {
  it('owner: calls schools.createInvitation and returns a reversible result with the invitation id', async () => {
    const { svc, createInvitation } = makeService({ callerRole: 'owner' })
    const res = await apply(svc, INVITE_ACTION)
    expect(createInvitation).toHaveBeenCalledTimes(1)
    const [schoolId, dto] = createInvitation.mock.calls[0]
    expect(schoolId).toBe('school-1')
    expect(dto).toMatchObject({ email: 'jane@school.org', role: 'accountant', orgWide: false })
    expect(res).toMatchObject({ applied: true, targetId: 'inv1', reversible: true })
  })

  it('accountant: rejected at dispatch (inviting is owner-only even though /apply allows accountants)', async () => {
    const { svc, createInvitation } = makeService({ callerRole: 'accountant' })
    await expect(apply(svc, INVITE_ACTION)).rejects.toThrow(/owner/i)
    expect(createInvitation).not.toHaveBeenCalled()
  })

  it('unresolved role: fails CLOSED (no membership → rejected)', async () => {
    const { svc, createInvitation } = makeService({ callerRole: null })
    await expect(apply(svc, INVITE_ACTION)).rejects.toThrow(/owner/i)
    expect(createInvitation).not.toHaveBeenCalled()
  })

  it('re-validates the untrusted payload (bad email / bad role → rejected)', async () => {
    const { svc, createInvitation } = makeService({ callerRole: 'owner' })
    await expect(
      apply(svc, { ...INVITE_ACTION, payload: { email: 'nope', role: 'accountant' } }),
    ).rejects.toThrow(/email/i)
    await expect(
      apply(svc, { ...INVITE_ACTION, payload: { email: 'jane@school.org', role: 'superuser' } }),
    ).rejects.toThrow(/role/i)
    expect(createInvitation).not.toHaveBeenCalled()
  })

  it('anti-duplicate: a pending invitation is reused — no second invitation/email', async () => {
    const { svc, createInvitation } = makeService({
      callerRole: 'owner',
      pendingInvite: { id: 'inv-existing', role: 'viewer' },
    })
    const res = await apply(svc, INVITE_ACTION)
    expect(createInvitation).not.toHaveBeenCalled()
    expect(res.targetId).toBe('inv-existing')
    expect(res.summary).toMatch(/pending invitation/i)
    expect(res.summary).toMatch(/didn’t send a duplicate/i)
  })
})

describe('invite_member — undo (revoke the pending invitation)', () => {
  it('owner: reverseApplied routes to schools.revokeInvitation', async () => {
    const { svc, revokeInvitation } = makeService({ callerRole: 'owner' })
    await reverse(svc, 'inv1')
    expect(revokeInvitation).toHaveBeenCalledTimes(1)
    const [actor, schoolId, invitationId] = revokeInvitation.mock.calls[0]
    expect(actor).toBe(USER)
    expect(schoolId).toBe('school-1')
    expect(invitationId).toBe('inv1')
  })

  it('accountant: undo is rejected (revoking is owner-only)', async () => {
    const { svc, revokeInvitation } = makeService({ callerRole: 'accountant' })
    await expect(reverse(svc, 'inv1')).rejects.toThrow(/owner/i)
    expect(revokeInvitation).not.toHaveBeenCalled()
  })
})

describe('invite_member — runToolCall routing (confirm-then-create, owner-only)', () => {
  const toolCall = (args: Record<string, unknown>) => ({
    id: 'tc1',
    function: { name: 'invite_member', arguments: JSON.stringify(args) },
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

  const ARGS = { email: 'jane@school.org', role: 'accountant' }

  it('owner: emits a proposal and does NOT apply/invite', async () => {
    const { svc, createInvitation } = makeService()
    const sinks = makeSinks()
    const res = (await run(svc, toolCall(ARGS), CTX, sinks)) as { proposed?: boolean }
    expect(res.proposed).toBe(true)
    expect(sinks.onProposal).toHaveBeenCalledTimes(1)
    expect(sinks.onApplied).not.toHaveBeenCalled()
    expect(createInvitation).not.toHaveBeenCalled()
  })

  it('accountant: refused with the owner-only message, no proposal, no invite', async () => {
    const { svc, createInvitation } = makeService({ callerRole: 'accountant' })
    const sinks = makeSinks()
    const res = (await run(svc, toolCall(ARGS), { ...CTX, role: 'accountant' }, sinks)) as {
      error?: string
    }
    expect(res.error).toMatch(/owner/i)
    expect(sinks.onProposal).not.toHaveBeenCalled()
    expect(createInvitation).not.toHaveBeenCalled()
  })

  it('viewer: refused (no edit access), no proposal, no invite', async () => {
    const { svc, createInvitation } = makeService({ callerRole: 'viewer' })
    const sinks = makeSinks()
    const res = (await run(svc, toolCall(ARGS), { ...CTX, role: 'viewer' }, sinks)) as {
      error?: string
    }
    expect(res.error).toMatch(/edit access/i)
    expect(sinks.onProposal).not.toHaveBeenCalled()
    expect(createInvitation).not.toHaveBeenCalled()
  })
})

describe('invite_member — registry wiring', () => {
  it('is a registered tool with a status label', () => {
    const names = TOOL_SCHEMAS.map((t) => t.function.name)
    expect(names).toContain('invite_member')
    expect(TOOL_LABELS.invite_member).toBeTruthy()
  })

  it('ApplyActionDto accepts kind invite_member (the APPLY_KINDS sync gotcha)', () => {
    const dto = plainToInstance(ApplyActionDto, {
      kind: 'invite_member',
      periodId: '',
      summary: 'Invite jane@school.org as accountant.',
      payload: { email: 'jane@school.org', role: 'accountant' },
    })
    expect(validateSync(dto)).toHaveLength(0)
  })
})
