import { describe, expect, it, vi } from 'vitest'
import type { User } from '@finrep/db'
import { PortfolioService } from './portfolio.service.js'
import { shapeForLens } from './portfolio-lens.js'
import type { PrismaService } from '../prisma/prisma.service.js'
import type { BillingService } from '../billing/billing.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase I — PortfolioService, against a hand-rolled Prisma double (the house
// pattern from readiness-history.service.spec.ts: a plain object with a vi.fn()
// per model method, no @nestjs/testing, no database).
//
// The headline spec here is API-7, the QUERY BUDGET. Everything else in this
// phase is downstream of one claim — that a forty-school diocese costs a FIXED
// number of queries rather than 5N — and a spec that cannot tell a set-based read
// from a per-school loop would leave that claim unproven.
// ─────────────────────────────────────────────────────────────────────────────

const USER = { id: 'user-1' } as unknown as User
const ORG = 'org-1'

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const TODAY = new Date()
const daysAgo = (n: number) => new Date(TODAY.getTime() - n * 86_400_000)

interface SchoolSeed {
  id: string
  name: string
  role?: 'owner' | 'accountant' | 'viewer'
  licensed?: boolean
  verifiedPct?: number | null
  selfScoredPct?: number
  band?: string | null
  baselineVerifiedPct?: number | null
  frameworkId?: string | null
  seriesKey?: string
  verifiedBasis?: string
  domainScores?: unknown
  enrollment?: number | null
  schoolType?: string | null
  gradeLow?: string | null
  gradeHigh?: string | null
  findings?: { severity: string; initiativeId?: string | null; ruleId?: string }[]
  initiatives?: {
    status: string
    dueDate?: Date | null
    updatedAt?: Date
    progressSource?: string | null
  }[]
  /** yyyy-mm-dd offsets in DAYS from today; negative = a LAPSED review date. */
  reviewDayOffsets?: number[]
  /** Observations keyed by the seed's initiative INDEX. */
  progressEvents?: { initiativeIndex: number; daysAgo: number; source: string; pct: number }[]
}

const COGNIA = {
  id: 'fw-cognia',
  code: 'cognia_2022',
  name: 'Cognia Performance Standards',
  indexMin: 100,
  indexMax: 400,
}
const MSA = { id: 'fw-msa', code: 'msa_cess', name: 'MSA-CESS', indexMin: null, indexMax: null }

/** Call log keyed `model.method`, so an O(N) fan-out is visible as a count. */
type CallLog = Map<string, number>

function makeDouble(seeds: SchoolSeed[]) {
  const calls: CallLog = new Map()
  /** Every `schoolId: { in: [...] }` the service ever asked for. */
  const askedAbout: string[] = []

  const bump = (k: string) => calls.set(k, (calls.get(k) ?? 0) + 1)
  const noteIds = (where: Record<string, unknown> | undefined) => {
    const s = (where as { schoolId?: { in?: string[] } } | undefined)?.schoolId
    if (s && Array.isArray(s.in)) askedAbout.push(...s.in)
  }

  const licensedIds = new Set(seeds.filter((s) => s.licensed !== false).map((s) => s.id))

  const snapshotRows = seeds
    .filter((s) => s.verifiedPct != null)
    .map((s) => ({
      schoolId: s.id,
      seriesKey: s.seriesKey ?? 'cognia_2022',
      snapshotDate: day(isoOf(daysAgo(1))),
      frameworkId: s.frameworkId === undefined ? COGNIA.id : s.frameworkId,
      readinessPct: 50,
      selfScoredPct: s.selfScoredPct ?? (s.verifiedPct as number),
      verifiedPct: s.verifiedPct as number,
      projectedIndex: 250,
      band: s.band ?? null,
      leafCount: 30,
      domainScores: s.domainScores ?? null,
      engineVersion: '1.0.0',
      verifiedBasis: s.verifiedBasis ?? 'exists',
      isDemo: false,
    }))

  const baselineRows = seeds
    .filter((s) => s.baselineVerifiedPct != null)
    .map((s) => ({
      schoolId: s.id,
      seriesKey: s.seriesKey ?? 'cognia_2022',
      snapshotDate: day(isoOf(daysAgo(120))),
      frameworkId: s.frameworkId === undefined ? COGNIA.id : s.frameworkId,
      readinessPct: 50,
      selfScoredPct: s.baselineVerifiedPct as number,
      verifiedPct: s.baselineVerifiedPct as number,
      projectedIndex: 240,
      band: null,
      leafCount: 30,
      domainScores: null,
      engineVersion: '1.0.0',
      verifiedBasis: s.verifiedBasis ?? 'exists',
      isDemo: false,
    }))

  const allSnapshots = [...snapshotRows, ...baselineRows]

  const findingRows = seeds.flatMap((s) =>
    (s.findings ?? []).map((f, i) => ({
      schoolId: s.id,
      severity: f.severity,
      initiativeId: f.initiativeId ?? null,
      ruleId: f.ruleId ?? `RULE-${i}`,
      horizonKind: 'none',
      horizonDate: null,
    })),
  )

  const initiativeRows = seeds.flatMap((s) =>
    (s.initiatives ?? []).map((i, n) => ({
      id: `${s.id}-init-${n}`,
      schoolId: s.id,
      status: i.status,
      dueDate: i.dueDate ?? null,
      updatedAt: i.updatedAt ?? TODAY,
      progressSource: i.progressSource ?? null,
    })),
  )

  const progressEventRows = seeds.flatMap((s) =>
    (s.progressEvents ?? []).map((e, n) => ({
      id: `${s.id}-ev-${n}`,
      schoolId: s.id,
      initiativeId: `${s.id}-init-${e.initiativeIndex}`,
      observedOn: day(isoOf(daysAgo(e.daysAgo))),
      source: e.source,
      pct: e.pct,
    })),
  )

  const prisma = {
    membership: {
      findMany: vi.fn(async () => {
        bump('membership.findMany')
        return seeds.map((s) => ({
          role: s.role ?? 'owner',
          school: {
            id: s.id,
            name: s.name,
            organizationId: ORG,
            county: 'Broward',
            district: null,
            schoolType: s.schoolType ?? 'parish',
            gradeLow: s.gradeLow ?? 'K',
            gradeHigh: s.gradeHigh ?? '8',
          },
        }))
      }),
    },
    organization: {
      findUnique: vi.fn(async () => {
        bump('organization.findUnique')
        return { id: ORG, name: 'Diocese' }
      }),
    },
    accreditationReadinessSnapshot: {
      groupBy: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        bump('accreditationReadinessSnapshot.groupBy')
        noteIds(where)
        const lte = (where as { snapshotDate?: { lte?: Date } }).snapshotDate?.lte
        const rows = allSnapshots.filter((r) => (lte ? r.snapshotDate <= lte : true))
        const byKey = new Map<string, (typeof rows)[number][]>()
        for (const r of rows) {
          const k = `${r.schoolId}|${r.seriesKey}`
          byKey.set(k, [...(byKey.get(k) ?? []), r])
        }
        return [...byKey.values()].map((list) => ({
          schoolId: list[0].schoolId,
          seriesKey: list[0].seriesKey,
          _max: {
            snapshotDate: list.reduce((a, b) => (a.snapshotDate > b.snapshotDate ? a : b))
              .snapshotDate,
          },
        }))
      }),
      findMany: vi.fn(async ({ where }: { where: { OR: Record<string, unknown>[] } }) => {
        bump('accreditationReadinessSnapshot.findMany')
        const keys = new Set(
          where.OR.map(
            (t) =>
              `${t.schoolId as string}|${t.seriesKey as string}|${(t.snapshotDate as Date).toISOString()}`,
          ),
        )
        return allSnapshots.filter((r) =>
          keys.has(`${r.schoolId}|${r.seriesKey}|${r.snapshotDate.toISOString()}`),
        )
      }),
    },
    accreditationFinding: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        bump('accreditationFinding.findMany')
        noteIds(where)
        const ids = new Set((where as { schoolId: { in: string[] } }).schoolId.in)
        return findingRows.filter((f) => ids.has(f.schoolId))
      }),
    },
    improvementInitiative: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        bump('improvementInitiative.findMany')
        noteIds(where)
        const ids = new Set((where as { schoolId: { in: string[] } }).schoolId.in)
        return initiativeRows.filter((i) => ids.has(i.schoolId))
      }),
    },
    accreditationFramework: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        bump('accreditationFramework.findMany')
        const ids = new Set(where.id.in)
        return [COGNIA, MSA].filter((f) => ids.has(f.id))
      }),
    },
    accreditationStandard: {
      // The REVIEW-DATE reads. Two group-bys: the earliest FUTURE date per school
      // and the latest LAPSED one. The double honours the `where` it is handed, so
      // a spec can seed a review date in the past and see what the service does
      // with it — the old double returned [] unconditionally, which is why an
      // overdue review went unnoticed.
      groupBy: vi.fn(async ({ where, _min, _max }: {
        where: Record<string, unknown>
        _min?: { reviewDate?: boolean }
        _max?: { reviewDate?: boolean }
      }) => {
        bump('accreditationStandard.groupBy')
        noteIds(where)
        const ids = new Set((where as { schoolId: { in: string[] } }).schoolId.in)
        const bound = (where as { reviewDate?: { gte?: Date; lt?: Date } }).reviewDate
        const out: { schoolId: string; _min: { reviewDate: Date | null }; _max: { reviewDate: Date | null } }[] = []
        for (const s of seeds) {
          if (!ids.has(s.id)) continue
          const dates = (s.reviewDayOffsets ?? [])
            .map((n) => day(isoOf(new Date(TODAY.getTime() + n * 86_400_000))))
            .filter((d) =>
              bound?.gte ? d >= bound.gte : bound?.lt ? d < bound.lt : true,
            )
          if (dates.length === 0) continue
          const min = dates.reduce((a, b) => (a < b ? a : b))
          const max = dates.reduce((a, b) => (a > b ? a : b))
          out.push({
            schoolId: s.id,
            _min: { reviewDate: _min?.reviewDate ? min : null },
            _max: { reviewDate: _max?.reviewDate ? max : null },
          })
        }
        return out.sort((a, b) => (a.schoolId < b.schoolId ? -1 : 1))
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        bump('accreditationStandard.findMany')
        noteIds(where)
        return []
      }),
    },
    accreditationEvidence: {
      groupBy: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        bump('accreditationEvidence.groupBy')
        noteIds(where)
        return []
      }),
    },
    accreditationCatalogStandard: {
      findMany: vi.fn(async () => {
        bump('accreditationCatalogStandard.findMany')
        return []
      }),
    },
    periodOperationalData: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        bump('periodOperationalData.findMany')
        noteIds(where)
        const ids = new Set((where as { schoolId: { in: string[] } }).schoolId.in)
        return seeds
          .filter((s) => ids.has(s.id))
          .map((s) => ({
            schoolId: s.id,
            enrollment: s.enrollment ?? 300,
            fiscalPeriod: { periodEndDate: day('2026-06-30') },
          }))
      }),
    },
    improvementProgressEvent: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        bump('improvementProgressEvent.findMany')
        noteIds(where)
        const ids = new Set((where as { schoolId: { in: string[] } }).schoolId.in)
        const from = (where as { observedOn?: { gte?: Date } }).observedOn?.gte
        return progressEventRows
          .filter((e) => ids.has(e.schoolId) && (from ? e.observedOn >= from : true))
          .sort(
            (a, b) =>
              (a.schoolId < b.schoolId ? -1 : a.schoolId > b.schoolId ? 1 : 0) ||
              (a.initiativeId < b.initiativeId ? -1 : a.initiativeId > b.initiativeId ? 1 : 0) ||
              a.observedOn.getTime() - b.observedOn.getTime() ||
              (a.id < b.id ? -1 : 1),
          )
      }),
    },
  }

  const billing = {
    isEntitledForModule: vi.fn(async (schoolId: string) => licensedIds.has(schoolId)),
  }

  const service = new PortfolioService(
    prisma as unknown as PrismaService,
    billing as unknown as BillingService,
  )

  return { service, prisma, billing, calls, askedAbout }
}

function isoOf(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Forty schools, all licensed, all measurable — the acceptance-7 fixture. */
function fortySchools(): SchoolSeed[] {
  return Array.from({ length: 40 }, (_, i) => ({
    id: `school-${String(i).padStart(2, '0')}`,
    name: `School ${i}`,
    verifiedPct: 40 + (i % 30),
    selfScoredPct: 60 + (i % 30),
    baselineVerifiedPct: 38 + (i % 30),
    verifiedBasis: 'current',
    domainScores: [{ domainKey: 'finance', verifiedPct: 30 + (i % 10) }],
    findings: [{ severity: 'warn' }, { severity: 'info', initiativeId: null }],
    initiatives: [{ status: 'in_progress' }],
  }))
}

// ── API-7 (the headline) ─────────────────────────────────────────────────────
describe('API-7 — THE QUERY BUDGET is fixed, not 5N', () => {
  // RED PROOF (run): replacing readLatestSnapshots' tuple read with
  //   for (const id of schoolIds) await prisma.accreditationReadinessSnapshot.findFirst(...)
  // makes accreditationReadinessSnapshot.findFirst fire 40 times; the
  // "no model method more than twice" assertion reports 40 and this goes red.
  it('a 40-school organization costs at most 15 queries, and no method more than twice', async () => {
    const { service, calls } = makeDouble(fortySchools())
    await service.getPortfolio(USER, ORG, {})

    const total = [...calls.values()].reduce((a, b) => a + b, 0)
    const worst = [...calls.entries()].sort((a, b) => b[1] - a[1])[0]
    expect(total, `queries: ${JSON.stringify([...calls])}`).toBeLessThanOrEqual(15)
    expect(worst[1], `${worst[0]} was called ${worst[1]} times — that is a fan-out`).toBeLessThanOrEqual(
      2,
    )
  })

  it('the cost does not grow with the number of schools', async () => {
    // The actual claim, tested as a claim: 4 schools and 40 schools cost the same.
    const small = makeDouble(fortySchools().slice(0, 4))
    await small.service.getPortfolio(USER, ORG, {})
    const big = makeDouble(fortySchools())
    await big.service.getPortfolio(USER, ORG, {})
    const sum = (c: CallLog) => [...c.values()].reduce((a, b) => a + b, 0)
    expect(sum(big.calls)).toBe(sum(small.calls))
  })

  it('the per-school entitlement fan-out is BOUNDED, not unbounded', async () => {
    // Entitlement is the one thing checked per school, and it runs through
    // mapWithConcurrency at ORG_FANOUT_CONCURRENCY. Observed rather than asserted
    // over source: count how many are in flight at once.
    let inFlight = 0
    let maxInFlight = 0
    const { service, billing } = makeDouble(fortySchools())
    billing.isEntitledForModule.mockImplementation(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 0))
      inFlight -= 1
      return true
    })
    await service.getPortfolio(USER, ORG, {})
    expect(maxInFlight).toBeLessThanOrEqual(4)
    expect(billing.isEntitledForModule).toHaveBeenCalledTimes(40)
  })

  it('a failing entitlement read is FAIL-CLOSED — the school is not licensed', async () => {
    const { service, billing } = makeDouble(fortySchools().slice(0, 3))
    billing.isEntitledForModule.mockImplementation(async (id: string) => {
      if (id === 'school-01') throw new Error('billing down')
      return true
    })
    const res = await service.getPortfolio(USER, ORG, {})
    expect(res.notLicensed.map((n) => n.schoolId)).toEqual(['school-01'])
  })
})

// ── API-4 ────────────────────────────────────────────────────────────────────
describe('API-4 — an unlicensed school discloses its NAME and nothing else', () => {
  const seeds: SchoolSeed[] = [
    {
      id: 'school-a',
      name: 'Licensed A',
      verifiedPct: 61,
      selfScoredPct: 62,
      baselineVerifiedPct: 60,
      verifiedBasis: 'current',
      domainScores: [{ domainKey: 'finance', verifiedPct: 55 }],
      findings: [{ severity: 'warn' }],
      initiatives: [{ status: 'planned' }],
    },
    {
      id: 'school-b',
      name: 'Licensed B',
      verifiedPct: 71,
      selfScoredPct: 72,
      baselineVerifiedPct: 70,
      verifiedBasis: 'current',
      domainScores: [{ domainKey: 'finance', verifiedPct: 65 }],
      findings: [{ severity: 'info' }],
      initiatives: [{ status: 'planned' }],
    },
    {
      id: 'school-locked',
      name: 'Locked Academy',
      licensed: false,
      // Deliberately distinctive: 37 appears nowhere else in this fixture, so if
      // any readiness figure for this school reached the payload it is visible.
      verifiedPct: 37,
      band: 'high',
      findings: [{ severity: 'critical' }, { severity: 'critical' }],
    },
  ]

  // RED PROOF (run): pushing the locked school's full row into `ranked` and
  // filtering it out in the controller instead makes both assertions below red —
  // the id appears twice in the JSON and `37` appears in it.
  it('lands in notLicensed[] with exactly {schoolId, name}, and no readiness anywhere', async () => {
    const { service } = makeDouble(seeds)
    const res = await service.getPortfolio(USER, ORG, {})

    expect(res.notLicensed).toEqual([{ schoolId: 'school-locked', name: 'Locked Academy' }])
    expect(Object.keys(res.notLicensed[0]).sort()).toEqual(['name', 'schoolId'])

    // `generatedAt` is a wall-clock ISO string and WILL contain '37' roughly once
    // a minute (…:37.…), which made this guard fail at random rather than on a
    // regression. Stripping the two clock fields keeps the claim — no readiness
    // figure for the locked school anywhere — and removes the flake.
    const json = JSON.stringify({ ...res, generatedAt: 'X', asOf: 'X' })
    expect(json.split('school-locked').length - 1).toBe(1)
    expect(json).not.toContain('37')
    // Its band, specifically as a VALUE (`"high"` also occurs as a bandDistribution
    // COUNT key on every response, which is not a disclosure about any school).
    expect(json).not.toContain('"band":"high"')
    expect(res.ranked.some((r) => r.schoolId === 'school-locked')).toBe(false)
    expect(res.insufficientData.some((r) => r.schoolId === 'school-locked')).toBe(false)
  })

  it('never even ASKS the database about the unlicensed school', async () => {
    // The strongest form of the claim: there is no readiness to leak because none
    // was ever read. A filter applied after the read would pass the assertion
    // above and fail this one.
    const { service, askedAbout } = makeDouble(seeds)
    await service.getPortfolio(USER, ORG, {})
    expect(askedAbout.length).toBeGreaterThan(0)
    expect(askedAbout).not.toContain('school-locked')
  })
})

// ── API-8 ────────────────────────────────────────────────────────────────────
describe('API-8 — two identical refreshes are byte-identical', () => {
  it('produces the same payload apart from generatedAt', async () => {
    const seeds = fortySchools()
    const a = makeDouble(seeds)
    const b = makeDouble(seeds)
    const one = await a.service.getPortfolio(USER, ORG, {})
    const two = await b.service.getPortfolio(USER, ORG, {})
    const strip = (r: unknown) =>
      JSON.stringify({ ...(r as Record<string, unknown>), generatedAt: 'X' })
    expect(strip(one)).toBe(strip(two))
  })

  it('and the same ordering even when the database returns rows in another order', async () => {
    // Determinism must not depend on a natural row order.
    const seeds = fortySchools()
    const a = makeDouble(seeds)
    const b = makeDouble([...seeds].reverse())
    const one = await a.service.getPortfolio(USER, ORG, {})
    const two = await b.service.getPortfolio(USER, ORG, {})
    expect(one.ranked.map((r) => r.schoolId)).toEqual(two.ranked.map((r) => r.schoolId))
  })
})

// ── API-11 ───────────────────────────────────────────────────────────────────
describe('API-11 — a peer panel below four peers shows a rank and NO percentile', () => {
  const peerSeeds = (n: number): SchoolSeed[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `peer-${i}`,
      name: `Peer ${i}`,
      verifiedPct: 50 + i,
      selfScoredPct: 60 + i,
      baselineVerifiedPct: 48 + i,
      verifiedBasis: 'current',
      domainScores: [{ domainKey: 'finance', verifiedPct: 40 + i }],
      findings: [{ severity: 'info' }],
      initiatives: [{ status: 'planned' }],
      enrollment: 300,
      schoolType: 'parish',
      gradeLow: 'K',
      gradeHigh: '8',
    }))

  // RED PROOF (run): emitting `stats.percentile` unconditionally (dropping the
  // peerCount < MIN_PEERS_FOR_PERCENTILE guard) makes the 4-school case report a
  // number and this goes red.
  it('4 schools → 3 peers → percentile null, rank present', async () => {
    const { service } = makeDouble(peerSeeds(4))
    const res = await service.getPortfolio(USER, ORG, {})
    for (const row of res.ranked) {
      expect(row.peers, row.schoolId).not.toBeNull()
      expect(row.peers!.peerCount).toBe(3)
      expect(row.peers!.percentile).toBeNull()
      expect(typeof row.peers!.rank).toBe('number')
      expect(row.peers!.sample).toBe('small')
    }
  })

  it('6 schools → 5 peers → percentile present', async () => {
    const { service } = makeDouble(peerSeeds(6))
    const res = await service.getPortfolio(USER, ORG, {})
    for (const row of res.ranked) {
      expect(row.peers!.peerCount).toBe(5)
      expect(typeof row.peers!.percentile).toBe('number')
      expect(row.peers!.sample).toBe('rich')
    }
  })
})

// ── API-5 ────────────────────────────────────────────────────────────────────
describe('API-5 — the viewer lens omits owner names and per-initiative detail, and changes NO number', () => {
  const fixture = {
    orgId: ORG,
    ranked: [
      {
        schoolId: 's1',
        attentionScore: 42,
        verifiedPct: 61,
        owner: 'Maria Delgado',
        ownerUserId: 'u-9',
        initiativeTitles: ['Rewrite the finance policy'],
        drivers: [{ component: 'readinessLevel', contributionBp: 12, detail: '61% defensible' }],
      },
    ],
    priorities: [
      {
        catalogStandardId: 'cat-1',
        schoolsBelowThreshold: 9,
        schools: [{ schoolId: 's1', name: 'St. Mary', rubricScore: 2 }],
      },
    ],
    notes: ['a note'],
  }

  // RED PROOF (run, both halves):
  //  (a) NULLING the owner name instead of deleting the key — the key-shape
  //      assertion catches it, because a null owner still tells you the record has
  //      one and still invites a UI to render a slot for it;
  //  (b) leaking a name into a driver `detail` — the recursive string walk catches
  //      it even though no key is named `owner`.
  it('owner keys are ABSENT, not null, at any depth', () => {
    const viewer = shapeForLens(fixture, 'viewer') as Record<string, unknown>
    const keys: string[] = []
    const walk = (v: unknown) => {
      if (Array.isArray(v)) return v.forEach(walk)
      if (v && typeof v === 'object') {
        for (const [k, x] of Object.entries(v)) {
          keys.push(k)
          walk(x)
        }
      }
    }
    walk(viewer)
    expect(keys.filter((k) => /owner/i.test(k))).toEqual([])
    expect(keys).not.toContain('initiativeTitles')
    // The intervention breakdown: a board sees the COUNT, not the roster.
    expect(keys).not.toContain('schools')
    expect(keys).toContain('schoolsBelowThreshold')
  })

  it('no owner name survives anywhere in the payload, including inside strings', () => {
    const viewer = shapeForLens(fixture, 'viewer')
    const strings: string[] = []
    const walk = (v: unknown) => {
      if (typeof v === 'string') strings.push(v)
      else if (Array.isArray(v)) v.forEach(walk)
      else if (v && typeof v === 'object') Object.values(v).forEach(walk)
    }
    walk(viewer)
    expect(strings.some((s) => s.includes('Maria Delgado'))).toBe(false)
  })

  it('EVERY number is byte-identical to the owner payload once the omitted keys are stripped', () => {
    // The Scope × Lens invariant this codebase has held since Phase 1: two people
    // never see disagreeing numbers.
    const ownerPayload = shapeForLens(fixture, 'owner')
    const viewer = shapeForLens(fixture, 'viewer')
    const expected = {
      orgId: ORG,
      ranked: [
        {
          schoolId: 's1',
          attentionScore: 42,
          verifiedPct: 61,
          drivers: [{ component: 'readinessLevel', contributionBp: 12, detail: '61% defensible' }],
        },
      ],
      priorities: [{ catalogStandardId: 'cat-1', schoolsBelowThreshold: 9 }],
      notes: ['a note'],
    }
    expect(viewer).toEqual(expected)
    // …and the owner path is untouched, by identity.
    expect(ownerPayload).toBe(fixture)
  })

  it('the service applies it: a viewer-everywhere caller gets viewer, with identical figures', async () => {
    const seeds = fortySchools().map((s) => ({ ...s, role: 'viewer' as const }))
    const asViewer = await makeDouble(seeds).service.getPortfolio(USER, ORG, {})
    const asOwner = await makeDouble(fortySchools()).service.getPortfolio(USER, ORG, {})
    expect(asViewer.lens).toBe('viewer')
    expect(asViewer.callerRole).toBe('viewer')
    expect(asViewer.availableLenses).toEqual(['viewer'])
    expect(asOwner.lens).toBe('owner')
    expect(asViewer.ranked.map((r) => [r.schoolId, r.attentionScore, r.verifiedPct])).toEqual(
      asOwner.ranked.map((r) => [r.schoolId, r.attentionScore, r.verifiedPct]),
    )
  })

  it('a lens override may only NARROW — an accountant asking for owner is clamped', async () => {
    const seeds = fortySchools().map((s) => ({ ...s, role: 'accountant' as const }))
    const res = await makeDouble(seeds).service.getPortfolio(USER, ORG, { lens: 'owner' })
    expect(res.lens).toBe('accountant')
  })
})

// ── HONESTY ──────────────────────────────────────────────────────────────────
describe('the portfolio refuses to rank what it cannot measure', () => {
  it('a school with no snapshot and no ledger is UNRANKED with the components NAMED', async () => {
    const seeds: SchoolSeed[] = [
      {
        id: 'measured',
        name: 'Measured',
        verifiedPct: 55,
        selfScoredPct: 70,
        baselineVerifiedPct: 50,
        verifiedBasis: 'current',
        domainScores: [{ domainKey: 'finance', verifiedPct: 40 }],
        findings: [{ severity: 'warn' }],
        initiatives: [{ status: 'planned' }],
      },
      { id: 'dark', name: 'Dark School', verifiedPct: null },
    ]
    const { service } = makeDouble(seeds)
    const res = await service.getPortfolio(USER, ORG, {})

    const dark = res.insufficientData.find((r) => r.schoolId === 'dark')
    expect(dark, 'a school with no readiness must not be ranked').toBeDefined()
    expect(dark!.missingComponents.length).toBeGreaterThanOrEqual(3)
    // Named, not merely counted.
    expect(dark!.missingComponents.map((m) => m.component)).toContain('readinessLevel')
    for (const m of dark!.missingComponents) expect(m.reason).toBeTruthy()
    // NOTHING on the row can render as "steady".
    expect('attentionScore' in (dark as object)).toBe(false)
    expect('attentionBand' in (dark as object)).toBe(false)
  })

  it("evidenceCurrency is missing AND SAID TO BE MISSING while the basis is 'exists'", async () => {
    const seeds: SchoolSeed[] = [
      {
        id: 'pre-c',
        name: 'Pre Phase C',
        verifiedPct: 55,
        selfScoredPct: 90,
        baselineVerifiedPct: 50,
        verifiedBasis: 'exists',
        domainScores: [{ domainKey: 'finance', verifiedPct: 40 }],
        findings: [],
        initiatives: [],
      },
    ]
    const res = await makeDouble(seeds).service.getPortfolio(USER, ORG, {})
    const row = res.ranked[0] ?? null
    const missing =
      row?.components.evidenceCurrency ??
      res.insufficientData[0]?.missingComponents.find((m) => m.component === 'evidenceCurrency')
    expect(missing).toBeDefined()
    // A 35-point optimism gap is NOT folded in at full confidence.
    const known = (row?.components.evidenceCurrency as { known?: boolean } | undefined)?.known
    expect(known ?? false).toBe(false)
  })

  it('the disclaimer is a FIRST-CLASS PAYLOAD FIELD, not UI chrome', async () => {
    const res = await makeDouble(fortySchools()).service.getPortfolio(USER, ORG, {})
    expect(res.disclaimer).toContain('Not an accreditation product')
    expect(res.engineVersion).toBeTruthy()
  })

  it('a mixed-framework diocese reports indexComparable:false with a stated note', async () => {
    const seeds = fortySchools().map((s, i) =>
      i % 2 === 0
        ? s
        : { ...s, frameworkId: MSA.id, seriesKey: 'msa_cess' },
    )
    const res = await makeDouble(seeds).service.getPortfolio(USER, ORG, {})
    expect(res.indexComparable).toBe(false)
    expect(res.bandDistribution.length).toBeGreaterThan(1)
    expect(res.notes.join(' ')).toMatch(/different accreditation frameworks/i)
  })

  // ── REVIEWER FINDING: an OVERDUE review reported as "no scheduled review" ──
  // RED PROOF (run): restoring `reviewDate: { gte: today }` as the only read in
  // readNextReviewDays makes the lapsed school report
  // `urgency: 0, urgencyReason: 'no_scheduled_review', urgencyDaysToReview: null`
  // and every assertion in the first block below reddens.
  it('a LAPSED review is urgency 3 and says so — it is not "no scheduled review"', async () => {
    const base: SchoolSeed = {
      id: 'lapsed',
      name: 'Lapsed Review',
      verifiedPct: 55,
      selfScoredPct: 70,
      baselineVerifiedPct: 50,
      verifiedBasis: 'current',
      domainScores: [{ domainKey: 'finance', verifiedPct: 40 }],
      findings: [{ severity: 'warn' }],
      initiatives: [{ status: 'planned' }],
    }
    const lapsed = await makeDouble([{ ...base, reviewDayOffsets: [-60] }]).service.getPortfolio(
      USER,
      ORG,
      {},
    )
    const row = lapsed.ranked[0]
    expect(row.urgencyDaysToReview).toBe(-60)
    expect(row.urgency).toBe(3)
    expect(row.urgencyReason).toBe('review_overdue')

    // …and a FUTURE date still wins over a lapsed one at the same school.
    const both = await makeDouble([
      { ...base, reviewDayOffsets: [-60, 300] },
    ]).service.getPortfolio(USER, ORG, {})
    expect(both.ranked[0].urgencyDaysToReview).toBe(300)
    expect(both.ranked[0].urgencyReason).toBe('visit_within_year')

    // …and a school with NO review date at all still says so truthfully.
    const none = await makeDouble([base]).service.getPortfolio(USER, ORG, {})
    expect(none.ranked[0].urgencyDaysToReview).toBeNull()
    expect(none.ranked[0].urgencyReason).toBe('no_scheduled_review')
  })

  it('the most OVERDUE school sorts above one whose visit is two years out', async () => {
    // Urgency is comparator key 2. Before the fix the overdue school landed in the
    // bottom tier and sorted BELOW the distant one inside the same attention band.
    const mk = (id: string, offsets: number[]): SchoolSeed => ({
      id,
      name: `School ${id}`,
      verifiedPct: 55,
      selfScoredPct: 70,
      baselineVerifiedPct: 50,
      verifiedBasis: 'current',
      domainScores: [{ domainKey: 'finance', verifiedPct: 40 }],
      findings: [{ severity: 'warn' }],
      initiatives: [{ status: 'planned' }],
      reviewDayOffsets: offsets,
    })
    const res = await makeDouble([mk('a-distant', [700]), mk('b-overdue', [-90])]).service.getPortfolio(
      USER,
      ORG,
      {},
    )
    expect(res.ranked.map((r) => r.schoolId)).toEqual(['b-overdue', 'a-distant'])
  })

  // ── REVIEWER FINDING: citationOverdue was structurally always false ──────────
  // RED PROOF (run): restoring `citationOverdue` to the by-date scan over
  // ACC-PRIOR-FINDING-OPEN makes every ranked row report `false`, and both
  // assertions below redden.
  it('citation overdue is NOT ASSESSED, and the payload names the absence', async () => {
    const res = await makeDouble(fortySchools()).service.getPortfolio(USER, ORG, {})
    for (const row of res.ranked) {
      expect(row.citationOverdue, row.schoolId).toBeNull()
      expect(row.citationOverdue).not.toBe(false)
    }
    expect(res.notes.join(' ')).toMatch(/not assessed/i)
  })

  // ── REVIEWER FINDING: 'none' seriesKey counted as a framework ────────────────
  // RED PROOF (run): restoring `frameworkCode: framework?.code ?? latest?.seriesKey`
  // makes the note claim 2 frameworks and puts a bandDistribution bucket keyed
  // "none" on the payload; all three assertions redden.
  it("a school with NO framework is not counted as following one called 'none'", async () => {
    const seeds: SchoolSeed[] = [
      {
        id: 's-cog',
        name: 'Cognia School',
        verifiedPct: 60,
        selfScoredPct: 70,
        baselineVerifiedPct: 58,
        verifiedBasis: 'current',
        domainScores: [{ domainKey: 'finance', verifiedPct: 40 }],
        findings: [{ severity: 'warn' }],
        initiatives: [{ status: 'planned' }],
      },
      {
        id: 's-none',
        name: 'No Framework School',
        frameworkId: null,
        seriesKey: 'none',
        verifiedPct: 50,
        selfScoredPct: 65,
        baselineVerifiedPct: 48,
        verifiedBasis: 'current',
        domainScores: [{ domainKey: 'finance', verifiedPct: 35 }],
        findings: [{ severity: 'warn' }],
        initiatives: [{ status: 'planned' }],
      },
    ]
    const res = await makeDouble(seeds).service.getPortfolio(USER, ORG, {})
    const noneRow = res.ranked.find((r) => r.schoolId === 's-none')!
    expect(noneRow.frameworkCode).toBeNull()
    // The frozen multi-framework sentence names a COUNT; it must not be emitted
    // for an org where only one school follows a framework at all.
    expect(res.notes.join(' ')).not.toMatch(/2 different accreditation frameworks/i)
    // The purpose-built branch fires instead.
    expect(res.notes.join(' ')).toMatch(/no accreditation framework on record/i)
    expect(res.bandDistribution.map((b) => b.frameworkCode)).not.toContain('none')
  })

  // ── REVIEWER FINDING: ?frameworkCode= made a measured school look unmeasured ──
  // RED PROOF (run): restoring the pre-scoring `frameworkCode` filter inside
  // buildSchoolInput puts s-msa into insufficientData[] with
  // missingComponents naming 'no_readiness_snapshot' — the first two assertions
  // redden immediately.
  it('?frameworkCode= PARTITIONS: an off-framework school is not called unmeasured', async () => {
    const seeds: SchoolSeed[] = [
      {
        id: 's-cog',
        name: 'Cognia School',
        verifiedPct: 60,
        selfScoredPct: 70,
        baselineVerifiedPct: 58,
        verifiedBasis: 'current',
        domainScores: [{ domainKey: 'finance', verifiedPct: 40 }],
        findings: [{ severity: 'warn' }],
        initiatives: [{ status: 'planned' }],
      },
      {
        id: 's-msa',
        name: 'MSA School',
        frameworkId: MSA.id,
        seriesKey: 'msa_cess',
        verifiedPct: 70,
        selfScoredPct: 80,
        baselineVerifiedPct: 65,
        verifiedBasis: 'current',
        domainScores: [{ domainKey: 'finance', verifiedPct: 55 }],
        findings: [{ severity: 'warn' }],
        initiatives: [{ status: 'planned' }],
      },
    ]
    const res = await makeDouble(seeds).service.getPortfolio(USER, ORG, {
      frameworkCode: 'cognia_2022',
    })

    // NOT in insufficientData, and specifically not with a false reason.
    expect(res.insufficientData.map((r) => r.schoolId)).not.toContain('s-msa')
    const json = JSON.stringify(res.insufficientData)
    expect(json).not.toContain('no_readiness_snapshot')

    // In its own stated bucket, with its own framework named.
    expect(res.otherFramework).toEqual([
      { schoolId: 's-msa', name: 'MSA School', frameworkCode: 'msa_cess', frameworkName: 'MSA-CESS' },
    ])
    expect(res.notes.join(' ')).toMatch(/different accreditation framework and are excluded/i)
    expect(res.ranked.map((r) => r.schoolId)).toEqual(['s-cog'])

    // A school with NO snapshot at all still lands in insufficientData — the
    // filter must not swallow a genuine measurement gap.
    const withDark = await makeDouble([
      ...seeds,
      { id: 'dark', name: 'Dark School', verifiedPct: null },
    ]).service.getPortfolio(USER, ORG, { frameworkCode: 'cognia_2022' })
    expect(withDark.insufficientData.map((r) => r.schoolId)).toContain('dark')
    expect(withDark.otherFramework.map((r) => r.schoolId)).toEqual(['s-msa'])
  })

  it('a caller with no membership in this organization is refused', async () => {
    const { service, prisma } = makeDouble(fortySchools())
    prisma.membership.findMany.mockResolvedValueOnce([
      {
        role: 'owner',
        school: {
          id: 'x',
          name: 'Elsewhere',
          organizationId: 'other-org',
          county: null,
          district: null,
          schoolType: null,
          gradeLow: null,
          gradeHigh: null,
        },
      },
    ] as never)
    await expect(service.getPortfolio(USER, ORG, {})).rejects.toThrow(
      /do not have access to this organization/i,
    )
  })
})

// ── VELOCITY ─────────────────────────────────────────────────────────────────
// Three reviewer findings, all of them about the same claim: that the movement
// figure on the diocesan page describes the improvement work that is actually
// open, measured on one series, and reported the same way twice.
describe('improvement velocity measures ONE series of OPEN work', () => {
  /** One school, `n` initiatives, each with a declared progress source. */
  const withInitiatives = (
    initiatives: SchoolSeed['initiatives'],
    progressEvents: SchoolSeed['progressEvents'],
  ): SchoolSeed[] => [
    {
      id: 'sch-v',
      name: 'Velocity School',
      verifiedPct: 55,
      selfScoredPct: 70,
      baselineVerifiedPct: 50,
      verifiedBasis: 'current',
      domainScores: [{ domainKey: 'finance', verifiedPct: 40 }],
      findings: [],
      initiatives,
      progressEvents,
    },
  ]

  // RED PROOF (run): dropping the `e.source !== initiative.progressSource` guard
  // makes this report deltaPctPoints -40 with basis 'observed' and org.declined 1
  // — the opposite verdict, from the same rows.
  it('never differences a reading against one from ANOTHER measurement source', async () => {
    const seeds = withInitiatives(
      [{ status: 'in_progress', progressSource: 'metric' }],
      [
        // Same day, two sources — the schema's @@unique([initiativeId, observedOn,
        // source]) explicitly permits this.
        { initiativeIndex: 0, daysAgo: 60, source: 'milestone', pct: 0.2 },
        { initiativeIndex: 0, daysAgo: 60, source: 'manual', pct: 0.9 },
        { initiativeIndex: 0, daysAgo: 5, source: 'metric', pct: 0.5 },
      ],
    )
    const res = await makeDouble(seeds).service.getVelocity(USER, ORG, {})
    // Only ONE reading is on the initiative's own series, so there is nothing to
    // difference and the honest answer is "insufficient", with the reason.
    expect(res.schools[0].basis).toBe('insufficient')
    expect(res.schools[0].deltaPctPoints).toBeNull()
    expect(res.schools[0].reason).toMatch(/measurement series/i)
    expect(res.org.improved).toBe(0)
    expect(res.org.declined).toBe(0)
  })

  it('measures the initiative’s OWN series when two readings of it exist', async () => {
    const seeds = withInitiatives(
      [{ status: 'in_progress', progressSource: 'metric' }],
      [
        { initiativeIndex: 0, daysAgo: 60, source: 'metric', pct: 0.2 },
        { initiativeIndex: 0, daysAgo: 60, source: 'manual', pct: 0.95 },
        { initiativeIndex: 0, daysAgo: 5, source: 'metric', pct: 0.5 },
      ],
    )
    const res = await makeDouble(seeds).service.getVelocity(USER, ORG, {})
    expect(res.schools[0].basis).toBe('observed')
    expect(res.schools[0].deltaPctPoints).toBe(30)
    expect(res.org.improved).toBe(1)
  })

  // RED PROOF (run): removing the CLOSED_INITIATIVE_STATUSES guard from the
  // grouping loop makes org.initiativesWithObservations read 8 against
  // org.initiatives 2 — the "8 of 2" ratio the panel renders verbatim — and
  // schools[0].deltaPctPoints read +80.
  it('CLOSED initiatives count on NEITHER side of the ratio', async () => {
    const done = Array.from({ length: 8 }, () => ({
      status: 'done',
      progressSource: 'metric' as const,
    }))
    const open = [
      { status: 'in_progress', progressSource: 'metric' },
      { status: 'planned', progressSource: 'metric' },
    ]
    const events = Array.from({ length: 8 }, (_, i) => [
      { initiativeIndex: i, daysAgo: 60, source: 'metric', pct: 0.1 },
      { initiativeIndex: i, daysAgo: 5, source: 'metric', pct: 0.9 },
    ]).flat()
    const res = await makeDouble(withInitiatives([...done, ...open], events)).service.getVelocity(
      USER,
      ORG,
      {},
    )
    expect(res.org.initiatives).toBe(2)
    expect(res.org.initiativesWithObservations).toBe(0)
    expect(res.org.initiativesWithObservations).toBeLessThanOrEqual(res.org.initiatives)
    expect(res.org.improved).toBe(0)
    expect(res.schools[0].deltaPctPoints).toBeNull()
    expect(res.schools[0].basis).toBe('insufficient')
  })

  it('the ratio can never read “N of fewer-than-N”', async () => {
    // The general claim, over a mixture of open, closed and status-only work.
    const seeds = withInitiatives(
      [
        { status: 'done', progressSource: 'metric' },
        { status: 'cancelled', progressSource: 'metric' },
        { status: 'in_progress', progressSource: 'metric' },
        { status: 'in_progress', progressSource: null },
      ],
      [0, 1, 2, 3].flatMap((i) => [
        { initiativeIndex: i, daysAgo: 60, source: 'metric', pct: 0.1 },
        { initiativeIndex: i, daysAgo: 5, source: 'metric', pct: 0.6 },
      ]),
    )
    const res = await makeDouble(seeds).service.getVelocity(USER, ORG, {})
    expect(res.org.initiatives).toBe(2)
    expect(res.org.initiativesWithObservations).toBe(1)
    expect(res.schools[0].deltaPctPoints).toBe(50)
  })

  it('a school with only non-comparable observations says so, and shows no zero', async () => {
    const seeds = withInitiatives(
      [{ status: 'in_progress', progressSource: 'metric' }],
      [
        { initiativeIndex: 0, daysAgo: 60, source: 'manual', pct: 0.2 },
        { initiativeIndex: 0, daysAgo: 5, source: 'manual', pct: 0.9 },
      ],
    )
    const res = await makeDouble(seeds).service.getVelocity(USER, ORG, {})
    const row = res.schools[0]
    expect(row.basis).toBe('insufficient')
    expect(row.deltaPctPoints).toBeNull()
    // The observations WERE recorded — the ledger count stays true — but none of
    // them is on the initiative's own series, and the sentence says exactly that.
    expect(row.observations).toBe(2)
    expect(row.comparableObservations).toBe(0)
    expect(row.reason).toMatch(/none on an open initiative's own declared measurement series/i)
  })
})

// ── INTERVENTION PRIORITIES ──────────────────────────────────────────────────
describe('intervention priorities state how many they withheld', () => {
  // RED PROOF (run): dropping `totalPriorities` from the payload makes the first
  // assertion undefined and reddens.
  it('carries the PRE-SLICE total alongside the truncated list', async () => {
    const res = await makeDouble(fortySchools()).service.getInterventionPriorities(USER, ORG, {})
    expect(typeof (res as { totalPriorities?: number }).totalPriorities).toBe('number')
    expect((res as { limit?: number }).limit).toBe(10)
    expect((res as { totalPriorities: number }).totalPriorities).toBeGreaterThanOrEqual(
      (res as { priorities: unknown[] }).priorities.length,
    )
  })
})
