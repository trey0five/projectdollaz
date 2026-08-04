/* global process */
// `process` is declared explicitly rather than disabling no-undef: apps/web's
// eslint config is browser-scoped, and this spec reads its subject off disk in
// the node-side vitest context (same pattern as wizard-finish.spec.jsx).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
// THE EMPTY STATE IS THE SETUP.
//
// A brand-new school's Finance overview used to say "Add your trial balance in
// the Data hub" and link to /data — which under ui.v2 is a redirect straight
// back to /finance?tab=add. A circle, through a page that no longer exists.
// The fix mounts the REAL trial-balance uploader (TrialBalanceModalBody, the
// same embed the Add-data wizard uses) inline in the zero-period branch, so the
// user drops a file on the first screen they see.
//
// Source-reading (house pattern, wizard-finish.spec.jsx): what must not rot is
// textual — the zero-period branch mounts the uploader and never points at the
// ghost hub. Proven RED before the fix: the branch contained "Data hub" and
// to="/data" and no TrialBalanceModalBody (all three assertions failed).
// ─────────────────────────────────────────────────────────────────────────────

const at = (rel) => resolve(process.cwd(), rel)
// Comments are stripped (the build strips them too) so only SHIPPED code and
// rendered copy can trip the ghost assertions — a comment explaining why a
// helper exists is not a link. Whitespace is collapsed for the same reason
// no-ghost-hub.spec.js does it: Prettier wraps JSX copy at will.
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')
const SRC = stripComments(readFileSync(at('src/pages/FinancePage.jsx'), 'utf8'))

/** The first-run overview branch. Anchored on the `else if` so the period-select
 *  effect's similar predicate (which also reads savedPeriods.length === 0) can
 *  never be matched instead. */
const BRANCH_HEAD = 'else if (savedPeriods.length === 0 || firstRunLatched) {'
function emptyBranch() {
  const start = SRC.indexOf(BRANCH_HEAD)
  expect(start, 'first-run overview branch not found — was it restructured?').toBeGreaterThan(-1)
  const end = SRC.indexOf('} else {', start)
  expect(end, 'first-run branch has no closing `} else {`').toBeGreaterThan(start)
  return SRC.slice(start, end)
}

describe('FinancePage — the zero-period overview IS the trial-balance setup', () => {
  it('mounts the real uploader embed inline (no navigating to a chooser)', () => {
    expect(
      emptyBranch(),
      'zero-period branch no longer mounts TrialBalanceModalBody — first-run regressed to a link-out',
    ).toMatch(/TrialBalanceModalBody/)
  })

  it('never links to /data — the v2 redirect strips query strings (dead-link class)', () => {
    // Delimiter class matches no-ghost-hub.spec.js: the query-carrying form
    // ('/data?add=…') is the DANGEROUS one, and a closing-quote-only regex is
    // blind to exactly it.
    expect(emptyBranch()).not.toMatch(/['"`]\/data(['"`?#&])/)
  })

  it('never mentions the retired Data hub', () => {
    expect(emptyBranch().replace(/\s+/g, ' ')).not.toMatch(/data hub/i)
  })

  it('the whole page is ghost-free: no "Data hub" phrase anywhere in FinancePage', () => {
    // Broader than the branch on purpose: the budget-nudge copy on the full
    // overview also said "Set up your budget in the Data hub".
    expect(SRC.replace(/\s+/g, ' ')).not.toMatch(/data hub/i)
  })

  it('viewer lens gets a quiet explainer, not upload chrome it cannot use', () => {
    expect(
      emptyBranch(),
      'zero-period branch must gate the uploader on canEdit for viewer/board lenses',
    ).toMatch(/canEdit/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// THE UPLOADER MUST NOT DELETE ITSELF MID-TASK.
//
// The embed's own 3-slot intake invites "last year's trial balance" and "last
// year's audited numbers" AFTER the first file lands. When the branch was
// derived live off `savedPeriods.length === 0`, the first saved snapshot flipped
// that predicate ~2 SECONDS into the upload, unmounted the whole column, and
// took slots 2 and 3 with it — while the user was still reading the instructions
// that offered them. Measured on a genuinely fresh school during review.
//
// So the branch is LATCHED once first run renders and is left DELIBERATELY, via
// a reveal CTA that only exists once there is an overview to reveal. The latch
// is keyed by school id so a swap to a school that already has data cannot
// inherit it.
//
// Proven RED against the pre-fix source: the branch head was
// `else if (savedPeriods.length === 0) {` with no latch state and no reveal
// control (every assertion below failed, including the anchor).
// ─────────────────────────────────────────────────────────────────────────────
describe('FinancePage — first run is latched, not yanked away by its own success', () => {
  it('the branch is held by a latch, not by the live period count alone', () => {
    expect(
      SRC,
      'first-run branch is derived live off savedPeriods again — the first saved snapshot will unmount the in-flight 3-slot intake',
    ).toContain(BRANCH_HEAD)
  })

  it('the latch is real state, set only after loading resolves', () => {
    expect(SRC).toMatch(/const \[firstRunSchoolId, setFirstRunSchoolId\] = useState\(null\)/)
    // Latching during the initial load would show first run to schools that
    // simply have not hydrated their periods yet.
    expect(SRC).toMatch(/if \(overviewLoading\) return/)
  })

  it('the latch is keyed by school — a swap cannot inherit the previous latch', () => {
    expect(
      SRC,
      'latch must be compared against the ACTIVE school id, or swapping to a school with data keeps showing first run',
    ).toMatch(/firstRunSchoolId != null && firstRunSchoolId === schoolId/)
    expect(SRC).toMatch(/setFirstRunSchoolId\(\(cur\) => \(cur === schoolId \? cur : null\)\)/)
  })

  it('a reveal CTA — and ONLY the reveal CTA — clears the latch', () => {
    const branch = emptyBranch()
    expect(branch, 'no reveal control in the first-run branch').toMatch(
      /onClick=\{\(\) => setFirstRunSchoolId\(null\)\}/,
    )
    // …and it is gated on there actually being something to reveal.
    expect(branch).toMatch(/const ready = savedPeriods\.length > 0/)
    expect(branch).toMatch(/\{ready \?/)
  })

  it('the uploader itself is NOT gated on `ready` — it stays mounted after the first file', () => {
    const branch = emptyBranch()
    const embedAt = branch.indexOf('<TrialBalanceModalBody')
    expect(embedAt).toBeGreaterThan(-1)
    // The embed sits under the canEdit gate only. If a `ready`/savedPeriods
    // condition ever wraps it, slots 2 and 3 disappear again.
    const wrapper = branch.slice(branch.lastIndexOf('{canEdit ?', embedAt), embedAt)
    expect(
      wrapper,
      'the trial-balance embed became conditional on the first snapshot — that is the self-destruct bug returning',
    ).not.toMatch(/ready|savedPeriods/)
  })
})
