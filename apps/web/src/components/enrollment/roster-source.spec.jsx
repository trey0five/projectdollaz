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

describe('receipts are GROUPED by school year, not a wall of duplicate cards', () => {
  // Five seed years of near-identical filenames used to print as one undifferentiated
  // stack, newest-first with the years shuffled together. The grouping rules:
  it('groups on the SERVER-computed schoolYear (client derivation is fallback only)', () => {
    expect(card).toMatch(/imp\.schoolYear \?\? fallbackSchoolYear\(imp\.observedOn \?\? imp\.createdAt\)/)
  })

  it('newest year first; the LATEST import is the year’s row, the rest are history', () => {
    expect(card).toMatch(/\.sort\(\(a, b\) => b\[0\] - a\[0\]\)/)
    expect(card).toMatch(/latest: sorted\[0\], earlier: sorted\.slice\(1\)/)
  })

  it('earlier imports sit behind an expandable toggle and render dimmed as superseded', () => {
    expect(card).toMatch(/earlier import/)
    expect(card).toMatch(/aria-expanded=\{expanded\}/)
    expect(card).toMatch(/superseded/)
  })

  it('year headers use the shared school-year vocabulary (2025–26), not a bare number', () => {
    expect(card).toMatch(/schoolYearLabel\(year\)/)
  })
})

describe('the original file: retained, downloadable by import-capable roles only', () => {
  it('the download action requires BOTH canEdit and a retained doc id — no fake links', () => {
    // Pre-retention receipts have originalDocumentId: null and must render with
    // no download affordance; a viewer must see none at all (FERPA — the FILE
    // carries student names even though the receipt does not).
    expect(card).toMatch(/canEdit && imp\.originalDocumentId \?/)
  })

  it('the endpoint points at the enrollment-scoped original-url route', () => {
    expect(api).toMatch(
      /importOriginalUrl: \(schoolId, importId\) =>\s*api\.get\(`\/schools\/\$\{schoolId\}\/enrollment\/imports\/\$\{importId\}\/original-url`\)/,
    )
  })

  it('opens the presigned URL rather than proxying bytes through the app', () => {
    expect(card).toMatch(/window\.open\(url, '_blank', 'noopener,noreferrer'\)/)
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
