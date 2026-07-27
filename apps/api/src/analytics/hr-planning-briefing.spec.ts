import { describe, expect, it } from 'vitest'
import { BriefingService } from './briefing.service.js'
import type { ResolvedPlanningSignals } from './planning-signals.js'

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6 — the 'hr' (STEP 2.14) + 'planning' (STEP 2.15) briefing steps.
// Verifies the module gates (fail-CLOSED), the completeness-only items
// (hr:fte-missing / planning:no-budget / planning:no-forecast /
// planning:plan-missing) with their working links, fail-soft reads (a failed
// PlanningSignals read emits NOTHING — never a false alarm), all-present
// silence, and the lens curation (planning KEPT for the board, hr DROPPED) —
// WITHOUT booting Nest or Prisma.
// ─────────────────────────────────────────────────────────────────────────────

const PERIOD = { id: 'period-1', label: 'FY 2026' }

/** The hr-gated teaching_staff_share result the FTE-completeness step reads.
 *  inputs[] mirrors the real metric: a key in inputsMissing carries value null
 *  (truly not entered) unless `inputs` overrides it (the entered-as-0 case). */
function shareMetric(over: {
  available: boolean
  inputsMissing?: string[]
  inputs?: { key: string; value: number | null }[]
}) {
  const missing = over.inputsMissing ?? []
  return {
    key: 'teaching_staff_share',
    label: 'Teaching Staff Share',
    unit: 'percent',
    available: over.available,
    value: over.available ? 0.7 : null,
    inputsMissing: missing,
    inputs:
      over.inputs ??
      ['teachingFte', 'totalStaffFte'].map((key) => ({
        key,
        label: key,
        value: missing.includes(key) ? null : 42,
        unit: 'ratio',
      })),
    status: over.available ? 'good' : 'neutral',
    goodDirection: 'higher',
  }
}

const ALL_SIGNALS: ResolvedPlanningSignals = {
  budgetTotalRevenue: 1000,
  budgetTotalExpense: 950,
  forecastTotalRevenue: 980,
  forecastTotalExpense: 960,
  hasBudget: true,
  hasForecast: true,
}

function makeService(over: {
  licensed?: string[]
  metrics?: unknown[]
  signals?: ResolvedPlanningSignals | null | (() => Promise<ResolvedPlanningSignals | null>)
  plan?: { planTotal: number } | null
  planFailed?: boolean
}) {
  const billing = {
    isEntitledForModule: async (_schoolId: string, module: string) =>
      (over.licensed ?? []).includes(module),
  }
  const periods = { getOwnedPeriod: async () => PERIOD }
  const analytics = { computeMetricsResponse: async () => ({ metrics: over.metrics ?? [] }) }
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
  const strategy = { getActivePlanComputed: async () => ({ hasPlan: false }) }
  const planningSignals = {
    resolve: async () => {
      if (typeof over.signals === 'function') return over.signals()
      return over.signals === undefined ? null : over.signals
    },
  }
  const enrollmentPlan = {
    resolve: async () => (over.plan === undefined ? null : over.plan),
    // Error-distinguishing surface STEP 2.15 actually consumes: `planFailed`
    // simulates a DB read error (plan null + failed → the item must be skipped).
    resolveDetailed: async () => ({
      plan: over.plan === undefined ? null : over.plan,
      failed: over.planFailed ?? false,
    }),
  }

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
    { arApAgingSnapshot: { findFirst: async () => null } } as never, // prisma
    planningSignals as never,
    enrollmentPlan as never,
  )
}

describe('briefing — hr STEP 2.14 (staffing data-completeness)', () => {
  it('MODULE GATE: not licensed → ZERO hr items even with missing FTEs', async () => {
    const svc = makeService({
      licensed: [],
      metrics: [shareMetric({ available: false, inputsMissing: ['teachingFte', 'totalStaffFte'] })],
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'hr')).toHaveLength(0)
  })

  it('licensed + FTEs missing → WARN hr:fte-missing linking /hr?tab=add', async () => {
    const svc = makeService({
      licensed: ['hr'],
      metrics: [shareMetric({ available: false, inputsMissing: ['totalStaffFte'] })],
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    const item = res.items.find((i) => i.id === 'hr:fte-missing')
    expect(item).toBeDefined()
    expect(item!.severity).toBe('warn')
    expect(item!.source).toBe('hr')
    expect(item!.link).toBe('/hr?tab=add')
    expect(item!.title).toContain(PERIOD.label)
  })

  it('licensed + totalStaffFte ENTERED AS 0 (divide guard, not absence) → NO false "not entered" item', async () => {
    const svc = makeService({
      licensed: ['hr'],
      metrics: [
        shareMetric({
          available: false,
          inputsMissing: ['totalStaffFte'], // the >0 divide guard flags it…
          inputs: [
            { key: 'teachingFte', value: 0 },
            { key: 'totalStaffFte', value: 0 }, // …but 0 IS entered
          ],
        }),
      ],
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'hr')).toHaveLength(0)
  })

  it('licensed + FTEs fully entered → NO hr item (honest non-signal)', async () => {
    const svc = makeService({ licensed: ['hr'], metrics: [shareMetric({ available: true })] })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'hr')).toHaveLength(0)
  })

  it('licensed but the share metric absent (gate hiccup upstream) → NO item, no 500', async () => {
    const svc = makeService({ licensed: ['hr'], metrics: [] })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'hr')).toHaveLength(0)
  })

  it('VIEWER (board) lens DROPS the hr item (operator data-entry chore)', async () => {
    const svc = makeService({
      licensed: ['hr'],
      metrics: [shareMetric({ available: false, inputsMissing: ['teachingFte'] })],
    })
    const owner = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(owner.items.some((i) => i.id === 'hr:fte-missing')).toBe(true)
    const viewer = await svc.getBriefing('school-1', PERIOD.id, 'viewer')
    expect(viewer.items.some((i) => i.id === 'hr:fte-missing')).toBe(false)
  })
})

describe('briefing — planning STEP 2.15 (planning-artifact completeness)', () => {
  it('MODULE GATE: not licensed → ZERO planning items', async () => {
    const svc = makeService({
      licensed: [],
      signals: { ...ALL_SIGNALS, hasBudget: false, hasForecast: false },
      plan: null,
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'planning')).toHaveLength(0)
  })

  it('nothing saved → all three WARN items with their links', async () => {
    const svc = makeService({
      licensed: ['planning'],
      signals: {
        budgetTotalRevenue: null, budgetTotalExpense: null,
        forecastTotalRevenue: null, forecastTotalExpense: null,
        hasBudget: false, hasForecast: false,
      },
      plan: null,
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    const byId = Object.fromEntries(res.items.map((i) => [i.id, i]))
    expect(byId['planning:no-budget']).toBeDefined()
    expect(byId['planning:no-budget'].link).toBe('/planning')
    expect(byId['planning:no-forecast']).toBeDefined()
    expect(byId['planning:no-forecast'].link).toBe('/planning')
    expect(byId['planning:plan-missing']).toBeDefined()
    expect(byId['planning:plan-missing'].link).toBe('/planning?tab=add')
    for (const id of ['planning:no-budget', 'planning:no-forecast', 'planning:plan-missing']) {
      expect(byId[id].severity).toBe('warn')
      expect(byId[id].source).toBe('planning')
    }
  })

  it('everything in place (budget + forecast + plan) → NO planning items', async () => {
    const svc = makeService({ licensed: ['planning'], signals: ALL_SIGNALS, plan: { planTotal: 100 } })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'planning')).toHaveLength(0)
  })

  it('budget saved, forecast + plan missing → exactly those two items', async () => {
    const svc = makeService({
      licensed: ['planning'],
      signals: { ...ALL_SIGNALS, forecastTotalRevenue: null, forecastTotalExpense: null, hasForecast: false },
      plan: null,
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    const ids = res.items.filter((i) => i.source === 'planning').map((i) => i.id).sort()
    expect(ids).toEqual(['planning:no-forecast', 'planning:plan-missing'])
  })

  it('FAIL-SOFT: enrollment-plan read ERRORS (resolveDetailed failed:true) → NO plan-missing item (absence unknown ≠ absent)', async () => {
    const svc = makeService({
      licensed: ['planning'],
      signals: ALL_SIGNALS,
      plan: null,
      planFailed: true,
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.some((i) => i.id === 'planning:plan-missing')).toBe(false)
  })

  it('FAIL-SOFT: PlanningSignals read fails (null) → NOTHING emitted (never a false alarm), no 500', async () => {
    const svc = makeService({ licensed: ['planning'], signals: null, plan: null })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'planning')).toHaveLength(0)
  })

  it('FAIL-SOFT: PlanningSignals read REJECTS → caught, no planning items, no 500', async () => {
    const svc = makeService({
      licensed: ['planning'],
      signals: () => Promise.reject(new Error('db down')),
      plan: null,
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'planning')).toHaveLength(0)
    expect(res.periodId).toBe(PERIOD.id)
  })

  it('VIEWER (board) lens KEEPS the planning items (fiduciary plan-health matter)', async () => {
    const svc = makeService({
      licensed: ['planning'],
      signals: { ...ALL_SIGNALS, hasBudget: false },
      plan: { planTotal: 100 },
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'viewer')
    expect(res.lens).toBe('viewer')
    expect(res.items.some((i) => i.id === 'planning:no-budget')).toBe(true)
  })

  it('BACK-COMPAT: positional-arg construction WITHOUT the new deps → no planning items, no throw', async () => {
    // Mirrors every pre-Phase-6 briefing spec: 15 args, stopping at prisma.
    const base = makeService({ licensed: ['planning'] })
    // Rebuild via the same helper then strip the new deps by constructing directly.
    void base
    const svc = new BriefingService(
      { getOwnedPeriod: async () => PERIOD } as never,
      { computeMetricsResponse: async () => ({ metrics: [] }) } as never,
      { evaluateForPeriod: async () => null } as never,
      { getChecklist: async () => null } as never,
      { reconcileForPeriod: async () => null } as never,
      { getPlan: async () => null } as never,
      { isEntitledForModule: async () => true } as never, // everything licensed
      { list: async () => ({ policies: [] }) } as never,
      { listMeetings: async () => ({ meetings: [], summary: { total: 0, upcomingCount: 0, agendaMissingSoonCount: 0, minutesPendingCount: 0, minutesOverdueCount: 0, nextMeetingAt: null, earliestMinutesPendingHeldAt: null } }) } as never,
      { listOpenForBriefing: async () => [] } as never,
      { listStandards: async () => ({ standards: [], summary: { total: 0, withEvidence: 0, gaps: 0, pctCovered: 0 } }) } as never,
      { listMaintenance: async () => ({ items: [], summary: { total: 0, openCount: 0, highPriorityOpenCount: 0, criticalOpen: 0, overdueOpen: 0, backlogCost: 0 } }) } as never,
      { listCampaigns: async () => ({ campaigns: [], summary: { total: 0, activeCount: 0, totalGoal: 0, totalRaised: 0, overallPctOfGoal: null, behindGoalActiveCount: 0, closingSoonActiveCount: 0, overdueActiveCount: 0 } }) } as never,
      { getActivePlanComputed: async () => ({ hasPlan: false }) } as never,
      { arApAgingSnapshot: { findFirst: async () => null } } as never,
    )
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    // Absent planningSignals dep → `?.` guard → resolves null → skip (fail-soft).
    expect(res.items.filter((i) => i.source === 'planning')).toHaveLength(0)
  })
})
