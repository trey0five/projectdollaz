import { describe, expect, it, vi } from 'vitest'
import { AssistantService } from './assistant.service.js'
import { TOOL_SCHEMAS, TOOL_LABELS } from './assistant.tools.js'
import type { StrategyComputed } from '../strategy/strategy.types.js'

// ─────────────────────────────────────────────────────────────────────────────
// Penny read-only tool `get_plan_status`. Verifies (no Nest/Prisma boot; every dep
// a hand-mock): schema+label registered; the tool projects getActivePlanComputed
// into the compact model shape CARRYING metricKey+metricLabel per goal (so Penny can
// chain into get_trend/get_cash_flow); and the no-plan soft response. It is READ-ONLY
// (NOT in WRITE/CONFIRM) so it is offered to viewers too.
// ─────────────────────────────────────────────────────────────────────────────

const CTX = { schoolId: 'school-1', periodId: null, userId: 'user-1', user: {}, role: 'viewer' }
const SINKS = { onNavigate: vi.fn(), onGuide: vi.fn(), onProposal: vi.fn(), onStatus: vi.fn(), onChart: vi.fn(), onApplied: vi.fn() }

const COMPUTED: StrategyComputed = {
  hasPlan: true,
  plan: {
    id: 'plan-1', name: 'Strategic Plan 2026–2030', mission: 'Thrive', status: 'adopted',
    fyStartYear: 2026, fyEndYear: 2030, startDate: '2026-07-01', endDate: '2030-06-30', adoptedAt: '2026-01-01T00:00:00.000Z',
    nextReviewDate: '2027-07-01', overallProgressPct: 0.42, overallPaceStatus: 'at_risk',
    goalCounts: { total: 3, onTrack: 1, atRisk: 1, behind: 1, achieved: 0, noData: 0 }, dataAsOf: '2026-06-30T12:00:00.000Z',
  },
  summary: {
    overallProgressPct: 0.42, overallPaceStatus: 'at_risk', behindPaceGoalCount: 1, atRiskGoalCount: 1,
    staleInitiativeCount: 1, reviewDueThisMonth: false, nextReviewDate: '2027-07-01',
    behindPaceGoals: [{ title: 'Reach 10% operating margin', pillar: 'Sustainability', metricKey: 'operating_margin', metricLabel: 'Operating margin', formattedCurrent: '2.0%', formattedTarget: '10.0%', targetDate: '2028-06-30' }],
    staleInitiatives: [{ title: 'Launch capital campaign', ownerName: 'Jane Doe', status: 'in_progress', staleDays: 91 }],
  },
  pillars: [
    {
      id: 'pil-1', name: 'Sustainability', description: null, orderIndex: 0, progressPct: 0.2, paceStatus: 'behind',
      goalCounts: { total: 1, onTrack: 0, atRisk: 0, behind: 1, achieved: 0, noData: 0 },
      goals: [
        {
          id: 'g1', title: 'Reach 10% operating margin', description: null, goalType: 'metric', orderIndex: 0,
          owner: null, metricKey: 'operating_margin', metricLabel: 'Operating margin', unit: 'percent',
          baseline: 0.05, current: 0.02, target: 0.1, formattedBaseline: '5.0%', formattedCurrent: '2.0%', formattedTarget: '10.0%',
          pctToTarget: 0, expectedPct: 0.5, paceStatus: 'behind', bandStatus: 'risk', overshoot: false,
          startDate: '2026-07-01', targetDate: '2028-06-30', trend: [], dataAsOf: '2026-06-30T12:00:00.000Z',
          initiativeCount: 1, initiativeStatusCounts: { planned: 0, in_progress: 1, blocked: 0, done: 0, cancelled: 0 },
          linkedTaskCounts: null, milestones: null, manualProgressPct: null,
        },
      ],
    },
  ],
}

function makeService(computed: StrategyComputed) {
  const strategy = { getActivePlanComputed: vi.fn(async () => computed) }
  const periods = { listPeriods: vi.fn(async () => []), getOwnedPeriod: vi.fn(async () => { throw new Error('no period') }) }
  const prisma = { user: { findUnique: vi.fn(async () => ({ id: 'user-1' })) } }
  const stub = {} as never
  const args: unknown[] = Array(34).fill(stub)
  args[0] = prisma
  args[1] = periods
  args[33] = strategy // the LAST constructor param
  const svc = new (AssistantService as unknown as new (...a: unknown[]) => AssistantService)(...args)
  return { svc, strategy }
}

const run = (svc: AssistantService, ctx: Record<string, unknown>) =>
  (svc as unknown as {
    runToolCall: (tc: { id: string; function: { name: string; arguments: string } }, ctx: unknown, sinks: unknown) => Promise<unknown>
  }).runToolCall({ id: 't1', function: { name: 'get_plan_status', arguments: '{}' } }, ctx, SINKS)

describe('get_plan_status (read-only strategic-plan tool)', () => {
  it('is registered with a schema and a status label', () => {
    const schema = TOOL_SCHEMAS.find((t) => (t as { function?: { name?: string } }).function?.name === 'get_plan_status')
    expect(schema).toBeTruthy()
    expect(TOOL_LABELS.get_plan_status).toBeTruthy()
  })

  it('projects the active plan, carrying metricKey+metricLabel per goal', async () => {
    const { svc, strategy } = makeService(COMPUTED)
    const out = (await run(svc, CTX)) as {
      hasPlan: boolean
      plan: { name: string; overallProgressPct: number; overallPaceStatus: string }
      goalCounts: { behind: number }
      summary: { behindPaceGoalCount: number; staleInitiativeCount: number }
      pillars: { name: string; goals: { title: string; metricKey: string | null; metricLabel: string | null; paceStatus: string; formattedCurrent: string | null }[] }[]
      behindPaceGoals: { metricKey: string | null }[]
      staleInitiatives: { title: string }[]
    }
    expect(strategy.getActivePlanComputed).toHaveBeenCalledWith('school-1')
    expect(out.hasPlan).toBe(true)
    expect(out.plan.name).toBe('Strategic Plan 2026–2030')
    expect(out.plan.overallProgressPct).toBe(0.42)
    expect(out.plan.overallPaceStatus).toBe('at_risk')
    expect(out.goalCounts.behind).toBe(1)
    expect(out.summary.behindPaceGoalCount).toBe(1)
    expect(out.summary.staleInitiativeCount).toBe(1)
    const goal = out.pillars[0].goals[0]
    expect(goal.metricKey).toBe('operating_margin')
    expect(goal.metricLabel).toBe('Operating margin')
    expect(goal.paceStatus).toBe('behind')
    expect(goal.formattedCurrent).toBe('2.0%')
    expect(out.behindPaceGoals[0].metricKey).toBe('operating_margin')
    expect(out.staleInitiatives[0].title).toBe('Launch capital campaign')
  })

  it('no plan → soft { hasPlan:false } response (no throw)', async () => {
    const { svc } = makeService({ hasPlan: false })
    const out = (await run(svc, CTX)) as { hasPlan: boolean; note?: string }
    expect(out.hasPlan).toBe(false)
    expect(out.note).toMatch(/no strategic plan/i)
  })
})
