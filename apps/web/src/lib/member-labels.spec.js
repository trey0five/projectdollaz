// ─────────────────────────────────────────────────────────────────────────────
// THE PICKERS NAME PEOPLE, NOT MAILBOXES. The defect these pin was invisible to
// every existing test because the fixtures were written in the casing the code
// read (camelCase) rather than the casing the SERVER SENDS (snake_case, via
// toUserPublic) — so a helper that could never match a real roster row passed a
// suite that agreed with it. Every fixture below is a verbatim roster shape.
// ─────────────────────────────────────────────────────────────────────────────
/* global process */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { memberFullName, memberName, memberLabel, memberTitle } from './memberLabels.js'

const read = (rel) => readFileSync(resolve(process.cwd(), 'src', rel), 'utf8')

// What GET /schools/:id/members actually returns for one member.
const ROSTER_ROW = {
  id: 'u1',
  email: 'jo@x.edu',
  first_name: 'Jo',
  last_name: 'Ruiz',
  role: 'accountant',
  status: 'active',
  title: 'Business Manager',
}

// What an included Prisma relation returns (task.assignee, initiative.owner).
const RELATION_ROW = { id: 'u1', email: 'jo@x.edu', firstName: 'Jo', lastName: 'Ruiz' }

describe('a roster row reads as a person', () => {
  it('snake_case — the casing the members endpoint emits — yields the NAME', () => {
    expect(memberFullName(ROSTER_ROW)).toBe('Jo Ruiz')
    expect(memberName(ROSTER_ROW)).toBe('Jo Ruiz')
    expect(memberName(ROSTER_ROW)).not.toBe(ROSTER_ROW.email)
  })

  it('camelCase relation rows keep working — both shapes are legitimate', () => {
    expect(memberName(RELATION_ROW)).toBe('Jo Ruiz')
  })

  it('the label carries the position when the member has one', () => {
    expect(memberLabel(ROSTER_ROW)).toBe('Jo Ruiz — Business Manager')
    expect(memberTitle(ROSTER_ROW)).toBe('Business Manager')
  })

  it('no position → the name alone, never a dangling dash', () => {
    const { title: _t, ...untitled } = ROSTER_ROW
    expect(memberLabel(untitled)).toBe('Jo Ruiz')
    expect(memberLabel({ ...ROSTER_ROW, title: '   ' })).toBe('Jo Ruiz')
  })

  it('email is the fallback, not the default — and only when there is no name', () => {
    expect(memberName({ id: 'u2', email: 'x@y.edu' })).toBe('x@y.edu')
    expect(memberName({ id: 'u3' })).toBe('Member')
    expect(memberName({ id: 'u3' }, '—')).toBe('—')
  })

  it('a half-named account still reads as that half', () => {
    expect(memberName({ first_name: 'Jo', email: 'jo@x.edu' })).toBe('Jo')
    expect(memberName({ last_name: 'Ruiz', email: 'jo@x.edu' })).toBe('Ruiz')
  })
})

describe('every member-facing picker uses the ONE helper', () => {
  // Source-pinned because the alternative is mounting four wizards. What matters
  // is that no file re-derives the label locally: that is exactly how three of
  // them drifted to camelCase-only and stayed broken.
  const CONSUMERS = [
    'components/improvement/improvementFlow.jsx',
    'components/strategy/StrategyForms.jsx',
    'components/accreditation/visit/PlanConfirmCard.jsx',
    'pages/TasksPage.jsx',
  ]

  it('each imports memberLabel/memberName from lib/memberLabels', () => {
    for (const rel of CONSUMERS) {
      expect(read(rel), rel).toMatch(/from '[./]*lib\/memberLabels\.js'/)
    }
  })

  it('none of them still builds a roster label from camelCase alone', () => {
    // The exact broken expression: [m.firstName, m.lastName] with no snake
    // sibling anywhere in the same file's helper.
    for (const rel of CONSUMERS) {
      const src = read(rel)
      const local = src.match(/function member(?:Label|Name)\s*\(/)
      expect(local, `${rel} still defines its own member label helper`).toBeNull()
    }
  })
})
