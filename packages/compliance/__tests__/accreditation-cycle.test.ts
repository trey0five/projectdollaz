import { describe, expect, it } from 'vitest'
import {
  composeCycle,
  CYCLE_MILESTONE_KEYS,
  EVIDENCE_FREEZE_LEAD_DAYS,
  type CycleEngineInput,
} from '../src/accreditation-cycle.js'

// ─────────────────────────────────────────────────────────────────────────────
// WS3 F1 — the cycle engine, held to its honesty rules: six milestones always,
// chronological; every not_measurable carries a verbatim reason; thresholds are
// few, integer, and printed in the payload's own text; day-precision civil
// dates with `now` injected (determinism: two calls, same now → same output).
// ─────────────────────────────────────────────────────────────────────────────

const FULL_INPUTS: Omit<CycleEngineInput, 'now' | 'anchor'> = {
  priorFindings: { total: 7, closed: 3 },
  readiness: {
    leafCount: 31,
    scoredCount: 12,
    selfScoredPct: 40,
    verifiedPct: 22,
    projectedIndex: 262,
    band: 'Accredited Needing Improvement',
  },
  evidenceHealth: { evidenceHealthPct: 55, rated: 20, current: 11, expiring: 2 },
  assurances: { total: 6, satisfied: 4 },
  alsoInPortalCount: 0,
}

function compose(now: string, over: Partial<CycleEngineInput> = {}) {
  return composeCycle({
    now,
    anchor: { lastReviewDate: '2022-04-12', nextReviewDate: null, termYears: 6, source: 'manual' },
    ...FULL_INPUTS,
    ...over,
  })
}

describe('composeCycle — anchor + schedule', () => {
  it('derives nextReviewDate = lastReview + termYears (day-clamped civil math)', () => {
    const c = compose('2026-08-25')
    expect(c.anchor.nextReviewDate).toBe('2028-04-12')
    expect(c.anchor.termYears).toBe(6)
  })

  it('an explicit nextReviewDate override wins', () => {
    const c = compose('2026-08-25', {
      anchor: {
        lastReviewDate: '2022-04-12',
        nextReviewDate: '2028-03-01',
        termYears: 6,
        source: 'manual',
      },
    })
    expect(c.anchor.nextReviewDate).toBe('2028-03-01')
    const freeze = c.milestones.find((m) => m.key === 'evidence_freeze')!
    // freeze = nextReview − 28 days, from the OVERRIDE.
    expect(freeze.dueDate).toBe('2028-02-02')
  })

  it('always returns all six milestones, in chronological key order', () => {
    const c = compose('2026-08-25')
    expect(c.milestones.map((m) => m.key)).toEqual([...CYCLE_MILESTONE_KEYS])
    const freeze = c.milestones.find((m) => m.key === 'evidence_freeze')!
    expect(freeze.dueDate).toBe('2028-03-15') // 2028-04-12 − 28d
    expect(EVIDENCE_FREEZE_LEAD_DAYS).toBe(28)
  })

  it('is deterministic: two calls with the same now are deep-equal', () => {
    expect(compose('2026-08-25')).toEqual(compose('2026-08-25'))
  })
})

describe('composeCycle — phase + countdown', () => {
  it('year 5 of 6 lands in the self-assessment window with a live countdown', () => {
    const c = compose('2026-08-25')
    expect(c.phase.yearOfCycle).toBe(5)
    expect(c.phase.key).toBe('self_assessment')
    expect(c.phase.narrative).toContain('year 5 of your 6-year cycle')
    expect(c.countdown).not.toBeNull()
    // The next dated deadline from 2026-08-25 is the evidence freeze.
    expect(c.countdown!.milestoneKey).toBe('evidence_freeze')
    expect(c.countdown!.dueDate).toBe('2028-03-15')
    expect(c.countdown!.daysRemaining).toBe(568)
  })

  it('year boundaries are day-precise: the day before year 2 is still year 1', () => {
    expect(compose('2023-04-11').phase.yearOfCycle).toBe(1)
    expect(compose('2023-04-13').phase.yearOfCycle).toBe(2)
  })

  it('past the review date the phase is review_year and the countdown is null', () => {
    const c = compose('2028-05-01')
    expect(c.phase.key).toBe('review_year')
    expect(c.countdown).toBeNull()
  })
})

describe('composeCycle — milestone states', () => {
  it('progress_report (year 4): overdue when past due with findings unanswered', () => {
    // Due 2026-04-12; on 2026-08-25 with 3/7 answered → overdue.
    const c = compose('2026-08-25')
    const pr = c.milestones.find((m) => m.key === 'progress_report')!
    expect(pr.dueDate).toBe('2026-04-12')
    expect(pr.state).toBe('overdue')
    expect(pr.measure!.text).toBe('3 of 7 prior-visit findings answered')
    expect(pr.measure!.num).toBe(3)
    expect(pr.measure!.den).toBe(7)
  })

  it('progress_report: at_risk inside 183 days with under half answered — threshold PRINTED', () => {
    const c = compose('2026-01-12') // 91 days to 2026-04-12
    const pr = c.milestones.find((m) => m.key === 'progress_report')!
    expect(pr.state).toBe('at_risk')
    expect(pr.measure!.text).toContain('fewer than half')
    expect(pr.measure!.text).toContain('183 days')
  })

  it('progress_report: done when every finding is answered by the due date', () => {
    const c = compose('2026-08-25', { priorFindings: { total: 7, closed: 7 } })
    expect(c.milestones.find((m) => m.key === 'progress_report')!.state).toBe('done')
  })

  it('self_assessment: on_track inside the window, overdue past it while unscored', () => {
    const inWindow = compose('2026-08-25')
    expect(inWindow.milestones.find((m) => m.key === 'self_assessment')!.state).toBe('on_track')
    const past = compose('2028-06-01')
    expect(past.milestones.find((m) => m.key === 'self_assessment')!.state).toBe('overdue')
  })

  it('self_assessment measure counts scored standards AND assurances', () => {
    const c = compose('2026-08-25')
    const sa = c.milestones.find((m) => m.key === 'self_assessment')!
    expect(sa.measure!.text).toBe('12 of 31 standards self-rated; 4 of 6 assurances satisfied')
    expect(sa.window).toEqual({ start: '2026-04-12', end: '2028-04-12' })
  })

  it('implementing (years 2–3): done once the window has passed, upcoming before it', () => {
    const c = compose('2026-08-25')
    const impl = c.milestones.find((m) => m.key === 'implementing')!
    expect(impl.window).toEqual({ start: '2023-04-12', end: '2025-04-12' })
    expect(impl.state).toBe('done')
    expect(compose('2022-10-01').milestones.find((m) => m.key === 'implementing')!.state).toBe(
      'upcoming',
    )
  })

  it('n2 — the implementingEnd DAY is same-day consistent: phase says progress_report AND the milestone reads done', () => {
    // 2025-04-12 is implementingEnd (lastReview + 36 months). The phase
    // comparator treats that day as progress_report (`>=`); the milestone must
    // agree, not still claim the window is open.
    const c = compose('2025-04-12')
    expect(c.phase.key).toBe('progress_report')
    expect(c.milestones.find((m) => m.key === 'implementing')!.state).toBe('done')
    // The day BEFORE, both sides agree the window is still open.
    const before = compose('2025-04-11')
    expect(before.phase.key).toBe('implementing')
    expect(before.milestones.find((m) => m.key === 'implementing')!.state).toBe('on_track')
  })

  it('evidence_freeze: at_risk inside 180 days with defensible under half — printed', () => {
    const c = compose('2027-11-01') // ~135 days to 2028-03-15; verifiedPct 22
    const ef = c.milestones.find((m) => m.key === 'evidence_freeze')!
    expect(ef.state).toBe('at_risk')
    expect(ef.measure!.text).toContain('under half')
    expect(ef.measure!.text).toContain('180 days')
  })

  it('evidence_freeze: done past due only when artifacts are marked in the portal', () => {
    const done = compose('2028-04-01', { alsoInPortalCount: 5 })
    expect(done.milestones.find((m) => m.key === 'evidence_freeze')!.state).toBe('done')
    const overdue = compose('2028-04-01', { alsoInPortalCount: 0 })
    const ef = overdue.milestones.find((m) => m.key === 'evidence_freeze')!
    expect(ef.state).toBe('overdue')
    expect(ef.measure!.text).toContain('cannot see the portal')
  })

  it('review_year reads the hero pair verbatim', () => {
    const c = compose('2027-08-25')
    const ry = c.milestones.find((m) => m.key === 'review_year')!
    expect(ry.state).toBe('on_track') // within a year of 2028-04-12
    expect(ry.measure!.text).toBe(
      '40% documented, 22% defensible; projected index 262 (Accredited Needing Improvement)',
    )
  })
})

describe('composeCycle — every not_measurable carries a VERBATIM reason', () => {
  it('no prior findings → findings_shared and progress_report say so, in words', () => {
    const c = compose('2026-08-25', { priorFindings: { total: 0, closed: 0 } })
    const fs = c.milestones.find((m) => m.key === 'findings_shared')!
    const pr = c.milestones.find((m) => m.key === 'progress_report')!
    expect(fs.state).toBe('not_measurable')
    expect(fs.reason).toBe(
      'No prior-visit findings are on file, so we cannot say whether they were shared.',
    )
    expect(pr.state).toBe('not_measurable')
    expect(pr.reason).toBe(
      'No prior-visit findings are on file, so we cannot say whether they were answered.',
    )
  })

  it('an unreadable readiness register makes the readiness-fed milestones not_measurable', () => {
    const c = compose('2026-08-25', { readiness: null })
    for (const key of ['self_assessment', 'evidence_freeze', 'review_year'] as const) {
      const m = c.milestones.find((x) => x.key === key)!
      expect(m.state, key).toBe('not_measurable')
      expect((m.reason ?? '').length, key).toBeGreaterThan(10)
    }
  })

  it('an unrated evidence health makes implementing not_measurable with its reason', () => {
    const c = compose('2024-01-01', { evidenceHealth: null })
    const impl = c.milestones.find((m) => m.key === 'implementing')!
    expect(impl.state).toBe('not_measurable')
    expect(impl.reason).toContain('Evidence currency has not been rated')
  })

  it('a reason is present IFF the state is not_measurable (never a grey dot, never noise)', () => {
    for (const c of [compose('2026-08-25'), compose('2026-08-25', { readiness: null, priorFindings: null })]) {
      for (const m of c.milestones) {
        if (m.state === 'not_measurable') {
          expect((m.reason ?? '').length, m.key).toBeGreaterThan(10)
          expect(m.measure, m.key).toBeNull()
        } else {
          expect(m.reason, m.key).toBeNull()
        }
      }
    }
  })
})

describe('composeCycle — links use ?center= (the briefing convention, never ?tab=)', () => {
  it('every milestone links an in-app center door', () => {
    const c = compose('2026-08-25')
    for (const m of c.milestones) {
      expect(m.link, m.key).toMatch(/^\/accreditation\?center=[a-z]+$/)
      expect(m.link, m.key).not.toContain('?tab=')
    }
  })
})
