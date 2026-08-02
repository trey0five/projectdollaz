import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { computePace } from '../strategy/strategy-progress.js'
import { STALE_INITIATIVE_DAYS } from '../strategy/strategy.constants.js'
import {
  computeInitiativeProgress,
  type InitiativeProgressInput,
  type ProgressObservation,
} from './improvement-progress.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase G — the progress verdict, and the three promises it has to keep.
//
//   1. A LEGACY ROW RENDERS EXACTLY AS IT DID. `progressSource = null` means
//      "status only" and nothing else; this is the back-compat contract for every
//      initiative that existed before this phase.
//   2. `riskSignal` (computed) and `riskLevel` (human) ARE TWO FIELDS AND ARE
//      NEVER MERGED. Asserted functionally AND over the source, because the
//      merge this guards against is a one-line edit that no functional test
//      written afterwards would think to look for.
//   3. A COMPLETION DATE IS ONLY EVER EXTRAPOLATED FROM A REAL SERIES. Otherwise
//      null plus a literal reason — "no date" and "no date because you have one
//      reading" are different answers.
// ─────────────────────────────────────────────────────────────────────────────

const ASOF = '2026-07-31T00:00:00.000Z'

function input(over: Partial<InitiativeProgressInput> = {}): InitiativeProgressInput {
  return {
    progressSource: null,
    status: 'in_progress',
    startDate: null,
    dueDate: null,
    asOf: ASOF,
    baselineValue: null,
    currentValue: null,
    targetValue: null,
    metricLabel: null,
    metricKey: null,
    milestones: null,
    linkedTaskCounts: null,
    manualProgressPct: null,
    staleDays: 0,
    riskLevel: null,
    riskNote: null,
    events: [],
    ...over,
  }
}

function obs(observedOn: string, pct: number, source: ProgressObservation['source'] = 'metric'): ProgressObservation {
  return { observedOn, pct, source }
}

describe('the back-compat contract — progressSource null reads as "status only"', () => {
  it('null source: no percentage, no pace, no projection, no rollup weight', () => {
    const r = computeInitiativeProgress(input({ startDate: '2026-01-01', dueDate: '2026-12-31' }))
    expect(r.progressSource).toBeNull()
    expect(r.progressPct).toBeNull()
    expect(r.progressBasis).toBe('Status only')
    expect(r.paceStatus).toBe('no_data')
    expect(r.projectedCompletionDate).toBeNull()
    expect(r.countsTowardRollup).toBe(false)
  })

  it('a null source with a rich set of otherwise-usable columns STILL reads status only', () => {
    // The guard that matters: a legacy row that happens to carry a target or a
    // milestone list must not silently start reporting a percentage.
    const r = computeInitiativeProgress(
      input({
        progressSource: null,
        baselineValue: 0,
        currentValue: 5,
        targetValue: 10,
        milestones: [{ id: 'a', label: 'a', done: true }],
        linkedTaskCounts: { total: 4, done: 2 },
        manualProgressPct: 0.5,
      }),
    )
    expect(r.progressPct).toBeNull()
    expect(r.progressBasis).toBe('Status only')
  })
})

describe('the pace verdict is the SAME verdict /strategy reaches', () => {
  it('a metric-bound initiative agrees with computePace, called directly, exactly', () => {
    const i = input({
      progressSource: 'metric',
      baselineValue: 0.01,
      currentValue: 0.03,
      targetValue: 0.06,
      startDate: '2026-01-01',
      dueDate: '2026-12-31',
      metricLabel: 'Operating Margin',
    })
    const mine = computeInitiativeProgress(i)
    const theirs = computePace({
      baseline: 0.01,
      current: 0.03,
      target: 0.06,
      startDate: '2026-01-01',
      targetDate: '2026-12-31',
      asOf: ASOF,
    })
    expect(mine.progressPct).toBe(theirs.pctToTarget)
    expect(mine.expectedPct).toBe(theirs.expectedPct)
    expect(mine.paceStatus).toBe(theirs.paceStatus)
    expect(mine.overshoot).toBe(theirs.overshoot)
    expect(mine.progressBasis).toBe('Measured: Operating Margin')
  })

  it('milestone / task_rollup / manual each take the documented pace inputs', () => {
    const ms = computeInitiativeProgress(
      input({
        progressSource: 'milestone',
        milestones: [
          { id: '1', label: 'a', done: true },
          { id: '2', label: 'b', done: false },
          { id: '3', label: 'c', done: false },
          { id: '4', label: 'd', done: false },
        ],
      }),
    )
    expect(ms.progressPct).toBe(0.25)
    expect(ms.progressBasis).toBe('Milestones completed')

    const tasks = computeInitiativeProgress(
      input({ progressSource: 'task_rollup', linkedTaskCounts: { total: 5, done: 2 } }),
    )
    expect(tasks.progressPct).toBe(0.4)
    expect(tasks.progressBasis).toBe('Linked tasks completed')

    const manual = computeInitiativeProgress(
      input({ progressSource: 'manual', manualProgressPct: 0.25 }),
    )
    expect(manual.progressPct).toBe(0.25)
    expect(manual.progressBasis).toBe('Hand-set percentage')
  })

  it('NO SCHEDULE WINDOW ⇒ expectedPct null, and the pace verdict is not a claim', () => {
    // `computePace` falls back to exp = 0 when there is no window, so a 0%-done
    // initiative due tomorrow comes back 'on_track'. On /strategy a missing start
    // falls back to the plan's start date; on /improvement the start-date field
    // is optional and hidden on the adopt path, so a null start is the NORMAL
    // case and "On pace" would be a claim nothing supports.
    //
    // computePace is shared VERBATIM and is not forked here, so the contract the
    // UI holds is this one: expectedPct === null means there is no window, and
    // the drawer prints "No schedule window" instead of a pace label
    // (improvement-honesty.spec.jsx pins the rendering).
    const noStart = computeInitiativeProgress(
      input({
        progressSource: 'milestone',
        dueDate: '2026-08-01',
        milestones: [1, 2, 3, 4, 5].map((n) => ({ id: `m${n}`, label: `m${n}`, done: false })),
        asOf: '2026-07-31T12:00:00.000Z',
      }),
    )
    expect(noStart.expectedPct).toBeNull()
    expect(noStart.progressPct).toBe(0)

    // With a window, expectedPct is a real number and the verdict means something.
    const withStart = computeInitiativeProgress(
      input({
        progressSource: 'milestone',
        startDate: '2026-01-01',
        dueDate: '2026-08-01',
        milestones: [1, 2, 3, 4, 5].map((n) => ({ id: `m${n}`, label: `m${n}`, done: false })),
        asOf: '2026-07-31T12:00:00.000Z',
      }),
    )
    expect(withStart.expectedPct).not.toBeNull()
    expect(withStart.paceStatus).toBe('behind')
  })

  it('an EMPTY milestone list is immeasurable, never 0% and never 100%', () => {
    const r = computeInitiativeProgress(input({ progressSource: 'milestone', milestones: [] }))
    expect(r.progressPct).toBeNull()
    expect(r.paceStatus).toBe('no_data')
  })

  it('an initiative with no linked tasks is immeasurable, not complete', () => {
    const r = computeInitiativeProgress(
      input({ progressSource: 'task_rollup', linkedTaskCounts: { total: 0, done: 0 } }),
    )
    expect(r.progressPct).toBeNull()
    expect(r.paceStatus).toBe('no_data')
  })
})

describe('riskSignal (computed) and riskLevel (human) are TWO FIELDS, never merged', () => {
  it('a row a human called "low" that is behind emits BOTH, unequal, neither overwritten', () => {
    const r = computeInitiativeProgress(
      input({
        progressSource: 'milestone',
        milestones: [
          { id: '1', label: 'a', done: false },
          { id: '2', label: 'b', done: false },
          { id: '3', label: 'c', done: false },
          { id: '4', label: 'd', done: false },
        ],
        startDate: '2026-01-01',
        dueDate: '2026-08-31',
        riskLevel: 'low',
        riskNote: 'The head is comfortable; the vendor has committed verbally.',
      }),
    )
    expect(r.paceStatus).toBe('behind')
    expect(r.riskSignal).toBe('behind')
    expect(r.riskLevel).toBe('low') // NOT overwritten by the signal
    expect(r.riskNote).toBe('The head is comfortable; the vendor has committed verbally.')
    expect(r.riskSignal).not.toBe(r.riskLevel)
  })

  it('riskLevel null STAYS null — an unjudged row is not "none"', () => {
    const r = computeInitiativeProgress(input({ status: 'in_progress' }))
    expect(r.riskSignal).toBe('none')
    expect(r.riskLevel).toBeNull()
    expect(r.riskNote).toBeNull()
  })

  it('overdue outranks every other signal, and a CLOSED row is never overdue', () => {
    const base = { progressSource: 'manual' as const, manualProgressPct: 0.1, dueDate: '2026-06-30' }
    expect(computeInitiativeProgress(input({ ...base, status: 'in_progress' })).riskSignal).toBe('overdue')
    expect(computeInitiativeProgress(input({ ...base, status: 'blocked' })).riskSignal).toBe('overdue')
    // Finished and abandoned work cannot be late.
    expect(computeInitiativeProgress(input({ ...base, status: 'done' })).riskSignal).not.toBe('overdue')
    expect(computeInitiativeProgress(input({ ...base, status: 'cancelled' })).riskSignal).not.toBe('overdue')
  })

  it('an initiative due TODAY is NOT overdue, whatever time of day it is asked', () => {
    // THE REGRESSION THIS PINS: `asOf` is a wall-clock instant (getImprovement
    // passes `new Date().toISOString()`) while `dueDate` is a @db.Date at
    // midnight. Comparing them directly made every open initiative "overdue"
    // from 00:00:00.001 UTC on its own due date — the red chip, the "… is
    // overdue" rail row, and the Overdue KPI, all a day early. The old spec
    // never saw it because its ASOF was exactly midnight.
    const dueToday = { progressSource: 'manual' as const, manualProgressPct: 0.1, dueDate: '2026-07-31' }
    for (const asOf of [
      '2026-07-31T00:00:00.000Z',
      '2026-07-31T00:00:00.001Z',
      '2026-07-31T15:24:00.000Z',
      '2026-07-31T23:59:59.999Z',
    ]) {
      expect(
        computeInitiativeProgress(input({ ...dueToday, asOf })).riskSignal,
        `due today, asOf ${asOf}`,
      ).not.toBe('overdue')
    }
    // The day AFTER is late, at any hour — the fix must not push the boundary out.
    for (const asOf of ['2026-08-01T00:00:00.000Z', '2026-08-01T09:00:00.000Z']) {
      expect(computeInitiativeProgress(input({ ...dueToday, asOf })).riskSignal, asOf).toBe('overdue')
    }
  })

  it('a behind-pace initiative that is ALSO late still reports paceStatus behind', () => {
    // riskSignal is precedence-ranked and 'overdue' wins, which is correct — but
    // it is why `summary.behind` must be counted from paceStatus, not from the
    // signal. This pins the two fields disagreeing on purpose.
    const r = computeInitiativeProgress(
      input({
        progressSource: 'metric',
        baselineValue: 0,
        currentValue: 1,
        targetValue: 10,
        startDate: '2026-01-01',
        dueDate: '2026-06-30',
        asOf: '2026-07-31T12:00:00.000Z',
      }),
    )
    expect(r.paceStatus).toBe('behind')
    expect(r.riskSignal).toBe('overdue')
  })

  it('blocked, or stale past the shared threshold, reads "watch"', () => {
    expect(computeInitiativeProgress(input({ status: 'blocked' })).riskSignal).toBe('watch')
    expect(
      computeInitiativeProgress(input({ staleDays: STALE_INITIATIVE_DAYS + 1 })).riskSignal,
    ).toBe('watch')
    // Exactly at the threshold is not yet stale — the same strict `>` /strategy uses.
    expect(computeInitiativeProgress(input({ staleDays: STALE_INITIATIVE_DAYS })).riskSignal).toBe('none')
  })

  it('SOURCE-READING: neither risk field is ever assigned from the other', () => {
    const src = readFileSync(
      fileURLToPath(new URL('./improvement-progress.ts', import.meta.url)),
      'utf8',
    )
    expect(src).not.toMatch(/riskLevel\s*[:=][^,\n]*riskSignal/)
    expect(src).not.toMatch(/riskSignal\s*[:=][^,\n]*riskLevel/)
  })
})

describe('projectedCompletionDate — acceptance 4, mechanised', () => {
  const twoGoodReadings = [obs('2026-05-01', 0.2), obs('2026-07-01', 0.6)]

  it('projects from two metric readings ≥14 days apart that moved forward', () => {
    const r = computeInitiativeProgress(
      input({ progressSource: 'metric', baselineValue: 0, currentValue: 6, targetValue: 10, events: twoGoodReadings }),
    )
    // 0.2 → 0.6 over 61 days; 0.4 remaining at the same rate is another 61 days.
    // `Math.ceil` is deliberately CONSERVATIVE (never promise a date earlier than
    // the trend supports), and binary floating point puts 0.4 / (0.4/61) a hair
    // above 61, so the honest answer lands on day 62 rather than 61. A projection
    // that errs one day late is the right direction for this field to err in.
    expect(r.projectedCompletionDate).toBe('2026-09-01')
    expect(r.projectionReason).toBeNull()
  })

  it('MANUAL never projects — a hand-set number is not an observation', () => {
    const r = computeInitiativeProgress(
      input({
        progressSource: 'manual',
        manualProgressPct: 0.6,
        // Even handed a perfectly good series, manual refuses.
        events: twoGoodReadings.map((e) => ({ ...e, source: 'manual' as const })),
      }),
    )
    expect(r.projectedCompletionDate).toBeNull()
    expect(r.projectionReason).toBe(
      'A hand-set percentage is not an observation, so no completion date can be projected.',
    )
    // …and it never feeds an org score, which is the other half of acceptance 4.
    expect(r.countsTowardRollup).toBe(false)
  })

  it('task_rollup never projects, but DOES count toward a rollup', () => {
    const r = computeInitiativeProgress(
      input({
        progressSource: 'task_rollup',
        linkedTaskCounts: { total: 10, done: 6 },
        events: twoGoodReadings.map((e) => ({ ...e, source: 'task_rollup' as const })),
      }),
    )
    expect(r.projectedCompletionDate).toBeNull()
    expect(r.projectionReason).toBe(
      'Task counts are not a measured series, so no completion date is projected.',
    )
    expect(r.countsTowardRollup).toBe(true)
  })

  it('one reading, and zero readings, each name their own count', () => {
    const one = computeInitiativeProgress(
      input({ progressSource: 'metric', events: [obs('2026-05-01', 0.2)] }),
    )
    expect(one.projectionReason).toBe('Only 1 observation recorded; two are needed to project.')
    const zero = computeInitiativeProgress(input({ progressSource: 'metric', events: [] }))
    expect(zero.projectionReason).toBe('Only 0 observations recorded; two are needed to project.')
  })

  it('readings closer than a fortnight name the span they actually have', () => {
    const r = computeInitiativeProgress(
      input({ progressSource: 'metric', events: [obs('2026-07-01', 0.2), obs('2026-07-10', 0.6)] }),
    )
    expect(r.projectedCompletionDate).toBeNull()
    expect(r.projectionReason).toBe(
      'Your earliest and latest readings are 9 days apart; at least 14 are needed to project.',
    )
    // 13 days is still short; 14 is the boundary and must pass.
    expect(
      computeInitiativeProgress(
        input({ progressSource: 'metric', events: [obs('2026-07-01', 0.2), obs('2026-07-15', 0.6)] }),
      ).projectedCompletionDate,
    ).not.toBeNull()
  })

  it('the short-span sentence is true of THREE readings too, not just of two', () => {
    // The sentence used to open "The two readings are …" while reporting the
    // span between the FIRST and LAST of however many there were — a literal
    // statement about the data that is false the moment a third reading exists.
    const r = computeInitiativeProgress(
      input({
        progressSource: 'milestone',
        events: [
          obs('2026-01-01', 0.1, 'milestone'),
          obs('2026-01-05', 0.2, 'milestone'),
          obs('2026-01-09', 0.3, 'milestone'),
        ],
      }),
    )
    expect(r.projectionReason).toBe(
      'Your earliest and latest readings are 8 days apart; at least 14 are needed to project.',
    )
    expect(r.projectionReason).not.toContain('two readings')
  })

  it('a flat or BACKWARD series projects nothing — a trend line is not a wish', () => {
    const flat = computeInitiativeProgress(
      input({ progressSource: 'metric', events: [obs('2026-05-01', 0.4), obs('2026-07-01', 0.4)] }),
    )
    expect(flat.projectionReason).toBe(
      'Progress has not moved forward between the two readings, so no completion date can be projected.',
    )
    const backward = computeInitiativeProgress(
      input({ progressSource: 'metric', events: [obs('2026-05-01', 0.6), obs('2026-07-01', 0.3)] }),
    )
    expect(backward.projectedCompletionDate).toBeNull()
    expect(backward.projectionReason).toBe(flat.projectionReason)
  })

  it('already at target says so, rather than projecting a date in the past', () => {
    const r = computeInitiativeProgress(
      input({ progressSource: 'metric', events: [obs('2026-05-01', 0.6), obs('2026-07-01', 1)] }),
    )
    expect(r.projectedCompletionDate).toBeNull()
    expect(r.projectionReason).toBe('Already at target.')
  })

  it('a status-only row names the status-only reason', () => {
    expect(computeInitiativeProgress(input()).projectionReason).toBe(
      'This initiative reports status only, so nothing can be projected.',
    )
  })

  it('readings from a DIFFERENT source are not borrowed to make up the two', () => {
    // A milestone initiative with two metric readings has ZERO readings of its
    // own. Mixing them would project a date from a series that never described
    // this work.
    const r = computeInitiativeProgress(
      input({
        progressSource: 'milestone',
        milestones: [
          { id: '1', label: 'a', done: true },
          { id: '2', label: 'b', done: false },
        ],
        events: twoGoodReadings,
      }),
    )
    expect(r.projectedCompletionDate).toBeNull()
    expect(r.projectionReason).toBe('Only 0 observations recorded; two are needed to project.')
  })

  it('the date and the reason are EXCLUSIVE-OR, in both directions, across every case', () => {
    const cases: InitiativeProgressInput[] = [
      input(),
      input({ progressSource: 'manual', manualProgressPct: 0.5 }),
      input({ progressSource: 'task_rollup', linkedTaskCounts: { total: 2, done: 1 } }),
      input({ progressSource: 'metric', events: [] }),
      input({ progressSource: 'metric', events: [obs('2026-05-01', 0.2)] }),
      input({ progressSource: 'metric', events: [obs('2026-07-01', 0.2), obs('2026-07-05', 0.4)] }),
      input({ progressSource: 'metric', events: [obs('2026-05-01', 0.4), obs('2026-07-01', 0.4)] }),
      input({ progressSource: 'metric', events: [obs('2026-05-01', 0.4), obs('2026-07-01', 1)] }),
      input({ progressSource: 'metric', events: twoGoodReadings }),
      input({ progressSource: 'milestone', events: twoGoodReadings.map((e) => ({ ...e, source: 'milestone' as const })) }),
    ]
    for (const c of cases) {
      const r = computeInitiativeProgress(c)
      expect(
        (r.projectedCompletionDate === null) !== (r.projectionReason === null),
        `date and reason must be exclusive-or (source=${String(c.progressSource)})`,
      ).toBe(true)
    }
  })
})

describe('countsTowardRollup — the quarantine on self-reported numbers', () => {
  it('measured sources count; manual and legacy do not', () => {
    const of = (progressSource: InitiativeProgressInput['progressSource']) =>
      computeInitiativeProgress(input({ progressSource })).countsTowardRollup
    expect(of('metric')).toBe(true)
    expect(of('milestone')).toBe(true)
    expect(of('task_rollup')).toBe(true)
    expect(of('manual')).toBe(false)
    expect(of(null)).toBe(false)
  })
})

describe('computePace is REUSED, not reimplemented', () => {
  it('improvement-progress.ts defines no pace function of its own', () => {
    const src = readFileSync(
      fileURLToPath(new URL('./improvement-progress.ts', import.meta.url)),
      'utf8',
    )
    // A copy of the verdict is how "behind" starts meaning two things.
    expect(src).not.toMatch(/function\s+computePace/)
    expect(src).not.toMatch(/SLIP_TOLERANCE|RISK_TOLERANCE/)
    expect(src).toMatch(/import\s*\{[^}]*computePace[^}]*\}\s*from\s*'\.\.\/strategy\/strategy-progress\.js'/)
  })

  it('strategy-progress.ts is untouched by this phase — it defines the verdict alone', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../strategy/strategy-progress.ts', import.meta.url)),
      'utf8',
    )
    expect(src).not.toMatch(/improvement/i)
  })
})
