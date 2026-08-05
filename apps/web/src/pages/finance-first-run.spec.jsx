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

  it('the uploader is never gated on the DATA — only on a deliberate fold', () => {
    // THE ORIGINAL BUG, restated for the new shape. The embed used to be gated
    // on nothing but canEdit, and this assertion forbade `ready`/savedPeriods
    // appearing in that wrapper — because deriving it from the data made the
    // intake delete itself the instant the first snapshot landed, taking slots
    // 2 and 3 away mid-task.
    //
    // The screen now DOES fold the intake away once the user is finished with
    // it, so the letter of that rule had to change. The substance did not: the
    // only thing permitted to hide the uploader is `condensed`, a latch set at
    // one place — the confirm band's "yes" — which cannot fire before a save
    // exists. A data-derived condition here is still the self-destruct bug.
    const branch = emptyBranch()
    const embedAt = branch.indexOf('<TrialBalanceModalBody')
    expect(embedAt).toBeGreaterThan(-1)
    // The wrapper's CONDITION only — from `{canEdit` to its `?`. Slicing all the
    // way to the embed would sweep up the card's own chrome, where `ready`
    // legitimately decides whether to offer the collapse control.
    const gateStart = branch.lastIndexOf('{canEdit', embedAt)
    const condition = branch.slice(gateStart, branch.indexOf('?', gateStart))
    expect(
      condition,
      'the trial-balance embed became conditional on the first snapshot — that is the self-destruct bug returning',
    ).not.toMatch(/\bready\b|savedPeriods|hydratedFiles/)
    // …and what DOES gate it is the deliberate fold, nothing else.
    expect(condition.replace(/\s+/g, ' ').trim()).toBe('{canEdit && !condensed')
  })

  it('`condensed` is set ONLY by the confirm band, never by a save', () => {
    // If saving alone folded the intake, the confirm band — which lives INSIDE
    // the embed — would vanish before the user could answer it, and the reveal
    // could never be reached.
    expect(SRC).toMatch(/const \[condensedSchoolId, setCondensedSchoolId\] = useState\(null\)/)
    expect(SRC).toMatch(/condensedSchoolId != null && condensedSchoolId === schoolId/)
    const setters = SRC.match(/setCondensedSchoolId\(schoolId\)/g) ?? []
    expect(
      setters.length,
      'condensed must be set in exactly two places: the confirm handler and the explicit collapse control',
    ).toBe(2)
    // The confirm handler is one of them, beside the reveal it opens.
    expect(SRC).toMatch(/setRevealSchoolId\(schoolId\)\s*\n\s*setCondensedSchoolId\(schoolId\)/)
  })

  it('the folded state still shows what was uploaded, and the way back in', () => {
    const branch = emptyBranch()
    expect(
      branch,
      'the uploads receipt must render whenever there is a saved period — folding the intake must never fold away the record of what is in it',
    ).toContain('<UploadsSummary')
    // Its doors reopen the intake IN PLACE. A link-out here would be the ghost
    // hub returning by another name (the /data and "data hub" bans still apply
    // to this whole branch, asserted above).
    expect(SRC).toMatch(/const expandIntake = useCallback/)
    expect(SRC).toMatch(/setCondensedSchoolId\(null\)/)
    expect(branch).toMatch(/onExpand=\{expandIntake\}/)
  })

  it('the future-tense promise tiles are gone once the data is real', () => {
    // Five cards promising what WILL light up, printed under a screen where it
    // already has, is the page arguing with itself. The past-tense version is
    // the reveal, which counts real rows.
    const branch = emptyBranch()
    const tilesAt = branch.indexOf('FIRST_RUN_LIGHTS.map')
    expect(tilesAt).toBeGreaterThan(-1)
    expect(
      branch.slice(0, tilesAt),
      'the What-lights-up tiles are no longer gated on the empty state',
    ).toMatch(/\{ready \? null : \(/)
  })

  it('"keep adding files" lands somewhere with files, from EITHER screen', () => {
    // The reveal opens BECAUSE the user confirmed, and confirming is what folds
    // the uploader away — so its own "keep adding files" button would otherwise
    // dismiss onto a screen with no files in sight, one beat after asking for
    // exactly that.
    //
    // And it is reachable from the overview now, where the first-run screen no
    // longer exists: expandIntake drives first-run-only state, so from there the
    // equivalent is the Add-data tab. One button, two homes, both real.
    expect(SRC).toMatch(/expandIntake\('single'\)/)
    const handler = SRC.slice(SRC.indexOf('onKeepAdding='), SRC.indexOf('onKeepAdding=') + 400)
    expect(handler).toMatch(/firstRunLatched/)
    expect(handler).toMatch(/addDataHref/)
  })

  it('the celebration stays reachable after the fold', () => {
    // The reveal + its button are the one part of this screen the user asked to
    // keep. Folding the apparatus must not fold away the replay.
    const branch = emptyBranch()
    expect(branch).toMatch(/onClick=\{\(\) => setRevealSchoolId\(schoolId\)\}/)
    expect(branch).toContain('What lit up')
  })
})
