// ─────────────────────────────────────────────────────────────────────────────
// A MEMBER HAS A POSITION, AND IT IS NOT THEIR ROLE. The product knew only
// owner/accountant/viewer — access, not job — so every owner picker in the app
// listed colleagues by email address. These drive the service directly with a
// mocked Prisma and pin the two things that make the field trustworthy: the
// roster actually EMITS it (the pickers read the roster, nothing else), and
// setting a title can never reach `role`.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SchoolsService } from './schools.service.js'

const HERE = fileURLToPath(new URL('.', import.meta.url))

const USER = {
  id: 'u1',
  email: 'jo@x.edu',
  firstName: 'Jo',
  lastName: 'Ruiz',
  emailVerified: true,
  totpEnabled: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
}
const ACTOR = { id: 'owner-1' } as never

function harness(membership: Record<string, unknown> | null) {
  const updates: Record<string, unknown>[] = []
  const audits: Record<string, unknown>[] = []
  const prisma = {
    school: {
      findUnique: vi.fn(async () => ({ id: 's1', organizationId: 'o1' })),
      findMany: vi.fn(async () => [{ id: 's1' }]),
    },
    membership: {
      findUnique: vi.fn(async () => membership),
      findMany: vi.fn(async () => [
        { userId: 'u1', schoolId: 's1', role: 'accountant', status: 'active', title: 'Business Manager', user: USER },
      ]),
      groupBy: vi.fn(async () => []),
      update: vi.fn(async (args: Record<string, unknown>) => {
        updates.push(args)
        return { ...(membership ?? {}), ...(args.data as object), user: USER }
      }),
    },
  }
  const audit = { write: vi.fn(async (e: Record<string, unknown>) => void audits.push(e)) }
  const svc = new SchoolsService(
    prisma as never,
    { sendInvitationEmail: vi.fn() } as never,
    audit as never,
    { establishTrial: vi.fn() } as never,
    {} as never,
  )
  return { svc, prisma, updates, audits }
}

describe('the roster carries the position', () => {
  it('listMembers emits `title` — the ONE read every owner picker is fed by', async () => {
    const h = harness(null)
    const rows = await h.svc.listMembers('s1')
    expect(rows[0]).toMatchObject({ id: 'u1', title: 'Business Manager' })
    // …alongside the name, in the casing toUserPublic has always used.
    expect(rows[0]).toMatchObject({ first_name: 'Jo', last_name: 'Ruiz' })
  })

  it('a member with no position emits null, not the empty string', async () => {
    const h = harness(null)
    h.prisma.membership.findMany = vi.fn(async () => [
      { userId: 'u1', schoolId: 's1', role: 'viewer', status: 'active', title: null, user: USER },
    ]) as never
    const rows = await h.svc.listMembers('s1')
    expect(rows[0].title).toBeNull()
  })
})

describe('setting a position touches the position and nothing else', () => {
  const EXISTING = { id: 'm1', userId: 'u1', schoolId: 's1', role: 'accountant', status: 'active', title: null, user: USER }

  it('writes the trimmed title and audits it', async () => {
    const h = harness(EXISTING)
    const out = await h.svc.changeMemberTitle(ACTOR, 's1', 'u1', '  Business Manager  ')
    expect(h.updates[0].data).toEqual({ title: 'Business Manager' })
    expect(out).toMatchObject({ title: 'Business Manager', role: 'accountant' })
    expect(h.audits[0]).toMatchObject({ action: 'member.title_changed' })
  })

  it('NEVER writes role — renaming someone cannot change what they can see', async () => {
    const h = harness(EXISTING)
    await h.svc.changeMemberTitle(ACTOR, 's1', 'u1', 'Head of School')
    expect(Object.keys(h.updates[0].data as object)).toEqual(['title'])
  })

  it('an empty position CLEARS it — null, never a blank string', async () => {
    const h = harness({ ...EXISTING, title: 'Business Manager' })
    await h.svc.changeMemberTitle(ACTOR, 's1', 'u1', '   ')
    expect(h.updates[0].data).toEqual({ title: null })
  })

  it('an unchanged position is a no-op: no write, no audit line', async () => {
    const h = harness({ ...EXISTING, title: 'Business Manager' })
    const out = await h.svc.changeMemberTitle(ACTOR, 's1', 'u1', 'Business Manager')
    expect(h.updates).toHaveLength(0)
    expect(h.audits).toHaveLength(0)
    expect(out).toMatchObject({ title: 'Business Manager' })
  })

  it('404s for a non-member rather than minting a membership', async () => {
    const h = harness(null)
    await expect(h.svc.changeMemberTitle(ACTOR, 's1', 'nope', 'CFO')).rejects.toThrow()
  })
})

describe('the position is owner-gated and lives on its own route', () => {
  const controller = readFileSync(HERE + 'schools.controller.ts', 'utf8')

  it('PATCH …/members/:userId/title is @Roles(\'owner\')', () => {
    const block = controller.slice(controller.indexOf("members/:userId/title"))
    expect(block.slice(0, 200)).toMatch(/@Roles\('owner'\)/)
  })

  it('it is a SEPARATE route from the role PATCH — not a field on it', () => {
    // One request must not be able to carry both "call them the Business
    // Manager" and "make them an owner".
    expect(readFileSync(HERE + 'dto/update-member-role.dto.ts', 'utf8')).not.toMatch(/title/)
  })
})

describe('a colleague can be named the way people name them', () => {
  interface RosterRow {
    userId: string
    title: string | null
    user: { firstName: string | null; lastName: string | null }
  }
  const ROSTER: RosterRow[] = [
    { userId: 'u1', title: 'Business Manager', user: { firstName: 'Jo', lastName: 'Ruiz' } },
    { userId: 'u2', title: 'Head of School', user: { firstName: 'Sam', lastName: 'Lee' } },
  ]
  function refHarness(rows: RosterRow[] = ROSTER) {
    const h = harness(null)
    h.prisma.membership.findMany = vi.fn(async () => rows) as never
    return h.svc
  }

  it('matches a POSITION, article and all — "the business manager" is how people talk', async () => {
    const svc = refHarness()
    expect(await svc.resolveMemberRef('s1', 'the business manager')).toEqual({ kind: 'one', userId: 'u1' })
    expect(await svc.resolveMemberRef('s1', 'Business Manager')).toEqual({ kind: 'one', userId: 'u1' })
    // …and an engine-suggested role, which arrives underscored.
    expect(await svc.resolveMemberRef('s1', 'business_manager')).toEqual({ kind: 'one', userId: 'u1' })
  })

  it('matches a full name, and a first or last name on its own', async () => {
    const svc = refHarness()
    expect(await svc.resolveMemberRef('s1', 'Sam Lee')).toEqual({ kind: 'one', userId: 'u2' })
    expect(await svc.resolveMemberRef('s1', 'jo')).toEqual({ kind: 'one', userId: 'u1' })
  })

  it('an EXACT full name beats a different person sharing a first name', async () => {
    const svc = refHarness([
      ...ROSTER,
      { userId: 'u3', title: null, user: { firstName: 'Sam', lastName: 'Okafor' } },
    ])
    expect(await svc.resolveMemberRef('s1', 'Sam Lee')).toEqual({ kind: 'one', userId: 'u2' })
    // …but a bare "Sam" is genuinely ambiguous, and is REFUSED rather than picked.
    expect(await svc.resolveMemberRef('s1', 'Sam')).toEqual({ kind: 'many' })
  })

  it('two people sharing a position is a question, not a coin flip', async () => {
    const svc = refHarness([
      { userId: 'u1', title: 'Business Manager', user: { firstName: 'Jo', lastName: 'Ruiz' } },
      { userId: 'u2', title: 'Business Manager', user: { firstName: 'Sam', lastName: 'Lee' } },
    ])
    expect(await svc.resolveMemberRef('s1', 'business manager')).toEqual({ kind: 'many' })
  })

  it('no match is `none` — never a nearest guess', async () => {
    const svc = refHarness()
    expect(await svc.resolveMemberRef('s1', 'the athletic director')).toEqual({ kind: 'none' })
    expect(await svc.resolveMemberRef('s1', '   ')).toEqual({ kind: 'none' })
  })
})

describe('an invited position survives redemption', () => {
  it('the accept path copies invitation.title onto the new membership', () => {
    const svc = readFileSync(HERE + 'schools.service.ts', 'utf8')
    const accept = svc.slice(svc.indexOf('async acceptInvitation'), svc.indexOf('// ── Member management'))
    expect(accept).toMatch(/title: invitation\.title \?\? null/)
    // …but never OVER a title the school has since corrected in Settings.
    expect(accept).toMatch(/\.\.\.\(invitation\.title \? \{ title: invitation\.title \} : \{\}\)/)
  })
})
