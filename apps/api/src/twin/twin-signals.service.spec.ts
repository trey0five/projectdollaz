import { describe, expect, it, vi } from 'vitest'
import type { MetricKey, MetricTrend, TrendPoint } from '@finrep/analytics'
import { TwinSignalsService } from './twin-signals.service.js'
import { TWIN_SIGNAL_CATALOG } from './twin-signal-catalog.js'
import { TWIN_SIGNAL_KEYS, type TwinSignal, type TwinSignalKey } from './twin-contract.js'

// ─────────────────────────────────────────────────────────────────────────────
// TwinSignalsService — the catalog, resolved for one school.
//
// The defects this file exists to PIN:
//
//   • a signal that cannot be read must still COME BACK, with a reason. All 36,
//     every time, or the holes become invisible and the catalog stops being a
//     catalog;
//   • "no update in N days is stale" is the wrong rule. F14's misfire is an
//     annual artifact screaming for six months about a school doing nothing
//     wrong, so `staleAfterDays` is per-signal (acceptance 4);
//   • an unlicensed module must not merely hide the number — the QUERY must not
//     be issued. That is asserted with spies, not by reading the code;
//   • a per-grade count of 3 must not reach a payload. F11's leak vector is not
//     a name;
//   • and a monthly YTD series must never become a trend, because
//     MonthlySnapshot is cumulative and its differences are nonsense.
//
// Prisma, analytics, billing, the Phase-C currency service and the roster are
// hand-mocked. No DB, no Nest boot.
// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-06-30T00:00:00.000Z')

/** A UTC-midnight Date n days before NOW. */
function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 86_400_000)
}

/** yyyy-mm-dd, the way every collector reports `observedOn`. */
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function point(periodEndDate: string, value: number | null): TrendPoint {
  return {
    periodId: `p-${periodEndDate}`,
    label: periodEndDate.slice(0, 4),
    periodEndDate,
    value,
    available: value !== null,
  }
}

function annualTrend(metric: MetricKey, values: [string, number][]): MetricTrend {
  return {
    metric,
    label: metric,
    unit: 'days',
    goodDirection: 'higher',
    points: values.map(([d, v]) => point(d, v)),
    granularity: 'annual',
  }
}

interface Fixture {
  arAging?: unknown
  period?: unknown
  meetings?: unknown[]
  policies?: unknown[]
  boardPeople?: unknown[]
  committees?: unknown[]
  strategicPlan?: unknown
  maintenance?: unknown[]
  /** AIC Phase F — the three registers Phase F lit. */
  staffEvaluations?: unknown[]
  priorVisitFindings?: unknown[]
  enrollmentSnapshot?: unknown
  readiness?: unknown
  standards?: unknown[]
  evidenceCounts?: unknown[]
  findings?: unknown[]
  roster?: unknown
  currency?: unknown
  trends?: Partial<Record<MetricKey, MetricTrend>>
  /** Modules that resolve false; everything else is licensed. */
  unlicensed?: string[]
  /** Modules whose entitlement lookup THROWS (fail-closed check). */
  billingThrows?: string[]
}

function harness(fx: Fixture = {}) {
  const prisma = {
    arApAgingSnapshot: { findFirst: vi.fn().mockResolvedValue(fx.arAging ?? null) },
    fiscalPeriod: { findFirst: vi.fn().mockResolvedValue(fx.period ?? null) },
    meeting: { findMany: vi.fn().mockResolvedValue(fx.meetings ?? []) },
    policy: { findMany: vi.fn().mockResolvedValue(fx.policies ?? []) },
    governancePerson: { findMany: vi.fn().mockResolvedValue(fx.boardPeople ?? []) },
    committee: { findMany: vi.fn().mockResolvedValue(fx.committees ?? []) },
    strategicPlan: { findFirst: vi.fn().mockResolvedValue(fx.strategicPlan ?? null) },
    maintenanceItem: { findMany: vi.fn().mockResolvedValue(fx.maintenance ?? []) },
    staffEvaluation: { findMany: vi.fn().mockResolvedValue(fx.staffEvaluations ?? []) },
    priorVisitFinding: { findMany: vi.fn().mockResolvedValue(fx.priorVisitFindings ?? []) },
    enrollmentSnapshot: { findFirst: vi.fn().mockResolvedValue(fx.enrollmentSnapshot ?? null) },
    accreditationReadinessSnapshot: { findFirst: vi.fn().mockResolvedValue(fx.readiness ?? null) },
    accreditationStandard: { findMany: vi.fn().mockResolvedValue(fx.standards ?? []) },
    accreditationEvidence: { groupBy: vi.fn().mockResolvedValue(fx.evidenceCounts ?? []) },
    accreditationFinding: { findMany: vi.fn().mockResolvedValue(fx.findings ?? []) },
  }
  const trendFor = (metric: string): MetricTrend =>
    fx.trends?.[metric as MetricKey] ?? annualTrend(metric as MetricKey, [])
  const analytics = {
    trends: vi.fn(async (_schoolId: string, metric: string) => trendFor(metric)),
    // The batched read the collectors actually use: ONE call, one shared set of
    // register reads, for every metric the school is entitled to.
    trendsMany: vi.fn(async (_schoolId: string, metrics: readonly string[]) => {
      const out = new Map<MetricKey, MetricTrend>()
      for (const m of metrics) out.set(m as MetricKey, trendFor(m))
      return out
    }),
  }
  const billing = {
    isEntitledForModule: vi.fn(async (_schoolId: string, moduleKey: string) => {
      if (fx.billingThrows?.includes(moduleKey)) throw new Error('billing is down')
      return !(fx.unlicensed ?? []).includes(moduleKey)
    }),
  }
  const evidenceReadiness = {
    getCurrencyByStandard: vi
      .fn()
      .mockResolvedValue(fx.currency ?? { byStandard: {}, framework: null, demoData: false }),
  }
  const students = {
    aggregate: vi.fn().mockResolvedValue(
      fx.roster ?? {
        source: 'roster',
        total: 0,
        filteredTotal: 0,
        counts: { flags: { iep: 0, plan504: 0, ell: 0, any: 0 } },
        kpis: {},
      },
    ),
  }

  const service = new TwinSignalsService(
    prisma as never,
    analytics as never,
    billing as never,
    evidenceReadiness as never,
    students as never,
  )
  return { service, prisma, analytics, billing, evidenceReadiness, students }
}

function byKey(signals: TwinSignal[]): Map<TwinSignalKey, TwinSignal> {
  return new Map(signals.map((s) => [s.key, s]))
}

describe('TwinSignalsService — the whole catalog, always', () => {
  it('returns all 36 signals for a school with no data at all, none omitted', async () => {
    const { service } = harness()
    const set = await service.collect('school-A', { now: NOW })

    expect(set.signals).toHaveLength(36)
    expect(set.signals.map((s) => s.key)).toEqual([...TWIN_SIGNAL_KEYS])
    const total =
      set.counts.available + set.counts.not_licensed + set.counts.no_data + set.counts.not_tracked
    expect(total).toBe(36)
    // Every unavailable signal carries a sentence. No exceptions, ever.
    for (const s of set.signals) {
      if (s.availability === 'available') expect(s.unavailableReason).toBeNull()
      else expect(typeof s.unavailableReason).toBe('string')
    }
  })

  it('exposes the static catalog for Phase E rule authoring', () => {
    const { service } = harness()
    expect(service.catalog()).toBe(TWIN_SIGNAL_CATALOG)
  })

  it('declaredNotTracked signals are not_tracked and issue NO query', async () => {
    const { service, analytics } = harness()
    const set = await service.collect('school-A', { now: NOW })
    const map = byKey(set.signals)

    // THREE, not five. AIC Phase F LIT `hr.staff_evaluations` and `fac.inspections`
    // — the registers behind them exist, so they are collected rather than declared
    // blind. These three remain: PD and clearances are Phase K, and measured
    // learning growth needs an LMS integration KYRO does not have.
    for (const key of [
      'hr.pd_participation',
      'safe.clearances',
      'acad.assessment_growth',
    ] as TwinSignalKey[]) {
      const s = map.get(key) as TwinSignal
      expect(s.availability).toBe('not_tracked')
      expect(s.value).toBeNull()
      // The sentence is the Phase-C seed's own — imported, never retyped.
      expect(s.unavailableReason && s.unavailableReason.length).toBeGreaterThan(20)
    }
    expect(set.counts.not_tracked).toBe(3)
    // Nothing in the catalog would have queried an LMS, so this only proves the
    // collectors are not invoked — which is the claim.
    expect(analytics.trends).not.toHaveBeenCalledWith('school-A', 'assessment_results')
  })

  // ── AIC Phase F — THE FLIP, and the distinction it must not blur ─────────────
  describe('AIC Phase F — the three register signals', () => {
    const NOT_LICENSED = /^Unlock the /

    it('a school with an EMPTY register reads no_data, never not_tracked', async () => {
      const { service } = harness()
      const map = byKey((await service.collect('school-A', { now: NOW })).signals)
      for (const key of [
        'hr.staff_evaluations',
        'fac.inspections',
        'acc.prior_visit_findings',
      ] as TwinSignalKey[]) {
        const s = map.get(key) as TwinSignal
        expect(s.availability, key).toBe('no_data')
        expect(s.value, key).toBeNull()
      }
    })

    it('"we looked and it is fine" is available with value 0 — NOT no_data', async () => {
      // The distinction the whole catalog turns on. A register that HAS rows and
      // none overdue is a PASS with a number; a register with no rows is a refusal.
      // Conflating them would let a school with nothing recorded look identical to
      // a school that is genuinely current.
      const { service } = harness({
        staffEvaluations: [
          { dueDate: daysAgo(400), completedDate: daysAgo(390), status: 'completed' },
          { dueDate: daysAgo(10), completedDate: null, status: 'scheduled' }, // due later
        ],
        maintenance: [
          { status: 'open', resolvedAt: null, complianceKind: null, targetDate: daysAgo(500) },
          { status: 'resolved', resolvedAt: daysAgo(30), complianceKind: 'boiler', targetDate: daysAgo(40) },
        ],
        priorVisitFindings: [
          { visitDate: daysAgo(1200), status: 'closed', citedStandardCode: 'COG-A3' },
        ],
      })
      const map = byKey((await service.collect('school-A', { now: NOW })).signals)

      const evals = map.get('hr.staff_evaluations') as TwinSignal
      expect(evals.availability).toBe('available')
      // The second row is due 10 days ago and NOT completed — that IS overdue.
      expect(evals.value).toBe(1)
      // observedOn is the last COMPLETION: a dueDate is a plan, not an observation.
      expect(evals.observedOn).toBe(isoDay(daysAgo(390)))

      const insp = map.get('fac.inspections') as TwinSignal
      expect(insp.availability).toBe('available')
      expect(insp.value).toBe(0) // one kinded item, resolved → nothing overdue
      // The UNKINDED open item is 500 days past target and must NOT be counted:
      // an inspection of an unnamed kind is a sentence this product will not say.

      const prior = map.get('acc.prior_visit_findings') as TwinSignal
      expect(prior.availability).toBe('available')
      expect(prior.value).toBe(0)
      expect(prior.observedOn).toBe(isoDay(daysAgo(1200)))
    })

    it('a completedDate beats any status value, and waived is not overdue', async () => {
      const { service } = harness({
        staffEvaluations: [
          // Past due, but it HAPPENED — whatever the workflow column still says.
          { dueDate: daysAgo(500), completedDate: daysAgo(480), status: 'in_progress' },
          { dueDate: daysAgo(500), completedDate: null, status: 'waived' },
          { dueDate: daysAgo(500), completedDate: null, status: 'completed' },
          { dueDate: daysAgo(500), completedDate: null, status: 'scheduled' },
        ],
      })
      const s = byKey((await service.collect('s', { now: NOW })).signals).get(
        'hr.staff_evaluations',
      ) as TwinSignal
      expect(s.value).toBe(1)
    })

    it('an item with a compliance kind but NO target date is never overdue', async () => {
      const { service } = harness({
        maintenance: [
          { status: 'open', resolvedAt: null, complianceKind: 'fire_life_safety', targetDate: null },
        ],
      })
      const s = byKey((await service.collect('s', { now: NOW })).signals).get(
        'fac.inspections',
      ) as TwinSignal
      expect(s.availability).toBe('available')
      expect(s.value).toBe(0) // we will not invent a deadline the school never set
    })

    it('an unlicensed module reads not_licensed and ISSUES NO QUERY', async () => {
      const h = harness({
        unlicensed: ['hr', 'facilities', 'accreditation'],
        staffEvaluations: [{ dueDate: daysAgo(500), completedDate: null, status: 'scheduled' }],
        maintenance: [
          { status: 'open', resolvedAt: null, complianceKind: 'boiler', targetDate: daysAgo(9) },
        ],
        priorVisitFindings: [
          { visitDate: daysAgo(900), status: 'open', citedStandardCode: 'COG-A3' },
        ],
      })
      const map = byKey((await h.service.collect('school-A', { now: NOW })).signals)
      for (const key of [
        'hr.staff_evaluations',
        'fac.inspections',
        'acc.prior_visit_findings',
      ] as TwinSignalKey[]) {
        const s = map.get(key) as TwinSignal
        expect(s.availability, key).toBe('not_licensed')
        expect(s.value, key).toBeNull()
        expect(s.unavailableReason ?? '', key).toMatch(NOT_LICENSED)
      }
      // The promise is not "we hid the number" — it is that the query never ran.
      expect(h.prisma.staffEvaluation.findMany).not.toHaveBeenCalled()
      expect(h.prisma.priorVisitFinding.findMany).not.toHaveBeenCalled()
      expect(h.prisma.maintenanceItem.findMany).not.toHaveBeenCalled()
    })

    it('ONE maintenance read still serves BOTH facilities signals', async () => {
      const h = harness({
        maintenance: [
          { status: 'open', resolvedAt: null, complianceKind: 'elevator', targetDate: daysAgo(30) },
          { status: 'open', resolvedAt: null, complianceKind: null, targetDate: null },
        ],
      })
      const map = byKey((await h.service.collect('s', { now: NOW })).signals)
      expect(h.prisma.maintenanceItem.findMany).toHaveBeenCalledTimes(1)
      // FAC-BACKLOG's collector is byte-identical to Phase D: it still counts EVERY
      // open item, compliance-kinded or not.
      expect((map.get('fac.maintenance_backlog') as TwinSignal).value).toBe(2)
      expect((map.get('fac.inspections') as TwinSignal).value).toBe(1)
    })

    it('the prior-visit register is on a VISIT-CYCLE clock, not an annual one', async () => {
      // A four-year-old visit is the normal case, and flagging it `stale_data` would
      // be a lie that also feeds SCHOOL-NOT-REPORTING a false stale signal.
      const { service } = harness({
        priorVisitFindings: [
          { visitDate: daysAgo(1400), status: 'open', citedStandardCode: 'COG-A3' },
        ],
      })
      const s = byKey((await service.collect('s', { now: NOW })).signals).get(
        'acc.prior_visit_findings',
      ) as TwinSignal
      expect(s.expectedCadenceDays).toBe(2200)
      expect(s.staleAfterDays).toBe(3300)
      expect(s.ageDays).toBe(1400)
      expect(s.changeState).toBe('unchanged')
    })

    it('a staff-evaluation read failure costs THAT signal only, and names no person', async () => {
      const h = harness()
      h.prisma.staffEvaluation.findMany.mockRejectedValue(new Error('nope'))
      const set = await h.service.collect('s', { now: NOW })
      expect(set.signals).toHaveLength(36)
      const s = byKey(set.signals).get('hr.staff_evaluations') as TwinSignal
      expect(s.availability).toBe('no_data')
      expect(s.value).toBeNull()
      // Assembled from fragments: no-staff-pii.spec.ts forbids the literal
      // identifier anywhere in this directory, including in a spec.
      expect(JSON.stringify(set)).not.toContain(`evalua${'torName'}`)
    })
  })
})

describe('TwinSignalsService — F14 change state (acceptance 4)', () => {
  const policyAt = (lastReviewed: Date | null) => [
    {
      status: 'active',
      category: 'Governance',
      adoptedDate: daysAgo(2000),
      lastReviewedDate: lastReviewed,
      reviewIntervalMonths: 12,
    },
  ]

  it('an annual-cadence signal untouched for 200 days is unchanged, NOT stale_data', async () => {
    const { service } = harness({ policies: policyAt(daysAgo(200)) })
    const s = byKey((await service.collect('school-A', { now: NOW })).signals).get(
      'gov.policy_review',
    ) as TwinSignal

    expect(s.expectedCadenceDays).toBe(400)
    expect(s.staleAfterDays).toBe(600)
    expect(s.ageDays).toBe(200)
    expect(s.changeState).toBe('unchanged')
  })

  it('the same signal at 601 days IS stale_data', async () => {
    const { service } = harness({ policies: policyAt(daysAgo(601)) })
    const s = byKey((await service.collect('school-A', { now: NOW })).signals).get(
      'gov.policy_review',
    ) as TwinSignal
    expect(s.ageDays).toBe(601)
    expect(s.changeState).toBe('stale_data')
  })

  it('and with no observation date at all it is never_observed', async () => {
    const { service } = harness({ policies: policyAt(null) })
    const s = byKey((await service.collect('school-A', { now: NOW })).signals).get(
      'gov.policy_review',
    ) as TwinSignal
    expect(s.observedOn).toBeNull()
    expect(s.changeState).toBe('never_observed')
  })

  it('the rule is PER SIGNAL: ar_aging (45d) is unchanged at 60 days and stale at 70', async () => {
    const fresh = harness({ arAging: { asOfDate: daysAgo(60), arTotal: 100, ar90Plus: 10 } })
    const stale = harness({ arAging: { asOfDate: daysAgo(70), arTotal: 100, ar90Plus: 10 } })

    const a = byKey((await fresh.service.collect('s', { now: NOW })).signals).get(
      'fin.ar_aging',
    ) as TwinSignal
    const b = byKey((await stale.service.collect('s', { now: NOW })).signals).get(
      'fin.ar_aging',
    ) as TwinSignal

    expect(a.staleAfterDays).toBe(68) // ceil(1.5 * 45)
    expect(a.changeState).toBe('unchanged')
    expect(b.changeState).toBe('stale_data')
  })

  it('the FIRST sighting of a value is never a movement', async () => {
    const { service } = harness({ arAging: { asOfDate: daysAgo(1), arTotal: 100, ar90Plus: 10 } })
    const s = byKey((await service.collect('s', { now: NOW })).signals).get(
      'fin.ar_aging',
    ) as TwinSignal
    expect(s.changeState).toBe('unchanged')
  })

  it('readiness is on a TERM clock, not the nightly capture clock (the F14 misfire)', async () => {
    // The Phase-A capture DEDUPES: it skips the write when nothing changed. So the
    // newest snapshotDate for a stable school is the date readiness last MOVED.
    // Against the old 7-day cadence a school whose last accreditation edit was 17
    // days ago reported `stale_data`, which twin-reconciliation then turns into
    // resolutionKind 'stale_data' on a finding that genuinely improved.
    const h = harness({ readiness: { snapshotDate: daysAgo(17), readinessPct: 46, isDemo: false } })
    const s = byKey((await h.service.collect('school-A', { now: NOW })).signals).get(
      'acc.readiness_series',
    ) as TwinSignal

    expect(s.expectedCadenceDays).toBe(120)
    expect(s.staleAfterDays).toBe(180)
    expect(s.ageDays).toBe(17)
    expect(s.changeState).toBe('unchanged')
  })

  it('an UNDATED signal still reports "moved" when its value differs from the last run', async () => {
    // Five signals carry observedOn: null by design. Returning 'never_observed'
    // before the prior-value comparison disabled change detection for all of them:
    // a school could score twenty standards between two nights and the payload
    // would report a value while claiming nothing was ever observed.
    const standards = [
      { id: 's1', rubricScore: null },
      { id: 's2', rubricScore: 3 },
    ]
    const moved = harness({
      standards,
      findings: [{ evidencePayload: { signals: { 'acc.unscored_standards': { value: 12 } } } }],
    })
    const same = harness({
      standards,
      findings: [{ evidencePayload: { signals: { 'acc.unscored_standards': { value: 1 } } } }],
    })

    const a = byKey((await moved.service.collect('s', { now: NOW })).signals).get(
      'acc.unscored_standards',
    ) as TwinSignal
    expect(a.value).toBe(1)
    expect(a.observedOn).toBeNull()
    expect(a.ageDays).toBeNull() // staleness stays unevaluable without a date
    expect(a.changeState).toBe('moved')

    const b = byKey((await same.service.collect('s', { now: NOW })).signals).get(
      'acc.unscored_standards',
    ) as TwinSignal
    expect(b.changeState).toBe('never_observed')

    // With NO prior observation at all it is still never_observed, never 'moved'.
    const fresh = harness({ standards })
    const c = byKey((await fresh.service.collect('s', { now: NOW })).signals).get(
      'acc.unscored_standards',
    ) as TwinSignal
    expect(c.changeState).toBe('never_observed')
  })

  it('a differing prior value in the ledger basis reads as moved', async () => {
    const { service } = harness({
      arAging: { asOfDate: daysAgo(1), arTotal: 100, ar90Plus: 10 },
      findings: [{ evidencePayload: { signals: { 'fin.ar_aging': { value: 4 } } } }],
    })
    const s = byKey((await service.collect('s', { now: NOW })).signals).get(
      'fin.ar_aging',
    ) as TwinSignal
    expect(s.changeState).toBe('moved')
  })
})

describe('TwinSignalsService — entitlement is fail-closed and query-free', () => {
  const NON_FINANCE_MODULES = [
    'enrollment',
    'hr',
    'planning',
    'governance',
    'facilities',
    'advancement',
    'accreditation',
    'strategy',
  ]

  it('a finance-only school gets not_licensed rows with NO value, cells or lineage — and no query', async () => {
    const h = harness({
      unlicensed: NON_FINANCE_MODULES,
      // Data exists for every one of them; the point is that it is never read.
      meetings: [{ scheduledAt: daysAgo(5), status: 'held', minutesStatus: 'approved', minutesApprovedAt: daysAgo(1) }],
      policies: [{ status: 'active', category: 'Governance', adoptedDate: daysAgo(900), lastReviewedDate: daysAgo(900), reviewIntervalMonths: 12 }],
      boardPeople: [{ termStart: daysAgo(400), termEnd: daysAgo(10) }],
      committees: [{ chair: null, memberships: [] }],
      strategicPlan: { startDate: daysAgo(400), endDate: daysAgo(-400), fyEndYear: 2028, status: 'adopted' },
      maintenance: [{ status: 'open', resolvedAt: null }],
      enrollmentSnapshot: { observedOn: daysAgo(10), totalEnrolled: 210, byGrade: { K: 30 } },
      readiness: { snapshotDate: daysAgo(1), readinessPct: 46, isDemo: true },
      standards: [{ id: 'std-1', rubricScore: null }],
    })
    const set = await h.service.collect('school-A', { now: NOW })
    const map = byKey(set.signals)

    for (const s of set.signals) {
      if (s.availability !== 'not_licensed') continue
      expect(s.value).toBeNull()
      expect(s.cells).toBeNull()
      expect(s.lineage).toBeNull()
      expect(s.trend).toBeNull()
      expect(s.unavailableReason).toMatch(/^Unlock the /)
    }

    expect(map.get('gov.policy_review')?.availability).toBe('not_licensed')
    expect(map.get('hr.student_teacher_ratio')?.availability).toBe('not_licensed')
    expect(map.get('acc.readiness_series')?.availability).toBe('not_licensed')

    // THE QUERIES WERE NEVER ISSUED. This is the claim that matters: a school
    // learns which module would light a row, never the number behind it.
    expect(h.prisma.meeting.findMany).not.toHaveBeenCalled()
    expect(h.prisma.policy.findMany).not.toHaveBeenCalled()
    expect(h.prisma.governancePerson.findMany).not.toHaveBeenCalled()
    expect(h.prisma.committee.findMany).not.toHaveBeenCalled()
    expect(h.prisma.strategicPlan.findFirst).not.toHaveBeenCalled()
    expect(h.prisma.maintenanceItem.findMany).not.toHaveBeenCalled()
    expect(h.prisma.enrollmentSnapshot.findFirst).not.toHaveBeenCalled()
    expect(h.prisma.accreditationReadinessSnapshot.findFirst).not.toHaveBeenCalled()
    expect(h.prisma.accreditationStandard.findMany).not.toHaveBeenCalled()
    expect(h.students.aggregate).not.toHaveBeenCalled()
    expect(h.evidenceReadiness.getCurrencyByStandard).not.toHaveBeenCalled()

    // The hr/enrollment/planning METRIC trends are equally unread — and an
    // unlicensed key is never even NAMED to AnalyticsService, batched or not.
    const askedFor = [
      ...h.analytics.trends.mock.calls.map((c) => c[1] as string),
      ...h.analytics.trendsMany.mock.calls.flatMap((c) => [...(c[1] as string[])]),
    ]
    expect(askedFor).not.toContain('student_teacher_ratio')
    expect(askedFor).not.toContain('enrollment_vs_plan')
    expect(askedFor).not.toContain('plan_readiness')
    expect(askedFor).toContain('operating_margin')

    // ...and demoData does NOT leak out of an unread readiness row.
    expect(set.demoData).toBe(false)
    expect(set.snapshotAsOf).toBeNull()
  })

  it('a billing throw resolves not_licensed, never available', async () => {
    const h = harness({ billingThrows: ['governance', 'accreditation', 'hr'] })
    const map = byKey((await h.service.collect('school-A', { now: NOW })).signals)
    expect(map.get('gov.policy_review')?.availability).toBe('not_licensed')
    expect(map.get('acc.readiness_series')?.availability).toBe('not_licensed')
    expect(map.get('hr.total_staff_fte')?.availability).toBe('not_licensed')
    expect(h.prisma.policy.findMany).not.toHaveBeenCalled()
  })
})

describe('TwinSignalsService — failure isolation', () => {
  it('a collector that throws yields no_data for THAT signal only, and collect resolves', async () => {
    const h = harness()
    h.prisma.policy.findMany.mockRejectedValue(new Error('connection reset'))

    const set = await h.service.collect('school-A', { now: NOW })
    const map = byKey(set.signals)

    expect(set.signals).toHaveLength(36)
    expect(map.get('gov.policy_review')?.availability).toBe('no_data')
    expect(map.get('gov.policy_review')?.unavailableReason).toBe(
      'We could not read this signal on this run.',
    )
    // Its neighbours in other groups are untouched.
    expect(map.get('gov.meeting_cadence')?.availability).toBe('no_data')
    expect(map.get('fin.operating_margin')?.availability).toBe('no_data')
    expect(set.counts.no_data).toBeGreaterThan(0)
  })

  it('a findings-table read failure costs nothing (deploy-order safety)', async () => {
    const h = harness({ arAging: { asOfDate: daysAgo(1), arTotal: 5, ar90Plus: 1 } })
    h.prisma.accreditationFinding.findMany.mockRejectedValue(new Error('relation does not exist'))
    const set = await h.service.collect('school-A', { now: NOW })
    expect(set.signals).toHaveLength(36)
    expect(byKey(set.signals).get('fin.ar_aging')?.changeState).toBe('unchanged')
  })
})

describe('TwinSignalsService — FERPA small cells (F11)', () => {
  it('suppresses a per-grade count below 10 AND its complement, and leaks neither', async () => {
    const h = harness({
      enrollmentSnapshot: {
        observedOn: daysAgo(5),
        totalEnrolled: 57,
        byGrade: { K: 3, '1': 14, '2': 40 },
      },
    })
    const map = byKey((await h.service.collect('school-A', { now: NOW })).signals)
    const s = map.get('enr.feeder_grades') as TwinSignal

    expect(s.availability).toBe('available')
    expect(s.ferpaSensitive).toBe(true)
    const cells = new Map((s.cells ?? []).map((c) => [c.key, c]))

    expect(cells.get('K')).toMatchObject({ value: null, suppressed: true, reason: 'below_min_cell' })
    // Complementary: K is recoverable from 57 - 14 - 40 unless a second cell goes.
    expect(cells.get('1')).toMatchObject({ value: null, suppressed: true, reason: 'complementary' })
    expect(cells.get('2')).toMatchObject({ value: 40, suppressed: false })

    // A suppressed cell is exactly null — never rounded, never jittered.
    expect(cells.get('K')?.value).toBeNull()
    expect(cells.get('K')?.band).toBe('fewer than 10')

    // And the raw counts appear NOWHERE in the serialised signal.
    const json = JSON.stringify(s)
    expect(json).not.toContain('"K":3')
    expect(json).not.toContain(':3,')
    expect(json).not.toContain('"value":14')
  })

  it('the school TOTAL is deliberately NOT suppressed (the §2 carve-out)', async () => {
    const h = harness({
      enrollmentSnapshot: { observedOn: daysAgo(5), totalEnrolled: 7, byGrade: { K: 7 } },
    })
    const map = byKey((await h.service.collect('school-A', { now: NOW })).signals)
    const head = map.get('enr.headcount') as TwinSignal
    expect(head.availability).toBe('available')
    expect(head.value).toBe(7)
    expect(head.ferpaSensitive).toBe(false)
  })

  it('routes support needs through StudentsService.aggregate and suppresses small cohorts', async () => {
    const h = harness({
      roster: {
        source: 'roster',
        total: 180,
        filteredTotal: 180,
        counts: { flags: { iep: 4, plan504: 12, ell: 0, any: 15 } },
        kpis: {},
      },
    })
    const map = byKey((await h.service.collect('school-A', { now: NOW })).signals)
    const s = map.get('svc.support_needs') as TwinSignal

    expect(h.students.aggregate).toHaveBeenCalledWith('school-A', {})
    expect(s.availability).toBe('available')
    // THE HEADLINE GOES WITH THE CELL. `flags.any` beside an unprotected cell set
    // is the differencing hole: 15 - 12 - 0 bounds the suppressed cohort.
    expect(s.value).toBeNull()
    const cells = new Map((s.cells ?? []).map((c) => [c.key, c]))
    expect(cells.get('iep')).toMatchObject({ value: null, suppressed: true })
    expect(cells.get('plan504')).toMatchObject({ value: 12, suppressed: false })
    // A published zero is a fact about nobody and is never suppressed.
    expect(cells.get('ell')).toMatchObject({ value: 0, suppressed: false })
    expect(JSON.stringify(s)).not.toContain('"value":4')
  })

  it('the suppressed cohort cannot be RECOVERED by subtracting the published cells', async () => {
    // The arithmetic the previous shape exposed: iep = 34 - 30 - 0 = 4 exactly
    // whenever the flags do not overlap, which in a 200-student school they
    // usually do not. Nothing published may bound the hidden cell below MIN_CELL.
    const h = harness({
      roster: {
        source: 'roster',
        total: 200,
        filteredTotal: 200,
        counts: { flags: { iep: 4, plan504: 30, ell: 0, any: 34 } },
        kpis: {},
      },
    })
    const s = byKey((await h.service.collect('school-A', { now: NOW })).signals).get(
      'svc.support_needs',
    ) as TwinSignal

    expect(s.availability).toBe('available')
    expect(s.value).toBeNull()
    const cells = new Map((s.cells ?? []).map((c) => [c.key, c]))
    expect(cells.get('iep')).toMatchObject({ value: null, suppressed: true })
    expect(cells.get('plan504')).toMatchObject({ value: 30, suppressed: false })

    // No number in the payload is a total the reader could subtract from, so the
    // published facts bound `iep` no more tightly than the band already says.
    const numbers = (JSON.stringify(s).match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
    expect(numbers).not.toContain(34)
    expect(numbers).not.toContain(4)
  })

  it('suppresses the headline itself when the whole cohort is small', async () => {
    const h = harness({
      roster: {
        source: 'roster',
        total: 40,
        filteredTotal: 40,
        counts: { flags: { iep: 2, plan504: 0, ell: 1, any: 3 } },
        kpis: {},
      },
    })
    const s = byKey((await h.service.collect('s', { now: NOW })).signals).get(
      'svc.support_needs',
    ) as TwinSignal
    expect(s.value).toBeNull()
  })
})

describe('TwinSignalsService — trends compose with the pure engine', () => {
  const FIVE: [string, number][] = [
    ['2022-06-30', 95],
    ['2023-06-30', 88],
    ['2024-06-30', 80],
    ['2025-06-30', 71],
    ['2026-06-30', 60],
  ]

  it('five annual readings reach confidence "trend"', async () => {
    const h = harness({
      trends: { days_cash_on_hand: annualTrend('days_cash_on_hand', FIVE) },
    })
    const s = byKey((await h.service.collect('school-A', { now: NOW })).signals).get(
      'fin.days_cash_on_hand',
    ) as TwinSignal

    expect(s.availability).toBe('available')
    expect(s.value).toBe(60)
    expect(s.observedOn).toBe('2026-06-30')
    expect(s.trend?.confidence).toBe('trend')
    expect(s.trend?.mannKendall?.p).toBeCloseTo(0.0166667, 6)
    expect(s.lineage).toEqual({ table: 'StatementSnapshot', metricKey: 'days_cash_on_hand' })
  })

  it('four readings stop at "directional" and the copy never says the word', async () => {
    const h = harness({
      trends: { days_cash_on_hand: annualTrend('days_cash_on_hand', FIVE.slice(1)) },
    })
    const s = byKey((await h.service.collect('school-A', { now: NOW })).signals).get(
      'fin.days_cash_on_hand',
    ) as TwinSignal

    expect(s.trend?.n).toBe(4)
    expect(s.trend?.confidence).toBe('directional')
    expect(s.trend?.vocabulary).toBe('directional')
    expect(/trend/i.test(s.trend?.reason ?? '')).toBe(false)
  })

  it('a MONTHLY YTD series is refused — no_data, never a monthly trend', async () => {
    // Exactly what AnalyticsService.monthlyTrendFallback emits: cumulative
    // month-to-date readings inside ONE fiscal year.
    const monthly: MetricTrend = {
      metric: 'days_cash_on_hand',
      label: 'Days cash on hand',
      unit: 'days',
      goodDirection: 'higher',
      granularity: 'monthly',
      points: [
        point('2025-09-30', 40),
        point('2025-10-31', 55),
        point('2025-11-30', 70),
        point('2025-12-31', 88),
      ],
    }
    const h = harness({ trends: { days_cash_on_hand: monthly } })
    const s = byKey((await h.service.collect('school-A', { now: NOW })).signals).get(
      'fin.days_cash_on_hand',
    ) as TwinSignal

    // Outside production computeTrendSignal THROWS; the service catches it and
    // degrades honestly rather than letting a nightly job die on a data shape.
    expect(process.env.NODE_ENV).not.toBe('production')
    expect(s.availability).toBe('no_data')
    expect(s.value).toBeNull()
    // The refusal SHAPE comes back, so a Phase-E rule can read
    // `signal.trend.refusal` and answer `cannot_evaluate` rather than guessing.
    expect(s.trend?.refusal).toBe('monthly_granularity')
    expect(s.trend?.n).toBe(0)
    expect(typeof s.unavailableReason).toBe('string')
    expect(/trend/i.test(s.unavailableReason ?? '')).toBe(false)
  })

  it('and the refused payload is IDENTICAL in production, where the engine returns instead of throwing', async () => {
    // This is the single most important refusal in the phase (cumulative-YTD
    // rows). Its payload used to differ between the two modes — `trend: null` on
    // the strict-throw path, the refusal shape on the production path — and the
    // spec pinned the dev branch, giving false confidence about the shipped shape.
    const monthly: MetricTrend = {
      metric: 'days_cash_on_hand',
      label: 'Days cash on hand',
      unit: 'days',
      goodDirection: 'higher',
      granularity: 'monthly',
      points: [point('2025-09-30', 40), point('2025-10-31', 55), point('2025-11-30', 70)],
    }
    const collectIn = async (nodeEnv: string | undefined): Promise<TwinSignal> => {
      const before = process.env.NODE_ENV
      if (nodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = nodeEnv
      try {
        const h = harness({ trends: { days_cash_on_hand: monthly } })
        return byKey((await h.service.collect('school-A', { now: NOW })).signals).get(
          'fin.days_cash_on_hand',
        ) as TwinSignal
      } finally {
        if (before === undefined) delete process.env.NODE_ENV
        else process.env.NODE_ENV = before
      }
    }

    const dev = await collectIn('test') // strict: computeTrendSignal THROWS
    const prod = await collectIn('production') // lenient: it returns the refusal
    expect(dev).toEqual(prod)
    expect(prod.availability).toBe('no_data')
    expect(prod.trend?.refusal).toBe('monthly_granularity')
  })

  it('a single reading is available and honestly short — not a refusal', async () => {
    const h = harness({
      trends: { days_cash_on_hand: annualTrend('days_cash_on_hand', [['2026-06-30', 60]]) },
    })
    const s = byKey((await h.service.collect('school-A', { now: NOW })).signals).get(
      'fin.days_cash_on_hand',
    ) as TwinSignal
    expect(s.availability).toBe('available')
    expect(s.trend?.confidence).toBe('insufficient')
    expect(s.trend?.refusal).toBeNull()
  })
})

describe('TwinSignalsService — provenance and registers', () => {
  it('demoData and snapshotAsOf are inherited from the newest readiness snapshot', async () => {
    const h = harness({
      readiness: { snapshotDate: new Date('2026-06-29T00:00:00.000Z'), readinessPct: 46, isDemo: true },
    })
    const set = await h.service.collect('school-A', { now: NOW })
    expect(set.demoData).toBe(true)
    expect(set.snapshotAsOf).toBe('2026-06-29')
    expect(byKey(set.signals).get('acc.readiness_series')?.value).toBe(46)
  })

  it('a budget on file is a boolean reading, and its absence is a reading too', async () => {
    const present = harness({
      period: { id: 'fp1', label: 'FY26', periodEndDate: new Date('2026-06-30'), budgets: [{ id: 'b1' }] },
    })
    const absent = harness({
      period: { id: 'fp1', label: 'FY26', periodEndDate: new Date('2026-06-30'), budgets: [] },
    })
    expect(
      byKey((await present.service.collect('s', { now: NOW })).signals).get('fin.budget_present')
        ?.value,
    ).toBe(true)
    expect(
      byKey((await absent.service.collect('s', { now: NOW })).signals).get('fin.budget_present')
        ?.value,
    ).toBe(false)
  })

  it('counts unscored standards and high scores with no evidence', async () => {
    const h = harness({
      standards: [
        { id: 's1', rubricScore: null },
        { id: 's2', rubricScore: 3 },
        { id: 's3', rubricScore: 4 },
        { id: 's4', rubricScore: 2 },
      ],
      evidenceCounts: [{ standardId: 's3', _count: { _all: 2 } }],
    })
    const map = byKey((await h.service.collect('s', { now: NOW })).signals)
    expect(map.get('acc.unscored_standards')?.value).toBe(1)
    // s2 scores 3 with no evidence; s3 scores 4 but is supported.
    expect(map.get('acc.unsupported_score')?.value).toBe(1)
  })

  it('reads one query per register GROUP, not one per signal', async () => {
    const h = harness({
      policies: [
        { status: 'active', category: 'Curriculum', adoptedDate: daysAgo(900), lastReviewedDate: daysAgo(900), reviewIntervalMonths: 12 },
      ],
      meetings: [
        { scheduledAt: daysAgo(30), status: 'held', minutesStatus: 'approved', minutesApprovedAt: daysAgo(20) },
      ],
    })
    const map = byKey((await h.service.collect('s', { now: NOW })).signals)

    // gov.policy_review AND curr.doc_review share ONE Policy read.
    expect(h.prisma.policy.findMany).toHaveBeenCalledTimes(1)
    // gov.minutes_lag AND gov.meeting_cadence share ONE Meeting read.
    expect(h.prisma.meeting.findMany).toHaveBeenCalledTimes(1)
    expect(map.get('curr.doc_review')?.value).toBe(1)
    expect(map.get('gov.minutes_lag')?.value).toBe(10)
    expect(map.get('gov.meeting_cadence')?.value).toBe(1)
  })

  it('every query it does issue is schoolId-scoped', async () => {
    const h = harness({ policies: [], meetings: [] })
    await h.service.collect('school-A', { now: NOW })
    const scoped = [
      h.prisma.policy.findMany,
      h.prisma.meeting.findMany,
      h.prisma.governancePerson.findMany,
      h.prisma.committee.findMany,
      h.prisma.maintenanceItem.findMany,
      h.prisma.accreditationStandard.findMany,
      h.prisma.accreditationFinding.findMany,
      h.prisma.enrollmentSnapshot.findFirst,
      h.prisma.arApAgingSnapshot.findFirst,
      h.prisma.strategicPlan.findFirst,
      h.prisma.fiscalPeriod.findFirst,
      h.prisma.accreditationReadinessSnapshot.findFirst,
    ]
    for (const fn of scoped) {
      for (const call of fn.mock.calls) {
        expect((call[0] as { where?: { schoolId?: string } }).where?.schoolId).toBe('school-A')
      }
    }
    expect(h.prisma.accreditationEvidence.groupBy.mock.calls.length).toBeGreaterThanOrEqual(0)
  })
})
