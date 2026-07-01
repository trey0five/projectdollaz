import { describe, expect, it } from 'vitest'
import {
  MAINTENANCE_DUE_SOON_DAYS,
  computeMaintenanceUrgency,
  summarizeBacklog,
  type MaintenanceBacklogInput,
} from '../src/maintenance-backlog.js'

// A fixed injected `now` so urgency banding is deterministic + timezone-independent.
const NOW = new Date('2026-07-01T12:00:00.000Z')

describe('maintenance urgency — bands (injected now)', () => {
  it('null targetDate → none, daysUntilTarget null', () => {
    const r = computeMaintenanceUrgency({ status: 'open', targetDate: null }, NOW)
    expect(r.urgency).toBe('none')
    expect(r.daysUntilTarget).toBeNull()
  })

  it('resolved item is NEVER urgent regardless of targetDate', () => {
    const r = computeMaintenanceUrgency({ status: 'resolved', targetDate: '2020-01-01' }, NOW)
    expect(r.urgency).toBe('none')
    expect(r.daysUntilTarget).toBeNull()
  })

  it('past targetDate → overdue (negative days)', () => {
    const r = computeMaintenanceUrgency({ status: 'open', targetDate: '2026-06-01' }, NOW)
    expect(r.urgency).toBe('overdue')
    expect(r.daysUntilTarget).toBe(-30)
  })

  it('exactly today → due-soon, 0 days', () => {
    const r = computeMaintenanceUrgency({ status: 'open', targetDate: '2026-07-01' }, NOW)
    expect(r.urgency).toBe('due-soon')
    expect(r.daysUntilTarget).toBe(0)
  })

  it('boundary: exactly MAINTENANCE_DUE_SOON_DAYS out → due-soon', () => {
    // 2026-07-01 + 60 days = 2026-08-30.
    const r = computeMaintenanceUrgency({ status: 'scheduled', targetDate: '2026-08-30' }, NOW)
    expect(r.daysUntilTarget).toBe(MAINTENANCE_DUE_SOON_DAYS)
    expect(r.urgency).toBe('due-soon')
  })

  it('one day past the window → on-track', () => {
    const r = computeMaintenanceUrgency({ status: 'open', targetDate: '2026-08-31' }, NOW)
    expect(r.daysUntilTarget).toBe(61)
    expect(r.urgency).toBe('on-track')
  })

  it('accepts a JS Date (@db.Date) for targetDate, UTC-read', () => {
    const r = computeMaintenanceUrgency(
      { status: 'in_progress', targetDate: new Date('2026-06-01T00:00:00.000Z') },
      NOW,
    )
    expect(r.urgency).toBe('overdue')
    expect(r.daysUntilTarget).toBe(-30)
  })

  it('deterministic: same (input, now) → same result', () => {
    const a = computeMaintenanceUrgency({ status: 'open', targetDate: '2026-09-01' }, NOW)
    const b = computeMaintenanceUrgency({ status: 'open', targetDate: '2026-09-01' }, NOW)
    expect(a).toEqual(b)
  })
})

function item(over: Partial<MaintenanceBacklogInput> = {}): MaintenanceBacklogInput {
  return {
    priority: over.priority ?? 'medium',
    status: over.status ?? 'open',
    estimatedCost: over.estimatedCost ?? null,
    urgency: over.urgency ?? 'none',
  }
}

describe('maintenance backlog — summary', () => {
  it('empty list → all zeros', () => {
    expect(summarizeBacklog([])).toEqual({
      total: 0,
      openCount: 0,
      highPriorityOpenCount: 0,
      criticalOpen: 0,
      overdueOpen: 0,
      backlogCost: 0,
    })
  })

  it('counts open (non-resolved) items; resolved excluded from every count', () => {
    const s = summarizeBacklog([
      item({ priority: 'critical', status: 'open', urgency: 'overdue', estimatedCost: 100 }),
      item({ priority: 'high', status: 'scheduled', urgency: 'due-soon', estimatedCost: 200 }),
      item({ priority: 'medium', status: 'in_progress', urgency: 'on-track', estimatedCost: 50 }),
      item({ priority: 'low', status: 'open', urgency: 'none', estimatedCost: 10 }),
      // Resolved items drop out of every count AND backlogCost.
      item({ priority: 'critical', status: 'resolved', urgency: 'none', estimatedCost: 9999 }),
    ])
    expect(s.total).toBe(5)
    expect(s.openCount).toBe(4)
    expect(s.highPriorityOpenCount).toBe(2) // critical + high
    expect(s.criticalOpen).toBe(1)
    expect(s.overdueOpen).toBe(1)
    expect(s.backlogCost).toBe(360) // 100 + 200 + 50 + 10 (resolved 9999 excluded)
  })

  it('null estimatedCost treated as 0', () => {
    const s = summarizeBacklog([
      item({ status: 'open', estimatedCost: null }),
      item({ status: 'open', estimatedCost: 500 }),
    ])
    expect(s.backlogCost).toBe(500)
  })

  it('backlogCost uses integer-cents accumulation (no float drift)', () => {
    const s = summarizeBacklog([
      item({ status: 'open', estimatedCost: 100.1 }),
      item({ status: 'open', estimatedCost: 200.2 }),
    ])
    expect(s.backlogCost).toBe(300.3)
  })
})
