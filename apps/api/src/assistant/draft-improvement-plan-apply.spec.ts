import { describe, expect, it, vi } from 'vitest'
import type { User } from '@finrep/db'
import { AssistantService, type ProposedAction } from './assistant.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// MA-4 — AN ACTION THAT CREATED NOTHING MUST NOT OFFER AN UNDO.
//
// THE DEFECT, END TO END:
//   1. Owner drafts an improvement plan; initiative P is created with 5 milestones.
//   2. Over the following weeks the team ticks milestones and moves P to in_progress.
//   3. Owner asks Penny to draft a plan again. The card says, in so many words,
//      "This is THAT plan — confirming will not create a second one."
//   4. Owner confirms. applyDraftImprovementPlan hits the dedupe branch and returned
//      `createdId: P.id`.
//   5. applyAction computes `reversible = REVERSIBLE_KINDS.has(kind) && createdId != null`
//      → TRUE, and writes an audit row with targetId = P.id.
//   6. The receipt renders "Created your improvement plan" WITH an Undo.
//   7. The owner clicks Undo — reasonably, since nothing was created — and
//      undoAction calls removeInitiative(P.id), destroying the plan and every
//      recorded milestone.
//
// SEEN RED: restore `createdId: existing.id` in the dedupe branch — MA-4.1 reads
// "expected true to be false" on `reversible`, and MA-4.2 on targetId.
// ─────────────────────────────────────────────────────────────────────────────

const USER = { id: 'caller-1', email: 'caller@school.test' } as unknown as User

const ARITY = AssistantService.length
// Same positional-DI convention as create-initiative.spec.ts, whose own green pins
// this index: `improvement` sits three ahead of the end of the constructor list.
const IMPROVEMENT_ARG_INDEX = ARITY - 3

function makeService(existing: { id: string } | null) {
  const findFirst = vi.fn(async () => existing)
  const createInitiative = vi.fn(async () => ({ id: 'new-plan-1' }))
  const removeInitiative = vi.fn(async () => ({ id: 'new-plan-1' }))
  const args: unknown[] = new Array(ARITY).fill({} as never)
  args[0] = { improvementInitiative: { findFirst } }
  args[IMPROVEMENT_ARG_INDEX] = { createInitiative, removeInitiative }
  const svc = new (AssistantService as unknown as new (...a: unknown[]) => AssistantService)(...args)
  return { svc, findFirst, createInitiative, removeInitiative }
}

const ACTION: ProposedAction = {
  kind: 'draft_improvement_plan',
  periodId: '',
  summary: 'Improvement plan: 2 recommended steps.',
  payload: {
    title: 'Improvement plan: 2 recommended steps',
    steps: [{ label: 'Move COG-1.1 up one rubric level' }, { label: 'Attach evidence to COG-2.3' }],
  },
}

const apply = (svc: AssistantService) =>
  (
    svc as unknown as {
      applyAction: (
        s: string,
        u: User,
        a: ProposedAction,
      ) => Promise<{ targetId: string | null; reversible: boolean; summary: string }>
    }
  ).applyAction('school-1', USER, ACTION)

describe('MA-4 — the idempotent no-op is not reversible', () => {
  it('MA-4.1 a second confirm creates nothing and is NOT offered an undo', async () => {
    const { svc, createInitiative, removeInitiative } = makeService({ id: 'plan-the-team-has-been-working' })
    const res = await apply(svc)
    expect(createInitiative).not.toHaveBeenCalled()
    expect(removeInitiative).not.toHaveBeenCalled()
    expect(res.reversible).toBe(false)
    expect(res.summary).toMatch(/already drafted/i)
  })

  it('MA-4.2 the pre-existing plan id never becomes an undo TARGET', async () => {
    const { svc } = makeService({ id: 'plan-the-team-has-been-working' })
    const res = await apply(svc)
    // targetId is what undoAction feeds to removeInitiative. It must not be a row
    // this action did not create.
    expect(res.targetId).not.toBe('plan-the-team-has-been-working')
    expect(res.targetId).toBeNull()
  })

  it('MA-4.3 a REAL create is still reversible, so the fix did not disarm the undo', async () => {
    const { svc, createInitiative } = makeService(null)
    const res = await apply(svc)
    expect(createInitiative).toHaveBeenCalledTimes(1)
    expect(res.targetId).toBe('new-plan-1')
    expect(res.reversible).toBe(true)
  })

  it('MA-4.4 a plan with no steps is refused at apply time, not created empty', async () => {
    const { svc, createInitiative } = makeService(null)
    await expect(
      (
        svc as unknown as {
          applyAction: (s: string, u: User, a: ProposedAction) => Promise<unknown>
        }
      ).applyAction('school-1', USER, { ...ACTION, payload: { steps: [] } }),
    ).rejects.toThrow(/no steps/i)
    expect(createInitiative).not.toHaveBeenCalled()
  })
})
