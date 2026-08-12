import { describe, it, expect } from 'vitest'
import { METRIC_KEYS, METRIC_REGISTRY, METRIC_META } from '../src/index.js'
import {
  ACT_BENCHMARKS,
  anonymizePeers,
  availableCohorts,
  averageOf,
  buildAssessmentInsight,
  cohortIdOf,
  cohortMovements,
  cohortSummary,
  compareToPeer,
  distributionOf,
  gradeHeatmap,
  isForthcoming,
  materialGap,
  movements,
  nationalReference,
  objectiveStandings,
  participationOf,
  peerAverage,
  rankOf,
  rankSchools,
  strengthsAndOpportunities,
  subjectComparisons,
  suppressSmallCell,
  systemInsights,
  trendDirection,
  trendSeries,
  yoyChange,
  type AssessmentRow,
  type ObjectiveRow,
} from '../src/index.js'

/** A norm-referenced (TerraNova-shaped) row: national percentiles by subject. */
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
    ...extra,
  }
}

describe('academics — weighting', () => {
  it('averages by TESTERS, not by school (a small school cannot swing the network)', () => {
    // One 12-tester school at 90 and one 300-tester school at 50. The mean of
    // means is 70; the tester-weighted answer is close to 51.5. Only the second
    // describes the children.
    const rows = [
      nrt('small', 2026, 'all', 90, { testedCount: 12 }),
      nrt('big', 2026, 'all', 50, { testedCount: 300 }),
    ]
    const avg = averageOf(rows)
    expect(avg.weighting).toBe('tester-weighted')
    expect(avg.value).toBeCloseTo((90 * 12 + 50 * 300) / 312, 6)
    expect(avg.value as number).toBeLessThan(55)
    expect(avg.tested).toBe(312)
  })

  it('falls back to a simple mean when counts are missing — and SAYS so', () => {
    const avg = averageOf([nrt('a', 2026, 'all', 60), nrt('b', 2026, 'all', 80)])
    expect(avg.value).toBe(70)
    expect(avg.weighting).toBe('simple')
    expect(avg.tested).toBeNull()
  })

  it('a partially-counted set does not silently mix weighted and unweighted rows', () => {
    const avg = averageOf([
      nrt('a', 2026, 'all', 60, { testedCount: 100 }),
      nrt('b', 2026, 'all', 80), // no count
    ])
    expect(avg.weighting).toBe('simple')
    expect(avg.value).toBe(70)
  })

  it('peerAverage EXCLUDES the focus school — the honest denominator', () => {
    const rows = [
      nrt('focus', 2026, 'all', 90),
      nrt('b', 2026, 'all', 50),
      nrt('c', 2026, 'all', 60),
    ]
    expect(peerAverage(rows, { excludeSchoolId: 'focus' }).value).toBe(55)
    expect(peerAverage(rows).value).toBeCloseTo(66.667, 2)
  })
})

describe('academics — ranking and standing', () => {
  const rows = [
    nrt('a', 2026, 'all', 72),
    nrt('b', 2026, 'all', 65),
    nrt('c', 2026, 'all', 81),
    nrt('d', 2026, 'all', null),
  ]

  it('ranks best-first and reports "n of m" excluding unscored schools', () => {
    const ranked = rankSchools(rows)
    expect(ranked.slice(0, 3).map((r) => r.schoolId)).toEqual(['c', 'a', 'b'])
    expect(rankOf(rows, 'a')).toEqual({ rank: 2, of: 3 })
    expect(rankOf(rows, 'd').rank).toBeNull()
  })

  it('ties share the earlier rank (competition ranking)', () => {
    const tied = [nrt('a', 2026, 'all', 70), nrt('b', 2026, 'all', 70), nrt('c', 2026, 'all', 60)]
    const ranked = rankSchools(tied)
    expect(ranked[0].rank).toBe(1)
    expect(ranked[1].rank).toBe(1)
    expect(ranked[2].rank).toBe(3)
  })

  it('a gap smaller than the material threshold reads as "average", not a finding', () => {
    const peer = averageOf([nrt('b', 2026, 'all', 60), nrt('c', 2026, 'all', 60)])
    expect(compareToPeer(62, peer, 'nrt', 'percentile').standing).toBe('average')
    expect(compareToPeer(66, peer, 'nrt', 'percentile').standing).toBe('strong')
    expect(compareToPeer(54, peer, 'nrt', 'percentile').standing).toBe('below')
  })

  it('material gaps differ by family — half an ACT point, twenty SAT points', () => {
    expect(materialGap('act', 'scale')).toBe(0.5)
    expect(materialGap('sat', 'scale')).toBe(20)
    expect(materialGap('nrt', 'percentile')).toBe(5)
  })
})

describe('academics — subject + grade comparison', () => {
  const focus = nrt('focus', 2026, 'all', 70, {
    sectionAverages: { reading: 72, math: 65, language: 74, science: 67 },
  })
  const peers = [
    nrt('b', 2026, 'all', 68, { sectionAverages: { reading: 68, math: 69, language: 70, science: 66 } }),
    nrt('c', 2026, 'all', 68, { sectionAverages: { reading: 68, math: 69, language: 70, science: 66 } }),
  ]

  it('produces the executive snapshot row per subject with peer + variance', () => {
    const out = subjectComparisons(focus, [focus, ...peers], ['reading', 'math', 'language', 'science'], {
      excludeSchoolId: 'focus',
    })
    const byKey = Object.fromEntries(out.map((s) => [s.subject, s]))
    expect(byKey.reading.variance).toBe(4)
    expect(byKey.math.variance).toBe(-4)
    expect(byKey.math.standing).toBe('average') // 4 < the 5-point material gap
    expect(byKey.language.variance).toBe(4)
  })

  it('compares each grade against THE SAME grade elsewhere, never a school average', () => {
    const school = [
      nrt('focus', 2026, '3', 80, { sectionAverages: { math: 80 }, testedCount: 40 }),
      nrt('focus', 2026, '5', 50, { sectionAverages: { math: 50 }, testedCount: 40 }),
    ]
    const peerRows = [
      nrt('b', 2026, '3', 60, { sectionAverages: { math: 60 }, testedCount: 40 }),
      nrt('b', 2026, '5', 60, { sectionAverages: { math: 60 }, testedCount: 40 }),
    ]
    const cells = gradeHeatmap(school, [...school, ...peerRows], ['math'], { excludeSchoolId: 'focus' })
    const g3 = cells.find((c) => c.grade === '3')
    const g5 = cells.find((c) => c.grade === '5')
    expect(g3?.standing).toBe('strong')
    expect(g5?.standing).toBe('below')
  })

  it('suppresses a cell thinner than the floor rather than printing it', () => {
    const school = [nrt('focus', 2026, '3', 80, { sectionAverages: { math: 80 }, testedCount: 3 })]
    const cells = gradeHeatmap(school, school, ['math'])
    expect(cells[0].suppressed).toBe(true)
    expect(cells[0].value).toBeNull()
  })

  it('suppressSmallCell passes a zero count through (no data is not a thin cell)', () => {
    expect(suppressSmallCell(10, 0).suppressed).toBe(false)
    expect(suppressSmallCell(10, 4).suppressed).toBe(true)
    expect(suppressSmallCell(10, 5).suppressed).toBe(false)
  })
})

describe('academics — longitudinal cohorts', () => {
  // The same children: 3rd grade in 2025 → 4th grade in 2026.
  const rows = [
    nrt('a', 2025, '3', 82, { testedCount: 30 }),
    nrt('a', 2026, '4', 86, { testedCount: 30 }),
    nrt('b', 2025, '3', 70, { testedCount: 20 }),
    nrt('b', 2026, '4', 60, { testedCount: 20 }),
    nrt('c', 2025, '3', 65, { testedCount: 25 }),
    nrt('c', 2026, '4', 66, { testedCount: 25 }),
  ]

  it('identifies a cohort by year minus grade, so the same children match across years', () => {
    expect(cohortIdOf(2025, '3')).toBe(cohortIdOf(2026, '4'))
    expect(cohortIdOf(2025, '3')).not.toBe(cohortIdOf(2026, '5'))
    expect(cohortIdOf(2026, 'all')).toBeNull()
  })

  it('follows each school cohort from prior grade to current grade', () => {
    const moves = cohortMovements(rows, { currentYear: 2026, currentGrade: '4' })
    const byId = Object.fromEntries(moves.map((m) => [m.schoolId, m]))
    expect(byId.a.prior?.value).toBe(82)
    expect(byId.a.current?.value).toBe(86)
    expect(byId.a.change).toBe(4)
    expect(byId.a.direction).toBe('held') // 4 < the 5-point material gap
    expect(byId.b.change).toBe(-10)
    expect(byId.b.direction).toBe('declined')
  })

  it('summarises the cohort for the header cards', () => {
    const summary = cohortSummary(cohortMovements(rows, { currentYear: 2026, currentGrade: '4' }))
    expect(summary.declined).toBe(1)
    expect(summary.priorAverage.weighting).toBe('tester-weighted')
    expect(summary.change).not.toBeNull()
  })

  it('offers only cohorts that can actually be followed (a prior leg exists)', () => {
    const withOrphan = [...rows, nrt('a', 2026, '2', 75)] // grade 2 is new this year
    const cohorts = availableCohorts(withOrphan)
    expect(cohorts.some((c) => c.currentGrade === '4')).toBe(true)
    expect(cohorts.some((c) => c.currentGrade === '2')).toBe(false)
  })

  it('a cohort is NOT the same as year-over-year movement of a grade', () => {
    // Grade 4 in 2026 vs grade 4 in 2025 — different children.
    const gradeRows = [...rows, nrt('a', 2025, '4', 40, { testedCount: 30 })]
    const cohort = cohortMovements(gradeRows, { currentYear: 2026, currentGrade: '4' }).find((m) => m.schoolId === 'a')
    const yoy = movements(gradeRows, { currentYear: 2026, gradeLevel: '4' }).find((m) => m.schoolId === 'a')
    expect(cohort?.change).toBe(4) // 3rd '25 (82) → 4th '26 (86): the same children
    expect(yoy?.change).toBe(46) // 4th '25 (40) → 4th '26 (86): different children
  })
})

describe('academics — peer anonymity', () => {
  const rows = [
    nrt('focus', 2026, 'all', 70),
    nrt('b', 2026, 'all', 85),
    nrt('c', 2026, 'all', 60),
  ]

  it('names only the focus school; peers are positional and carry no identity', () => {
    const out = anonymizePeers(rows, 'focus')
    const focus = out.find((p) => p.isFocus)
    expect(focus?.schoolName).toBe('School FOCUS')
    const others = out.filter((p) => !p.isFocus)
    expect(others.map((p) => p.label)).toEqual(['School 1', 'School 2'])
    for (const p of others) {
      expect(p.schoolName).toBeUndefined()
      expect(p.schoolId).toBeUndefined()
    }
  })

  it('still ranks by score, so the anonymised positions keep their meaning', () => {
    const out = anonymizePeers(rows, 'focus')
    expect(out.map((p) => p.value)).toEqual([85, 70, 60])
  })
})

describe('academics — reference lines and forthcoming data', () => {
  it('a national percentile has a fixed midpoint of 50; a scale score does not', () => {
    expect(nationalReference('percentile')).toBe(50)
    expect(nationalReference('nce')).toBe(50)
    expect(nationalReference('scale')).toBeNull()
  })

  it('missing data reads as FORTHCOMING when the school reported other grades', () => {
    const rows = [
      nrt('a', 2026, '3', 70),
      nrt('a', 2026, '4', 72),
      nrt('b', 2026, '8', 65), // a peer DID report grade 8
    ]
    expect(isForthcoming(rows, 'a', 2026, '8')).toBe(true)
  })

  it('does not claim "forthcoming" when nobody reported that grade', () => {
    const rows = [nrt('a', 2026, '3', 70)]
    expect(isForthcoming(rows, 'a', 2026, '8')).toBe(false)
  })
})

describe('academics — trend, distribution, participation', () => {
  const school = [nrt('a', 2024, 'all', 60), nrt('a', 2025, 'all', 64), nrt('a', 2026, 'all', 70)]
  const peers = [nrt('b', 2024, 'all', 62), nrt('b', 2025, 'all', 62), nrt('b', 2026, 'all', 62)]

  it('builds a year series of school against the peers of the SAME year', () => {
    const pts = trendSeries(school, [...school, ...peers], { excludeSchoolId: 'a' })
    expect(pts.map((p) => p.schoolYear)).toEqual([2024, 2025, 2026])
    expect(pts[2].school).toBe(70)
    expect(pts[2].peer).toBe(62)
    expect(pts[2].variance).toBe(8)
  })

  it('reads direction and year-over-year change', () => {
    const pts = trendSeries(school, school)
    expect(trendDirection(pts, 'nrt', 'percentile')).toBe('improving')
    expect(yoyChange(pts)).toBe(6)
    expect(trendDirection([pts[0]], 'nrt', 'percentile')).toBe('unknown')
  })

  it('distribution reports shares that sum to one', () => {
    const row = nrt('a', 2026, 'all', 60, { distribution: { q1: 8, q2: 14, q3: 19, q4: 11 } })
    const slices = distributionOf(row, ['q1', 'q2', 'q3', 'q4'])
    expect(slices.reduce((s, x) => s + (x.share ?? 0), 0)).toBeCloseTo(1, 9)
    expect(slices[0].count).toBe(8)
  })

  it('participation flags when a comparison is NOT fair', () => {
    const focus = nrt('a', 2026, 'all', 90, { testedCount: 20, eligibleCount: 100 })
    const peers2 = [nrt('b', 2026, 'all', 70, { testedCount: 95, eligibleCount: 100 })]
    const p = participationOf(focus, [focus, ...peers2], { excludeSchoolId: 'a' })
    expect(p.rate).toBeCloseTo(0.2, 9)
    expect(p.peerRate).toBeCloseTo(0.95, 9)
    expect(p.comparable).toBe(false)
  })
})

describe('academics — objectives, insights, narrative', () => {
  const own: ObjectiveRow[] = [
    { schoolId: 'a', schoolYear: 2026, gradeLevel: '5', subject: 'math', objectiveLabel: 'Measurement', opi: 41 },
    { schoolId: 'a', schoolYear: 2026, gradeLevel: '5', subject: 'math', objectiveLabel: 'Number Sense', opi: 88 },
  ]
  const peers: ObjectiveRow[] = [
    { schoolId: 'b', schoolYear: 2026, gradeLevel: '5', subject: 'math', objectiveLabel: 'Measurement', opi: 70, testedCount: 30 },
    { schoolId: 'b', schoolYear: 2026, gradeLevel: '5', subject: 'math', objectiveLabel: 'Number Sense', opi: 72, testedCount: 30 },
  ]

  it('stands each objective against the SAME objective at peer schools', () => {
    const standings = objectiveStandings(own, peers)
    const byLabel = Object.fromEntries(standings.map((s) => [s.objectiveLabel, s]))
    expect(byLabel.Measurement.variance).toBe(-29)
    expect(byLabel.Measurement.standing).toBe('below')
    expect(byLabel['Number Sense'].standing).toBe('strong')
  })

  it('splits into the two lists a principal can act on', () => {
    const { strengths, opportunities } = strengthsAndOpportunities(objectiveStandings(own, peers), 1)
    expect(strengths[0].objectiveLabel).toBe('Number Sense')
    expect(opportunities[0].objectiveLabel).toBe('Measurement')
  })

  it('reports the network top, bottom and spread', () => {
    const insights = systemInsights([nrt('a', 2026, 'all', 81), nrt('b', 2026, 'all', 65), nrt('c', 2026, 'all', 72)])
    expect(insights.top?.schoolId).toBe('a')
    expect(insights.bottom?.schoolId).toBe('b')
    expect(insights.spread).toBe(16)
  })

  it('writes a narrative that states rank, the widest gap, direction and fairness', () => {
    const peerAvg = averageOf([nrt('b', 2026, 'all', 70), nrt('c', 2026, 'all', 70)])
    const text = buildAssessmentInsight({
      schoolName: 'All Souls',
      family: 'nrt',
      scoreType: 'percentile',
      rank: { rank: 4, of: 5 },
      overall: compareToPeer(60, peerAvg, 'nrt', 'percentile'),
      subjects: [
        { subject: 'math', value: 51, peer: 73, variance: -22, standing: 'below', weighting: 'simple' },
        { subject: 'reading', value: 80, peer: 70, variance: 10, standing: 'strong', weighting: 'simple' },
      ],
      trend: 'declining',
      participation: { rate: 0.95, tested: 95, eligible: 100, peerRate: 0.93, comparable: true },
    })
    expect(text).toContain('ranks 4 of 5')
    expect(text).toContain('below the network average')
    expect(text).toContain('math')
    expect(text).toContain('-22')
    expect(text).toContain('declined')
    expect(text).toContain('fair')
  })

  it('never invents a benchmark for a norm-referenced test', () => {
    expect(ACT_BENCHMARKS.math).toBe(22)
    // NRT benchmark table is deliberately absent — the percentile IS the comparison.
    expect(nationalReference('percentile')).toBe(50)
  })
})

describe('academics — registry wiring', () => {
  it('the four academics keys are appended LAST, leaving every prior key in place', () => {
    // Absolute positions, not "from the end": the next domain to land must not be
    // able to renumber these by appending after them.
    expect(METRIC_KEYS.slice(21, 25)).toEqual([
      'act_composite',
      'sat_total',
      'benchmark_attainment',
      'assessment_participation_rate',
    ])
    expect(METRIC_KEYS).toHaveLength(25)
  })

  it('every academics metric declares the domain and recomputes from components', () => {
    for (const key of ['act_composite', 'sat_total', 'benchmark_attainment', 'assessment_participation_rate'] as const) {
      const def = METRIC_REGISTRY[key]
      expect(def.domain).toBe('academics')
      // Tester-weighted org rollup depends on this: summing components then
      // applying the formula, never averaging school averages.
      expect(def.scopeAggregation).toBe('recompute-from-components')
      expect(def.goodDirection).toBe('higher')
      expect(METRIC_META.find((m) => m.key === key)?.domain).toBe('academics')
    }
  })

  it('a school with no testers gets available:false, never a fabricated zero', () => {
    const out = METRIC_REGISTRY.act_composite.compute(
      {} as never,
      undefined,
      { actScoreSum: 0, actTestedCount: 0 } as never,
    )
    expect(out.available).toBe(false)
    expect(out.value).toBeNull()
    expect(out.inputsMissing).toContain('actTestedCount')
  })

  it('org scope is Σscore ÷ Σtested — a small school cannot swing the network', () => {
    // 12 testers at 30 avg (sum 360) + 300 testers at 20 avg (sum 6000).
    const out = METRIC_REGISTRY.act_composite.compute(
      {} as never,
      undefined,
      { actScoreSum: 6360, actTestedCount: 312 } as never,
    )
    expect(out.value).toBeCloseTo(6360 / 312, 9)
    expect(out.value as number).toBeLessThan(21) // NOT the 25 a mean-of-means gives
  })

  it('benchmark attainment counts only students with a determination', () => {
    const out = METRIC_REGISTRY.benchmark_attainment.compute(
      {} as never,
      undefined,
      { benchmarkMetCount: 30, benchmarkTestedCount: 60 } as never,
    )
    expect(out.value).toBe(0.5)
  })

  it('participation sums both exams when a school runs ACT and SAT', () => {
    const out = METRIC_REGISTRY.assessment_participation_rate.compute(
      {} as never,
      undefined,
      { actTestedCount: 40, satTestedCount: 20, assessmentEligibleCount: 100 } as never,
    )
    expect(out.value).toBeCloseTo(0.6, 9)
  })
})
