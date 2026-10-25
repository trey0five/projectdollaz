import { afterEach, describe, expect, it } from 'vitest'
import { clearPending, hasPending, stashPending, takePending } from './pendingUploads.js'

// #43 — the sorter → tile hand-off: files wait under a destination key for one
// take, and the stash never leaks between destinations.
describe('pendingUploads', () => {
  afterEach(() => clearPending())

  it('hands files to exactly one destination, once', () => {
    const a = { name: 'tb.xlsx' }
    const b = { name: 'budget.xlsx' }
    stashPending('tb-single', [a])
    stashPending('budget', [b])
    expect(hasPending('tb-single')).toBe(true)
    expect(hasPending('monthly')).toBe(false)
    expect(takePending('tb-single')).toEqual([a])
    expect(takePending('tb-single')).toEqual([]) // taken
    expect(hasPending('tb-single')).toBe(false)
    expect(takePending('budget')).toEqual([b])
  })

  it('appends to a destination and ignores empty stashes', () => {
    stashPending('tb-bulk', [{ name: 'fy24.xlsx' }])
    stashPending('tb-bulk', [{ name: 'fy25.xlsx' }])
    stashPending('tb-bulk', [])
    stashPending('tb-bulk', null)
    expect(takePending('tb-bulk').map((f) => f.name)).toEqual(['fy24.xlsx', 'fy25.xlsx'])
  })
})
