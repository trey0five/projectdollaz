import { describe, expect, it, vi } from 'vitest'
import { AccreditationReadinessHistoryService } from './readiness-history.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// WS2 — THE SERIES BRIDGE (read-side stitch + the synthetic framework_changed
// break). Honesty contract, asserted:
//   • predecessor points are stitched IN FRONT only while the requested window
//     starts before the recorded upgradedAt;
//   • ONE named break at the upgrade date blocks the direction claim with its
//     own sentence (summarizeObservedChange's existing machinery);
//   • once the window no longer reaches back, the stitch AND the block vanish;
//   • snapshot rows are never written (read-only guarantee — the mock has no
//     write surface at all);
//   • the series list marks the predecessor `continuedBy: <successorCode>`.
// ─────────────────────────────────────────────────────────────────────────────

const FW_2022 = {
  id: 'fw-2022',
  code: 'cognia_2022',
  accreditor: 'Cognia',
  name: 'Cognia Performance Standards (2022)',
  version: '2022',
  statusBands: [],
  indexMin: 100,
  indexMax: 400,
  defaultTarget: 280,
}
const FW_2025 = {
  id: 'fw-2025',
  code: 'cognia_2025',
  accreditor: 'Cognia',
  name: 'Cognia Performance Standards (rev. 2025)',
  version: '2025',
  statusBands: [],
  indexMin: 100,
  indexMax: 400,
  defaultTarget: 280,
}
const FRAMEWORKS = [FW_2022, FW_2025]

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

function row(seriesKey: string, frameworkId: string, date: string, readinessPct: number) {
  return {
    schoolId: 'school-A',
    seriesKey,
    snapshotDate: day(date),
    readinessPct,
    selfScoredPct: readinessPct,
    verifiedPct: readinessPct,
    projectedIndex: 200 + readinessPct,
    band: null,
    leafCount: 31,
    scoredCount: 5,
    coveredCount: 5,
    engineVersion: '1.0.0',
    verifiedBasis: 'current',
    frameworkId,
    isDemo: false,
    leafScores: [],
  }
}

/** The upgraded school: 2022 points through March, upgrade Apr 1, 2025 points after. */
const UPGRADED_AT = new Date('2026-04-01T10:00:00.000Z')
const ROWS = [
  row('cognia_2022', 'fw-2022', '2026-01-10', 40),
  row('cognia_2022', 'fw-2022', '2026-02-10', 44),
  row('cognia_2022', 'fw-2022', '2026-03-10', 48),
  row('cognia_2025', 'fw-2025', '2026-04-02', 47),
  row('cognia_2025', 'fw-2025', '2026-05-10', 52),
  row('cognia_2025', 'fw-2025', '2026-06-10', 55),
]

function makeService(opts: { rows?: typeof ROWS; withProfile?: boolean } = {}) {
  const rows = opts.rows ?? ROWS
  const profiles =
    (opts.withProfile ?? true)
      ? [
          {
            id: 'prof-1',
            schoolId: 'school-A',
            frameworkId: 'fw-2025',
            upgradedFromFrameworkId: 'fw-2022',
            upgradedAt: UPGRADED_AT,
            framework: { code: 'cognia_2025' },
          },
        ]
      : []

  const match = (where: Record<string, unknown>) => {
    const w = where as {
      schoolId?: string
      seriesKey?: string
      snapshotDate?: Date | { gte?: Date; lte?: Date; lt?: Date }
    }
    return rows.filter((r) => {
      if (w.schoolId !== undefined && r.schoolId !== w.schoolId) return false
      if (w.seriesKey !== undefined && r.seriesKey !== w.seriesKey) return false
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
        for (const r of hits) bySeries.set(r.seriesKey, [...(bySeries.get(r.seriesKey) ?? []), r])
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
      findMany: vi.fn(async ({ where }: { where?: { id?: { in: string[] } } } = {}) =>
        FRAMEWORKS.filter((f) => !where?.id?.in || where.id.in.includes(f.id)),
      ),
      findFirst: vi.fn(async ({ where }: { where: { id?: string } }) =>
        FRAMEWORKS.find((f) => f.id === where.id) ?? null,
      ),
    },
    accreditationFrameworkProfile: {
      findFirst: vi.fn(async ({ where }: { where: { schoolId: string; frameworkId: string } }) =>
        profiles.find(
          (p) => p.schoolId === where.schoolId && p.frameworkId === where.frameworkId,
        ) ?? null,
      ),
      findMany: vi.fn(
        async ({ where }: { where: { schoolId: string; upgradedFromFrameworkId: { in: string[] } } }) =>
          profiles.filter(
            (p) =>
              p.schoolId === where.schoolId &&
              where.upgradedFromFrameworkId.in.includes(p.upgradedFromFrameworkId ?? ''),
          ),
      ),
    },
    meeting: { findFirst: vi.fn(async () => null) },
  }
  const billing = { isEntitledForModule: vi.fn(async () => false) }
  const svc = new AccreditationReadinessHistoryService(prisma as never, billing as never)
  return { svc, prisma }
}

describe('WS2 bridge — the stitched trend', () => {
  it('stitches predecessor points in front and blocks direction with the NAMED break', async () => {
    const { svc } = makeService()
    const res = await svc.getTrend('school-A', {
      seriesKey: 'cognia_2025',
      from: '2026-01-01',
      to: '2026-12-31',
    })
    // All six points, ascending, predecessor first.
    expect(res.points.map((p) => p.date)).toEqual([
      '2026-01-10',
      '2026-02-10',
      '2026-03-10',
      '2026-04-02',
      '2026-05-10',
      '2026-06-10',
    ])
    // Exactly ONE framework_changed break, at the UPGRADE date, with the
    // successor NAMED — never the generic boundary detection's sentence.
    const fwBreaks = res.breaks.filter((b) => b.kind === 'framework_changed')
    expect(fwBreaks).toHaveLength(1)
    expect(fwBreaks[0].date).toBe('2026-04-01')
    expect(fwBreaks[0].detail).toBe('Upgraded to Cognia Performance Standards (rev. 2025)')
    // The break blocks the direction claim with its own sentence.
    expect(res.change.available).toBe(false)
    expect(res.change.direction).toBe('insufficient_history')
    expect(res.change.reason).toContain('Upgraded to Cognia Performance Standards (rev. 2025)')
    expect(res.change.reason).toContain('not comparable')
  })

  it('a window entirely PAST the upgrade has no stitch, no break, and direction returns', async () => {
    const { svc } = makeService()
    const res = await svc.getTrend('school-A', {
      seriesKey: 'cognia_2025',
      from: '2026-04-02',
      to: '2026-12-31',
    })
    expect(res.points.map((p) => p.date)).toEqual(['2026-04-02', '2026-05-10', '2026-06-10'])
    expect(res.breaks.filter((b) => b.kind === 'framework_changed')).toHaveLength(0)
    expect(res.change.available).toBe(true)
    expect(res.change.direction).toBe('improving')
  })

  it('A8 — a window entirely BEFORE the upgrade stitches the predecessor points but pushes NO out-of-range break', async () => {
    const { svc } = makeService()
    const res = await svc.getTrend('school-A', {
      seriesKey: 'cognia_2025',
      from: '2026-01-01',
      to: '2026-03-31', // upgrade day (2026-04-01) is PAST the window's end
    })
    // The predecessor's history is still readable through the successor key…
    expect(res.points.map((p) => p.date)).toEqual(['2026-01-10', '2026-02-10', '2026-03-10'])
    // …but every break the chart is handed lies INSIDE its own axis: the
    // synthetic 2026-04-01 marker is out of range and must not be emitted.
    expect(res.breaks.filter((b) => b.kind === 'framework_changed')).toHaveLength(0)
    for (const b of res.breaks) {
      expect(b.date >= '2026-01-01' && b.date <= '2026-03-31', b.date).toBe(true)
    }
  })

  it('no recorded upgrade → no stitch (the successor series stands alone)', async () => {
    const { svc } = makeService({ withProfile: false })
    const res = await svc.getTrend('school-A', {
      seriesKey: 'cognia_2025',
      from: '2026-01-01',
      to: '2026-12-31',
    })
    expect(res.points.map((p) => p.date)).toEqual(['2026-04-02', '2026-05-10', '2026-06-10'])
  })

  it('the predecessor series itself reads UNSTITCHED (its own key, its own points)', async () => {
    const { svc } = makeService()
    const res = await svc.getTrend('school-A', {
      seriesKey: 'cognia_2022',
      from: '2026-01-01',
      to: '2026-12-31',
    })
    expect(res.points.map((p) => p.date)).toEqual(['2026-01-10', '2026-02-10', '2026-03-10'])
    expect(res.breaks).toHaveLength(0)
  })

  it('READ-ONLY guarantee: the snapshot store has no write surface and none is called', async () => {
    const { svc, prisma } = makeService()
    await svc.getTrend('school-A', { seriesKey: 'cognia_2025', from: '2026-01-01', to: '2026-12-31' })
    // The delegate exposes exactly the three read methods the service uses.
    expect(Object.keys(prisma.accreditationReadinessSnapshot).sort()).toEqual([
      'findFirst',
      'findMany',
      'groupBy',
    ])
  })
})

describe('WS2 bridge — the series list', () => {
  it("marks the predecessor series `continuedBy: 'cognia_2025'`; the successor null", async () => {
    const { svc } = makeService()
    const res = await svc.getSeries('school-A')
    const s2022 = res.series.find((s) => s.seriesKey === 'cognia_2022')!
    const s2025 = res.series.find((s) => s.seriesKey === 'cognia_2025')!
    expect(s2022.continuedBy).toBe('cognia_2025')
    expect(s2025.continuedBy).toBeNull()
  })

  it('no recorded upgrade → continuedBy null everywhere (additive default)', async () => {
    const { svc } = makeService({ withProfile: false })
    const res = await svc.getSeries('school-A')
    for (const s of res.series) expect(s.continuedBy).toBeNull()
  })
})
