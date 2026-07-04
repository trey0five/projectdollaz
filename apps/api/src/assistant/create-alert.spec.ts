import { describe, expect, it, vi } from 'vitest'
import type { User } from '@finrep/db'
import { AssistantService, type ProposedAction } from './assistant.service.js'
import { TOOL_SCHEMAS, TOOL_LABELS } from './assistant.tools.js'

// ─────────────────────────────────────────────────────────────────────────────
// Penny create_alert slice — a CONFIRM tool (propose → confirm → /apply). Verifies
// (WITHOUT booting Nest/Prisma):
//   • buildProposal(create_alert) shape + NO mutation (alerts.create never called)
//   • applyAction routes to AlertService.create and captures the created id
//     (reversible → Undo)
//   • runToolCall: owner → onProposal (NOT applied); viewer → no-edit-access error
//   • the tool is registered with a status label
// ─────────────────────────────────────────────────────────────────────────────

const USER = { id: 'caller-1', email: 'caller@school.test' } as unknown as User

function makeService() {
  const alertsCreate = vi.fn(async (schoolId: string, dto: unknown, userId?: string) => ({
    id: 'al1',
    schoolId,
    dto,
    userId,
  }))
  const alerts = { create: alertsCreate }
  const stub = {} as never
  const svc = new AssistantService(
    stub, // prisma
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
    alerts as never, // alerts (LAST)
  )
  return { svc, alertsCreate }
}

const build = (svc: AssistantService, args: Record<string, unknown>, ctx: Record<string, unknown>) =>
  (svc as unknown as { buildProposal: (n: string, a: unknown, c: unknown) => Promise<ProposedAction> })
    .buildProposal('create_alert', args, ctx)

const apply = (svc: AssistantService, action: ProposedAction) =>
  (svc as unknown as {
    applyAction: (
      s: string,
      u: User,
      a: ProposedAction,
    ) => Promise<{ applied: boolean; targetId: string | null; reversible: boolean }>
  }).applyAction('school-1', USER, action)

const CTX = { schoolId: 'school-1', periodId: 'period-1', userId: USER.id, user: USER, role: 'owner' }

describe('create_alert — buildProposal (confirmable, no mutation)', () => {
  it('digest: builds a digest proposal with a defaulted cadence, no mutation', async () => {
    const { svc, alertsCreate } = makeService()
    const action = await build(svc, { type: 'digest' }, CTX)
    expect(action.kind).toBe('create_alert')
    expect(action.payload.type).toBe('digest')
    expect(action.payload.cadence).toBe('weekly')
    expect(alertsCreate).not.toHaveBeenCalled()
  })

  it('threshold: carries metricKey/operator/threshold', async () => {
    const { svc } = makeService()
    const action = await build(
      svc,
      { type: 'threshold', metricKey: 'days_cash_on_hand', operator: 'lt', threshold: 30 },
      CTX,
    )
    expect(action.payload).toMatchObject({
      type: 'threshold',
      metricKey: 'days_cash_on_hand',
      operator: 'lt',
      threshold: 30,
    })
    expect(action.summary).toContain('days_cash_on_hand')
  })

  it('threshold: rejects an unknown metricKey', async () => {
    const { svc } = makeService()
    await expect(
      build(svc, { type: 'threshold', metricKey: 'made_up', operator: 'lt', threshold: 1 }, CTX),
    ).rejects.toThrow(/metricKey/i)
  })

  it('rejects a missing/invalid type', async () => {
    const { svc } = makeService()
    await expect(build(svc, { type: 'nonsense' }, CTX)).rejects.toThrow(/type/i)
  })
})

describe('create_alert — applyAction (real write via AlertService)', () => {
  it('calls alerts.create and returns a reversible result with the captured id', async () => {
    const { svc, alertsCreate } = makeService()
    const action: ProposedAction = {
      kind: 'create_alert',
      periodId: '',
      summary: 'Set up a weekly digest.',
      payload: { type: 'digest', cadence: 'weekly' },
    }
    const res = await apply(svc, action)
    expect(alertsCreate).toHaveBeenCalledTimes(1)
    const [schoolId, dto, userId] = alertsCreate.mock.calls[0]
    expect(schoolId).toBe('school-1')
    expect(userId).toBe(USER.id)
    expect((dto as { type?: string }).type).toBe('digest')
    expect(res).toMatchObject({ applied: true, targetType: 'create_alert', targetId: 'al1', reversible: true })
  })
})

describe('create_alert — runToolCall routing (confirm-then-create)', () => {
  const toolCall = (args: Record<string, unknown>) => ({
    id: 'tc1',
    function: { name: 'create_alert', arguments: JSON.stringify(args) },
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

  it('owner: emits a proposal and does NOT apply/create', async () => {
    const { svc, alertsCreate } = makeService()
    const sinks = makeSinks()
    const res = (await run(svc, toolCall({ type: 'digest' }), CTX, sinks)) as { proposed?: boolean }
    expect(res.proposed).toBe(true)
    expect(sinks.onProposal).toHaveBeenCalledTimes(1)
    expect(sinks.onApplied).not.toHaveBeenCalled()
    expect(alertsCreate).not.toHaveBeenCalled()
  })

  it('viewer: is refused (no edit access), no proposal, no create', async () => {
    const { svc, alertsCreate } = makeService()
    const sinks = makeSinks()
    const res = (await run(svc, toolCall({ type: 'digest' }), { ...CTX, role: 'viewer' }, sinks)) as {
      error?: string
    }
    expect(res.error).toMatch(/edit access/i)
    expect(sinks.onProposal).not.toHaveBeenCalled()
    expect(alertsCreate).not.toHaveBeenCalled()
  })
})

describe('create_alert — registry wiring', () => {
  it('is a registered tool with a status label', () => {
    const names = TOOL_SCHEMAS.map((t) => t.function.name)
    expect(names).toContain('create_alert')
    expect(TOOL_LABELS.create_alert).toBeTruthy()
  })
})
