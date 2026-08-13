import { describe, it, expect } from 'vitest'
import { gateAggregates, cohortPublishable, MIN_CELL } from '../src/academics/assessments.js'

/**
 * gateAggregates is the ONE door.
 *
 * Every reader of assessment_school_aggregates — the dashboard, the org
 * dashboard, cross-domain, promote-to-operational, the morning briefing and
 * Penny — goes through this function, and the module's entire FERPA story is
 * that claim. It had no test at all: deleting the suppression, inverting the
 * fail direction, or dropping the derived-over-ingested collapse broke nothing
 * anywhere in the suite.
 *
 * These are the assertions that make the claim mean something.
 */

const familyOf = () => 'nrt' as const
const scoreTypeOf = () => 'percentile' as const

const row = (over: Partial<Parameters<typeof gateAggregates>[0][number]> = {}) => ({
  schoolId: 's1',
  schoolYear: 2026,
  testType: 'terranova',
  gradeLevel: '5',
  derivation: 'ingested',
  avgComposite: 72,
  sectionAverages: { math: 70, reading: 74 },
  testedCount: 30,
  eligibleCount: 32,
  ...over,
})

describe('gateAggregates — the small-cell floor', () => {
  it('publishes a cohort at or above the floor untouched', () => {
    const [r] = gateAggregates([row({ testedCount: MIN_CELL })], familyOf, scoreTypeOf)
    expect(r.suppressed).toBe(false)
    expect(r.avgComposite).toBe(72)
    expect(r.sectionAverages).toEqual({ math: 70, reading: 74 })
    expect(r.testedCount).toBe(MIN_CELL)
  })

  it('suppresses EVERY value on a cohort below the floor, not just the average', () => {
    // A section average, a benchmark count or a distribution left behind is the
    // same disclosure by another column.
    const [r] = gateAggregates(
      [row({ testedCount: MIN_CELL - 1, benchmarkMetCount: 2, benchmarkTestedCount: 4, distribution: { q4: 4 } })],
      familyOf,
      scoreTypeOf,
    )
    expect(r.suppressed).toBe(true)
    expect(r.avgComposite).toBeNull()
    expect(r.sectionAverages).toBeNull()
    expect(r.testedCount).toBeNull()
    expect(r.benchmarkMetCount).toBeNull()
    expect(r.benchmarkTestedCount).toBeNull()
    expect(r.distribution).toBeNull()
  })

  it('a cohort of ONE is suppressed — that row is one child', () => {
    const [r] = gateAggregates([row({ testedCount: 1, avgComposite: 99 })], familyOf, scoreTypeOf)
    expect(r.avgComposite).toBeNull()
    expect(r.suppressed).toBe(true)
  })

  it('FAILS CLOSED on an unknown count — null and undefined both suppress', () => {
    for (const testedCount of [null, undefined]) {
      const [r] = gateAggregates([row({ testedCount })], familyOf, scoreTypeOf)
      expect(r.suppressed, `testedCount=${String(testedCount)} must suppress`).toBe(true)
      expect(r.avgComposite).toBeNull()
    }
  })

  it('a ZERO count with a score is a contradiction, and suppresses', () => {
    // The average came from students the count says do not exist. A score with
    // no denominator is precisely the row a floor exists to stop — and 0 is not
    // caught by a "greater than zero and under the floor" test, which is how
    // this one used to sail through.
    const [r] = gateAggregates([row({ testedCount: 0, avgComposite: 99 })], familyOf, scoreTypeOf)
    expect(r.suppressed).toBe(true)
    expect(r.avgComposite).toBeNull()
  })
})

describe('gateAggregates — the derived-over-ingested collapse', () => {
  const key = { schoolId: 's1', schoolYear: 2026, testType: 'terranova', gradeLevel: '5' }

  it('keeps ONE row per (school, year, test, grade)', () => {
    const out = gateAggregates(
      [row({ ...key, derivation: 'ingested', avgComposite: 60 }), row({ ...key, derivation: 'derived', avgComposite: 72 })],
      familyOf,
      scoreTypeOf,
    )
    expect(out).toHaveLength(1)
  })

  it('derived wins regardless of input order', () => {
    for (const order of [['ingested', 'derived'], ['derived', 'ingested']]) {
      const out = gateAggregates(
        order.map((d) => row({ ...key, derivation: d, avgComposite: d === 'derived' ? 72 : 60 })),
        familyOf,
        scoreTypeOf,
      )
      expect(out[0].avgComposite, `order ${order.join(',')}`).toBe(72)
    }
  })

  it('does NOT collapse across different grades or years', () => {
    const out = gateAggregates(
      [row({ gradeLevel: '4' }), row({ gradeLevel: '5' }), row({ gradeLevel: '5', schoolYear: 2025 })],
      familyOf,
      scoreTypeOf,
    )
    expect(out).toHaveLength(3)
  })

  it('the derived winner INHERITS the eligible count only a summary file carries', () => {
    // deriveAggregates cannot know who did not sit the exam, so the derived row
    // always has eligibleCount null. Dropping the ingested row wholesale killed
    // participation for exactly the schools that uploaded the most data.
    const out = gateAggregates(
      [
        row({ ...key, derivation: 'ingested', eligibleCount: 44, testedCount: 40 }),
        row({ ...key, derivation: 'derived', eligibleCount: null, testedCount: 38 }),
      ],
      familyOf,
      scoreTypeOf,
    )
    expect(out).toHaveLength(1)
    expect(out[0].testedCount).toBe(38)
    expect(out[0].eligibleCount).toBe(44)
  })

  it('the collapse runs BEFORE the floor — a thin derived row does not inherit a fat ingested one', () => {
    const out = gateAggregates(
      [
        row({ ...key, derivation: 'ingested', testedCount: 40, avgComposite: 60 }),
        row({ ...key, derivation: 'derived', testedCount: 2, avgComposite: 95 }),
      ],
      familyOf,
      scoreTypeOf,
    )
    expect(out).toHaveLength(1)
    expect(out[0].suppressed).toBe(true)
    expect(out[0].avgComposite).toBeNull()
  })
})

describe('gateAggregates — the complement', () => {
  const g = (gradeLevel, testedCount, avgComposite) =>
    row({ gradeLevel, testedCount, avgComposite, derivation: 'derived' })

  it('the whole-school row is withheld when subtracting the visible grades exposes a hidden one', () => {
    // 5 juniors averaging 22.0 and ONE senior scoring 33. Suppressing only the
    // senior leaves (6 x 23.833 - 5 x 22.0) / (6 - 5) = 33 — his exact score,
    // rebuilt from two rows that each cleared the floor on their own.
    const out = gateAggregates([g('11', 5, 22), g('12', 1, 33), g('all', 6, 23.833)], familyOf, scoreTypeOf)
    const byGrade = Object.fromEntries(out.map((r) => [r.gradeLevel, r]))
    expect(byGrade['12'].avgComposite).toBeNull()
    // Grade 11 is the only cover available, so it goes too — and with no grade
    // row left to subtract, the whole-school average is safe to publish.
    expect(byGrade['11'].avgComposite).toBeNull()
    expect(byGrade.all.avgComposite).toBeCloseTo(23.833)
  })

  it('a visible neighbour is hidden WITH it so the whole-school number survives', () => {
    // Grades 10 (6 students) and 11 (30) are both publishable on their own, and
    // grade 12 has one senior. Hiding only grade 12 leaves his score recoverable
    // no matter how many students are visible — the rows are an exact partition.
    // Hiding grade 10 alongside makes the recovered figure describe 7 children,
    // and the whole-school average stays on screen, which is the number that
    // matters most.
    const out = gateAggregates(
      [g('10', 6, 20), g('11', 30, 22), g('12', 1, 33), g('all', 37, 21.9)],
      familyOf,
      scoreTypeOf,
    )
    const byGrade = Object.fromEntries(out.map((r) => [r.gradeLevel, r]))
    expect(byGrade['12'].avgComposite).toBeNull()
    expect(byGrade['10'].avgComposite, 'the smallest publishable neighbour goes too').toBeNull()
    expect(byGrade['11'].avgComposite, 'the big grade is untouched').toBe(22)
    expect(byGrade.all.avgComposite, 'the headline number survives').toBeCloseTo(21.9)
  })

  it('with nothing left to hide behind, the whole-school row comes down instead', () => {
    // Only one other grade and it is itself thin: no combination reaches the
    // floor, so the total is the thing that has to go.
    const out = gateAggregates([g('11', 3, 22), g('12', 1, 33), g('all', 4, 24.75)], familyOf, scoreTypeOf)
    for (const r of out) expect(r.avgComposite).toBeNull()
  })

  it('a hidden grade with an UNKNOWN count makes the residual unknowable, so the total goes too', () => {
    const out = gateAggregates([g('11', 30, 22), g('12', null, 33), g('all', 31, 22.35)], familyOf, scoreTypeOf)
    expect(Object.fromEntries(out.map((r) => [r.gradeLevel, r])).all.avgComposite).toBeNull()
  })

  it('no hidden grade, no complement problem', () => {
    const out = gateAggregates([g('11', 30, 22), g('12', 12, 25), g('all', 42, 22.86)], familyOf, scoreTypeOf)
    for (const r of out) expect(r.avgComposite).not.toBeNull()
  })

  it('the complement is scoped per (school, year, test) — one school does not mute another', () => {
    const out = gateAggregates(
      [
        g('11', 5, 22),
        g('12', 1, 33),
        g('all', 6, 23.833),
        row({ schoolId: 's2', gradeLevel: 'all', testedCount: 40, avgComposite: 70, derivation: 'derived' }),
      ],
      familyOf,
      scoreTypeOf,
    )
    expect(out.find((r) => r.schoolId === 's2').avgComposite).toBe(70)
  })
})

describe('cohortPublishable — the same floor, for callers holding only a count', () => {
  it('is the floor, and fails closed', () => {
    expect(cohortPublishable(MIN_CELL)).toBe(true)
    expect(cohortPublishable(MIN_CELL - 1)).toBe(false)
    expect(cohortPublishable(0)).toBe(false)
    expect(cohortPublishable(null)).toBe(false)
    expect(cohortPublishable(undefined)).toBe(false)
  })

  it('agrees with gateAggregates on every count around the boundary', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 6, 40]) {
      const [r] = gateAggregates([row({ testedCount: n })], familyOf, scoreTypeOf)
      const gatePublishes = r.avgComposite !== null
      expect(gatePublishes, `count ${n}`).toBe(cohortPublishable(n))
    }
  })
})
