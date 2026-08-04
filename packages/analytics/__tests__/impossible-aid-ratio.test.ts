import { describe, it, expect } from 'vitest'
import { pctStudentsOnAid, INCONSISTENT_AID_VS_ENROLLMENT } from '../src/metrics/pctStudentsOnAid.js'
import { explainUnusableInput } from '../src/format.js'
import type { PeriodOperational } from '../src/types.js'

// ─────────────────────────────────────────────────────────────────────────────
// A SCHOOL CANNOT HAVE MORE STUDENTS ON AID THAN IT HAS STUDENTS.
//
// Found on live data. `studentsOnAid` is typed by a human; `enrollment` can be
// replaced wholesale by a roster upload. 600 typed against an enrollment of 1200
// is a sensible 50%; a roster then set enrollment to 436, nothing moved the 600,
// and the dashboard rendered "138.0% of students on aid". The doc line on this
// metric has always said 0..1 and nothing enforced it.
//
// REFUSED, NOT CLAMPED — capping at 100% swaps an obviously-broken figure for a
// plausible-looking wrong one, and makes a school where every student genuinely
// is on aid indistinguishable from one with stale data.
// ─────────────────────────────────────────────────────────────────────────────

const op = (studentsOnAid: number | null, enrollment: number | null) =>
  ({ studentsOnAid, enrollment } as unknown as PeriodOperational)

const run = (o: PeriodOperational) =>
  pctStudentsOnAid.compute(null as never, null as never, o)

describe('pct_students_on_aid refuses an impossible pair', () => {
  it('the exact live case: 600 on aid against 436 enrolled', () => {
    const r = run(op(600, 436))
    expect(r.value, 'a 138% share was reported as fact').toBeNull()
    expect(r.available).toBe(false)
    expect(r.inputsMissing).toEqual([INCONSISTENT_AID_VS_ENROLLMENT])
  })

  it('does NOT clamp — 100% is not offered as a substitute', () => {
    expect(run(op(600, 436)).value).not.toBe(1)
  })

  it('exactly equal is legitimate: every student on aid is 100%', () => {
    const r = run(op(436, 436))
    expect(r.available).toBe(true)
    expect(r.value).toBe(1)
  })

  it('the ordinary case is untouched', () => {
    const r = run(op(600, 1200))
    expect(r.available).toBe(true)
    expect(r.value).toBe(0.5)
  })

  it('zero on aid stays a legitimate 0%, not a refusal', () => {
    const r = run(op(0, 436))
    expect(r.available).toBe(true)
    expect(r.value).toBe(0)
  })

  it('a genuinely MISSING input still reports the input name, not the new token', () => {
    expect(run(op(null, 436)).inputsMissing).toEqual(['studentsOnAid'])
    expect(run(op(600, null)).inputsMissing).toEqual(['enrollment'])
  })
})

describe('the refusal explains itself in words a head of school can act on', () => {
  it('the token resolves to a sentence, never printed raw', () => {
    const sentence = explainUnusableInput(INCONSISTENT_AID_VS_ENROLLMENT)
    expect(sentence).toBeTruthy()
    expect(sentence).toMatch(/more students/i)
    expect(sentence).toMatch(/aid/i)
    // It must say what to DO, not merely what is wrong.
    expect(sentence).toMatch(/update/i)
    // And it must not leak the token itself.
    expect(sentence).not.toContain('inconsistent:')
  })

  it('a plain missing-input name returns null, so callers keep "Needs: …"', () => {
    expect(explainUnusableInput('enrollment')).toBeNull()
    expect(explainUnusableInput('studentsOnAid')).toBeNull()
  })
})
