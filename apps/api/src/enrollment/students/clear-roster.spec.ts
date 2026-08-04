// ─────────────────────────────────────────────────────────────────────────────
// CLEARING A ROSTER. Reported as "not seeing a way to edit, delete or make any
// changes to a roster that was created from a file or from a connected source".
//
// Per-student edit and delete already existed (row → slide-over → PATCH/DELETE).
// What did not exist was a REGISTER-level delete: the only way to get rid of an
// imported roster was to upload a replacement file in `replace` mode, so the
// deleteMany was reachable only as a side effect of a different import. Nobody
// thinks to try that, which is why the feature read as missing.
//
// The three properties worth guarding are the ones that make a destructive,
// undoable-by-nobody action safe to ship.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const read = (rel: string): string => readFileSync(HERE + rel, 'utf8')

const service = read('students.service.ts')
const controller = read('students.controller.ts')
const dto = read('students.dto.ts')

const clearBody = service.slice(
  service.indexOf('async clear('),
  service.indexOf('/** All-or-nothing batch create'),
)

describe('clear() refuses to delete a roster it was not describing', () => {
  it('compares the live count against the caller’s expectedCount', () => {
    expect(clearBody).toMatch(/const actual = await this\.prisma\.student\.count/)
    expect(clearBody).toMatch(/if \(actual !== expectedCount\)/)
  })

  it('throws a CONFLICT naming both numbers, and deletes nothing', () => {
    expect(clearBody).toMatch(/throw new ConflictException/)
    expect(clearBody).toMatch(/Nothing was deleted/)
    // The refusal must come BEFORE the delete, or the guard is decoration.
    expect(clearBody.indexOf('ConflictException')).toBeLessThan(clearBody.indexOf('deleteMany'))
  })

  it('expectedCount is REQUIRED — an optional agreement is not an agreement', () => {
    const block = dto.slice(dto.indexOf('export class ClearRosterDto'), dto.indexOf('export class PromoteSnapshotDto'))
    expect(block).toMatch(/@IsInt\(\)/)
    expect(block).toMatch(/@Min\(0\)/)
    expect(block).toMatch(/expectedCount!: number/)
    expect(block).not.toMatch(/@IsOptional/)
  })
})

describe('clear() is scoped, audited and honest about what survives', () => {
  it('deletes only this school’s students', () => {
    expect(clearBody).toMatch(/deleteMany\(\{ where: \{ schoolId \} \}\)/)
  })

  it('audits with COUNTS, never a name', () => {
    expect(clearBody).toMatch(/action: 'enrollment\.roster\.cleared'/)
    expect(clearBody).toMatch(/metadata: \{ deleted: count \}/)
    for (const banned of ['firstName', 'lastName', 'birthDate']) {
      expect(clearBody, banned).not.toMatch(new RegExp(banned))
    }
  })

  it('leaves the enrollment SNAPSHOT alone', () => {
    // Clearing the register does not unlearn the headcount the school imported —
    // the rollup falls back to the snapshot. Deleting it here would silently
    // destroy the school's enrollment history as a side effect of tidying a list.
    expect(clearBody).not.toMatch(/enrollmentSnapshot/)
    expect(clearBody).toMatch(/syncRosterSnapshot/)
  })
})

describe('the route is reachable and correctly ordered', () => {
  it('is owner/accountant only', () => {
    const block = controller.slice(controller.indexOf('@Delete()'), controller.indexOf('@Get(\':id\')'))
    expect(block).toMatch(/@Roles\('owner', 'accountant'\)/)
    expect(block).not.toMatch(/'viewer'/)
  })

  it('@Delete() is declared BEFORE @Delete(\':id\') — Nest matches in order', () => {
    // Matched at the START of a line so the doc comment ABOVE the route — which
    // names `@Delete(':id')` while explaining the ordering — is not mistaken for
    // the decorator itself. It sits earlier in the file, so the un-anchored
    // version failed on a correctly-ordered controller.
    const bare = controller.search(/^ {2}@Delete\(\)$/m)
    const byId = controller.search(/^ {2}@Delete\(':id'\)$/m)
    expect(bare).toBeGreaterThan(-1)
    expect(byId).toBeGreaterThan(-1)
    expect(bare).toBeLessThan(byId)
  })
})
