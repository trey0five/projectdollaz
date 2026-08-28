import { describe, it, expect } from 'vitest'
import {
  COHORT_TOTAL_SERIES,
  cohortIdOf,
  cohortMatrix,
  cohortMovements,
  cohortPanelPlan,
  cohortSpanOf,
  cohortTrajectories,
  cohortTrajectorySummary,
  compositeSeriesLabel,
  gradeKeyOfRank,
  gradeRankOf,
  type AssessmentRow,
} from '../src/index.js'

/**
 * LONGITUDINAL COHORTS — the same children, followed across up to four grades.
 *
 * These tests assert NUMBERS and STATES, not shapes: the failure modes this
 * feature has are all "the chart drew something plausible that was not true" —
 * a line through a year nobody measured, a four-grade claim built from a
 * two-grade change, a high school offered a "grades 2 → 5" panel, a +3
 * percentile move painted as growth.
 */

/** A norm-referenced (TerraNova-shaped) row: national percentiles. */
function nrt(
  schoolId: string,
  schoolYear: number,
  gradeLevel: string,
  avg: number | null,
  extra: Partial<AssessmentRow> = {},
): AssessmentRow {
  return {
    schoolId,
    schoolName: `School ${schoolId.toUpperCase()}`,
    schoolYear,
    testType: 'terranova',
    family: 'nrt',
    scoreType: 'percentile',
    gradeLevel,
    avgComposite: avg,
    testedCount: 40,
    ...extra,
  }
}

/** A full year × grade grid for one school — the ordinary case. */
function grid(
  schoolId: string,
  years: number[],
  grades: string[],
  value: (year: number, grade: string) => number | null = () => 60,
): AssessmentRow[] {
  const out: AssessmentRow[] = []
  for (const y of years) for (const g of grades) out.push(nrt(schoolId, y, g, value(y, g)))
  return out
}

const HIGH = grid('h', [2023, 2024, 2025, 2026], ['9', '10', '11', '12'])
const K8 = grid('k', [2023, 2024, 2025, 2026], ['K', '1', '2', '3', '4', '5', '6', '7', '8'])

// ── 1-4: SPAN ENUMERATION ────────────────────────────────────────────────────

describe('cohorts — the panel set comes from the school’s own grades', () => {
  it('(1) a 9-12 school over four grades has EXACTLY ONE cohort: 9 → 12', () => {
    const ts = cohortTrajectories(HIGH, { window: 4, endYear: 2026, schoolIds: ['h'], focusSchoolId: 'h' })
    expect(ts).toHaveLength(1)
    expect(ts[0].startGrade).toBe('9')
    expect(ts[0].endGrade).toBe('12')
    expect(ts[0].startYear).toBe(2023)
    expect(ts[0].endYear).toBe(2026)
    // The bug this exists to make impossible: a high school offered a panel
    // for grades it does not teach.
    expect(ts.every((t) => (gradeRankOf(t.startGrade) as number) >= 9)).toBe(true)
  })

  it('(2) the same school over two grades has exactly 9→10, 10→11, 11→12', () => {
    const ts = cohortTrajectories(HIGH, { window: 2, endYear: 2026, schoolIds: ['h'], focusSchoolId: 'h' })
    expect(ts.map((t) => `${t.startGrade}→${t.endGrade}`)).toEqual(['9→10', '10→11', '11→12'])
  })

  it('(3) a span shorter than the window yields NO panels and says which windows exist', () => {
    const two = grid('t', [2025, 2026], ['11', '12'])
    const span = cohortSpanOf(two, ['t'])
    expect(span.low).toBe(11)
    expect(span.high).toBe(12)
    expect(span.gradeDepth).toBe(2)
    expect(span.maxWindow).toBe(2)
    expect(span.windows).toEqual([2])
    expect(cohortTrajectories(two, { window: 4, endYear: 2026, schoolIds: ['t'], focusSchoolId: 't' })).toEqual([])
    expect(cohortTrajectories(two, { window: 2, endYear: 2026, schoolIds: ['t'], focusSchoolId: 't' })).toHaveLength(1)
  })

  it('(4) a K-8 school over four grades has six cohorts, K→3 through 5→8, none touching grade 9', () => {
    const ts = cohortTrajectories(K8, { window: 4, endYear: 2026, schoolIds: ['k'], focusSchoolId: 'k' })
    expect(ts.map((t) => `${t.startGrade}→${t.endGrade}`)).toEqual([
      'K→3',
      '1→4',
      '2→5',
      '3→6',
      '4→7',
      '5→8',
    ])
    expect(ts.every((t) => (gradeRankOf(t.endGrade) as number) <= 8)).toBe(true)
  })

  it('the panel cap keeps the HIGHEST end grades and reports what it dropped', () => {
    const span = cohortSpanOf(K8, ['k'])
    const plan = cohortPanelPlan(span, { window: 2, maxPanels: 3 })
    expect(plan.panelsAvailable).toBe(8)
    expect(plan.truncated).toBe(true)
    expect(plan.endRanks).toEqual([6, 7, 8])
  })
})

// ── 5-6: GAPS ARE NAMED, NEVER FILLED ────────────────────────────────────────

describe('cohorts — a gap keeps its slot and says why it is empty', () => {
  const rows = grid('a', [2023, 2024, 2025, 2026], ['2', '3', '4', '5'], (y) => 60 + (y - 2023) * 3)

  it('(5) a missing middle year keeps four legs, breaks the line, and STILL computes net change', () => {
    // Drop the 2025 grade-4 row: the 2→5 cohort loses its third leg only.
    const holed = rows.filter((r) => !(r.schoolYear === 2025 && r.gradeLevel === '4'))
    const ts = cohortTrajectories(holed, { window: 4, endYear: 2026, schoolIds: ['a'], focusSchoolId: 'a' })
    expect(ts).toHaveLength(1)
    const t = ts[0]
    expect(t.legs).toHaveLength(4)
    expect(t.legs.map((l) => l.gradeLevel)).toEqual(['2', '3', '4', '5'])
    expect(t.legs[2].state).toBe('missing')
    expect(t.legs[2].value).toBeNull()
    expect(t.legs[2].tested).toBeNull()
    expect(t.observedLegs).toBe(3)
    expect(t.complete).toBe(false)
    // Both ENDPOINTS survived, so the four-grade claim is still true: 60 → 69.
    expect(t.legs[0].value).toBe(60)
    expect(t.legs[3].value).toBe(69)
    expect(t.netChange).toBe(9)
    expect(t.netChangeUnavailable).toBeNull()
    expect(t.direction).toBe('gained')
  })

  it('(6) a SUPPRESSED endpoint nulls net change, names the end, and still draws the panel', () => {
    const suppressed = rows.map((r) =>
      r.schoolYear === 2026 && r.gradeLevel === '5'
        ? nrt('a', 2026, '5', null, { suppressed: true, testedCount: null })
        : r,
    )
    const ts = cohortTrajectories(suppressed, { window: 4, endYear: 2026, schoolIds: ['a'], focusSchoolId: 'a' })
    expect(ts).toHaveLength(1)
    const t = ts[0]
    expect(t.legs).toHaveLength(4)
    expect(t.legs[3].state).toBe('suppressed')
    expect(t.legs[3].value).toBeNull()
    expect(t.legs[3].tested).toBeNull()
    expect(t.netChange).toBeNull()
    expect(t.netChangeUnavailable).toBe('end-suppressed')
    expect(t.direction).toBe('unknown')
    // The secondary figure is available, but it is LABELLED with the two grades
    // it actually spans — never presented as the 2→5 number.
    expect(t.observedChange).toEqual({ value: 6, fromGrade: '2', toGrade: '4', spanGrades: 2 })
  })

  it('a suppressed row is emptied here too, even if a caller hands us an ungated one', () => {
    const leaky = rows.map((r) =>
      r.schoolYear === 2023 && r.gradeLevel === '2' ? nrt('a', 2023, '2', 88, { suppressed: true, testedCount: 3 }) : r,
    )
    const t = cohortTrajectories(leaky, { window: 4, endYear: 2026, schoolIds: ['a'], focusSchoolId: 'a' })[0]
    expect(t.legs[0].value).toBeNull()
    expect(t.legs[0].tested).toBeNull()
    expect(t.legs[0].state).toBe('suppressed')
    expect(t.netChangeUnavailable).toBe('start-suppressed')
  })

  it('a series the school never reported is ‘not-reported’, which is NOT suppression', () => {
    const withSubjects = rows.map((r) =>
      r.schoolYear === 2024 ? { ...r, sectionAverages: null } : { ...r, sectionAverages: { reading: 70 } },
    )
    const t = cohortTrajectories(withSubjects, {
      window: 4,
      endYear: 2026,
      schoolIds: ['a'],
      focusSchoolId: 'a',
      series: 'reading',
    })[0]
    expect(t.legs[1].state).toBe('not-reported')
    expect(t.legs[1].value).toBeNull()
    expect(t.legs[0].state).toBe('observed')
  })

  it('direction follows MATERIALITY, not the sign: +3 percentile points is ‘held’', () => {
    const flat = [nrt('a', 2025, '4', 60), nrt('a', 2026, '5', 63)]
    const t = cohortTrajectories(flat, { window: 2, endYear: 2026, schoolIds: ['a'], focusSchoolId: 'a' })[0]
    expect(t.netChange).toBe(3)
    expect(t.direction).toBe('held')
  })
})

// ── 7: WEIGHTING ─────────────────────────────────────────────────────────────

describe('cohorts — every leg reports the statistic it actually used', () => {
  const rows = [
    nrt('a', 2025, '4', 90, { testedCount: 12 }),
    nrt('a', 2026, '5', 92, { testedCount: 12 }),
    nrt('b', 2025, '4', 50, { testedCount: 300 }),
    nrt('b', 2026, '5', 52, { testedCount: 300 }),
  ]

  it('(7) legs are TESTER-weighted, so a twelve-tester school cannot swing the network', () => {
    const ts = cohortTrajectories(rows, {
      window: 2,
      endYear: 2026,
      schoolIds: ['a', 'b'],
      focusSchoolId: 'a',
      gradeSpan: { low: 4, high: 5 },
    })
    expect(ts).toHaveLength(2)
    const summary = cohortTrajectorySummary(ts, { family: 'nrt', scoreType: 'percentile' })
    expect(summary.legs).toHaveLength(2)
    expect(summary.legs[0].weighting).toBe('tester-weighted')
    // (90×12 + 50×300) / 312 = 51.538… — not the 70 a mean of means gives.
    expect(summary.legs[0].value).toBeCloseTo((90 * 12 + 50 * 300) / 312, 6)
    expect(summary.legs[0].value).not.toBeCloseTo(70, 3)
    expect(summary.legs[0].tested).toBe(312)
    expect(summary.change).toBeCloseTo(
      (92 * 12 + 52 * 300) / 312 - (90 * 12 + 50 * 300) / 312,
      6,
    )
    expect(summary.schools).toBe(2)
  })

  it('a leg missing a tester count SAYS ‘simple’ rather than presenting a different statistic', () => {
    const noCount = rows.map((r) => (r.schoolId === 'b' && r.schoolYear === 2025 ? { ...r, testedCount: null } : r))
    const ts = cohortTrajectories(noCount, {
      window: 2,
      endYear: 2026,
      schoolIds: ['a', 'b'],
      focusSchoolId: 'a',
      gradeSpan: { low: 4, high: 5 },
    })
    const summary = cohortTrajectorySummary(ts, { family: 'nrt', scoreType: 'percentile' })
    expect(summary.legs[0].weighting).toBe('simple')
    expect(summary.legs[0].value).toBe(70)
    // The OTHER leg still has its counts and is still weighted — no blended
    // "trajectory average" hides one inside the other.
    expect(summary.legs[1].weighting).toBe('tester-weighted')
  })
})

// ── 8: COHORT IDENTITY ───────────────────────────────────────────────────────

describe('cohorts — identity is year minus grade, so re-anchoring finds the same children', () => {
  const rows = grid('a', [2022, 2023, 2024, 2025, 2026], ['1', '2', '3', '4', '5'])

  it('(8) the same cohort reappears one grade earlier when the end year moves back', () => {
    expect(cohortIdOf(2023, '2')).toBe(cohortIdOf(2026, '5'))

    const at2026 = cohortTrajectories(rows, { window: 4, endYear: 2026, schoolIds: ['a'], focusSchoolId: 'a' })
    const panel2026 = at2026.find((t) => t.startGrade === '2' && t.endGrade === '5')
    expect(panel2026).toBeDefined()

    const at2025 = cohortTrajectories(rows, { window: 4, endYear: 2025, schoolIds: ['a'], focusSchoolId: 'a' })
    const panel2025 = at2025.find((t) => t.cohortId === (panel2026 as { cohortId: number }).cohortId)
    expect(panel2025).toBeDefined()
    expect(panel2025?.startGrade).toBe('1')
    expect(panel2025?.endGrade).toBe('4')
  })
})

// ── 9: TOTAL BATTERY ─────────────────────────────────────────────────────────

describe('cohorts — Total Battery is the publisher’s composite, not a row average', () => {
  const rows = [
    nrt('a', 2025, '4', 70, { sectionAverages: { reading: 80, math: 50 } }),
    nrt('a', 2026, '5', 74, { sectionAverages: { reading: 84, math: 54 } }),
  ]

  it('(9) the total series reads avgComposite and never the mean of the subject columns', () => {
    const total = cohortTrajectories(rows, {
      window: 2,
      endYear: 2026,
      schoolIds: ['a'],
      focusSchoolId: 'a',
      series: COHORT_TOTAL_SERIES,
    })[0]
    expect(total.legs[0].value).toBe(70)
    expect(total.legs[0].value).not.toBe(65) // (80 + 50) / 2 — the wrong answer
    const reading = cohortTrajectories(rows, {
      window: 2,
      endYear: 2026,
      schoolIds: ['a'],
      focusSchoolId: 'a',
      series: 'reading',
    })[0]
    expect(reading.legs[0].value).toBe(80)
    expect(reading.netChange).toBe(4)
  })

  it('the composite column is named by the FAMILY — "Total Battery" is a TerraNova word', () => {
    expect(compositeSeriesLabel('nrt')).toBe('Total Battery')
    expect(compositeSeriesLabel('act')).toBe('ACT Composite')
    expect(compositeSeriesLabel('sat')).toBe('SAT Total')
    expect(compositeSeriesLabel(undefined)).toBe('Composite')

    // And the matrix carries that label, so the web reads it rather than
    // typing 'Total Battery' over a 1–36 chart.
    const act = cohortMatrix(rows, {
      schoolId: 'a',
      window: 2,
      endYear: 2026,
      series: [COHORT_TOTAL_SERIES, 'reading'],
      family: 'act',
    })
    expect(act.series[0]).toEqual({ key: 'total', label: 'ACT Composite' })
    const nrtMatrix = cohortMatrix(rows, {
      schoolId: 'a',
      window: 2,
      endYear: 2026,
      series: [COHORT_TOTAL_SERIES, 'reading'],
      family: 'nrt',
    })
    expect(nrtMatrix.series[0]).toEqual({ key: 'total', label: 'Total Battery' })
  })
})

// ── 10: MATRIX ───────────────────────────────────────────────────────────────

describe('cohorts — the matrix is one traversal and agrees with the panels', () => {
  const rows = grid('a', [2023, 2024, 2025, 2026], ['2', '3', '4', '5'], (y) => 60 + (y - 2023) * 3).map((r) => ({
    ...r,
    sectionAverages: { reading: (r.avgComposite as number) + 10, math: (r.avgComposite as number) - 8 },
  }))

  it('(10) every cell equals the trajectory that series would produce on its own', () => {
    const opts = { window: 4 as const, endYear: 2026, gradeSpan: { low: 2, high: 5 } }
    const matrix = cohortMatrix(rows, { ...opts, schoolId: 'a', series: [COHORT_TOTAL_SERIES, 'reading', 'math'] })
    expect(matrix.seriesBasis).toBe('reported-composite')
    expect(matrix.cohorts).toHaveLength(1)
    expect(matrix.cohorts[0].label).toBe('Grades 2 → 5')
    expect(matrix.cells).toHaveLength(3)

    for (const series of [COHORT_TOTAL_SERIES, 'reading', 'math']) {
      const solo = cohortTrajectories(rows, { ...opts, schoolIds: ['a'], focusSchoolId: 'a', series })[0]
      const cell = matrix.cells.find((c) => c.series === series && c.cohortKey === matrix.cohorts[0].key)
      expect(cell, `no cell for ${series}`).toBeDefined()
      expect(cell?.netChange).toBe(solo.netChange)
      expect(cell?.direction).toBe(solo.direction)
      expect(cell?.startValue).toBe(solo.legs[0].value)
      expect(cell?.endValue).toBe(solo.legs[3].value)
      expect(cell?.startState).toBe(solo.legs[0].state)
      expect(cell?.endState).toBe(solo.legs[3].state)
    }
  })

  it('the matrix never reaches past the focus school', () => {
    const withPeer = [...rows, ...grid('b', [2023, 2024, 2025, 2026], ['2', '3', '4', '5'], () => 99)]
    const matrix = cohortMatrix(withPeer, {
      window: 4,
      endYear: 2026,
      schoolId: 'a',
      series: [COHORT_TOTAL_SERIES],
      gradeSpan: { low: 2, high: 5 },
    })
    expect(matrix.cells).toHaveLength(1)
    expect(matrix.cells[0].endValue).toBe(69)
  })
})

// ── 11-12: THE GRADE-KEY TRAPS ───────────────────────────────────────────────

describe('cohorts — grades are matched by RANK, never by the string a school typed', () => {
  it('(11) a school storing ‘PK’ still fills the PK4 leg, and keeps its own spelling', () => {
    expect(gradeRankOf('PK')).toBe(gradeRankOf('PK4'))
    expect(gradeKeyOfRank(-1)).toBe('PK4')
    expect(gradeKeyOfRank(0)).toBe('K')
    expect(gradeKeyOfRank(13)).toBeNull()

    const rows = [
      nrt('p', 2023, 'PK', 55),
      nrt('p', 2024, 'K', 58),
      nrt('p', 2025, '1', 62),
      nrt('p', 2026, '2', 66),
    ]
    const ts = cohortTrajectories(rows, { window: 4, endYear: 2026, schoolIds: ['p'], focusSchoolId: 'p' })
    expect(ts).toHaveLength(1)
    const t = ts[0]
    expect(t.legs.map((l) => l.gradeRank)).toEqual([-1, 0, 1, 2])
    expect(t.legs[0].gradeLevel).toBe('PK') // the school’s own spelling survives
    expect(t.legs[0].value).toBe(55)
    expect(t.legs.every((l) => l.state === 'observed')).toBe(true)
    expect(t.netChange).toBe(11)
  })

  it('(12) a whole-school ‘all’ row can never become a leg', () => {
    const rows = [
      ...grid('a', [2025, 2026], ['4', '5']),
      nrt('a', 2025, 'all', 99, { testedCount: 900 }),
      nrt('a', 2026, 'all', 99, { testedCount: 900 }),
    ]
    const span = cohortSpanOf(rows, ['a'])
    expect(span.gradesOnFile).toEqual(['4', '5'])
    const ts = cohortTrajectories(rows, { window: 2, endYear: 2026, schoolIds: ['a'], focusSchoolId: 'a' })
    expect(ts).toHaveLength(1)
    expect(ts[0].legs.every((l) => l.value === 60)).toBe(true)
    expect(ts[0].legs.every((l) => l.tested === 40)).toBe(true)
  })
})

// ── 13: AGREEMENT WITH THE TWO-LEG ENGINE ────────────────────────────────────

describe('cohorts — the four-leg engine does not disagree with the two-leg one', () => {
  const rows = [
    nrt('a', 2025, '3', 82, { testedCount: 30 }),
    nrt('a', 2026, '4', 86, { testedCount: 30 }),
    nrt('b', 2025, '3', 70, { testedCount: 20 }),
    nrt('b', 2026, '4', 60, { testedCount: 20 }),
    nrt('c', 2025, '3', 65, { testedCount: 25 }),
    nrt('c', 2026, '4', 66, { testedCount: 25 }),
  ]

  it('(13) at a two-grade span the numbers and the directions match cohortMovements exactly', () => {
    const moves = cohortMovements(rows, { currentYear: 2026, currentGrade: '4' })
    const ts = cohortTrajectories(rows, {
      window: 2,
      endYear: 2026,
      endGrades: ['4'],
      schoolIds: ['a', 'b', 'c'],
      focusSchoolId: 'a',
      gradeSpan: { low: 3, high: 4 },
    })
    expect(ts).toHaveLength(moves.length)
    for (const m of moves) {
      const t = ts.find((x) => x.schoolId === m.schoolId)
      expect(t, `no trajectory for ${m.schoolId}`).toBeDefined()
      expect(t?.netChange).toBe(m.change)
      expect(t?.direction).toBe(m.direction)
      expect(t?.legs[0].value).toBe(m.prior?.value ?? null)
      expect(t?.legs[1].value).toBe(m.current?.value ?? null)
      expect(t?.legs[0].tested).toBe(m.prior?.tested ?? null)
    }
  })
})

// ── 14: DETERMINISM ──────────────────────────────────────────────────────────

describe('cohorts — the same rows in a different order draw the same chart', () => {
  it('(14) shuffling the input changes nothing about the output', () => {
    const rows = [
      ...grid('a', [2023, 2024, 2025, 2026], ['2', '3', '4', '5'], (y) => 60 + (y - 2023)),
      ...grid('b', [2023, 2024, 2025, 2026], ['2', '3', '4', '5'], (y) => 70 - (y - 2023)),
    ]
    const opts = {
      window: 4 as const,
      endYear: 2026,
      schoolIds: ['a', 'b'],
      focusSchoolId: 'a',
      gradeSpan: { low: 2, high: 5 },
    }
    // A fixed, seedless shuffle: reverse, then rotate by a prime.
    const shuffled = [...rows].reverse()
    shuffled.push(...shuffled.splice(0, 7))

    expect(JSON.stringify(cohortTrajectories(shuffled, opts))).toBe(JSON.stringify(cohortTrajectories(rows, opts)))
    expect(
      JSON.stringify(cohortMatrix(shuffled, { ...opts, schoolId: 'a', series: [COHORT_TOTAL_SERIES] })),
    ).toBe(JSON.stringify(cohortMatrix(rows, { ...opts, schoolId: 'a', series: [COHORT_TOTAL_SERIES] })))
  })

  it('a duplicate row resolves to the same winner whichever order it arrives in', () => {
    const base = grid('a', [2025, 2026], ['4', '5'])
    const dupes = [
      ...base,
      nrt('a', 2026, '5', null, { testType: 'aspire', testedCount: 900 }),
      nrt('a', 2026, '5', 61, { testType: 'aspire', testedCount: 41 }),
    ]
    const opts = { window: 2 as const, endYear: 2026, schoolIds: ['a'], focusSchoolId: 'a' }
    const forward = cohortTrajectories(dupes, opts)[0]
    const backward = cohortTrajectories([...dupes].reverse(), opts)[0]
    // The larger reported cohort wins; the blank never does.
    expect(forward.legs[1].value).toBe(61)
    expect(JSON.stringify(forward)).toBe(JSON.stringify(backward))
  })

  it('the focus school is always the first trajectory of its cohort', () => {
    const rows = [
      ...grid('z', [2025, 2026], ['4', '5']),
      ...grid('a', [2025, 2026], ['4', '5']),
    ]
    const ts = cohortTrajectories(rows, {
      window: 2,
      endYear: 2026,
      schoolIds: ['a', 'z'],
      focusSchoolId: 'z',
      gradeSpan: { low: 4, high: 5 },
    })
    expect(ts[0].schoolId).toBe('z')
    expect(ts[0].isFocus).toBe(true)
    expect(ts[1].isFocus).toBe(false)
    // Anonymisation rewrites `label`, so a peer line must be keyed on it.
    expect(ts[1].label).toBe('School A')
  })
})

// Review-caught: `change` must subtract LIKE FROM LIKE. A leg missing a tested
// count falls back to a simple mean; differencing it against a tester-weighted
// leg is two different statistics subtracted, and it flipped the sign (-16.5
// published where the comparable figure was +2.0).
describe('cohortTrajectorySummary — change compares like with like', () => {
  it('withholds change when the endpoint legs are different statistics', () => {
    const rows = [
      nrt('a', 2025, '2', 70, { testedCount: null }),
      nrt('b', 2025, '2', 70, { testedCount: 10 }),
      nrt('a', 2026, '3', 50, { testedCount: 90 }),
      nrt('b', 2026, '3', 80, { testedCount: 10 }),
    ]
    const ts = cohortTrajectories(rows, { window: 2, endYear: 2026 })
    const summary = cohortTrajectorySummary(ts)
    expect(summary.legs[0]!.weighting).toBe('simple')
    expect(summary.legs[1]!.weighting).toBe('tester-weighted')
    expect(summary.changeComparable).toBe(false)
    expect(summary.change).toBeNull()
    expect(summary.changeWeighting).toBeNull()
  })

  it('publishes change when both endpoints share a weighting', () => {
    const rows = [
      nrt('a', 2025, '2', 50, { testedCount: 10 }),
      nrt('a', 2026, '3', 58, { testedCount: 10 }),
    ]
    const summary = cohortTrajectorySummary(cohortTrajectories(rows, { window: 2, endYear: 2026 }))
    expect(summary.changeComparable).toBe(true)
    expect(summary.changeWeighting).toBe('tester-weighted')
    expect(summary.change).toBe(8)
  })
})
