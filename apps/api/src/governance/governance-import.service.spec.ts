// #46 — board roster + committee list imports: preview matches by email then
// name and never writes; commit merges (update what matches, create the rest)
// through PeopleService / CommitteesService.
import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import { BadRequestException, ConflictException } from '@nestjs/common'
import { GovernanceImportService, isoDateFromText } from './governance-import.service.js'

const file = (s: string) => ({ buffer: Buffer.from(s, 'utf8'), size: s.length })

function make(opts: { people?: Array<{ id: string; name: string; email: string | null }>; committees?: Array<{ id: string; name: string }> } = {}) {
  const prisma = {
    governancePerson: { findMany: vi.fn(async () => opts.people ?? []) },
    committee: { findMany: vi.fn(async () => opts.committees ?? []) },
  }
  let seq = 0
  const people = {
    create: vi.fn(async (_s: string, dto: { name: string }) => ({ id: `p-${(seq += 1)}`, name: dto.name })),
    update: vi.fn(async () => ({})),
    addMember: vi.fn(async () => ({})),
  }
  const committees = { create: vi.fn(async (_s: string, dto: { name: string }) => ({ id: `c-${(seq += 1)}`, name: dto.name })) }
  const svc = new GovernanceImportService(prisma as never, people as never, committees as never)
  return { svc, prisma, people, committees }
}

describe('isoDateFromText', () => {
  it('reads the ways a term date is written', () => {
    expect(isoDateFromText('6/30/2027')).toBe('2027-06-30')
    expect(isoDateFromText('2027-06-30')).toBe('2027-06-30')
    expect(isoDateFromText('June 30, 2027')).toBe('2027-06-30')
    expect(isoDateFromText('2028')).toBe('2028-06-30')
    expect(isoDateFromText('')).toBeNull()
    expect(isoDateFromText('next year')).toBeUndefined()
  })
})

describe('people import', () => {
  const ROSTER = 'Member,Position,Term Expires,Email\nAnn Smith,Board Chair,6/30/2027,ann@x.org\nBo Diaz,Treasurer,2028,\nCy Fox,Trustee,soon,\n'

  it('preview: matches by email, then name; bad dates are skipped rows; nothing is written', async () => {
    const { svc, people } = make({ people: [{ id: 'e1', name: 'ann smith', email: null }, { id: 'e2', name: 'Someone', email: 'bo@x.org' }] })
    const p = await svc.previewPeople('s1', file(ROSTER), { defaultGroup: 'board' })
    expect(p.columns.map((c) => `${c.header}→${c.field}`)).toEqual(['Member→Name', 'Position→Title / role', 'Term Expires→Term end', 'Email→Email'])
    expect(p.rows.map((r) => [r.person.name, r.action, r.existingId])).toEqual([
      ['Ann Smith', 'update', 'e1'],
      ['Bo Diaz', 'new', null],
      ['Cy Fox', 'skipped', null],
    ])
    expect(p.rows[0]!.person).toMatchObject({ groups: ['board'], termEnd: '2027-06-30', email: 'ann@x.org' })
    expect(p.rows[1]!.person.groups).toEqual(['finance_team'])
    expect(p.rows[2]!.issues[0]).toMatch(/couldn’t read the term end “soon”/)
    expect(p.summary).toEqual({ new: 1, update: 1, skipped: 1 })
    expect(people.create).not.toHaveBeenCalled()
    expect(people.update).not.toHaveBeenCalled()
  })

  it('commit: updates the match with only what the file knows, creates the rest', async () => {
    const { svc, people } = make({ people: [{ id: 'e1', name: 'Ann Smith', email: null }] })
    const r = await svc.commitPeople(
      's1',
      [
        { name: 'Ann Smith', title: 'Board Chair', groups: ['board'], termEnd: '2027-06-30', email: null, bio: null },
        { name: 'Bo Diaz', groups: ['finance_team'] },
      ],
      'u1',
    )
    expect(r).toEqual({ created: 1, updated: 1, total: 2 })
    expect(people.update).toHaveBeenCalledWith('s1', 'e1', { name: 'Ann Smith', title: 'Board Chair', groups: ['board'], termEnd: '2027-06-30' }, 'u1')
    expect(people.create).toHaveBeenCalledWith('s1', { name: 'Bo Diaz', groups: ['finance_team'] }, 'u1')
  })

  it('refuses a file with no name column, naming what it saw', async () => {
    const { svc } = make()
    await expect(svc.previewPeople('s1', file('Position,Email\nChair,a@x.org\n'))).rejects.toThrow(BadRequestException)
    await expect(svc.previewPeople('s1', file('Position,Email\nChair,a@x.org\n'))).rejects.toThrow(/“Position”, “Email”/)
  })
})

describe('committees import', () => {
  const LIST = 'Committee,Member,Role\nFinance,Ann Smith,Chair\n,Bo Diaz,Member\nGovernance,Cy Fox,Vice Chair\n'

  it('preview: says which committees and people are new', async () => {
    const { svc } = make({ committees: [{ id: 'c1', name: 'Finance Committee' }, { id: 'c2', name: 'finance' }], people: [{ id: 'p1', name: 'Ann Smith', email: null }] })
    const p = await svc.previewCommittees('s1', file(LIST))
    expect(p.rows.map((r) => [r.committee, r.committeeAction, r.member, r.role, r.personAction])).toEqual([
      ['Finance', 'existing', 'Ann Smith', 'chair', 'existing'],
      ['Finance', 'existing', 'Bo Diaz', 'member', 'new'],
      ['Governance', 'new', 'Cy Fox', 'vice_chair', 'new'],
    ])
    expect(p.summary).toEqual({ committees: 2, newCommittees: 1, members: 3, newPeople: 2, skipped: 0 })
  })

  it('commit: creates the missing committee and people, adds memberships, counts repeats', async () => {
    const { svc, people, committees } = make({ committees: [{ id: 'c1', name: 'Finance' }], people: [{ id: 'p1', name: 'Ann Smith', email: null }] })
    people.addMember.mockImplementationOnce(async () => {
      throw new ConflictException('already')
    })
    const r = await svc.commitCommittees(
      's1',
      [
        { committee: 'Finance', member: 'Ann Smith', role: 'chair' },
        { committee: 'Finance', member: 'Bo Diaz', role: 'member' },
        { committee: 'Governance', kind: 'governance', member: 'Cy Fox', role: 'vice_chair' },
      ],
      'u1',
    )
    expect(r).toEqual({ committeesCreated: 1, peopleCreated: 2, membershipsAdded: 2, alreadyMembers: 1, total: 3 })
    expect(committees.create).toHaveBeenCalledWith('s1', { name: 'Governance', kind: 'governance', description: null }, 'u1')
    expect(people.create).toHaveBeenCalledWith('s1', { name: 'Bo Diaz', groups: ['board'], email: null }, 'u1')
    // ids follow the fake's call order: Bo → p-1, Governance → c-2, Cy → p-3
    expect(people.addMember).toHaveBeenLastCalledWith('s1', 'c-2', { personId: 'p-3', role: 'vice_chair' }, 'u1')
  })
})
