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
  subtractionViolations,
  suppressedCellsCarryNoValue,
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
  return {
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
  }
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
    expect(out.any, 'a visible any beside one hidden component is a subtraction').toEqual({
      suppressed: true,
    })
  })

  it('two hidden components protect each other — `any` may stay visible', () => {
    const out = suppressFlags({ iep: 2, plan504: 3, ell: 0, any: 5 })
    expect(out.iep).toEqual({ suppressed: true })
    expect(out.plan504).toEqual({ suppressed: true })
    expect(out.any).toBe(5)
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
    // (statuses sum to the published filteredTotal).
    expect(out.enrolled).toEqual({ suppressed: true })
  })

  it('complementary: exactly one hidden cell drags the smallest visible positive cell with it', () => {
    const out = suppressDimension({ a: 50, b: 30, c: 17, d: 3 })
    expect(out.d).toEqual({ suppressed: true })
    expect(out.c, 'total − a − b re-derives d unless a companion hides too').toEqual({
      suppressed: true,
    })
    expect(out.a).toBe(50)
    expect(out.b).toBe(30)
  })

  it('two hidden cells protect each other — no companion taken', () => {
    const out = suppressDimension({ a: 50, b: 30, c: 4, d: 3 })
    expect(out.c).toEqual({ suppressed: true })
    expect(out.d).toEqual({ suppressed: true })
    expect(out.a).toBe(50)
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
    expect(out.counts.race.white).toEqual({ suppressed: true })
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
  }
}

/** A raw fixture whose statuses/grades/ageBands genuinely SUM to the totals —
 *  the walker only enforces relations that hold in the raw numbers. */
function raw48(over: Partial<StudentAggregate> = {}): StudentAggregate {
  return {
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
  } as StudentAggregate
}

const assertNonDerivable = (out: SuppressedStudentAggregate, raw: StudentAggregate) => {
  const pub = published(out)
  expect(subtractionViolations(pub, raw)).toEqual([])
  expect(suppressedCellsCarryNoValue(pub)).toEqual([])
}

describe('KPI twins follow the dimension twin (the reviewer BLOCKER)', () => {
  it('★ reviewer fixture 1: enrolled 40 / waitlist 6 / withdrawn 2 — kpis.waitlist may NOT republish the dragged companion', () => {
    const raw = raw48()
    const out = suppressStudentAggregate(raw)
    // withdrawn (2) hides on its own floor; waitlist (6) is dragged as companion…
    expect(out.counts.status.withdrawn).toEqual({ suppressed: true })
    expect(out.counts.status.waitlist).toEqual({ suppressed: true })
    // …and the KPI twin follows the FINAL decision instead of its own floor —
    // otherwise withdrawn = 48 − 40 − 0 − kpis.waitlist, the reviewer's math.
    expect(out.kpis.waitlist).toEqual({ suppressed: true })
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
    expect(out.counts.flags.any).toEqual({ suppressed: true })
    expect(out.kpis.flagged).toEqual({ suppressed: true })
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
    // waitlist 3 (<floor): both the status cell and the KPI hide on the floor;
    // the ZERO-companion rule must kick in (enrolled is pinned, nothing else is
    // positive) so the pair-sum — not the cell — is all that remains derivable.
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
    expect(out.counts.status.waitlist).toEqual({ suppressed: true })
    expect(out.kpis.waitlist).toEqual({ suppressed: true })
    // enrolled is pinned — NOT taken as companion (the old code took it, and
    // kpis.enrolled=40 handed waitlist straight back).
    expect(out.counts.status.enrolled).toBe(40)
    // A zero cell serves as the companion so the hidden cell is not lone.
    const zerosHidden = ['withdrawn', 'graduated'].filter(
      (k) => typeof out.counts.status[k] !== 'number',
    )
    expect(zerosHidden.length).toBe(1)
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

describe('attribute-filtered REST reads (the reviewer MAJOR)', () => {
  const filteredRaw = (filteredTotal: number, over: Partial<StudentAggregate['counts']> = {}): StudentAggregate =>
    ({
      source: 'roster',
      total: 48,
      filteredTotal,
      counts: {
        grade: {},
        status: { enrolled: filteredTotal, waitlist: 0, withdrawn: 0, graduated: 0 },
        gender: {},
        race: {},
        ethnicity: {},
        ageBand: {
          under5: 0,
          '5to10': filteredTotal,
          '11to13': 0,
          '14to18': 0,
          '19plus': 0,
          unknown: 0,
        },
        flags: { iep: filteredTotal, plan504: 0, ell: 0, any: filteredTotal },
        ...over,
      },
      kpis: { enrolled: 40, waitlist: 6, flagged: 20, newThisYear: 8 },
    }) as StudentAggregate

  it('★ ?flags=iep with 3 matches: filteredTotal leaves as a marker with NO value key', () => {
    const raw = filteredRaw(3, { grade: { '5': 3 } })
    const out = suppressStudentAggregate(raw, { attributeFiltered: true })
    expect(out.filteredTotal).toEqual({ suppressed: true })
    expect(out.filteredTotal).not.toHaveProperty('value')
    expect(out.total).toBe(48) // whole-school total stays raw by decision
    assertNonDerivable(out, raw)
  })

  it('★ grade cells become cross-tabs under an attribute filter and are gated with complement', () => {
    // 7 IEP students: grade 6 has 2 (hidden), grade 5 has 5 — visible it would
    // be backed out of the visible filteredTotal, so it goes as companion.
    const raw = filteredRaw(7, { grade: { '5': 5, '6': 2 } })
    const out = suppressStudentAggregate(raw, { attributeFiltered: true })
    expect(out.filteredTotal).toBe(7)
    expect(out.counts.grade['6']).toEqual({ suppressed: true })
    expect(out.counts.grade['5']).toEqual({ suppressed: true })
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

  it('a filtered sub-floor status cell takes a companion from the un-pinned cells (kpis speak about a DIFFERENT population)', () => {
    // ?flags=iep, 7 matches: 6 enrolled, 1 waitlisted. kpis.waitlist (whole
    // school, 6) is not this population — it must not be treated as a twin.
    const raw = filteredRaw(7, {
      grade: { '5': 7 },
      status: { enrolled: 6, waitlist: 1, withdrawn: 0, graduated: 0 },
    })
    const out = suppressStudentAggregate(raw, { attributeFiltered: true })
    expect(out.counts.status.waitlist).toEqual({ suppressed: true })
    expect(out.counts.status.enrolled).toEqual({ suppressed: true }) // companion — NOT pinned here
    assertNonDerivable(out, raw)
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
