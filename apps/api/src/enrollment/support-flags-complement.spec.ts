import { describe, expect, it, vi } from 'vitest'
import { EnrollmentAnalyticsService } from './analytics/enrollment-analytics.service.js'
import { EnrollmentController } from './enrollment.controller.js'
import type { StudentAggregate } from './students/students.service.js'
import {
  hasAttributeFilter,
  suppressDemographicCounts,
  suppressStudentAggregate,
  type PublicCell,
} from './students/aggregate-suppression.js'
import {
  aureliaRoster,
  compactQueries,
  compactSchool,
  linearRecoveries,
  rosterAggregate,
  students,
  type AttackSurface,
  type FixtureQuery,
  type FixtureStudent,
} from './students/aggregate-suppression.testkit.js'
import { JointRelease } from './students/aggregate-joint.js'

// ─────────────────────────────────────────────────────────────────────────────
// The support-flag COMPLEMENT LEAK, as the demo pre-production found it on
// camera (scene e6): "Any support flag 25 · ISP 14 · English learner 9 · 504 <5"
// — 25 − 14 − 9 = 2 is the hidden 504 count. And its side effect on e1: hiding
// one flag hid the "Support flags" chip and printed '<5' over 25 enrolled
// students, which is a lie.
//
// Review round 4 then attacked THROUGH THE FILTER BAR and ACROSS SURFACES:
// narrowing to a hidden cell (?flags=iep,plan504, ?race=twoOrMore), a status
// filter against the enrolled-only cards (asian 19 here vs 16 there), the
// waitlist KPI on a filtered read, the zero companion, the raw /demographics
// route, the raw status mix on the analytics card, and the companion pattern
// itself. Every surface here is built from STUDENT ROWS through the service's
// own tally (rosterAggregate), and the strongest check is a LINEAR ATTACKER that
// holds every payload at once and solves for every small cross-tab.
// ─────────────────────────────────────────────────────────────────────────────

type Cell = PublicCell | { value: number | null; suppressed: boolean; reason?: string }

/** A published number, whichever payload convention carried it. */
function num(c: Cell | undefined): number | null {
  if (c === undefined || c === null) return null
  if (typeof c === 'number') return c
  return c.suppressed ? null : c.value
}
const hidden = (c: Cell | undefined) => num(c) === null
const WITHHELD = { suppressed: true, reason: 'complementary' }

const pubOf = (rows: readonly FixtureStudent[], q: FixtureQuery = {}) =>
  suppressStudentAggregate(rosterAggregate(rows, q), { attributeFiltered: hasAttributeFilter(q as never) })

/** The analytics card's mix, through the real service method. */
async function analyticsMix(agg: StudentAggregate) {
  const svc = Object.create(EnrollmentAnalyticsService.prototype) as EnrollmentAnalyticsService
  const priv = svc as unknown as Record<string, unknown>
  priv.students = { aggregate: vi.fn(async () => agg) }
  priv.prisma = { student: { count: vi.fn(async () => agg.kpis.enrolled) } }
  return (priv.buildMix as (id: string) => Promise<{ flags: Record<string, Cell>; status: Record<string, Cell> }>).call(
    svc,
    'school',
  )
}

/**
 * The attacker: holds every payload, and for every published UNION (an `any` or
 * a `flagged`) subtracts the visible components it covers. A union of the same
 * population beside a hidden component yields a lower bound on that component —
 * exact when the flags do not overlap. Returns every such recovery.
 */
function unionMinusParts(
  surfaces: { name: string; union: Cell | undefined; parts: Record<string, Cell | undefined> }[],
): string[] {
  const out: string[] = []
  for (const s of surfaces) {
    const u = num(s.union)
    if (u === null) continue
    const hiddenParts = Object.keys(s.parts).filter((k) => hidden(s.parts[k]))
    if (hiddenParts.length === 0) continue
    const visibleSum = Object.values(s.parts).reduce<number>((t, c) => t + (num(c) ?? 0), 0)
    out.push(`${s.name}: ${u} − ${visibleSum} ⇒ ${hiddenParts.join('+')} ≥ ${u - visibleSum}`)
  }
  return out
}

/** Every UNFILTERED surface that prints these students, as attacker inputs. */
function unfilteredSurfaces(rows: readonly FixtureStudent[]): AttackSurface[] {
  const enrolled = rows.filter((r) => r.status === 'enrolled')
  // The analytics card, KYRO's get_enrollment_demographics, the org compare
  // profile and GET /enrollment/demographics: ENROLLED demographics through
  // suppressDemographicCounts, beside totalEnrolled.
  const demo: AttackSurface = {
    name: 'demographics',
    cells: [
      { path: 'totalEnrolled', where: (s) => s.status === 'enrolled', cell: enrolled.length },
      ...(['gender', 'race', 'ethnicity'] as const).flatMap((dim) => {
        const counts: Record<string, number> = {}
        for (const r of enrolled) if (r[dim]) counts[r[dim]!] = (counts[r[dim]!] ?? 0) + 1
        return Object.entries(suppressDemographicCounts(counts).counts).map(([k, c]) => ({
          path: `${dim}.${k}`,
          where: (s: FixtureStudent) => s.status === 'enrolled' && s[dim] === k,
          cell: c,
        }))
      }),
    ],
  }
  // The accreditation twin: all-status flags against its own 10 floor (only
  // what it PUBLISHES is an equation; its stricter floor is not our secret).
  const key = { iep: 'hasIep', plan504: 'has504', ell: 'ell' } as const
  const twin: AttackSurface = {
    name: 'twin',
    cells: (['iep', 'plan504', 'ell'] as const)
      .map((f) => ({ f, n: rows.filter((r) => r[key[f]]).length }))
      .filter(({ n }) => n >= 10)
      .map(({ f, n }) => ({ path: f, where: (s: FixtureStudent) => s[key[f]], cell: n })),
  }
  // The overview chips, the register analytics, the analytics "who's here" card
  // and KYRO's get_roster_summary are all ONE call on the unfiltered aggregate.
  return [{ name: 'overview', query: {}, pub: pubOf(rows) }, demo, twin]
}
const readOf = (rows: readonly FixtureStudent[], name: string, query: FixtureQuery): AttackSurface => ({
  name,
  query,
  pub: pubOf(rows, query),
})

describe('support flags — complementary suppression on every surface', () => {
  it('★ THE ON-CAMERA CASE (25 / 14 / 9 / 504 hidden): the card withholds the union; 504 is <5; nothing is left to subtract', async () => {
    const mix = await analyticsMix(rosterAggregate(aureliaRoster()))
    expect(mix.flags.iep).toEqual({ value: 14, suppressed: false })
    expect(mix.flags.ell).toEqual({ value: 9, suppressed: false })
    expect(mix.flags.plan504).toEqual({ value: null, suppressed: true }) // small → '<5'
    // NOT small: hidden only to protect the 504 → prints "withheld", never '<5'.
    expect(mix.flags.any).toEqual({ value: null, suppressed: true, reason: 'complementary' })
    expect(JSON.stringify(mix.flags)).not.toMatch(/:\s*(4|25)\b/)
    expect(
      unionMinusParts([{ name: 'card', union: mix.flags.any, parts: { iep: mix.flags.iep, plan504: mix.flags.plan504, ell: mix.flags.ell } }]),
    ).toEqual([])
  })

  it('★ the e1 "Support flags" chip: withheld as COMPLEMENTARY (it is 25, not "<5")', () => {
    const pub = pubOf(aureliaRoster())
    expect(pub.kpis.flagged).toEqual(WITHHELD)
    expect(pub.counts.flags.any).toEqual(WITHHELD)
    expect(pub.counts.flags.plan504).toEqual({ suppressed: true })
  })

  it('★ two hidden flags: both <5, the union withheld on both surfaces', async () => {
    const rows = students([
      { n: 14, iep: true },
      { n: 2, p504: true },
      { n: 3, ell: true },
      { n: 60 },
    ])
    const mix = await analyticsMix(rosterAggregate(rows))
    const pub = pubOf(rows)
    for (const flags of [mix.flags, pub.counts.flags] as Record<string, Cell>[]) {
      expect(hidden(flags.plan504)).toBe(true)
      expect(hidden(flags.ell)).toBe(true)
      expect(num(flags.iep)).toBe(14)
      expect(hidden(flags.any)).toBe(true)
    }
    expect(hidden(pub.kpis.flagged)).toBe(true)
  })

  it('★ TOTAL-MINUS-PARTS ACROSS SURFACES: card + overview chip + filtered register reads leave no union beside a hidden flag', async () => {
    const rows = aureliaRoster()
    const mix = await analyticsMix(rosterAggregate(rows))
    const unfiltered = pubOf(rows)
    const enrolledOnly = pubOf(rows, { status: ['enrolled'] })
    const gradeK = pubOf(rows, { grade: ['K'] })
    const parts = (f: Record<string, Cell>) => ({ iep: f.iep, plan504: f.plan504, ell: f.ell })
    const rosterParts = parts(mix.flags)
    const attacks = unionMinusParts([
      { name: 'card any', union: mix.flags.any, parts: rosterParts },
      { name: 'register any', union: unfiltered.counts.flags.any, parts: parts(unfiltered.counts.flags as Record<string, Cell>) },
      { name: 'chip flagged vs roster flags', union: unfiltered.kpis.flagged, parts: rosterParts },
      { name: 'grade-K read flagged vs roster flags', union: gradeK.kpis.flagged, parts: rosterParts },
      { name: 'enrolled read any', union: enrolledOnly.counts.flags.any, parts: parts(enrolledOnly.counts.flags as Record<string, Cell>) },
      { name: 'enrolled read flagged', union: enrolledOnly.kpis.flagged, parts: rosterParts },
    ])
    expect(attacks).toEqual([])
    // A status-filtered read publishes no flag block at all (a per-status flag
    // block beside the all-status one is the same subtraction).
    expect(enrolledOnly.counts.flags).toEqual({ iep: WITHHELD, plan504: WITHHELD, ell: WITHHELD, any: WITHHELD })
    // Every surface makes the SAME call on the same counts.
    expect(hidden(mix.flags.plan504)).toBe(true)
    expect(num(mix.flags.ell)).toBe(num(unfiltered.counts.flags.ell as Cell))
  })

  it('the attacker is not vacuous: the OLD per-cell card reads 25 − 14 − 9 ⇒ 504 ≥ 2', () => {
    const oldCard = { any: 25, iep: 14, ell: 9, plan504: { suppressed: true } as Cell }
    expect(unionMinusParts([{ name: 'old card', union: oldCard.any, parts: { iep: oldCard.iep, ell: oldCard.ell, plan504: oldCard.plan504 } }])).toEqual([
      'old card: 25 − 23 ⇒ plan504 ≥ 2',
    ])
  })

  it('UNSUPPRESSED cases are unchanged on every surface', async () => {
    const rows = students([{ n: 14, iep: true }, { n: 6, p504: true }, { n: 9, ell: true }, { n: 60 }])
    const mix = await analyticsMix(rosterAggregate(rows))
    expect(mix.flags).toEqual({
      iep: { value: 14, suppressed: false },
      plan504: { value: 6, suppressed: false },
      ell: { value: 9, suppressed: false },
      any: { value: 29, suppressed: false },
    })
    const pub = pubOf(rows)
    expect(pub.counts.flags).toEqual({ iep: 14, plan504: 6, ell: 9, any: 29 })
    expect(pub.kpis.flagged).toBe(29)
  })

  it('a small union is honestly small ("<5"), not "withheld"', () => {
    const pub = pubOf(students([{ n: 3, p504: true }, { n: 60 }]))
    expect(pub.counts.flags.any).toEqual({ suppressed: true })
    expect(pub.kpis.flagged).toEqual({ suppressed: true })
  })
})

describe('demographic mix — the race card beside the headcount (same family, same screen)', () => {
  it('★ MENA 3 beside 204 enrolled and five visible races (204 − 201 = 3) takes a companion; the index is pooled', async () => {
    const svc = Object.create(EnrollmentAnalyticsService.prototype) as EnrollmentAnalyticsService
    const priv = svc as unknown as Record<string, unknown>
    const race = { white: 108, hispanicLatino: 38, black: 27, asian: 16, twoOrMore: 12, mena: 3 }
    priv.enrollment = {
      demographics: vi.fn(async () => ({
        observedOn: '2026-10-17',
        source: 'roster',
        totalEnrolled: 204,
        gender: { counts: { female: 101, male: 103 }, shares: {} },
        ethnicity: null,
        race: { counts: race, shares: {}, diversityIndex: 0.6577 },
      })),
    }
    const view = await (priv.buildDemographics as (id: string) => Promise<{
      totalEnrolled: number
      race: { cells: { key: string; count: Cell; share: Cell }[]; diversityIndex?: number }
      gender: { cells: { key: string; count: Cell }[] }
    }>).call(svc, 'school')
    const byKey = Object.fromEntries(view.race.cells.map((c) => [c.key, c]))
    expect(byKey.mena.count).toEqual({ value: null, suppressed: true })
    // The companion is chosen by KEY ('asian' sorts first), never by size.
    expect(byKey.asian.count).toEqual({ value: null, suppressed: true, reason: 'complementary' })
    // Its share is withheld WITH THE SAME REASON (review NIT: a bare-suppressed
    // share would print '<5' over a 16).
    expect(byKey.asian.share).toEqual({ value: null, suppressed: true, reason: 'complementary' })
    expect(byKey.mena.share).toEqual({ value: null, suppressed: true })
    const visibleSum = view.race.cells.reduce((t, c) => t + (num(c.count) ?? 0), 0)
    // total − visible is now the PAIR (19): MENA anywhere in 1..4.
    expect(view.totalEnrolled - visibleSum).toBe(19)
    expect(view.race.diversityIndex).not.toBeCloseTo(0.6577, 3)
    expect(view.gender.cells.map((c) => num(c.count))).toEqual([103, 101])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// REVIEW ROUND 4 — the attacks, exactly as the reviewer ran them.
// ─────────────────────────────────────────────────────────────────────────────

describe('round 4 — the filter bar cannot narrow to a cell a wider read hides', () => {
  const rows = aureliaRoster()

  it('★ (a) ?flags=iep,plan504 is withheld WHOLE: no filteredTotal, no status/gender/grade beside a visible ISP 14', () => {
    const pub = pubOf(rows, { flags: ['iep', 'plan504'] })
    expect(pub.withheld).toBe('all')
    expect(pub.filteredTotal).toEqual(WITHHELD)
    for (const s of Object.values(pub.counts.status)) expect(s).toEqual(WITHHELD)
    expect(pub.counts.gender).toEqual({})
    expect(pub.counts.grade).toEqual({})
    expect(pub.counts.ageBand).toEqual({})
    expect(JSON.stringify(pub.counts)).not.toMatch(/:\s*\d/)
  })

  it('★ (b) ?flags=iep,ell,plan504 is withheld; so is ?flags=iep,ell (round 5: no multi-flag union is published at all)', () => {
    const all3 = pubOf(rows, { flags: ['iep', 'ell', 'plan504'] })
    const two = pubOf(rows, { flags: ['iep', 'ell'] })
    expect(all3.withheld).toBe('all')
    expect(all3.filteredTotal).toEqual(WITHHELD)
    // A union of two lists beside the whole-school `any` is a lattice equation
    // (any − |ISP ∪ ELL| = the 504-only students), so it is withheld whole now.
    expect(two.withheld).toBe('all')
    expect(two.withheldReason).toBe('combination')
    expect(two.filteredTotal).toEqual(WITHHELD)
    // The union the unfiltered read withholds is published nowhere.
    expect(pubOf(rows).counts.flags.any).toEqual(WITHHELD)
    expect(
      linearRecoveries(rows, [...unfilteredSurfaces(rows), readOf(rows, 'all3', { flags: ['iep', 'ell', 'plan504'] }), readOf(rows, 'two', { flags: ['iep', 'ell'] })], {
        probes: true,
      }),
    ).toEqual([])
  })

  it('★ a multi-flag selection whose OVERLAP is small is withheld (the seeded roster: ISP 14 + ELL 9 − |ISP ∪ ELL| 21 = 2 on both lists)', () => {
    // aureliaRoster has no ISP+ELL overlap, so build the seeded shape directly.
    const seeded = students([
      { n: 12, iep: true },
      { n: 2, iep: true, ell: true },
      { n: 7, ell: true },
      { n: 2, iep: true, p504: true },
      { n: 120 },
    ])
    const two = pubOf(seeded, { flags: ['iep', 'ell'] })
    expect(two.withheld).toBe('all')
    expect(two.filteredTotal).toEqual(WITHHELD)
    // …and the unfiltered union carries the same overlap, so it is withheld too
    // (16 + 2 + 9 − 23 = 4 extra memberships).
    expect(pubOf(seeded).counts.flags.any).toEqual(WITHHELD)
    expect(
      linearRecoveries(seeded, [...unfilteredSurfaces(seeded), readOf(seeded, 'iep+ell', { flags: ['iep', 'ell'] })], { probes: true }),
    ).toEqual([])
  })

  it('★ (c) grade cells under both reads: grade 5 under ?flags=iep,ell,plan504 is withheld, so no single 504 child is isolated', () => {
    const g5all = pubOf(rows, { grade: ['5'], flags: ['iep', 'ell', 'plan504'] })
    const all3 = pubOf(rows, { flags: ['iep', 'ell', 'plan504'] })
    expect(all3.counts.grade).toEqual({})
    expect(g5all.withheld).toBe('all')
    expect(
      linearRecoveries(
        rows,
        [
          ...unfilteredSurfaces(rows),
          readOf(rows, 'all3', { flags: ['iep', 'ell', 'plan504'] }),
          readOf(rows, 'two', { flags: ['iep', 'ell'] }),
          readOf(rows, 'g5all', { grade: ['5'], flags: ['iep', 'ell', 'plan504'] }),
          readOf(rows, 'g5two', { grade: ['5'], flags: ['iep', 'ell'] }),
        ],
        { probes: true },
      ),
    ).toEqual([])
  })

  it('★ single-value narrowing to a companion or a small cell is withheld (the race / status partner attack)', () => {
    // The unfiltered race chart hides MENA (<5) and its companion ASIAN.
    const unf = pubOf(rows)
    expect(unf.counts.race.mena).toEqual({ suppressed: true })
    expect(unf.counts.race.asian).toEqual(WITHHELD)
    for (const q of [
      { race: ['asian'] },
      { race: ['mena'] },
      { race: ['white', 'mena'] },
      { status: ['enrolled'], race: ['asian'] },
    ] as FixtureQuery[]) {
      const pub = pubOf(rows, q)
      expect(pub.withheld, JSON.stringify(q)).toBe('all')
      expect(pub.filteredTotal, JSON.stringify(q)).toEqual(WITHHELD)
    }
    // Narrowing to a VISIBLE value is still answered: twoOrMore 12 is on the
    // chart already. Its filteredTotal (16, all statuses) is withheld, because
    // the not-enrolled remainder (4) would be 16 − 12.
    const two = pubOf(rows, { race: ['twoOrMore'] })
    expect(two.withheld).toBeNull()
    expect(two.filteredTotal).toEqual(WITHHELD)
    expect(two.counts.status.enrolled).toBe(12)
  })

  it('★ CROSS-POPULATION: the roster read and the enrolled-only cards publish the SAME enrolled breakdown (asian 19 vs 16 is gone)', () => {
    const unf = pubOf(rows)
    expect(unf.breakdown).toEqual({ status: 'enrolled' })
    const enrolledRace: Record<string, number> = {}
    for (const r of rows) if (r.status === 'enrolled' && r.race) enrolledRace[r.race] = (enrolledRace[r.race] ?? 0) + 1
    // Identical to what the analytics card / KYRO / /demographics publish.
    expect(unf.counts.race).toEqual(suppressDemographicCounts(enrolledRace).counts)
    // Multi-status selections publish no breakdown: no row of statuses is the
    // sum of two published ones.
    const notEnrolled = pubOf(rows, { status: ['waitlist', 'withdrawn', 'graduated'] })
    expect(notEnrolled.withheld).toBe('breakdown')
    expect(notEnrolled.counts.race).toEqual({})
  })

  it('★ THE LINEAR ATTACKER: every unfiltered surface + each reviewer read, one at a time — no small cross-tab is determined', () => {
    const reads: [string, FixtureQuery][] = [
      ['iep+504', { flags: ['iep', 'plan504'] }],
      ['iep+ell+504', { flags: ['iep', 'ell', 'plan504'] }],
      ['iep+ell', { flags: ['iep', 'ell'] }],
      ['iep', { flags: ['iep'] }],
      ['504', { flags: ['plan504'] }],
      ['ell', { flags: ['ell'] }],
      ['twoOrMore', { race: ['twoOrMore'] }],
      ['white+mena', { race: ['white', 'mena'] }],
      ['mena', { race: ['mena'] }],
      ['asian', { race: ['asian'] }],
      ['white', { race: ['white'] }],
      ['enrolled', { status: ['enrolled'] }],
      ['enrolled+twoOrMore', { status: ['enrolled'], race: ['twoOrMore'] }],
      ['not-enrolled', { status: ['waitlist', 'withdrawn', 'graduated'] }],
      ['waitlist', { status: ['waitlist'] }],
      ['withdrawn', { status: ['withdrawn'] }],
      ['graduated', { status: ['graduated'] }],
      ['grade 5', { grade: ['5'] }],
      ['grade 5 + 3 flags', { grade: ['5'], flags: ['iep', 'ell', 'plan504'] }],
      ['grade 5 + 2 flags', { grade: ['5'], flags: ['iep', 'ell'] }],
      ['female', { gender: ['female'] }],
    ]
    expect(linearRecoveries(rows, unfilteredSurfaces(rows), { probes: true })).toEqual([])
    for (const [name, q] of reads) {
      expect(linearRecoveries(rows, [...unfilteredSurfaces(rows), readOf(rows, name, q)], { probes: true }), name).toEqual([])
    }
  })

  it('the linear attacker is not vacuous: a visible union beside a hidden flag (disjoint flags) is solved exactly', () => {
    const disjoint = students([{ n: 14, iep: true }, { n: 2, p504: true }, { n: 9, ell: true }, { n: 60 }])
    const leaky: AttackSurface = {
      name: 'old card',
      cells: [
        { path: 'any', where: (s) => s.hasIep || s.has504 || s.ell, cell: 25 },
        { path: 'iep', where: (s) => s.hasIep, cell: 14 },
        { path: 'ell', where: (s) => s.ell, cell: 9 },
        { path: 'plan504', where: (s) => s.has504, cell: { suppressed: true } },
      ],
    }
    expect(linearRecoveries(disjoint, [leaky], { probes: true })).toContain(
      'old card.plan504 (= 2, small) is determined by the published numbers',
    )
  })

  it('★ value-set nesting is closed: ?flags=iep,ell − ?flags=iep no longer hands back the English learners’ split', () => {
    expect(
      linearRecoveries(
        rows,
        [
          ...unfilteredSurfaces(rows),
          readOf(rows, 'iep+ell', { flags: ['iep', 'ell'] }),
          readOf(rows, 'iep', { flags: ['iep'] }),
          readOf(rows, 'ell', { flags: ['ell'] }),
        ],
        { probes: true },
      ),
    ).toEqual([])
  })

  it('★ the REALISTIC attacker on 5 small-cell-heavy schools: every unfiltered surface + ANY ONE filtered read (all 249 shapes) recovers nothing', () => {
    const failures: string[] = []
    for (let seed = 1; seed <= 5; seed++) {
      const school = compactSchool(seed)
      const pub = (q: FixtureQuery) => suppressStudentAggregate(rosterAggregate(school, q), { attributeFiltered: hasAttributeFilter(q as never) })
      const unf: AttackSurface = { name: 'unfiltered', query: {}, pub: pub({}) }
      const alone = linearRecoveries(school, [unf], { probes: true, profiles: 'vocabulary' })
      if (alone.length) failures.push(`seed ${seed} unfiltered: ${alone[0]}`)
      for (const q of compactQueries().slice(1)) {
        const f = linearRecoveries(school, [unf, { name: JSON.stringify(q), query: q, pub: pub(q) }], { probes: true, profiles: 'vocabulary' })
        if (f.length) failures.push(`seed ${seed} ${JSON.stringify(q)}: ${f[0]}`)
      }
    }
    expect(failures).toEqual([])
  }, 60_000)

  it('★ CLOSED (round 5, was the HONEST LIMIT): ?grade=K and ?race=black share the (K, black) cell and now make ONE decision about it', () => {
    // ?grade=K's race breakdown and ?race=black's grade breakdown both carry
    // (K, black). Round 4 decided each read alone, so one hid (K, black) as a
    // companion while the other printed it, and K − white − black gave the
    // small (K, asian) back (Denning's tracker). The two-way tables are now
    // decided once over the whole roster (aggregate-joint.ts).
    const school = compactSchool(1)
    const pub = (q: FixtureQuery) => suppressStudentAggregate(rosterAggregate(school, q), { attributeFiltered: hasAttributeFilter(q as never) })
    const attack = () =>
      linearRecoveries(
        school,
        [
          { name: 'gradeK', query: { grade: ['K'] }, pub: pub({ grade: ['K'] }) },
          { name: 'black', query: { race: ['black'] }, pub: pub({ race: ['black'] }) },
        ],
        { probes: true, profiles: 'vocabulary' },
      )
    expect(attack()).toEqual([])
    // Both directions print the SAME decision about the shared cell.
    const k = pub({ grade: ['K'] })
    const b = pub({ race: ['black'] })
    expect(hidden(k.counts.race.black)).toBe(hidden(b.counts.grade.K))

    // The attacker is not vacuous: switch the joint decision off and the round-4
    // tracker is back, exactly as the old limit spec recorded it.
    const spy = vi.spyOn(JointRelease.prototype, 'forcedBreakdown').mockReturnValue(new Set())
    try {
      expect(attack().join('\n')).toMatch(/gradeK\.race\.asian/)
    } finally {
      spy.mockRestore()
    }
  })
})

describe('round 4 — KPI twins, the zero companion, and the raw doors', () => {
  it('★ kpis.waitlist follows the WHOLE ROSTER decision on a filtered read (218 − 204 − 0 − 12 = 2 is gone)', () => {
    const rows = students([
      { n: 184, grade: '1' },
      { n: 20, grade: 'K' },
      { n: 10, status: 'waitlist', grade: '1' },
      { n: 2, status: 'waitlist', grade: 'K' },
      { n: 2, status: 'withdrawn', grade: '1' },
    ])
    const unf = pubOf(rows)
    expect(unf.counts.status.withdrawn).toEqual({ suppressed: true })
    expect(unf.counts.status.waitlist).toEqual(WITHHELD) // the companion
    const gradeK = pubOf(rows, { grade: ['K'] })
    expect(gradeK.kpis.waitlist).toEqual(WITHHELD)
    expect(unf.kpis.waitlist).toEqual(WITHHELD)
  })

  it('★ the zero companion no longer names the cell: {enrolled 204, waitlist 0, withdrawn 2, graduated 0}', () => {
    const rows = students([{ n: 204 }, { n: 2, status: 'withdrawn' }])
    const pub = pubOf(rows)
    expect(pub.counts.status.enrolled).toBe(204)
    for (const k of ['waitlist', 'withdrawn', 'graduated']) expect(pub.counts.status[k]).toEqual(WITHHELD)
    expect(pub.kpis.waitlist).toEqual(WITHHELD)
  })

  it('★ the analytics card publishes the OVERVIEW’s status decision, not raw statuses (withdrawn 2 was printed as 2)', async () => {
    const rows = students([{ n: 204 }, { n: 9, status: 'waitlist' }, { n: 2, status: 'withdrawn' }, { n: 18, status: 'graduated' }])
    const agg = rosterAggregate(rows)
    const mix = await analyticsMix(agg)
    const overview = suppressStudentAggregate(agg)
    expect(mix.status.withdrawn).toEqual({ value: null, suppressed: true })
    expect(mix.status.enrolled).toEqual({ value: 204, suppressed: false })
    for (const k of ['enrolled', 'waitlist', 'withdrawn', 'graduated'] as const) {
      expect(num(mix.status[k]), k).toBe(num(overview.counts.status[k] as Cell))
    }
    expect(JSON.stringify(mix.status)).not.toMatch(/"value":2\b/)
  })

  it('★ GET /enrollment/demographics leaves SUPPRESSED (it returned MENA 3 and share 0.0147 beside 204)', async () => {
    const race = { white: 108, hispanicLatino: 38, black: 27, asian: 16, twoOrMore: 12, mena: 3 }
    const shares = Object.fromEntries(Object.entries(race).map(([k, n]) => [k, n / 204]))
    const ctrl = Object.create(EnrollmentController.prototype) as EnrollmentController
    ;(ctrl as unknown as Record<string, unknown>).enrollment = {
      demographics: vi.fn(async () => ({
        observedOn: '2026-10-17',
        provider: 'roster',
        totalEnrolled: 204,
        gender: { counts: { female: 101, male: 103 }, shares: { female: 101 / 204, male: 103 / 204 } },
        ethnicity: null,
        race: { counts: race, shares, diversityIndex: 0.6577 },
        gradeMix: { counts: { K: 23 }, shares: { K: 1 } },
        source: 'roster',
      })),
    }
    const out = (await ctrl.demographics('school', undefined)) as unknown as {
      race: { counts: Record<string, Cell>; shares: Record<string, Cell>; diversityIndex: number }
      gender: { counts: Record<string, Cell> }
    }
    expect(out.race.counts.mena).toEqual({ suppressed: true })
    expect(out.race.counts.asian).toEqual(WITHHELD)
    expect(out.race.shares.mena).toEqual({ suppressed: true })
    expect(out.race.shares.asian).toEqual(WITHHELD)
    expect(out.race.diversityIndex).not.toBeCloseTo(0.6577, 3)
    expect(JSON.stringify(out)).not.toMatch(/0\.0147|"mena":3/)
    expect(out.gender.counts).toEqual({ female: 101, male: 103 })
  })
})
