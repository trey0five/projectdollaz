import { describe, expect, it, vi } from 'vitest'
import { NotFoundException } from '@nestjs/common'
import { FacilitiesService } from './facilities.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// FacilitiesService — TENANT ISOLATION + computed urgency + Decimal→number +
// deterministic ordering + backlog summary. Prisma + Audit are hand-mocked (no DB,
// no Nest boot).
// ─────────────────────────────────────────────────────────────────────────────

/** A Prisma.Decimal stand-in: Number(obj) === value (exactly how the service coerces). */
function decimal(value: number) {
  return { toString: () => String(value), valueOf: () => value }
}

function itemRow(over: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    schoolId: 'school-A',
    title: 'Boiler repair',
    location: null,
    category: null,
    priority: 'medium',
    status: 'open',
    estimatedCost: null,
    actualCost: null,
    vendor: null,
    targetDate: null,
    recurrence: 'none',
    recurrenceUntil: null,
    seriesId: null,
    notes: null,
    createdByUserId: null,
    // Vendors/bids additive columns (all null on a legacy-shaped row).
    vendorId: null,
    vendorRef: null,
    selectedBidId: null,
    decidedByUserId: null,
    decidedAt: null,
    decisionNote: null,
    resolvedAt: null,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    ...over,
  }
}

function makeService(
  over: { item?: Record<string, unknown>; bid?: Record<string, unknown>; vendor?: Record<string, unknown> } = {},
) {
  const maintenanceItem = {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => itemRow(data)),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => itemRow(data)),
    delete: vi.fn(async () => itemRow()),
    count: vi.fn(async () => 0),
    ...over.item,
  }
  // Vendors/bids additions: pendingBidCount groupBy defaults to no bids; the
  // single-item count defaults to 0 — legacy tests stay byte-identical.
  const maintenanceBid = {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
    groupBy: vi.fn(async () => []),
    count: vi.fn(async () => 0),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => bidRow(data)),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => bidRow(data)),
    updateMany: vi.fn(async () => ({ count: 0 })),
    delete: vi.fn(async () => bidRow()),
    ...over.bid,
  }
  const vendor = {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => vendorRow(data)),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => vendorRow(data)),
    delete: vi.fn(async () => vendorRow()),
    count: vi.fn(async () => 0),
    ...over.vendor,
  }
  const prisma: Record<string, unknown> = { maintenanceItem, maintenanceBid, vendor }
  // Interactive $transaction: run the callback against the SAME mock delegates.
  prisma.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma))
  const audit = { write: vi.fn(async () => undefined) }
  const svc = new FacilitiesService(prisma as never, audit as never)
  return { svc, maintenanceItem, maintenanceBid, vendor, audit }
}

function bidRow(over: Record<string, unknown> = {}) {
  return {
    id: 'b1',
    schoolId: 'school-A',
    itemId: 'm1',
    vendorId: null,
    vendorName: 'ACME HVAC',
    amount: decimal(1000),
    notes: null,
    status: 'pending',
    createdByUserId: null,
    vendor: null,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    ...over,
  }
}

function vendorRow(over: Record<string, unknown> = {}) {
  return {
    id: 'v1',
    schoolId: 'school-A',
    name: 'ACME HVAC',
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    category: null,
    notes: null,
    active: true,
    createdByUserId: null,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    ...over,
  }
}

const NOW = new Date('2026-07-01T12:00:00.000Z')

describe('FacilitiesService — list + enrichment', () => {
  it('listMaintenance filters by schoolId, deterministic order + backlog summary', async () => {
    const { svc, maintenanceItem } = makeService({
      item: {
        findMany: vi.fn(async () => [
          itemRow({ id: 'r1', priority: 'medium', status: 'resolved', estimatedCost: decimal(9999) }),
          itemRow({ id: 'c1', priority: 'critical', status: 'open', targetDate: new Date('2026-06-01T00:00:00.000Z'), estimatedCost: decimal(100) }),
          itemRow({ id: 'h1', priority: 'high', status: 'scheduled', targetDate: new Date('2026-08-01T00:00:00.000Z'), estimatedCost: decimal(200) }),
        ]),
      },
    })
    const res = await svc.listMaintenance('school-A', NOW)
    expect(maintenanceItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { schoolId: 'school-A' } }),
    )
    // open-before-resolved, then priority (critical<high): c1, h1, r1.
    expect(res.items.map((i) => i.id)).toEqual(['c1', 'h1', 'r1'])
    // urgency computed: c1 overdue, h1 due-soon (31d out).
    expect(res.items[0].urgency).toBe('overdue')
    expect(res.items[1].urgency).toBe('due-soon')
    // summary: 2 open (resolved excluded), both high-priority, 1 critical, 1 overdue.
    expect(res.summary.openCount).toBe(2)
    expect(res.summary.highPriorityOpenCount).toBe(2)
    expect(res.summary.criticalOpen).toBe(1)
    expect(res.summary.overdueOpen).toBe(1)
    // backlogCost excludes the resolved 9999.
    expect(res.summary.backlogCost).toBe(300)
  })

  it('toPublic coerces a Prisma.Decimal estimatedCost to a JS number; null passes', async () => {
    const { svc } = makeService({
      item: {
        findMany: vi.fn(async () => [
          itemRow({ id: 'a', estimatedCost: decimal(125000.5) }),
          itemRow({ id: 'b', estimatedCost: null }),
        ]),
      },
    })
    const res = await svc.listMaintenance('school-A', NOW)
    const a = res.items.find((i) => i.id === 'a')!
    const b = res.items.find((i) => i.id === 'b')!
    expect(a.estimatedCost).toBe(125000.5)
    expect(typeof a.estimatedCost).toBe('number')
    expect(b.estimatedCost).toBeNull()
  })

  it('targetDate round-trips to yyyy-mm-dd with no tz drift', async () => {
    const { svc } = makeService({
      item: { findMany: vi.fn(async () => [itemRow({ targetDate: new Date('2026-06-01T00:00:00.000Z') })]) },
    })
    const res = await svc.listMaintenance('school-A', NOW)
    expect(res.items[0].targetDate).toBe('2026-06-01')
  })
})

describe('FacilitiesService — tenant isolation (findFirst {id, schoolId})', () => {
  it('update: an itemId owned by ANOTHER school → NotFoundException, never mutates', async () => {
    const { svc, maintenanceItem } = makeService({ item: { findFirst: vi.fn(async () => null) } })
    await expect(
      svc.updateMaintenance('school-B', 'item-of-A', { title: 'hijack' }, 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(maintenanceItem.update).not.toHaveBeenCalled()
  })

  it('remove: foreign id → NotFoundException, never deletes', async () => {
    const { svc, maintenanceItem } = makeService({ item: { findFirst: vi.fn(async () => null) } })
    await expect(svc.removeMaintenance('school-B', 'item-of-A', 'user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(maintenanceItem.delete).not.toHaveBeenCalled()
  })

  it('resolveItem uses the compound {id, schoolId} filter', async () => {
    const { svc, maintenanceItem } = makeService({
      item: { findFirst: vi.fn(async () => itemRow({ id: 'm1', schoolId: 'school-A' })) },
    })
    await svc.updateMaintenance('school-A', 'm1', { status: 'resolved' }, 'user-1')
    expect(maintenanceItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'm1', schoolId: 'school-A' } }),
    )
  })
})

describe('FacilitiesService — create + update + audit', () => {
  it('create scopes schoolId, sets createdByUserId, defaults priority/status, audits', async () => {
    const { svc, maintenanceItem, audit } = makeService()
    await svc.createMaintenance('school-A', { title: 'Roof leak' }, 'user-1')
    const data = maintenanceItem.create.mock.calls[0][0].data
    expect(data.schoolId).toBe('school-A')
    expect(data.createdByUserId).toBe('user-1')
    expect(data.priority).toBe('medium')
    expect(data.status).toBe('open')
    expect(data.location).toBeNull()
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'facilities.item.created', targetType: 'maintenance_items', schoolId: 'school-A' }),
    )
  })

  it('update merge-pick: explicit null clears, omitted keeps; never overwrites createdByUserId', async () => {
    const { svc, maintenanceItem } = makeService({
      item: { findFirst: vi.fn(async () => itemRow({ location: 'Gym', notes: 'keep me', createdByUserId: 'orig-user' })) },
    })
    await svc.updateMaintenance('school-A', 'm1', { location: null }, 'user-2')
    const data = maintenanceItem.update.mock.calls[0][0].data
    expect(data.location).toBeNull()
    expect(data.notes).toBe('keep me')
    expect(data.createdByUserId).toBeUndefined() // not in the update payload
  })

  it('exposes actualCost + variance (actual − estimated); over-budget variance is positive', async () => {
    const { svc } = makeService({
      item: {
        findMany: vi.fn(async () => [
          itemRow({ id: 'v', estimatedCost: decimal(1000), actualCost: decimal(1250) }),
        ]),
      },
    })
    const res = await svc.listMaintenance('school-A', NOW)
    expect(res.items[0].actualCost).toBe(1250)
    expect(res.items[0].variance).toBe(250) // over budget → positive (danger)
  })
})

describe('FacilitiesService — recurrence spawn-on-resolve (preventive maintenance)', () => {
  it('resolving a recurring item spawns the NEXT occurrence (open, actualCost cleared, next target, series linked)', async () => {
    const existing = itemRow({
      id: 'rec1',
      status: 'open',
      recurrence: 'monthly',
      targetDate: new Date('2026-06-15T00:00:00.000Z'),
      estimatedCost: decimal(500),
      actualCost: decimal(480),
      vendor: 'ACME HVAC',
      priority: 'high',
      category: 'HVAC',
    })
    const { svc, maintenanceItem, audit } = makeService({
      item: { findFirst: vi.fn(async () => existing) },
    })
    await svc.updateMaintenance('school-A', 'rec1', { status: 'resolved', actualCost: 480 }, 'user-1')
    // Exactly one resolve-update + one spawned create.
    expect(maintenanceItem.update).toHaveBeenCalledTimes(1)
    expect(maintenanceItem.create).toHaveBeenCalledTimes(1)
    const spawned = maintenanceItem.create.mock.calls[0][0].data
    expect(spawned.status).toBe('open')
    expect(spawned.actualCost).toBeNull() // realized spend clears on the successor
    expect(spawned.recurrence).toBe('monthly') // inherits the cadence
    expect(spawned.vendor).toBe('ACME HVAC') // carries the durable definition
    expect(spawned.priority).toBe('high')
    expect(spawned.category).toBe('HVAC')
    expect(spawned.seriesId).toBe('rec1') // first resolve seeds the series id
    // Anchor-on-schedule: monthly past 2026-06-15 → 2026-07-15 (UTC-midnight).
    expect((spawned.targetDate as Date).toISOString().slice(0, 10)).toBe('2026-07-15')
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'facilities.recurrence_spawned', targetType: 'maintenance_items' }),
    )
  })

  it('does NOT spawn when a ONE-OFF (recurrence none) item is resolved', async () => {
    const existing = itemRow({
      id: 'x',
      status: 'open',
      recurrence: 'none',
      targetDate: new Date('2026-06-15T00:00:00.000Z'),
    })
    const { svc, maintenanceItem } = makeService({ item: { findFirst: vi.fn(async () => existing) } })
    await svc.updateMaintenance('school-A', 'x', { status: 'resolved' }, 'u')
    expect(maintenanceItem.create).not.toHaveBeenCalled()
  })

  it('does NOT re-spawn on re-saving an ALREADY-resolved recurring item (double-spawn guard)', async () => {
    const existing = itemRow({
      id: 'y',
      status: 'resolved', // pre-update status is already resolved → no transition
      recurrence: 'monthly',
      targetDate: new Date('2026-06-15T00:00:00.000Z'),
    })
    const { svc, maintenanceItem } = makeService({ item: { findFirst: vi.fn(async () => existing) } })
    await svc.updateMaintenance('school-A', 'y', { notes: 'touch' }, 'u')
    expect(maintenanceItem.create).not.toHaveBeenCalled()
  })

  it('carries the EXISTING seriesId onto later occurrences (series stays stable)', async () => {
    const existing = itemRow({
      id: 'occ2',
      status: 'open',
      recurrence: 'monthly',
      seriesId: 'rec1', // already part of a series seeded by an earlier occurrence
      targetDate: new Date('2026-07-15T00:00:00.000Z'),
    })
    const { svc, maintenanceItem } = makeService({ item: { findFirst: vi.fn(async () => existing) } })
    await svc.updateMaintenance('school-A', 'occ2', { status: 'resolved' }, 'u')
    const spawned = maintenanceItem.create.mock.calls[0][0].data
    expect(spawned.seriesId).toBe('rec1') // NOT reseeded to occ2
    expect((spawned.targetDate as Date).toISOString().slice(0, 10)).toBe('2026-08-15')
  })
})

describe('FacilitiesService — resolvedAt stamp (FY-window anchor)', () => {
  it('stamps resolvedAt exactly on the transition INTO resolved', async () => {
    const existing = itemRow({ id: 's1', status: 'in_progress' })
    const { svc, maintenanceItem } = makeService({ item: { findFirst: vi.fn(async () => existing) } })
    await svc.updateMaintenance('school-A', 's1', { status: 'resolved' }, 'u')
    const data = maintenanceItem.update.mock.calls[0][0].data
    expect(data.resolvedAt).toBeInstanceOf(Date)
  })

  it('NEVER re-stamps on a re-save of an already-resolved item (keeps the original)', async () => {
    const original = new Date('2026-01-15T00:00:00.000Z')
    const existing = itemRow({ id: 's2', status: 'resolved', resolvedAt: original })
    const { svc, maintenanceItem } = makeService({ item: { findFirst: vi.fn(async () => existing) } })
    await svc.updateMaintenance('school-A', 's2', { notes: 'touch' }, 'u')
    const data = maintenanceItem.update.mock.calls[0][0].data
    expect(data.resolvedAt).toBe(original)
  })

  it('a non-resolving update leaves resolvedAt null', async () => {
    const existing = itemRow({ id: 's3', status: 'open' })
    const { svc, maintenanceItem } = makeService({ item: { findFirst: vi.fn(async () => existing) } })
    await svc.updateMaintenance('school-A', 's3', { priority: 'high' }, 'u')
    expect(maintenanceItem.update.mock.calls[0][0].data.resolvedAt).toBeNull()
  })
})

describe('FacilitiesService — recurrence successor copy-list (D9)', () => {
  it('successor copies vendorId + legacy vendor but is born CLEAN of decision/close-out state', async () => {
    const existing = itemRow({
      id: 'rec9',
      status: 'scheduled',
      recurrence: 'monthly',
      targetDate: new Date('2026-06-15T00:00:00.000Z'),
      vendor: 'ACME HVAC',
      vendorId: 'v1',
      selectedBidId: 'b-won',
      decidedByUserId: 'owner-1',
      decidedAt: new Date('2026-06-01T00:00:00.000Z'),
      decisionNote: 'go with ACME',
      resolvedAt: null,
      actualCost: decimal(999),
    })
    const { svc, maintenanceItem } = makeService({ item: { findFirst: vi.fn(async () => existing) } })
    await svc.updateMaintenance('school-A', 'rec9', { status: 'resolved' }, 'u')
    expect(maintenanceItem.create).toHaveBeenCalledTimes(1) // spawn still fires
    const spawned = maintenanceItem.create.mock.calls[0][0].data
    // Durable vendor definition carries over…
    expect(spawned.vendor).toBe('ACME HVAC')
    expect(spawned.vendorId).toBe('v1')
    // …decision/close-out state NEVER does (absent from the create → null columns).
    expect(spawned.selectedBidId).toBeUndefined()
    expect(spawned.decidedByUserId).toBeUndefined()
    expect(spawned.decidedAt).toBeUndefined()
    expect(spawned.decisionNote).toBeUndefined()
    expect(spawned.resolvedAt).toBeUndefined()
    expect(spawned.actualCost).toBeNull()
  })
})

describe('FacilitiesService — pendingBidCount enrichment + needsDecisionCount', () => {
  it('one groupBy feeds per-item pendingBidCount; summary gains needsDecisionCount (frozen rule)', async () => {
    const { svc, maintenanceBid } = makeService({
      item: {
        findMany: vi.fn(async () => [
          // 2 pending bids, not resolved → needs decision.
          itemRow({ id: 'two', status: 'open' }),
          // 1 pending bid + overdue → needs decision.
          itemRow({ id: 'one-late', status: 'open', targetDate: new Date('2026-06-01T00:00:00.000Z') }),
          // 1 pending bid, on-track → NOT counted.
          itemRow({ id: 'one-ok', status: 'open', targetDate: new Date('2026-12-01T00:00:00.000Z') }),
          // resolved with bids → NOT counted.
          itemRow({ id: 'done', status: 'resolved' }),
        ]),
      },
      bid: {
        groupBy: vi.fn(async () => [
          { itemId: 'two', _count: { _all: 2 }, _min: { amount: 1200.5 }, _max: { amount: 2400 } },
          { itemId: 'one-late', _count: { _all: 1 }, _min: { amount: 900 }, _max: { amount: 900 } },
          { itemId: 'one-ok', _count: { _all: 1 }, _min: { amount: 50 }, _max: { amount: 50 } },
          { itemId: 'done', _count: { _all: 3 }, _min: { amount: 1 }, _max: { amount: 3 } },
        ]),
      },
    })
    const res = await svc.listMaintenance('school-A', NOW)
    expect(maintenanceBid.groupBy).toHaveBeenCalledTimes(1) // no per-item N+1
    expect(res.items.find((i) => i.id === 'two')!.pendingBidCount).toBe(2)
    expect(res.items.find((i) => i.id === 'one-late')!.pendingBidCount).toBe(1)
    // Rail "bid amount range" rides the SAME groupBy (_min/_max — still no N+1).
    expect(res.items.find((i) => i.id === 'two')!.pendingBidMin).toBe(1200.5)
    expect(res.items.find((i) => i.id === 'two')!.pendingBidMax).toBe(2400)
    expect(res.items.find((i) => i.id === 'one-ok')!.pendingBidMin).toBe(50)
    expect(res.summary.needsDecisionCount).toBe(2)
    // Pre-existing summary fields unchanged (briefing STEP 2.8 backward compat).
    expect(res.summary.openCount).toBe(3)
  })

  it('vendorName resolves vendorRef.name over the legacy free-text vendor', async () => {
    const { svc } = makeService({
      item: {
        findMany: vi.fn(async () => [
          itemRow({ id: 'linked', vendorId: 'v1', vendorRef: { name: 'Structured Co' }, vendor: 'Old Text' }),
          itemRow({ id: 'legacy', vendor: 'Legacy Plumber' }),
        ]),
      },
    })
    const res = await svc.listMaintenance('school-A', NOW)
    expect(res.items.find((i) => i.id === 'linked')!.vendorName).toBe('Structured Co')
    expect(res.items.find((i) => i.id === 'legacy')!.vendorName).toBe('Legacy Plumber')
  })
})
