// Unit tests for the value-history read service, driven through fakes (no Nest, no DB).
// Pin the parts the feature stands on: no-change collapse, appeared/disappeared (absent)
// handling, metric extraction INCLUDING a ratio (which the drill cannot drill), the
// legacy null-trigger correlation fallback, and stamped-vs-legacy attribution.
import { describe, expect, it } from 'vitest'
import { SnapshotHistoryService } from './snapshot-history.service.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────
/** A snapshot payload carrying a single statement line under lineage.soa.cy (or absent). */
function linePayload(value: number | undefined) {
  const cy =
    value === undefined
      ? {}
      : { tuition: { line: 'tuition', value, sign: 1, sources: [{ acct: 4000, desc: 'Tuition' }] } }
  return { lineage: { soa: { cy } } }
}

/** A ReportBundle-shaped payload for the analytics metric compute (ratio = tuition/totalRev). */
function metricPayload(tuition: number, totalRev: number) {
  const soa = {
    totalRev,
    totalExp: 0,
    netChange: totalRev,
    tuition,
    dev: 0,
    studAct: 0,
    textbook: 0,
    other: 0,
    support: 0,
    intlRev: 0,
    investments: 0,
    interest: 0,
    instructional: 0,
    facilities: 0,
    fixedOther: 0,
    intlExp: 0,
    bus: 0,
    food: 0,
    studActExp: 0,
    athletics: 0,
    admin: 0,
    restricted: 0,
  }
  return { soaResults: { cy: soa }, sfpResults: { cy: null } }
}

interface Snap {
  id: string
  createdAt: Date
  payload: unknown
  trigger: string | null
  sourceImportId: string | null
  triggeredByUserId: string | null
}
function snap(id: string, minutes: number, payload: unknown, prov?: Partial<Snap>): Snap {
  return {
    id,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, minutes, 0)),
    payload,
    trigger: prov?.trigger ?? null,
    sourceImportId: prov?.sourceImportId ?? null,
    triggeredByUserId: prov?.triggeredByUserId ?? null,
  }
}

function makeService(
  snapshots: Snap[],
  opts?: {
    imports?: Array<{ id: string; sourceName: string | null }>
    genRows?: Array<{ targetId: string; userId: string | null }>
    triggerRows?: Array<{ action: string; createdAt: Date }>
    users?: Array<{ id: string; firstName: string | null; lastName: string | null }>
  },
) {
  const periods = {
    getOwnedPeriod: async () => ({ id: 'p', periodEndDate: new Date('2026-06-30T00:00:00Z') }),
  }
  const inList = (where: { id?: { in: string[] } }, id: string) => where.id?.in?.includes(id) ?? false
  const prisma = {
    statementSnapshot: { findMany: async () => snapshots },
    import: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        (opts?.imports ?? []).filter((i) => inList(where, i.id)),
    },
    auditLog: {
      findMany: async ({ where }: { where: { action: string | { in: string[] } } }) =>
        typeof where.action === 'string' && where.action === 'snapshot.generated'
          ? opts?.genRows ?? []
          : opts?.triggerRows ?? [],
    },
    user: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        (opts?.users ?? []).filter((u) => inList(where, u.id)),
    },
  }
  return new SnapshotHistoryService(prisma as never, periods as never)
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('SnapshotHistoryService — line history', () => {
  it('collapses unchanged versions and keeps the real move', async () => {
    const svc = makeService([
      snap('s1', 0, linePayload(100)),
      snap('s2', 5, linePayload(100)), // unchanged → folded
      snap('s3', 10, linePayload(250)),
    ])
    const r = await svc.lineHistory('school', 'p', { statement: 'SOA', variant: 'cy', lineKey: 'tuition' })
    expect(r.kind).toBe('line')
    expect(r.unit).toBe('currency')
    expect(r.collapsed).toBe(1)
    expect(r.versions).toHaveLength(2) // baseline 100 + the 250 move
    // Newest → oldest.
    expect(r.versions[0].value).toBe(250)
    expect(r.versions[0].delta).toBe(150)
    expect(r.versions[1].value).toBe(100)
    expect(r.first).toBe(100)
    expect(r.latest).toBe(250)
    expect(r.netChange).toBe(150)
    // Sparkline is the UN-collapsed present series.
    expect(r.sparkline).toEqual([100, 100, 250])
  })

  it('marks a version where the line is absent (appeared later)', async () => {
    const svc = makeService([
      snap('s1', 0, linePayload(undefined)), // line not present yet
      snap('s2', 5, linePayload(200)),
      snap('s3', 10, linePayload(200)), // unchanged → folded
    ])
    const r = await svc.lineHistory('school', 'p', { statement: 'SOA', variant: 'cy', lineKey: 'tuition' })
    expect(r.collapsed).toBe(1)
    // Kept: the absent baseline + the first-appearance 200.
    const absent = r.versions.find((v) => v.absent)
    expect(absent).toBeTruthy()
    expect(absent?.value).toBeNull()
    const appeared = r.versions.find((v) => !v.absent)
    expect(appeared?.value).toBe(200)
    expect(appeared?.delta).toBeNull() // no delta across the appearance gap
    expect(r.sparkline).toEqual([200, 200]) // nulls dropped
  })

  it('returns a single-version baseline for a one-snapshot period', async () => {
    const svc = makeService([snap('s1', 0, linePayload(100))])
    const r = await svc.lineHistory('school', 'p', { statement: 'SOA', variant: 'cy', lineKey: 'tuition' })
    expect(r.versions).toHaveLength(1)
    expect(r.versions[0].delta).toBeNull()
    expect(r.collapsed).toBe(0)
  })
})

describe('SnapshotHistoryService — metric history (ratio)', () => {
  it('tracks a ratio metric across snapshots (drill cannot drill a ratio)', async () => {
    const svc = makeService([
      snap('s1', 0, metricPayload(50, 100)), // 0.50
      snap('s2', 10, metricPayload(60, 100)), // 0.60
    ])
    const r = await svc.metricHistory('school', 'p', { metricKey: 'tuition_dependency' })
    expect(r.kind).toBe('metric')
    expect(r.unit).toBe('percent')
    expect(r.versions).toHaveLength(2)
    expect(r.versions[0].value).toBeCloseTo(0.6, 6)
    expect(r.versions[0].delta).toBeCloseTo(0.1, 6)
    expect(r.versions[1].value).toBeCloseTo(0.5, 6)
    expect(r.netChange).toBeCloseTo(0.1, 6)
  })

  it('marks a version absent when the metric cannot be computed (totalRev 0)', async () => {
    const svc = makeService([
      snap('s1', 0, metricPayload(0, 0)), // unavailable → absent
      snap('s2', 10, metricPayload(60, 100)), // 0.60
    ])
    const r = await svc.metricHistory('school', 'p', { metricKey: 'tuition_dependency' })
    const absent = r.versions.find((v) => v.absent)
    expect(absent).toBeTruthy()
    expect(absent?.value).toBeNull()
  })
})

describe('SnapshotHistoryService — attribution', () => {
  it('uses the stamped columns exactly (scheduled sync + actor)', async () => {
    const svc = makeService(
      [
        snap('s1', 0, linePayload(100), { trigger: 'manual', triggeredByUserId: 'u1' }),
        snap('s2', 10, linePayload(250), {
          trigger: 'scheduled_sync',
          triggeredByUserId: 'u2',
        }),
      ],
      { users: [{ id: 'u2', firstName: 'Nightly', lastName: 'Bot' }, { id: 'u1', firstName: 'Ada', lastName: 'Lovelace' }] },
    )
    const r = await svc.lineHistory('school', 'p', { statement: 'SOA', variant: 'cy', lineKey: 'tuition' })
    const newest = r.versions[0]
    expect(newest.source.trigger).toBe('scheduled_sync')
    expect(newest.source.label).toBe('Scheduled sync')
    expect(newest.source.actorName).toBe('Nightly Bot')
  })

  it('falls back to correlation for a legacy null-trigger row', async () => {
    const svc = makeService(
      [
        snap('s1', 0, linePayload(100)), // legacy, null trigger
        snap('s2', 30, linePayload(250)), // legacy, null trigger
      ],
      {
        genRows: [
          { targetId: 's1', userId: 'u1' },
          { targetId: 's2', userId: 'u1' },
        ],
        // A qbo.synced audit near s2 → infer quickbooks_sync.
        triggerRows: [{ action: 'qbo.synced', createdAt: new Date(Date.UTC(2026, 0, 1, 0, 31, 0)) }],
        users: [{ id: 'u1', firstName: 'Ada', lastName: 'Lovelace' }],
      },
    )
    const r = await svc.lineHistory('school', 'p', { statement: 'SOA', variant: 'cy', lineKey: 'tuition' })
    const newest = r.versions[0] // s2
    expect(newest.source.trigger).toBe('quickbooks_sync')
    expect(newest.source.label).toBe('QuickBooks sync')
    expect(newest.source.actorName).toBe('Ada Lovelace') // from snapshot.generated audit actor
    // s1 has no nearby trigger row → unresolved "Earlier version".
    const oldest = r.versions[1]
    expect(oldest.source.trigger).toBe('unknown')
    expect(oldest.source.label).toBe('Earlier version')
  })

  it('resolves an import file name for a stamped upload', async () => {
    const svc = makeService(
      [snap('s1', 0, linePayload(100), { trigger: 'upload', sourceImportId: 'imp1', triggeredByUserId: 'u1' })],
      {
        imports: [{ id: 'imp1', sourceName: 'FY2026-TB.xlsx' }],
        users: [{ id: 'u1', firstName: 'Ada', lastName: 'Lovelace' }],
      },
    )
    const r = await svc.lineHistory('school', 'p', { statement: 'SOA', variant: 'cy', lineKey: 'tuition' })
    expect(r.versions[0].source.label).toBe('File upload')
    expect(r.versions[0].source.sourceName).toBe('FY2026-TB.xlsx')
  })
})
