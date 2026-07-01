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
    targetDate: null,
    notes: null,
    createdByUserId: null,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    ...over,
  }
}

function makeService(over: { item?: Record<string, unknown> } = {}) {
  const maintenanceItem = {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => itemRow(data)),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => itemRow(data)),
    delete: vi.fn(async () => itemRow()),
    ...over.item,
  }
  const prisma = { maintenanceItem }
  const audit = { write: vi.fn(async () => undefined) }
  const svc = new FacilitiesService(prisma as never, audit as never)
  return { svc, maintenanceItem, audit }
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
    expect(maintenanceItem.findMany).toHaveBeenCalledWith({ where: { schoolId: 'school-A' } })
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
    expect(maintenanceItem.findFirst).toHaveBeenCalledWith({ where: { id: 'm1', schoolId: 'school-A' } })
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
})
