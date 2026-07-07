import { describe, expect, it } from 'vitest'
import { BriefingService } from './briefing.service.js'
import type { EnrollmentSignalInputs } from './analytics.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 Enrollment Intelligence — the cross-domain 'enrollment' briefing STEP
// (enrollment → tuition → cash). Verifies the module gate, the graceful-
// degradation ladder (full chain / no-cash / no-netrate / no-plan-skip), the gap-
// band severity, suppression of the plain metric:enrollment_vs_plan item, and the
// at/above-plan skip — all WITHOUT booting Nest or Prisma (every dep hand-mocked).
// ─────────────────────────────────────────────────────────────────────────────

const PERIOD = { id: 'period-1', label: 'FY 2026' }

/** A minimal MetricResult-ish for the metrics response STEP 1 / STEP 2.10 read. */
function metric(over: Record<string, unknown>) {
  return {
    key: over.key,
    label: over.label ?? 'Metric',
    unit: over.unit ?? 'percent',
    category: 'operational',
    goodDirection: 'higher',
    available: over.available ?? true,
    value: over.value ?? null,
    inputsMissing: [],
    periodOverPeriodDelta: null,
    status: over.status ?? 'neutral',
    bands: over.bands,
    inputs: over.inputs ?? [],
    ...over,
  }
}

/** days_cash_on_hand metric carrying its cash/totalExp inputs (annualized fallback). */
function daysCash(value: number, cash: number, totalExp: number) {
  return metric({
    key: 'days_cash_on_hand',
    label: 'Days Cash on Hand',
    unit: 'days',
    available: true,
    value,
    status: value < 30 ? 'risk' : value < 60 ? 'watch' : 'good',
    bands: { goodDirection: 'higher', good: 60, risk: 30 },
    inputs: [
      { key: 'cash', label: 'Unrestricted cash', value: cash, unit: 'currency', source: 'financials' },
      { key: 'totalExp', label: 'Total expenses', value: totalExp, unit: 'currency', source: 'financials' },
    ],
  })
}

function signal(over: Partial<EnrollmentSignalInputs>): EnrollmentSignalInputs {
  return {
    actual: over.actual ?? null,
    plan: over.plan ?? null,
    cash: over.cash ?? { openingCash: null, monthlyNetCashflow: null, annualExpense: null },
  }
}

function makeService(over: {
  licensed?: boolean | (() => Promise<boolean>)
  signal?: EnrollmentSignalInputs | (() => Promise<EnrollmentSignalInputs>) | 'absent'
  metrics?: unknown[]
}) {
  const billing = {
    isEntitledForModule: async () =>
      typeof over.licensed === 'function' ? over.licensed() : (over.licensed ?? false),
  }
  const analytics = {
    computeMetricsResponse: async () => ({ metrics: over.metrics ?? [] }),
    // 'absent' simulates an older analytics mock with no such method (STEP 2.10 must
    // tolerate it via optional-chaining and simply not produce an item).
    enrollmentSignalInputs:
      over.signal === 'absent'
        ? undefined
        : async () => (typeof over.signal === 'function' ? over.signal() : (over.signal ?? signal({}))),
  }
  const periods = { getOwnedPeriod: async () => PERIOD }
  const compliance = { evaluateForPeriod: async () => null }
  const reconciliation = { reconcileForPeriod: async () => null }
  const checklist = { getChecklist: async () => null }
  const corrective = { getPlan: async () => null }
  const policiesSvc = { list: async () => ({ policies: [] }) }
  const meetingsSvc = { listMeetings: async () => null }
  const tasks = { listOpenForBriefing: async () => [] }
  const accreditation = { listStandards: async () => ({ standards: [], summary: { total: 0, withEvidence: 0, gaps: 0, pctCovered: 0 } }) }
  const facilities = {
    listMaintenance: async () => ({
      items: [],
      summary: { total: 0, openCount: 0, highPriorityOpenCount: 0, criticalOpen: 0, overdueOpen: 0, backlogCost: 0 },
    }),
  }
  const advancement = {
    listCampaigns: async () => ({
      campaigns: [],
      summary: { total: 0, activeCount: 0, totalGoal: 0, totalRaised: 0, overallPctOfGoal: null, behindGoalActiveCount: 0, closingSoonActiveCount: 0, overdueActiveCount: 0 },
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
    { getActivePlanComputed: async () => ({ hasPlan: false }) } as never, // strategy
    { arApAgingSnapshot: { findFirst: async () => null } } as never, // prisma (LAST)
  )
}

const plan = (planTotal: number, netRate: number | null) => ({ planTotal, planByGrade: {}, netRate })

describe('briefing — enrollment STEP (cross-domain)', () => {
  it('MODULE GATE: not licensed → ZERO enrollment items', async () => {
    const svc = makeService({
      licensed: false,
      signal: signal({ actual: 90, plan: plan(100, 10000) }),
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'enrollment')).toHaveLength(0)
  })

  it('NO-PLAN SKIP: plan null → no item', async () => {
    const svc = makeService({ licensed: true, signal: signal({ actual: 90, plan: null }) })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'enrollment')).toHaveLength(0)
  })

  it('AT/ABOVE PLAN: actual >= plan → no item', async () => {
    const svc = makeService({ licensed: true, signal: signal({ actual: 100, plan: plan(100, 10000) }) })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'enrollment')).toHaveLength(0)
  })

  it('WITHIN 2%: a 1% shortfall is not flagged (only real shortfalls)', async () => {
    const svc = makeService({ licensed: true, signal: signal({ actual: 99, plan: plan(100, 10000) }) })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'enrollment')).toHaveLength(0)
  })

  it('NO-NETRATE branch: no plan netRate and no net-tuition metric → gap-only item', async () => {
    const svc = makeService({ licensed: true, signal: signal({ actual: 90, plan: plan(100, null) }) })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    const it = res.items.find((i) => i.id === 'enrollment:below-plan')
    expect(it).toBeDefined()
    expect(it!.source).toBe('enrollment')
    expect(it!.link).toBe('/enrollment')
    expect(it!.metricKey).toBe('enrollment_vs_plan')
    expect(it!.value).toBeCloseTo(-0.1, 12)
    expect(it!.why).not.toMatch(/less tuition/)
    expect(it!.why).not.toMatch(/days cash/)
  })

  it('NO-CASH branch: netRate present, no cash data → gap + tuition, no cash clause', async () => {
    const svc = makeService({ licensed: true, signal: signal({ actual: 90, plan: plan(100, 10000) }) })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    const it = res.items.find((i) => i.id === 'enrollment:below-plan')
    expect(it).toBeDefined()
    // gap −10 × 10000 = −$100,000 less tuition.
    expect(it!.why).toMatch(/less tuition this year/)
    expect(it!.why).toMatch(/\$100,000/)
    expect(it!.why).not.toMatch(/days cash/)
  })

  it('FULL CHAIN: netRate + driver cash → projectCashRunway breach month clause', async () => {
    const svc = makeService({
      licensed: true,
      signal: signal({
        actual: 90,
        plan: plan(100, 10000),
        // daily expense = 365000/365 = 1000 → 60-day floor = 60,000. Opening 100,000,
        // flat-zero monthly net, −100,000/yr shock spread ≈ −8,333/mo → breaches 60d.
        cash: { openingCash: 100_000, monthlyNetCashflow: Array.from({ length: 12 }, () => 0), annualExpense: 365_000 },
      }),
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    const it = res.items.find((i) => i.id === 'enrollment:below-plan')
    expect(it).toBeDefined()
    expect(it!.severity).toBe('critical') // −10% ≤ −5%
    expect(it!.why).toMatch(/less tuition this year/)
    expect(it!.why).toMatch(/days cash on hand would fall below 60 by/)
  })

  it('ANNUALIZED fallback: no monthly spread but days_cash metric → estimate clause', async () => {
    const svc = makeService({
      licensed: true,
      metrics: [daysCash(120, 200_000, 600_000)],
      signal: signal({
        actual: 97, // −3% → warn
        plan: plan(100, 10000),
        // No monthlyNetCashflow → projectCashRunway returns null → annualized branch.
        cash: { openingCash: null, monthlyNetCashflow: null, annualExpense: null },
      }),
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    const it = res.items.find((i) => i.id === 'enrollment:below-plan')
    expect(it).toBeDefined()
    expect(it!.severity).toBe('warn')
    expect(it!.why).toMatch(/days cash on hand would fall from 120 to ~/)
  })

  it('SEVERITY: a −3% shortfall is warn, a −8% shortfall is critical', async () => {
    const warn = await makeService({ licensed: true, signal: signal({ actual: 97, plan: plan(100, 5000) }) }).getBriefing('s', PERIOD.id, 'owner')
    expect(warn.items.find((i) => i.id === 'enrollment:below-plan')!.severity).toBe('warn')
    const crit = await makeService({ licensed: true, signal: signal({ actual: 92, plan: plan(100, 5000) }) }).getBriefing('s', PERIOD.id, 'owner')
    expect(crit.items.find((i) => i.id === 'enrollment:below-plan')!.severity).toBe('critical')
  })

  it('SUPPRESSION: the richer item replaces metric:enrollment_vs_plan', async () => {
    const svc = makeService({
      licensed: true,
      // An off-band enrollment_vs_plan metric → STEP 1 pushes metric:enrollment_vs_plan.
      metrics: [
        metric({
          key: 'enrollment_vs_plan',
          label: 'Enrollment vs Plan',
          unit: 'percent',
          available: true,
          value: -0.1,
          status: 'risk',
          bands: { goodDirection: 'higher', good: -0.02, risk: -0.05 },
          inputs: [],
        }),
      ],
      signal: signal({ actual: 90, plan: plan(100, 10000) }),
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.some((i) => i.id === 'metric:enrollment_vs_plan')).toBe(false)
    expect(res.items.some((i) => i.id === 'enrollment:below-plan')).toBe(true)
  })

  it('KEEPS metric:enrollment_change_yoy (a distinct signal)', async () => {
    const svc = makeService({
      licensed: true,
      metrics: [
        metric({ key: 'enrollment_change_yoy', label: 'Enrollment Change (YoY)', available: true, value: -0.08, status: 'risk', bands: { goodDirection: 'higher', good: 0, risk: -0.05 } }),
      ],
      signal: signal({ actual: 90, plan: plan(100, 10000) }),
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.some((i) => i.id === 'metric:enrollment_change_yoy')).toBe(true)
    expect(res.items.some((i) => i.id === 'enrollment:below-plan')).toBe(true)
  })

  it('FAIL-SOFT: an absent enrollmentSignalInputs method → no item, still 200s', async () => {
    const svc = makeService({ licensed: true, signal: 'absent' })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'enrollment')).toHaveLength(0)
    expect(res.periodId).toBe(PERIOD.id)
  })

  it('FAIL-SOFT: enrollmentSignalInputs throws → no item, still 200s', async () => {
    const svc = makeService({ licensed: true, signal: () => Promise.reject(new Error('db down')) })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'enrollment')).toHaveLength(0)
    expect(res.periodId).toBe(PERIOD.id)
  })

  it('VIEWER (board) lens KEEPS the enrollment item', async () => {
    const svc = makeService({ licensed: true, signal: signal({ actual: 90, plan: plan(100, 10000) }) })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'viewer')
    expect(res.lens).toBe('viewer')
    expect(res.items.some((i) => i.id === 'enrollment:below-plan')).toBe(true)
  })
})
