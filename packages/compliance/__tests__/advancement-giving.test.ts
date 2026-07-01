import { describe, expect, it } from 'vitest'
import {
  ADVANCEMENT_CLOSING_SOON_DAYS,
  BEHIND_GOAL_THRESHOLD,
  computeCampaignProgress,
  summarizeGiving,
  type GivingSummaryInput,
} from '../src/advancement-giving.js'

// A fixed injected `now` so urgency banding is deterministic + timezone-independent.
const NOW = new Date('2026-07-01T12:00:00.000Z')

describe('campaign progress — money (div-by-zero guard)', () => {
  it('goal null → pctOfGoal null, gapToGoal null (never NaN/Infinity)', () => {
    const r = computeCampaignProgress({ status: 'active', goalAmount: null, raisedAmount: 500 }, NOW)
    expect(r.pctOfGoal).toBeNull()
    expect(r.gapToGoal).toBeNull()
  })

  it('goal 0 → pctOfGoal null (NOT Infinity), gapToGoal signed = -raised', () => {
    const r = computeCampaignProgress({ status: 'active', goalAmount: 0, raisedAmount: 500 }, NOW)
    expect(r.pctOfGoal).toBeNull()
    expect(Number.isFinite(r.pctOfGoal as number)).toBe(false)
    expect(r.gapToGoal).toBe(-500)
  })

  it('goal negative → pctOfGoal null', () => {
    const r = computeCampaignProgress({ status: 'active', goalAmount: -5, raisedAmount: 500 }, NOW)
    expect(r.pctOfGoal).toBeNull()
  })

  it('sub-cent goal (rounds to 0 cents) → pctOfGoal null (no div by 0)', () => {
    const r = computeCampaignProgress({ status: 'active', goalAmount: 0.004, raisedAmount: 500 }, NOW)
    expect(r.pctOfGoal).toBeNull()
  })

  it('valid goal → pctOfGoal is raised/goal (not clamped; over-goal > 1)', () => {
    const under = computeCampaignProgress({ status: 'active', goalAmount: 1000, raisedAmount: 540 }, NOW)
    expect(under.pctOfGoal).toBeCloseTo(0.54, 10)
    expect(under.gapToGoal).toBe(460)
    const over = computeCampaignProgress({ status: 'active', goalAmount: 1000, raisedAmount: 1120 }, NOW)
    expect(over.pctOfGoal).toBeCloseTo(1.12, 10)
    expect(over.gapToGoal).toBe(-120)
  })

  it('null raised treated as 0', () => {
    const r = computeCampaignProgress({ status: 'active', goalAmount: 1000, raisedAmount: null }, NOW)
    expect(r.pctOfGoal).toBe(0)
    expect(r.gapToGoal).toBe(1000)
  })
})

describe('campaign progress — urgency (injected now)', () => {
  it('no closeDate → urgency none, daysUntilClose null', () => {
    const r = computeCampaignProgress({ status: 'active', goalAmount: 1000, raisedAmount: 500 }, NOW)
    expect(r.urgency).toBe('none')
    expect(r.daysUntilClose).toBeNull()
  })

  it('closed campaign → urgency none + daysUntilClose null, but pct still computed', () => {
    const r = computeCampaignProgress(
      { status: 'closed', goalAmount: 1000, raisedAmount: 500, closeDate: '2020-01-01' },
      NOW,
    )
    expect(r.urgency).toBe('none')
    expect(r.daysUntilClose).toBeNull()
    expect(r.pctOfGoal).toBe(0.5)
    expect(r.gapToGoal).toBe(500)
  })

  it('past closeDate (active) → overdue (negative days)', () => {
    const r = computeCampaignProgress(
      { status: 'active', goalAmount: 1000, raisedAmount: 500, closeDate: '2026-06-01' },
      NOW,
    )
    expect(r.urgency).toBe('overdue')
    expect(r.daysUntilClose).toBe(-30)
  })

  it('exactly today → closing-soon, 0 days', () => {
    const r = computeCampaignProgress(
      { status: 'active', goalAmount: 1000, raisedAmount: 500, closeDate: '2026-07-01' },
      NOW,
    )
    expect(r.urgency).toBe('closing-soon')
    expect(r.daysUntilClose).toBe(0)
  })

  it('boundary: exactly ADVANCEMENT_CLOSING_SOON_DAYS out → closing-soon', () => {
    // 2026-07-01 + 60 days = 2026-08-30.
    const r = computeCampaignProgress(
      { status: 'active', goalAmount: 1000, raisedAmount: 500, closeDate: '2026-08-30' },
      NOW,
    )
    expect(r.daysUntilClose).toBe(ADVANCEMENT_CLOSING_SOON_DAYS)
    expect(r.urgency).toBe('closing-soon')
  })

  it('one day past the window → on-track', () => {
    const r = computeCampaignProgress(
      { status: 'active', goalAmount: 1000, raisedAmount: 500, closeDate: '2026-08-31' },
      NOW,
    )
    expect(r.daysUntilClose).toBe(61)
    expect(r.urgency).toBe('on-track')
  })

  it('accepts a JS Date (@db.Date) for closeDate, UTC-read', () => {
    const r = computeCampaignProgress(
      { status: 'active', goalAmount: 1000, raisedAmount: 500, closeDate: new Date('2026-06-01T00:00:00.000Z') },
      NOW,
    )
    expect(r.urgency).toBe('overdue')
    expect(r.daysUntilClose).toBe(-30)
  })
})

function gi(over: Partial<GivingSummaryInput> = {}): GivingSummaryInput {
  return {
    status: over.status ?? 'active',
    goalAmount: over.goalAmount ?? null,
    raisedAmount: over.raisedAmount ?? null,
    pctOfGoal: over.pctOfGoal ?? null,
    urgency: over.urgency ?? 'none',
  }
}

describe('giving summary', () => {
  it('empty list → all zeros, overallPctOfGoal null', () => {
    expect(summarizeGiving([])).toEqual({
      total: 0,
      activeCount: 0,
      totalGoal: 0,
      totalRaised: 0,
      overallPctOfGoal: null,
      behindGoalActiveCount: 0,
      closingSoonActiveCount: 0,
      overdueActiveCount: 0,
    })
  })

  it('sums goal/raised in integer cents (no float drift)', () => {
    const s = summarizeGiving([
      gi({ goalAmount: 100.1, raisedAmount: 200.2 }),
      gi({ goalAmount: 100.2, raisedAmount: 100.1 }),
    ])
    expect(s.totalGoal).toBe(200.3)
    expect(s.totalRaised).toBe(300.3)
  })

  it('overallPctOfGoal = sumRaised/sumGoal; null when totalGoal 0', () => {
    const s = summarizeGiving([gi({ goalAmount: 1000, raisedAmount: 250 }), gi({ goalAmount: 1000, raisedAmount: 250 })])
    expect(s.overallPctOfGoal).toBeCloseTo(0.25, 10)
    const z = summarizeGiving([gi({ goalAmount: 0, raisedAmount: 500 }), gi({ goalAmount: null, raisedAmount: 100 })])
    expect(z.overallPctOfGoal).toBeNull()
  })

  it('active counts: behind (pct < threshold), closing-soon, overdue; no-goal active never behind', () => {
    const s = summarizeGiving([
      gi({ status: 'active', pctOfGoal: BEHIND_GOAL_THRESHOLD - 0.01, urgency: 'on-track' }),
      gi({ status: 'active', pctOfGoal: BEHIND_GOAL_THRESHOLD, urgency: 'closing-soon' }), // exactly threshold → NOT behind
      gi({ status: 'active', pctOfGoal: null, urgency: 'overdue' }), // no-goal → NOT behind
      gi({ status: 'closed', pctOfGoal: 0.1, urgency: 'none' }), // not active → ignored for active counts
    ])
    expect(s.activeCount).toBe(3)
    expect(s.behindGoalActiveCount).toBe(1)
    expect(s.closingSoonActiveCount).toBe(1)
    expect(s.overdueActiveCount).toBe(1)
    expect(s.total).toBe(4)
  })
})
