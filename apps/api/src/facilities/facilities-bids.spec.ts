import { describe, expect, it, vi } from 'vitest'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import 'reflect-metadata'

// ─────────────────────────────────────────────────────────────────────────────
// Facilities vendors/bids — bid lifecycle (accept atomicity, sibling rejection,
// item stamping, reopen undo, decided-bid immutability), vendor referential
// guards, and the DECLARATIVE role gates (owner-only accept/reopen — the roles-
// clarity contract, asserted straight off the @Roles metadata like
// BillingController.addModule). Prisma/Audit hand-mocked; no Nest boot, no DB.
// ─────────────────────────────────────────────────────────────────────────────

// Local copies of the spec-file factory shape (kept independent so this file
// documents the bid flows on its own).
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

function makeService(
  over: {
    item?: Record<string, unknown>
    bid?: Record<string, unknown>
    vendor?: Record<string, unknown>
  } = {},
) {
  const maintenanceItem = {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => itemRow()),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => itemRow(data)),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => itemRow(data)),
    // Conditional stamp-clear (reopenBid race guard) — 1 row matched by default.
    updateMany: vi.fn(async () => ({ count: 1 })),
    delete: vi.fn(async () => itemRow()),
    count: vi.fn(async () => 0),
    ...over.item,
  }
  const maintenanceBid = {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
    groupBy: vi.fn(async () => []),
    count: vi.fn(async () => 0),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => bidRow(data)),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => bidRow(data)),
    // Conditional winner flip (acceptBid race guard) matches 1 row by default;
    // the sibling-rejection call's count is never read.
    updateMany: vi.fn(async () => ({ count: 1 })),
    delete: vi.fn(async () => bidRow()),
    ...over.bid,
  }
  const vendor = {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
    count: vi.fn(async () => 0),
    delete: vi.fn(async () => ({})),
    ...over.vendor,
  }
  const prisma: Record<string, unknown> = { maintenanceItem, maintenanceBid, vendor }
  const $transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma))
  prisma.$transaction = $transaction
  const audit = { write: vi.fn(async () => undefined) }
  return { prisma, maintenanceItem, maintenanceBid, vendor, audit, $transaction }
}

async function makeSvc(over: Parameters<typeof makeService>[0] = {}) {
  const { FacilitiesService } = await import('./facilities.service.js')
  const parts = makeService(over)
  const svc = new FacilitiesService(parts.prisma as never, parts.audit as never)
  return { svc, ...parts }
}

describe('acceptBid — atomic winner + sibling rejection + item stamp', () => {
  it('runs INSIDE one $transaction: winner accepted, pending siblings rejected, item stamped, open→scheduled', async () => {
    const winner = bidRow({ id: 'b-win', vendorId: 'v1', vendor: { name: 'Structured Co' }, amount: decimal(2500) })
    const item = itemRow({ id: 'm1', status: 'open', estimatedCost: decimal(9000) })
    const { svc, maintenanceBid, maintenanceItem, audit, $transaction } = await makeSvc({
      bid: {
        findFirst: vi.fn(async () => winner),
        findMany: vi.fn(async () => [
          bidRow({ id: 'b-win', status: 'accepted', vendor: { name: 'Structured Co' } }),
          bidRow({ id: 'b-lose', status: 'rejected' }),
        ]),
      },
      item: { findFirst: vi.fn(async () => item) },
    })
    const res = await svc.acceptBid('school-A', 'm1', 'b-win', 'go with Structured', 'owner-1')

    expect($transaction).toHaveBeenCalledTimes(1)
    // Winner flipped to accepted CONDITIONALLY on still-pending (race guard).
    expect(maintenanceBid.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'b-win', status: 'pending' },
        data: { status: 'accepted' },
      }),
    )
    // EVERY other still-pending sibling rejected in one updateMany.
    expect(maintenanceBid.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: 'school-A', itemId: 'm1', status: 'pending', id: { not: 'b-win' } },
        data: { status: 'rejected' },
      }),
    )
    // Item stamped: selectedBid, vendor link + RESOLVED display name, winning amount
    // as estimatedCost, Task-style decision stamp, open→scheduled.
    const stamped = maintenanceItem.update.mock.calls[0][0].data
    expect(stamped.selectedBidId).toBe('b-win')
    expect(stamped.vendorId).toBe('v1')
    expect(stamped.vendor).toBe('Structured Co') // vendor row name wins over free text
    expect(stamped.estimatedCost).toStrictEqual(winner.amount)
    expect(stamped.decidedByUserId).toBe('owner-1')
    expect(stamped.decidedAt).toBeInstanceOf(Date)
    expect(stamped.decisionNote).toBe('go with Structured')
    expect(stamped.status).toBe('scheduled')
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'facilities.bid.accepted', targetId: 'b-win' }),
    )
    // Response = stamped item + the full bid list (winner badge + muted siblings).
    expect(res.bids.map((b) => b.status)).toEqual(['accepted', 'rejected'])
    expect(res.item.pendingBidCount).toBe(0)
  })

  it('a non-open status is NOT bumped (in_progress stays in_progress)', async () => {
    const { svc, maintenanceItem } = await makeSvc({
      bid: { findFirst: vi.fn(async () => bidRow()) },
      item: { findFirst: vi.fn(async () => itemRow({ status: 'in_progress' })) },
    })
    await svc.acceptBid('school-A', 'm1', 'b1', null, 'owner-1')
    expect(maintenanceItem.update.mock.calls[0][0].data.status).toBe('in_progress')
  })

  it('400 when the bid is not pending; 400 when the item is resolved; 404 on a foreign bid', async () => {
    const decided = await makeSvc({ bid: { findFirst: vi.fn(async () => bidRow({ status: 'rejected' })) } })
    await expect(decided.svc.acceptBid('school-A', 'm1', 'b1', null, 'o')).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(decided.maintenanceItem.update).not.toHaveBeenCalled()

    const resolved = await makeSvc({
      bid: { findFirst: vi.fn(async () => bidRow()) },
      item: { findFirst: vi.fn(async () => itemRow({ status: 'resolved' })) },
    })
    await expect(resolved.svc.acceptBid('school-A', 'm1', 'b1', null, 'o')).rejects.toBeInstanceOf(
      BadRequestException,
    )

    const foreign = await makeSvc({ bid: { findFirst: vi.fn(async () => null) } })
    await expect(foreign.svc.acceptBid('school-B', 'm1', 'b-of-A', null, 'o')).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('400 when the conditional winner flip matches 0 rows (lost a concurrent accept race)', async () => {
    // Simulates READ COMMITTED: the pre-read saw 'pending' but another tx decided
    // the bid before our updateMany re-evaluated its predicate.
    const { svc, maintenanceItem } = await makeSvc({
      bid: {
        findFirst: vi.fn(async () => bidRow()),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
    })
    await expect(svc.acceptBid('school-A', 'm1', 'b1', null, 'o')).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(maintenanceItem.update).not.toHaveBeenCalled()
  })
})

describe('reopenBid — the owner undo', () => {
  it('restores ALL bids to pending and clears ONLY the decision stamp (cost/vendor/status kept)', async () => {
    const { svc, maintenanceBid, maintenanceItem, audit } = await makeSvc({
      bid: {
        findFirst: vi.fn(async () => bidRow({ id: 'b-win', status: 'accepted' })),
        findMany: vi.fn(async () => [bidRow({ id: 'b-win' }), bidRow({ id: 'b-lose' })]),
      },
      item: { findFirst: vi.fn(async () => itemRow({ selectedBidId: 'b-win', status: 'scheduled' })) },
    })
    const res = await svc.reopenBid('school-A', 'm1', 'b-win', 'owner-1')
    expect(maintenanceBid.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: 'school-A', itemId: 'm1' },
        data: { status: 'pending' },
      }),
    )
    // Stamp cleared CONDITIONALLY on selectedBidId still being :bidId (race guard);
    // estimatedCost / vendorId / vendor / status DELIBERATELY untouched.
    expect(maintenanceItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'm1', selectedBidId: 'b-win' },
        data: {
          selectedBidId: null,
          decidedByUserId: null,
          decidedAt: null,
          decisionNote: null,
        },
      }),
    )
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'facilities.bid.reopened' }),
    )
    expect(res.item.pendingBidCount).toBe(2)
  })

  it('400 unless :bidId is the CURRENT selectedBidId', async () => {
    const { svc, maintenanceItem } = await makeSvc({
      bid: { findFirst: vi.fn(async () => bidRow({ id: 'b-other' })) },
      item: { findFirst: vi.fn(async () => itemRow({ selectedBidId: 'b-win' })) },
    })
    await expect(svc.reopenBid('school-A', 'm1', 'b-other', 'o')).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(maintenanceItem.updateMany).not.toHaveBeenCalled()
  })

  it('400 when the conditional stamp-clear matches 0 rows (lost a concurrent accept/reopen race)', async () => {
    const { svc } = await makeSvc({
      bid: { findFirst: vi.fn(async () => bidRow({ id: 'b-win', status: 'accepted' })) },
      item: {
        findFirst: vi.fn(async () => itemRow({ selectedBidId: 'b-win', status: 'scheduled' })),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
    })
    await expect(svc.reopenBid('school-A', 'm1', 'b-win', 'o')).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })
})

describe('bid mutations — pending-only + vendor invariant', () => {
  it('create 400s with NEITHER vendorId nor vendorName; resolved item 400s', async () => {
    const { svc } = await makeSvc()
    await expect(
      svc.createBid('school-A', 'm1', { amount: 100 }, 'u'),
    ).rejects.toBeInstanceOf(BadRequestException)

    const resolved = await makeSvc({ item: { findFirst: vi.fn(async () => itemRow({ status: 'resolved' })) } })
    await expect(
      resolved.svc.createBid('school-A', 'm1', { amount: 100, vendorName: 'X' }, 'u'),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('create validates a vendorId belongs to the school (400 on foreign)', async () => {
    const { svc } = await makeSvc({ vendor: { findFirst: vi.fn(async () => null) } })
    await expect(
      svc.createBid('school-A', 'm1', { amount: 100, vendorId: 'v-of-other-school' }, 'u'),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('PATCH/DELETE 400 once decided (accepted or rejected) — immutable record', async () => {
    for (const status of ['accepted', 'rejected']) {
      const { svc, maintenanceBid } = await makeSvc({
        bid: { findFirst: vi.fn(async () => bidRow({ status })) },
      })
      await expect(svc.updateBid('school-A', 'm1', 'b1', { amount: 1 }, 'u')).rejects.toBeInstanceOf(
        BadRequestException,
      )
      await expect(svc.removeBid('school-A', 'm1', 'b1', 'u')).rejects.toBeInstanceOf(
        BadRequestException,
      )
      expect(maintenanceBid.update).not.toHaveBeenCalled()
      expect(maintenanceBid.delete).not.toHaveBeenCalled()
    }
  })

  it('pending bids CAN be edited and deleted', async () => {
    const { svc, maintenanceBid } = await makeSvc({
      bid: { findFirst: vi.fn(async () => bidRow({ status: 'pending' })) },
    })
    await svc.updateBid('school-A', 'm1', 'b1', { amount: 999 }, 'u')
    expect(maintenanceBid.update).toHaveBeenCalled()
    await svc.removeBid('school-A', 'm1', 'b1', 'u')
    expect(maintenanceBid.delete).toHaveBeenCalled()
  })

  it('PATCH cannot strip the vendor identity entirely (merged vendorId+vendorName both null → 400)', async () => {
    const { svc, maintenanceBid } = await makeSvc({
      bid: { findFirst: vi.fn(async () => bidRow({ vendorId: null, vendorName: 'ACME HVAC' })) },
    })
    await expect(
      svc.updateBid('school-A', 'm1', 'b1', { vendorId: null, vendorName: null } as never, 'u'),
    ).rejects.toBeInstanceOf(BadRequestException)
    // Whitespace-only free text trims to null — same guard.
    await expect(
      svc.updateBid('school-A', 'm1', 'b1', { vendorName: '   ' }, 'u'),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(maintenanceBid.update).not.toHaveBeenCalled()
  })
})

describe('vendors — dedupe advisory + referential delete guard', () => {
  it('create 400s on a case-insensitive duplicate name', async () => {
    const { svc } = await makeSvc({
      vendor: { findFirst: vi.fn(async () => ({ id: 'v1', name: 'ACME HVAC' })) },
    })
    await expect(svc.createVendor('school-A', { name: 'acme hvac' }, 'u')).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it('delete 400s while any bid or item references the vendor (deactivate instead)', async () => {
    const { svc, vendor } = await makeSvc({
      vendor: {
        findFirst: vi.fn(async () => ({ id: 'v1', schoolId: 'school-A', name: 'ACME' })),
        count: vi.fn(async () => 0),
      },
      bid: { count: vi.fn(async () => 2) },
      item: { count: vi.fn(async () => 0) },
    })
    await expect(svc.removeVendor('school-A', 'v1', 'u')).rejects.toThrow(/deactivate/)
    expect(vendor.delete).not.toHaveBeenCalled()
  })

  it('update rejects a whitespace-only name (mirrors the create guard — no blank vendors)', async () => {
    const { svc } = await makeSvc({
      vendor: {
        findFirst: vi.fn(async () => ({ id: 'v1', schoolId: 'school-A', name: 'ACME' })),
        update: vi.fn(async () => ({})),
      },
    })
    await expect(svc.updateVendor('school-A', 'v1', { name: '   ' }, 'u')).rejects.toThrow(
      /name is required/,
    )
  })
})

describe('role gates — the roles-clarity contract (declarative @Roles metadata)', () => {
  it('accept + reopen are OWNER-ONLY; bid CRUD is owner/accountant; reads include viewer', async () => {
    const { BidsController } = await import('./bids.controller.js')
    const { ROLES_KEY } = await import('../common/decorators/roles.decorator.js')
    const roles = (m: string) => Reflect.getMetadata(ROLES_KEY, BidsController.prototype[m as never])
    expect(roles('accept')).toEqual(['owner'])
    expect(roles('reopen')).toEqual(['owner'])
    expect(roles('create')).toEqual(['owner', 'accountant'])
    expect(roles('update')).toEqual(['owner', 'accountant'])
    expect(roles('remove')).toEqual(['owner', 'accountant'])
    expect(roles('list')).toEqual(['owner', 'accountant', 'viewer'])
  })

  it('vendors: writes owner/accountant, reads include viewer', async () => {
    const { VendorsController } = await import('./vendors.controller.js')
    const { ROLES_KEY } = await import('../common/decorators/roles.decorator.js')
    const roles = (m: string) =>
      Reflect.getMetadata(ROLES_KEY, VendorsController.prototype[m as never])
    expect(roles('list')).toEqual(['owner', 'accountant', 'viewer'])
    expect(roles('create')).toEqual(['owner', 'accountant'])
    expect(roles('update')).toEqual(['owner', 'accountant'])
    expect(roles('remove')).toEqual(['owner', 'accountant'])
  })

  it('facilities budget: GET open to all roles, config PUT owner/accountant', async () => {
    const { FacilitiesBudgetController } = await import('./facilities-budget.controller.js')
    const { ROLES_KEY } = await import('../common/decorators/roles.decorator.js')
    const roles = (m: string) =>
      Reflect.getMetadata(ROLES_KEY, FacilitiesBudgetController.prototype[m as never])
    expect(roles('get')).toEqual(['owner', 'accountant', 'viewer'])
    expect(roles('putConfig')).toEqual(['owner', 'accountant'])
  })
})
