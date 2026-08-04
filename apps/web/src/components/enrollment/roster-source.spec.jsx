/* global process */
// ─────────────────────────────────────────────────────────────────────────────
// "I added a roster but the student roster is still blank" — and, from the same
// report, "there isn't anywhere to see the current file used for the roster."
//
// THE MISTAKE THIS FILE EXISTS TO PREVENT is one I already made once. The first
// pass at roster management shipped a Clear-roster button and a row-click hint,
// both gated on `total > 0` — so in the ONE state the person reporting the
// problem was actually in (a headcount over an empty register), the product
// changed in no visible way at all. Affordances that appear only after the
// problem is solved are not affordances.
//
// So the property being pinned is coverage of the EMPTY state, not the presence
// of a component.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (rel) => readFileSync(resolve(process.cwd(), 'src', rel), 'utf8')
const card = read('components/enrollment/RosterSourceCard.jsx')
const page = read('pages/EnrollmentPage.jsx')
// Copy this long gets Prettier-wrapped across several string literals joined by
// ` + `, so a regex over raw source cannot span it. Collapse the concatenation
// and the whitespace first — the same trap the ghost-hub guard hit, where a
// single-space regex was blind to a sentence broken across two lines.
const flatten = (src) => src.replace(/'\s*\+\s*'/g, '').replace(/\s+/g, ' ')
const register = flatten(read('components/enrollment/StudentRegister.jsx'))
const api = read('lib/api.js')

describe('the counted-but-empty diagnosis', () => {
  it('fires on headcount > 0 with an empty register', () => {
    expect(card).toMatch(
      /const countedButEmpty = \(headcount \?\? 0\) > 0 && \(rosterCount \?\? 0\) === 0/,
    )
  })

  it('does NOT require import receipts to exist', () => {
    // Every school that uploaded before receipts existed has a headcount, no
    // receipt, and needs this message most. Gating it on history would hide it
    // from exactly those schools — the same "invisible at zero" mistake again.
    expect(card).toMatch(/if \(!countedButEmpty && \(imports == null \|\| imports\.length === 0\)\) return null/)
  })

  it('names the count and carries the fix', () => {
    expect(card).toMatch(/You have a headcount, but no student records\./)
    expect(card).toMatch(/headcount\.toLocaleString\('en-US'\)/)
    expect(card).toMatch(/Upload it again/)
  })

  it('the page feeds it BOTH numbers — the headcount and the register count', () => {
    // The diagnosis is a comparison; a card given only one side cannot make it.
    expect(page).toMatch(/headcount=\{summary\?\.latest\?\.totalEnrolled \?\? null\}/)
    expect(page).toMatch(/rosterCount=\{rosterCount\}/)
    expect(page).toMatch(/enrollmentApi\.students\.aggregate\(activeId\)/)
  })

  it('a failed register read degrades to no diagnosis, never an error', () => {
    expect(page).toMatch(/setRosterCount\(null\)/)
  })
})

describe('the receipts answer "which file made these numbers"', () => {
  it('shows the file name, when, what it counted and what it wrote', () => {
    expect(card).toMatch(/\{imp\.fileName \?\?/)
    expect(card).toMatch(/counted/)
    expect(card).toMatch(/student record\$\{wrote === 1 \? '' : 's'\} written/)
  })

  it('renders the SERVER’s note when nothing was written, not a guess', () => {
    expect(card).toMatch(/\{wrote === 0 && imp\.recordsNote \?/)
  })

  it('is explicit that removing an entry does not delete students', () => {
    // "Delete import" read as "delete the students" is how a school loses a
    // roster while tidying a list.
    expect(card).toMatch(/never deletes students/)
    expect(card).toMatch(/Your students are not deleted\./)
  })

  it('both endpoints exist and point at the school-scoped routes', () => {
    expect(api).toMatch(/listImports: \(schoolId\) => api\.get\(`\/schools\/\$\{schoolId\}\/enrollment\/imports`\)/)
    expect(api).toMatch(/removeImport: \(schoolId, importId\) =>/)
  })
})

describe('the register empty state explains the gap', () => {
  it('says a headcount does not create student records', () => {
    // The old copy — "Add students from the Add data tab" — was true and useless
    // to someone staring at 436 enrolled one tab away.
    expect(register).toMatch(/A headcount on the .*Enrollment overview does not/)
    expect(register).toMatch(/upload that file again from the Add data tab/)
  })
})
