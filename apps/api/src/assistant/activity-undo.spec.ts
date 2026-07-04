import { describe, expect, it, vi } from 'vitest'
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import type { User } from '@finrep/db'
import { AssistantService } from './assistant.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// Penny action-log UNDO slice — undoActivity dispatch. Verifies (WITHOUT booting
// Nest/Prisma, every dep a hand-mock):
//   • not-reversible entry → 422 (UnprocessableEntityException), reverse NOT called
//   • tenant mismatch / non-applied row → 404, reverse NOT called
//   • happy path → routes to the mapped reverse method with (schoolId, id, userId),
//     writes the assistant.action.undone marker
//   • idempotency: an already-undone entry is a no-op (reverse NOT called again)
//   • a NotFound from the reverse (record already deleted elsewhere) → treated as an
//     already-undone no-op, marker still written (so double-undo stays a no-op)
// ─────────────────────────────────────────────────────────────────────────────

const USER = { id: 'caller-1', email: 'caller@school.test' } as unknown as User
const SCHOOL = 'school-1'

type AuditRow = {
  id: string
  schoolId: string
  action: string
  targetId: string | null
  targetType: string | null
  metadata: Record<string, unknown> | null
}

/** Build an AssistantService with only prisma.auditLog, policies.remove, and audit
 *  wired live; everything else an inert stub. `existingUndo` seeds findFirst (the
 *  idempotency marker lookup); `removeImpl` lets a test make the reverse throw. */
function makeService(opts: {
  row: AuditRow | null
  existingUndo?: { id: string } | null
  removeImpl?: (...a: unknown[]) => Promise<unknown>
}) {
  const findUnique = vi.fn(async () => opts.row)
  const findFirst = vi.fn(async () => opts.existingUndo ?? null)
  const auditLog = { findUnique, findFirst }
  const prisma = { auditLog }
  const policiesRemove = opts.removeImpl
    ? vi.fn(opts.removeImpl)
    : vi.fn(async (schoolId: string, id: string, userId: string) => ({ id, schoolId, userId }))
  const policies = { remove: policiesRemove }
  const auditWrite = vi.fn(async () => undefined)
  const audit = { write: auditWrite }

  const stub = {} as never
  const args: unknown[] = Array(27).fill(stub)
  args[0] = prisma
  args[19] = policies
  args[26] = audit
  const svc = new (AssistantService as unknown as new (...a: unknown[]) => AssistantService)(...args)
  return { svc, findUnique, findFirst, policiesRemove, auditWrite }
}

const applied = (over: Partial<AuditRow> = {}): AuditRow => ({
  id: 'audit-1',
  schoolId: SCHOOL,
  action: 'assistant.action.applied',
  targetId: 'policy-9',
  targetType: 'create_policy',
  metadata: { tool: 'create_policy', reversible: true, summary: 'Add a policy' },
  ...over,
})

describe('undoActivity — dispatch, gating, idempotency', () => {
  it('reverses a reversible entry via the mapped remove(schoolId, id, userId) + writes the undone marker', async () => {
    const { svc, policiesRemove, auditWrite } = makeService({ row: applied() })
    const res = await svc.undoActivity(SCHOOL, USER, 'audit-1')
    expect(res).toEqual({ undone: true })
    expect(policiesRemove).toHaveBeenCalledTimes(1)
    expect(policiesRemove).toHaveBeenCalledWith(SCHOOL, 'policy-9', USER.id)
    // Marker recorded so the log reflects it AND a second undo no-ops.
    expect(auditWrite).toHaveBeenCalledTimes(1)
    const entry = (auditWrite.mock.calls as unknown[][])[0][0] as { action: string; targetId: string }
    expect(entry.action).toBe('assistant.action.undone')
    expect(entry.targetId).toBe('audit-1')
  })

  it('rejects a NON-reversible entry with 422 and never calls the reverse', async () => {
    const { svc, policiesRemove } = makeService({
      row: applied({ metadata: { tool: 'set_budget', reversible: false, summary: 'Set budget' } }),
    })
    await expect(svc.undoActivity(SCHOOL, USER, 'audit-1')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    )
    expect(policiesRemove).not.toHaveBeenCalled()
  })

  it('404s when the entry is not this school’s (tenant check) — reverse not called', async () => {
    const { svc, policiesRemove } = makeService({ row: applied({ schoolId: 'other-school' }) })
    await expect(svc.undoActivity(SCHOOL, USER, 'audit-1')).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(policiesRemove).not.toHaveBeenCalled()
  })

  it('404s when the row is missing entirely', async () => {
    const { svc } = makeService({ row: null })
    await expect(svc.undoActivity(SCHOOL, USER, 'audit-1')).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('is idempotent: an already-undone entry is a no-op (reverse NOT called again)', async () => {
    const { svc, policiesRemove, auditWrite } = makeService({
      row: applied(),
      existingUndo: { id: 'undo-1' },
    })
    const res = await svc.undoActivity(SCHOOL, USER, 'audit-1')
    expect(res).toEqual({ undone: true, alreadyUndone: true })
    expect(policiesRemove).not.toHaveBeenCalled()
    expect(auditWrite).not.toHaveBeenCalled()
  })

  it('treats a NotFound from the reverse (record already deleted) as an already-undone no-op, still writing the marker', async () => {
    const { svc, auditWrite } = makeService({
      row: applied(),
      removeImpl: async () => {
        throw new NotFoundException('Policy not found.')
      },
    })
    const res = await svc.undoActivity(SCHOOL, USER, 'audit-1')
    expect(res).toEqual({ undone: true, alreadyUndone: true })
    expect(auditWrite).toHaveBeenCalledTimes(1)
  })

  it('propagates a non-NotFound error from the reverse (does NOT swallow real failures)', async () => {
    const { svc, auditWrite } = makeService({
      row: applied(),
      removeImpl: async () => {
        throw new Error('db exploded')
      },
    })
    await expect(svc.undoActivity(SCHOOL, USER, 'audit-1')).rejects.toThrow(/db exploded/)
    expect(auditWrite).not.toHaveBeenCalled()
  })
})
