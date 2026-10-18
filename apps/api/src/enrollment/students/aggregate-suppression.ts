// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC-SURFACE suppression for the raw StudentAggregate (privacy hardening F1,
// review round 4).
//
// StudentsService.aggregate returns TRUE counts plus a suppression BASIS (the
// whole roster, the request without its status filter, the request without each
// attribute filter — all split by status). The twin reads the raw counts and
// gates them itself; everything PUBLIC passes through this module: GET
// …/students/aggregate (viewer-readable), KYRO's get_roster_summary (an LLM
// egress), and the enrollment analytics "who's here" card (buildMix). A
// suppressed cell carries NO value key. On the UNFILTERED read a small cell is
// `{ suppressed: true }` ("<5") and a cell hidden only to protect another adds
// `reason: 'complementary'` ("withheld"). On EVERY FILTERED read each hidden
// cell — small, companion or zero — carries the one label
// `{ suppressed: true, reason: 'complementary' }` (review round 6: per-row
// size labels under a column hidden in every row let a reader count the small
// rows against the published column total).
//
// WHAT IS PUBLISHED, AND OVER WHICH POPULATION:
//   · `total`, `kpis.enrolled` — whole-school totals, raw by product decision.
//   · `filteredTotal` — raw on the unfiltered read. On a filtered read it
//     counts every status while the breakdowns count the enrolled, so it is
//     withheld whenever the request's not-enrolled remainder is small, when its
//     row of the X × status table cannot be protected (aggregate-joint.ts
//     totalHidden), and floored under any ATTRIBUTE filter. On a real school
//     that is MOST single-grade and single-value reads (St. Aurelia: every
//     grade has a handful of waitlisted or withdrawn students), so a surface
//     that wants a headline for a filtered read uses the PUBLISHED enrolled
//     count (`counts.status.enrolled`), not filteredTotal.
//   · `counts.status` — the request's rows by status. `enrolled` is PINNED (raw)
//     on the whole roster and whenever it is at or above the floor, because the
//     breakdowns below count exactly those students and would republish it.
//   · BREAKDOWNS (`grade`, `gender`, `race`, `ethnicity`, `ageBand`) — counted
//     over ONE status group: ENROLLED students unless the request picks a single
//     other status; withheld when it picks several. This is the linked-tables
//     answer for status (review round 4): the enrollment analytics card, KYRO's
//     demographics, the org compare profile and /enrollment/demographics all
//     publish ENROLLED demographics, so the roster read publishing all statuses
//     beside them handed back every not-enrolled cell by subtraction ("asian 19
//     here, 16 on the analytics card ⇒ 3 not-enrolled Asian students"). Now no
//     published breakdown is the sum of two others. Grade cells stay RAW on
//     unfiltered/grade-only reads (directory-style, the documented line) and are
//     cross-tabs, gated like the rest, under an attribute filter.
//   · `counts.flags` — support flags over ALL statuses of the request (the same
//     population the accreditation twin publishes against its 10 floor), one
//     overlap rule (`suppressOverlapGroup`). Withheld under a status filter: a
//     per-status flag block beside the all-status one is the same subtraction.
//     On the whole-school strip `any` also follows the per-flag lattice rule
//     (aggregate-joint.ts flagUnionHidden): withheld when the students on one
//     list who are also on another are a small group.
//   · `kpis.waitlist` — follows the WHOLE ROSTER's status decision on every read
//     (a filtered read used to fall back to the raw figure and hand back the
//     companion the unfiltered read hid).
//   · `kpis.flagged` (enrolled students with any flag) — withheld whenever a
//     flag is hidden among enrolled students, among all students, or among the
//     not-enrolled remainder, and under the same lattice rule.
//   · `facets` — which values exist anywhere on the register, for the filter
//     pickers. Presence only, never a count (the '<5' label already concedes it).
//
// WHEN A FILTERED READ IS WITHHELD WHOLE (`withheld: 'all'`): under an attribute
// filter, the read is a narrowing of other reads, and narrowing to a cell those
// reads hide undoes the hiding — `?race=twoOrMore` returned the companion the
// unfiltered race chart hid, `?flags=iep,plan504` returned ISP ∪ 504 beside a
// visible ISP. So for every filtered dimension, each SELECTED value must be
// visible in that dimension's published decision on the read with the filter
// removed AND on the whole roster (support flags: among all, enrolled and
// not-enrolled students). Otherwise filteredTotal and every breakdown are
// withheld. Separately, when the request's not-enrolled remainder is small,
// filteredTotal alone is withheld: it counts all statuses while the breakdowns
// count the enrolled, so a small remainder would be their difference.
//
// ONE STEP AWAY (review round 4). Every filtered read also decides its cells
// jointly with what subtraction against its NEIGHBOURS would count: the read
// with only its status filter, the read with each other filter removed, and —
// for a multi-value selection — the read with each value dropped. A small cell
// in any of those differences is hidden here too, and filteredTotal is
// withheld when a difference's total (or its not-enrolled part) is small.
//
// ACROSS READS (review round 5, aggregate-joint.ts). Every read that is broken
// down narrows on at most ONE of grade / gender / race / ethnicity / age band
// (any of its values, with or without one status), or on one support flag, or
// on status alone. Its rows are rows and columns of TWO-WAY TABLES whose hiding
// pattern is decided once, over the whole roster, as whole rows and whole
// columns: ?grade=K's race breakdown and ?race=black's grade breakdown make the
// same decision about (K, black), the status partitions of ?grade=K and
// ?grade=1 hide the same statuses, their flag strips the same flags, and their
// totals are one partition of the school's not-enrolled students. A read that
// narrows on TWO such dimensions, on several flags, or on a name search
// (?q=sm vs ?q=smi differ by one named student) is withheld whole
// (`withheldReason`). Filtered breakdowns list EVERY value of the register's
// vocabulary (zeros as 0 or withheld): an omitted zero told the reader it was
// zero, so a group with one listed, withheld category published that category
// = the group total. Defence in depth: a breakdown left with exactly one hidden
// cell is withheld whole.
//
// WHAT IS PROVEN — two attackers, each holding every payload at once and
// solving for every small 1-way and 2-way cross-tab:
//   · LINEAR (support-flags-complement.spec.ts, aggregate-joint.spec.ts):
//     Gaussian elimination over the published equalities;
//   · INTEGER (aggregate-integer.spec.ts, round 6): interval propagation that
//     also uses what the payload's labels and signs say — "<5" is 1..4, an
//     honest "withheld" 0 or ≥ 5, every count a non-negative integer — and
//     reports a cell whose range no longer covers the whole of 1..4.
//   Results: every unfiltered surface together (this route, the analytics card,
//   KYRO, /enrollment/demographics, the twin) recovers nothing; the unfiltered
//   read + EVERY single-dimension read (1, 2 or 3 values, with or without a
//   status) recovers nothing on small-cell-heavy schools with four statuses and
//   all three flags; each joint decision, the uniform label and the margin
//   guard are shown to be load-bearing. (Out of tree, an exact MILP version of
//   the integer attack — scipy — found nothing on the same fixtures or on the
//   real St. Aurelia rows.)
// WHAT IS NOT CLAIMED: three-way cells and flag-combination atoms ("on the 504
// list only") are not probed; a reader who re-runs the rules on every
// candidate table (the hiding PATTERN is a function of the counts) is modelled
// only for the companion order; grade headcounts are raw by the documented
// directory rule. STRUCTURAL ZEROS: a reader who knows that age follows grade
// (no Kindergartner is under 5) or that a Hispanic/Latino race entry implies
// Hispanic ethnicity has information no table here encodes; age bands are
// therefore published only where no grade × age-band cell is small
// (`ageBandWithheld`, below), and ethnicity beside a race vocabulary that
// carries Hispanic/Latino is an accepted, documented limit (PrivacyPage).
// ACCESS: the register list and record reads (GET /students, GET /students/:id)
// are owner/accountant only (students.controller.ts), so for the viewer role —
// the Board/Leadership lens this gate is designed around — the aggregates here
// are the ONLY way to see the roster.
// ─────────────────────────────────────────────────────────────────────────────
import {
  MIN_CELL,
  STUDENT_STATUS_KEYS,
  pooledDiversityIndex,
  suppressOverlapGroup,
  suppressLinkedPartitions,
  suppressPartition,
  suppressSmallCell,
  toShares,
  type GroupCell,
  type StudentStatusKey,
} from '@finrep/analytics'
import type { AggregateSuppressionBasis, StudentAggregate } from './students.service.js'
import type { StudentFilterQueryDto } from './students.dto.js'
import type { EnrollmentDemographicsView } from '../enrollment.service.js'
import { allStatuses, emptyTally, minusTallies, statusCounts, type StatusTallies, type Tally } from './aggregate-tally.js'
import { JOINT_DIMS, JointRelease, flagUnionHidden, type JointDim } from './aggregate-joint.js'

/** A published cell: the true count, or a marker carrying NO value key.
 *  `reason: 'complementary'` marks a cell hidden only to PROTECT another (it is
 *  not itself small, or a whole group was withheld): surfaces print "withheld",
 *  never `<5`. A cell hidden for its own size keeps the bare `{ suppressed: true }`. */
export type PublicCell = number | { suppressed: true; reason?: 'complementary' }

const WITHHELD = { suppressed: true, reason: 'complementary' } as const

/** The package's group decision → this payload's cell shape. */
function toPublic(c: GroupCell): PublicCell {
  if (!c.suppressed) return c.value
  return c.reason === 'complementary' ? { ...WITHHELD } : { suppressed: true }
}

function publicMap(cells: Record<string, GroupCell>): Record<string, PublicCell> {
  const out: Record<string, PublicCell> = {}
  for (const [k, c] of Object.entries(cells)) out[k] = toPublic(c)
  return out
}

/** Every key of a breakdown (zeros included), each "withheld". */
function withheldVocabulary(m: Partial<Record<string, number>>): Record<string, PublicCell> {
  return Object.fromEntries(Object.keys(m).sort().map((k) => [k, { ...WITHHELD }]))
}

/** A hidden cell → the one value-independent label ("withheld"). */
function withheldIfHidden(c: PublicCell): PublicCell {
  return typeof c === 'number' ? c : { ...WITHHELD }
}
function uniformLabels<T extends Record<string, PublicCell>>(cells: T): T {
  const out: Record<string, PublicCell> = {}
  for (const [k, c] of Object.entries(cells)) out[k] = withheldIfHidden(c)
  return out as T
}

export interface SuppressedStudentAggregate {
  source: 'roster'
  total: number
  /** RAW unless the query carried an attribute filter — see the header. */
  filteredTotal: PublicCell
  counts: {
    /** Breakdown population (see `breakdown`). RAW on unfiltered/grade-only
     *  reads; gated cross-tab cells under an attribute filter. */
    grade: Record<string, PublicCell>
    status: Record<string, PublicCell>
    gender: Record<string, PublicCell>
    race: Record<string, PublicCell>
    ethnicity: Record<string, PublicCell>
    ageBand: Record<string, PublicCell>
    flags: { iep: PublicCell; plan504: PublicCell; ell: PublicCell; any: PublicCell }
  }
  kpis: {
    enrolled: number
    waitlist: PublicCell
    flagged: PublicCell
    newThisYear: PublicCell
  }
  /** Which status group the grade/gender/race/ethnicity/ageBand breakdowns
   *  count; null when they are withheld. */
  breakdown: { status: StudentStatusKey | null }
  /** 'all' — every figure that depends on the filter is withheld; 'breakdown'
   *  — the per-category breakdowns are (several statuses chosen); null — none. */
  withheld: 'all' | 'breakdown' | null
  /** Why a read is withheld whole (null otherwise): 'narrow' — it narrows to a
   *  group a wider view hides; 'combination' — it narrows on two or more
   *  dimensions, or on several support flags (only one filter dimension at a
   *  time is ever broken down, see aggregate-joint.ts); 'nameSearch' — a name
   *  search is never broken down. */
  withheldReason: 'narrow' | 'combination' | 'nameSearch' | null
  /** Values present anywhere on the register (any status): picker vocabulary. */
  facets: Record<'grade' | 'status' | 'gender' | 'race' | 'ethnicity' | 'ageBand', string[]>
  /** The floor, published so no client explainer can disagree with the server. */
  minCell: number
}

const isSuppressed = (c: PublicCell): c is { suppressed: true; reason?: 'complementary' } => typeof c !== 'number'
const isSmall = (n: number): boolean => n > 0 && n < MIN_CELL

/** One count → its public cell. A zero is safe (nobody is behind it); 0<n<floor
 *  is a findable child. Rides the ONE canonical gate rather than re-deriving it. */
export function gateCount(n: number): PublicCell {
  const g = suppressSmallCell(n, n)
  return g.suppressed ? { suppressed: true } : n
}

/**
 * The ATTRIBUTE-filter test the REST route keys the strict mode on. Grade is
 * deliberately absent (grade-scoped headcounts are the documented raw line);
 * `q` — the name search — is INCLUDED: `?q=smith` makes every count in the
 * response a fact about the students matching a NAME, the tightest coupling of
 * all. Empty arrays / blank strings do not count as active.
 */
export function hasAttributeFilter(query: Partial<StudentFilterQueryDto> | null | undefined): boolean {
  if (!query) return false
  if (typeof query.q === 'string' && query.q.trim().length > 0) return true
  const dims: (keyof StudentFilterQueryDto)[] = ['status', 'race', 'gender', 'ethnicity', 'flags', 'ageBand']
  return dims.some((k) => {
    const v = query[k]
    return Array.isArray(v) && v.length > 0
  })
}

/**
 * A whole dimension of counts → public cells, with COMPLEMENTARY suppression
 * (`suppressPartition`: companions in canonical key order, the residual guard,
 * fail closed when the companions run out — see small-cell-groups.ts). `pinned`
 * keys are republished raw elsewhere in the same payload: published as-is,
 * never a companion, never protection for another cell.
 */
export function suppressDimension(
  counts: Partial<Record<string, number>>,
  opts: { pinned?: readonly string[] } = {},
): Record<string, PublicCell> {
  return publicMap(suppressPartition(counts, { pinned: opts.pinned ?? [] }))
}

/**
 * Support flags (ISP/504/ELL + `any`, the size of their UNION): the ONE overlap
 * rule, `suppressOverlapGroup`. A small flag is hidden; when any flag is hidden
 * `any` is hidden with it (as `complementary` unless small itself), because a
 * visible union minus the visible flags bounds — and without overlap equals —
 * the hidden one.
 */
export function suppressFlags(flags: {
  iep: number
  plan504: number
  ell: number
  any: number
}): { iep: PublicCell; plan504: PublicCell; ell: PublicCell; any: PublicCell } {
  const g = suppressOverlapGroup({ iep: flags.iep, plan504: flags.plan504, ell: flags.ell }, flags.any)
  return {
    iep: toPublic(g.parts.iep),
    plan504: toPublic(g.parts.plan504),
    ell: toPublic(g.parts.ell),
    any: toPublic(g.total),
  }
}

/**
 * A demographic count map (gender / ethnicity / race, from a snapshot or the
 * roster) → the shape a PUBLIC reader may see: partition-suppressed counts,
 * shares DROPPED for every hidden cell (a share beside a published total
 * multiplies straight back to the count) — carrying the same reason as the
 * count, so nothing labels a withheld companion `<5` — and, when asked, the
 * diversity index POOLED over the hidden cells.
 */
export function suppressDemographicCounts(
  counts: Partial<Record<string, number>>,
  opts: { withDiversity?: boolean } = {},
): {
  counts: Record<string, PublicCell>
  shares: Record<string, number | { suppressed: true; reason?: 'complementary' }>
  diversityIndex?: number
} {
  const decided = suppressPartition(counts)
  const shares = toShares(counts)
  const outCounts: Record<string, PublicCell> = {}
  const outShares: Record<string, number | { suppressed: true; reason?: 'complementary' }> = {}
  for (const [k, c] of Object.entries(decided)) {
    const pub = toPublic(c)
    outCounts[k] = pub
    outShares[k] = isSuppressed(pub) ? { ...pub } : shares[k] ?? 0
  }
  return opts.withDiversity
    ? { counts: outCounts, shares: outShares, diversityIndex: pooledDiversityIndex(counts, decided) }
    : { counts: outCounts, shares: outShares }
}

/** The PUBLIC shape of GET …/enrollment/demographics (and any other reader of
 *  EnrollmentService.demographics that leaves the server). */
export interface PublicDemographicsView {
  observedOn: string
  provider: EnrollmentDemographicsView['provider']
  totalEnrolled: number
  gender: ReturnType<typeof suppressDemographicCounts> | null
  ethnicity: ReturnType<typeof suppressDemographicCounts> | null
  race: ReturnType<typeof suppressDemographicCounts> | null
  gradeMix: EnrollmentDemographicsView['gradeMix']
  source: EnrollmentDemographicsView['source']
}

/**
 * EnrollmentService.demographics returns RAW counts, plain shares and the plain
 * diversity index for its internal consumer (the analytics card re-gates them).
 * The route is viewer-readable, so it passes through the SAME enrolled-
 * population decision the analytics card, KYRO and the org compare profile make
 * (suppressDemographicCounts): hidden counts AND shares, pooled index. Grade mix
 * stays raw — the documented directory-style line.
 */
export function suppressDemographicsView(view: EnrollmentDemographicsView | null): PublicDemographicsView | null {
  if (!view) return null
  return {
    observedOn: view.observedOn,
    provider: view.provider,
    totalEnrolled: view.totalEnrolled,
    gender: view.gender ? suppressDemographicCounts(view.gender.counts) : null,
    ethnicity: view.ethnicity ? suppressDemographicCounts(view.ethnicity.counts) : null,
    race: view.race ? suppressDemographicCounts(view.race.counts, { withDiversity: true }) : null,
    gradeMix: view.gradeMix,
    source: view.source,
  }
}

export interface SuppressOptions {
  /** True when the query carried any ATTRIBUTE filter (hasAttributeFilter):
   *  `filteredTotal` and the grade cells then get the full gate too, and the
   *  withholding rules (header) apply. */
  attributeFiltered?: boolean
}

// ── The status-group plumbing ────────────────────────────────────────────────

/** The status selection that narrows anything: null when absent or all four. */
function narrowingStatus(sel: readonly string[] | null | undefined): StudentStatusKey[] | null {
  if (!sel || sel.length === 0) return null
  const uniq = [...new Set(sel)].filter((s): s is StudentStatusKey =>
    (STUDENT_STATUS_KEYS as readonly string[]).includes(s),
  )
  return STUDENT_STATUS_KEYS.every((k) => uniq.includes(k)) ? null : uniq
}

/** The ONE status group a read's breakdowns count: enrolled by default, the
 *  single chosen status, or none (several chosen — withheld). */
function breakdownStatusOf(sel: StudentStatusKey[] | null): StudentStatusKey | null {
  if (!sel) return 'enrolled'
  return sel.length === 1 ? sel[0] : null
}

/** A split restricted to the chosen statuses (the request's own rows). */
function restrict(t: StatusTallies, sel: StudentStatusKey[] | null): StatusTallies {
  if (!sel) return t
  return Object.fromEntries(STUDENT_STATUS_KEYS.map((k) => [k, sel.includes(k) ? t[k] : emptyTally()])) as StatusTallies
}

/** The status partition a read over `t` publishes: enrolled pinned on the whole
 *  roster (kpis.enrolled) and whenever its breakdowns would republish it. */
function statusDecision(t: StatusTallies, wholeRoster: boolean): Record<string, GroupCell> {
  const counts = statusCounts(t)
  const pin = wholeRoster || counts.enrolled >= MIN_CELL
  return suppressPartition(counts, { pinned: pin ? ['enrolled'] : [] })
}

const flagParts = (f: Tally['flags']) => ({ iep: f.iep, plan504: f.plan504, ell: f.ell })
const flagHiddenSet = (f: Tally['flags']): Set<string> =>
  new Set(Object.entries(flagParts(f)).filter(([, n]) => isSmall(n)).map(([k]) => k))
const minusFlags = (a: Tally['flags'], b: Tally['flags']): Tally['flags'] => ({
  iep: Math.max(0, a.iep - b.iep),
  plan504: Math.max(0, a.plan504 - b.plan504),
  ell: Math.max(0, a.ell - b.ell),
  any: Math.max(0, a.any - b.any),
})
/** Flags hidden among all / enrolled / not-enrolled students of a split. */
function flagsHiddenAnywhere(t: StatusTallies): Set<string> {
  const all = allStatuses(t).flags
  const enrolled = t.enrolled.flags
  return new Set([...flagHiddenSet(all), ...flagHiddenSet(enrolled), ...flagHiddenSet(minusFlags(all, enrolled))])
}
/** True when the flags' overlap (Σ parts − any) is small among all, enrolled
 *  or not-enrolled students of a split — a union beside its parts publishes it. */
function flagOverlapSmallAnywhere(t: StatusTallies): boolean {
  const all = allStatuses(t).flags
  const enrolled = t.enrolled.flags
  const ov = (f: Tally['flags']) => f.iep + f.plan504 + f.ell - f.any
  return [all, enrolled, minusFlags(all, enrolled)].some((f) => isSmall(ov(f)))
}

const presentKeys = (m: Partial<Record<string, number>>): string[] =>
  Object.entries(m).filter(([, n]) => typeof n === 'number' && n > 0).map(([k]) => k).sort()

function facetsOf(roster: StatusTallies): SuppressedStudentAggregate['facets'] {
  const all = allStatuses(roster)
  return {
    grade: presentKeys(all.grade),
    status: presentKeys(statusCounts(roster)),
    gender: presentKeys(all.gender),
    race: presentKeys(all.race),
    ethnicity: presentKeys(all.ethnicity),
    ageBand: presentKeys(all.ageBand),
  }
}

const withheldFlags = () => ({ iep: { ...WITHHELD }, plan504: { ...WITHHELD }, ell: { ...WITHHELD }, any: { ...WITHHELD } })

/** The KPI tiles: whole roster, the same decisions on every read. */
function kpisOf(agg: StudentAggregate, basis: AggregateSuppressionBasis | undefined): SuppressedStudentAggregate['kpis'] {
  if (!basis) {
    // No basis ⇒ nothing to decide the twins against: fail closed.
    const flagged = gateCount(agg.kpis.flagged)
    return {
      enrolled: agg.kpis.enrolled,
      waitlist: isSuppressed(gateCount(agg.kpis.waitlist)) ? { suppressed: true } : { ...WITHHELD },
      flagged: isSuppressed(flagged) ? flagged : { ...WITHHELD },
      newThisYear: gateCount(agg.kpis.newThisYear),
    }
  }
  const rosterStatus = statusDecision(basis.roster, true)
  const flagged = gateCount(agg.kpis.flagged)
  return {
    // Whole-school total — never suppressed (it identifies nobody).
    enrolled: agg.kpis.enrolled,
    // The WHOLE ROSTER's status decision, on every read: the unfiltered read
    // republishes it as counts.status.waitlist, so a filtered read falling back
    // to the raw figure hands back a companion (218 − 204 − 0 − 12 = 2).
    waitlist: rosterStatus.waitlist?.suppressed ? toPublic(rosterStatus.waitlist) : gateCount(agg.kpis.waitlist),
    // Enrolled students with any flag: a union, so it is withheld whenever a
    // flag is hidden among enrolled, all, or not-enrolled students (flagged ≤
    // the all-student union, and all − enrolled is the not-enrolled remainder).
    // And the per-flag lattice rule (aggregate-joint.ts flagUnionHidden), among
    // all students and among the enrolled: when nobody outside enrolment holds
    // a flag, `flagged` IS the whole-school `any`.
    flagged:
      flagsHiddenAnywhere(basis.roster).size > 0 ||
      flagOverlapSmallAnywhere(basis.roster) ||
      (!!basis.rosterRows &&
        (flagUnionHidden(basis.rosterRows) || flagUnionHidden(basis.rosterRows.filter((r) => r.status === 'enrolled'))))
        ? isSuppressed(flagged)
          ? flagged
          : { ...WITHHELD }
        : flagged,
    // Sums with nothing published (no "returning students" figure exists), so
    // its own floor is the whole requirement.
    newThisYear: gateCount(agg.kpis.newThisYear),
  }
}

/** The gate every public consumer passes the raw aggregate through. */
export function suppressStudentAggregate(
  agg: StudentAggregate,
  opts: SuppressOptions = {},
): SuppressedStudentAggregate {
  const attributeFiltered = opts.attributeFiltered === true
  const basis = agg.suppressionBasis
  const kpis = kpisOf(agg, basis)

  // No basis (a producer other than StudentsService.aggregate): nothing below
  // can be decided safely, so everything that depends on the rows is withheld.
  if (!basis) {
    return {
      source: agg.source,
      total: agg.total,
      filteredTotal: agg.filteredTotal === agg.total ? agg.total : { ...WITHHELD },
      counts: { grade: {}, status: {}, gender: {}, race: {}, ethnicity: {}, ageBand: {}, flags: withheldFlags() },
      kpis,
      breakdown: { status: null },
      withheld: 'all',
      withheldReason: 'narrow',
      facets: { grade: [], status: [], gender: [], race: [], ethnicity: [], ageBand: [] },
      minCell: MIN_CELL,
    }
  }

  const facets = facetsOf(basis.roster)
  // A filter that matched the ENTIRE roster is the unfiltered read (its
  // "filtered" total is the raw `total` right beside it).
  const samePopulation = agg.filteredTotal === agg.total
  const sel = samePopulation ? null : narrowingStatus(basis.statusSelection)
  const rows: StatusTallies = samePopulation ? basis.roster : restrict(basis.base, sel)
  const strict = attributeFiltered && !samePopulation
  const bStatus = breakdownStatusOf(sel)

  // ── The read's place in the canonical release (aggregate-joint.ts) ─────────
  // Which of grade/gender/race/ethnicity/age band it narrows on. A read that
  // narrows on ONE of them prints rows of two-way tables whose hiding pattern
  // is decided once over the whole roster, so two different reads can never
  // disagree about a shared cell. A read that narrows on TWO or more of them
  // (or one of them AND support flags) prints three-way cells no table
  // protects, and a name search is a tracker on the named students (?q=sm vs
  // ?q=smi differ by one name): those reads are withheld whole.
  const jointSel = (Object.keys(basis.filterBases) as string[]).filter((d): d is JointDim =>
    (JOINT_DIMS as readonly string[]).includes(d),
  )
  const narrowing = jointSel.length + (basis.filterBases.flags ? 1 : 0)
  const joint = basis.rosterRows ? new JointRelease(basis.rosterRows) : null
  const jointDim: JointDim | null = jointSel.length === 1 ? jointSel[0] : null
  const jointSelected = jointDim ? basis.filterBases[jointDim]!.selected : []

  // ── The reads one step away, and what subtraction against them counts ──────
  // WIDER reads: the read with only its status filter (the unfiltered read when
  // there is none) and the read with each other filter removed — `wider −
  // this`. NARROWER reads, for a multi-value selection: the read with each
  // value dropped — `this − narrower` (?flags=iep,ell − ?flags=iep is the
  // English learners without an ISP). Each publishes the same shapes, so each
  // difference is a population a reader can count: its small cells must stay
  // hidden here too.
  const complements: StatusTallies[] = []
  if (!samePopulation) {
    const wider: StatusTallies[] = [restrict(basis.roster, sel)]
    for (const fb of Object.values(basis.filterBases)) if (fb) wider.push(restrict(fb.tallies, sel))
    for (const w of wider) complements.push(minusTallies(w, rows))
    for (const byValue of Object.values(basis.subsetBases ?? {}))
      for (const t of Object.values(byValue ?? {})) complements.push(minusTallies(rows, restrict(t, sel)))
  }
  // A difference against a neighbour is small in total, or small once its
  // enrolled students (published by the breakdowns of both reads) are taken
  // out — either way filteredTotal would hand it back.
  const complementTotalSmall = complements.some(
    (c) => isSmall(allStatuses(c).n) || isSmall(allStatuses(c).n - c.enrolled.n),
  )
  const complementGroupSmall = bStatus ? complements.some((c) => isSmall(c[bStatus].n)) : false

  // ── Withhold the whole read when it narrows to something a wider read hides ─
  let withheldAll = false
  let withheldReason: SuppressedStudentAggregate['withheldReason'] = null
  if (!samePopulation && basis.nameSearch === true) withheldReason = 'nameSearch'
  else if (!samePopulation && narrowing >= 2) withheldReason = 'combination'
  if (withheldReason || (!samePopulation && !joint)) withheldAll = true
  // SEVERAL FLAGS (?flags=iep,ell) publish the UNION of the lists, and with
  // the whole-school strip a union is a lattice equation: any − |ISP ∪ ELL| is
  // the students on the 504 list ONLY, so the union's own 504 count
  // (|504 ∩ (ISP ∪ ELL)|) is 504 − that, exactly, however it is hidden. One
  // flag at a time only.
  if (!samePopulation && basis.filterBases.flags && new Set(basis.filterBases.flags.selected).size > 1) {
    withheldAll = true
    withheldReason ??= 'combination'
  }
  // Age bands beside raw grades (aggregate-joint.ts ageBandWithheld): no
  // age-band-filtered read is broken down when the grade × age-band table has
  // a small cell — and with no roster projection that cannot be decided.
  if (!samePopulation && basis.filterBases.ageBand && (!joint || joint.ageBandWithheld())) withheldAll = true
  // ?status=s&X=x is a row of the X × status table: withheld when the X × status
  // table hides status s (in every X row, and in ?status=s's X breakdown).
  if (!samePopulation && joint && jointDim && sel && sel.some((st) => joint.statusColumnHidden(jointDim, st)))
    withheldAll = true
  if (strict) {
    const rosterStatus = statusDecision(basis.roster, true)
    if (sel) {
      const baseIsRoster = allStatuses(basis.base).n === agg.total
      const decB = statusDecision(basis.base, baseIsRoster)
      if (sel.some((s) => decB[s]?.suppressed || rosterStatus[s]?.suppressed)) withheldAll = true
      // Under a status filter every published figure is a count of these rows
      // (filteredTotal, the chosen status cells), so a small remainder against
      // a wider read cannot be hidden piecemeal.
      if (complementTotalSmall) withheldAll = true
    }
    for (const [dim, fb] of Object.entries(basis.filterBases) as [
      keyof AggregateSuppressionBasis['filterBases'],
      { selected: string[]; tallies: StatusTallies },
    ][]) {
      // The read without this filter (the "parent") decides its own cells
      // jointly with ITS difference from the status-only read — so the check
      // runs against that linked decision, not the parent's cells alone (a
      // parent may hide a companion its plain partition would show).
      const parentRows = restrict(fb.tallies, sel)
      const parentDiff = minusTallies(restrict(basis.roster, sel), parentRows)
      if (dim === 'flags') {
        // The read it narrows publishes flags over all statuses only (none under
        // a status filter): a status-filtered flag narrowing has nothing safe to
        // narrow. Otherwise every chosen flag must be visible among all, enrolled
        // and not-enrolled students — of that read, of its difference from the
        // roster, AND of the whole roster.
        const hidden = new Set([
          ...flagsHiddenAnywhere(fb.tallies),
          ...flagHiddenSet(allStatuses(parentDiff).flags),
          ...flagsHiddenAnywhere(basis.roster),
        ])
        if (sel || fb.selected.some((f) => hidden.has(f))) withheldAll = true
        // Several flags selected: filteredTotal is their UNION, published beside
        // each flag's own count on the wider read — Σ flags − union counts the
        // students on more than one list (St. Aurelia: ISP 14 + ELL 9 − 21 = 2).
        if (fb.selected.length > 1) {
          const parentFlags = allStatuses(fb.tallies).flags
          const sum = fb.selected.reduce((t, f) => t + (parentFlags[f as 'iep' | 'plan504' | 'ell'] ?? 0), 0)
          if (isSmall(sum - allStatuses(rows).n)) withheldAll = true
        }
        continue
      }
      if (!bStatus) {
        withheldAll = true
        continue
      }
      if (dim === 'grade') {
        // Grade cells are raw on the read without an attribute filter (the
        // directory line); they are gated cross-tabs on a read that keeps one.
        const parentStrict = Object.keys(basis.filterBases).some((d) => d !== 'grade') || !!sel
        if (!parentStrict) continue
        const dec = suppressLinkedPartitions([parentRows[bStatus].grade, parentDiff[bStatus].grade])[0]
        if (fb.selected.some((v) => dec[v]?.suppressed)) withheldAll = true
        continue
      }
      const dec = suppressLinkedPartitions([parentRows[bStatus][dim], parentDiff[bStatus][dim]])[0]
      const plainDec = suppressPartition(parentRows[bStatus][dim])
      const rosterDec = suppressPartition(basis.roster.enrolled[dim])
      if (fb.selected.some((v) => dec[v]?.suppressed || plainDec[v]?.suppressed || rosterDec[v]?.suppressed))
        withheldAll = true
    }
  }
  // filteredTotal counts every status; the breakdowns and the pinned
  // status.enrolled count the enrolled. A small not-enrolled remainder would be
  // their difference ("?race=asian: 19, of whom 16 enrolled ⇒ 3 not enrolled"),
  // and a small remainder against a wider read would be that read's total minus
  // this one — so filteredTotal is withheld then, on grade-only reads too.
  const remainderSmall = !samePopulation && !sel && isSmall(allStatuses(rows).n - rows.enrolled.n)

  if (withheldAll) {
    return {
      source: agg.source,
      total: agg.total,
      filteredTotal: { ...WITHHELD },
      counts: {
        grade: {},
        status: Object.fromEntries(STUDENT_STATUS_KEYS.map((k) => [k, { ...WITHHELD }])),
        gender: {},
        race: {},
        ethnicity: {},
        ageBand: {},
        flags: withheldFlags(),
      },
      kpis,
      breakdown: { status: null },
      withheld: 'all',
      withheldReason: withheldReason ?? 'narrow',
      facets,
      minCell: MIN_CELL,
    }
  }

  // ── The status partition of the request's rows ─────────────────────────────
  let status: Record<string, PublicCell>
  if (samePopulation) {
    status = publicMap(statusDecision(basis.roster, true))
  } else if (sel) {
    const baseIsRoster = allStatuses(basis.base).n === agg.total
    const decB = statusDecision(basis.base, baseIsRoster)
    status = Object.fromEntries(STUDENT_STATUS_KEYS.map((k) => [k, sel.includes(k) ? toPublic(decB[k]) : 0]))
  } else {
    // Enrolled is pinned (the breakdowns republish it) unless a wider read's
    // enrolled count minus this one is small — then it is protected like any
    // other status, and the breakdowns are withheld below.
    const pin = rows.enrolled.n >= MIN_CELL && !complementGroupSmall
    const rosterStatus = statusDecision(basis.roster, true)
    status = publicMap(
      suppressLinkedPartitions([statusCounts(rows), ...complements.map(statusCounts)], {
        pinned: pin ? ['enrolled'] : [],
        // The X × status table's hidden statuses, in every X row alike.
        forced: joint && jointDim ? joint.forcedStatuses(jointDim) : [],
        // The whole-school status partition (the unfiltered read) is the margin
        // of every row here: its published totals bound the companions.
        margin: {
          counts: statusCounts(basis.roster),
          hidden: Object.keys(rosterStatus).filter((k) => rosterStatus[k].suppressed),
        },
      })[0],
    )
  }

  // ── Breakdowns: one status group, linked to every read this one narrows ─────
  const breakdownWithheld = !bStatus || complementGroupSmall
  const b = breakdownWithheld ? null : rows[bStatus!]
  // The cells the canonical tables hide in this read's `dim` breakdown: a row of
  // the X × dim table (one filter dimension X), a column of the dim × status
  // table (a status-only read), nothing extra for the unfiltered or a flags-only
  // read (the latter keeps its one-step-neighbour checks).
  const forcedFor = (dim: JointDim): string[] => {
    if (samePopulation || !joint || !bStatus) return []
    if (jointDim) return dim === jointDim ? [] : [...joint.forcedBreakdown(jointDim, jointSelected, dim, bStatus)]
    if (!basis.filterBases.flags && sel) return [...joint.forcedStatusColumn(dim, bStatus)]
    return []
  }
  // ZERO CATEGORIES ARE LISTED on a read the joint tables decide (one filter
  // dimension, or status alone): a table hides whole columns, and a hidden
  // cell that happens to be 0 must still arrive as "withheld" — omitting it
  // tells the reader it is 0 and breaks the cycle of hidden cells that keeps
  // its neighbours unknown. The filter's own dimension lists only the selected
  // values (every other value is 0 by construction). Flags-only reads keep the
  // present values only; the lone-cell rule below lists their zeros when it
  // matters.
  const jointDecided = !!jointDim || (!basis.filterBases.flags && !!sel)
  const vocabFor = (dim: JointDim): string[] => {
    if (samePopulation || !joint || !jointDecided) return []
    if (dim === jointDim) return [...jointSelected]
    return joint.vocab[dim]
  }
  const padded = (m: Partial<Record<string, number>>, vocab: readonly string[]): Partial<Record<string, number>> => {
    const out: Partial<Record<string, number>> = { ...m }
    for (const v of vocab) if (out[v] === undefined) out[v] = 0
    return out
  }
  // THE COLUMN TOTALS these rows sit under (small-cell-groups.ts `margin`):
  // every row here — this read, a wider read minus it, it minus a narrower
  // read — is a sub-population of the status group's whole-school breakdown,
  // which the unfiltered read (or ?status=s) publishes. A published column
  // total bounds a companion from above, so the guard must see it.
  const marginFor = (dim: JointDim, vocab: readonly string[]) =>
    joint && bStatus
      ? { counts: padded(basis.roster[bStatus][dim], vocab), hidden: [...joint.marginHidden(dim, bStatus)] }
      : undefined
  const linked = (dim: JointDim): Record<string, PublicCell> => {
    const vocab = vocabFor(dim)
    return publicMap(
      suppressLinkedPartitions(
        [padded(b![dim], vocab), ...complements.map((c) => padded(c[bStatus!][dim], vocab))],
        { forced: forcedFor(dim), margin: marginFor(dim, vocab) },
      )[0],
    )
  }
  // Flags (all statuses of the request): a flag is hidden when it is small here
  // or in any population a wider read's flags minus these would count.
  const flagsOut = (): SuppressedStudentAggregate['counts']['flags'] => {
    const here = allStatuses(rows).flags
    const comps = complements.map((c) => allStatuses(c).flags)
    // The X × flag table hides a flag (and `any`) in EVERY X row alike, so
    // ?grade=K and ?grade=2 can no longer be subtracted from the whole-school
    // strip to give grade 1's English learners.
    const jf = !samePopulation && joint && jointDim ? joint.flagHidden(jointDim) : null
    const hiddenParts = new Set<string>([
      ...flagHiddenSet(here),
      ...comps.flatMap((f) => [...flagHiddenSet(f)]),
      ...(jf ? jf.parts : []),
    ])
    // The overlap rule (suppressOverlapGroup): Σ parts − any counts students on
    // more than one list; small here or in a neighbour's difference ⇒ withhold any.
    const overlap = (f: Tally['flags']) => f.iep + f.plan504 + f.ell - f.any
    const overlapSmall =
      [here, ...comps].some((f) => isSmall(overlap(f))) ||
      jf?.any === true ||
      // The whole-school strip: the per-flag lattice rule (aggregate-joint.ts).
      (samePopulation && !!basis.rosterRows && flagUnionHidden(basis.rosterRows))
    const part = (k: 'iep' | 'plan504' | 'ell'): PublicCell =>
      hiddenParts.has(k) ? (isSmall(here[k]) ? { suppressed: true } : { ...WITHHELD }) : here[k]
    const anyCell: PublicCell = isSmall(here.any)
      ? { suppressed: true }
      : hiddenParts.size > 0 || overlapSmall
        ? { ...WITHHELD }
        : here.any
    return { iep: part('iep'), plan504: part('plan504'), ell: part('ell'), any: anyCell }
  }
  const counts: SuppressedStudentAggregate['counts'] = {
    grade: b ? (strict ? linked('grade') : ({ ...b.grade } as Record<string, PublicCell>)) : {},
    status,
    gender: b ? linked('gender') : {},
    race: b ? linked('race') : {},
    ethnicity: b ? linked('ethnicity') : {},
    // Withheld WHOLE (every band listed) when age follows grade too closely.
    ageBand: b ? (!joint || joint.ageBandWithheld(bStatus!) ? withheldVocabulary(b.ageBand) : linked('ageBand')) : {},
    // All statuses of the request; withheld under a status filter.
    flags: sel ? withheldFlags() : flagsOut(),
  }

  // A LONE HIDDEN CELL. A breakdown left with exactly one hidden cell beside
  // its published group total gives that cell back by subtraction — and when
  // the other categories are omitted zeros, the one withheld category IS the
  // group total (round-4 review: ?flags=iep&gender=female printed
  // `ethnicity: { nonHispanic: withheld }` = all 6 of them). The whole
  // breakdown is withheld then, with every value of the register's vocabulary
  // listed, so nothing says which category the students are in. A status
  // partition with one hidden cell takes filteredTotal with it.
  let loneStatus = false
  if (!samePopulation) {
    for (const dim of JOINT_DIMS) {
      const cells = counts[dim]
      const hiddenKeys = Object.keys(cells).filter((k) => isSuppressed(cells[k]))
      if (hiddenKeys.length !== 1) continue
      const keys = new Set([...Object.keys(cells), ...(dim === jointDim || !joint ? [] : joint.vocab[dim])])
      counts[dim] = Object.fromEntries([...keys].sort().map((k) => [k, { ...WITHHELD }]))
    }
    loneStatus = Object.values(counts.status).filter((c) => isSuppressed(c)).length === 1
  }
  // The X row totals are one partition of the school's not-enrolled students
  // (aggregate-joint.ts totalHidden): a total hidden for one X value is hidden
  // for every read that selects it.
  const jointTotalHidden =
    !samePopulation && !sel && !!joint && !!jointDim && jointSelected.some((v) => joint.totalHidden(jointDim).has(v))

  // ONE LABEL FOR EVERY HIDDEN CELL OF A FILTERED READ (review round 6). The
  // joint tables hide whole columns in every row, and each row's label used to
  // say WHICH of its hidden cells were small: "<5" is 1..4, an honest
  // "withheld" is 0 or ≥ 5. Against a published column total that counts the
  // hidden cells (St. Aurelia: 504 "<5" school-wide, "<5" in exactly four
  // grades ⇒ exactly one 504 student in each of K, 3, 5 and 7). So on every
  // read but the unfiltered one, a hidden cell — small, companion or zero — is
  // "withheld", a label that does not depend on its value. The bare "<5"
  // survives only on the unfiltered surfaces, where each group is ONE
  // partition and the residual guard is what makes the honest label safe.
  if (!samePopulation) {
    for (const dim of ['status', ...JOINT_DIMS] as const) counts[dim] = uniformLabels(counts[dim])
    counts.flags = uniformLabels(counts.flags) as SuppressedStudentAggregate['counts']['flags']
  }

  return {
    source: agg.source,
    total: agg.total,
    filteredTotal:
      remainderSmall || complementTotalSmall || loneStatus || jointTotalHidden
        ? { ...WITHHELD }
        : strict
          ? withheldIfHidden(gateCount(agg.filteredTotal))
          : agg.filteredTotal,
    counts,
    kpis,
    breakdown: { status: breakdownWithheld ? null : bStatus },
    withheld: breakdownWithheld ? 'breakdown' : null,
    withheldReason: null,
    facets,
    minCell: MIN_CELL,
  }
}
