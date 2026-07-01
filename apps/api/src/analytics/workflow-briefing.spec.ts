import { describe, expect, it } from 'vitest'
import { BriefingService } from './briefing.service.js'
import type { TaskPublic } from '../workflow/tasks.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 Workflow v1 — the 'workflow' briefing STEP. Verifies the CORE (ungated)
// open-task items, the warn→critical escalation, deterministic ranking, viewer-
// drop, and fail-soft — all WITHOUT booting Nest or Prisma (every dep is mocked).
// ─────────────────────────────────────────────────────────────────────────────

const PERIOD = { id: 'period-1', label: 'FY 2025' }
const CLEAN_METRICS = { metrics: [] as unknown[] }

function task(over: Partial<TaskPublic>): TaskPublic {
  return {
    id: over.id ?? 't1',
    title: over.title ?? 'Test Task',
    description: over.description ?? null,
    status: over.status ?? 'open',
    priority: over.priority ?? 'normal',
    assigneeUserId: over.assigneeUserId ?? null,
    assignee: over.assignee ?? null,
    dueDate: over.dueDate ?? null,
    sourceType: over.sourceType ?? null,
    sourceRef: over.sourceRef ?? null,
    createdByUserId: over.createdByUserId ?? null,
    completedAt: over.completedAt ?? null,
    urgency: over.urgency ?? 'on-track',
    daysUntilDue: over.daysUntilDue ?? null,
    createdAt: over.createdAt ?? '2025-01-01T00:00:00.000Z',
    updatedAt: over.updatedAt ?? '2025-01-01T00:00:00.000Z',
  }
}

/** Build a BriefingService with clean deps; `over.tasks` swaps the open-task read.
 *  Governance is left UNLICENSED so the ONLY items come from the workflow STEP. */
function makeService(over: {
  tasks?: TaskPublic[] | (() => Promise<TaskPublic[]>)
  metrics?: unknown
}) {
  const billing = { isEntitledForModule: async () => false }
  const policiesSvc = { list: async () => ({ policies: [] }) }
  const tasksSvc = {
    listOpenForBriefing: async () => {
      if (typeof over.tasks === 'function') return over.tasks()
      return over.tasks ?? []
    },
  }
  const periods = { getOwnedPeriod: async () => PERIOD }
  const analytics = { computeMetricsResponse: async () => over.metrics ?? CLEAN_METRICS }
  const compliance = { evaluateForPeriod: async () => null }
  const reconciliation = { reconcileForPeriod: async () => null }
  const checklist = { getChecklist: async () => null }
  const corrective = { getPlan: async () => null }

  return new BriefingService(
    periods as never,
    analytics as never,
    compliance as never,
    checklist as never,
    reconciliation as never,
    corrective as never,
    billing as never,
    policiesSvc as never,
    tasksSvc as never,
  )
}

describe('briefing — workflow STEP', () => {
  it('overdue open task → one warn "tasks-overdue" item to /tasks', async () => {
    const svc = makeService({
      tasks: [task({ id: 't1', urgency: 'overdue', daysUntilDue: -3, dueDate: '2026-06-28' })],
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    const wf = res.items.find((i) => i.id === 'workflow:tasks-overdue')
    expect(wf).toBeDefined()
    expect(wf!.severity).toBe('warn')
    expect(wf!.source).toBe('workflow')
    expect(wf!.link).toBe('/tasks')
    expect(wf!.dueDate).toBe('2026-06-28')
  })

  it('CORE, not module-gated: workflow items appear even though governance is UNLICENSED', async () => {
    const svc = makeService({
      tasks: [task({ id: 't1', urgency: 'overdue', daysUntilDue: -3, dueDate: '2026-06-28' })],
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.some((i) => i.source === 'workflow')).toBe(true)
    expect(res.items.some((i) => i.source === 'governance')).toBe(false)
  })

  it('badly overdue (<= -14d) escalates the overdue item to critical', async () => {
    const svc = makeService({
      tasks: [
        task({ id: 't1', urgency: 'overdue', daysUntilDue: -3, dueDate: '2026-06-28' }),
        task({ id: 't2', urgency: 'overdue', daysUntilDue: -20, dueDate: '2026-06-11' }),
      ],
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    const wf = res.items.find((i) => i.id === 'workflow:tasks-overdue')
    expect(wf!.severity).toBe('critical')
    // dueDate = earliest among overdue tasks.
    expect(wf!.dueDate).toBe('2026-06-11')
  })

  it('due-soon task → an info "tasks-due-soon" item', async () => {
    const svc = makeService({
      tasks: [task({ id: 't1', urgency: 'due-soon', daysUntilDue: 3, dueDate: '2026-07-04' })],
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    const wf = res.items.find((i) => i.id === 'workflow:tasks-due-soon')
    expect(wf).toBeDefined()
    expect(wf!.severity).toBe('info')
  })

  it('on-track / none tasks emit NO item (honest non-signal)', async () => {
    const svc = makeService({
      tasks: [task({ id: 't1', urgency: 'on-track' }), task({ id: 't2', urgency: 'none' })],
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'workflow')).toHaveLength(0)
  })

  it('FAIL-SOFT: listOpenForBriefing throws → briefing still 200s with no workflow item', async () => {
    const svc = makeService({ tasks: () => Promise.reject(new Error('db down')) })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'workflow')).toHaveLength(0)
    expect(res.periodId).toBe(PERIOD.id)
  })

  it('VIEWER (board) lens DROPS workflow items (operational chores)', async () => {
    const svc = makeService({
      tasks: [task({ id: 't1', urgency: 'overdue', daysUntilDue: -3, dueDate: '2026-06-28' })],
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'viewer')
    expect(res.lens).toBe('viewer')
    expect(res.items.some((i) => i.source === 'workflow')).toBe(false)
  })

  it('OWNER lens KEEPS workflow items', async () => {
    const svc = makeService({
      tasks: [task({ id: 't1', urgency: 'overdue', daysUntilDue: -3, dueDate: '2026-06-28' })],
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.some((i) => i.id === 'workflow:tasks-overdue')).toBe(true)
  })
})
