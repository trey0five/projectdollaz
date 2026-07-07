import { describe, expect, it } from 'vitest'
import { BriefingService } from './briefing.service.js'
import type { StrategyComputed } from '../strategy/strategy.types.js'
import type { PaceStatus } from '../strategy/strategy-progress.js'

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 Strategic Planning — the 'strategy' briefing STEP (2.13). Verifies the
// module gate, the three plan-health items (goals-behind-pace / initiative-stale /
// plan-review-due), severity escalation, value-safe `why`, fail-soft, all-green
// silence, and the board (viewer) lens — WITHOUT booting Nest or Prisma.
// ─────────────────────────────────────────────────────────────────────────────

const PERIOD = { id: 'period-1', label: 'FY 2026' }
const CLEAN_METRICS = { metrics: [] as unknown[] }

const EMPTY_SUMMARY = {
  overallProgressPct: 0.5,
  overallPaceStatus: 'on_track' as PaceStatus,
  behindPaceGoalCount: 0,
  atRiskGoalCount: 0,
  staleInitiativeCount: 0,
  reviewDueThisMonth: false,
  nextReviewDate: null as string | null,
  behindPaceGoals: [] as unknown[],
  staleInitiatives: [] as unknown[],
}

function sp(over: Partial<typeof EMPTY_SUMMARY>): StrategyComputed {
  return {
    hasPlan: true,
    plan: {
      id: 'plan-1', name: 'Strategic Plan 2026–2030', mission: null, status: 'adopted',
      fyStartYear: 2026, fyEndYear: 2030, startDate: null, endDate: null, adoptedAt: null,
      nextReviewDate: over.nextReviewDate ?? null, overallProgressPct: over.overallProgressPct ?? 0.5,
      overallPaceStatus: 'on_track', goalCounts: { total: 0, onTrack: 0, atRisk: 0, behind: 0, achieved: 0, noData: 0 },
      dataAsOf: null,
    },
    summary: { ...EMPTY_SUMMARY, ...over },
    pillars: [],
  } as StrategyComputed
}

function makeService(over: {
  licensed?: boolean | (() => Promise<boolean>)
  computed?: StrategyComputed | (() => Promise<StrategyComputed>)
}) {
  const billing = {
    isEntitledForModule: async (_schoolId: string, module: string) => {
      if (module !== 'strategy') return false
      return typeof over.licensed === 'function' ? over.licensed() : (over.licensed ?? false)
    },
  }
  const strategy = {
    getActivePlanComputed: async () => {
      if (typeof over.computed === 'function') return over.computed()
      return over.computed ?? { hasPlan: false }
    },
  }
  const periods = { getOwnedPeriod: async () => PERIOD }
  const analytics = { computeMetricsResponse: async () => CLEAN_METRICS }
  const compliance = { evaluateForPeriod: async () => null }
  const reconciliation = { reconcileForPeriod: async () => null }
  const checklist = { getChecklist: async () => null }
  const corrective = { getPlan: async () => null }
  const policiesSvc = { list: async () => ({ policies: [] }) }
  const meetingsSvc = { listMeetings: async () => ({ meetings: [], summary: { total: 0, upcomingCount: 0, agendaMissingSoonCount: 0, minutesPendingCount: 0, minutesOverdueCount: 0, nextMeetingAt: null, earliestMinutesPendingHeldAt: null } }) }
  const tasks = { listOpenForBriefing: async () => [] }
  const accreditation = { listStandards: async () => ({ standards: [], summary: { total: 0, withEvidence: 0, gaps: 0, pctCovered: 0 } }) }
  const facilities = { listMaintenance: async () => ({ items: [], summary: { total: 0, openCount: 0, highPriorityOpenCount: 0, criticalOpen: 0, overdueOpen: 0, backlogCost: 0 } }) }
  const advancement = { listCampaigns: async () => ({ campaigns: [], summary: { total: 0, activeCount: 0, totalGoal: 0, totalRaised: 0, overallPctOfGoal: null, behindGoalActiveCount: 0, closingSoonActiveCount: 0, overdueActiveCount: 0 } }) }

  return new BriefingService(
    periods as never,
    analytics as never,
    compliance as never,
    checklist as never,
    reconciliation as never,
    corrective as never,
    billing as never,
    policiesSvc as never,
    meetingsSvc as never,
    tasks as never,
    accreditation as never,
    facilities as never,
    advancement as never,
    strategy as never,
    { arApAgingSnapshot: { findFirst: async () => null } } as never, // prisma (LAST)
  )
}

const behind = sp({
  overallProgressPct: 0.3,
  overallPaceStatus: 'behind',
  behindPaceGoalCount: 2,
  behindPaceGoals: [
    { title: 'Reach 10% operating margin', pillar: 'Sustainability', metricKey: 'operating_margin', metricLabel: 'Operating margin', formattedCurrent: '2.0%', formattedTarget: '10.0%', targetDate: '2028-06-30' },
  ] as never,
})

describe('briefing — strategy STEP 2.13', () => {
  it('MODULE GATE: not licensed → ZERO strategy items', async () => {
    const svc = makeService({ licensed: false, computed: behind })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'strategy')).toHaveLength(0)
  })

  it('licensed + behind goals → one critical goals-behind-pace item to /strategy, worst figures verbatim', async () => {
    const svc = makeService({ licensed: true, computed: behind })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    const it = res.items.find((i) => i.id === 'strategy:goals-behind-pace')
    expect(it).toBeDefined()
    expect(it!.severity).toBe('critical')
    expect(it!.source).toBe('strategy')
    expect(it!.link).toBe('/strategy')
    // value-safe: the worst goal's exact formatted figures appear in the why.
    expect(it!.why).toContain('2.0%')
    expect(it!.why).toContain('10.0%')
    expect(it!.metricKey).toBe('operating_margin')
  })

  it('at-risk only (no behind) → WARN goals-at-risk item', async () => {
    const svc = makeService({ licensed: true, computed: sp({ atRiskGoalCount: 1, overallPaceStatus: 'at_risk' }) })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    const it = res.items.find((i) => i.id === 'strategy:goals-behind-pace')
    expect(it).toBeDefined()
    expect(it!.severity).toBe('warn')
  })

  it('stale initiatives → WARN initiative-stale item naming the worst', async () => {
    const svc = makeService({ licensed: true, computed: sp({ staleInitiativeCount: 3, staleInitiatives: [{ title: 'Launch capital campaign', ownerName: 'Jane Doe', status: 'in_progress', staleDays: 91 }] as never }) })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    const it = res.items.find((i) => i.id === 'strategy:initiative-stale')
    expect(it).toBeDefined()
    expect(it!.severity).toBe('warn')
    expect(it!.why).toContain('Launch capital campaign')
    expect(it!.why).toContain('91')
  })

  it('review due this month → INFO plan-review-due item with dueDate', async () => {
    const svc = makeService({ licensed: true, computed: sp({ reviewDueThisMonth: true, nextReviewDate: '2026-07-31' }) })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    const it = res.items.find((i) => i.id === 'strategy:plan-review-due')
    expect(it).toBeDefined()
    expect(it!.severity).toBe('info')
    expect(it!.dueDate).toBe('2026-07-31')
  })

  it('all green (no behind/at-risk/stale/review) → NO strategy items (honest non-signal)', async () => {
    const svc = makeService({ licensed: true, computed: sp({}) })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'strategy')).toHaveLength(0)
  })

  it('no active plan (hasPlan:false) → NO strategy items', async () => {
    const svc = makeService({ licensed: true, computed: { hasPlan: false } })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'strategy')).toHaveLength(0)
  })

  it('FAIL-SOFT: getActivePlanComputed rejects → briefing still 200s, no strategy item', async () => {
    const svc = makeService({ licensed: true, computed: () => Promise.reject(new Error('db down')) })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'strategy')).toHaveLength(0)
    expect(res.periodId).toBe(PERIOD.id)
  })

  it('FAIL-SOFT: isEntitledForModule throws → treated as not-licensed, no 500', async () => {
    const svc = makeService({ licensed: () => Promise.reject(new Error('billing down')), computed: behind })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'strategy')).toHaveLength(0)
  })

  it('VIEWER (board) lens KEEPS the strategy item', async () => {
    const svc = makeService({ licensed: true, computed: behind })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'viewer')
    expect(res.lens).toBe('viewer')
    expect(res.items.some((i) => i.id === 'strategy:goals-behind-pace')).toBe(true)
  })
})
