import { afterEach, describe, expect, it, vi } from 'vitest'
import { JOINT_DIMS, JointRelease } from './aggregate-joint.js'
import { hasAttributeFilter, suppressStudentAggregate, type PublicCell } from './aggregate-suppression.js'
import {
  aureliaRoster,
  compactSchool,
  integerRecoveries,
  labelledBySize,
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
// Privacy review round 6 — the attacks the LINEAR attacker could not see.
//
// Round 5 proved, with Gaussian elimination, that no hidden cell is a linear
// function of the published numbers. But a published payload says more than
// its equalities: "<5" is 1..4, an honest "withheld" is 0 or at least 5, and
// every count is a non-negative integer. Three attacks used exactly that:
//   1. COUNTING LABELS — the joint tables hide a column in every row, and each
//      row's label said whether ITS cell was small. St. Aurelia: 504 "<5"
//      school-wide, "<5" in exactly four grades ⇒ one 504 student in each.
//   2. COLUMN BOUNDS — a companion's own published column total bounds it, so
//      "K asian + black = 10, black total 7" ⇒ asian ≥ 3.
//   3. MARGIN LABELS — the school-wide "<5" bounds a hidden status in every
//      row: "male waitlist + withdrawn = 7, waitlist school-wide < 5" ⇒
//      withdrawn ≥ 3.
// The fix: one value-independent label on every filtered read; the residual
// guard sees the margin (Fréchet bounds); a row whose status partition cannot
// be made safe withholds its total. Every check here is the INTEGER attacker
// (testkit integerRecoveries: interval propagation over student profiles with
// the labels as bounds), and each is shown to be load-bearing.
// ─────────────────────────────────────────────────────────────────────────────

const pubOf = (rows: readonly FixtureStudent[], q: FixtureQuery = {}) =>
  suppressStudentAggregate(rosterAggregate(rows, q), { attributeFiltered: hasAttributeFilter(q as never) })
const surface = (rows: readonly FixtureStudent[], q: FixtureQuery): AttackSurface => ({
  name: JSON.stringify(q),
  query: q,
  pub: pubOf(rows, q),
})
const isSmallLabel = (c: PublicCell | undefined) => typeof c === 'object' && c !== null && !c.reason
const hidden = (c: PublicCell | undefined) => c !== undefined && typeof c !== 'number'

/** The unfiltered read + every single-dimension read (1..3 values, with and
 *  without one status) + every status-only read. */
function release(rows: readonly FixtureStudent[], maxValues: 2 | 3 = 3): AttackSurface[] {
  return [surface(rows, {}), ...singleDimensionQueries(rows, { maxValues }).map((q) => surface(rows, q))]
}
const gradeReads = (rows: readonly FixtureStudent[]): AttackSurface[] => [
  surface(rows, {}),
  ...[...new Set(rows.map((r) => r.grade))].map((g) => surface(rows, { grade: [g] } as FixtureQuery)),
]

describe('round 6 — counting labels: one label for every hidden cell of a filtered read', () => {
  it('★ REPRO 1 (St. Aurelia): the unfiltered page + every grade read no longer pins the 504 students by grade', () => {
    const rows = aureliaRoster()
    const reads = gradeReads(rows)
    expect(integerRecoveries(rows, reads, { probes: true })).toEqual([])

    // Load-bearing: the SAME payloads labelled by size (the round-5 contract)
    // hand back exactly one 504 student in each of K, 3, 5 and 7.
    const leaky = integerRecoveries(rows, reads.map((r) => labelledBySize(rows, r)), { probes: true }).join('\n')
    for (const g of ['K', '3', '5', '7']) expect(leaky).toMatch(new RegExp(`\\{"grade":\\["${g}"\\]\\}\\.flags\\.plan504 \\(= 1, small\\) is determined`))
    expect(leaky).toMatch(/probe grade=K × flag=plan504 \(= 1, small\) is determined/)
  })

  it('★ the label contract: no filtered read prints a bare "<5" anywhere; the unfiltered read still does', () => {
    const bad: string[] = []
    for (const rows of [aureliaRoster(), mixedSchool(151, 120), compactSchool(1)]) {
      for (const q of singleDimensionQueries(rows, { maxValues: 3 })) {
        const p = pubOf(rows, q)
        if (p.filteredTotal === p.total) continue
        const cells: [string, PublicCell][] = [
          ['filteredTotal', p.filteredTotal],
          ...Object.entries(p.counts.status).map(([k, c]) => [`status.${k}`, c] as [string, PublicCell]),
          ...JOINT_DIMS.flatMap((d) => Object.entries(p.counts[d]).map(([k, c]) => [`${d}.${k}`, c] as [string, PublicCell])),
          ...Object.entries(p.counts.flags).map(([k, c]) => [`flags.${k}`, c] as [string, PublicCell]),
        ]
        for (const [path, c] of cells) if (isSmallLabel(c)) bad.push(`${JSON.stringify(q)} ${path}`)
      }
    }
    expect(bad).toEqual([])
    const u = pubOf(aureliaRoster())
    expect(u.counts.flags.plan504).toEqual({ suppressed: true })
    expect(u.counts.race.mena).toEqual({ suppressed: true })
  })

  it('★ the five-grade withdrawn case: a column hidden in every row no longer counts its small rows', () => {
    // Five grades with one withdrawn student each and a school-wide withdrawn
    // total of 5 (raw). Labelled by size, five rows of "<5" against a total of
    // 5 pin every one of them at 1.
    const rows = students([
      ...['K', '1', '2', '3', '4'].flatMap((g) => [
        { n: 30, grade: g },
        { n: 12, grade: g, status: 'waitlist' },
        { n: 1, grade: g, status: 'withdrawn' },
      ]),
      { n: 20, grade: '5' },
    ])
    const reads = gradeReads(rows)
    expect(pubOf(rows).counts.status.withdrawn).toBe(5)
    expect(integerRecoveries(rows, reads, { probes: true })).toEqual([])
    expect(integerRecoveries(rows, reads.map((r) => labelledBySize(rows, r)), { probes: true }).join('\n')).toMatch(
      /\{"grade":\["K"\]\}\.status\.withdrawn \(= 1, small\) is determined/,
    )
  })

  it('★ REPRO 3 (the round-5 fixtures the linear spec called clean): mixed 151 and 213 recover nothing with labels as bounds', () => {
    for (const seed of [151, 213]) {
      const rows = mixedSchool(seed, 120)
      const reads = release(rows)
      expect(integerRecoveries(rows, reads, { probes: true, profiles: 'vocabulary' }), `mixed ${seed}`).toEqual([])
      // Load-bearing on the same school.
      expect(
        integerRecoveries(rows, reads.map((r) => labelledBySize(rows, r)), { probes: true, profiles: 'vocabulary' }).length,
        `mixed ${seed} labelled by size`,
      ).toBeGreaterThan(0)
    }
  }, 120_000)
})

describe('round 6 — column bounds: the guard sees the published margin', () => {
  // K: white 20, asian 3, black 7 · grade 1: white 20, asian 13 · grade 2: white 20.
  // The unfiltered read publishes asian 16 and black 7.
  const rows = students([
    { n: 20, grade: 'K', race: 'white', gender: 'female' },
    { n: 3, grade: 'K', race: 'asian', gender: 'female' },
    { n: 7, grade: 'K', race: 'black', gender: 'female' },
    { n: 20, grade: '1', race: 'white', gender: 'female' },
    { n: 13, grade: '1', race: 'asian', gender: 'female' },
    { n: 20, grade: '2', race: 'white', gender: 'female' },
  ])

  it('★ colbound: K asian + black = 10 beside a black total of 7 no longer bounds the 3 Asian kindergarteners', () => {
    const u = pubOf(rows)
    expect(u.counts.race.asian).toBe(16)
    expect(u.counts.race.black).toBe(7)
    const k = pubOf(rows, { grade: ['K'] })
    // A companion whose total is published cannot protect: white goes too.
    expect(hidden(k.counts.race.asian) && hidden(k.counts.race.black) && hidden(k.counts.race.white)).toBe(true)
    const reads = [...gradeReads(rows), ...['white', 'asian', 'black'].map((r) => surface(rows, { race: [r] } as FixtureQuery))]
    expect(integerRecoveries(rows, reads, { probes: true, profiles: 'vocabulary' })).toEqual([])
    expect(linearRecoveries(rows, reads, { probes: true, profiles: 'vocabulary' })).toEqual([])

    // Load-bearing: the round-5 table printed K white 20, and with it the 3
    // is bounded below — "at least 3", even with no label at all.
    const old: AttackSurface = {
      name: 'round5',
      cells: [{ path: 'K.race.white', where: (s) => s.grade === 'K' && s.race === 'white' && s.status === 'enrolled', cell: 20 }],
    }
    expect(integerRecoveries(rows, [...reads, old], { probes: true, profiles: 'vocabulary', labels: false }).join('\n')).toMatch(
      /probe grade=K × race=asian \(= 3, small\) is narrowed to 3\.\./,
    )
  })

  it('★ margin labels: a school-wide "<5" status no longer bounds the other hidden status in a gender row', () => {
    // compact school 1: 4 waitlisted ("<5" school-wide), 9 withdrawn; male
    // waitlist 3 + withdrawn 4 = 7 was published as 43 − 36 ⇒ withdrawn ≥ 3.
    const school = compactSchool(1)
    const male = pubOf(school, { gender: ['male'] })
    expect(pubOf(school).counts.status.waitlist).toEqual({ suppressed: true })
    expect(male.counts.status.enrolled).toBe(36)
    expect(hidden(male.filteredTotal)).toBe(true)
    // …and its companion with it: a lone hidden total is the school's
    // not-enrolled count minus the others.
    expect(hidden(pubOf(school, { gender: ['female'] }).filteredTotal)).toBe(true)
    const reads = release(school)
    expect(integerRecoveries(school, reads, { probes: true, profiles: 'vocabulary' })).toEqual([])
    // Load-bearing: print the male total again and the 4 is narrowed.
    const old: AttackSurface = { name: 'round5', cells: [{ path: 'male.filteredTotal', where: (s) => s.gender === 'male', cell: 43 }] }
    expect(integerRecoveries(school, [...reads, old], { probes: true, profiles: 'vocabulary' }).join('\n')).toMatch(
      /status\.withdrawn \(= 4, small\) is narrowed to 3\.\./,
    )
  }, 60_000)
})

describe('round 6 — the integer attacker over the whole release (1-, 2- and 3-value selections)', () => {
  const SCHOOLS: { label: string; rows: FixtureStudent[] }[] = [
    ...[1, 2, 3, 4, 5, 6].map((seed) => ({ label: `compact ${seed}`, rows: compactSchool(seed) })),
    ...[1, 2, 3, 4, 5].flatMap((seed) =>
      [60, 120, 200].map((n) => ({ label: `mixed ${seed}/${n}`, rows: mixedSchool(seed * 31 + n, n) })),
    ),
  ]

  it('★ every small-cell-heavy school: the realistic integer attacker recovers nothing', () => {
    const failures: string[] = []
    for (const { label, rows } of SCHOOLS) {
      const found = integerRecoveries(rows, release(rows), {
        probes: true,
        profiles: rows.length <= 120 ? 'vocabulary' : 'present',
      })
      if (found.length) failures.push(`${label}: ${found[0]}`)
    }
    expect(failures).toEqual([])
  }, 300_000)

  it('★ the REDUCED status × grade × flags model on St. Aurelia (cheap and realistic): nothing, labels as bounds', () => {
    const rows = aureliaRoster()
    const reads = release(rows)
    expect(integerRecoveries(rows, reads, { probes: true, profiles: 'reduced' })).toEqual([])
    expect(
      integerRecoveries(rows, reads.map((r) => labelledBySize(rows, r)), { probes: true, profiles: 'reduced' }).length,
    ).toBeGreaterThan(0)
  }, 120_000)
})

describe('round 6 — structural zeros: age follows grade', () => {
  afterEach(() => vi.restoreAllMocks())
  // Every grade's students sit in the age bands its grade implies, except a few
  // pre-K students who are already 5 and one 11-year-old in grade 5 — "age for
  // grade". A reader who knows no Kindergartner is under 5 reads them off the
  // raw grade counts and the age-band margin (St. Aurelia: under-5 29 beside
  // PK3 14 + PK4 18 ⇒ 3 pre-K students are 5 or older).
  const rows = students([
    { n: 14, grade: 'PK3', ageBand: 'under5' },
    { n: 15, grade: 'PK4', ageBand: 'under5' },
    { n: 3, grade: 'PK4', ageBand: '5to10' },
    { n: 20, grade: 'K', ageBand: '5to10' },
    { n: 20, grade: '5', ageBand: '5to10' },
    { n: 1, grade: '5', ageBand: '11to13' },
    { n: 19, grade: '6', ageBand: '11to13' },
  ])

  it('★ the age-band breakdown is withheld whole, and an age-band filter is not broken down', () => {
    const u = pubOf(rows)
    expect(Object.values(u.counts.ageBand).every(hidden)).toBe(true)
    expect(Object.keys(u.counts.ageBand).sort()).toEqual(['11to13', '14to18', '19plus', '5to10', 'under5', 'unknown'])
    expect(u.counts.grade.PK4).toBe(18)
    expect(pubOf(rows, { ageBand: ['under5'] }).withheld).toBe('all')
    // The attacker told which profiles exist — so it KNOWS the structural
    // zeros — recovers nothing.
    expect(integerRecoveries(rows, release(rows), { probes: true })).toEqual([])
  })

  it('★ load-bearing: publish the age bands again and "3 pre-K students are 5 or older" is back', () => {
    vi.spyOn(JointRelease.prototype, 'ageBandWithheld').mockReturnValue(false)
    expect(integerRecoveries(rows, release(rows), { probes: true }).join('\n')).toMatch(
      /probe grade=PK4 × ageBand=5to10 \(= 3, small\) is determined/,
    )
  })

  it('a school whose grade × age-band table has no small cell keeps its age bands', () => {
    const clean = students([
      { n: 14, grade: 'PK3', ageBand: 'under5' },
      { n: 12, grade: 'PK4', ageBand: 'under5' },
      { n: 6, grade: 'PK4', ageBand: '5to10' },
      { n: 20, grade: 'K', ageBand: '5to10' },
    ])
    expect(pubOf(clean).counts.ageBand).toMatchObject({ under5: 26, '5to10': 26 })
  })
})
