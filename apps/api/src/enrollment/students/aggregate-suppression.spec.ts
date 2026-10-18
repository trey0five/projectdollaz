import { describe, expect, it } from 'vitest'
import { MIN_CELL } from '@finrep/analytics'
import type { StudentAggregate } from './students.service.js'
import {
  gateCount,
  hasAttributeFilter,
  suppressDimension,
  suppressFlags,
  suppressStudentAggregate,
  type SuppressedStudentAggregate,
} from './aggregate-suppression.js'
import {
  rosterAggregate,
  students,
  subtractionViolations,
  suppressedCellsCarryNoValue,
  withBasis,
  type PublishedRoster,
} from './aggregate-suppression.testkit.js'

// ─────────────────────────────────────────────────────────────────────────────
// Privacy F1 — the ONE public gate over the raw StudentAggregate. The service
// keeps returning true counts for its self-gating internal consumers (buildMix,
// the twin); this gate is what the two PUBLIC surfaces (Penny's
// get_roster_summary and GET …/students/aggregate) pass the aggregate through.
//
// The assertions are VALUE-ASSERTING per the structural-honesty convention: a
// suppressed cell is `{ suppressed: true }` with NO value key — not a flag
// beside a number.
// ─────────────────────────────────────────────────────────────────────────────

function agg(over: Partial<StudentAggregate['counts']> = {}, kpis?: Partial<StudentAggregate['kpis']>): StudentAggregate {
  return withBasis({
    source: 'roster',
    total: 100,
    filteredTotal: 100,
    counts: {
      grade: { K: 12, '1': 3, '2': 20 },
      status: { enrolled: 90, waitlist: 7, withdrawn: 0, graduated: 0 },
      gender: { female: 60, male: 40 },
      race: { white: 70, asian: 22, black: 8 },
      ethnicity: {},
      ageBand: { under5: 0, '5to10': 40, '11to13': 30, '14to18': 30, '19plus': 0, unknown: 0 },
      flags: { iep: 12, plan504: 8, ell: 6, any: 20 },
      ...over,
    },
    kpis: { enrolled: 90, waitlist: 7, flagged: 20, newThisYear: 15, ...(kpis ?? {}) },
  })
}

describe('gateCount — one count, one rule', () => {
  it('a zero passes (nobody is behind it), the floor and above pass, 0<n<floor is a marker with NO value key', () => {
    expect(gateCount(0)).toBe(0)
    expect(gateCount(MIN_CELL)).toBe(MIN_CELL)
    expect(gateCount(120)).toBe(120)
    const hidden = gateCount(1)
    expect(hidden).toEqual({ suppressed: true })
    expect(hidden).not.toHaveProperty('value')
    expect(gateCount(MIN_CELL - 1)).toEqual({ suppressed: true })
  })
})

describe('suppressFlags — support flags suppressed HARD, complement included', () => {
  it('★ flag n=1 ⇒ NO value key anywhere on that flag', () => {
    const out = suppressFlags({ iep: 1, plan504: 0, ell: 0, any: 1 })
    expect(out.iep).toEqual({ suppressed: true })
    expect(out.iep).not.toHaveProperty('value')
    expect(JSON.stringify(out)).not.toContain('1')
  })

  it('complementary: ONE hidden component beside a visible `any` would be backed out — `any` goes with it', () => {
    // iep=2 hidden; plan504=8, ell=0, any=9 visible ⇒ any − plan504 − ell bounds iep.
    const out = suppressFlags({ iep: 2, plan504: 8, ell: 0, any: 9 })
    expect(out.iep).toEqual({ suppressed: true })
    expect(out.plan504).toBe(8)
    expect(out.ell).toBe(0)
    // Hidden to PROTECT iep, not because it is small → marked complementary
    // (surfaces print "withheld", never <5 over a 9).
    expect(out.any, 'a visible any beside one hidden component is a subtraction').toEqual({ suppressed: true, reason: 'complementary' })
  })

  it('two hidden components: `any` is withheld too — a visible union minus the visible flags bounds the hidden pair, and the twin’s 10-floor bounds each', () => {
    // The old rule kept any=5 visible here: 5 − 0 = 5 = iep + 504 (disjoint), and
    // with iep, 504 ∈ 1..4 that is (1,4)…(4,1) — and against the accreditation
    // twin (which bounds every flag <10) a tight case pins one exactly. The ONE
    // overlap rule (@finrep/analytics suppressOverlapGroup) hides the union.
    const out = suppressFlags({ iep: 2, plan504: 3, ell: 0, any: 5 })
    expect(out.iep).toEqual({ suppressed: true })
    expect(out.plan504).toEqual({ suppressed: true })
    expect(out.ell).toBe(0)
    expect(out.any).toEqual({ suppressed: true, reason: 'complementary' })
  })

  it('all flags at/above the floor pass untouched', () => {
    expect(suppressFlags({ iep: 12, plan504: 8, ell: 6, any: 20 })).toEqual({
      iep: 12,
      plan504: 8,
      ell: 6,
      any: 20,
    })
  })
})

describe('suppressDimension — attribute cells with complementary handling', () => {
  it('a small cell is a marker; zeros and big cells pass', () => {
    const out = suppressDimension({ enrolled: 90, waitlist: 2, withdrawn: 0 })
    expect(out.waitlist).toEqual({ suppressed: true })
    expect(out.waitlist).not.toHaveProperty('value')
    expect(out.withdrawn).toBe(0)
    // enrolled is the only remaining positive cell → suppressed as the complement
    // (statuses sum to the published filteredTotal) — marked so, it is not small.
    expect(out.enrolled).toEqual({ suppressed: true, reason: 'complementary' })
  })

  it('complementary: one hidden cell takes a companion chosen by KEY order, never by size', () => {
    const out = suppressDimension({ a: 50, b: 30, c: 17, d: 3 })
    expect(out.d).toEqual({ suppressed: true })
    // 'a' sorts first: total − b − c − (the companion) leaves only the pair sum
    // a + d = 53, which pins nothing. Choosing by name says nothing about values.
    expect(out.a, 'total − b − c re-derives d unless a companion hides too').toEqual({ suppressed: true, reason: 'complementary' })
    expect(out.b).toBe(30)
    expect(out.c).toBe(17)
  })

  it('two hidden cells never protect each other alone (4 + 3 = 7 would bound both): a companion is taken', () => {
    const out = suppressDimension({ a: 50, b: 30, c: 4, d: 3 })
    expect(out.c).toEqual({ suppressed: true })
    expect(out.d).toEqual({ suppressed: true })
    expect(out.a).toEqual({ suppressed: true, reason: 'complementary' })
    expect(out.b).toBe(30)
  })
})

describe('suppressStudentAggregate — the whole public shape', () => {
  it('★ grade headcounts stay RAW (directory-style, the enrollment page depends on them) — the documented line', () => {
    const out = suppressStudentAggregate(agg())
    expect(out.counts.grade).toEqual({ K: 12, '1': 3, '2': 20 })
  })

  it('publishes the floor so client explainers cannot disagree with the server', () => {
    expect(suppressStudentAggregate(agg()).minCell).toBe(MIN_CELL)
  })

  it('whole-school totals are never suppressed; small attribute KPIs are', () => {
    const out = suppressStudentAggregate(agg({}, { enrolled: 3, waitlist: 2, flagged: 1, newThisYear: 4 }))
    expect(out.kpis.enrolled).toBe(3)
    expect(out.kpis.waitlist).toEqual({ suppressed: true })
    expect(out.kpis.flagged).toEqual({ suppressed: true })
    expect(out.kpis.newThisYear).toEqual({ suppressed: true })
  })

  it('kpis.flagged is gated with the SAME floor as flags.any (one number cannot hide and show)', () => {
    const out = suppressStudentAggregate(agg({ flags: { iep: 0, plan504: 0, ell: 3, any: 3 } }, { flagged: 3 }))
    expect(out.counts.flags.any).toEqual({ suppressed: true })
    expect(out.kpis.flagged).toEqual({ suppressed: true })
  })

  it('a small demographic cell leaves as a marker on gender/race/ethnicity/ageBand', () => {
    const out = suppressStudentAggregate(
      agg({ gender: { female: 60, male: 40, nonbinary: 2 }, race: { white: 96, asian: 4 } }),
    )
    expect(out.counts.gender.nonbinary).toEqual({ suppressed: true })
    expect(out.counts.race.asian).toEqual({ suppressed: true })
    // exactly-one-hidden in race drags the smallest visible cell (complement).
    expect(out.counts.race.white).toEqual({ suppressed: true, reason: 'complementary' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The adversarial-review additions: KPI twins in lockstep, pinned cells, the
// attribute-filtered REST mode, and the reusable non-derivability walker run
// over every fixture — including the reviewer's two concrete extractions.
// ─────────────────────────────────────────────────────────────────────────────

/** Canonical shape → the walker's payload view. */
function published(out: SuppressedStudentAggregate): PublishedRoster {
  return {
    total: out.total,
    filteredTotal: out.filteredTotal,
    grade: out.counts.grade,
    status: out.counts.status,
    gender: out.counts.gender,
    race: out.counts.race,
    ethnicity: out.counts.ethnicity,
    ageBand: out.counts.ageBand,
    flags: out.counts.flags,
    kpis: out.kpis,
    breakdownStatus: out.breakdown.status,
  }
}

/** A raw fixture whose statuses/grades/ageBands genuinely SUM to the totals —
 *  the walker only enforces relations that hold in the raw numbers. */
function raw48(over: Partial<StudentAggregate> = {}): StudentAggregate {
  return withBasis({
    source: 'roster',
    total: 48,
    filteredTotal: 48,
    counts: {
      grade: { K: 20, '1': 16, '2': 12 },
      status: { enrolled: 40, waitlist: 6, withdrawn: 2, graduated: 0 },
      gender: {},
      race: {},
      ethnicity: {},
      ageBand: { under5: 0, '5to10': 48, '11to13': 0, '14to18': 0, '19plus': 0, unknown: 0 },
      flags: { iep: 0, plan504: 0, ell: 0, any: 0 },
      ...(over.counts ?? {}),
    },
    kpis: { enrolled: 40, waitlist: 6, flagged: 0, newThisYear: 8, ...(over.kpis ?? {}) },
    ...(over.total !== undefined ? { total: over.total } : {}),
    ...(over.filteredTotal !== undefined ? { filteredTotal: over.filteredTotal } : {}),
  } as StudentAggregate)
}

const assertNonDerivable = (out: SuppressedStudentAggregate, raw: StudentAggregate) => {
  const pub = published(out)
  expect(subtractionViolations(pub, raw)).toEqual([])
  expect(suppressedCellsCarryNoValue(pub)).toEqual([])
}

describe('KPI twins follow the dimension twin (the reviewer BLOCKER)', () => {
  it('★ reviewer fixture 1: enrolled 40 / waitlist 6 / withdrawn 2 — kpis.waitlist may NOT republish the hidden status', () => {
    const raw = raw48()
    const out = suppressStudentAggregate(raw)
    // withdrawn (2) is small and waitlist (6) — the only positive companion —
    // cannot cover it (2 + 6 = 8 would leave withdrawn ≤ 3), so the statuses
    // FAIL CLOSED: every un-pinned one is withheld alike, zeros included…
    expect(out.counts.status.withdrawn).toEqual({ suppressed: true, reason: 'complementary' })
    expect(out.counts.status.waitlist).toEqual({ suppressed: true, reason: 'complementary' })
    expect(out.counts.status.graduated).toEqual({ suppressed: true, reason: 'complementary' })
    // …and the KPI twin follows the FINAL decision instead of its own floor —
    // otherwise withdrawn = 48 − 40 − 0 − kpis.waitlist, the reviewer's math.
    expect(out.kpis.waitlist).toEqual({ suppressed: true, reason: 'complementary' })
    // enrolled stays raw (kpis.enrolled republishes it by product decision, so
    // hiding the status cell would be theater, and dragging it as a companion
    // would protect nothing).
    expect(out.counts.status.enrolled).toBe(40)
    expect(out.kpis.enrolled).toBe(40)
    assertNonDerivable(out, raw)
  })

  it('★ reviewer fixture 2: flags {iep:2, plan504:10, ell:10, any:20} — kpis.flagged may not republish the hidden any', () => {
    const raw = raw48({
      counts: {
        grade: { K: 20, '1': 16, '2': 12 },
        status: { enrolled: 40, waitlist: 6, withdrawn: 2, graduated: 0 },
        gender: {},
        race: {},
        ethnicity: {},
        ageBand: { under5: 0, '5to10': 48, '11to13': 0, '14to18': 0, '19plus': 0, unknown: 0 },
        flags: { iep: 2, plan504: 10, ell: 10, any: 20 },
      },
      kpis: { enrolled: 40, waitlist: 6, flagged: 20, newThisYear: 8 },
    })
    const out = suppressStudentAggregate(raw)
    expect(out.counts.flags.iep).toEqual({ suppressed: true })
    expect(out.counts.flags.any).toEqual({ suppressed: true, reason: 'complementary' })
    expect(out.kpis.flagged).toEqual({ suppressed: true, reason: 'complementary' })
    expect(out.counts.flags.plan504).toBe(10)
    expect(out.counts.flags.ell).toBe(10)
    assertNonDerivable(out, raw)
  })

  it('the walker itself goes red on a reintroduced raw twin (the regression tripwire is not vacuous)', () => {
    const raw = raw48()
    const out = suppressStudentAggregate(raw)
    const leaky = published(out)
    // Simulate the old bug: the KPI tile republishing the dragged companion.
    leaky.kpis = { ...leaky.kpis, waitlist: 6 }
    const violations = subtractionViolations(leaky, raw)
    expect(violations.length).toBeGreaterThan(0)
    expect(violations.join('\n')).toContain('kpis.waitlist')
  })

  it('a KPI small on its own floor still hides even when its dimension twin is visible', () => {
    // waitlist 3 (<floor): enrolled is pinned and nothing else is positive, so
    // the statuses FAIL CLOSED (the old zero-companion was solvable: a
    // complementary cell is 0 or ≥ 5, so a pair sum of 3 named both).
    const raw = raw48({
      counts: {
        grade: { K: 20, '1': 16, '2': 7 },
        status: { enrolled: 40, waitlist: 3, withdrawn: 0, graduated: 0 },
        gender: {},
        race: {},
        ethnicity: {},
        ageBand: { under5: 0, '5to10': 43, '11to13': 0, '14to18': 0, '19plus': 0, unknown: 0 },
        flags: { iep: 0, plan504: 0, ell: 0, any: 0 },
      },
      kpis: { enrolled: 40, waitlist: 3, flagged: 0, newThisYear: 8 },
      total: 43,
      filteredTotal: 43,
    })
    const out = suppressStudentAggregate(raw)
    expect(out.counts.status.waitlist).toEqual({ suppressed: true, reason: 'complementary' })
    expect(out.kpis.waitlist).toEqual({ suppressed: true, reason: 'complementary' })
    // enrolled is pinned — NOT taken as companion (the old code took it, and
    // kpis.enrolled=40 handed waitlist straight back).
    expect(out.counts.status.enrolled).toBe(40)
    // Both zeros are withheld with it, all under one label: nothing says which
    // of the three holds the 3.
    expect(out.counts.status.withdrawn).toEqual({ suppressed: true, reason: 'complementary' })
    expect(out.counts.status.graduated).toEqual({ suppressed: true, reason: 'complementary' })
    assertNonDerivable(out, raw)
  })

  it('newThisYear sums with nothing published — its own floor is the whole requirement', () => {
    const raw = raw48({ kpis: { enrolled: 40, waitlist: 6, flagged: 0, newThisYear: 4 } })
    const out = suppressStudentAggregate(raw)
    expect(out.kpis.newThisYear).toEqual({ suppressed: true })
    const big = suppressStudentAggregate(raw48())
    expect(big.kpis.newThisYear).toBe(8)
  })
})

describe('attribute-filtered REST reads (the reviewer MAJOR) — row-level fixtures, real basis', () => {
  /** 48 students: 40 enrolled, 6 waitlisted, 2 withdrawn; IEP as given. */
  const roster = (iep: { grade: string; status?: string; n: number }[]) =>
    students([
      ...iep.map((g) => ({ ...g, iep: true })),
      { n: 40 - iep.filter((g) => (g.status ?? 'enrolled') === 'enrolled').reduce((t, g) => t + g.n, 0), grade: 'K' },
      { n: 6 - iep.filter((g) => g.status === 'waitlist').reduce((t, g) => t + g.n, 0), status: 'waitlist', grade: '1' },
      { n: 2, status: 'withdrawn', grade: '2' },
    ])

  it('★ ?flags=iep with 3 matches: the whole read is withheld (ISP is <5 on the roster), no value key anywhere', () => {
    const raw = rosterAggregate(roster([{ grade: '5', n: 3 }]), { flags: ['iep'] })
    const out = suppressStudentAggregate(raw, { attributeFiltered: true })
    expect(out.withheld).toBe('all')
    expect(out.filteredTotal).toEqual({ suppressed: true, reason: 'complementary' })
    expect(out.filteredTotal).not.toHaveProperty('value')
    expect(out.total).toBe(48) // whole-school total stays raw by decision
    expect(JSON.stringify(out.counts)).not.toMatch(/:3\b/)
    assertNonDerivable(out, raw)
  })

  it('★ grade cells become cross-tabs under an attribute filter and are gated with complement', () => {
    // 7 IEP students: grade 5 has 5, grade 6 has 2. 2 + 5 = 7 cannot protect the
    // 2 (it would be ≤ 2), so the grade breakdown fails closed — both withheld.
    const raw = rosterAggregate(roster([{ grade: '5', n: 5 }, { grade: '6', n: 2 }]), { flags: ['iep'] })
    const out = suppressStudentAggregate(raw, { attributeFiltered: true })
    expect(out.filteredTotal).toBe(7)
    expect(out.counts.grade['6']).toEqual({ suppressed: true, reason: 'complementary' })
    expect(out.counts.grade['5']).toEqual({ suppressed: true, reason: 'complementary' })
    assertNonDerivable(out, raw)
  })

  it('grade-only / unfiltered reads keep raw grades and a raw filteredTotal (the documented line)', () => {
    const raw = raw48()
    const out = suppressStudentAggregate(raw, { attributeFiltered: false })
    expect(out.counts.grade).toEqual({ K: 20, '1': 16, '2': 12 })
    expect(out.filteredTotal).toBe(48)
  })

  it('an attribute filter that matched the ENTIRE roster keeps filteredTotal raw — total republishes it anyway', () => {
    const raw = raw48() // filteredTotal === total === 48
    const out = suppressStudentAggregate(raw, { attributeFiltered: true })
    expect(out.filteredTotal).toBe(48)
    assertNonDerivable(out, raw)
  })

  it('a filtered read whose NOT-ENROLLED remainder is small withholds filteredTotal (6 enrolled + 1 waitlisted ⇒ 1)', () => {
    // ?race=asian, 7 matches: 6 enrolled, 1 waitlisted. The breakdowns count the
    // 6 enrolled (status.enrolled is pinned), so a visible 7 would hand back 1.
    const rows = students([
      { n: 6, race: 'asian' },
      { n: 34, race: 'white' },
      { n: 1, status: 'waitlist', race: 'asian' },
      { n: 5, status: 'waitlist', race: 'white' },
      { n: 2, status: 'withdrawn', race: 'white' },
    ])
    const raw = rosterAggregate(rows, { race: ['asian'] })
    const out = suppressStudentAggregate(raw, { attributeFiltered: true })
    expect(out.withheld).toBeNull()
    expect(out.filteredTotal).toEqual({ suppressed: true, reason: 'complementary' })
    expect(out.counts.status.enrolled).toBe(6)
    // the lone waitlisted student has no positive companion: fail closed.
    expect(out.counts.status.waitlist).toEqual({ suppressed: true, reason: 'complementary' })
    expect(out.counts.status.withdrawn).toEqual({ suppressed: true, reason: 'complementary' })
    expect(out.counts.status.graduated).toEqual({ suppressed: true, reason: 'complementary' })
    assertNonDerivable(out, raw)
  })

  it('the same split under ?flags=iep withholds the WHOLE read: ISP is <5 among the not-enrolled', () => {
    const raw = rosterAggregate(roster([{ grade: '5', n: 6 }, { grade: '1', status: 'waitlist', n: 1 }]), { flags: ['iep'] })
    const out = suppressStudentAggregate(raw, { attributeFiltered: true })
    expect(out.withheld).toBe('all')
    expect(out.filteredTotal).toEqual({ suppressed: true, reason: 'complementary' })
  })
})

describe('hasAttributeFilter — what flips the strict mode', () => {
  it('grade-only and empty queries do NOT count (the raw-grade line)', () => {
    expect(hasAttributeFilter(undefined)).toBe(false)
    expect(hasAttributeFilter({})).toBe(false)
    expect(hasAttributeFilter({ grade: ['5', '6'] } as never)).toBe(false)
    expect(hasAttributeFilter({ q: '   ' })).toBe(false)
    expect(hasAttributeFilter({ flags: [] } as never)).toBe(false)
  })

  it('every attribute dimension counts — and so does the name search', () => {
    expect(hasAttributeFilter({ flags: ['iep'] } as never)).toBe(true)
    expect(hasAttributeFilter({ status: ['waitlist'] } as never)).toBe(true)
    expect(hasAttributeFilter({ race: ['asian'] } as never)).toBe(true)
    expect(hasAttributeFilter({ gender: ['female'] } as never)).toBe(true)
    expect(hasAttributeFilter({ ethnicity: ['hispanic'] } as never)).toBe(true)
    expect(hasAttributeFilter({ ageBand: ['5to10'] } as never)).toBe(true)
    expect(hasAttributeFilter({ q: 'smith' })).toBe(true)
    expect(hasAttributeFilter({ grade: ['5'], flags: ['iep'] } as never)).toBe(true)
  })
})

describe('non-derivability sweep — every fixture in this file leaves clean', () => {
  it('the shared agg() fixtures stay non-derivable end to end', () => {
    for (const fixture of [
      agg(),
      agg({}, { enrolled: 3, waitlist: 2, flagged: 1, newThisYear: 4 }),
      agg({ flags: { iep: 0, plan504: 0, ell: 3, any: 3 } }, { flagged: 3 }),
      agg({ gender: { female: 60, male: 40, nonbinary: 2 }, race: { white: 96, asian: 4 } }),
    ]) {
      assertNonDerivable(suppressStudentAggregate(fixture), fixture)
    }
  })
})
