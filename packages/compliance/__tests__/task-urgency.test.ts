import { describe, it, expect } from 'vitest'
import {
  computeTaskUrgency,
  TASK_DUE_SOON_DAYS,
  type TaskUrgencyInput,
} from '../src/task-urgency.js'

// A fixed injected `now` so every assertion is deterministic.
const NOW = new Date('2026-07-01T12:00:00.000Z')

function input(over: Partial<TaskUrgencyInput>): TaskUrgencyInput {
  return { status: 'open', dueDate: null, ...over }
}

describe('computeTaskUrgency', () => {
  it('overdue: due yesterday → negative daysUntilDue', () => {
    const r = computeTaskUrgency(input({ dueDate: '2026-06-30' }), NOW)
    expect(r.urgency).toBe('overdue')
    expect(r.daysUntilDue).toBe(-1)
  })

  it('due-soon: due today → days 0', () => {
    const r = computeTaskUrgency(input({ dueDate: '2026-07-01' }), NOW)
    expect(r.urgency).toBe('due-soon')
    expect(r.daysUntilDue).toBe(0)
  })

  it('due-soon: exactly at the 7-day boundary', () => {
    const r = computeTaskUrgency(input({ dueDate: '2026-07-08' }), NOW)
    expect(r.daysUntilDue).toBe(TASK_DUE_SOON_DAYS)
    expect(r.urgency).toBe('due-soon')
  })

  it('on-track: one day past the boundary', () => {
    const r = computeTaskUrgency(input({ dueDate: '2026-07-09' }), NOW)
    expect(r.daysUntilDue).toBe(8)
    expect(r.urgency).toBe('on-track')
  })

  it('in_progress behaves like open (has a live clock)', () => {
    const r = computeTaskUrgency(input({ status: 'in_progress', dueDate: '2026-06-01' }), NOW)
    expect(r.urgency).toBe('overdue')
    expect(r.daysUntilDue).toBe(-30)
  })

  it('done → none regardless of an overdue dueDate', () => {
    const r = computeTaskUrgency(input({ status: 'done', dueDate: '2020-01-01' }), NOW)
    expect(r).toEqual({ urgency: 'none', daysUntilDue: null })
  })

  it('cancelled → none regardless of dueDate', () => {
    const r = computeTaskUrgency(input({ status: 'cancelled', dueDate: '2020-01-01' }), NOW)
    expect(r).toEqual({ urgency: 'none', daysUntilDue: null })
  })

  it('null dueDate → none (honest no-due-date, never overdue)', () => {
    const r = computeTaskUrgency(input({ dueDate: null }), NOW)
    expect(r).toEqual({ urgency: 'none', daysUntilDue: null })
  })

  it('unparseable dueDate → none', () => {
    const r = computeTaskUrgency(input({ dueDate: 'not-a-date' }), NOW)
    expect(r).toEqual({ urgency: 'none', daysUntilDue: null })
  })

  it('accepts a JS Date (Prisma @db.Date) identically to a yyyy-mm-dd string', () => {
    const asDate = computeTaskUrgency(
      input({ dueDate: new Date('2026-06-25T00:00:00.000Z') }),
      NOW,
    )
    const asString = computeTaskUrgency(input({ dueDate: '2026-06-25' }), NOW)
    expect(asDate).toEqual(asString)
    expect(asDate.urgency).toBe('overdue')
    expect(asDate.daysUntilDue).toBe(-6)
  })

  it('a custom dueSoonDays widens/narrows the info band deterministically', () => {
    const p = input({ dueDate: '2026-07-20' })
    expect(computeTaskUrgency(p, NOW).urgency).toBe('on-track') // 19d > 7
    expect(computeTaskUrgency(p, NOW, 30).urgency).toBe('due-soon') // 19d <= 30
  })

  it('tz determinism: same yyyy-mm-dd inputs give the same result at 00:01Z vs 23:59Z', () => {
    const early = new Date('2026-07-01T00:01:00.000Z')
    const late = new Date('2026-07-01T23:59:00.000Z')
    const p = input({ dueDate: '2026-06-30' })
    const a = computeTaskUrgency(p, early)
    const b = computeTaskUrgency(p, late)
    expect(a).toEqual(b)
    expect(a.daysUntilDue).toBe(-1)
  })
})
