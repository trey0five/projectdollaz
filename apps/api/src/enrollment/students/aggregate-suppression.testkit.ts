// ─────────────────────────────────────────────────────────────────────────────
// TEST KIT — the non-derivability walker the reviewer's MINOR asked for.
//
// Given a PUBLISHED roster payload and the RAW aggregate it was built from,
// `subtractionViolations` proves that no suppressed cell is recoverable by any
// SINGLE subtraction over the numbers actually published in that same payload.
// It walks every summing relation the shape carries:
//
//   · statuses  → filteredTotal (and `total` when the populations coincide)
//   · age bands → filteredTotal
//   · grades    → filteredTotal
//   · gender / race / ethnicity → filteredTotal (enforced only when the raw
//     fixture actually sums — null demographics are omitted upstream)
//   · flag components (iep + plan504 + ell) → flags.any, enforced only when the
//     raw sets are disjoint (equality holds) — otherwise only bounds exist
//   · KPI TWINS: kpis.waitlist ↔ status.waitlist, kpis.flagged ↔ flags.any,
//     kpis.enrolled ↔ status.enrolled — a hidden cell whose raw-equal twin is
//     published is simply republished, the reviewer's BLOCKER. A green run
//     MUST go red if anyone reintroduces a raw twin.
//
// Deliberately framework-free (no vitest import): specs assert
// `expect(subtractionViolations(pub, raw)).toEqual([])` and get the violation
// text as the diff when something regresses.
// ─────────────────────────────────────────────────────────────────────────────
import type { StudentAggregate } from './students.service.js'
import type { PublicCell } from './aggregate-suppression.js'
import { tallyByStatus, type TallyRow } from './aggregate-tally.js'
import type { AggregateFilterDim, AggregateSuppressionBasis } from './students.service.js'
import type { StudentFilterQueryDto } from './students.dto.js'

/** A payload under test — every section optional so Penny's slimmer
 *  get_roster_summary shape (no demographics, no filteredTotal) fits too. */
export interface PublishedRoster {
  total?: PublicCell
  filteredTotal?: PublicCell
  grade?: Record<string, PublicCell>
  status?: Record<string, PublicCell>
  gender?: Record<string, PublicCell>
  race?: Record<string, PublicCell>
  ethnicity?: Record<string, PublicCell>
  ageBand?: Record<string, PublicCell>
  flags?: { iep: PublicCell; plan504: PublicCell; ell: PublicCell; any: PublicCell }
  kpis?: { enrolled?: PublicCell; waitlist?: PublicCell; flagged?: PublicCell; newThisYear?: PublicCell }
  /** The status group the breakdowns count (the gate's `breakdown.status`).
   *  When set, grade/ageBand/gender/race/ethnicity are checked against THAT
   *  group's raw tally and its status cell, not against filteredTotal. */
  breakdownStatus?: string | null
}

const isNum = (c: PublicCell | undefined): c is number => typeof c === 'number'
const isHidden = (c: PublicCell | undefined): boolean =>
  !!c && typeof c === 'object' && (c as { suppressed?: unknown }).suppressed === true

const sum = (m: Partial<Record<string, number>> | undefined): number =>
  Object.values(m ?? {}).reduce<number>((s, n) => s + (typeof n === 'number' ? n : 0), 0)

interface Twin {
  /** Where the hidden cell lives, for the violation message. */
  cellPath: string
  cell: PublicCell | undefined
  cellRaw: number | undefined
  twinPath: string
  twin: PublicCell | undefined
  twinRaw: number | undefined
}

/**
 * Every way a suppressed cell in `pub` can be recovered exactly by one
 * subtraction (or one twin lookup) over `pub`'s own published numbers.
 * Empty array = the payload is safe against single-subtraction attacks.
 */
export function subtractionViolations(pub: PublishedRoster, raw: StudentAggregate): string[] {
  const violations: string[] = []
  const samePopulation = raw.filteredTotal === raw.total

  // ── Twins: the same quantity published under two names ─────────────────────
  const twins: Twin[] = []
  if (samePopulation) {
    // Over the whole roster these pairs count the same students.
    twins.push({
      cellPath: 'status.waitlist',
      cell: pub.status?.waitlist,
      cellRaw: raw.counts.status.waitlist,
      twinPath: 'kpis.waitlist',
      twin: pub.kpis?.waitlist,
      twinRaw: raw.kpis.waitlist,
    })
    twins.push({
      cellPath: 'status.enrolled',
      cell: pub.status?.enrolled,
      cellRaw: raw.counts.status.enrolled,
      twinPath: 'kpis.enrolled',
      twin: pub.kpis?.enrolled,
      twinRaw: raw.kpis.enrolled,
    })
    // flagged counts enrolled-only students, any counts all — a twin only when
    // the raw values actually coincide (they usually do: flags ride enrollment).
    if (raw.counts.flags.any === raw.kpis.flagged) {
      twins.push({
        cellPath: 'flags.any',
        cell: pub.flags?.any,
        cellRaw: raw.counts.flags.any,
        twinPath: 'kpis.flagged',
        twin: pub.kpis?.flagged,
        twinRaw: raw.kpis.flagged,
      })
    }
  }
  if (raw.filteredTotal === raw.total) {
    twins.push({
      cellPath: 'filteredTotal',
      cell: pub.filteredTotal,
      cellRaw: raw.filteredTotal,
      twinPath: 'total',
      twin: pub.total,
      twinRaw: raw.total,
    })
  }
  for (const t of twins) {
    if (t.cellRaw !== t.twinRaw) continue
    if (isHidden(t.cell) && isNum(t.twin)) {
      violations.push(`${t.cellPath} is suppressed but its raw twin ${t.twinPath}=${t.twin} republishes it`)
    }
    if (isHidden(t.twin) && isNum(t.cell)) {
      violations.push(`${t.twinPath} is suppressed but its raw twin ${t.cellPath}=${t.cell} republishes it`)
    }
  }

  /** A published cell OR its raw-equal twin is a number the attacker can read. */
  const effectivelyVisible = (path: string, cell: PublicCell | undefined): boolean => {
    if (isNum(cell)) return true
    const t = twins.find((x) => (x.cellPath === path || x.twinPath === path) && x.cellRaw === x.twinRaw)
    if (!t) return false
    const other = t.cellPath === path ? t.twin : t.cell
    return isNum(other)
  }

  // The group total for the filteredTotal-summing dimensions.
  const groupTotalVisible =
    effectivelyVisible('filteredTotal', pub.filteredTotal) ||
    (raw.filteredTotal === raw.total && isNum(pub.total))

  // ── Dimensions that sum to filteredTotal ───────────────────────────────────
  const dims: [string, Record<string, PublicCell> | undefined, Partial<Record<string, number>>][] = [
    ['status', pub.status, raw.counts.status],
    ['grade', pub.grade, raw.counts.grade],
    ['ageBand', pub.ageBand, raw.counts.ageBand],
    ['gender', pub.gender, raw.counts.gender],
    ['race', pub.race, raw.counts.race],
    ['ethnicity', pub.ethnicity, raw.counts.ethnicity],
  ]
  const bs = pub.breakdownStatus
  const bTally = bs && raw.suppressionBasis ? raw.suppressionBasis.base[bs as keyof typeof raw.suppressionBasis.base] : null
  for (const [name, dimPub, rawDimAll] of dims) {
    const dim = dimPub
    if (!dim) continue
    const isBreakdown = name !== 'status' && !!bTally
    const rawDim = isBreakdown ? (bTally![name as 'grade'] as Partial<Record<string, number>>) : rawDimAll
    const groupTotal = isBreakdown ? bTally!.n : raw.filteredTotal
    if (sum(rawDim) !== groupTotal) continue // the relation does not hold — no subtraction exists
    const totalVisible = isBreakdown
      ? isNum(pub.status?.[bs as string]) || (bs === 'enrolled' && isNum(pub.kpis?.enrolled) && samePopulation)
      : groupTotalVisible
    if (!totalVisible) continue
    const hiddenKeys = Object.keys(dim).filter((k) => !effectivelyVisible(`${name}.${k}`, dim[k]))
    if (hiddenKeys.length === 1) {
      violations.push(
        `${name}.${hiddenKeys[0]} is the ONLY hidden cell of a dimension that sums to a published total — it equals total − visible cells`,
      )
    }
    // The reverse direction: a hidden filteredTotal behind a fully-visible dimension.
    if (!isBreakdown && hiddenKeys.length === 0 && isHidden(pub.filteredTotal)) {
      violations.push(`filteredTotal is suppressed but ${name} is fully visible and sums to it`)
    }
  }

  // ── Flags: components vs `any` (equality only when the raw sets are disjoint) ─
  if (pub.flags) {
    const comp = ['iep', 'plan504', 'ell'] as const
    const disjoint = raw.counts.flags.iep + raw.counts.flags.plan504 + raw.counts.flags.ell === raw.counts.flags.any
    if (disjoint) {
      const anyVisible = effectivelyVisible('flags.any', pub.flags.any)
      const hiddenComponents = comp.filter((k) => !effectivelyVisible(`flags.${k}`, pub.flags?.[k]))
      if (anyVisible && hiddenComponents.length === 1) {
        violations.push(
          `flags.${hiddenComponents[0]} is the only hidden flag component beside a visible any — it equals any − visible components`,
        )
      }
      if (anyVisible && hiddenComponents.length > 1) {
        violations.push(
          `flags.{${hiddenComponents.join(',')}} are hidden beside a visible any — any − visible components is their exact sum, and every flag is bounded elsewhere`,
        )
      }
      if (!anyVisible && isHidden(pub.flags.any) && hiddenComponents.length === 0) {
        violations.push('flags.any is suppressed but every disjoint component is visible and sums to it')
      }
    }
  }

  return violations
}

/** No suppressed cell anywhere in the payload may carry a `value` key —
 *  structural honesty: the number must be UNREPRESENTABLE, not relabelled. */
export function suppressedCellsCarryNoValue(pub: PublishedRoster): string[] {
  const bad: string[] = []
  const walk = (path: string, v: unknown): void => {
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      if (o.suppressed === true) {
        if ('value' in o) bad.push(`${path} carries a value key beside suppressed:true`)
        return
      }
      for (const [k, child] of Object.entries(o)) walk(path ? `${path}.${k}` : k, child)
    }
  }
  walk('', pub)
  return bad
}

/**
 * The dimension rule on its own, for aggregate payloads that are not the
 * roster shape (the grade × year heatmap, and anything else that publishes a
 * set of cells beside their group total). Hidden = any cell that is not a plain
 * number (`{suppressed:true}` or `{value:null, suppressed:true}`).
 *   · a published (numeric) total with EXACTLY ONE hidden cell → that cell is
 *     total − visible cells;
 *   · a hidden cell is never LONE even without a total, when `requirePair` —
 *     the pair-sum alone may be derivable elsewhere, the individual cell not.
 */
export function loneHiddenCellViolations(
  name: string,
  cells: Record<string, unknown>,
  total: number | null | undefined,
  opts: { requirePair?: boolean } = {},
): string[] {
  const out: string[] = []
  const hidden = Object.keys(cells).filter((k) => typeof cells[k] !== 'number')
  if (hidden.length === 1 && typeof total === 'number') {
    out.push(`${name}.${hidden[0]} is the ONLY hidden cell beside a published total ${total} — it equals total − visible cells`)
  }
  if (hidden.length === 1 && opts.requirePair) {
    out.push(`${name}.${hidden[0]} is a LONE hidden cell — it needs a companion`)
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// ROW-LEVEL REFERENCE ROSTER (privacy review round 4). The gate decides from
// the suppression basis, so specs must build aggregates the way the service
// does: from STUDENT ROWS, through the same pure tally (aggregate-tally.ts),
// with an in-memory filter that mirrors StudentsService.buildWhere (grade /
// status / race / gender / ethnicity IN-lists, flags OR-ed, age bands from the
// row's band). The name search is not modelled — fixture rows carry no names.
// ─────────────────────────────────────────────────────────────────────────────

export interface FixtureStudent extends TallyRow {
  /** Enrolled this fiscal year (feeds kpis.newThisYear). */
  isNew?: boolean
}

export type FixtureQuery = Partial<Pick<StudentFilterQueryDto, 'grade' | 'status' | 'race' | 'gender' | 'ethnicity' | 'flags' | 'ageBand'>>

const FLAG_OF: Record<string, keyof Pick<TallyRow, 'hasIep' | 'has504' | 'ell'>> = { iep: 'hasIep', plan504: 'has504', ell: 'ell' }

/** The buildWhere semantics, in memory. */
export function matches(s: FixtureStudent, q: FixtureQuery): boolean {
  const inList = (v: string | null, list?: readonly string[]) => !list?.length || (v !== null && list.includes(v))
  if (!inList(s.grade, q.grade)) return false
  if (!inList(s.status, q.status)) return false
  if (!inList(s.race, q.race)) return false
  if (!inList(s.gender, q.gender)) return false
  if (!inList(s.ethnicity, q.ethnicity)) return false
  if (q.flags?.length && !q.flags.some((f) => s[FLAG_OF[f]])) return false
  if (q.ageBand?.length && !q.ageBand.includes(s.ageBand)) return false
  return true
}

/** StudentsService.aggregate over fixture rows — counts, kpis AND the basis. */
export function rosterAggregate(students: readonly FixtureStudent[], query: FixtureQuery = {}): StudentAggregate {
  const filtered = students.filter((s) => matches(s, query))
  const t = tallyByStatus(filtered)
  const status = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.n])) as StudentAggregate['counts']['status']
  // The raw counts are the filtered rows over ALL statuses, exactly as the service counts them.
  const sum = (pick: (x: (typeof t)['enrolled']) => Partial<Record<string, number>>) => {
    const out: Partial<Record<string, number>> = {}
    for (const v of Object.values(t)) for (const [k, n] of Object.entries(pick(v))) out[k] = (out[k] ?? 0) + (n ?? 0)
    return out
  }
  const ageBand = sum((v) => v.ageBand) as StudentAggregate['counts']['ageBand']
  const flags = { iep: 0, plan504: 0, ell: 0, any: 0 }
  for (const v of Object.values(t)) {
    flags.iep += v.flags.iep
    flags.plan504 += v.flags.plan504
    flags.ell += v.flags.ell
    flags.any += v.flags.any
  }
  const kpis = { enrolled: 0, waitlist: 0, flagged: 0, newThisYear: 0 }
  for (const s of students) {
    if (s.status === 'enrolled') {
      kpis.enrolled++
      if (s.hasIep || s.has504 || s.ell) kpis.flagged++
      if (s.isNew) kpis.newThisYear++
    } else if (s.status === 'waitlist') kpis.waitlist++
  }
  const statusSelection = query.status?.length ? [...query.status] : null
  const filterBases: AggregateSuppressionBasis['filterBases'] = {}
  const subsetBases: AggregateSuppressionBasis['subsetBases'] = {}
  for (const d of ['grade', 'race', 'gender', 'ethnicity', 'ageBand', 'flags'] as AggregateFilterDim[]) {
    const sel = query[d] as string[] | undefined
    if (!sel?.length) continue
    const q = { ...query, [d]: undefined, status: undefined }
    filterBases[d] = { selected: [...sel], tallies: tallyByStatus(students.filter((s) => matches(s, q))) }
    if (sel.length > 1) {
      for (const v of sel) {
        const qv = { ...query, status: undefined, [d]: sel.filter((x) => x !== v) }
        ;(subsetBases[d] ??= {})[v] = tallyByStatus(students.filter((s) => matches(s, qv as FixtureQuery)))
      }
    }
  }
  return {
    source: 'roster',
    total: students.length,
    filteredTotal: filtered.length,
    counts: {
      grade: sum((v) => v.grade),
      status,
      gender: sum((v) => v.gender),
      race: sum((v) => v.race),
      ethnicity: sum((v) => v.ethnicity),
      ageBand,
      flags,
    },
    kpis,
    suppressionBasis: {
      roster: tallyByStatus(students),
      base: tallyByStatus(students.filter((s) => matches(s, { ...query, status: undefined }))),
      statusSelection: statusSelection as AggregateSuppressionBasis['statusSelection'],
      filterBases,
      subsetBases,
      rosterRows: [...students],
      nameSearch: false,
    },
  }
}

/** Build fixture rows from per-status cell counts: `spec` lists groups of
 *  identical students. Deterministic. */
export function students(
  groups: { n: number; status?: string; grade?: string; gender?: string | null; race?: string | null; ethnicity?: string | null; ageBand?: TallyRow['ageBand']; iep?: boolean; p504?: boolean; ell?: boolean; isNew?: boolean }[],
): FixtureStudent[] {
  const out: FixtureStudent[] = []
  for (const g of groups) {
    for (let i = 0; i < g.n; i++) {
      out.push({
        status: g.status ?? 'enrolled',
        grade: g.grade ?? '5',
        gender: g.gender === undefined ? (out.length % 2 ? 'male' : 'female') : g.gender,
        race: g.race === undefined ? null : g.race,
        ethnicity: g.ethnicity === undefined ? null : g.ethnicity,
        ageBand: g.ageBand ?? '5to10',
        hasIep: g.iep ?? false,
        has504: g.p504 ?? false,
        ell: g.ell ?? false,
        isNew: g.isNew ?? false,
      })
    }
  }
  return out
}

/**
 * St. Aurelia Academy as seeded for the demo (the numbers the reviewer used):
 * 233 on the register — 204 enrolled, 6 waitlisted, 5 withdrawn, 18 graduated.
 * Race (all statuses) white 123 · hispanicLatino 42 · black 30 · asian 19 ·
 * twoOrMore 16 · mena 3; enrolled only white 108 · hispanicLatino 38 · black 27
 * · asian 16 · twoOrMore 12 · mena 3. Flags (all enrolled): ISP 14, 504 4,
 * ELL 9, any 25 (two ISP students also have a 504 plan). Grades K–8.
 */
export function aureliaRoster(): FixtureStudent[] {
  const grades = ['K', '1', '2', '3', '4', '5', '6', '7', '8']
  const enrolledRace: [string, number][] = [
    ['white', 108],
    ['hispanicLatino', 38],
    ['black', 27],
    ['asian', 16],
    ['twoOrMore', 12],
    ['mena', 3],
  ]
  const rows: FixtureStudent[] = []
  let i = 0
  for (const [race, n] of enrolledRace) {
    for (let j = 0; j < n; j++, i++) {
      rows.push({
        status: 'enrolled',
        grade: grades[i % grades.length],
        gender: i % 2 ? 'male' : 'female',
        race,
        ethnicity: race === 'hispanicLatino' ? 'hispanic' : 'nonHispanic',
        ageBand: i % grades.length < 1 ? 'under5' : i % grades.length < 6 ? '5to10' : '11to13',
        hasIep: false,
        has504: false,
        ell: false,
        isNew: i % 9 === 0,
      })
    }
  }
  // Flags on enrolled students (spread over races): ISP 14, 504 4 (two overlap ISP), ELL 9.
  const enrolled = rows.filter((r) => r.status === 'enrolled')
  for (let k = 0; k < 14; k++) enrolled[k * 7].hasIep = true
  enrolled[0].has504 = true
  enrolled[7].has504 = true
  enrolled[3].has504 = true
  enrolled[5].has504 = true
  for (const k of [1, 2, 4, 6, 8, 9, 10, 11, 12]) enrolled[k].ell = true
  // The not-enrolled 29: waitlist 6, withdrawn 5, graduated 18.
  const others: [string, string, number][] = [
    ['waitlist', 'white', 3], ['waitlist', 'hispanicLatino', 2], ['waitlist', 'asian', 1],
    ['withdrawn', 'black', 2], ['withdrawn', 'twoOrMore', 2], ['withdrawn', 'white', 1],
    ['graduated', 'white', 11], ['graduated', 'hispanicLatino', 2], ['graduated', 'asian', 2],
    ['graduated', 'black', 1], ['graduated', 'twoOrMore', 2],
  ]
  for (const [status, race, n] of others) {
    for (let j = 0; j < n; j++, i++) {
      rows.push({
        status,
        grade: status === 'graduated' ? '8' : grades[i % grades.length],
        gender: i % 2 ? 'male' : 'female',
        race,
        ethnicity: race === 'hispanicLatino' ? 'hispanic' : 'nonHispanic',
        ageBand: status === 'graduated' ? '14to18' : '5to10',
        hasIep: false,
        has504: false,
        ell: false,
      })
    }
  }
  return rows
}

/**
 * For HAND-BUILT unfiltered fixtures that predate the basis: synthesize one
 * under a stated assumption — every grade / demographic / age-band count belongs
 * to ENROLLED students and the other statuses are bare headcounts; flags belong
 * to enrolled students unless `enrolledFlags` says otherwise (the remainder is
 * then put on the waitlist group). Row-level fixtures (rosterAggregate) are the
 * real path; this keeps the older unit fixtures meaningful.
 */
export function withBasis(
  agg: StudentAggregate,
  opts: { enrolledFlags?: { iep: number; plan504: number; ell: number } } = {},
): StudentAggregate {
  const blank = (n: number) => ({ ...emptyTallyLike(), n })
  const ef = opts.enrolledFlags ?? { iep: agg.counts.flags.iep, plan504: agg.counts.flags.plan504, ell: agg.counts.flags.ell }
  const enrolled = {
    n: agg.counts.status.enrolled,
    grade: { ...agg.counts.grade },
    gender: { ...agg.counts.gender },
    race: { ...agg.counts.race },
    ethnicity: { ...agg.counts.ethnicity },
    ageBand: { ...agg.counts.ageBand },
    flags: { ...ef, any: opts.enrolledFlags ? agg.kpis.flagged : agg.counts.flags.any },
  }
  const rest = {
    iep: agg.counts.flags.iep - ef.iep,
    plan504: agg.counts.flags.plan504 - ef.plan504,
    ell: agg.counts.flags.ell - ef.ell,
    any: agg.counts.flags.any - enrolled.flags.any,
  }
  const roster = {
    enrolled,
    waitlist: { ...blank(agg.counts.status.waitlist), flags: rest },
    withdrawn: blank(agg.counts.status.withdrawn),
    graduated: blank(agg.counts.status.graduated),
  }
  return { ...agg, suppressionBasis: { roster, base: roster, statusSelection: null, filterBases: {}, subsetBases: {} } }
}

function emptyTallyLike() {
  return {
    n: 0,
    grade: {},
    gender: {},
    race: {},
    ethnicity: {},
    ageBand: { under5: 0, '5to10': 0, '11to13': 0, '14to18': 0, '19plus': 0, unknown: 0 },
    flags: { iep: 0, plan504: 0, ell: 0, any: 0 },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// THE LINEAR ATTACKER (privacy review round 4). Holds every payload in a set —
// any routes, any filters — and treats every published number as an equation
// over the unknown counts of each student PROFILE (status × grade × gender ×
// race × ethnicity × age band × flags × new). It is deliberately STRONGER than
// a real reader: it is told which profiles exist. A hidden cell is RECOVERED
// when its indicator lies in the span of the published equations (Gaussian
// elimination mod a prime). Hidden zeros are skipped (a zero is a fact about
// nobody, and this attacker knows the empty profiles anyway).
// ─────────────────────────────────────────────────────────────────────────────

/** One published surface: either a students/aggregate payload with its query,
 *  or a flat list of (predicate, cell) pairs for another surface. */
export type AttackSurface =
  | { name: string; query: FixtureQuery; pub: import('./aggregate-suppression.js').SuppressedStudentAggregate }
  | { name: string; cells: { path: string; where: (s: FixtureStudent) => boolean; cell: PublicCell | { value: number | null; suppressed: boolean } }[] }

const PRIME = 1_000_003
const modpow = (b: number, e: number): number => {
  let r = 1
  b %= PRIME
  while (e > 0) {
    if (e & 1) r = (r * b) % PRIME
    b = (b * b) % PRIME
    e >>= 1
  }
  return r
}

class Span {
  private rows: { pivot: number; v: number[] }[] = []
  reduce(v: number[]): number[] {
    const r = v.slice()
    for (const { pivot, v: row } of this.rows) {
      const c = r[pivot]
      if (!c) continue
      for (let j = 0; j < r.length; j++) if (row[j]) r[j] = (((r[j] - c * row[j]) % PRIME) + PRIME) % PRIME
    }
    return r
  }
  add(v: number[]): void {
    const r = this.reduce(v)
    const pivot = r.findIndex((x) => x !== 0)
    if (pivot < 0) return
    const inv = modpow(r[pivot], PRIME - 2)
    for (let j = 0; j < r.length; j++) r[j] = (r[j] * inv) % PRIME
    for (const row of this.rows) {
      const c = row.v[pivot]
      if (!c) continue
      for (let j = 0; j < r.length; j++) if (r[j]) row.v[j] = (((row.v[j] - c * r[j]) % PRIME) + PRIME) % PRIME
    }
    this.rows.push({ pivot, v: r })
  }
  contains(v: number[]): boolean {
    return this.reduce(v).every((x) => x === 0)
  }
}

const cellValue = (c: unknown): number | null => {
  if (typeof c === 'number') return c
  if (c && typeof c === 'object' && (c as { suppressed?: boolean }).suppressed === false) return (c as { value: number }).value
  return null
}
const cellHidden = (c: unknown): boolean => !!c && typeof c === 'object' && (c as { suppressed?: boolean }).suppressed === true

/** Every (path, predicate, cell) a students/aggregate payload publishes. */
function aggregateCells(name: string, query: FixtureQuery, pub: import('./aggregate-suppression.js').SuppressedStudentAggregate) {
  const q = (s: FixtureStudent) => matches(s, query)
  const out: { path: string; where: (s: FixtureStudent) => boolean; cell: unknown }[] = []
  out.push({ path: `${name}.total`, where: () => true, cell: pub.total })
  out.push({ path: `${name}.filteredTotal`, where: q, cell: pub.filteredTotal })
  for (const [k, c] of Object.entries(pub.counts.status)) out.push({ path: `${name}.status.${k}`, where: (s) => q(s) && s.status === k, cell: c })
  const bs = pub.breakdown.status
  if (bs) {
    for (const dim of ['grade', 'gender', 'race', 'ethnicity', 'ageBand'] as const) {
      for (const [k, c] of Object.entries(pub.counts[dim])) {
        out.push({ path: `${name}.${dim}.${k}`, where: (s) => q(s) && s.status === bs && s[dim] === k, cell: c })
      }
    }
  }
  const fl = { iep: 'hasIep', plan504: 'has504', ell: 'ell' } as const
  for (const f of ['iep', 'plan504', 'ell'] as const) out.push({ path: `${name}.flags.${f}`, where: (s) => q(s) && s[fl[f]], cell: pub.counts.flags[f] })
  out.push({ path: `${name}.flags.any`, where: (s) => q(s) && (s.hasIep || s.has504 || s.ell), cell: pub.counts.flags.any })
  out.push({ path: `${name}.kpis.enrolled`, where: (s) => s.status === 'enrolled', cell: pub.kpis.enrolled })
  out.push({ path: `${name}.kpis.waitlist`, where: (s) => s.status === 'waitlist', cell: pub.kpis.waitlist })
  out.push({ path: `${name}.kpis.flagged`, where: (s) => s.status === 'enrolled' && (s.hasIep || s.has504 || s.ell), cell: pub.kpis.flagged })
  out.push({ path: `${name}.kpis.newThisYear`, where: (s) => s.status === 'enrolled' && !!s.isNew, cell: pub.kpis.newThisYear })
  return out
}

/** The dimensions a probe crosses (every 1-way and 2-way cell). */
const PROBE_DIMS: { name: string; values: (rows: readonly FixtureStudent[]) => string[]; test: (s: FixtureStudent, v: string) => boolean }[] = [
  { name: 'status', values: () => ['enrolled', 'waitlist', 'withdrawn', 'graduated', 'notEnrolled'], test: (s, v) => (v === 'notEnrolled' ? s.status !== 'enrolled' : s.status === v) },
  ...(['grade', 'gender', 'race', 'ethnicity', 'ageBand'] as const).map((d) => ({
    name: d,
    values: (rows: readonly FixtureStudent[]) => [...new Set(rows.map((r) => r[d]).filter((x): x is string => !!x))],
    test: (s: FixtureStudent, v: string) => s[d] === v,
  })),
  { name: 'flag', values: () => ['iep', 'plan504', 'ell'], test: (s, v) => (v === 'iep' ? s.hasIep : v === 'plan504' ? s.has504 : s.ell) },
]

/**
 * Every SMALL quantity (1..floor−1) that the published numbers of ALL
 * `surfaces` determine exactly: each hidden small cell they publish, and —
 * with `probes` — every 1-way and 2-way cross-tab of the roster (status incl.
 * "not enrolled" × grade × gender × race × ethnicity × age band × flag) that is
 * small, published or not. Plus any published number that does not match the
 * rows (the harness's own model check: the predicates above must agree with
 * what the gate publishes).
 */
export function linearRecoveries(
  rows: readonly FixtureStudent[],
  surfaces: readonly AttackSurface[],
  opts: {
    probes?: boolean
    floor?: number
    /** 'present' (default): the attacker is told which profiles exist — the
     *  STRONG model, cheap on a big roster. 'vocabulary': every combination of
     *  the values the register publishes (its facets) is an unknown — the
     *  realistic reader, affordable on a compact fixture. */
    profiles?: 'present' | 'vocabulary'
  } = {},
): string[] {
  const floor = opts.floor ?? 5
  const profileKey = (s: FixtureStudent) =>
    JSON.stringify([s.status, s.grade, s.gender, s.race, s.ethnicity, s.ageBand, s.hasIep, s.has504, s.ell, !!s.isNew])
  let reps: FixtureStudent[]
  if (opts.profiles === 'vocabulary') {
    const vals = <T,>(f: (s: FixtureStudent) => T): T[] => [...new Set(rows.map(f))]
    reps = []
    for (const status of vals((s) => s.status))
      for (const grade of vals((s) => s.grade))
        for (const gender of vals((s) => s.gender))
          for (const race of vals((s) => s.race))
            for (const ethnicity of vals((s) => s.ethnicity))
              for (const ageBand of vals((s) => s.ageBand))
                for (const hasIep of vals((s) => s.hasIep))
                  for (const has504 of vals((s) => s.has504))
                    for (const ell of vals((s) => s.ell))
                      for (const isNew of vals((s) => !!s.isNew))
                        reps.push({ status, grade, gender, race, ethnicity, ageBand, hasIep, has504, ell, isNew })
  } else {
    const seen = new Map<string, FixtureStudent>()
    for (const s of rows) if (!seen.has(profileKey(s))) seen.set(profileKey(s), s)
    reps = [...seen.values()]
  }
  const index = new Map(reps.map((p, i) => [profileKey(p), i]))
  const counts = new Array(reps.length).fill(0)
  for (const s of rows) counts[index.get(profileKey(s))!]++
  const vec = (where: (s: FixtureStudent) => boolean): number[] => reps.map((r) => (where(r) ? 1 : 0))
  const count = (v: number[]): number => v.reduce((t: number, x, i) => t + x * counts[i], 0)
  const small = (n: number) => n > 0 && n < floor

  const cells = surfaces.flatMap((sf) =>
    'query' in sf ? aggregateCells(sf.name, sf.query, sf.pub) : sf.cells.map((c) => ({ ...c, path: `${sf.name}.${c.path}` })),
  )
  const span = new Span()
  const problems: string[] = []
  const secrets: { path: string; v: number[]; truth: number }[] = []
  for (const c of cells) {
    const v = vec(c.where)
    const truth = count(v)
    const val = cellValue(c.cell)
    if (val !== null) {
      if (val !== truth) problems.push(`MODEL: ${c.path} publishes ${val} but its rows count ${truth}`)
      span.add(v)
    } else if (cellHidden(c.cell) && small(truth)) {
      secrets.push({ path: c.path, v, truth })
    }
  }
  if (opts.probes) {
    for (let a = 0; a < PROBE_DIMS.length; a++) {
      for (const va of PROBE_DIMS[a].values(rows)) {
        const one = (s: FixtureStudent) => PROBE_DIMS[a].test(s, va)
        const v1 = vec(one)
        if (small(count(v1))) secrets.push({ path: `probe ${PROBE_DIMS[a].name}=${va}`, v: v1, truth: count(v1) })
        // Two lists of the same flag dimension (ISP AND ELL) are a cross-tab too.
        if (PROBE_DIMS[a].name === 'flag') {
          for (const vb of PROBE_DIMS[a].values(rows)) {
            if (vb <= va) continue
            const v2 = vec((s) => one(s) && PROBE_DIMS[a].test(s, vb))
            if (small(count(v2))) secrets.push({ path: `probe flag=${va} × flag=${vb}`, v: v2, truth: count(v2) })
          }
        }
        for (let b = a + 1; b < PROBE_DIMS.length; b++) {
          for (const vb of PROBE_DIMS[b].values(rows)) {
            const v2 = vec((s) => one(s) && PROBE_DIMS[b].test(s, vb))
            if (small(count(v2)))
              secrets.push({ path: `probe ${PROBE_DIMS[a].name}=${va} × ${PROBE_DIMS[b].name}=${vb}`, v: v2, truth: count(v2) })
          }
        }
      }
    }
  }
  for (const h of secrets) if (span.contains(h.v)) problems.push(`${h.path} (= ${h.truth}, small) is determined by the published numbers`)
  return problems
}

// ─────────────────────────────────────────────────────────────────────────────
// THE INTEGER ATTACKER (privacy review round 6). The linear attacker above only
// solves EQUALITIES, so it cannot see what the labels and signs say: a "<5" is
// 1..floor−1, an honest "withheld" (a companion in a group that also shows a
// "<5") is 0 or at least the floor, and every count is a non-negative integer.
// Those bounds pinned St. Aurelia's 504 students exactly (one in each of K, 3,
// 5 and 7) from grade reads alone, and a published column total pinned a
// companion. This attacker holds every payload, turns each published number
// into an equality, each label into bounds (or the 0-or-≥-floor disjunction),
// and runs INTERVAL PROPAGATION over the unknown profile counts to a fixpoint.
// A hidden small cell (or, with `probes`, any small 1-way / 2-way cross-tab)
// is RECOVERED when its derived range no longer covers the whole of
// 1..floor−1 — exact, or merely narrowed ("at least 3").
//
// Propagation is a relaxation of what an integer solver can prove, so a clean
// run is a strong regression net, not a proof; the out-of-tree MILP check the
// round-6 fix was verified with is the exact version of the same attack.
// ─────────────────────────────────────────────────────────────────────────────

type ProfileMode = 'present' | 'vocabulary' | 'reduced'

/** The attacker's unknowns: one count per student profile. */
function profileSpace(rows: readonly FixtureStudent[], mode: ProfileMode) {
  const fullKey = (s: FixtureStudent) =>
    JSON.stringify([s.status, s.grade, s.gender, s.race, s.ethnicity, s.ageBand, s.hasIep, s.has504, s.ell, !!s.isNew])
  const reducedKey = (s: FixtureStudent) => JSON.stringify([s.status, s.grade, s.hasIep, s.has504, s.ell])
  const key = mode === 'reduced' ? reducedKey : fullKey
  const vals = <T,>(f: (s: FixtureStudent) => T): T[] => [...new Set(rows.map(f))]
  let reps: FixtureStudent[] = []
  if (mode === 'reduced') {
    for (const status of vals((s) => s.status))
      for (const grade of vals((s) => s.grade))
        for (const hasIep of [false, true])
          for (const has504 of [false, true])
            for (const ell of [false, true])
              reps.push({ status, grade, gender: null, race: null, ethnicity: null, ageBand: '5to10', hasIep, has504, ell, isNew: false })
  } else if (mode === 'vocabulary') {
    for (const status of vals((s) => s.status))
      for (const grade of vals((s) => s.grade))
        for (const gender of vals((s) => s.gender))
          for (const race of vals((s) => s.race))
            for (const ethnicity of vals((s) => s.ethnicity))
              for (const ageBand of vals((s) => s.ageBand))
                for (const hasIep of vals((s) => s.hasIep))
                  for (const has504 of vals((s) => s.has504))
                    for (const ell of vals((s) => s.ell))
                      for (const isNew of vals((s) => !!s.isNew))
                        reps.push({ status, grade, gender, race, ethnicity, ageBand, hasIep, has504, ell, isNew })
  } else {
    const seen = new Map<string, FixtureStudent>()
    for (const s of rows) if (!seen.has(key(s))) seen.set(key(s), s)
    reps = [...seen.values()]
  }
  const index = new Map(reps.map((p, i) => [key(p), i]))
  const counts = new Array<number>(reps.length).fill(0)
  for (const s of rows) counts[index.get(key(s))!]++
  return { reps, counts }
}

/** A cell the REDUCED (status × grade × flags) attacker can express exactly. */
const reducedCell = (path: string) => !/\.(gender|race|ethnicity|ageBand)\.|newThisYear$/.test(path)
const reducedQuery = (q: FixtureQuery) => Object.keys(q).every((k) => k === 'grade' || k === 'status' || k === 'flags')

export interface IntegerAttackOptions {
  probes?: boolean
  floor?: number
  /** 'present' (default, the STRONG model: told which profiles exist),
   *  'vocabulary' (every combination of published values), or 'reduced'
   *  (status × grade × the three flags, using only the reads and cells that
   *  model can express — cheap and realistic on a full-size roster). */
  profiles?: ProfileMode
  /** false: ignore what the labels say (every hidden cell is just ≥ 0). */
  labels?: boolean
}

/**
 * Every small quantity whose range the published numbers AND labels of all
 * `surfaces` narrow below the whole of 1..floor−1 (see the block comment), plus
 * any published number that does not match the rows (the model check).
 */
export function integerRecoveries(
  rows: readonly FixtureStudent[],
  surfaces: readonly AttackSurface[],
  opts: IntegerAttackOptions = {},
): string[] {
  const floor = opts.floor ?? 5
  const mode = opts.profiles ?? 'present'
  const useLabels = opts.labels !== false
  const { reps, counts } = profileSpace(rows, mode)
  const P = reps.length
  const N = rows.length
  const small = (n: number) => n > 0 && n < floor

  let cells = surfaces.flatMap((sf) =>
    'query' in sf
      ? mode === 'reduced' && !reducedQuery(sf.query)
        ? []
        : aggregateCells(sf.name, sf.query, sf.pub)
      : sf.cells.map((c) => ({ ...c, path: `${sf.name}.${c.path}` })),
  )
  if (mode === 'reduced') cells = cells.filter((c) => reducedCell(c.path))

  // A "withheld" is HONEST (0 or ≥ floor) when its group also carries a bare
  // "<5": that group tells small cells from companions, so a companion is not
  // small. A group that labels every hidden cell alike says nothing.
  const groupOf = (path: string) => path.slice(0, path.lastIndexOf('.'))
  const leafOf = (path: string) => path.slice(path.lastIndexOf('.') + 1)
  const isBareSmall = (c: unknown) =>
    cellHidden(c) && !(c as { reason?: string }).reason
  const honestGroups = new Set<string>()
  for (const c of cells) {
    const g = groupOf(c.path)
    if (g.endsWith('.kpis') || leafOf(c.path) === 'total' || leafOf(c.path) === 'filteredTotal') continue
    if (isBareSmall(c.cell)) honestGroups.add(g)
  }

  // One interval per DISTINCT set of profiles: two cells over the same
  // students (a grade read's 504 count and the probe "grade K × 504") are one
  // unknown, and their bounds meet.
  interface Con { paths: string[]; secrets: string[]; idx: number[]; bits: Uint32Array; lo: number; hi: number; disj: boolean; truth: number }
  const W = Math.ceil(P / 32) || 1
  const byKey = new Map<string, Con>()
  const cons: Con[] = []
  const problems: string[] = []
  const conOf = (idx: number[], path: string): Con => {
    const key = idx.join(',')
    let c = byKey.get(key)
    if (!c) {
      const bits = new Uint32Array(W)
      for (const i of idx) bits[i >>> 5] |= 1 << (i & 31)
      c = { paths: [], secrets: [], idx, bits, lo: 0, hi: N, disj: false, truth: idx.reduce((t, i) => t + counts[i], 0) }
      byKey.set(key, c)
      cons.push(c)
    }
    c.paths.push(path)
    return c
  }
  const add = (path: string, where: (s: FixtureStudent) => boolean, kind: 'value' | 'small' | 'honest' | 'free', value = 0) => {
    const idx: number[] = []
    for (let i = 0; i < P; i++) if (where(reps[i])) idx.push(i)
    const c = conOf(idx, path)
    if (kind === 'value' && value !== c.truth) problems.push(`MODEL: ${path} publishes ${value} but its rows count ${c.truth}`)
    const [lo, hi] = kind === 'value' ? [value, value] : kind === 'small' ? [1, floor - 1] : [0, N]
    c.lo = Math.max(c.lo, lo)
    c.hi = Math.min(c.hi, hi)
    if (kind === 'honest') c.disj = true
    if (kind !== 'value' && small(c.truth)) c.secrets.push(path)
  }
  for (const c of cells) {
    const val = cellValue(c.cell)
    if (val !== null) add(c.path, c.where, 'value', val)
    else if (cellHidden(c.cell)) {
      const g = groupOf(c.path)
      const isKpiOrTotal = g.endsWith('.kpis') || leafOf(c.path) === 'total' || leafOf(c.path) === 'filteredTotal'
      const kind = !useLabels
        ? 'free'
        : isBareSmall(c.cell)
          ? 'small'
          : !isKpiOrTotal && honestGroups.has(g)
            ? 'honest'
            : 'free'
      add(c.path, c.where, kind)
    }
  }
  if (opts.probes) {
    const probeDims = PROBE_DIMS.filter((d) => mode !== 'reduced' || d.name === 'status' || d.name === 'grade' || d.name === 'flag')
    for (let a = 0; a < probeDims.length; a++) {
      for (const va of probeDims[a].values(rows)) {
        const one = (s: FixtureStudent) => probeDims[a].test(s, va)
        add(`probe ${probeDims[a].name}=${va}`, one, 'free')
        if (probeDims[a].name === 'flag')
          for (const vb of probeDims[a].values(rows))
            if (vb > va) add(`probe flag=${va} × flag=${vb}`, (s) => one(s) && probeDims[a].test(s, vb), 'free')
        for (let b = a + 1; b < probeDims.length; b++)
          for (const vb of probeDims[b].values(rows))
            add(`probe ${probeDims[a].name}=${va} × ${probeDims[b].name}=${vb}`, (s) => one(s) && probeDims[b].test(s, vb), 'free')
      }
    }
  }

  // NESTED SETS. Interval propagation over profiles cannot subtract one sum
  // from another ("male − male enrolled = male not enrolled"), so every pair of
  // published sets where one contains the other adds the relation
  // A = B + (A \ B), with A \ B an interval of its own.
  const rels: [Con, Con, Con][] = []
  const original = [...cons]
  const subset = (b: Con, a: Con) => {
    for (let w = 0; w < W; w++) if ((b.bits[w] & ~a.bits[w]) !== 0) return false
    return true
  }
  for (const a of original) {
    for (const b of original) {
      if (b === a || b.idx.length === 0 || b.idx.length >= a.idx.length || !subset(b, a)) continue
      const d = conOf(
        a.idx.filter((i) => (b.bits[i >>> 5] & (1 << (i & 31))) === 0),
        `${a.paths[0]} − ${b.paths[0]}`,
      )
      rels.push([a, b, d])
    }
  }

  // Interval propagation to a fixpoint.
  const lo = new Array<number>(P).fill(0)
  const hi = new Array<number>(P).fill(N)
  const tighten = (c: Con, nLo: number, nHi: number): boolean => {
    let cLo = Math.max(c.lo, nLo)
    let cHi = Math.min(c.hi, nHi)
    if (c.disj) {
      if (cLo > 0 && cLo < floor) cLo = floor
      if (cHi < floor) cHi = 0
    }
    if (cLo > cHi) throw new Error(`MODEL: ${c.paths[0]} has no consistent value (${cLo} > ${cHi})`)
    if (cLo === c.lo && cHi === c.hi) return false
    c.lo = cLo
    c.hi = cHi
    return true
  }
  try {
    for (let round = 0, changed = true; changed && round < 500; round++) {
      changed = false
      for (const c of cons) {
        let sLo = 0
        let sHi = 0
        for (const i of c.idx) {
          sLo += lo[i]
          sHi += hi[i]
        }
        if (tighten(c, sLo, sHi)) changed = true
        for (const i of c.idx) {
          const nLo = Math.max(lo[i], c.lo - (sHi - hi[i]))
          const nHi = Math.min(hi[i], c.hi - (sLo - lo[i]))
          if (nLo !== lo[i] || nHi !== hi[i]) {
            lo[i] = nLo
            hi[i] = nHi
            changed = true
          }
        }
      }
      for (const [a, b, d] of rels) {
        if (tighten(a, b.lo + d.lo, b.hi + d.hi)) changed = true
        if (tighten(b, a.lo - d.hi, a.hi - d.lo)) changed = true
        if (tighten(d, a.lo - b.hi, a.hi - b.lo)) changed = true
      }
    }
  } catch (e) {
    problems.push((e as Error).message)
    return problems
  }
  for (const c of cons) {
    if (c.secrets.length === 0) continue
    if (c.lo > 1 || c.hi < floor - 1)
      for (const path of c.secrets)
        problems.push(
          `${path} (= ${c.truth}, small) is ${c.lo === c.hi ? 'determined' : `narrowed to ${c.lo}..${c.hi}`} by the published numbers and labels`,
        )
  }
  return problems
}

/**
 * NON-VACUITY HELPER: a students/aggregate surface re-labelled the ROUND-5 way —
 * each hidden cell by its own size ("<5" when it is 1..floor−1, "withheld"
 * otherwise). Specs hand it to the integer attacker to show the uniform label
 * is load-bearing: the same payload, labelled by size, gives cells back.
 */
export function labelledBySize(rows: readonly FixtureStudent[], sf: AttackSurface, floor = 5): AttackSurface {
  if (!('query' in sf)) return sf
  const prefix = `${sf.name}.`
  return {
    name: sf.name,
    cells: aggregateCells(sf.name, sf.query, sf.pub).map((c) => {
      const truth = rows.filter(c.where).length
      const cell = cellHidden(c.cell)
        ? truth > 0 && truth < floor
          ? { suppressed: true as const }
          : { suppressed: true as const, reason: 'complementary' as const }
        : (c.cell as PublicCell)
      return { path: c.path.startsWith(prefix) ? c.path.slice(prefix.length) : c.path, where: c.where, cell }
    }),
  }
}

/** Deterministic PRNG (mulberry32) — sweeps are identical on every run. */
export function seededRandom(seed: number): () => number {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A compact, small-cell-heavy school (90 students; 3 statuses × 3 grades ×
 *  2 genders × 3 races × ISP/ELL) — small enough that the REALISTIC attacker
 *  (every vocabulary profile an unknown) runs in milliseconds. */
export function compactSchool(seed: number): FixtureStudent[] {
  const r = seededRandom(seed)
  const g: Parameters<typeof students>[0] = []
  for (let i = 0; i < 90; i++) {
    const status = r() < 0.8 ? 'enrolled' : r() < 0.5 ? 'waitlist' : 'withdrawn'
    g.push({
      n: 1,
      status,
      grade: ['K', '1', '2'][Math.floor(r() * 3)],
      gender: r() < 0.5 ? 'female' : 'male',
      race: r() < 0.6 ? 'white' : r() < 0.7 ? 'black' : 'asian',
      ethnicity: null,
      ageBand: '5to10',
      iep: r() < 0.15,
      ell: r() < 0.12,
    })
  }
  return students(g)
}

/** Every request the compact school's filter bar can make with up to two
 *  dimensions and one or two values per dimension (250 incl. unfiltered). */
export function compactQueries(): FixtureQuery[] {
  const V: Record<string, string[]> = {
    grade: ['K', '1', '2'],
    status: ['enrolled', 'waitlist', 'withdrawn'],
    race: ['white', 'black', 'asian'],
    gender: ['female', 'male'],
    flags: ['iep', 'ell'],
  }
  const sels = (d: string) => {
    const vs = V[d]
    const o: string[][] = vs.map((v) => [v])
    for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) o.push([vs[i], vs[j]])
    return o
  }
  const out: FixtureQuery[] = [{}]
  const dims = Object.keys(V)
  for (const a of dims)
    for (const sa of sels(a)) {
      out.push({ [a]: sa } as FixtureQuery)
      for (const b of dims) if (b > a) for (const sb of sels(b)) out.push({ [a]: sa, [b]: sb } as FixtureQuery)
    }
  return out
}

/** A small-cell-heavy school with FOUR statuses and ALL THREE flags (the
 *  compact school has neither graduated students nor 504 plans): 3 grades ×
 *  2 genders × 3 races, so the realistic (vocabulary) attacker stays cheap. */
export function mixedSchool(seed: number, n = 120): FixtureStudent[] {
  const r = seededRandom(seed)
  const g: Parameters<typeof students>[0] = []
  for (let i = 0; i < n; i++) {
    const x = r()
    const status = x < 0.75 ? 'enrolled' : x < 0.85 ? 'waitlist' : x < 0.93 ? 'withdrawn' : 'graduated'
    const y = r()
    g.push({
      n: 1,
      status,
      grade: ['K', '1', '2'][Math.floor(r() * 3)],
      gender: r() < 0.5 ? 'female' : 'male',
      race: y < 0.6 ? 'white' : y < 0.85 ? 'black' : 'asian',
      ethnicity: null,
      ageBand: '5to10',
      iep: r() < 0.14,
      p504: r() < 0.08,
      ell: r() < 0.12,
    })
  }
  return students(g)
}

/** Every SINGLE-DIMENSION read a school's filter bar can make — one or two
 *  values of one of grade / gender / race / ethnicity / age band / flags, each
 *  with no status or one status — plus every single-status read. Together with
 *  the unfiltered read this is the whole canonical release (aggregate-joint.ts):
 *  an attacker holding all of it at once holds every pair and triple. */
export function singleDimensionQueries(
  school: readonly FixtureStudent[],
  opts: { maxValues?: 2 | 3 } = {},
): FixtureQuery[] {
  const out: FixtureQuery[] = []
  const vals = (d: 'grade' | 'gender' | 'race' | 'ethnicity' | 'ageBand') =>
    [...new Set(school.map((s) => s[d]).filter((v): v is NonNullable<typeof v> => !!v))] as string[]
  const statuses = ['enrolled', 'waitlist', 'withdrawn', 'graduated']
  for (const s of statuses) out.push({ status: [s] } as FixtureQuery)
  const dims: [string, string[]][] = [
    ['grade', vals('grade')],
    ['gender', vals('gender')],
    ['race', vals('race')],
    ['ethnicity', vals('ethnicity')],
    ['ageBand', vals('ageBand')],
    ['flags', ['iep', 'plan504', 'ell']],
  ]
  for (const [d, vs] of dims) {
    const sels: string[][] = vs.map((v) => [v])
    for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) sels.push([vs[i], vs[j]])
    // Three-value selections (?grade=K,1,2) are sums of rows too, and the
    // gate decides them with their own one-step neighbours.
    if (opts.maxValues === 3)
      for (let i = 0; i < vs.length; i++)
        for (let j = i + 1; j < vs.length; j++) for (let k = j + 1; k < vs.length; k++) sels.push([vs[i], vs[j], vs[k]])
    for (const sel of sels) {
      out.push({ [d]: sel } as FixtureQuery)
      for (const s of statuses) out.push({ [d]: sel, status: [s] } as FixtureQuery)
    }
  }
  return out
}
