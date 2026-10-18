/* global process */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
// Privacy review round 6: the register (names beside ISP / 504 / ELL flags) is
// owner/accountant on the API (students.controller.spec.ts pins the roles). The
// Records tab must not mount it for a viewer — it would only draw a 403 — and
// must say where a viewer's roster view is instead.
// ─────────────────────────────────────────────────────────────────────────────
const page = readFileSync(resolve(process.cwd(), 'src', 'pages/EnrollmentPage.jsx'), 'utf8')

describe('Enrollment Records tab — the register is not a viewer door', () => {
  it('mounts StudentRegister only for owners and business managers', () => {
    expect(page).toMatch(/const canEdit = activeSchool\?\.role === 'owner' \|\| activeSchool\?\.role === 'accountant'/)
    expect(page).toMatch(/registerTable=\{\s*canEdit \? \(\s*<StudentRegister/)
    expect(page).toMatch(/\) : \(\s*<RosterRestricted \/>/)
  })

  it('tells a viewer the counts are theirs and the names are not', () => {
    expect(page).toMatch(/visible to owners and business managers only/)
    expect(page).toMatch(/counts on the Overview and Analytics tabs are open to everyone/)
  })
})
