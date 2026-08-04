/* global process */
// ─────────────────────────────────────────────────────────────────────────────
// The browser half of "there is no way to delete a roster".
//
// Deleting a school's whole student register is the most destructive thing a
// non-owner-level action does in this product, and it has no undo. These pin the
// three properties that make it safe to put a button on: it is not offered to
// people who cannot use it, it cannot be fired by a stray click, and it sends the
// count it showed so the server can refuse a roster that changed underneath.
//
// Source-reading, in the house pattern (wizard-finish.spec.jsx): the component
// needs a school context, an axios client and a filter bar to render, and a test
// that heavy gets skipped rather than kept honest.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (rel) => readFileSync(resolve(process.cwd(), 'src', rel), 'utf8')
const register = read('components/enrollment/StudentRegister.jsx')
const api = read('lib/api.js')
const connect = read('components/enrollment/EnrollmentConnectCard.jsx')

describe('the clear-roster control', () => {
  it('is offered only to editors, and only when there is something to clear', () => {
    expect(register).toMatch(/\{canEdit && total > 0 \? \(/)
  })

  it('requires the word DELETE typed out — no single-click destruction', () => {
    expect(register).toMatch(/typed\.trim\(\)\.toUpperCase\(\) === 'DELETE'/)
    expect(register).toMatch(/disabled=\{!armed \|\| busy\}/)
  })

  it('says what SURVIVES, so the next screen does not look broken', () => {
    // Clearing the register leaves the enrollment snapshot alone, so "Total
    // enrolled" keeps its number over an empty list. Unsaid, that reads as a bug.
    expect(register).toMatch(/headcount stays/)
  })

  it('sends the count it displayed, so a changed roster is refused', () => {
    expect(register).toMatch(/enrollmentApi\.students\.clear\(schoolId, total\)/)
    expect(api).toMatch(/clear: \(schoolId, expectedCount\) =>/)
    expect(api).toMatch(/api\.delete\(`\/schools\/\$\{schoolId\}\/enrollment\/students`, \{ data: \{ expectedCount \} \}\)/)
  })

  it('shows the server’s 409 verbatim rather than a generic failure', () => {
    // The conflict message names both counts; flattening it to "could not delete"
    // would throw away the only explanation the user gets.
    expect(register).toMatch(/setClearError\(apiErrorMessage\(e\)\)/)
  })
})

describe('row-level edit and delete are discoverable', () => {
  it('the register says the rows are clickable', () => {
    // Edit and delete always existed one row-click away, and nothing said so —
    // which is what "there is no way to change a roster" felt like from outside.
    expect(register).toMatch(/Click a student to view, edit or delete them\./)
  })
})

describe('a sync reports records, not just a headcount', () => {
  it('names what was written to the register', () => {
    // The old message said "Synced 436 students" while the register stayed empty
    // and nothing ever mentioned that no record had been created.
    expect(connect).toMatch(/const rec = body\?\.records/)
    expect(connect).toMatch(/student record\$\{rec\.created === 1 \? '' : 's'\} added/)
  })

  it('falls back to the server’s reason when no records were created', () => {
    expect(connect).toMatch(/body\?\.recordsNote/)
  })
})
