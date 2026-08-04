/* global process */
// `process` is declared explicitly rather than disabling no-undef: apps/web's
// eslint config is browser-scoped, and this spec reads two of its subjects off
// disk in the node-side vitest context (the house pattern from
// components/wizard/wizard-finish.spec.jsx).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
// ONE UPLOAD, TWO OUTCOMES — AND THE PANEL MUST NAME BOTH, TRUTHFULLY.
//
// Production report: a head of school uploaded a 436-student OneRoster CSV, was
// told "Imported 436 students", and found the Records screen empty. The count
// had landed; not one student row had. The first fix made the panel say so and
// pointed at a second importer — honest, and still the wrong product: the file
// they uploaded IS the roster.
//
// Now one upload creates the records AND promotes the headcount, so the panel
// has two independent facts to report and three mutually exclusive things that
// can happen to the enrollment number (superseded a hand-entered figure /
// promoted / left alone because an SIS owns it). Every way of getting this wrong
// is a sentence that sounds like success while something silently did not
// happen — which is precisely the bug that was reported.
//
// So this suite asserts what the user SEES, by mounting the component against a
// mocked api module (the visit-page-adopt.spec.jsx pattern), not by grepping for
// strings that a refactor would carry along unchanged. The source-text block at
// the end covers only what a mount cannot reach: the chooser-card copy, and the
// permanent absence of the two now-false sentences.
// ─────────────────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  revertManual: vi.fn(),
  importPreview: vi.fn(),
  importCommit: vi.fn(),
}))

vi.mock('../../lib/api.js', () => ({
  enrollmentApi: {
    upload: (...a) => mocks.upload(...a),
    revertManual: (...a) => mocks.revertManual(...a),
    students: {
      importPreview: (...a) => mocks.importPreview(...a),
      importCommit: (...a) => mocks.importCommit(...a),
    },
  },
  apiErrorMessage: (_e, fallback) => fallback,
}))

const { default: RosterUpload } = await import('./RosterUpload.jsx')
const { default: StudentImport } = await import('./StudentImport.jsx')
const { summarizeRosterUpload } = await import('./rosterUploadSummary.js')

afterEach(cleanup)

/** A server response in the §4 shape. Override any leaf per case. */
const RESULT = (over = {}) => ({
  snapshot: { observedOn: '2026-06-15', totalEnrolled: 436, byGrade: { K: 40, 1: 36 } },
  promoted: true,
  warnings: [],
  records: { created: 436, updated: 0, deleted: 0, total: 436 },
  recordsNote: null,
  // The June file, uploaded in August: the period WRITTEN is FY2026, which is not
  // the period on the user's screen. The server names it; the panel must too.
  enrollment: { value: 436, source: 'roster', fiscalPeriodId: 'fp-1', periodLabel: 'FY2026' },
  ...over,
})

/** Drive the real component through a real upload. Returns the sent FormData. */
async function doUpload(result, opts = {}) {
  mocks.upload.mockResolvedValueOnce({ data: result })
  const view = render(
    <MemoryRouter>
      <RosterUpload schoolId="school-1" canEdit onApplied={() => {}} />
    </MemoryRouter>,
  )
  const input = view.container.querySelector('input[type="file"]')
  fireEvent.change(input, {
    target: { files: [new File(['sourcedId,givenName\n'], 'roster.csv', { type: 'text/csv' })] },
  })
  if (opts.beforeConfirm) await opts.beforeConfirm(view)
  fireEvent.click(await screen.findByRole('button', { name: /confirm . apply roster/i }))
  await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1))
  const form = mocks.upload.mock.calls[0][1]
  return { view, form, text: () => view.container.textContent }
}

describe('RosterUpload — the panel reports records and enrollment SEPARATELY', () => {
  it('acceptance 1: N records created AND this period’s enrollment set to N', async () => {
    const { view } = await doUpload(RESULT())
    await waitFor(() => expect(view.container.textContent).toMatch(/436/))
    const text = view.container.textContent
    // Two distinct facts. Conflating them into one sentence is the original bug.
    expect(text, 'the records fact is missing').toMatch(/436 added/)
    // NAMED, not "this period": the year written is the year the file describes.
    expect(text, 'the enrollment fact is missing').toMatch(/Enrollment for FY2026 is now 436/)
  })

  it('reports the number STORED, not the number the file happened to contain', async () => {
    // Merge into a school that already had students: the file said 500, the
    // roster (and therefore period enrollment) is 436. §4 — snapshot is the
    // file's own aggregate; enrollment.value is what was written.
    const { view } = await doUpload(
      RESULT({
        snapshot: { observedOn: '2026-06-15', totalEnrolled: 500, byGrade: { K: 40 } },
        records: { created: 60, updated: 440, deleted: 0, total: 436 },
        enrollment: { value: 436, source: 'roster', fiscalPeriodId: 'fp-1', periodLabel: 'FY2026' },
      }),
    )
    await waitFor(() => expect(view.container.textContent).toMatch(/is now 436/))
    const sentence = screen.getByText(/Enrollment for FY2026 is now/).textContent
    expect(sentence).toMatch(/436/)
    expect(sentence, 'the panel is quoting the file total as the stored enrollment').not.toMatch(
      /500/,
    )
  })

  it('acceptance 4: a counts-only file claims NO records — and no count of them', async () => {
    const { view } = await doUpload(
      RESULT({
        records: null,
        recordsNote: 'It carried totals only — a headcount by grade, with no per-student rows to save.',
      }),
    )
    await waitFor(() => expect(view.container.textContent).toMatch(/is now 436/))
    const text = view.container.textContent
    expect(text).toMatch(/Nothing was added to Records from this file/i)
    // The failure mode being pinned: any sentence that credits this upload with
    // creating or updating student rows when the server created none.
    expect(text).not.toMatch(/\d[\d,]* (added|updated|removed)/)
    expect(text).not.toMatch(/on the roster now/)
  })

  it('promoted:false renders the LEFT-ALONE branch, never a bare success', async () => {
    const { view } = await doUpload(
      RESULT({ promoted: false, superseded: false, enrollment: null }),
    )
    await waitFor(() => expect(view.container.textContent).toMatch(/left as it is/i))
    const text = view.container.textContent
    expect(text).toMatch(/Enrollment for this period was left as it is/i)
    expect(text, 'claims a promote that did not happen').not.toMatch(/is now 436/)
    // DEVIATION FROM THE BUILD CONTRACT, DELIBERATE. It said this branch means
    // "an SIS connection owns this number". EnrollmentService.promote() has one
    // refusal — the manual-entry guard — and this endpoint now passes
    // supersedeManual, so that cause is not merely unlikely, it does not exist.
    // Printing it would be an invented explanation for a state the response
    // cannot diagnose: the same class of error as "Imported 436 students".
    expect(text, 'the panel invents a cause it cannot know').not.toMatch(
      /student information system/i,
    )
    // What it must do instead: say the file is safe, and say where to look.
    expect(text).toMatch(/Enrollment overview/i)
    expect(text).toMatch(/nothing is lost/i)
  })

  it('acceptance 3: re-uploading the same file reads as "nothing new", not "0 added"', async () => {
    // THE PAYLOAD A RE-UPLOAD ACTUALLY PRODUCES. importCommit counts a matched row
    // as `updated` whether or not a field moved, so the same file twice returns
    // {created:0, updated:436} — never the all-zero record this guard used to be
    // hand-fed, which is why it passed while the panel printed "0 added, 436
    // updated". A guard that only holds on a state the server cannot emit is not
    // a guard.
    const { view } = await doUpload(
      RESULT({ records: { created: 0, updated: 436, deleted: 0, total: 436 } }),
    )
    await waitFor(() => expect(view.container.textContent).toMatch(/Nothing new/))
    expect(view.container.textContent).toMatch(
      /Nothing new — every row matched one of the 436 students already on the roster/,
    )
    expect(view.container.textContent, '"0 added" reads as a failed import').not.toMatch(/0 added/)
  })

  it('a file that counted nobody says so, and never claims a number', async () => {
    // The server refuses to promote a zero (it is a confident wrong answer, not a
    // gap) and sends the cause. The panel must print the cause, not its own guess.
    const { view } = await doUpload(
      RESULT({
        promoted: false,
        superseded: false,
        enrollment: null,
        records: null,
        recordsNote: 'None of the 12 rows in this file could be saved as a student record — the notes below say why.',
        reason:
          'No students in this file were counted as enrolled, so this period’s enrollment was left exactly as it was. The file and its grade breakdown were saved.',
        warnings: ['Unrecognized grade code(s) not counted in the headcount: US, MS.'],
      }),
    )
    await waitFor(() => expect(view.container.textContent).toMatch(/left as it is/i))
    const text = view.container.textContent
    expect(text).toMatch(/No students in this file were counted as enrolled/i)
    expect(text, 'a refused promote must not print a headcount').not.toMatch(/is now 0/)
    // …and the RECORDS box explains itself from the server's note rather than
    // pointing at whatever warning happens to exist.
    expect(text).toMatch(/None of the 12 rows in this file could be saved/)
    expect(text, 'the generic pointer is a guess').not.toMatch(/The notes below say why\./)
  })

  it('a counts-only file with an unrelated warning still gets the TRUE explanation', async () => {
    // The regression: this sentence was gated on warnings.length === 0, so the
    // one accurate line became unreachable exactly when any other note existed.
    const { view } = await doUpload(
      RESULT({
        records: null,
        recordsNote: 'It carried totals only — a headcount by grade, with no per-student rows to save.',
        warnings: ['Unrecognized grade code(s) not counted in the headcount: 99.'],
      }),
    )
    await waitFor(() => expect(view.container.textContent).toMatch(/Nothing was added to Records/))
    const text = view.container.textContent
    expect(text).toMatch(/It carried totals only/)
    expect(text, 'sends the user hunting for a cause that is not in the notes').not.toMatch(
      /The notes below say why\./,
    )
  })

  it('decision 2: a superseded manual figure names BOTH numbers and offers the undo', async () => {
    const { view } = await doUpload(
      RESULT({ superseded: true, supersededManual: 430 }),
    )
    await waitFor(() => expect(view.container.textContent).toMatch(/Replaced your entered/i))
    expect(view.container.textContent).toMatch(
      /Replaced your entered enrollment of 430 with 436 from this file/i,
    )
    // Overwriting someone's own number is only legitimate because it is
    // reversible from the same panel that did it.
    mocks.revertManual.mockResolvedValueOnce({ data: {} })
    fireEvent.click(screen.getByRole('button', { name: /restore my number/i }))
    await waitFor(() => expect(mocks.revertManual).toHaveBeenCalledTimes(1))
    expect(mocks.revertManual.mock.calls[0][0]).toBe('school-1')
    expect(mocks.revertManual.mock.calls[0][1]).toEqual({ periodId: 'fp-1' })
    await waitFor(() => expect(view.container.textContent).toMatch(/restored/i))

    // AND THE LEAD LINE IS REPLACED, not appended to. Leaving "Replaced your
    // entered enrollment of 430 with 436" (semibold navy) above "Restored" prints
    // two sentences that cannot both be true, with the false one on top.
    const after = view.container.textContent
    expect(after, 'the superseded sentence survived the undo').not.toMatch(
      /Replaced your entered enrollment/i,
    )
    expect(after).toMatch(/Your entered enrollment of 430 is back in force/i)
  })

  it('does not offer the undo when nothing was superseded', async () => {
    const { view } = await doUpload(RESULT())
    await waitFor(() => expect(view.container.textContent).toMatch(/is now 436/))
    expect(screen.queryByRole('button', { name: /restore my number/i })).toBeNull()
  })

  it('sends the import mode with the file (merge by default, replace when chosen)', async () => {
    const merge = await doUpload(RESULT())
    expect(merge.form.get('mode')).toBe('merge')
    cleanup()
    mocks.upload.mockClear()
    const replace = await doUpload(RESULT(), {
      beforeConfirm: async () => {
        fireEvent.click(await screen.findByRole('radio', { name: /replace/i }))
      },
    })
    expect(replace.form.get('mode')).toBe('replace')
  })

  it('still surfaces server warnings (the row-ceiling notice arrives this way)', async () => {
    const { view } = await doUpload(
      RESULT({
        records: null,
        warnings: [
          'This file has 3000 students, above the 2000-row import ceiling — enrollment was counted but records were not created.',
        ],
      }),
    )
    await waitFor(() => expect(view.container.textContent).toMatch(/import ceiling/))
    expect(view.container.textContent).toMatch(/Enrollment for FY2026 is now 436/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// THE REVIEWED IMPORTER — the same two facts, or the same bug on the other card.
// ─────────────────────────────────────────────────────────────────────────────

/** Drive StudentImport through preview → commit and return the mounted view. */
async function doReviewedImport(commitResult) {
  mocks.importPreview.mockResolvedValueOnce({
    data: {
      shape: 'oneroster',
      summary: { new: 1, update: 0, unchanged: 0, skipped: 0 },
      warnings: [],
      rows: [
        {
          action: 'new',
          existingId: null,
          issues: [],
          student: { firstName: 'Ada', lastName: 'Lovelace', grade: '3' },
        },
      ],
    },
  })
  mocks.importCommit.mockResolvedValueOnce({ data: commitResult })
  const view = render(
    <MemoryRouter>
      <StudentImport schoolId="school-1" canEdit onApplied={() => {}} />
    </MemoryRouter>,
  )
  const input = view.container.querySelector('input[type="file"]')
  fireEvent.change(input, {
    target: { files: [new File(['firstName,lastName,grade\n'], 'users.csv', { type: 'text/csv' })] },
  })
  fireEvent.click(await screen.findByRole('button', { name: /preview import/i }))
  fireEvent.click(await screen.findByRole('button', { name: /import 1 student/i }))
  await waitFor(() => expect(mocks.importCommit).toHaveBeenCalledTimes(1))
  return view
}

describe('StudentImport — the reviewed path reports the enrollment too', () => {
  it('says what happened to the number, not only what happened to the records', async () => {
    // The bug on this card: "Roster imported — 436 added" and NOTHING about the
    // period's enrollment, which had silently not moved.
    const view = await doReviewedImport({
      created: 436,
      updated: 0,
      deleted: 0,
      total: 436,
      promote: { totalEnrolled: 436, promoted: true, superseded: false, supersededManual: null, fiscalPeriodId: 'fp-1' },
    })
    await waitFor(() => expect(view.container.textContent).toMatch(/436 added/))
    const text = view.container.textContent
    expect(text, 'the enrollment fact is missing').toMatch(/enrollment is now 436/i)
  })

  it('offers the same undo when it supersedes a hand-entered figure', async () => {
    const view = await doReviewedImport({
      created: 436,
      updated: 0,
      deleted: 0,
      total: 436,
      promote: { totalEnrolled: 436, promoted: true, superseded: true, supersededManual: 430, fiscalPeriodId: 'fp-1' },
    })
    await waitFor(() => expect(view.container.textContent).toMatch(/Replaced your entered/i))
    mocks.revertManual.mockResolvedValueOnce({ data: {} })
    fireEvent.click(screen.getByRole('button', { name: /restore my number/i }))
    await waitFor(() => expect(mocks.revertManual).toHaveBeenCalledTimes(1))
    expect(mocks.revertManual.mock.calls[0][1]).toEqual({ periodId: 'fp-1' })
  })

  it('never claims a promote the server did not report (SIS-connected school)', async () => {
    // syncRosterSnapshot returns null in SIS mode, so `promote` is absent.
    const view = await doReviewedImport({ created: 3, updated: 0, deleted: 0, total: 3 })
    await waitFor(() => expect(view.container.textContent).toMatch(/3 added/))
    const text = view.container.textContent
    expect(text).toMatch(/left as it is/i)
    expect(text).not.toMatch(/enrollment is now/i)
  })
})

describe('summarizeRosterUpload — the branch decision, in one pure place', () => {
  it('never invents an enrollment value the server did not send', () => {
    // promoted:true with no enrollment object should not be possible per §4, but
    // if it ever is, the honest reading is "we cannot say what was stored".
    const s = summarizeRosterUpload({ promoted: true, enrollment: null, records: null })
    expect(s.enrollment.branch).toBe('unchanged')
    expect(s.enrollment.value).toBeNull()
    expect(s.enrollment.line).not.toMatch(/\d/)
  })

  it('a null records payload produces no count in the records line', () => {
    const s = summarizeRosterUpload(RESULT({ records: null }))
    expect(s.records).toBeNull()
    expect(s.recordsLine).not.toMatch(/\d/)
  })

  it('supersede beats promote; promote beats left-alone', () => {
    expect(summarizeRosterUpload(RESULT({ superseded: true, supersededManual: 430 })).enrollment.branch).toBe('superseded')
    expect(summarizeRosterUpload(RESULT()).enrollment.branch).toBe('promoted')
    expect(summarizeRosterUpload(RESULT({ promoted: false, enrollment: null })).enrollment.branch).toBe('unchanged')
    // superseded:true with nothing stored cannot claim a replacement.
    expect(
      summarizeRosterUpload(RESULT({ superseded: true, supersededManual: 430, promoted: false, enrollment: null }))
        .enrollment.branch,
    ).toBe('unchanged')
  })

  it('the restore affordance exists only with a period to restore into', () => {
    expect(summarizeRosterUpload(RESULT({ superseded: true, supersededManual: 430 })).enrollment.restorePeriodId).toBe('fp-1')
    expect(
      summarizeRosterUpload(
        RESULT({
          superseded: true,
          supersededManual: 430,
          enrollment: { value: 436, source: 'roster', fiscalPeriodId: null },
        }),
      ).enrollment.restorePeriodId,
    ).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE TEXT — the two things a mount cannot see.
// Resolved from the package root, not import.meta.url: this suite runs under
// jsdom, where import.meta.url is an http URL and fileURLToPath rejects it.
// ─────────────────────────────────────────────────────────────────────────────
const at = (rel) => resolve(process.cwd(), rel)
const CONFIGS = readFileSync(at('src/components/wizard/wizardConfigs.jsx'), 'utf8')
const PANEL = readFileSync(at('src/components/enrollment/RosterUpload.jsx'), 'utf8')
const SUMMARY = readFileSync(at('src/components/enrollment/rosterUploadSummary.js'), 'utf8')

/** The `enrollment:` block of wizardConfigs, up to the next module key. */
function enrollmentBlock() {
  const start = CONFIGS.indexOf('  enrollment: {')
  expect(start, 'the enrollment wizard config was renamed').toBeGreaterThan(-1)
  const end = CONFIGS.indexOf('\n  governance: {', start)
  expect(end, 'governance no longer follows enrollment — fix this slice').toBeGreaterThan(start)
  return CONFIGS.slice(start, end)
}

describe('the two Choose cards describe what actually happens', () => {
  it('neither card still promises that records are NOT created', () => {
    // Both cards create records now. This sentence shipped as a fix and is now
    // false; false-but-reassuring copy is how the reported bug was survivable.
    expect(enrollmentBlock()).not.toMatch(/no student records/i)
  })

  it('the one-step card leads with the roster file, not with "counts"', () => {
    const block = enrollmentBlock()
    expect(block).toMatch(/label: 'Upload a roster file'/)
    // Each card must still lead with what SURVIVES it — the confusion that
    // caused the report was two cards that read identically.
    const roster = block.slice(block.indexOf("key: 'roster'"))
    expect(roster).toMatch(/student record for every row/i)
    expect(roster).toMatch(/enrollment count/i)
  })

  it('the reviewed card names its review step — that is the only real difference now', () => {
    const block = enrollmentBlock()
    const reviewed = block.slice(block.indexOf("key: 'import-students'"))
    expect(reviewed).toMatch(/label: 'Import students with a review step'/)
    expect(reviewed.slice(0, reviewed.indexOf("key: 'roster'"))).toMatch(/preview/i)
  })

  it('neither card defines itself by the OTHER card', () => {
    // The reviewed card renders ABOVE the one-step upload, so "Same import, one
    // extra step" pointed forward at a card the reader had not seen — restoring,
    // at the moment of choosing, exactly the ambiguity that caused the report.
    const block = enrollmentBlock()
    const reviewed = block.slice(
      block.indexOf("key: 'import-students'"),
      block.indexOf("key: 'roster'"),
    )
    expect(reviewed, 'the blurb forward-references the card below it').not.toMatch(/Same import/)
    expect(reviewed, 'the blurb must stand on its own').toMatch(/Same roster file/)
  })

  it('both cards state the 2,000-student-per-file limit they are subject to', () => {
    // Above the ceiling the one-step upload creates no records and the reviewed
    // one 400s on a class-validator ArrayMaxSize after a full preview. Promising
    // "a student record for every row" without the limit is a promise the product
    // cannot keep for a 2,400-student school.
    const block = enrollmentBlock()
    const reviewed = block.slice(
      block.indexOf("key: 'import-students'"),
      block.indexOf("key: 'roster'"),
    )
    const roster = block.slice(block.indexOf("key: 'roster'"))
    expect(reviewed).toMatch(/2,000 students per file/)
    expect(roster).toMatch(/2,000 students per file/)
  })

  it('the panel no longer disowns the records it now creates', () => {
    for (const src of [PANEL, SUMMARY]) {
      expect(src).not.toMatch(/This did not create student records/)
      expect(src).not.toMatch(/no student records/i)
    }
    expect(PANEL, 'the undo must be wired to the real endpoint').toMatch(
      /enrollmentApi\.revertManual\(/,
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// "DID THIS CHANGE MY NUMBERS?" — THE QUESTION BEHIND THE REPORT.
//
// Found by uploading the reporter's own 436-student roster against real data: the
// as-of date defaults to TODAY and the fiscal year runs Jul-Jun, so an August
// upload is filed under the NEXT year — which routinely has no ledger. Their
// students landed in FY 2027 while every finance metric sat in FY 2026, still
// computing from a hand-entered 1200. Cost per pupil reads $8,683 against 1200
// and $23,899 against 436.
//
// THIS GUARD HAS BEEN INERT TWICE, so the assertions below check the whole chain,
// not just the JSX: (1) comparing against the wizard's period label did nothing
// because that screen resolves no period; (2) the summary helper did not pass the
// server flag through, leaving it undefined. Each link is asserted separately.
// ─────────────────────────────────────────────────────────────────────────────
describe('RosterUpload — "no finance metric changed" is stated, never silent', () => {
  const src = readFileSync(at('src/components/enrollment/RosterUpload.jsx'), 'utf8')
  const helper = readFileSync(at('src/components/enrollment/rosterUploadSummary.js'), 'utf8')

  it('LINK 1 — the summary helper forwards the server flag', () => {
    expect(helper, 'periodHasFinancials never reaches the panel — the guard is dead').toMatch(
      /periodHasFinancials:/,
    )
    // Only an explicit `false` may trigger the warning, so an older server that
    // omits the field cannot start alarming every upload.
    expect(helper).toMatch(/periodHasFinancials\s*!==\s*false/)
  })

  it('LINK 2 — the panel keys on an explicit false, not a truthy check', () => {
    expect(src).toMatch(/summary\.enrollment\.periodHasFinancials === false/)
  })

  it('names the metrics that did NOT move, and how to fix it', () => {
    expect(src).toMatch(/cost\s*\n?\s*per pupil/i)
    expect(src).toMatch(/as-of date/i)
  })

  it('does not silently retarget the period — no client-side date rewriting', () => {
    expect(src).not.toMatch(/setObservedOn\([^)]*fiscal/i)
  })
})
