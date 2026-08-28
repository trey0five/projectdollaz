import { describe, expect, it, vi } from 'vitest'
import { BadRequestException } from '@nestjs/common'
import { AccreditationService } from './accreditation.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// WS3 F2 — DELEGATION. Three house rules, asserted:
//   1. ownerUserId is MEMBERSHIP-VALIDATED at write: an active member of the
//      PATH school or 400 — a valid userId from another tenant returns null
//      from the school-scoped query, so cross-tenant assignment is impossible.
//   2. NOTIFY ONLY ON SET/CHANGE: renaming a standard (or any unrelated PATCH)
//      must not re-notify its owner; clearing notifies nobody.
//   3. Legacy free-text `owner` stays untouched beside it (display fallback).
// ─────────────────────────────────────────────────────────────────────────────

const SCHOOL = 'school-A'
const MEMBER = '11111111-1111-4111-8111-111111111111'
const OTHER_MEMBER = '22222222-2222-4222-8222-222222222222'
const STRANGER = '99999999-9999-4999-8999-999999999999'

function baseRow(over: Record<string, unknown> = {}) {
  return {
    id: 'std-1',
    schoolId: SCHOOL,
    parentId: null,
    code: 'COG-8',
    title: 'Governing authority',
    category: null,
    rating: 'not_started',
    reviewDate: null,
    owner: 'Jane (free text)',
    ownerUserId: null,
    notes: null,
    rubricScore: null,
    frameworkId: null,
    catalogStandardId: null,
    sortOrder: null,
    scoreProvenance: 'self',
    rubricScoredAt: null,
    rubricScoredByUserId: null,
    strategySourceType: null,
    strategySourceRef: null,
    updatedByUserId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...over,
  }
}

function makeService(existing = baseRow()) {
  const state = { row: existing }
  const standard = {
    findMany: vi.fn(async () => [state.row]),
    findFirst: vi.fn(async ({ where }: { where: { id: string; schoolId: string } }) =>
      where.id === state.row.id && where.schoolId === state.row.schoolId ? state.row : null,
    ),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      state.row = baseRow({ ...data, id: 'std-new' })
      return state.row
    }),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      state.row = { ...state.row, ...data }
      return state.row
    }),
    count: vi.fn(async () => 0),
  }
  const membership = {
    findFirst: vi.fn(
      async ({ where }: { where: { schoolId: string; userId: string; status: string } }) =>
        where.schoolId === SCHOOL &&
        where.status === 'active' &&
        [MEMBER, OTHER_MEMBER].includes(where.userId)
          ? { id: 'm-1' }
          : null,
    ),
  }
  const prisma = {
    accreditationStandard: standard,
    accreditationEvidence: { groupBy: vi.fn(async () => []), count: vi.fn(async () => 0) },
    membership,
    accreditationCatalogStandard: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
    accreditationFramework: { findMany: vi.fn(async () => []) },
    strategicPlan: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
    strategyGoal: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
  }
  const audit = { write: vi.fn(async () => undefined) }
  const snapshot = { captureOnEvent: vi.fn() }
  const notifications = { notifyAssignment: vi.fn(async () => undefined) }
  const svc = new AccreditationService(
    prisma as never,
    audit as never,
    snapshot as never,
    notifications as never,
  )
  return { svc, prisma, notifications, membership, state }
}

describe('WS3 F2 — ownerUserId validation', () => {
  it('a non-member (or cross-tenant) owner 400s on update, and nothing is written', async () => {
    const { svc, prisma } = makeService()
    await expect(
      svc.updateStandard(SCHOOL, 'std-1', { ownerUserId: STRANGER }, 'actor-1'),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.accreditationStandard.update).not.toHaveBeenCalled()
  })

  it('a non-member owner 400s on create too', async () => {
    const { svc, prisma } = makeService()
    await expect(
      svc.createStandard(SCHOOL, { code: 'X-1', title: 'T', ownerUserId: STRANGER } as never, 'actor-1'),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.accreditationStandard.create).not.toHaveBeenCalled()
  })

  it('the membership check is SCHOOL-SCOPED and active-only', async () => {
    const { svc, membership } = makeService()
    await svc.updateStandard(SCHOOL, 'std-1', { ownerUserId: MEMBER }, 'actor-1')
    expect(membership.findFirst).toHaveBeenCalledWith({
      where: { schoolId: SCHOOL, userId: MEMBER, status: 'active' },
    })
  })
})

describe('WS3 F2 — notify ONLY on set/change', () => {
  it('setting an owner notifies once, with the standards deep link', async () => {
    const { svc, notifications } = makeService()
    await svc.updateStandard(SCHOOL, 'std-1', { ownerUserId: MEMBER }, 'actor-1')
    expect(notifications.notifyAssignment).toHaveBeenCalledTimes(1)
    expect(notifications.notifyAssignment).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: MEMBER,
        actorUserId: 'actor-1',
        schoolId: SCHOOL,
        what: 'accreditation standard',
        link: expect.stringContaining('/accreditation?center=standards&standard='),
      }),
    )
  })

  it('an UNRELATED patch (rename) does NOT re-notify the standing owner', async () => {
    const { svc, notifications } = makeService(baseRow({ ownerUserId: MEMBER }))
    await svc.updateStandard(SCHOOL, 'std-1', { title: 'Renamed' }, 'actor-1')
    expect(notifications.notifyAssignment).not.toHaveBeenCalled()
  })

  it('re-asserting the SAME owner does not notify (no change, no noise)', async () => {
    const { svc, notifications } = makeService(baseRow({ ownerUserId: MEMBER }))
    await svc.updateStandard(SCHOOL, 'std-1', { ownerUserId: MEMBER }, 'actor-1')
    expect(notifications.notifyAssignment).not.toHaveBeenCalled()
  })

  it('changing the owner notifies the NEW owner', async () => {
    const { svc, notifications } = makeService(baseRow({ ownerUserId: MEMBER }))
    await svc.updateStandard(SCHOOL, 'std-1', { ownerUserId: OTHER_MEMBER }, 'actor-1')
    expect(notifications.notifyAssignment).toHaveBeenCalledTimes(1)
    expect(notifications.notifyAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ userId: OTHER_MEMBER }),
    )
  })

  it('clearing the owner (explicit null) notifies NOBODY and clears the column', async () => {
    const { svc, notifications, state } = makeService(baseRow({ ownerUserId: MEMBER }))
    await svc.updateStandard(SCHOOL, 'std-1', { ownerUserId: null }, 'actor-1')
    expect(notifications.notifyAssignment).not.toHaveBeenCalled()
    expect(state.row.ownerUserId).toBeNull()
  })

  it('create with an owner notifies; create without stays silent', async () => {
    const a = makeService()
    await a.svc.createStandard(SCHOOL, { code: 'X-1', title: 'T', ownerUserId: MEMBER } as never, 'actor-1')
    expect(a.notifications.notifyAssignment).toHaveBeenCalledTimes(1)

    const b = makeService()
    await b.svc.createStandard(SCHOOL, { code: 'X-2', title: 'T' } as never, 'actor-1')
    expect(b.notifications.notifyAssignment).not.toHaveBeenCalled()
  })
})

describe('WS3 F2 — legacy free-text owner is the untouched display fallback', () => {
  it('setting ownerUserId leaves the free-text owner byte-identical', async () => {
    const { svc, state } = makeService()
    await svc.updateStandard(SCHOOL, 'std-1', { ownerUserId: MEMBER }, 'actor-1')
    expect(state.row.owner).toBe('Jane (free text)')
    expect(state.row.ownerUserId).toBe(MEMBER)
  })
})
