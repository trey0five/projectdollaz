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
  /** F6: a period WITH a periodEndDate, so the FY-bounded reading can resolve. */
  period?: Record<string, unknown>
  /** F6: register snapshots served through a FILTERING enrollmentSnapshot mock —
   *  it honors the observedOn gte/lte bounds the F3 query sends, so a cross-FY
   *  snapshot genuinely disappears rather than being returned regardless. */
  snapshots?: { observedOn: string; totalEnrolled: number; byGrade: Record<string, number> }[]
  /** F6: period_operational_data.enrollment for STEP 2.19 (null = no row). */
  promoted?: number | null
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
  const periods = { getOwnedPeriod: async () => over.period ?? PERIOD }
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

  const prisma: Record<string, unknown> = { arApAgingSnapshot: { findFirst: async () => null } }
  if (over.snapshots) {
    prisma.enrollmentSnapshot = {
      findFirst: async (q: {
        where: { observedOn?: { gte: Date; lte: Date } }
      }) => {
        const rows = over
          .snapshots!.map((s) => ({ ...s, observedOn: new Date(s.observedOn) }))
          .filter((s) => {
            const w = q.where.observedOn
            // A query with NO bounds returns everything — which is exactly how a
            // regression to the unbounded read would surface in case (c) below.
            if (!w?.gte || !w?.lte) return true
            return s.observedOn >= w.gte && s.observedOn <= w.lte
          })
          .sort((a, b) => b.observedOn.getTime() - a.observedOn.getTime())
        return rows[0] ?? null
      },
    }
  }
  if (over.promoted !== undefined) {
    prisma.periodOperationalData = {
      findUnique: async () => (over.promoted === null ? null : { enrollment: over.promoted }),
    }
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
    prisma as never, // prisma (LAST)
  )
}

// `source` is part of the resolved-plan contract (which store the plan came
// from), so the double declares it too rather than drifting from the real shape.
const plan = (
  planTotal: number,
  netRate: number | null,
  planByGrade: Record<string, number> = {},
) => ({
  planTotal,
  planByGrade,
  netRate,
  source: 'driver_budget' as const,
})

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

// ─────────────────────────────────────────────────────────────────────────────
// F6 — STEP 2.19 (the headcount reconciliation item) and the STEP 2.10 grade
// clause, end to end through getBriefing. The period carries a periodEndDate so
// the F3 FY-bound reading can resolve; the enrollmentSnapshot mock FILTERS on
// the observedOn bounds the query sends, so a cross-FY snapshot genuinely
// disappears — the unbounded-read regression would fail case (c), not slip by.
// FY (Jul–Jun) for this period: 2025-07-01 .. 2026-06-30.
// ─────────────────────────────────────────────────────────────────────────────

const FY_PERIOD = { id: 'period-1', label: 'FY 2026', periodEndDate: '2026-06-30' }

describe('F6 — STEP 2.19: two headcounts on file', () => {
  it('(a) diverged, same-FY snapshot → the info item fires with BOTH figures', async () => {
    const svc = makeService({
      licensed: true,
      period: FY_PERIOD,
      snapshots: [{ observedOn: '2026-05-01', totalEnrolled: 436, byGrade: {} }],
      promoted: 435,
    })
    const res = await svc.getBriefing('school-1', FY_PERIOD.id, 'owner')
    const item = res.items.find((i) => i.id === 'enrollment:reconciliation-divergence')
    expect(item).toBeDefined()
    expect(item!.severity).toBe('info')
    expect(item!.source).toBe('enrollment')
    // BOTH figures, through the item's own why — the model may phrase the
    // disagreement but there is no third number to reach for and no winner.
    expect(item!.why).toContain('435')
    expect(item!.why).toContain('436')
    expect(item!.why).toContain(FY_PERIOD.label)
    expect(item!.metricKey).toBeNull()
    expect(item!.value).toBeNull()
  })

  it('(b) the two AGREE → no item', async () => {
    const svc = makeService({
      licensed: true,
      period: FY_PERIOD,
      snapshots: [{ observedOn: '2026-05-01', totalEnrolled: 435, byGrade: {} }],
      promoted: 435,
    })
    const res = await svc.getBriefing('school-1', FY_PERIOD.id, 'owner')
    expect(res.items.find((i) => i.id === 'enrollment:reconciliation-divergence')).toBeUndefined()
  })

  it('(c) ★ a CROSS-FY snapshot only → NO item (pins F3: the FY bound is real)', async () => {
    // The only snapshot on file predates this period's fiscal year. Unbounded,
    // the old read returned it, compared it to this period's promote and fired a
    // PERMANENTLY false "two headcounts on file" on every historical briefing.
    const svc = makeService({
      licensed: true,
      period: FY_PERIOD,
      snapshots: [{ observedOn: '2024-09-15', totalEnrolled: 512, byGrade: {} }],
      promoted: 435,
    })
    const res = await svc.getBriefing('school-1', FY_PERIOD.id, 'owner')
    expect(res.items.find((i) => i.id === 'enrollment:reconciliation-divergence')).toBeUndefined()
  })

  it('a period with NO end date resolvable → no reading → silent (fail-soft)', async () => {
    const svc = makeService({
      licensed: true,
      period: { id: 'period-1', label: 'FY 2026' }, // older mock shape, no endDate
      snapshots: [{ observedOn: '2026-05-01', totalEnrolled: 436, byGrade: {} }],
      promoted: 435,
    })
    const res = await svc.getBriefing('school-1', 'period-1', 'owner')
    expect(res.items.find((i) => i.id === 'enrollment:reconciliation-divergence')).toBeUndefined()
  })
})

describe('F6 — the STEP 2.10 grade clause rides only a coherent pair', () => {
  // Below plan: promoted actual 90 against a plan of 100 (−10% → the item fires
  // in every case; only the CLAUSE is at stake).
  const PLAN_BY_GRADE = { '3': 25, '9': 45, '5': 31, K: 24, '4': 15 }
  const BY_GRADE = { '3': 18, '9': 40, '5': 30, K: 22, '4': 3 }

  it('(d) ★ below plan + DIVERGED → the headline stands ALONE, no grade clause', async () => {
    const svc = makeService({
      licensed: true,
      period: FY_PERIOD,
      signal: signal({ actual: 90, plan: plan(100, null, PLAN_BY_GRADE) }),
      // The register counts 91 — the clause's per-grade store disagrees with the
      // promoted store the headline used, so splitting one across the other
      // would be incoherent. STEP 2.19 carries the discrepancy instead.
      snapshots: [{ observedOn: '2026-05-01', totalEnrolled: 91, byGrade: BY_GRADE }],
      promoted: 90,
    })
    const res = await svc.getBriefing('school-1', FY_PERIOD.id, 'owner')
    const item = res.items.find((i) => i.id === 'enrollment:below-plan')
    expect(item).toBeDefined()
    expect(item!.why).not.toMatch(/largest gaps/)
    expect(item!.why).not.toMatch(/fewer than planned/)
    // The discrepancy is not swallowed — STEP 2.19 states it.
    expect(res.items.some((i) => i.id === 'enrollment:reconciliation-divergence')).toBe(true)
  })

  it('(e) below plan + AGREE → the clause names ≤2 grades, largest first, suppressed never', async () => {
    const svc = makeService({
      licensed: true,
      period: FY_PERIOD,
      signal: signal({ actual: 90, plan: plan(100, null, PLAN_BY_GRADE) }),
      snapshots: [{ observedOn: '2026-05-01', totalEnrolled: 90, byGrade: BY_GRADE }],
      promoted: 90,
    })
    const res = await svc.getBriefing('school-1', FY_PERIOD.id, 'owner')
    const item = res.items.find((i) => i.id === 'enrollment:below-plan')
    expect(item).toBeDefined()
    // Grade 4 is 12 short — the LARGEST gap — but holds three children, under
    // the cell floor: it must never be named on the surface that gets read
    // aloud. The two largest UNSUPPRESSED gaps follow, biggest first, phrased
    // as a person says them (n2: "Grade 3", never a bare "3").
    expect(item!.why).toMatch(
      /The largest gaps are in Grade 3 \(7 fewer than planned\) and Grade 9 \(5 fewer than planned\)\./,
    )
    expect(item!.why).not.toMatch(/Grade 4/)
    // …and the coherent pair emits no reconciliation item.
    expect(res.items.some((i) => i.id === 'enrollment:reconciliation-divergence')).toBe(false)
  })

  it('(e′) n2 — Kindergarten is named as a word, not a bare letter', async () => {
    const svc = makeService({
      licensed: true,
      period: FY_PERIOD,
      signal: signal({ actual: 90, plan: plan(100, null, { K: 30, '1': 26 }) }),
      snapshots: [
        { observedOn: '2026-05-01', totalEnrolled: 90, byGrade: { K: 21, '1': 25 } },
      ],
      promoted: 90,
    })
    const res = await svc.getBriefing('school-1', FY_PERIOD.id, 'owner')
    const item = res.items.find((i) => i.id === 'enrollment:below-plan')
    expect(item!.why).toMatch(/Kindergarten \(9 fewer than planned\)/)
    expect(item!.why).not.toMatch(/in K \(/)
  })
})
