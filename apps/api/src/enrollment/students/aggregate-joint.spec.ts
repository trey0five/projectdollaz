import { afterEach, describe, expect, it, vi } from 'vitest'
import { JOINT_DIMS, JointRelease, flagUnionHidden, type JointDim } from './aggregate-joint.js'
import { hasAttributeFilter, suppressStudentAggregate, type PublicCell } from './aggregate-suppression.js'
import {
  aureliaRoster,
  compactSchool,
  linearRecoveries,
  mixedSchool,
  rosterAggregate,
  singleDimensionQueries,
  students,
  type AttackSurface,
  type FixtureQuery,
  type FixtureStudent,
} from './aggregate-suppression.testkit.js'

// ─────────────────────────────────────────────────────────────────────────────
// Privacy review round 5 — the cross-request limit, closed. Round 4 kept a spec
// that PROVED two different filtered reads could be combined (?grade=K's race
// breakdown + ?race=black's grade breakdown ⇒ the small (K, asian) cell). The
// two-way tables are now decided once over the whole roster
// (aggregate-joint.ts) and every read prints rows/columns of that one decision.
// Every check here is attacker-style: a linear attacker (the testkit's Gaussian
// elimination over student profiles) holds the payloads and solves for every
// small 1-way and 2-way cross-tab.
// ─────────────────────────────────────────────────────────────────────────────

const pubOf = (rows: readonly FixtureStudent[], q: FixtureQuery = {}) =>
  suppressStudentAggregate(rosterAggregate(rows, q), { attributeFiltered: hasAttributeFilter(q as never) })
const hidden = (c: PublicCell | undefined) => c !== undefined && typeof c !== 'number'
const STATUSES = ['enrolled', 'waitlist', 'withdrawn', 'graduated'] as const

/** The unfiltered read + EVERY single-dimension read, as attacker inputs. */
function canonicalRelease(rows: readonly FixtureStudent[]): AttackSurface[] {
  return [
    { name: 'U', query: {}, pub: pubOf(rows) },
    ...singleDimensionQueries(rows).map((q) => ({ name: JSON.stringify(q), query: q, pub: pubOf(rows, q) })),
  ]
}

const SCHOOLS: { label: string; rows: FixtureStudent[] }[] = [
  ...[1, 2, 3, 4, 5, 6].map((seed) => ({ label: `compact ${seed}`, rows: compactSchool(seed) })),
  ...[1, 2, 3, 4, 5].flatMap((seed) =>
    [60, 120, 200].map((n) => ({ label: `mixed ${seed}/${n}`, rows: mixedSchool(seed * 31 + n, n) })),
  ),
]

function attackAll(): string[] {
  const failures: string[] = []
  for (const { label, rows } of SCHOOLS) {
    const found = linearRecoveries(rows, canonicalRelease(rows), { probes: true, profiles: 'vocabulary' })
    if (found.length) failures.push(`${label}: ${found[0]}`)
  }
  return failures
}

afterEach(() => vi.restoreAllMocks())

describe('round 5 — joint two-way tables: no two reads can be combined', () => {
  it('★ THE WHOLE CANONICAL RELEASE AT ONCE (so every pair and every triple of reads): the realistic attacker recovers nothing', () => {
    // Every single-dimension read (one or two values of grade / gender / race /
    // ethnicity / age band / one flag, each with no status or one status) and
    // every status-only read, together, on 21 small-cell-heavy schools with four
    // statuses and all three flags. Holding all of them at once is strictly
    // stronger than holding any two.
    expect(attackAll()).toEqual([])
  }, 120_000)

  it('★ the STRONG attacker (told which student profiles exist) on the seeded St. Aurelia roster: the whole release recovers nothing', () => {
    const rows = aureliaRoster()
    expect(linearRecoveries(rows, canonicalRelease(rows), { probes: true })).toEqual([])
  }, 60_000)

  it('★ EACH joint decision is load-bearing: switch any one off and the attacker recovers cells again', () => {
    const off: [string, () => void][] = [
      ['two-way breakdown tables', () => vi.spyOn(JointRelease.prototype, 'forcedBreakdown').mockReturnValue(new Set())],
      ['X × status tables', () => vi.spyOn(JointRelease.prototype, 'forcedStatuses').mockReturnValue([])],
      ['X × flag strips', () => vi.spyOn(JointRelease.prototype, 'flagHidden').mockReturnValue({ parts: new Set(), any: false })],
      ['row totals partition', () => vi.spyOn(JointRelease.prototype, 'totalHidden').mockReturnValue(new Set())],
    ]
    for (const [name, mutate] of off) {
      mutate()
      expect(attackAll().length, name).toBeGreaterThan(0)
      vi.restoreAllMocks()
    }
    expect(attackAll()).toEqual([])
  }, 300_000)

  it('★ BOTH DIRECTIONS: a cell a joint table hides is hidden in the row read AND the column read, and a cell printed one way is never small', () => {
    const violations: string[] = []
    let checkedHidden = 0
    let checkedBoth = 0
    for (const { label, rows } of SCHOOLS.slice(0, 9)) {
      const J = new JointRelease(rows)
      for (const b of STATUSES) {
        const statusQ = b === 'enrolled' ? {} : { status: [b] }
        for (let i = 0; i < JOINT_DIMS.length; i++) {
          for (let j = i + 1; j < JOINT_DIMS.length; j++) {
            const X = JOINT_DIMS[i]
            const Y = JOINT_DIMS[j]
            if (J.vocab[X].length < 2 || J.vocab[Y].length < 2) continue
            const t = J.cross(X, Y, b)
            for (const x of J.vocab[X]) {
              const rowRead = pubOf(rows, { [X]: [x], ...statusQ } as FixtureQuery)
              for (const y of J.vocab[Y]) {
                const colRead = pubOf(rows, { [Y]: [y], ...statusQ } as FixtureQuery)
                const axisVal = t.axis === X ? x : y
                const otherVal = t.axis === X ? y : x
                const jointHides = t.hiddenAxis.has(axisVal) || t.hiddenOther.has(otherVal)
                const inRow = rowRead.breakdown.status === b ? rowRead.counts[Y][y] : undefined
                const inCol = colRead.breakdown.status === b ? colRead.counts[X][x] : undefined
                const where = `${label} ${b} (${X}=${x}, ${Y}=${y})`
                if (jointHides && inRow !== undefined && inCol !== undefined) checkedHidden++
                if (inRow !== undefined && inCol !== undefined) checkedBoth++
                if (jointHides && inRow !== undefined && !hidden(inRow)) violations.push(`${where}: row read prints ${inRow}`)
                if (jointHides && inCol !== undefined && !hidden(inCol)) violations.push(`${where}: column read prints ${inCol}`)
                for (const [printed, other] of [
                  [inRow, inCol],
                  [inCol, inRow],
                ] as const) {
                  if (typeof printed === 'number' && hidden(other) && printed > 0 && printed < 5)
                    violations.push(`${where}: printed ${printed} one way, hidden the other`)
                }
              }
            }
          }
        }
      }
    }
    expect(violations).toEqual([])
    // Not vacuous: many shared cells are published from both sides, and many
    // of them are cells a joint table hides.
    console.info(`both directions: ${checkedBoth} shared cells, ${checkedHidden} jointly hidden`)
    expect(checkedBoth).toBeGreaterThan(100)
    expect(checkedHidden).toBeGreaterThan(20)
  }, 120_000)

  it('the hiding pattern is whole rows and whole columns, never a lone row or column (no hidden cell is a bridge)', () => {
    const bad: string[] = []
    for (const { label, rows } of SCHOOLS) {
      const J = new JointRelease(rows)
      for (const b of STATUSES)
        for (const X of JOINT_DIMS)
          for (const Y of JOINT_DIMS) {
            if (X >= Y || J.vocab[X].length < 2 || J.vocab[Y].length < 2) continue
            const t = J.cross(X as JointDim, Y as JointDim, b)
            for (const [name, set, vocab] of [
              ['columns', t.hiddenAxis, J.vocab[t.axis]],
              ['rows', t.hiddenOther, J.vocab[t.other]],
            ] as const)
              if (set.size === 1 && vocab.length > 1) bad.push(`${label} ${b} ${t.axis}×${t.other}: one hidden ${name}`)
          }
    }
    expect(bad).toEqual([])
  })

  it('★ the named round-4 tracker: ?grade=K race breakdown + ?race=black grade breakdown on the compact school', () => {
    const school = compactSchool(1)
    const surfaces: AttackSurface[] = [
      { name: 'gradeK', query: { grade: ['K'] }, pub: pubOf(school, { grade: ['K'] }) },
      { name: 'black', query: { race: ['black'] }, pub: pubOf(school, { race: ['black'] }) },
    ]
    expect(linearRecoveries(school, surfaces, { probes: true, profiles: 'vocabulary' })).toEqual([])
  })
})

describe('round 5 — reads no two-way table protects are withheld whole', () => {
  const rows = mixedSchool(31 + 120, 120)

  it('★ two filter dimensions (three-way cells) are withheld, with the reason', () => {
    for (const q of [
      { grade: ['K'], race: ['black'] },
      { grade: ['K'], gender: ['female'] },
      { race: ['white'], gender: ['male'] },
      { grade: ['1'], flags: ['iep'] },
      { gender: ['female'], flags: ['iep'] }, // the reviewer's IEP + female case
    ] as FixtureQuery[]) {
      const p = pubOf(rows, q)
      expect(p.withheld, JSON.stringify(q)).toBe('all')
      expect(p.withheldReason).toBe('combination')
      expect(hidden(p.filteredTotal)).toBe(true)
      expect(p.counts.ethnicity).toEqual({})
    }
  })

  it('★ several support flags at once are withheld: a union beside the whole-school strip is a lattice equation', () => {
    const p = pubOf(rows, { flags: ['iep', 'ell'] })
    expect(p.withheld).toBe('all')
    expect(p.withheldReason).toBe('combination')
  })

  it('★ a NAME SEARCH is withheld whole: ?q=sm and ?q=smi differ by one named student', () => {
    const agg = rosterAggregate(rows, { grade: ['K'] })
    const named = { ...agg, suppressionBasis: { ...agg.suppressionBasis!, nameSearch: true } }
    const p = suppressStudentAggregate(named, { attributeFiltered: true })
    expect(p.withheld).toBe('all')
    expect(p.withheldReason).toBe('nameSearch')
    expect(hidden(p.filteredTotal)).toBe(true)
    expect(Object.values(p.counts.status).every(hidden)).toBe(true)
    // Without the search the same read is published.
    expect(pubOf(rows, { grade: ['K'] }).withheld).not.toBe('all')
  })

  it('a filtered read with no roster projection on its basis fails closed', () => {
    const agg = rosterAggregate(rows, { race: ['white'] })
    const bare = { ...agg, suppressionBasis: { ...agg.suppressionBasis!, rosterRows: undefined } }
    expect(suppressStudentAggregate(bare, { attributeFiltered: true }).withheld).toBe('all')
    // The unfiltered read does not need it.
    const u = rosterAggregate(rows)
    expect(suppressStudentAggregate({ ...u, suppressionBasis: { ...u.suppressionBasis!, rosterRows: undefined } }).withheld).toBeNull()
  })
})

describe('round 5 — zero categories are listed, so a withheld category is never the group total', () => {
  // Grade 1 has 3 Hispanic students (small), so the grade × ethnicity table
  // hides BOTH ethnicity columns in every grade. Kindergarten has no Hispanic
  // student at all: round 4 omitted the zero and printed
  // `ethnicity: { nonHispanic: withheld }` beside a published K headcount of 6
  // — a withheld cell that IS the group total (all of K is non-Hispanic).
  const rows = students([
    { n: 6, grade: 'K', ethnicity: 'nonHispanic', race: 'white' },
    { n: 20, grade: '1', ethnicity: 'nonHispanic', race: 'white' },
    { n: 3, grade: '1', ethnicity: 'hispanic', race: 'white' },
    { n: 25, grade: '2', ethnicity: 'nonHispanic', race: 'white' },
    { n: 8, grade: '2', ethnicity: 'hispanic', race: 'white' },
  ])

  it('★ the reviewer’s 100%-share case: Kindergarten lists Hispanic (withheld) beside non-Hispanic (withheld)', () => {
    const k = pubOf(rows, { grade: ['K'] })
    expect(k.counts.status.enrolled).toBe(6)
    expect(Object.keys(k.counts.ethnicity).sort()).toEqual(['hispanic', 'nonHispanic'])
    expect(hidden(k.counts.ethnicity.hispanic)).toBe(true)
    expect(hidden(k.counts.ethnicity.nonHispanic)).toBe(true)
  })

  it('★ a FLAGS-ONLY read whose group sits in one category lists the zeros as withheld too', () => {
    // Every ISP student is non-Hispanic, and the 3 Hispanic students outside
    // the ISP list are a small cell, so the ethnicity columns are hidden (the
    // non-Hispanic one as its companion). Round 4 printed
    // `{ nonHispanic: withheld }` beside the 6 enrolled ISP students: the
    // withheld category was the whole group.
    const school = students([
      { n: 6, iep: true, ethnicity: 'nonHispanic' },
      { n: 3, ethnicity: 'hispanic' },
      { n: 60, ethnicity: 'nonHispanic' },
    ])
    const p = pubOf(school, { flags: ['iep'] })
    expect(p.withheld).toBeNull()
    expect(p.counts.status.enrolled).toBe(6)
    const eth = p.counts.ethnicity
    expect(Object.keys(eth).sort()).toEqual(['hispanic', 'nonHispanic'])
    expect(hidden(eth.hispanic) && hidden(eth.nonHispanic)).toBe(true)
  })

  it('★ SWEEP: no filtered breakdown omits a vocabulary value, and none has exactly one hidden cell', () => {
    const bad: string[] = []
    for (const { label, rows: school } of [{ label: 'zero-case', rows }, ...SCHOOLS.slice(0, 9)]) {
      const J = new JointRelease(school)
      for (const q of singleDimensionQueries(school)) {
        const p = pubOf(school, q)
        if (p.withheld || p.filteredTotal === p.total) continue
        const filterDims = Object.keys(q)
        for (const dim of JOINT_DIMS) {
          const cells = p.counts[dim]
          // Reads the joint tables decide list every value (a hidden zero must
          // arrive as withheld); a flags-only read lists what is present.
          const jointDecided = !('flags' in q)
          if (jointDecided && !filterDims.includes(dim) && !(dim === 'grade' && !hasAttributeFilter(q as never))) {
            for (const v of J.vocab[dim]) if (!(v in cells)) bad.push(`${label} ${JSON.stringify(q)} ${dim}: ${v} omitted`)
          }
          const h = Object.values(cells).filter((c) => hidden(c)).length
          if (h === 1) bad.push(`${label} ${JSON.stringify(q)} ${dim}: a lone hidden cell`)
        }
      }
    }
    expect(bad).toEqual([])
  }, 120_000)
})

describe('round 5 — the flag lattice: the whole-school "any" beside the pairwise overlaps', () => {
  // ISP 35 · 504 20 · ELL 33 · any 79 (overlap 9, every flag ≥ 5): round 4
  // published all four. ?flags=iep prints |ISP ∩ ELL| = 6, so
  // |ISP ∪ ELL| = 35 + 33 − 6 = 62, any − 62 = 17 students on the 504 list
  // only, and |504 ∩ (ISP ∪ ELL)| = 20 − 17 = 3 — a small group.
  const rows = students([
    { n: 26, iep: true },
    { n: 27, ell: true },
    { n: 17, p504: true },
    { n: 3, iep: true, p504: true },
    { n: 6, iep: true, ell: true },
    { n: 120 },
  ])

  it('★ the per-flag overlap rule withholds `any` (and the flagged KPI it equals)', () => {
    expect(flagUnionHidden(rows)).toBe(true)
    const u = pubOf(rows)
    expect(u.counts.flags.iep).toBe(35)
    expect(u.counts.flags.plan504).toBe(20)
    expect(u.counts.flags.ell).toBe(33)
    expect(hidden(u.counts.flags.any)).toBe(true)
    expect(hidden(u.kpis.flagged)).toBe(true)
  })

  it('★ the attacker: whole-school strip + every single-flag read recovers nothing; the OLD rule hands back 3', () => {
    const reads: AttackSurface[] = [
      { name: 'U', query: {}, pub: pubOf(rows) },
      ...(['iep', 'plan504', 'ell'] as const).map((f) => ({ name: f, query: { flags: [f] }, pub: pubOf(rows, { flags: [f] }) })),
    ]
    // The secret the lattice exposes is a hidden cell of ?flags=iep,ell — hold
    // that read too (it is withheld whole, so it only contributes the secret).
    reads.push({ name: 'iep+ell', query: { flags: ['iep', 'ell'] }, pub: pubOf(rows, { flags: ['iep', 'ell'] }) })
    expect(linearRecoveries(rows, reads, { probes: true, profiles: 'vocabulary' })).toEqual([])

    // Not vacuous: print `any` = 79 (the round-4 decision) and the 3 is solved.
    const leaky: AttackSurface = {
      name: 'old any',
      cells: [{ path: 'any', where: (s) => s.hasIep || s.has504 || s.ell, cell: 79 }],
    }
    expect(linearRecoveries(rows, [...reads, leaky], { probes: true, profiles: 'vocabulary' }).join('\n')).toMatch(
      /iep\+ell\.flags\.plan504 \(= 3, small\)/,
    )
  })

  it('no per-flag overlap is small ⇒ `any` is published as before', () => {
    const fine = students([
      { n: 26, iep: true },
      { n: 27, ell: true },
      { n: 17, p504: true },
      { n: 7, iep: true, p504: true },
      { n: 6, iep: true, ell: true },
      { n: 5, p504: true, ell: true },
      { n: 120 },
    ])
    expect(flagUnionHidden(fine)).toBe(false)
    expect(pubOf(fine).counts.flags.any).toBe(26 + 27 + 17 + 7 + 6 + 5)
  })
})
