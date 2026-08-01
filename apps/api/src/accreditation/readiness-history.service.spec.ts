import { describe, expect, it, vi } from 'vitest'
import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import { HttpException, NotFoundException } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'
import type { Reflector } from '@nestjs/core'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { REQUIRES_MODULE } from '../billing/requires-module.decorator.js'
import type { BillingService } from '../billing/billing.service.js'
import { AccreditationReadinessHistoryController } from './readiness-history.controller.js'
import { AccreditationReadinessHistoryService } from './readiness-history.service.js'
import { ReadinessDiffQueryDto, ReadinessTrendQueryDto } from './dto/readiness-trend-query.dto.js'

// ─────────────────────────────────────────────────────────────────────────────
// AccreditationReadinessHistoryService — the READ side.
//
// This service must never be the place a number gets invented. The tests below
// pin the four ways it is allowed to say "I don't know":
//   • too few readings                → insufficient_history + a reason
//   • a comparability break in range  → insufficient_history NAMING the break
//   • governance not licensed         → boardMarker unavailable, still HTTP 200
//   • no reading before a diff bound  → 404 NO_SNAPSHOT_BEFORE
// …plus the invariant that every query is schoolId-scoped.
// ─────────────────────────────────────────────────────────────────────────────

const COGNIA = {
  id: 'fw-cognia',
  code: 'cognia_2022',
  accreditor: 'Cognia',
  name: 'Cognia Performance Standards',
  version: '2022',
  statusBands: [],
  indexMin: 100,
  indexMax: 400,
  defaultTarget: 280,
}

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

/** An explicit window, so these tests never depend on the machine's clock. */
const WINDOW = { from: '2026-01-01', to: '2026-12-31' }

interface SeedRow {
  schoolId?: string
  seriesKey?: string
  date: string
  readinessPct: number
  leafCount?: number
  engineVersion?: string
  frameworkId?: string | null
  isDemo?: boolean
  leafScores?: unknown[]
  /** AIC Phase C — 'exists' (Phase A default) | 'current'. */
  verifiedBasis?: string
}

function row(r: SeedRow) {
  return {
    schoolId: r.schoolId ?? 'school-A',
    seriesKey: r.seriesKey ?? 'cognia_2022',
    snapshotDate: day(r.date),
    readinessPct: r.readinessPct,
    selfScoredPct: r.readinessPct,
    verifiedPct: r.readinessPct,
    projectedIndex: 200 + r.readinessPct,
    band: null,
    leafCount: r.leafCount ?? 10,
    scoredCount: 5,
    coveredCount: 5,
    engineVersion: r.engineVersion ?? '1.0.0',
    // Already-recorded rows carry the column DEFAULT, which is the whole
    // mechanism: no backfill, no clock, exactly one break.
    verifiedBasis: r.verifiedBasis ?? 'exists',
    frameworkId: r.frameworkId === undefined ? 'fw-cognia' : r.frameworkId,
    isDemo: r.isDemo ?? false,
    leafScores: r.leafScores ?? [],
  }
}

function makeService(opts: {
  rows?: ReturnType<typeof row>[]
  meetings?: { scheduledAt: Date }[]
  governanceLicensed?: boolean
}) {
  const rows = opts.rows ?? []
  const seen: { where: Record<string, unknown> }[] = []

  const match = (where: Record<string, unknown>) => {
    seen.push({ where })
    const w = where as {
      schoolId?: string
      seriesKey?: string
      isDemo?: boolean
      snapshotDate?: Date | { gte?: Date; lte?: Date; lt?: Date }
    }
    return rows.filter((r) => {
      if (w.schoolId !== undefined && r.schoolId !== w.schoolId) return false
      if (w.seriesKey !== undefined && r.seriesKey !== w.seriesKey) return false
      if (w.isDemo !== undefined && r.isDemo !== w.isDemo) return false
      const d = w.snapshotDate
      if (d instanceof Date) return r.snapshotDate.getTime() === d.getTime()
      if (d) {
        const t = r.snapshotDate.getTime()
        if (d.gte && t < d.gte.getTime()) return false
        if (d.lte && t > d.lte.getTime()) return false
        if (d.lt && t >= d.lt.getTime()) return false
      }
      return true
    })
  }

  const prisma = {
    accreditationReadinessSnapshot: {
      groupBy: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const hits = match(where)
        const bySeries = new Map<string, typeof rows>()
        for (const r of hits) {
          bySeries.set(r.seriesKey, [...(bySeries.get(r.seriesKey) ?? []), r])
        }
        return [...bySeries.entries()].map(([seriesKey, list]) => ({
          seriesKey,
          _count: { _all: list.length },
          _min: { snapshotDate: list.reduce((a, b) => (a.snapshotDate < b.snapshotDate ? a : b)).snapshotDate },
          _max: { snapshotDate: list.reduce((a, b) => (a.snapshotDate > b.snapshotDate ? a : b)).snapshotDate },
        }))
      }),
      findFirst: vi.fn(
        async ({ where, orderBy }: { where: Record<string, unknown>; orderBy?: { snapshotDate?: string } }) => {
          const hits = match(where).sort((a, b) =>
            orderBy?.snapshotDate === 'desc'
              ? b.snapshotDate.getTime() - a.snapshotDate.getTime()
              : a.snapshotDate.getTime() - b.snapshotDate.getTime(),
          )
          return hits[0] ?? null
        },
      ),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        match(where).sort((a, b) => a.snapshotDate.getTime() - b.snapshotDate.getTime()),
      ),
    },
    accreditationFramework: {
      findMany: vi.fn(async () => [COGNIA]),
      findFirst: vi.fn(async () => COGNIA),
    },
    meeting: {
      findFirst: vi.fn(async () => (opts.meetings ?? [])[0] ?? null),
    },
  }
  const billing = {
    isEntitledForModule: vi.fn(async () => opts.governanceLicensed ?? true),
  }
  const svc = new AccreditationReadinessHistoryService(prisma as never, billing as never)
  return { svc, prisma, billing, seen }
}

describe('readiness /series', () => {
  it('lists one entry per recorded series and picks the widest as the default', async () => {
    const { svc } = makeService({
      rows: [
        row({ date: '2026-08-14', readinessPct: 50, leafCount: 31 }),
        row({ date: '2026-09-24', readinessPct: 61, leafCount: 31 }),
        row({ seriesKey: 'none', frameworkId: null, date: '2026-08-14', readinessPct: 20, leafCount: 6 }),
      ],
    })
    const res = await svc.getSeries('school-A')
    expect(res.requiresSelection).toBe(true)
    expect(res.defaultSeriesKey).toBe('cognia_2022') // 31 leaves beats 6
    expect(res.seriesStartsAt).toBe('2026-08-14')
    expect(res.series.map((s) => s.seriesKey).sort()).toEqual(['cognia_2022', 'none'])
    const none = res.series.find((s) => s.seriesKey === 'none')!
    expect(none.name).toBe('Standards not linked to a framework')
    expect(none.indexComparable).toBe(false)
    expect(res.series.find((s) => s.seriesKey === 'cognia_2022')!.indexComparable).toBe(true)
  })

  it('a school with no recorded history gets an honest empty answer', async () => {
    const { svc } = makeService({ rows: [] })
    expect(await svc.getSeries('school-A')).toEqual({
      seriesStartsAt: null,
      requiresSelection: false,
      defaultSeriesKey: null,
      series: [],
      demoData: false,
    })
  })

  it('demoData follows the latest recorded reading', async () => {
    const { svc } = makeService({
      rows: [row({ date: '2026-08-14', readinessPct: 50, isDemo: true })],
    })
    expect((await svc.getSeries('school-A')).demoData).toBe(true)
  })

  it('a GENUINE newest reading cannot strip the demo flag off fabricated history', async () => {
    // The laundering path: 36 seeded months, then one real capture on top. If
    // demo-ness were read off the newest ROW the chip would vanish and invented
    // history would be presented as the school's own record.
    const { svc } = makeService({
      rows: [
        row({ date: '2026-08-14', readinessPct: 50, isDemo: true }),
        row({ date: '2026-09-14', readinessPct: 55, isDemo: true }),
        row({ date: '2026-09-24', readinessPct: 61, isDemo: false }),
      ],
    })
    expect((await svc.getSeries('school-A')).demoData).toBe(true)
  })
})

describe('readiness /trend — refusing to overclaim', () => {
  it('fewer than 3 readings → change unavailable, decomposition null, reason present', async () => {
    const { svc } = makeService({
      rows: [
        row({ date: '2026-09-22', readinessPct: 44 }),
        row({ date: '2026-09-24', readinessPct: 46 }),
      ],
    })
    const res = await svc.getTrend('school-A', { to: '2026-09-30', from: '2026-01-01' })
    expect(res.points).toHaveLength(2) // the readings ARE shown
    expect(res.change.available).toBe(false)
    expect(res.change.direction).toBe('insufficient_history')
    expect(res.change.deltaPct).toBeNull()
    expect(res.change.reason).toContain('at least 3 readings over 30 days')
    expect(res.decomposition).toBeNull()
  })

  it('a qualifying window reports the observed change AND its decomposition', async () => {
    const leaves = (score: number | null) => [
      { standardId: 'a', code: 'C-1', rubricScore: score, evidenceCount: 1 },
      { standardId: 'b', code: 'C-2', rubricScore: 2, evidenceCount: 1 },
    ]
    const { svc } = makeService({
      rows: [
        row({ date: '2026-08-14', readinessPct: 50, leafScores: leaves(null) }),
        row({ date: '2026-09-04', readinessPct: 55, leafScores: leaves(2) }),
        row({ date: '2026-09-24', readinessPct: 61, leafScores: leaves(4) }),
      ],
    })
    const res = await svc.getTrend('school-A', { from: '2026-08-01', to: '2026-09-30' })
    expect(res.change).toMatchObject({
      available: true,
      from: '2026-08-14',
      to: '2026-09-24',
      deltaPct: 11,
      direction: 'improving',
      confidence: 'observed_change',
    })
    expect(res.decomposition).not.toBeNull()
    expect(res.decomposition!.residual).toBe(0)
    expect(res.decomposition!.narrative).toContain('newly scored standards')
    expect(res.engineVersion).toBe('1.0.0')
    expect(res.disclaimer).toContain('Not an accreditation product')
  })

  it('a leaf-count change is reported as a BREAK and blocks the direction', async () => {
    const { svc } = makeService({
      rows: [
        row({ date: '2026-08-14', readinessPct: 63, leafCount: 19 }),
        row({ date: '2026-09-02', readinessPct: 41, leafCount: 31 }),
        row({ date: '2026-09-24', readinessPct: 47, leafCount: 31 }),
      ],
    })
    const res = await svc.getTrend('school-A', { from: '2026-08-01', to: '2026-09-30' })
    expect(res.breaks).toEqual([
      {
        date: '2026-09-02',
        kind: 'leaf_count_changed',
        detail: 'Standards in scope changed from 19 to 31.',
      },
    ])
    expect(res.change.available).toBe(false)
    expect(res.change.direction).toBe('insufficient_history')
    expect(res.change.reason).toContain('not comparable')
    // The 22-point drop is NOT reported as a decline — it is a scope change.
    expect(res.change.deltaPct).toBeNull()
  })

  it('an engine-version change is a break too', async () => {
    const { svc } = makeService({
      rows: [
        row({ date: '2026-08-14', readinessPct: 50, engineVersion: '1.0.0' }),
        row({ date: '2026-09-02', readinessPct: 58, engineVersion: '1.1.0' }),
        row({ date: '2026-09-24', readinessPct: 61, engineVersion: '1.1.0' }),
      ],
    })
    const res = await svc.getTrend('school-A', { from: '2026-08-01', to: '2026-09-30' })
    expect(res.breaks.map((b) => b.kind)).toEqual(['engine_version_changed'])
    expect(res.change.direction).toBe('insufficient_history')
  })

  it('no recorded history at all → empty points, no fabricated zeros', async () => {
    const { svc } = makeService({ rows: [] })
    const res = await svc.getTrend('school-A', {})
    expect(res.points).toEqual([])
    expect(res.change.available).toBe(false)
    expect(res.decomposition).toBeNull()
    expect(res.seriesStartsAt).toBeNull()
    expect(res.demoData).toBe(false)
  })

  it("granularity='month' returns the last reading of each month", async () => {
    const { svc } = makeService({
      rows: [
        row({ date: '2026-08-03', readinessPct: 40 }),
        row({ date: '2026-08-29', readinessPct: 44 }),
        row({ date: '2026-09-30', readinessPct: 52 }),
      ],
    })
    const res = await svc.getTrend('school-A', {
      from: '2026-01-01',
      to: '2026-12-31',
      granularity: 'month',
    })
    expect(res.granularity).toBe('month')
    expect(res.points.map((p) => p.date)).toEqual(['2026-08-29', '2026-09-30'])
  })
})

describe('readiness /trend — the board marker is FAIL-SOFT', () => {
  it('governance not licensed → available:false, reason, and NO exception (HTTP 200)', async () => {
    const { svc } = makeService({
      rows: [row({ date: '2026-09-24', readinessPct: 61 })],
      governanceLicensed: false,
    })
    const res = await svc.getTrend('school-A', WINDOW)
    expect(res.boardMarker).toEqual({
      available: false,
      since: null,
      label: null,
      deltaPct: null,
      reason: 'governance_not_licensed',
    })
    expect(res.points).toHaveLength(1) // the rest of the payload is intact
  })

  it('a billing failure is treated as not-licensed, never a 500', async () => {
    const s = makeService({ rows: [row({ date: '2026-09-24', readinessPct: 61 })] })
    s.billing.isEntitledForModule.mockRejectedValueOnce(new Error('billing down'))
    const res = await s.svc.getTrend('school-A', WINDOW)
    expect(res.boardMarker.reason).toBe('governance_not_licensed')
  })

  it('licensed but no approved minutes → available:false with its own reason', async () => {
    const { svc } = makeService({
      rows: [row({ date: '2026-09-24', readinessPct: 61 })],
      meetings: [],
    })
    expect((await svc.getTrend('school-A', WINDOW)).boardMarker.reason).toBe('no_approved_minutes')
  })

  it('an approved meeting yields the change since the board last met', async () => {
    const { svc } = makeService({
      rows: [
        row({ date: '2026-09-01', readinessPct: 57 }),
        row({ date: '2026-09-24', readinessPct: 61 }),
      ],
      meetings: [{ scheduledAt: day('2026-09-10') }],
    })
    const res = await svc.getTrend('school-A', { from: '2026-08-01', to: '2026-09-30' })
    expect(res.boardMarker).toEqual({
      available: true,
      since: '2026-09-10',
      label: 'your last board meeting',
      deltaPct: 4,
      reason: null,
    })
  })

  it('no reading old enough to compare against → available:false, never a guessed baseline', async () => {
    const { svc } = makeService({
      rows: [row({ date: '2026-09-24', readinessPct: 61 })],
      meetings: [{ scheduledAt: day('2026-09-10') }],
    })
    const res = await svc.getTrend('school-A', { from: '2026-08-01', to: '2026-09-30' })
    expect(res.boardMarker.available).toBe(false)
    expect(res.boardMarker.reason).toBe('no_reading_before_meeting')
  })
})

describe('readiness /diff', () => {
  const leaves = (over: Partial<Record<'a' | 'b' | 'c', number | null>> = {}) => [
    { standardId: 'a', code: 'C-1', rubricScore: over.a ?? null, evidenceCount: 1 },
    { standardId: 'b', code: 'C-2', rubricScore: over.b ?? 2, evidenceCount: 0 },
  ]

  it('snaps each bound to the newest reading ON OR BEFORE it and itemises the movement', async () => {
    const { svc } = makeService({
      rows: [
        row({ date: '2026-08-14', readinessPct: 30, leafScores: leaves() }),
        row({ date: '2026-09-24', readinessPct: 61, leafScores: leaves({ a: 3, b: 4 }) }),
      ],
    })
    const res = await svc.getDiff('school-A', {
      from: '2026-08-20', // no reading that day → snaps back to 08-14
      to: '2026-09-30',
    })
    expect(res.fromDate).toBe('2026-08-14')
    expect(res.toDate).toBe('2026-09-24')
    expect(res.newlyScored).toEqual([{ standardId: 'a', code: 'C-1', toScore: 3 }])
    expect(res.improved).toEqual([{ standardId: 'b', code: 'C-2', fromScore: 2, toScore: 4 }])
    expect(res.counts).toEqual({
      improved: 1,
      declined: 0,
      newlyScored: 1,
      unscored: 0,
      evidenceGained: 0,
      evidenceLost: 0,
      scopeAdded: 0,
      scopeRemoved: 0,
    })
    expect(res.decomposition.residual).toBe(0)
  })

  it('no reading on or before `from` → 404 NO_SNAPSHOT_BEFORE, never an empty diff', async () => {
    const { svc } = makeService({
      rows: [row({ date: '2026-09-24', readinessPct: 61, leafScores: leaves() })],
    })
    await expect(
      svc.getDiff('school-A', { from: '2026-08-01', to: '2026-09-30' }),
    ).rejects.toBeInstanceOf(NotFoundException)
    await expect(
      svc.getDiff('school-A', { from: '2026-08-01', to: '2026-09-30' }),
    ).rejects.toMatchObject({ response: { code: 'NO_SNAPSHOT_BEFORE' } })
  })

  it('a school with no history at all → 404, not a zeroed payload', async () => {
    const { svc } = makeService({ rows: [] })
    await expect(
      svc.getDiff('school-A', { from: '2026-08-01', to: '2026-09-30' }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('tenancy', () => {
  it("school B's readings are unreachable from school A's path", async () => {
    const { svc } = makeService({
      rows: [
        row({ schoolId: 'school-B', date: '2026-08-14', readinessPct: 90 }),
        row({ schoolId: 'school-B', date: '2026-09-24', readinessPct: 95 }),
      ],
    })
    expect((await svc.getSeries('school-A')).series).toEqual([])
    expect((await svc.getTrend('school-A', {})).points).toEqual([])
    await expect(
      svc.getDiff('school-A', { from: '2026-08-01', to: '2026-09-30' }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('EVERY snapshot query carries the path schoolId', async () => {
    const s = makeService({
      rows: [
        row({ date: '2026-08-14', readinessPct: 50 }),
        row({ date: '2026-09-04', readinessPct: 55 }),
        row({ date: '2026-09-24', readinessPct: 61 }),
      ],
      meetings: [{ scheduledAt: day('2026-09-10') }],
    })
    await s.svc.getTrend('school-A', { from: '2026-08-01', to: '2026-09-30' })
    expect(s.seen.length).toBeGreaterThan(0)
    for (const call of s.seen) expect(call.where.schoolId).toBe('school-A')
  })
})

describe('query DTOs are whitelisted, not permissive', () => {
  const errorsFor = <T extends object>(cls: new () => T, payload: object) =>
    validateSync(plainToInstance(cls, payload) as object, {
      whitelist: true,
      forbidNonWhitelisted: true,
    })

  it('an UNKNOWN query param is rejected (this is what makes it a 400, not a silent ignore)', () => {
    const errs = errorsFor(ReadinessTrendQueryDto, { seriesKey: 'cognia_2022', bogus: '1' })
    expect(errs.map((e) => e.property)).toContain('bogus')
  })

  it('accepts the documented params', () => {
    expect(
      errorsFor(ReadinessTrendQueryDto, {
        seriesKey: 'cognia_2022',
        from: '2026-08-14',
        to: '2026-09-24',
        granularity: 'month',
      }),
    ).toEqual([])
  })

  it('rejects a granularity outside the closed set', () => {
    expect(errorsFor(ReadinessTrendQueryDto, { granularity: 'week' })).not.toEqual([])
  })

  it('rejects a timestamp where a calendar day is required (no timezone ambiguity)', () => {
    expect(errorsFor(ReadinessTrendQueryDto, { from: '2026-08-14T12:00:00Z' })).not.toEqual([])
  })

  it('the diff DTO REQUIRES from/to and has no granularity', () => {
    expect(errorsFor(ReadinessDiffQueryDto, {}).map((e) => e.property).sort()).toEqual(['from', 'to'])
    expect(
      errorsFor(ReadinessDiffQueryDto, { from: '2026-08-14', to: '2026-09-24', granularity: 'day' }),
    ).not.toEqual([])
  })
})

// ── D.8 #16 — the module gate on the new routes ───────────────────────────────
// The controller declares @RequiresModule('accreditation') behind EntitlementGuard,
// but a declaration nothing asserts is a declaration that can be deleted in a
// refactor without a single test going red — and deleting it would expose a
// tenant's full readiness history to an unlicensed school. This pins it.
function guardCtx(): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: {}, params: { schoolId: 'school-A' }, body: {} }),
    }),
    getHandler: () => () => undefined,
    getClass: () => AccreditationReadinessHistoryController,
  } as unknown as ExecutionContext
}

function guardFor(licensedForAccreditation: boolean) {
  const billing = {
    isEntitled: vi.fn().mockResolvedValue(true),
    isEntitledForModule: vi.fn().mockResolvedValue(licensedForAccreditation),
  } as unknown as BillingService
  // Mirrors the class-level decorator the controller actually carries.
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(
      Reflect.getMetadata(REQUIRES_MODULE, AccreditationReadinessHistoryController),
    ),
  } as unknown as Reflector
  return new EntitlementGuard(billing, reflector)
}

describe('readiness history routes — accreditation entitlement', () => {
  it('the controller carries @RequiresModule(\'accreditation\')', () => {
    expect(Reflect.getMetadata(REQUIRES_MODULE, AccreditationReadinessHistoryController)).toBe(
      'accreditation',
    )
  })

  it('licensed → the guard lets the request through', async () => {
    await expect(guardFor(true).canActivate(guardCtx())).resolves.toBe(true)
  })

  it('entitled but NOT licensed for accreditation → 402 MODULE_NOT_LICENSED', async () => {
    let err: HttpException | null = null
    try {
      await guardFor(false).canActivate(guardCtx())
    } catch (e) {
      err = e as HttpException
    }
    expect(err).not.toBeNull()
    expect(err!.getStatus()).toBe(402)
    const body = err!.getResponse() as { code: string; module: string }
    expect(body.code).toBe('MODULE_NOT_LICENSED')
    expect(body.module).toBe('accreditation')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase C — the fourth break kind. `verifiedPct` changed meaning on deploy
// day, and the chart must show that as a DISCONTINUITY rather than as a decline.
// ─────────────────────────────────────────────────────────────────────────────

describe('AccreditationReadinessHistoryService — verified_definition_changed', () => {
  const acrossTheBoundary = [
    row({ date: '2026-08-14', readinessPct: 60, verifiedBasis: 'exists' }),
    row({ date: '2026-09-02', readinessPct: 60, verifiedBasis: 'exists' }),
    row({ date: '2026-09-24', readinessPct: 48, verifiedBasis: 'current' }),
    row({ date: '2026-09-25', readinessPct: 48, verifiedBasis: 'current' }),
  ]

  it('emits EXACTLY ONE break, dated on the first current row, with the frozen detail', async () => {
    const { svc } = makeService({ rows: acrossTheBoundary })
    const res = await svc.getTrend('school-A', WINDOW)
    expect(res.breaks).toEqual([
      {
        date: '2026-09-24',
        kind: 'verified_definition_changed',
        detail:
          'Defensible readiness now counts only evidence that is not known to be out of date. ' +
          'Readings before this date counted any evidence that existed.',
      },
    ])
  })

  it('does NOT also fire engine_version_changed — one event, reported once', async () => {
    const { svc } = makeService({ rows: acrossTheBoundary })
    const res = await svc.getTrend('school-A', WINDOW)
    expect(res.breaks.map((b) => b.kind)).not.toContain('engine_version_changed')
    expect(res.engineVersion).toBe('1.0.0')
  })

  it('the observed change across that boundary reads insufficient_history, never "declining"', async () => {
    const { svc } = makeService({ rows: acrossTheBoundary })
    const res = await svc.getTrend('school-A', WINDOW)
    expect(res.change.available).toBe(false)
    expect(res.change.direction).toBe('insufficient_history')
    expect(res.change.reason).toContain('not comparable')
    expect(res.change.deltaPct).toBeNull()
  })

  it('a diff across the boundary reports NO phantom evidenceLost', async () => {
    // diffLeafScores reads only `evidenceCount`, which never changed meaning.
    // The widened leafScores are additive, so the pre/post rows still diff clean.
    const leaves = (over: Record<string, unknown> = {}) => [
      { standardId: 's1', code: 'C-1', rubricScore: 3, evidenceCount: 2, ...over },
    ]
    const { svc } = makeService({
      rows: [
        row({ date: '2026-08-14', readinessPct: 60, verifiedBasis: 'exists', leafScores: leaves() }),
        row({
          date: '2026-09-24',
          readinessPct: 48,
          verifiedBasis: 'current',
          leafScores: leaves({ currentEvidenceCount: 0 }),
        }),
      ],
    })
    const diff = await svc.getDiff('school-A', { from: '2026-08-14', to: '2026-09-24' })
    expect(diff.evidenceLost).toEqual([])
    expect(diff.evidenceGained).toEqual([])
  })

  it('a series that never crosses the boundary emits no break at all', async () => {
    const { svc } = makeService({
      rows: [
        row({ date: '2026-08-14', readinessPct: 60, verifiedBasis: 'current' }),
        row({ date: '2026-09-02', readinessPct: 62, verifiedBasis: 'current' }),
        row({ date: '2026-09-24', readinessPct: 64, verifiedBasis: 'current' }),
      ],
    })
    const res = await svc.getTrend('school-A', WINDOW)
    expect(res.breaks).toEqual([])
    expect(res.change.available).toBe(true)
  })
})
