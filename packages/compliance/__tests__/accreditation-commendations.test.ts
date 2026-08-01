import { describe, expect, it } from 'vitest'
import {
  COMMENDATION_LIMIT,
  COMMENDATION_MIN_RUBRIC,
  computeCommendationExclusions,
  computeCommendations,
  type CommendationLeafInput,
  type CommendationSignalInput,
  type RequirementCurrency,
} from '../src/index.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase C — commendations. The rule is all THREE or nothing, and "nothing"
// is a legitimate, common answer that explains itself with the exclusion counts.
// ─────────────────────────────────────────────────────────────────────────────

const LABELS = ['Insufficient', 'Initiating', 'Improving', 'Impacting']

function leaf(over: Partial<CommendationLeafInput> = {}): CommendationLeafInput {
  return { standardId: 's1', code: 'COG-15', title: 'Equitable allocation', rubricScore: 4, evidenceCount: 2, ...over }
}

function currency(state: string, over: Partial<RequirementCurrency> = {}): RequirementCurrency {
  return {
    tag: 'financial_audit',
    label: 'Annual external financial audit',
    dataAvailability: 'platform',
    sourceRegister: 'knowledge_document',
    windowKind: 'fixed',
    windowMonths: 18,
    state: state as RequirementCurrency['state'],
    expiresOn: '2027-06-30',
    daysUntilExpiry: 300,
    message: 'm',
    basis: 'fixed_window',
    artifacts: [],
    autoSatisfied: false,
    alsoInPortal: null,
    ...over,
  } as RequirementCurrency
}

function signal(over: Partial<CommendationSignalInput> = {}): CommendationSignalInput {
  return {
    key: 'operating_margin',
    label: 'Operating margin',
    standardIds: ['s1'],
    available: true,
    status: 'good',
    formattedValue: '6.2%',
    asOf: '2026-06-30',
    ...over,
  }
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj)) deepFreeze(v)
    Object.freeze(obj)
  }
  return obj
}

describe('computeCommendations — all three conditions, no exceptions', () => {
  const leaves = [leaf()]
  const cur = { s1: [currency('current')] }
  const sigs = [signal()]

  it('the happy path qualifies', () => {
    const out = computeCommendations(leaves, cur, sigs, { rubricLabels: LABELS })
    expect(out).toHaveLength(1)
    expect(out[0].rubricLabel).toBe('Impacting')
    expect(computeCommendationExclusions(leaves, cur, sigs).eligible).toBe(1)
  })

  it('drop the SCORE → zero commendations, noScore/lowScore increments', () => {
    expect(computeCommendations([leaf({ rubricScore: null })], cur, sigs)).toHaveLength(0)
    expect(computeCommendationExclusions([leaf({ rubricScore: null })], cur, sigs).noScore).toBe(1)
    expect(computeCommendations([leaf({ rubricScore: 2 })], cur, sigs)).toHaveLength(0)
    expect(computeCommendationExclusions([leaf({ rubricScore: 2 })], cur, sigs).lowScore).toBe(1)
    // The floor is 3 — "Improving" and above.
    expect(computeCommendations([leaf({ rubricScore: COMMENDATION_MIN_RUBRIC })], cur, sigs)).toHaveLength(1)
  })

  it('drop the CURRENT EVIDENCE → zero, noCurrentEvidence increments', () => {
    const stale = { s1: [currency('stale')] }
    expect(computeCommendations(leaves, stale, sigs)).toHaveLength(0)
    expect(computeCommendationExclusions(leaves, stale, sigs).noCurrentEvidence).toBe(1)
  })

  it('NO ARTIFACT LIST is its own bucket — a standard we never asked about has not failed', () => {
    // The requirement table is deliberately sparse; most leaves carry no ask at
    // all. Counting those as "no current evidence" would manufacture a gap.
    expect(computeCommendations(leaves, {}, sigs)).toHaveLength(0)
    const ex = computeCommendationExclusions(leaves, {}, sigs)
    expect(ex.noRequirements).toBe(1)
    expect(ex.noCurrentEvidence).toBe(0)
  })

  it('drop the FAVORABLE SIGNAL → zero, noFavorableSignal increments', () => {
    expect(computeCommendations(leaves, cur, [])).toHaveLength(0)
    expect(computeCommendationExclusions(leaves, cur, []).noFavorableSignal).toBe(1)
    // Available but not good, and good but unavailable, both fail.
    expect(computeCommendations(leaves, cur, [signal({ status: 'watch' })])).toHaveLength(0)
    expect(computeCommendations(leaves, cur, [signal({ available: false })])).toHaveLength(0)
    // Bound to a DIFFERENT standard is not this standard's strength.
    expect(computeCommendations(leaves, cur, [signal({ standardIds: ['other'] })])).toHaveLength(0)
  })

  it('expiring and unknown evidence do NOT qualify', () => {
    for (const state of ['expiring', 'unknown', 'stale', 'missing', 'not_tracked']) {
      expect(computeCommendations(leaves, { s1: [currency(state)] }, sigs)).toHaveLength(0)
    }
  })

  it('the exclusion counters partition the leaf set exactly once each', () => {
    const many = [
      leaf({ standardId: 'a', code: 'A', rubricScore: null }),
      leaf({ standardId: 'b', code: 'B', rubricScore: 1 }),
      leaf({ standardId: 'c', code: 'C', rubricScore: 4 }),
      leaf({ standardId: 'd', code: 'D', rubricScore: 4 }),
      leaf({ standardId: 'e', code: 'E', rubricScore: 4 }),
      leaf({ standardId: 'f', code: 'F', rubricScore: 4 }),
    ]
    const cy = { c: [currency('stale')], d: [currency('current')], e: [currency('current')] }
    const ss = [signal({ standardIds: ['e'] })]
    const ex = computeCommendationExclusions(many, cy, ss)
    expect(ex).toEqual({
      eligible: 1,
      noScore: 1,
      lowScore: 1,
      noRequirements: 1,
      noCurrentEvidence: 1,
      noFavorableSignal: 1,
    })
    expect(
      ex.eligible + ex.noScore + ex.lowScore + ex.noRequirements + ex.noCurrentEvidence + ex.noFavorableSignal,
    ).toBe(many.length)
  })
})

describe('ranking + the limit slice', () => {
  it('strength desc, ties broken by code asc, sliced at the limit', () => {
    const leaves = ['E', 'D', 'C', 'B', 'A', 'F'].map((code, i) =>
      leaf({ standardId: `s${i}`, code, rubricScore: code === 'F' ? 3 : 4 }),
    )
    const cur: Record<string, RequirementCurrency[]> = {}
    for (const l of leaves) cur[l.standardId] = [currency('current')]
    const sigs = leaves.map((l) => signal({ key: `k_${l.code}`, standardIds: [l.standardId] }))

    const out = computeCommendations(leaves, cur, sigs, { limit: 4 })
    // Five leaves at score 4 tie on strength → code asc; the score-3 F is last
    // and falls outside the slice.
    expect(out.map((c) => c.code)).toEqual(['A', 'B', 'C', 'D'])
    expect(out[0].strength).toBe(4 * 100 + 1 * 10 + 1)

    const all = computeCommendations(leaves, cur, sigs, { limit: 99 })
    expect(all.map((c) => c.code)).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
    expect(computeCommendations(leaves, cur, sigs)).toHaveLength(COMMENDATION_LIMIT)
  })

  it('evidence and signal counts saturate at 3 in the strength key', () => {
    const cur = { s1: [currency('current', { tag: 'a' }), currency('current', { tag: 'b' }), currency('current', { tag: 'c' }), currency('current', { tag: 'd' })] }
    const sigs = ['k1', 'k2', 'k3', 'k4'].map((key) => signal({ key }))
    const out = computeCommendations([leaf()], cur, sigs)
    expect(out[0].strength).toBe(400 + 30 + 3)
    // Ordering inside the lists is deterministic (tag asc / key asc).
    expect(out[0].evidence.map((e) => e.tag)).toEqual(['a', 'b', 'c', 'd'])
    expect(out[0].signals.map((s) => s.key)).toEqual(['k1', 'k2', 'k3', 'k4'])
  })
})

describe('the frozen narrative template', () => {
  it('singular branches, with the parenthetical', () => {
    const out = computeCommendations([leaf()], { s1: [currency('current')] }, [signal()], {
      rubricLabels: LABELS,
    })
    expect(out[0].narrative).toBe(
      'COG-15 — Equitable allocation: scored Impacting of 4, backed by 1 current artifact and 1 favorable operating figure (Operating margin 6.2% as of 2026-06-30).',
    )
  })

  it('plural branches, and the raw score when no rubric labels are supplied', () => {
    const cur = { s1: [currency('current', { tag: 'a' }), currency('current', { tag: 'b' })] }
    const sigs = [signal({ key: 'k1' }), signal({ key: 'k2' })]
    const out = computeCommendations([leaf()], cur, sigs)
    expect(out[0].narrative).toBe(
      'COG-15 — Equitable allocation: scored 4 of 4, backed by 2 current artifacts and 2 favorable operating figures (Operating margin 6.2% as of 2026-06-30).',
    )
  })

  it('a missing as-of date drops the clause — it is NEVER rendered as "null"', () => {
    const out = computeCommendations([leaf()], { s1: [currency('current')] }, [signal({ asOf: null })])
    expect(out[0].narrative).toBe(
      'COG-15 — Equitable allocation: scored 4 of 4, backed by 1 current artifact and 1 favorable operating figure (Operating margin 6.2%).',
    )
    expect(out[0].narrative).not.toContain('null')
  })

  it('the parenthetical is omitted entirely when the leading signal has no formatted value', () => {
    const out = computeCommendations([leaf()], { s1: [currency('current')] }, [signal({ formattedValue: null })])
    expect(out[0].narrative).toBe(
      'COG-15 — Equitable allocation: scored 4 of 4, backed by 1 current artifact and 1 favorable operating figure.',
    )
  })
})

describe('determinism', () => {
  it('two identical calls stringify identically; deep-frozen inputs are not mutated', () => {
    const leaves = deepFreeze([leaf(), leaf({ standardId: 's2', code: 'COG-8' })])
    const cur = deepFreeze({ s1: [currency('current')], s2: [currency('current')] })
    const sigs = deepFreeze([signal(), signal({ key: 'days_cash_on_hand', standardIds: ['s2'] })])
    const one = computeCommendations(leaves, cur, sigs, { rubricLabels: LABELS })
    const two = computeCommendations(leaves, cur, sigs, { rubricLabels: LABELS })
    expect(JSON.stringify(one)).toBe(JSON.stringify(two))
    expect(leaves[0].code).toBe('COG-15')
  })
})
