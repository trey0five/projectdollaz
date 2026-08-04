// ─────────────────────────────────────────────────────────────────────────────
// THE REVIEWED IMPORT PROMOTES TOO — the reported bug, on the other card.
//
// Both cards now say a roster import sets this period's enrollment. The one-step
// upload does it through RosterUploadService. The reviewed one goes straight to
// StudentsService.importCommit, which took an options object it was never given:
// `supersedeManual` defaulted false, so promote() hit the manual-entry guard and
// a head of school who had typed 430 in September imported 436 rows, saw "Roster
// imported — 436 added", and kept a stale 430 in every finance metric. That is
// the same shape as "Imported 436 students" with an empty Records screen.
//
// Asserted at the CONTROLLER, over a stubbed service, because the defect is
// exactly one argument at exactly one call site — a service-level test cannot see
// an argument the controller never passes. No @nestjs/testing (the house rule):
// the controller is a plain class, so it is constructed directly.
// ─────────────────────────────────────────────────────────────────────────────
import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import type { User } from '@finrep/db'
import { StudentsController } from './students.controller.js'
import type { StudentsService } from './students.service.js'

const USER = { id: 'u1', email: 'head@school.test' } as unknown as User
const SCHOOL = '2b0d1e6a-9c1e-4a35-9f2a-1f5c9a7d0001'

function makeController() {
  // Typed with a rest parameter so `mock.calls[0][4]` — the options argument the
  // whole fix lives in — is expressible without a cast.
  const importCommit = vi.fn(async (...__args: unknown[]) => ({
    created: 1,
    updated: 0,
    deleted: 0,
    total: 1,
  }))
  const controller = new StudentsController({ importCommit } as unknown as StudentsService)
  return { controller, importCommit }
}

describe('StudentsController.importCommit — parity with the one-step upload', () => {
  it('supersedes a hand-entered enrollment, the same as the upload card claims', async () => {
    const { controller, importCommit } = makeController()
    await controller.importCommit(
      SCHOOL,
      { mode: 'merge', rows: [{ firstName: 'Ada', lastName: 'Lovelace', grade: '3' }] } as never,
      USER,
    )
    // The 5th argument is the whole fix: without it the promote is refused and
    // the panel's "this period's enrollment follows the roster" is a false claim.
    expect(importCommit.mock.calls[0]![4]).toMatchObject({ supersedeManual: true })
  })

  it('does NOT supersede when the committed rows enroll nobody', async () => {
    // A commit of nothing but withdrawn rows recomputes a roster total of 0.
    // Overwriting someone's hand-entered 436 with a 0 is the failure the
    // supersede exists to avoid, pointing the other way.
    const { controller, importCommit } = makeController()
    await controller.importCommit(
      SCHOOL,
      {
        mode: 'merge',
        rows: [
          { firstName: 'Ada', lastName: 'Lovelace', grade: '3', status: 'withdrawn' },
          { firstName: 'Alan', lastName: 'Turing', grade: '5', status: 'graduated' },
        ],
      } as never,
      USER,
    )
    expect(importCommit.mock.calls[0]![4]).toMatchObject({ supersedeManual: false })
  })

  it('passes the mode and rows through untouched', async () => {
    const { controller, importCommit } = makeController()
    const rows = [{ firstName: 'Ada', lastName: 'Lovelace', grade: '3' }]
    await controller.importCommit(SCHOOL, { mode: 'replace', rows } as never, USER)
    expect(importCommit.mock.calls[0]!.slice(0, 4)).toEqual([USER, SCHOOL, 'replace', rows])
  })
})
