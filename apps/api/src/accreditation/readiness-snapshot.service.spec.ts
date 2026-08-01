import { describe, expect, it, vi } from 'vitest'
import { DOMAIN_KEYS } from '@finrep/compliance'
import { AccreditationSnapshotService, NO_FRAMEWORK_SERIES_KEY } from './readiness-snapshot.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// AccreditationSnapshotService — the nightly readiness capture.
//
// The defects this file exists to PIN:
//   • an identical night must not be recorded twice (or "42 readings" becomes a
//     lie about how much history we actually have),
//   • a school on two frameworks must get two INDEPENDENT series, and adopting a
//     second framework must never disturb the first — that is the F6 framework-
//     flip defect, and it is the reason seriesKey is the framework CODE and not
//     the read-time dominant-framework heuristic,
//   • thinning old rows must keep REAL readings, never synthesised ones.
//
// Prisma is hand-mocked with a small in-memory store (no DB, no Nest boot).
// ─────────────────────────────────────────────────────────────────────────────

const COGNIA = {
  id: 'fw-cognia',
  code: 'cognia_2022',
  accreditor: 'Cognia',
  name: 'Cognia Performance Standards',
  version: '2022',
  statusBands: [
    { min: 240, label: 'Accredited Needing Improvement' },
    { min: 280, label: 'Accredited' },
  ],
  indexMin: 100,
  indexMax: 400,
  defaultTarget: 280,
}
const NSBECS = {
  id: 'fw-nsbecs',
  code: 'nsbecs',
  accreditor: 'NSBECS/WCEA',
  name: 'National Standards & Benchmarks',
  version: '2012',
  statusBands: [],
  indexMin: null,
  indexMax: null,
  defaultTarget: null,
}

interface SnapRow {
  id: string
  schoolId: string
  seriesKey: string
  snapshotDate: Date
  frameworkId: string | null
  payloadHash: string
  readinessPct: number
  leafCount: number
  isDemo: boolean
  reason: string
  leafScores: unknown
}

function stdRow(over: Record<string, unknown> = {}) {
  return {
    id: 's1',
    schoolId: 'school-A',
    parentId: null,
    code: 'X-1',
    title: 'T',
    rating: 'not_started',
    frameworkId: null,
    catalogStandardId: null,
    rubricScore: null,
    sortOrder: null,
    ...over,
  }
}

function makeService(opts: {
  standards?: unknown[]
  evidence?: { standardId: string; _count: { _all: number } }[]
  frameworks?: unknown[]
  // Phase B widened the ONE catalog read (assurance flag + domain map + signal
  // binding in a single findMany), so the fixture carries the columns the
  // service now derives in memory.
  assuranceCatalog?: {
    id: string
    isAssurance?: boolean
    domainKey?: string | null
    domainWeights?: unknown
    signalKeys?: string[]
  }[]
  licensed?: boolean
  schoolsWithStandards?: string[]
  schoolsWithBilling?: string[]
}) {
  const store: SnapRow[] = []
  let seq = 0
  const frameworks = opts.frameworks ?? [COGNIA, NSBECS]
  let standards = opts.standards ?? []

  const key = (r: { schoolId: string; seriesKey: string; snapshotDate: Date }) =>
    `${r.schoolId}|${r.seriesKey}|${r.snapshotDate.toISOString().slice(0, 10)}`

  const prisma = {
    accreditationStandard: {
      findMany: vi.fn(async () => standards),
      groupBy: vi.fn(async () =>
        (opts.schoolsWithStandards ?? ['school-A']).map((schoolId) => ({
          schoolId,
          _count: { _all: 1 },
        })),
      ),
    },
    accreditationEvidence: {
      groupBy: vi.fn(async () => opts.evidence ?? []),
    },
    accreditationFramework: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        (frameworks as { id: string }[]).filter((f) => where.id.in.includes(f.id)),
      ),
    },
    accreditationCatalogStandard: {
      findMany: vi.fn(async () => opts.assuranceCatalog ?? []),
    },
    accreditationReadinessSnapshot: {
      findFirst: vi.fn(
        async ({
          where,
          orderBy,
        }: {
          where: { schoolId: string; seriesKey?: string; snapshotDate?: { lte?: Date } }
          orderBy?: unknown
        }) => {
          void orderBy
          const rows = store
            .filter(
              (r) =>
                r.schoolId === where.schoolId &&
                (where.seriesKey === undefined || r.seriesKey === where.seriesKey) &&
                (where.snapshotDate?.lte === undefined ||
                  r.snapshotDate.getTime() <= where.snapshotDate.lte.getTime()),
            )
            .sort((a, b) => b.snapshotDate.getTime() - a.snapshotDate.getTime())
          return rows[0] ?? null
        },
      ),
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { schoolId_seriesKey_snapshotDate: { schoolId: string; seriesKey: string; snapshotDate: Date } }
          create: Record<string, unknown>
          update: Record<string, unknown>
        }) => {
          const k = key(where.schoolId_seriesKey_snapshotDate)
          const existing = store.find((r) => key(r) === k)
          if (existing) {
            Object.assign(existing, update)
            return existing
          }
          seq += 1
          const row = { ...(create as unknown as SnapRow), id: `snap-${seq}` }
          store.push(row)
          return row
        },
      ),
      // prune() pages with take + cursor + skip, so the mock honours all three.
      findMany: vi.fn(
        async ({
          where,
          take,
          cursor,
          skip,
        }: {
          where: { snapshotDate: { lt: Date } }
          take?: number
          cursor?: { id: string }
          skip?: number
        }) => {
          const all = store
            .filter((r) => r.snapshotDate.getTime() < where.snapshotDate.lt.getTime())
            .sort(
              (a, b) =>
                a.snapshotDate.getTime() - b.snapshotDate.getTime() || a.id.localeCompare(b.id),
            )
            .map((r) => ({
              id: r.id,
              schoolId: r.schoolId,
              seriesKey: r.seriesKey,
              snapshotDate: r.snapshotDate,
            }))
          let start = 0
          if (cursor) {
            const at = all.findIndex((r) => r.id === cursor.id)
            if (at < 0) return [] // Prisma: a missing cursor row yields nothing
            start = at + (skip ?? 0)
          }
          return take === undefined ? all.slice(start) : all.slice(start, start + take)
        },
      ),
      deleteMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        let count = 0
        for (const id of where.id.in) {
          const i = store.findIndex((r) => r.id === id)
          if (i >= 0) {
            store.splice(i, 1)
            count += 1
          }
        }
        return { count }
      }),
    },
    // The nightly capture probes billing READ-ONLY before asking about
    // entitlement — a housekeeping job must not provision a subscription.
    subscription: {
      findUnique: vi.fn(async ({ where }: { where: { schoolId: string } }) =>
        (opts.schoolsWithBilling ?? opts.schoolsWithStandards ?? ['school-A']).includes(
          where.schoolId,
        )
          ? { id: `sub-${where.schoolId}` }
          : null,
      ),
    },
  }

  const billing = { isEntitledForModule: vi.fn(async () => opts.licensed ?? true) }
  const svc = new AccreditationSnapshotService(prisma as never, billing as never)
  return {
    svc,
    prisma,
    billing,
    store,
    setStandards: (next: unknown[]) => {
      standards = next
    },
    seed: (row: Partial<SnapRow> & { seriesKey: string; snapshotDate: Date }) => {
      seq += 1
      store.push({
        id: `snap-${seq}`,
        schoolId: 'school-A',
        frameworkId: null,
        payloadHash: `hash-${seq}`,
        readinessPct: 0,
        leafCount: 0,
        isDemo: false,
        reason: 'nightly',
        leafScores: [],
        ...row,
      })
    },
  }
}

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

describe('AccreditationSnapshotService — the append-only record', () => {
  it('two consecutive NO-CHANGE nights write exactly ONE row', async () => {
    const { svc, store } = makeService({
      standards: [
        stdRow({ id: 'a', code: 'C-1', frameworkId: 'fw-cognia', rubricScore: 3 }),
        stdRow({ id: 'b', code: 'C-2', frameworkId: 'fw-cognia', rubricScore: 2 }),
      ],
    })
    await svc.captureForSchool('school-A', 'nightly', day('2026-08-14'))
    await svc.captureForSchool('school-A', 'nightly', day('2026-08-15'))
    expect(store).toHaveLength(1)
    expect(store[0].snapshotDate.toISOString().slice(0, 10)).toBe('2026-08-14')
  })

  it('a CHANGED night appends a second row (the record grows only when reality does)', async () => {
    const s = makeService({
      standards: [stdRow({ id: 'a', code: 'C-1', frameworkId: 'fw-cognia', rubricScore: 2 })],
    })
    await s.svc.captureForSchool('school-A', 'nightly', day('2026-08-14'))
    s.setStandards([stdRow({ id: 'a', code: 'C-1', frameworkId: 'fw-cognia', rubricScore: 4 })])
    await s.svc.captureForSchool('school-A', 'nightly', day('2026-08-15'))
    expect(s.store).toHaveLength(2)
    expect(s.store[1].readinessPct).toBeGreaterThan(s.store[0].readinessPct)
  })

  it('a same-day re-run OVERWRITES rather than duplicating (idempotent)', async () => {
    const s = makeService({
      standards: [stdRow({ id: 'a', code: 'C-1', frameworkId: 'fw-cognia', rubricScore: 2 })],
    })
    await s.svc.captureForSchool('school-A', 'nightly', day('2026-08-14'))
    s.setStandards([stdRow({ id: 'a', code: 'C-1', frameworkId: 'fw-cognia', rubricScore: 4 })])
    await s.svc.captureForSchool('school-A', 'nightly', day('2026-08-14'))
    expect(s.store).toHaveLength(1)
    // The re-run's value won. 70, not 100: a top rubric score with NO evidence
    // only earns the 0.7 rubric term — the 0.3 evidence term stays unearned.
    expect(s.store[0].readinessPct).toBe(70)
  })
})

describe('AccreditationSnapshotService — one series per framework', () => {
  it('Cognia + NSBECS adopted → TWO rows a night with distinct seriesKeys', async () => {
    const { svc, store } = makeService({
      standards: [
        stdRow({ id: 'a', code: 'C-1', frameworkId: 'fw-cognia', rubricScore: 3 }),
        stdRow({ id: 'b', code: 'N-1', frameworkId: 'fw-nsbecs', rubricScore: 2 }),
      ],
    })
    await svc.captureForSchool('school-A', 'nightly', day('2026-08-14'))
    expect(store.map((r) => r.seriesKey).sort()).toEqual(['cognia_2022', 'nsbecs'])
  })

  it("standards linked to no framework get their own 'none' series", async () => {
    const { svc, store } = makeService({
      standards: [
        stdRow({ id: 'a', code: 'C-1', frameworkId: 'fw-cognia', rubricScore: 3 }),
        stdRow({ id: 'h', code: 'H-1', frameworkId: null, rubricScore: 1 }),
      ],
    })
    await svc.captureForSchool('school-A', 'nightly', day('2026-08-14'))
    expect(store.map((r) => r.seriesKey).sort()).toEqual(['cognia_2022', NO_FRAMEWORK_SERIES_KEY])
    const none = store.find((r) => r.seriesKey === NO_FRAMEWORK_SERIES_KEY)!
    expect(none.leafCount).toBe(1) // ONLY the unlinked standard
    expect(none.frameworkId).toBeNull()
  })

  it('a framework-less school writes exactly ONE row per day', async () => {
    const { svc, store } = makeService({
      standards: [
        stdRow({ id: 'h1', code: 'H-1', rubricScore: 2 }),
        stdRow({ id: 'h2', code: 'H-2', rubricScore: 3 }),
      ],
    })
    await svc.captureForSchool('school-A', 'nightly', day('2026-08-14'))
    await svc.captureForSchool('school-A', 'nightly', day('2026-08-14'))
    expect(store).toHaveLength(1)
    expect(store[0].seriesKey).toBe(NO_FRAMEWORK_SERIES_KEY)
  })

  it('FRAMEWORK-FLIP REGRESSION: adopting Cognia leaves the NSBECS series untouched', async () => {
    // The F6 defect: a read-time "dominant framework" would flip to Cognia here
    // and the NSBECS chart would silently start plotting Cognia's numbers.
    const s = makeService({
      standards: [
        stdRow({ id: 'n1', code: 'N-1', frameworkId: 'fw-nsbecs', rubricScore: 4 }),
        stdRow({ id: 'n2', code: 'N-2', frameworkId: 'fw-nsbecs', rubricScore: 4 }),
      ],
    })
    await s.svc.captureForSchool('school-A', 'nightly', day('2026-08-14'))
    const nsbecsBefore = { ...s.store.find((r) => r.seriesKey === 'nsbecs')! }

    // Cognia adopted — 20 fresh, unscored standards that would tank a blended figure.
    s.setStandards([
      stdRow({ id: 'n1', code: 'N-1', frameworkId: 'fw-nsbecs', rubricScore: 4 }),
      stdRow({ id: 'n2', code: 'N-2', frameworkId: 'fw-nsbecs', rubricScore: 4 }),
      ...Array.from({ length: 20 }, (_, i) =>
        stdRow({ id: `c${i}`, code: `C-${i}`, frameworkId: 'fw-cognia' }),
      ),
    ])
    await s.svc.captureForSchool('school-A', 'nightly', day('2026-08-15'))

    const nsbecsRows = s.store.filter((r) => r.seriesKey === 'nsbecs')
    const cogniaRows = s.store.filter((r) => r.seriesKey === 'cognia_2022')
    // NSBECS: still exactly one row, byte-identical — no discontinuity, no new
    // row (nothing about NSBECS changed, so nothing was recorded).
    expect(nsbecsRows).toHaveLength(1)
    expect(nsbecsRows[0].readinessPct).toBe(nsbecsBefore.readinessPct)
    expect(nsbecsRows[0].leafCount).toBe(nsbecsBefore.leafCount)
    // Cognia: a brand-new, separate series starting today.
    expect(cogniaRows).toHaveLength(1)
    expect(cogniaRows[0].leafCount).toBe(20)
    expect(cogniaRows[0].readinessPct).toBe(0)
  })

  it('assurance gates are excluded from the recorded series (frozen-engine parity)', async () => {
    const { svc, store } = makeService({
      standards: [
        stdRow({ id: 'a', code: 'C-1', frameworkId: 'fw-cognia', catalogStandardId: 'c1', rubricScore: 4 }),
        stdRow({ id: 'asr', code: 'C-A1', frameworkId: 'fw-cognia', catalogStandardId: 'cA1' }),
      ],
      assuranceCatalog: [{ id: 'cA1', isAssurance: true }],
    })
    await svc.captureForSchool('school-A', 'nightly', day('2026-08-14'))
    expect(store[0].leafCount).toBe(1)
    expect((store[0].leafScores as { code: string }[]).map((l) => l.code)).toEqual(['C-1'])
  })

  it('an empty register records NOTHING (no zero-row fabricated history)', async () => {
    const { svc, store } = makeService({ standards: [] })
    await svc.captureForSchool('school-A', 'nightly', day('2026-08-14'))
    expect(store).toHaveLength(0)
  })

  it('Phase B RECORDS the ten domain readings (never 0 for an unmeasured domain)', async () => {
    const { svc, prisma } = makeService({
      standards: [
        stdRow({ id: 'a', code: 'C-1', frameworkId: 'fw-cognia', catalogStandardId: 'c1', rubricScore: 3 }),
      ],
      assuranceCatalog: [
        {
          id: 'c1',
          isAssurance: false,
          domainKey: 'finance',
          signalKeys: ['operating_margin', 'days_cash_on_hand'],
        },
      ],
    })
    await svc.captureForSchool('school-A', 'nightly', day('2026-08-14'))
    const create = prisma.accreditationReadinessSnapshot.upsert.mock.calls[0][0].create as Record<
      string,
      unknown
    >
    const scores = create.domainScores as {
      domainKey: string
      readinessPct: number | null
      measured: boolean
      signalCount: number
    }[]
    expect(scores).toHaveLength(DOMAIN_KEYS.length)
    expect(scores.map((s) => s.domainKey)).toEqual([...DOMAIN_KEYS])
    // ONE finance leaf: below the scoring threshold, so the RECORD stores null.
    // A 0 here would enter the school's permanent history as "scored badly".
    const finance = scores.find((s) => s.domainKey === 'finance')!
    expect(finance.measured).toBe(false)
    expect(finance.readinessPct).toBeNull()
    expect(finance.signalCount).toBe(2)
    for (const s of scores) if (!s.measured) expect(s.readinessPct).toBeNull()
    expect(create.isDemo).toBe(false)
  })

  it('a DOMAIN-MAP correction alone changes the payload hash (the grid can go stale otherwise)', async () => {
    const standards = [
      stdRow({ id: 'a', code: 'C-1', frameworkId: 'fw-cognia', catalogStandardId: 'c1', rubricScore: 3 }),
    ]
    const before = makeService({
      standards,
      assuranceCatalog: [{ id: 'c1', isAssurance: false, domainKey: 'finance' }],
    })
    await before.svc.captureForSchool('school-A', 'nightly', day('2026-08-14'))
    const after = makeService({
      standards,
      // Same rubric score, same evidence — ONLY the catalog map moved.
      assuranceCatalog: [{ id: 'c1', isAssurance: false, domainKey: 'facilities' }],
    })
    await after.svc.captureForSchool('school-A', 'nightly', day('2026-08-14'))
    expect(before.store[0].readinessPct).toBe(after.store[0].readinessPct)
    expect(before.store[0].payloadHash).not.toBe(after.store[0].payloadHash)
  })

  it('identical inputs still dedupe (Phase-A hash behaviour otherwise unchanged)', async () => {
    const s = makeService({
      standards: [
        stdRow({ id: 'a', code: 'C-1', frameworkId: 'fw-cognia', catalogStandardId: 'c1', rubricScore: 3 }),
      ],
      assuranceCatalog: [{ id: 'c1', isAssurance: false, domainKey: 'finance' }],
    })
    await s.svc.captureForSchool('school-A', 'nightly', day('2026-08-14'))
    await s.svc.captureForSchool('school-A', 'nightly', day('2026-08-15'))
    await s.svc.captureForSchool('school-A', 'nightly', day('2026-08-16'))
    expect(s.store).toHaveLength(1)
  })
})

describe('AccreditationSnapshotService — captureAll eligibility', () => {
  it('skips schools that are not licensed for accreditation', async () => {
    const { svc, store, billing } = makeService({
      standards: [stdRow({ id: 'a', code: 'C-1', frameworkId: 'fw-cognia', rubricScore: 3 })],
      licensed: false,
    })
    await svc.captureAll()
    expect(billing.isEntitledForModule).toHaveBeenCalledWith('school-A', 'accreditation')
    expect(store).toHaveLength(0)
  })

  it('captures every licensed school with a register', async () => {
    const { svc, store } = makeService({
      standards: [stdRow({ id: 'a', code: 'C-1', frameworkId: 'fw-cognia', rubricScore: 3 })],
      schoolsWithStandards: ['school-A', 'school-B', 'school-C'],
    })
    await svc.captureAll()
    expect(new Set(store.map((r) => r.schoolId))).toEqual(
      new Set(['school-A', 'school-B', 'school-C']),
    )
  })

  it('a school with NO billing row is skipped WITHOUT asking billing (no trial is granted)', async () => {
    // BillingService.isEntitledForModule runs through getOrCreateSubscription,
    // which CREATES a 14-day trial for any school lacking one. A 3AM housekeeping
    // job must never provision a subscription as a side effect of looking, so the
    // read-only probe has to come first and short-circuit.
    const { svc, store, billing, prisma } = makeService({
      standards: [stdRow({ id: 'a', code: 'C-1', frameworkId: 'fw-cognia', rubricScore: 3 })],
      schoolsWithStandards: ['school-A', 'school-B'],
      schoolsWithBilling: ['school-A'],
    })
    await svc.captureAll()
    expect(prisma.subscription.findUnique).toHaveBeenCalled()
    const asked = (billing.isEntitledForModule.mock.calls as unknown as string[][]).map((c) => c[0])
    expect(asked).toContain('school-A')
    expect(asked).not.toContain('school-B')
    expect(new Set(store.map((r) => r.schoolId))).toEqual(new Set(['school-A']))
  })

  it('a school that throws does not abort the whole nightly run', async () => {
    const s = makeService({
      standards: [stdRow({ id: 'a', code: 'C-1', frameworkId: 'fw-cognia', rubricScore: 3 })],
      schoolsWithStandards: ['school-A', 'school-B'],
    })
    s.billing.isEntitledForModule.mockImplementationOnce(async () => {
      throw new Error('billing down')
    })
    await expect(s.svc.captureAll()).resolves.toBeUndefined()
    // The failing school is treated as unlicensed (fail-soft); the other still runs.
    expect(s.store.length).toBeGreaterThanOrEqual(1)
  })
})

describe('AccreditationSnapshotService — fabricated history cannot be laundered', () => {
  it('a real capture appended to a DEMO series inherits the demo flag', async () => {
    const s = makeService({
      standards: [stdRow({ id: 'a', code: 'C-1', frameworkId: 'fw-cognia', rubricScore: 2 })],
    })
    await s.svc.captureForSchool('school-A', 'demo_seed', day('2026-08-14'))
    expect(s.store[0].isDemo).toBe(true)

    // A genuine nightly run the next day, after a real edit.
    s.setStandards([stdRow({ id: 'a', code: 'C-1', frameworkId: 'fw-cognia', rubricScore: 4 })])
    await s.svc.captureForSchool('school-A', 'nightly', day('2026-08-15'))
    expect(s.store).toHaveLength(2)
    // If this ever reads false, /trend reports demoData:false, the DEMO DATA chip
    // disappears, and invented history is presented as the school's own record.
    expect(s.store[1].isDemo).toBe(true)
    expect(s.store[1].reason).toBe('nightly')
  })

  it('a same-day overwrite RE-ASSERTS the flag rather than leaving it write-once', async () => {
    const s = makeService({
      standards: [stdRow({ id: 'a', code: 'C-1', frameworkId: 'fw-cognia', rubricScore: 2 })],
    })
    await s.svc.captureForSchool('school-A', 'demo_seed', day('2026-08-14'))
    s.setStandards([stdRow({ id: 'a', code: 'C-1', frameworkId: 'fw-cognia', rubricScore: 3 })])
    await s.svc.captureForSchool('school-A', 'event', day('2026-08-14'))
    expect(s.store).toHaveLength(1)
    expect(s.store[0].isDemo).toBe(true)
  })

  it('an ordinary series stays non-demo', async () => {
    const s = makeService({
      standards: [stdRow({ id: 'a', code: 'C-1', frameworkId: 'fw-cognia', rubricScore: 2 })],
    })
    await s.svc.captureForSchool('school-A', 'nightly', day('2026-08-14'))
    expect(s.store[0].isDemo).toBe(false)
  })
})

describe('AccreditationSnapshotService — retention', () => {
  it('a 500-day-old daily row is pruned; that month’s LAST row survives', async () => {
    const s = makeService({ standards: [] })
    const now = day('2027-12-31')
    // Three readings in the same long-past month, all beyond the 400-day window.
    s.seed({ seriesKey: 'cognia_2022', snapshotDate: day('2026-08-10') })
    s.seed({ seriesKey: 'cognia_2022', snapshotDate: day('2026-08-18') })
    s.seed({ seriesKey: 'cognia_2022', snapshotDate: day('2026-08-29') })
    // A recent row, well inside the daily-retention window.
    s.seed({ seriesKey: 'cognia_2022', snapshotDate: day('2027-12-01') })

    const deleted = await s.svc.prune(now)
    expect(deleted).toBe(2)
    const kept = s.store.map((r) => r.snapshotDate.toISOString().slice(0, 10)).sort()
    expect(kept).toEqual(['2026-08-29', '2027-12-01'])
  })

  it('prunes each series independently — one series never thins another', async () => {
    const s = makeService({ standards: [] })
    s.seed({ seriesKey: 'cognia_2022', snapshotDate: day('2026-08-10') })
    s.seed({ seriesKey: 'cognia_2022', snapshotDate: day('2026-08-20') })
    s.seed({ seriesKey: 'nsbecs', snapshotDate: day('2026-08-11') })
    s.seed({ seriesKey: 'nsbecs', snapshotDate: day('2026-08-21') })

    await s.svc.prune(day('2027-12-31'))
    expect(s.store.map((r) => `${r.seriesKey}:${r.snapshotDate.toISOString().slice(0, 10)}`).sort()).toEqual(
      ['cognia_2022:2026-08-20', 'nsbecs:2026-08-21'],
    )
  })

  it('nothing inside the daily-retention window is ever pruned', async () => {
    const s = makeService({ standards: [] })
    s.seed({ seriesKey: 'cognia_2022', snapshotDate: day('2027-12-01') })
    s.seed({ seriesKey: 'cognia_2022', snapshotDate: day('2027-12-02') })
    expect(await s.svc.prune(day('2027-12-31'))).toBe(0)
    expect(s.store).toHaveLength(2)
  })
})

describe('AccreditationSnapshotService — event capture', () => {
  it('debounces to one capture per school per day and never throws into the caller', async () => {
    const s = makeService({
      standards: [stdRow({ id: 'a', code: 'C-1', frameworkId: 'fw-cognia', rubricScore: 3 })],
    })
    const spy = vi.spyOn(s.svc, 'captureForSchool')
    s.svc.captureOnEvent('school-A')
    s.svc.captureOnEvent('school-A')
    s.svc.captureOnEvent('school-A')
    await new Promise((r) => setTimeout(r, 0))
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('school-A', 'event')
  })
})
