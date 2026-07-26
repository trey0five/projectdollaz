import { describe, expect, it } from 'vitest'
import {
  BELOW_THRESHOLD_LABEL,
  bandForIndex,
  computeAssurances,
  computeGaps,
  computeTargetGap,
  normalizeRubricScore,
  schoolReadiness,
  standardReadiness,
  type ReadinessLeafInput,
  type StatusBand,
} from '../src/accreditation-readiness.js'

const COGNIA_BANDS: StatusBand[] = [
  { min: 240, label: 'Accredited Needing Improvement' },
  { min: 280, label: 'Accredited' },
  { min: 320, label: 'Accredited with Merit' },
  { min: 360, label: 'Accredited with Distinction' },
]
const COGNIA_FW = { indexMin: 100, indexMax: 400, statusBands: COGNIA_BANDS }

function leaf(over: Partial<ReadinessLeafInput> & { standardId: string }): ReadinessLeafInput {
  return { code: over.standardId, title: `T ${over.standardId}`, rubricScore: null, evidenceCount: 0, ...over }
}

describe('standardReadiness (70% rubric + 30% evidence)', () => {
  it('unscored + no evidence = 0', () => {
    expect(standardReadiness({ rubricScore: null, evidenceCount: 0 })).toBe(0)
  })
  it('unscored but evidenced = 30 (the "score it" nudge)', () => {
    expect(standardReadiness({ rubricScore: null, evidenceCount: 2 })).toBe(30)
  })
  it('score 1 (Insufficient) = 0 rubric progress', () => {
    expect(standardReadiness({ rubricScore: 1, evidenceCount: 0 })).toBe(0)
    expect(standardReadiness({ rubricScore: 1, evidenceCount: 1 })).toBe(30)
  })
  it('score 3 with evidence = 77 (round(0.7·2/3·100 + 30))', () => {
    expect(standardReadiness({ rubricScore: 3, evidenceCount: 1 })).toBe(77)
  })
  it('score 4 with evidence = 100', () => {
    expect(standardReadiness({ rubricScore: 4, evidenceCount: 1 })).toBe(100)
  })
  it('out-of-range score is treated as unscored', () => {
    expect(standardReadiness({ rubricScore: 7, evidenceCount: 1 })).toBe(30)
    expect(normalizeRubricScore(0)).toBeNull()
    expect(normalizeRubricScore(2.5)).toBeNull()
    expect(normalizeRubricScore(2)).toBe(2)
  })
})

describe('bandForIndex', () => {
  it('picks the highest band whose min <= index', () => {
    expect(bandForIndex(COGNIA_BANDS, 300)).toBe('Accredited')
    expect(bandForIndex(COGNIA_BANDS, 240)).toBe('Accredited Needing Improvement')
    expect(bandForIndex(COGNIA_BANDS, 400)).toBe('Accredited with Distinction')
  })
  it('below every band → below-threshold label; empty bands → below-threshold', () => {
    expect(bandForIndex(COGNIA_BANDS, 200)).toBe(BELOW_THRESHOLD_LABEL)
    expect(bandForIndex([], 300)).toBe(BELOW_THRESHOLD_LABEL)
  })
})

describe('schoolReadiness — the worked Cognia example (frozen)', () => {
  // 30 leaves all rubricScore 3 with evidence → per-leaf 77, index 300
  // "Accredited"; target 320 → pointGap 20, stepsToTarget ceil(20·30/100)=6.
  const leaves = Array.from({ length: 30 }, (_, i) =>
    leaf({ standardId: `s${i + 1}`, code: `COG-${i + 1}`, rubricScore: 3, evidenceCount: 1 }),
  )
  it('readinessPct 77, all scored+covered, index 300, band Accredited', () => {
    const r = schoolReadiness(leaves, COGNIA_FW)
    expect(r).toEqual({
      readinessPct: 77,
      leafCount: 30,
      scoredCount: 30,
      coveredCount: 30,
      projectedIndex: 300,
      band: 'Accredited',
    })
  })
  it('target 320 → pointGap 20, stepsToTarget 6', () => {
    expect(computeTargetGap(leaves, 300, 320)).toEqual({ pointGap: 20, stepsToTarget: 6 })
  })
})

describe('schoolReadiness — edges', () => {
  it('no leaves → all zeros, index/band null', () => {
    expect(schoolReadiness([], COGNIA_FW)).toEqual({
      readinessPct: 0,
      leafCount: 0,
      scoredCount: 0,
      coveredCount: 0,
      projectedIndex: null,
      band: null,
    })
  })
  it('no framework / no index scale → index+band null, readiness still computed', () => {
    const leaves = [leaf({ standardId: 's1', rubricScore: 3, evidenceCount: 1 })]
    expect(schoolReadiness(leaves, null).projectedIndex).toBeNull()
    expect(schoolReadiness(leaves, { indexMin: null, indexMax: null, statusBands: [] })).toEqual(
      expect.objectContaining({ readinessPct: 77, projectedIndex: null, band: null }),
    )
  })
  it('unscored leaves count as 1 → index floors at indexMin (clamped)', () => {
    const leaves = [leaf({ standardId: 's1' }), leaf({ standardId: 's2' })]
    const r = schoolReadiness(leaves, COGNIA_FW)
    expect(r.projectedIndex).toBe(100) // mean(1,1)·100, clamped to indexMin 100
    expect(r.band).toBe(BELOW_THRESHOLD_LABEL)
    expect(r.scoredCount).toBe(0)
  })
  it('index clamps to indexMax', () => {
    const leaves = [leaf({ standardId: 's1', rubricScore: 4, evidenceCount: 1 })]
    expect(schoolReadiness(leaves, COGNIA_FW).projectedIndex).toBe(400)
  })
})

describe('computeGaps', () => {
  const leaves = [
    leaf({ standardId: 'a', code: 'COG-8', rubricScore: null, evidenceCount: 0 }), // fullLift max, evidence gap
    leaf({ standardId: 'b', code: 'COG-2', rubricScore: 2, evidenceCount: 1 }),
    leaf({ standardId: 'c', code: 'COG-1', rubricScore: 4, evidenceCount: 1 }), // fully done — excluded
    leaf({ standardId: 'd', code: 'COG-3', rubricScore: 2, evidenceCount: 0 }), // ties b on fullLift, evidenceGap first
  ]
  it('index mode: fullLift desc → evidenceGap first → code asc; fully-done excluded', () => {
    const gaps = computeGaps(leaves, true)
    expect(gaps.map((g) => g.code)).toEqual(['COG-8', 'COG-3', 'COG-2'])
    // 4 leaves → perStep 25: unscored (≙1) fullLift 75; score 2 → 50.
    expect(gaps[0]).toEqual(
      expect.objectContaining({ fullLift: 75, nextStepLift: 25, evidenceGap: true, readiness: 0 }),
    )
    expect(gaps[2]).toEqual(expect.objectContaining({ fullLift: 50, evidenceGap: false }))
  })
  it('no-index mode: lifts null; sorted score asc → evidenceGap first → code asc', () => {
    const gaps = computeGaps(leaves, false)
    expect(gaps.map((g) => g.code)).toEqual(['COG-8', 'COG-3', 'COG-2'])
    expect(gaps[0].fullLift).toBeNull()
    expect(gaps[0].nextStepLift).toBeNull()
  })
  it('caps at the limit (top 8 default)', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      leaf({ standardId: `s${i}`, code: `C-${String(i).padStart(2, '0')}` }),
    )
    expect(computeGaps(many, true)).toHaveLength(8)
    expect(computeGaps(many, true, 3)).toHaveLength(3)
  })
  it('lift rounding matches the 31-leaf Cognia shape (3.2 / 9.7)', () => {
    const thirtyOne = Array.from({ length: 31 }, (_, i) =>
      leaf({ standardId: `s${i}`, code: `COG-${i + 1}`, rubricScore: i === 0 ? 1 : 4, evidenceCount: 1 }),
    )
    const gaps = computeGaps(thirtyOne, true)
    expect(gaps[0].nextStepLift).toBe(3.2)
    expect(gaps[0].fullLift).toBe(9.7)
  })
})

describe('computeTargetGap — stepsToTarget is capped by available steps', () => {
  it('cannot exceed the total +1 steps remaining', () => {
    const leaves = [leaf({ standardId: 's1', rubricScore: 4, evidenceCount: 1 })]
    // Already at max: 0 available steps even for a huge gap.
    expect(computeTargetGap(leaves, 400, 999)).toEqual({ pointGap: 599, stepsToTarget: 0 })
  })
  it('already at/above target → zero gap, zero steps', () => {
    const leaves = [leaf({ standardId: 's1', rubricScore: 3, evidenceCount: 1 })]
    expect(computeTargetGap(leaves, 320, 280)).toEqual({ pointGap: 0, stepsToTarget: 0 })
  })
})

describe('computeAssurances', () => {
  it('satisfied = evidenceCount > 0', () => {
    expect(
      computeAssurances([
        { standardId: 'a1', code: 'COG-A2', title: 'Audit', evidenceCount: 1 },
        { standardId: 'a2', code: 'COG-A3', title: 'Safety', evidenceCount: 0 },
      ]),
    ).toEqual([
      { standardId: 'a1', code: 'COG-A2', title: 'Audit', satisfied: true },
      { standardId: 'a2', code: 'COG-A3', title: 'Safety', satisfied: false },
    ])
  })
})
