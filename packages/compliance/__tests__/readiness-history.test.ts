import { describe, expect, it } from 'vitest'
import {
  MIN_MATERIAL_DELTA_PCT,
  MIN_POINTS_FOR_DIRECTION,
  MIN_SPAN_DAYS_FOR_DIRECTION,
  READINESS_HISTORY_VERSION,
  decomposeReadinessDelta,
  diffLeafScores,
  downsampleMonthly,
  selfScoredPct,
  summarizeObservedChange,
  verifiedPct,
  type LeafScore,
  type ReadinessPoint,
  type SeriesBreak,
} from '../src/readiness-history.js'
import { schoolReadiness } from '../src/accreditation-readiness.js'

// ─────────────────────────────────────────────────────────────────────────────
// Accreditation Intelligence Phase A — the pure readiness-HISTORY engine.
//
// The contract under test is an HONESTY contract, not just an arithmetic one:
//   • the four-way decomposition must be EXACT (residual 0, always),
//   • it must never attribute points to a cause that did not happen,
//   • it must refuse to name a direction it cannot defend, and
//   • the word "trend" must never reach a user-visible string.
// ─────────────────────────────────────────────────────────────────────────────

/** Seeded PRNG (mulberry32) — the purity guard forbids Math.random in src, and
 *  a randomized property test must be reproducible on failure anyway. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function leaf(over: Partial<LeafScore> & { standardId: string }): LeafScore {
  return {
    code: over.code ?? over.standardId.toUpperCase(),
    rubricScore: over.rubricScore ?? null,
    evidenceCount: over.evidenceCount ?? 0,
    standardId: over.standardId,
  }
}

/** N leaves, all unscored with no evidence. */
function blankLeaves(n: number, prefix = 'S'): LeafScore[] {
  return Array.from({ length: n }, (_, i) =>
    leaf({ standardId: `${prefix}${i + 1}`, code: `${prefix}-${String(i + 1).padStart(2, '0')}` }),
  )
}

function point(date: string, readinessPct: number, over: Partial<ReadinessPoint> = {}): ReadinessPoint {
  return {
    date,
    readinessPct,
    selfScoredPct: readinessPct,
    verifiedPct: readinessPct,
    projectedIndex: null,
    band: null,
    leafCount: 10,
    scoredCount: 5,
    coveredCount: 5,
    ...over,
  }
}

describe('selfScoredPct / verifiedPct — the Documented / Defensible split', () => {
  it('separates the rubric term from the evidence term (never a blended figure)', () => {
    const leaves: LeafScore[] = [
      leaf({ standardId: 'a', rubricScore: 4, evidenceCount: 0 }), // documented, undefended
      leaf({ standardId: 'b', rubricScore: null, evidenceCount: 3 }), // defended, unscored
      leaf({ standardId: 'c', rubricScore: 1, evidenceCount: 1 }),
      leaf({ standardId: 'd', rubricScore: null, evidenceCount: 0 }),
    ]
    // rubric progress: 100 + 0 + 0 + 0 over 4 leaves.
    expect(selfScoredPct(leaves)).toBe(25)
    // evidence: 2 of 4 leaves carry an artifact.
    expect(verifiedPct(leaves)).toBe(50)
  })

  it('an empty leaf set is 0/0 — never NaN, never a fabricated figure', () => {
    expect(selfScoredPct([])).toBe(0)
    expect(verifiedPct([])).toBe(0)
  })

  it('an out-of-range stored score is treated as unscored, not clamped upward', () => {
    const leaves = [leaf({ standardId: 'a', rubricScore: 9 }), leaf({ standardId: 'b', rubricScore: 4 })]
    expect(selfScoredPct(leaves)).toBe(50) // 0 + 100 over 2
  })
})

describe('decomposeReadinessDelta — exactness', () => {
  it('residual is exactly 0 across 200 randomized leaf-set pairs', () => {
    const rng = makeRng(20260814)
    const pickScore = (): number | null => {
      const r = rng()
      return r < 0.25 ? null : Math.min(4, 1 + Math.floor(rng() * 4))
    }
    for (let iter = 0; iter < 200; iter += 1) {
      const universe = 4 + Math.floor(rng() * 20)
      const from: LeafScore[] = []
      const to: LeafScore[] = []
      for (let i = 0; i < universe; i += 1) {
        const id = `u${i}`
        const code = `U-${String(i).padStart(2, '0')}`
        const inFrom = rng() < 0.85
        const inTo = rng() < 0.85
        if (inFrom) {
          from.push({ standardId: id, code, rubricScore: pickScore(), evidenceCount: Math.floor(rng() * 3) })
        }
        if (inTo) {
          to.push({ standardId: id, code, rubricScore: pickScore(), evidenceCount: Math.floor(rng() * 3) })
        }
      }
      const d = decomposeReadinessDelta(from, to)
      expect(d.residual).toBe(0)
      expect(d.fromScopeChange + d.fromScoring + d.fromImprovement + d.fromEvidence).toBe(d.total)
      // The headline is the ENGINE's own delta — the parts can never drift from it.
      const engineDelta =
        schoolReadiness(to.map((l) => ({ ...l, title: '' }))).readinessPct -
        schoolReadiness(from.map((l) => ({ ...l, title: '' }))).readinessPct
      expect(d.total).toBe(engineDelta)
    }
  })

  it('displayed integer parts sum to total (largest-remainder), never off by one', () => {
    // 7 leaves: a deliberately awkward denominator for 1/7-point fractions.
    const from = [
      leaf({ standardId: 'a', rubricScore: 2, evidenceCount: 1 }),
      leaf({ standardId: 'b', rubricScore: 1 }),
      leaf({ standardId: 'c', rubricScore: null }),
      leaf({ standardId: 'd', rubricScore: 3, evidenceCount: 1 }),
      leaf({ standardId: 'e', rubricScore: null }),
      leaf({ standardId: 'f', rubricScore: 2 }),
      leaf({ standardId: 'g', rubricScore: null, evidenceCount: 2 }),
    ]
    const to = [
      leaf({ standardId: 'a', rubricScore: 3, evidenceCount: 1 }),
      leaf({ standardId: 'b', rubricScore: 2 }),
      leaf({ standardId: 'c', rubricScore: 3 }),
      leaf({ standardId: 'd', rubricScore: 4, evidenceCount: 2 }),
      leaf({ standardId: 'e', rubricScore: null, evidenceCount: 1 }),
      leaf({ standardId: 'f', rubricScore: 2 }),
      leaf({ standardId: 'g', rubricScore: 2, evidenceCount: 2 }),
    ]
    const d = decomposeReadinessDelta(from, to)
    expect(d.fromScopeChange + d.fromScoring + d.fromImprovement + d.fromEvidence).toBe(d.total)
    expect(d.residual).toBe(0)
    expect(Number.isInteger(d.total)).toBe(true)
  })
})

describe('decomposeReadinessDelta — attribution honesty', () => {
  it('raising 4 rubric scores with no evidence change is IMPROVEMENT, not scoring', () => {
    const base = [
      leaf({ standardId: 'a', rubricScore: 2, evidenceCount: 1 }),
      leaf({ standardId: 'b', rubricScore: 2, evidenceCount: 1 }),
      leaf({ standardId: 'c', rubricScore: 2, evidenceCount: 1 }),
      leaf({ standardId: 'd', rubricScore: 2, evidenceCount: 1 }),
      leaf({ standardId: 'e', rubricScore: 3, evidenceCount: 1 }),
    ]
    const to = base.map((l) =>
      ['a', 'b', 'c', 'd'].includes(l.standardId) ? { ...l, rubricScore: 3 } : l,
    )
    const d = decomposeReadinessDelta(base, to)
    expect(d.fromScopeChange).toBe(0)
    expect(d.fromScoring).toBe(0)
    expect(d.fromImprovement).toBeGreaterThan(0)
    expect(d.fromEvidence).toBe(0)
    expect(d.narrative).toContain('from actual improvement')
    expect(d.narrative).not.toContain('newly scored')
  })

  it('scoring 4 previously-unscored leaves is SCORING, not improvement — and says so', () => {
    const base = [
      leaf({ standardId: 'a', rubricScore: null, evidenceCount: 1 }),
      leaf({ standardId: 'b', rubricScore: null, evidenceCount: 1 }),
      leaf({ standardId: 'c', rubricScore: null, evidenceCount: 1 }),
      leaf({ standardId: 'd', rubricScore: null, evidenceCount: 1 }),
      leaf({ standardId: 'e', rubricScore: 3, evidenceCount: 1 }),
    ]
    const to = base.map((l) =>
      ['a', 'b', 'c', 'd'].includes(l.standardId) ? { ...l, rubricScore: 3 } : l,
    )
    const d = decomposeReadinessDelta(base, to)
    expect(d.fromScoring).toBeGreaterThan(0)
    expect(d.fromImprovement).toBe(0)
    expect(d.fromScopeChange).toBe(0)
    expect(d.fromEvidence).toBe(0)
    expect(d.narrative).toContain('from newly scored standards')
    expect(d.narrative).not.toContain('actual improvement')
  })

  it('adopting 12 more standards drives readiness DOWN via scope, and total matches the engine', () => {
    const from = [
      leaf({ standardId: 'a', rubricScore: 4, evidenceCount: 1 }),
      leaf({ standardId: 'b', rubricScore: 4, evidenceCount: 1 }),
      leaf({ standardId: 'c', rubricScore: 3, evidenceCount: 1 }),
    ]
    const to = [...from, ...blankLeaves(12, 'N')]
    const d = decomposeReadinessDelta(from, to)
    expect(d.fromScopeChange).toBeLessThan(0)
    expect(d.total).toBeLessThan(0)
    const engineDelta =
      schoolReadiness(to.map((l) => ({ ...l, title: '' }))).readinessPct -
      schoolReadiness(from.map((l) => ({ ...l, title: '' }))).readinessPct
    expect(d.total).toBe(engineDelta)
    expect(d.narrative).toContain('which standards are in scope')
  })

  it('attaching evidence only is EVIDENCE, not improvement', () => {
    const from = [
      leaf({ standardId: 'a', rubricScore: 3, evidenceCount: 0 }),
      leaf({ standardId: 'b', rubricScore: 3, evidenceCount: 0 }),
    ]
    const to = from.map((l) => ({ ...l, evidenceCount: 1 }))
    const d = decomposeReadinessDelta(from, to)
    expect(d.fromEvidence).toBe(d.total)
    expect(d.fromScoring).toBe(0)
    expect(d.fromImprovement).toBe(0)
    expect(d.narrative).toContain('from new evidence')
  })

  it('a no-op pair reports no change rather than a rounding artifact', () => {
    const same = [leaf({ standardId: 'a', rubricScore: 3, evidenceCount: 1 })]
    const d = decomposeReadinessDelta(same, same)
    expect(d).toMatchObject({
      total: 0,
      fromScopeChange: 0,
      fromScoring: 0,
      fromImprovement: 0,
      fromEvidence: 0,
      residual: 0,
    })
    expect(d.narrative).toBe('No observed change: 0 points.')
  })
})

describe('diffLeafScores', () => {
  const from = [
    leaf({ standardId: 'b2', code: 'B-2', rubricScore: 2, evidenceCount: 1 }),
    leaf({ standardId: 'a1', code: 'A-1', rubricScore: 3, evidenceCount: 0 }),
    leaf({ standardId: 'c3', code: 'C-3', rubricScore: null, evidenceCount: 2 }),
    leaf({ standardId: 'z9', code: 'Z-9', rubricScore: 1, evidenceCount: 0 }),
  ]
  const to = [
    leaf({ standardId: 'a1', code: 'A-1', rubricScore: 2, evidenceCount: 1 }), // declined + evidence gained
    leaf({ standardId: 'b2', code: 'B-2', rubricScore: 4, evidenceCount: 0 }), // improved + evidence lost
    leaf({ standardId: 'c3', code: 'C-3', rubricScore: 3, evidenceCount: 2 }), // newly scored
    leaf({ standardId: 'n1', code: 'N-1', rubricScore: null, evidenceCount: 0 }), // scope added
  ]

  it('classifies every kind of movement without overlap', () => {
    const d = diffLeafScores(from, to)
    expect(d.improved).toEqual([{ standardId: 'b2', code: 'B-2', fromScore: 2, toScore: 4 }])
    expect(d.declined).toEqual([{ standardId: 'a1', code: 'A-1', fromScore: 3, toScore: 2 }])
    expect(d.newlyScored).toEqual([{ standardId: 'c3', code: 'C-3', toScore: 3 }])
    expect(d.unscored).toEqual([])
    expect(d.evidenceGained).toEqual([
      { standardId: 'a1', code: 'A-1', fromCount: 0, toCount: 1 },
    ])
    expect(d.evidenceLost).toEqual([{ standardId: 'b2', code: 'B-2', fromCount: 1, toCount: 0 }])
    expect(d.scopeAdded).toEqual([{ standardId: 'n1', code: 'N-1' }])
    expect(d.scopeRemoved).toEqual([{ standardId: 'z9', code: 'Z-9' }])
  })

  it('is order-stable: input order does not change output order', () => {
    const a = diffLeafScores(from, to)
    const b = diffLeafScores([...from].reverse(), [...to].reverse())
    expect(b).toEqual(a)
  })

  it('scopeAdded ∪ scopeRemoved ∪ common partitions the union of both leaf sets', () => {
    const d = diffLeafScores(from, to)
    const fromIds = new Set(from.map((l) => l.standardId))
    const toIds = new Set(to.map((l) => l.standardId))
    const union = new Set([...fromIds, ...toIds])
    const common = [...union].filter((id) => fromIds.has(id) && toIds.has(id))
    const added = d.scopeAdded.map((x) => x.standardId)
    const removed = d.scopeRemoved.map((x) => x.standardId)
    expect(new Set([...added, ...removed, ...common])).toEqual(union)
    expect(added.filter((id) => removed.includes(id) || common.includes(id))).toEqual([])
    expect(removed.filter((id) => common.includes(id))).toEqual([])
  })
})

describe('summarizeObservedChange — refusing to overclaim', () => {
  it('no readings at all → insufficient_history with an honest sentence', () => {
    const c = summarizeObservedChange([], [])
    expect(c.available).toBe(false)
    expect(c.direction).toBe('insufficient_history')
    expect(c.deltaPct).toBeNull()
    expect(c.reason).toBe(
      'Readiness has not been recorded yet — tracking starts with the first reading.',
    )
  })

  it('2 points → insufficient_history (too few readings), never a direction', () => {
    const c = summarizeObservedChange(
      [point('2026-08-14', 50), point('2026-09-24', 61)],
      [],
    )
    expect(c.available).toBe(false)
    expect(c.direction).toBe('insufficient_history')
    expect(c.confidence).toBe('insufficient_history')
    expect(c.from).toBeNull()
    expect(c.to).toBeNull()
    expect(c.reason).toContain('at least 3 readings over 30 days')
    expect(c.reason).toContain('14 Aug 2026')
  })

  it('3 points over 12 days → insufficient_history (span too short)', () => {
    const c = summarizeObservedChange(
      [point('2026-09-01', 40), point('2026-09-06', 47), point('2026-09-13', 55)],
      [],
    )
    expect(c.available).toBe(false)
    expect(c.direction).toBe('insufficient_history')
    expect(c.reason).toContain('1 Sep 2026')
  })

  it('3 points over 40 days with |delta| = 1 → flat (reported, but not a direction)', () => {
    const c = summarizeObservedChange(
      [point('2026-08-01', 50), point('2026-08-20', 52), point('2026-09-10', 51)],
      [],
    )
    expect(c.available).toBe(true)
    expect(c.direction).toBe('flat')
    expect(c.deltaPct).toBe(1)
    expect(c.confidence).toBe('observed_change')
    expect(c.reason).toBeNull()
  })

  it('a qualifying window reports the observed change with its endpoints', () => {
    const c = summarizeObservedChange(
      [point('2026-08-14', 50), point('2026-09-04', 55), point('2026-09-24', 61)],
      [],
    )
    expect(c).toEqual({
      available: true,
      from: '2026-08-14',
      to: '2026-09-24',
      deltaPct: 11,
      direction: 'improving',
      confidence: 'observed_change',
      reason: null,
    })
  })

  it('a decline is named a decline (no euphemism, no suppression)', () => {
    const c = summarizeObservedChange(
      [point('2026-08-14', 61), point('2026-09-04', 55), point('2026-09-24', 50)],
      [],
    )
    expect(c.direction).toBe('declining')
    expect(c.deltaPct).toBe(-11)
  })

  it('5 points with a break inside the window → insufficient_history NAMING the break', () => {
    const points = [
      point('2026-08-01', 63),
      point('2026-08-14', 64),
      point('2026-09-02', 41),
      point('2026-09-14', 44),
      point('2026-09-24', 47),
    ]
    const breaks: SeriesBreak[] = [
      { date: '2026-09-02', kind: 'leaf_count_changed', detail: 'Standards in scope changed from 19 to 31.' },
    ]
    const c = summarizeObservedChange(points, breaks)
    expect(c.available).toBe(false)
    expect(c.direction).toBe('insufficient_history')
    expect(c.reason).toBe(
      'Standards in scope changed from 19 to 31 on 2 Sep 2026 — readings before and after that date are not comparable.',
    )
  })

  it('a break OUTSIDE the window does not block the change', () => {
    const points = [point('2026-08-01', 50), point('2026-08-20', 55), point('2026-09-10', 60)]
    const breaks: SeriesBreak[] = [
      { date: '2026-06-01', kind: 'framework_changed', detail: 'Framework changed.' },
      { date: '2026-11-01', kind: 'engine_version_changed', detail: 'Engine version changed.' },
    ]
    expect(summarizeObservedChange(points, breaks).available).toBe(true)
  })

  it('the thresholds are the published constants (no magic numbers drifting apart)', () => {
    expect(MIN_MATERIAL_DELTA_PCT).toBe(2)
    expect(MIN_POINTS_FOR_DIRECTION).toBe(3)
    expect(MIN_SPAN_DAYS_FOR_DIRECTION).toBe(30)
    expect(READINESS_HISTORY_VERSION).toBe('1.0.0')
  })
})

describe('downsampleMonthly', () => {
  it('keeps the LAST reading of each calendar month, ascending, interpolating nothing', () => {
    const points = [
      point('2026-08-03', 40),
      point('2026-08-29', 44),
      point('2026-09-01', 45),
      point('2026-09-30', 52),
      // October has no reading at all — it must NOT appear.
      point('2026-11-15', 58),
    ]
    expect(downsampleMonthly(points).map((p) => p.date)).toEqual([
      '2026-08-29',
      '2026-09-30',
      '2026-11-15',
    ])
  })

  it('is order-insensitive and never mutates its input', () => {
    const points = [point('2026-09-30', 52), point('2026-08-29', 44)]
    const frozen = points.map((p) => ({ ...p }))
    expect(downsampleMonthly(points).map((p) => p.date)).toEqual(['2026-08-29', '2026-09-30'])
    expect(points).toEqual(frozen)
  })

  it('an empty series stays empty', () => {
    expect(downsampleMonthly([])).toEqual([])
  })
})

describe('Phase A vocabulary guard', () => {
  it('never emits the word "trend" in any user-visible string', () => {
    const forbidden = /trend/i
    const strings: string[] = []

    const decomps = [
      decomposeReadinessDelta([], []),
      decomposeReadinessDelta(
        [leaf({ standardId: 'a', rubricScore: 1 })],
        [leaf({ standardId: 'a', rubricScore: 4, evidenceCount: 1 }), leaf({ standardId: 'b' })],
      ),
      decomposeReadinessDelta(
        [leaf({ standardId: 'a', rubricScore: 4, evidenceCount: 2 }), leaf({ standardId: 'b', rubricScore: 4 })],
        [leaf({ standardId: 'a', rubricScore: 1 })],
      ),
    ]
    for (const d of decomps) strings.push(d.narrative)

    const changes = [
      summarizeObservedChange([], []),
      summarizeObservedChange([point('2026-08-14', 50)], []),
      summarizeObservedChange([point('2026-09-01', 40), point('2026-09-06', 47), point('2026-09-13', 55)], []),
      summarizeObservedChange(
        [point('2026-08-01', 63), point('2026-08-14', 64), point('2026-09-24', 47)],
        [{ date: '2026-09-02', kind: 'leaf_count_changed', detail: 'Standards in scope changed from 19 to 31.' }],
      ),
      summarizeObservedChange(
        [point('2026-08-14', 50), point('2026-09-04', 55), point('2026-09-24', 61)],
        [],
      ),
    ]
    for (const c of changes) if (c.reason !== null) strings.push(c.reason)

    expect(strings.length).toBeGreaterThan(5)
    expect(strings.filter((s) => forbidden.test(s))).toEqual([])
  })
})
