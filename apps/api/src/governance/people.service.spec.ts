import { describe, expect, it, vi } from 'vitest'
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { PeopleService } from './people.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// PeopleService — TENANT ISOLATION, term-order validation, membership 409, and
// deterministic ordering. Prisma + Audit + DocumentsService are hand-mocked
// (no DB, no Nest boot) — mirrors committees.service.spec.ts.
// ─────────────────────────────────────────────────────────────────────────────

function personRow(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    schoolId: 'school-A',
    name: 'Jane Smith',
    title: 'Board Chair',
    groups: ['board'],
    termStart: null,
    termEnd: null,
    email: null,
    bio: null,
    active: true,
    userId: null,
    updatedByUserId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...over,
  }
}

function memberRow(over: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    schoolId: 'school-A',
    committeeId: 'c1',
    personId: 'p1',
    role: 'member',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    person: {
      id: 'p1',
      name: 'Jane Smith',
      title: null,
      email: null,
      groups: [],
      active: true,
    },
    ...over,
  }
}

function makeService(prismaOver: Record<string, unknown> = {}) {
  const governancePerson = {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => personRow(data)),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => personRow(data)),
    delete: vi.fn(async () => personRow()),
  }
  const committeeMembership = {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
    findUnique: vi.fn(async () => null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => memberRow(data)),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => memberRow(data)),
    delete: vi.fn(async () => memberRow()),
  }
  const committee = { findFirst: vi.fn(async () => ({ id: 'c1' })) }
  const knowledgeDocument = { groupBy: vi.fn(async () => []), findMany: vi.fn(async () => []) }
  const membership = { findFirst: vi.fn(async () => null) }
  const prisma = { governancePerson, committeeMembership, committee, knowledgeDocument, membership, ...prismaOver }
  const audit = { write: vi.fn(async () => undefined) }
  const documents = { listDocuments: vi.fn(async () => ({ documents: [], total: 0 })) }
  const svc = new PeopleService(prisma as never, audit as never, documents as never)
  return { svc, governancePerson, committeeMembership, committee, knowledgeDocument, membership, audit, documents }
}

describe('PeopleService — people register', () => {
  it('list filters by schoolId (+group/active), sorts active-first then name, batches doc counts', async () => {
    const { svc, governancePerson, knowledgeDocument } = makeService()
    governancePerson.findMany = vi.fn(async () => [
      { ...personRow({ id: 'p1', name: 'Zeta', active: true }), _count: { memberships: 2 } },
      { ...personRow({ id: 'p2', name: 'Alpha', active: false }), _count: { memberships: 0 } },
      { ...personRow({ id: 'p3', name: 'Beta', active: true }), _count: { memberships: 1 } },
    ]) as never
    knowledgeDocument.groupBy = vi.fn(async () => [
      { sourceRef: 'p1', _count: { _all: 3 } },
    ]) as never
    const res = await svc.list('school-A', { group: 'board', active: 'true' })
    expect(governancePerson.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: 'school-A', groups: { has: 'board' }, active: true },
      }),
    )
    expect(res.map((p) => p.id)).toEqual(['p3', 'p1', 'p2'])
    const p1 = res.find((p) => p.id === 'p1')
    expect(p1?.membershipCount).toBe(2)
    expect(p1?.documentCount).toBe(3)
    // ONE grouped query for all doc counts — no N+1.
    expect(knowledgeDocument.groupBy).toHaveBeenCalledTimes(1)
  })

  it('create scopes schoolId, defaults groups/active, writes audit', async () => {
    const { svc, governancePerson, audit } = makeService()
    const out = await svc.create('school-A', { name: 'Jane Smith' }, 'user-1')
    const data = governancePerson.create.mock.calls[0][0].data
    expect(data.schoolId).toBe('school-A')
    expect(data.groups).toEqual([])
    expect(data.active).toBe(true)
    expect(out.membershipCount).toBe(0)
    expect(out.documentCount).toBe(0)
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'governance.person.created', targetType: 'governance_people' }),
    )
  })

  it('termEnd before termStart → 400, never writes', async () => {
    const { svc, governancePerson } = makeService()
    await expect(
      svc.create(
        'school-A',
        { name: 'Jane', termStart: '2027-07-01', termEnd: '2026-06-30' },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(governancePerson.create).not.toHaveBeenCalled()
  })

  it('create: linked userId that is NOT an active member of the school → 400, never writes', async () => {
    const { svc, governancePerson, membership } = makeService()
    await expect(
      svc.create('school-A', { name: 'Jane', userId: 'user-of-other-org' }, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(membership.findFirst).toHaveBeenCalledWith({
      where: { schoolId: 'school-A', userId: 'user-of-other-org', status: 'active' },
    })
    expect(governancePerson.create).not.toHaveBeenCalled()
  })

  it('create: linked userId that IS an active member passes', async () => {
    const { svc, membership } = makeService()
    membership.findFirst = vi.fn(async () => ({ id: 'mem-1' })) as never
    const out = await svc.create('school-A', { name: 'Jane', userId: 'user-2' }, 'user-1')
    expect(out.userId).toBe('user-2')
  })

  it('update: a personId owned by ANOTHER school → 404, never mutates', async () => {
    const { svc, governancePerson } = makeService()
    await expect(
      svc.update('school-B', 'person-of-A', { name: 'hijack' }, 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(governancePerson.update).not.toHaveBeenCalled()
  })

  it('update merge-pick: explicit null clears, omitted keeps', async () => {
    const { svc, governancePerson } = makeService()
    governancePerson.findFirst = vi.fn(async () => ({
      ...personRow({ title: 'CFO', bio: 'keep me' }),
      _count: { memberships: 0 },
    })) as never
    await svc.update('school-A', 'p1', { title: null }, 'user-1')
    const data = governancePerson.update.mock.calls[0][0].data
    expect(data.title).toBeNull()
    expect(data.bio).toBe('keep me')
  })

  it('remove: deletes the person (memberships cascade via FK) but NEVER touches documents', async () => {
    const { svc, governancePerson, knowledgeDocument } = makeService()
    governancePerson.findFirst = vi.fn(async () => personRow()) as never
    const res = await svc.remove('school-A', 'p1', 'user-1')
    expect(res).toEqual({ ok: true })
    expect(governancePerson.delete).toHaveBeenCalledWith({ where: { id: 'p1' } })
    expect(knowledgeDocument.findMany).not.toHaveBeenCalled()
  })

  it('detail returns memberships with committee names + the EXACT knowledge document objects', async () => {
    const { svc, governancePerson, documents } = makeService()
    governancePerson.findFirst = vi.fn(async () => ({
      ...personRow(),
      memberships: [
        { ...memberRow({ id: 'm2', role: 'member' }), committee: { name: 'Zeta' } },
        { ...memberRow({ id: 'm1', role: 'chair' }), committee: { name: 'Finance Committee' } },
      ],
    })) as never
    const doc = { id: 'd1', title: 'CPA License', tags: ['license'] }
    documents.listDocuments = vi.fn(async () => ({ documents: [doc], total: 1 })) as never
    const res = await svc.detail('school-A', 'p1')
    expect(documents.listDocuments).toHaveBeenCalledWith('school-A', {
      sourceType: 'governance_person',
      sourceRef: 'p1',
    })
    // chair sorts before member.
    expect(res.memberships.map((m) => m.id)).toEqual(['m1', 'm2'])
    expect(res.memberships[0].committeeName).toBe('Finance Committee')
    expect(res.documents).toEqual([doc])
    expect(res.membershipCount).toBe(2)
    expect(res.documentCount).toBe(1)
  })
})

describe('PeopleService — committee membership', () => {
  it('addMember validates BOTH committee and person ∈ the path school (404 else)', async () => {
    const { svc, committee, committeeMembership } = makeService()
    committee.findFirst = vi.fn(async () => null) as never
    await expect(
      svc.addMember('school-B', 'committee-of-A', { personId: 'p1' }, 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(committeeMembership.create).not.toHaveBeenCalled()
  })

  it('addMember: cross-school personId → 404, never creates', async () => {
    const { svc, governancePerson, committeeMembership } = makeService()
    governancePerson.findFirst = vi.fn(async () => null) as never
    await expect(
      svc.addMember('school-A', 'c1', { personId: 'person-of-B' }, 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(committeeMembership.create).not.toHaveBeenCalled()
  })

  it('addMember: duplicate membership → 409', async () => {
    const { svc, governancePerson, committeeMembership } = makeService()
    governancePerson.findFirst = vi.fn(async () => ({ id: 'p1' })) as never
    committeeMembership.findUnique = vi.fn(async () => memberRow()) as never
    await expect(
      svc.addMember('school-A', 'c1', { personId: 'p1' }, 'user-1'),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(committeeMembership.create).not.toHaveBeenCalled()
  })

  it('addMember defaults role to member and returns the person-carrying shape', async () => {
    const { svc, governancePerson, committeeMembership } = makeService()
    governancePerson.findFirst = vi.fn(async () => ({ id: 'p1' })) as never
    const out = await svc.addMember('school-A', 'c1', { personId: 'p1' }, 'user-1')
    const data = committeeMembership.create.mock.calls[0][0].data
    expect(data.role).toBe('member')
    expect(data.schoolId).toBe('school-A')
    expect(out.person.name).toBe('Jane Smith')
  })

  it('listMembers orders chair → vice_chair → secretary → member, then name', async () => {
    const { svc, committeeMembership } = makeService()
    committeeMembership.findMany = vi.fn(async () => [
      memberRow({ id: 'm1', role: 'member', person: { id: 'p1', name: 'Alpha', title: null, email: null, groups: [], active: true } }),
      memberRow({ id: 'm2', role: 'chair', person: { id: 'p2', name: 'Zeta', title: null, email: null, groups: [], active: true } }),
      memberRow({ id: 'm3', role: 'secretary', person: { id: 'p3', name: 'Beta', title: null, email: null, groups: [], active: true } }),
      memberRow({ id: 'm4', role: 'member', person: { id: 'p4', name: 'Aardvark', title: null, email: null, groups: [], active: true } }),
    ]) as never
    const res = await svc.listMembers('school-A', 'c1')
    expect(res.map((m) => m.id)).toEqual(['m2', 'm3', 'm4', 'm1'])
  })

  it('updateMemberRole / removeMember: foreign membershipId → 404', async () => {
    const { svc, committeeMembership } = makeService()
    await expect(
      svc.updateMemberRole('school-B', 'c1', 'm-of-A', { role: 'chair' }, 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException)
    await expect(svc.removeMember('school-B', 'c1', 'm-of-A', 'user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(committeeMembership.update).not.toHaveBeenCalled()
    expect(committeeMembership.delete).not.toHaveBeenCalled()
  })
})
