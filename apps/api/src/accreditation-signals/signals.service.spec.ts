import { describe, expect, it, vi } from 'vitest'
import { NotFoundException } from '@nestjs/common'
import { DOMAIN_KEYS } from '@finrep/compliance'
import { AccreditationSignalsService } from './signals.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// The SIGNAL PANEL. The defects this file exists to PIN:
//
//   • the panel must NEVER 4xx/5xx for missing data. No period, no snapshot, a
//     metrics compute that throws — all of them are 200 with a reason, because a
//     head of school opening a standard needs to be told what to do next, not
//     shown a red box;
//   • an UNLICENSED metric must be RETURNED (so the school learns which module
//     lights it) with every value field NULL. If a value ever leaks here, the
//     module boundary is decorative — this is the leak guard;
//   • a signal must not be attributed to a domain its standard only quarter-
//     belongs to (MSA-4's cash metrics are finance signals, not facilities ones);
//   • a school with no bindings must cost NO metric compute at all.
//
// Prisma / Analytics / Billing / Periods are hand-mocked (no DB, no Nest boot).
// ─────────────────────────────────────────────────────────────────────────────

const PERIOD = {
  id: '11111111-1111-1111-1111-111111111111',
  label: 'FY 2026',
  periodEndDate: new Date('2026-06-30T00:00:00.000Z'),
}

function metric(over: Record<string, unknown> = {}) {
  return {
    key: 'operating_margin',
    label: 'Operating Margin',
    unit: 'percent',
    category: 'profitability',
    goodDirection: 'higher',
    formula: '(Revenue − Expenses) ÷ Revenue',
    description: 'Share of revenue left after operating expenses.',
    available: true,
    value: 0.072,
    inputsMissing: [],
    periodOverPeriodDelta: 0.011,
    status: 'good',
    bands: { goodDirection: 'higher', good: 0.05, risk: 0 },
    inputs: [],
    ...over,
  }
}

interface FakeStandard {
  id: string
  catalogStandardId: string | null
  parentId?: string | null
  frameworkId?: string | null
}

function makeService(opts: {
  standards?: FakeStandard[]
  catalog?: Record<string, unknown>[]
  frameworks?: { id: string; code: string }[]
  period?: typeof PERIOD | null
  metrics?: Record<string, unknown>[] | 'throw'
  entitled?: Record<string, boolean>
} = {}) {
  const prisma = {
    accreditationStandard: {
      findMany: vi.fn(async () => opts.standards ?? []),
    },
    accreditationCatalogStandard: {
      findMany: vi.fn(async () => opts.catalog ?? []),
    },
    accreditationFramework: {
      findMany: vi.fn(async () => opts.frameworks ?? []),
    },
    fiscalPeriod: {
      findFirst: vi.fn(async () => (opts.period === undefined ? PERIOD : opts.period)),
    },
  }
  const computeMetricsResponse = vi.fn(async () => {
    if (opts.metrics === 'throw') throw new NotFoundException('No statement snapshot yet.')
    return {
      periodId: PERIOD.id,
      label: PERIOD.label,
      periodEndDate: '2026-06-30',
      metrics: opts.metrics ?? [metric()],
      freshness: { dataAsOf: '2026-07-01T09:00:00.000Z', periodEndDate: '2026-06-30' },
    }
  })
  const billing = {
    isEntitledForModule: vi.fn(async (_schoolId: string, moduleKey: string) =>
      opts.entitled ? (opts.entitled[moduleKey] ?? false) : true,
    ),
  }
  const periods = {
    getOwnedPeriod: vi.fn(async (_schoolId: string, id: string) => {
      if (id !== PERIOD.id) throw new NotFoundException('Fiscal period not found.')
      return PERIOD
    }),
  }
  const svc = new AccreditationSignalsService(
    prisma as never,
    { computeMetricsResponse } as never,
    billing as never,
    periods as never,
  )
  return { svc, prisma, computeMetricsResponse, billing, periods }
}

/** One standard bound to operating_margin, wholly owned by `finance`. */
const FINANCE_BINDING = {
  standards: [{ id: 's1', catalogStandardId: 'c1' }],
  catalog: [
    {
      id: 'c1',
      isAssurance: false,
      domainKey: 'finance',
      domainWeights: null,
      signalKeys: ['operating_margin'],
    },
  ],
}

describe('AccreditationSignalsService — nothing bound', () => {
  it('a register with no catalog links costs ONE query and no metric compute', async () => {
    const { svc, computeMetricsResponse, prisma } = makeService({
      standards: [{ id: 's1', catalogStandardId: null }],
    })
    const res = await svc.getSignals('school-A')
    expect(res.signals).toEqual([])
    expect(res.period).toBeNull()
    expect(res.unavailable).toBeNull()
    expect(res.byStandard).toEqual({})
    expect(Object.keys(res.byDomain)).toEqual([...DOMAIN_KEYS])
    expect(Object.values(res.byDomain).every((d) => d.bound === 0 && d.live === 0)).toBe(true)
    expect(computeMetricsResponse).not.toHaveBeenCalled()
    expect(prisma.accreditationCatalogStandard.findMany).not.toHaveBeenCalled()
  })

  it('cataloged standards with ZERO signal bindings also skip the compute', async () => {
    const { svc, computeMetricsResponse } = makeService({
      standards: [{ id: 's1', catalogStandardId: 'c1' }],
      catalog: [{ id: 'c1', domainKey: 'governance', domainWeights: null, signalKeys: [] }],
    })
    const res = await svc.getSignals('school-A')
    expect(res.signals).toEqual([])
    expect(computeMetricsResponse).not.toHaveBeenCalled()
  })
})

describe('AccreditationSignalsService — degraded states are 200 with a reason', () => {
  it('no snapshot-bearing period → no_snapshot, every signal no_data', async () => {
    const { svc } = makeService({ ...FINANCE_BINDING, period: null })
    const res = await svc.getSignals('school-A')
    expect(res.unavailable).toEqual({
      reason: 'no_snapshot',
      message: 'No saved statements yet — import a trial balance to light these signals.',
    })
    expect(res.period).toBeNull()
    expect(res.signals).toHaveLength(1)
    expect(res.signals[0]).toEqual(
      expect.objectContaining({
        key: 'operating_margin',
        available: false,
        value: null,
        bands: null,
        lineage: null,
      }),
    )
    expect(res.signals[0].unavailable?.reason).toBe('no_data')
    // The row is still BOUND to the domain — the panel says "0 of 1 live",
    // never "no signals here".
    expect(res.byDomain.finance).toMatchObject({ bound: 1, live: 0, unavailable: 1 })
  })

  it('computeMetricsResponse THROWING degrades identically and never rethrows', async () => {
    const { svc } = makeService({ ...FINANCE_BINDING, metrics: 'throw' })
    const res = await svc.getSignals('school-A')
    expect(res.unavailable?.reason).toBe('no_snapshot')
    expect(res.signals[0].available).toBe(false)
    expect(res.signals[0].value).toBeNull()
    // We DID resolve a period, so we say which one we looked in.
    expect(res.period?.id).toBe(PERIOD.id)
    expect(res.asOf).toBeNull()
  })

  it('a foreign/unknown ?periodId resolves to nothing rather than another tenant', async () => {
    const { svc, computeMetricsResponse } = makeService(FINANCE_BINDING)
    const res = await svc.getSignals('school-A', {
      periodId: '99999999-9999-9999-9999-999999999999',
    })
    // A BAD REQUEST, not a data gap: a school with ten years of statements must
    // never be told to "import a trial balance" because a stale id came in.
    expect(res.unavailable).toEqual({
      reason: 'no_period',
      message: "That fiscal period isn't available for this school.",
    })
    expect(res.signals[0].unavailable?.message).toBe(
      "That fiscal period isn't available for this school.",
    )
    expect(computeMetricsResponse).not.toHaveBeenCalled()
  })

  it('panel-level `unavailable` fires when NOTHING could be valued, not just on failure', async () => {
    // A finance-only school whose only binding is an HR metric: 200, one row, a
    // reason — and a panel that does NOT report itself as healthy.
    const { svc } = makeService({
      standards: [{ id: 's1', catalogStandardId: 'c1' }],
      catalog: [
        { id: 'c1', domainKey: 'hr', domainWeights: null, signalKeys: ['student_teacher_ratio'] },
      ],
      metrics: [metric({ key: 'student_teacher_ratio', value: 11.4 })],
      entitled: { hr: false },
    })
    const res = await svc.getSignals('school-A')
    expect(res.unavailable?.reason).toBe('metrics_unavailable')
    expect(res.period).not.toBeNull() // we DID resolve a period; the values are the problem
    // …and one live signal is enough for the panel to be healthy again.
    const ok = await makeService(FINANCE_BINDING).svc.getSignals('school-A')
    expect(ok.unavailable).toBeNull()
  })
})

describe('AccreditationSignalsService — entitlement', () => {
  it('an unlicensed metric is RETURNED with a reason and NO value (leak guard)', async () => {
    const { svc } = makeService({
      standards: [{ id: 's1', catalogStandardId: 'c1' }],
      catalog: [
        {
          id: 'c1',
          domainKey: 'hr',
          domainWeights: null,
          signalKeys: ['student_teacher_ratio'],
        },
      ],
      metrics: [
        metric({ key: 'student_teacher_ratio', label: 'Student:Teacher Ratio', value: 11.4 }),
      ],
      entitled: { hr: false },
    })
    const res = await svc.getSignals('school-A')
    const row = res.signals[0]
    expect(row.available).toBe(false)
    expect(row.unavailable?.reason).toBe('module_not_licensed')
    expect(row.unavailable?.moduleKey).toBe('hr')
    expect(row.unavailable?.message).toContain('HR & Staffing')
    // THE LEAK GUARD: the school is told which module lights this row; it is
    // never told the number behind a module it has not licensed.
    expect(row.value).toBeNull()
    expect(row.bands).toBeNull()
    expect(row.lineage).toBeNull()
    expect(row.periodOverPeriodDelta).toBeNull()
    expect(row.status).toBe('neutral')
    // Still counted as BOUND, so the panel can explain why it is empty.
    expect(res.byDomain.hr).toMatchObject({ bound: 1, live: 0, unavailable: 1 })
  })

  it('an available metric carries value, band, as-of and lineage', async () => {
    const { svc } = makeService(FINANCE_BINDING)
    const res = await svc.getSignals('school-A')
    const row = res.signals[0]
    expect(row).toEqual(
      expect.objectContaining({
        key: 'operating_margin',
        available: true,
        value: 0.072,
        status: 'good',
        periodOverPeriodDelta: 0.011,
        asOf: '2026-06-30',
      }),
    )
    expect(row.bands).toEqual({ goodDirection: 'higher', good: 0.05, risk: 0 })
    expect(row.lineage).toEqual({
      periodId: PERIOD.id,
      periodLabel: 'FY 2026',
      periodEndDate: '2026-06-30',
      dataAsOf: '2026-07-01T09:00:00.000Z',
      source: 'statement_snapshot',
    })
    expect(res.asOf).toBe('2026-07-01T09:00:00.000Z')
    expect(res.byDomain.finance).toMatchObject({ bound: 1, live: 1, unavailable: 0 })
  })

  it('available:false from the compute layer echoes the missing inputs', async () => {
    const { svc } = makeService({
      ...FINANCE_BINDING,
      metrics: [
        metric({
          available: false,
          value: null,
          inputsMissing: ['cash', 'total expenses'],
          status: 'neutral',
        }),
      ],
    })
    const row = (await svc.getSignals('school-A')).signals[0]
    expect(row.unavailable).toEqual({
      reason: 'inputs_missing',
      inputsMissing: ['cash', 'total expenses'],
      message: "We don't have cash, total expenses for this period yet.",
    })
    expect(row.value).toBeNull()
    // It still describes a real period — saying WHICH one is part of the answer.
    expect(row.asOf).toBe('2026-06-30')
  })
})

describe('AccreditationSignalsService — attribution + tenancy', () => {
  it('a quarter-weight standard does NOT lend its signals to that domain', async () => {
    // The MSA-4 shape verbatim: finance ½, facilities ¼, hr ¼.
    const { svc } = makeService({
      standards: [{ id: 's4', catalogStandardId: 'c4' }],
      catalog: [
        {
          id: 'c4',
          domainKey: 'finance',
          domainWeights: { finance: 0.5, facilities: 0.25, hr: 0.25 },
          signalKeys: ['operating_margin', 'days_cash_on_hand'],
        },
      ],
      metrics: [metric(), metric({ key: 'days_cash_on_hand', available: false, value: null })],
    })
    const res = await svc.getSignals('school-A')
    expect(res.byDomain.finance).toMatchObject({ bound: 2, live: 1, unavailable: 1 })
    expect(res.byDomain.finance.keys).toEqual(['operating_margin', 'days_cash_on_hand'])
    expect(res.byDomain.facilities).toMatchObject({ bound: 0, live: 0, unavailable: 0, keys: [] })
    expect(res.byDomain.hr).toMatchObject({ bound: 0, live: 0, unavailable: 0, keys: [] })
    // live + unavailable === bound for EVERY domain, always.
    for (const d of DOMAIN_KEYS) {
      const c = res.byDomain[d]
      expect(c.live + c.unavailable).toBe(c.bound)
    }
  })

  it('byStandard omits unbound standards and is scoped to the caller’s school', async () => {
    const { svc, prisma } = makeService({
      standards: [
        { id: 's1', catalogStandardId: 'c1' },
        { id: 's2', catalogStandardId: 'c2' },
      ],
      catalog: [
        { id: 'c1', domainKey: 'finance', domainWeights: null, signalKeys: ['operating_margin'] },
        { id: 'c2', domainKey: 'governance', domainWeights: null, signalKeys: [] },
      ],
    })
    const res = await svc.getSignals('school-A')
    expect(res.byStandard).toEqual({ s1: ['operating_margin'] })
    expect(prisma.accreditationStandard.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { schoolId: 'school-A' } }),
    )
  })

  // Cognia is DOMINANT here (2 standards vs 1) — the fixture the dominance test
  // and the explicit-selection tests both read, so they cannot drift apart.
  const TWO_FRAMEWORK_FIXTURE = {
    standards: [
      { id: 'cog-1', catalogStandardId: 'c-cog-1', parentId: null, frameworkId: 'fw-cognia' },
      { id: 'cog-2', catalogStandardId: 'c-cog-2', parentId: null, frameworkId: 'fw-cognia' },
      { id: 'nsb-1', catalogStandardId: 'c-nsb-1', parentId: null, frameworkId: 'fw-nsbecs' },
    ],
    frameworks: [
      { id: 'fw-cognia', code: 'cognia_2022' },
      { id: 'fw-nsbecs', code: 'nsbecs' },
    ],
    catalog: [
      {
        id: 'c-cog-1',
        isAssurance: false,
        domainKey: 'finance',
        domainWeights: null,
        signalKeys: ['operating_margin'],
      },
      // An ASSURANCE gate is excluded from the graded population too.
      {
        id: 'c-cog-2',
        isAssurance: true,
        domainKey: 'finance',
        domainWeights: null,
        signalKeys: ['tuition_dependency'],
      },
      {
        id: 'c-nsb-1',
        isAssurance: false,
        domainKey: 'finance',
        domainWeights: null,
        signalKeys: ['days_cash_on_hand'],
      },
    ],
    metrics: [metric(), metric({ key: 'days_cash_on_hand' }), metric({ key: 'tuition_dependency' })],
  }

  // ───────────────────────────────────────────────────────────────────────────
  // …AND THE CALLER CAN SAY WHICH. Dominance is the DEFAULT, not the rule: a
  // school holding two accreditations was graded on whichever had more standards,
  // with no way to look at the other, so this panel could only ever describe one
  // half of what the school is actually accredited against.
  // ───────────────────────────────────────────────────────────────────────────
  it('an EXPLICIT frameworkId beats dominance', async () => {
    const { svc } = makeService(TWO_FRAMEWORK_FIXTURE)
    const res = await svc.getSignals('school-A', { frameworkId: 'fw-nsbecs' })
    // The NON-dominant framework's leaf, because it was asked for by name.
    expect(res.byDomain.finance.keys).toEqual(['days_cash_on_hand'])
  })

  it('omitting it still falls back to dominance — nothing changes for one framework', async () => {
    const { svc } = makeService(TWO_FRAMEWORK_FIXTURE)
    const res = await svc.getSignals('school-A')
    expect(res.byDomain.finance.keys).toEqual(['operating_margin'])
  })

  it('a framework the school does NOT hold falls back rather than emptying the grid', async () => {
    // A stale bookmark or a deleted framework must degrade to the previous
    // behaviour, not silently report a school with no bound signals at all.
    const { svc } = makeService(TWO_FRAMEWORK_FIXTURE)
    const res = await svc.getSignals('school-A', { frameworkId: 'fw-does-not-exist' })
    expect(res.byDomain.finance.keys).toEqual(['operating_margin'])
  })

  it('byDomain is scoped to the DOMINANT framework — the two-framework card', async () => {
    // The defect: /signals resolved bindings over EVERY standard while
    // /readiness graded one framework's leaves, so a school that had adopted
    // both NSBECS and Cognia saw a Cognia Finance card reading "N of 3 live"
    // directly above "your framework has 1 finance standard". One card, two
    // populations. Cognia is dominant here (2 standards vs 1).
    const { svc } = makeService(TWO_FRAMEWORK_FIXTURE)
    const res = await svc.getSignals('school-A')
    // Only the dominant framework's NON-ASSURANCE leaf reaches the domain grid.
    expect(res.byDomain.finance.keys).toEqual(['operating_margin'])
    expect(res.byDomain.finance).toMatchObject({ bound: 1, live: 1, unavailable: 0 })
    // …but the drawer still knows about, and can VALUE, every standard's
    // binding — opening the NSBECS standard must not show an empty panel.
    expect(res.byStandard).toEqual({
      'cog-1': ['operating_margin'],
      'cog-2': ['tuition_dependency'],
      'nsb-1': ['days_cash_on_hand'],
    })
    expect(res.signals.map((s) => s.key)).toEqual([
      'operating_margin',
      'days_cash_on_hand',
      'tuition_dependency',
    ])
  })

  it('a bound standard with a CHILD is not a leaf, and drops out of byDomain', async () => {
    // The mirror case: the readiness read grades leaves only, so a parent's
    // bindings must not light a domain card the rubric side reports as empty.
    const { svc } = makeService({
      standards: [
        { id: 'parent', catalogStandardId: 'c1', parentId: null, frameworkId: 'fw-1' },
        { id: 'child', catalogStandardId: null, parentId: 'parent', frameworkId: 'fw-1' },
      ],
      frameworks: [{ id: 'fw-1', code: 'cognia_2022' }],
      catalog: [
        {
          id: 'c1',
          isAssurance: false,
          domainKey: 'finance',
          domainWeights: null,
          signalKeys: ['operating_margin'],
        },
      ],
    })
    const res = await svc.getSignals('school-A')
    expect(res.byDomain.finance).toMatchObject({ bound: 0, live: 0, keys: [] })
    expect(res.byStandard).toEqual({ parent: ['operating_margin'] })
  })

  it('signals come back in registry order, deduped across standards', async () => {
    const { svc } = makeService({
      standards: [
        { id: 's1', catalogStandardId: 'c1' },
        { id: 's2', catalogStandardId: 'c2' },
      ],
      catalog: [
        {
          id: 'c1',
          domainKey: 'finance',
          domainWeights: null,
          signalKeys: ['days_cash_on_hand', 'operating_margin'],
        },
        {
          id: 'c2',
          domainKey: 'finance',
          domainWeights: null,
          signalKeys: ['operating_margin', 'tuition_dependency'],
        },
      ],
      metrics: [
        metric(),
        metric({ key: 'days_cash_on_hand' }),
        metric({ key: 'tuition_dependency' }),
      ],
    })
    const res = await svc.getSignals('school-A')
    // METRIC_KEYS order, not seed order, not insertion order.
    expect(res.signals.map((s) => s.key)).toEqual([
      'operating_margin',
      'days_cash_on_hand',
      'tuition_dependency',
    ])
  })
})
