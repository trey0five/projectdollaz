// ─────────────────────────────────────────────────────────────────────────────
// JOINT TABLE PROTECTION — the cross-request half of the roster gate (privacy
// review round 5, the "remaining limit" of round 4).
//
// Round 4 made every filtered read safe ON ITS OWN and against its one-step
// neighbours. Two DIFFERENT reads could still be combined: ?grade=K's race
// breakdown and ?race=black's grade breakdown both carry the (K, black) cell,
// each read chose its companions alone, so one hid (K, black) to protect
// (K, asian) while the other printed it — and K's total − white − black gave
// (K, asian) back. That is Denning's tracker, and per-response hiding cannot
// close it. This module closes it the standard way: the hiding pattern of every
// two-way table is decided ONCE, over the WHOLE roster, and every read that
// prints a row or a column of that table prints the SAME pattern.
//
// THE CANONICAL RELEASE. Every read the gate answers with numbers is either the
// unfiltered read or a SINGLE-DIMENSION read — one of grade / gender / race /
// ethnicity / age band (any set of its values, optionally one status), a
// status-only read, or a ONE-flag read. (Reads that narrow on two or more of
// those dimensions, on several flags, or on a name search, are withheld whole
// by the gate: their breakdowns are three-way cells no two-way table protects,
// and a union of flag lists is a lattice equation.) A
// single-dimension read on X prints, for its breakdown status group b:
//   · its Y-breakdown for every other dimension Y — a row of the X × Y table
//     over b's students (`cross`);
//   · its status partition — a row of the X × status table (`statusHidden`);
//   · its support flags (all statuses) — a row of the X × flag table
//     (`flagHidden`).
// A status-only read ?status=s prints the COLUMN s of every X × status table.
//
// THE PATTERN (full rows and full columns, never scattered cells). For each
// table one dimension is the AXIS: a value of the axis that is small anywhere —
// in any row, or in what any row's complement (margin − row) counts — is hidden
// in EVERY row, and companions are added the same way (whole columns, in key
// order, with the residual guard of small-cell-groups.ts, failing closed when
// they run out). Values of the other dimension that the published MARGIN hides
// are hidden as whole rows. So the hidden cells of a table are R × all ∪ all ×
// C with |R|, |C| = 0 or ≥ 2 — every hidden cell lies on a cycle of hidden
// cells, so no hidden cell is a linear function of the published ones (a cell of
// a two-way table with known margins is determined exactly when it is a bridge
// of the bipartite graph of hidden cells; a union of full rows and full columns
// has none). Because the pattern is per TABLE, ?grade=K and ?race=black see the
// same (K, black) decision.
//
// WHY THAT IS ENOUGH ACROSS TABLES. Two-way tables of the same population share
// only their one-way margins (the interaction parts of different two-way
// margins are orthogonal), and the margins here are exactly what the unfiltered
// read (and ?status=s) already publishes, decided by the SAME rules — so a
// table's protection is checked against its own margins only.
//
// WHY EXTRA HIDING IS SAFE. A read may hide MORE than the canonical pattern (its
// own one-step-neighbour checks, a multi-value selection's own guard); it never
// prints a cell the pattern hides, and a multi-value read prints only SUMS of
// cells the pattern prints. Every number any read prints therefore lies in the
// span of the canonical release, so any set of reads together knows no more
// than that release does.
//
// THE ONE-FLAG READS (?flags=iep) keep the gate's own one-step-neighbour
// checks rather than a table of their own; what keeps them consistent with
// the X × flag strips is that those strips hide a flag whenever ANY status
// slice of a row is small (`flagHidden`), and the whole-school `any` follows
// the lattice rule (`flagUnionHidden`). That part is shown by the attacker
// sweeps (aggregate-joint.spec.ts), not by the table argument above.
//
// BEYOND EQUALITIES (review round 6). The argument above is about LINEAR
// recovery. A reader also has bounds: the labels ("<5" is 1..4; an honest
// "withheld" is 0 or ≥ 5), the published column totals, and non-negativity.
// Three rules close what those bounds opened, each shown by the INTEGER
// attacker (aggregate-integer.spec.ts):
//   · every filtered read labels every hidden cell alike (aggregate-
//     suppression.ts), so a column hidden in every row cannot have its small
//     rows counted against its published total;
//   · the residual guard sees the MARGIN (small-cell-groups.ts `margin`): a
//     companion whose column total is published, or whose school-wide label is
//     "<5", is bounded above, and each small cell must stay able to be 1;
//   · a row of the X × status table the guard cannot make safe also withholds
//     its total (`statusUnsafe` → `totalHidden`), since its hidden sum is
//     filteredTotal − enrolled.
// And age bands, which follow grade structurally, are published only when no
// grade × age-band cell is small (`ageBandWithheld`).
//
// Pure and deterministic. Never published: it reads the roster projection on
// the suppression basis (no names) and returns hidden-value sets.
// ─────────────────────────────────────────────────────────────────────────────
import {
  MIN_CELL,
  STUDENT_STATUS_KEYS,
  decideLinkedPartitions,
  suppressLinkedPartitions,
  suppressPartition,
  type GroupCell,
  type StudentStatusKey,
} from '@finrep/analytics'
import type { TallyRow } from './aggregate-tally.js'

/** The dimensions a breakdown is published in AND a read can filter by. */
export const JOINT_DIMS = ['grade', 'gender', 'race', 'ethnicity', 'ageBand'] as const
export type JointDim = (typeof JOINT_DIMS)[number]
export type FlagKey = 'iep' | 'plan504' | 'ell'
const FLAG_KEYS: readonly FlagKey[] = ['iep', 'plan504', 'ell']
const NON_ENROLLED: readonly StudentStatusKey[] = STUDENT_STATUS_KEYS.filter((s) => s !== 'enrolled')

const isSmall = (n: number): boolean => n > 0 && n < MIN_CELL
const valueOf = (r: TallyRow, d: JointDim): string | null => (r[d] as string | null | undefined) ?? null
const suppressedKeys = (cells: Record<string, GroupCell> | undefined): Set<string> =>
  new Set(Object.entries(cells ?? {}).filter(([, c]) => c.suppressed).map(([k]) => k))

/** Counts by one dimension, padded with every vocabulary value (zeros kept). */
function countBy(rows: readonly TallyRow[], d: JointDim, vocab: readonly string[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(vocab.map((v) => [v, 0]))
  for (const r of rows) {
    const v = valueOf(r, d)
    if (v !== null && v in out) out[v]++
  }
  return out
}
/** Counts by one dimension, present values only (the unfiltered read's shape). */
function countPresent(rows: readonly TallyRow[], d: JointDim): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) {
    const v = valueOf(r, d)
    if (v !== null) out[v] = (out[v] ?? 0) + 1
  }
  return out
}
const minus = (a: Record<string, number>, b: Record<string, number>): Record<string, number> =>
  Object.fromEntries(Object.entries(a).map(([k, v]) => [k, Math.max(0, v - (b[k] ?? 0))]))
const statusCountsOf = (rows: readonly TallyRow[]): Record<StudentStatusKey, number> => {
  const out = Object.fromEntries(STUDENT_STATUS_KEYS.map((s) => [s, 0])) as Record<StudentStatusKey, number>
  for (const r of rows) if ((STUDENT_STATUS_KEYS as readonly string[]).includes(r.status)) out[r.status as StudentStatusKey]++
  return out
}
const flagCountsOf = (rows: readonly TallyRow[]) => {
  const f = { iep: 0, plan504: 0, ell: 0, any: 0 }
  for (const r of rows) {
    if (r.hasIep) f.iep++
    if (r.has504) f.plan504++
    if (r.ell) f.ell++
    if (r.hasIep || r.has504 || r.ell) f.any++
  }
  return f
}
const overlapOf = (f: { iep: number; plan504: number; ell: number; any: number }) => f.iep + f.plan504 + f.ell - f.any

/**
 * THE FLAG LATTICE RULE for a whole-school `any` (all statuses). Beside the
 * three flag counts, `any` is one inclusion–exclusion equation, and every
 * single-flag read publishes the pairwise overlaps (?flags=iep's ELL count is
 * |ISP ∩ ELL|). Together they give `any − |ISP ∪ ELL|` = the students on the
 * 504 list ONLY, and so |504 ∩ (ISP ∪ ELL)| = 504 − that. So `any` is withheld
 * whenever, for some flag, the students on it who are ALSO on another list are
 * a small group — the per-flag form of the overlap rule (the total overlap
 * rule, Σ flags − any, is the case of all three at once).
 */
export function flagUnionHidden(rows: readonly TallyRow[]): boolean {
  let o = { iep: 0, plan504: 0, ell: 0 }
  const f = flagCountsOf(rows)
  if (isSmall(overlapOf(f))) return true
  for (const r of rows) {
    const n = (r.hasIep ? 1 : 0) + (r.has504 ? 1 : 0) + (r.ell ? 1 : 0)
    if (n < 2) continue
    o = { iep: o.iep + (r.hasIep ? 1 : 0), plan504: o.plan504 + (r.has504 ? 1 : 0), ell: o.ell + (r.ell ? 1 : 0) }
  }
  return FLAG_KEYS.some((k) => isSmall(o[k]))
}

export interface CrossTable {
  /** The dimension whose values are hidden as whole COLUMNS (in every row). */
  axis: JointDim
  /** The other dimension, whose values are hidden as whole ROWS. */
  other: JointDim
  hiddenAxis: ReadonlySet<string>
  hiddenOther: ReadonlySet<string>
}

/**
 * The joint decisions over one roster. Memoised: one instance per request.
 */
export class JointRelease {
  private readonly rows: readonly TallyRow[]
  readonly vocab: Record<JointDim, string[]>
  private readonly memo = new Map<string, unknown>()

  constructor(rows: readonly TallyRow[]) {
    this.rows = rows.filter((r) => (STUDENT_STATUS_KEYS as readonly string[]).includes(r.status))
    const vocab = {} as Record<JointDim, string[]>
    for (const d of JOINT_DIMS) {
      vocab[d] = [...new Set(this.rows.map((r) => valueOf(r, d)).filter((v): v is string => v !== null))].sort()
    }
    this.vocab = vocab
  }

  private once<T>(key: string, f: () => T): T {
    if (!this.memo.has(key)) this.memo.set(key, f())
    return this.memo.get(key) as T
  }

  private inStatus(b: StudentStatusKey): TallyRow[] {
    return this.once(`rows:${b}`, () => this.rows.filter((r) => r.status === b))
  }

  /** The whole roster's status partition, as the unfiltered read decides it. */
  private rosterStatusHidden(): Set<string> {
    return this.once('U:status', () =>
      suppressedKeys(suppressPartition(statusCountsOf(this.rows), { pinned: ['enrolled'] })),
    )
  }

  /**
   * Values of `dim` the published MARGIN for status group `b` hides: for the
   * enrolled group, the unfiltered read's breakdown (grade is raw by the
   * documented directory line); for another status, ?status=b's breakdown —
   * all of it when that column is hidden in the X × status table.
   */
  marginHidden(dim: JointDim, b: StudentStatusKey): ReadonlySet<string> {
    return this.once(`M:${dim}:${b}`, () => {
      if (b === 'enrolled') {
        if (dim === 'grade') return new Set<string>()
        return suppressedKeys(suppressPartition(countPresent(this.inStatus('enrolled'), dim)))
      }
      if (this.statusHidden(dim).has(b)) return new Set(this.vocab[dim])
      return suppressedKeys(suppressPartition(countPresent(this.inStatus(b), dim)))
    })
  }

  /**
   * The X × status table: the NON-ENROLLED statuses hidden in every row (every
   * X value's status partition) and, equivalently, the statuses whose ?status=s
   * read withholds its X breakdown whole. Enrolled is pinned: it is the
   * unfiltered read's own breakdown (`marginHidden(X, 'enrolled')`).
   */
  statusHidden(dim: JointDim): ReadonlySet<StudentStatusKey> {
    return this.statusTable(dim).hidden
  }

  /**
   * The X values whose status row the X × status table could NOT make safe
   * (it failed closed). Withholding every status cell does not help there:
   * the row's hidden sum is its not-enrolled count — filteredTotal minus the
   * pinned enrolled count — and beside the whole-school status labels that sum
   * bounds a cell (compact school: male waitlist + withdrawn = 7 beside a
   * school-wide waitlist of "<5" ⇒ withdrawn ≥ 3). So their totals are
   * withheld too (`totalHidden`), with companions.
   */
  statusUnsafe(dim: JointDim): ReadonlySet<string> {
    return this.statusTable(dim).unsafe
  }

  private statusTable(dim: JointDim): { hidden: ReadonlySet<StudentStatusKey>; unsafe: ReadonlySet<string> } {
    return this.once(`S:${dim}`, () => {
      const total = statusCountsOf(this.rows)
      const linked: Record<string, number>[] = []
      for (const v of this.vocab[dim]) {
        const row = statusCountsOf(this.rows.filter((r) => valueOf(r, dim) === v))
        linked.push(row, minus(total, row))
      }
      const forced = [...this.rosterStatusHidden()].filter((s) => s !== 'enrolled')
      if (linked.length === 0) return { hidden: new Set(forced as StudentStatusKey[]), unsafe: new Set<string>() }
      // The unfiltered read publishes the column totals (the whole-school
      // status partition, with its honest labels): a companion status is
      // bounded by its own total, a "<5" one by floor − 1.
      const dec = decideLinkedPartitions(linked, {
        pinned: ['enrolled'],
        forced,
        margin: { counts: total, hidden: [...this.rosterStatusHidden()] },
      })
      // Rows come in (X = v, everyone else) pairs; either one unsafe exposes v.
      const unsafe = new Set(dec.unsafeRows.map((i) => this.vocab[dim][Math.floor(i / 2)]))
      return {
        hidden: new Set([...suppressedKeys(dec.cells[0])].filter((s) => s !== 'enrolled') as StudentStatusKey[]),
        unsafe,
      }
    })
  }

  /**
   * The X × flag table (all statuses, the population a read's flag strip
   * counts): the flags hidden in EVERY X value's strip, and whether `any` is.
   * A flag is hidden everywhere once it is small in any row, in any row's
   * complement, or on the whole roster; `any` too once a flag is, once it is
   * small anywhere, or once the overlap (Σ flags − any) is.
   *
   * MIXED POPULATIONS. This strip counts every status, while a flags-only read
   * (?flags=k) breaks its students down over ONE status group (enrolled by
   * default, or ?status=s). So "?gender=female's 504 count − ?flags=plan504's
   * female enrolled count" is the female 504 students who are NOT enrolled, and
   * each ?flags=k&status=s read peels off one more status. A flag is therefore
   * also hidden in every row once any row's flag count is small within ANY one
   * status, or across the not-enrolled statuses together.
   */
  flagHidden(dim: JointDim): { parts: ReadonlySet<FlagKey>; any: boolean } {
    return this.once(`F:${dim}`, () => {
      const total = flagCountsOf(this.rows)
      const groups = [total]
      for (const v of this.vocab[dim]) {
        const rows = this.rows.filter((r) => valueOf(r, dim) === v)
        const row = flagCountsOf(rows)
        groups.push(row, {
          iep: total.iep - row.iep,
          plan504: total.plan504 - row.plan504,
          ell: total.ell - row.ell,
          any: total.any - row.any,
        })
        for (const st of STUDENT_STATUS_KEYS) groups.push(flagCountsOf(rows.filter((r) => r.status === st)))
        groups.push(flagCountsOf(rows.filter((r) => r.status !== 'enrolled')))
      }
      const parts = new Set<FlagKey>(FLAG_KEYS.filter((k) => groups.some((g) => isSmall(g[k]))))
      // Σ over the rows of `any` is the whole-school `any`: hidden there ⇒
      // hidden in every row.
      const any =
        parts.size > 0 || groups.some((g) => isSmall(g.any) || isSmall(overlapOf(g))) || flagUnionHidden(this.rows)
      return { parts, any }
    })
  }

  /**
   * The X values whose read's filteredTotal (all statuses) is withheld. Beside
   * the enrolled count (published by the unfiltered breakdown) a row total IS
   * that row's not-enrolled count, and those counts partition the whole
   * school's not-enrolled students — so they are decided as ONE partition
   * (the residual guard, companions in key order): ?race=white and ?race=black
   * can no longer be subtracted from the school total to give the not-enrolled
   * Asian student. Rows whose own read withholds the total anyway (the rest of
   * the school is small, or its not-enrolled part is) are forced in.
   */
  totalHidden(dim: JointDim): ReadonlySet<string> {
    return this.once(`T:${dim}`, () => {
      const n = this.rows.length
      const notEnrolled = this.rows.filter((r) => r.status !== 'enrolled').length
      const counts: Record<string, number> = {}
      const forced: string[] = []
      for (const v of this.vocab[dim]) {
        const rows = this.rows.filter((r) => valueOf(r, dim) === v)
        const ne = rows.filter((r) => r.status !== 'enrolled').length
        counts[v] = ne
        if (isSmall(n - rows.length) || isSmall(notEnrolled - ne)) forced.push(v)
      }
      // A row whose status partition failed closed must not publish its
      // not-enrolled sum either (`statusUnsafe`) — and it is PROTECTED, not
      // just hidden: a lone hidden total is the school's not-enrolled count
      // minus the others.
      const protect = [...this.statusUnsafe(dim)]
      return suppressedKeys(suppressLinkedPartitions([counts], { forced, protect })[0])
    })
  }

  /**
   * STRUCTURAL ZEROS (review round 6). Grade headcounts are raw, and age
   * follows grade: a reader who knows that no Kindergartner is under 5 reads
   * the grade × age-band table off the two margins — St. Aurelia's under-5
   * count of 29 beside PK3 14 + PK4 18 says 3 pre-K students are 5 or older,
   * and grade 5's lone 11–13-year-old is "age for grade", a retention proxy.
   * No suppression pattern can encode what a reader knows about ages, so a
   * breakdown counting status group `b` publishes age bands only when NO cell
   * of b's grade × age-band table is small; and an age-band-FILTERED read
   * (whose status partition, total and flags span every status) is broken
   * down only when no status group's table has one (`b` omitted).
   */
  ageBandWithheld(b?: StudentStatusKey): boolean {
    return this.once(`AGE:${b ?? '*'}`, () => {
      const cells = new Map<string, number>()
      for (const r of this.rows) {
        if (b && r.status !== b) continue
        const k = `${r.status}|${r.grade}|${r.ageBand}`
        cells.set(k, (cells.get(k) ?? 0) + 1)
      }
      return [...cells.values()].some(isSmall)
    })
  }

  /** Which of two dimensions a table hides by whole columns: never grade (its
   *  margin is raw); otherwise the one with more values (finer columns hide a
   *  smaller share), ties by the fixed JOINT_DIMS order. */
  private axisOf(x: JointDim, y: JointDim): JointDim {
    if (x === 'grade') return y
    if (y === 'grade') return x
    const nx = this.vocab[x].length
    const ny = this.vocab[y].length
    if (nx !== ny) return nx > ny ? x : y
    return JOINT_DIMS.indexOf(x) > JOINT_DIMS.indexOf(y) ? x : y
  }

  /** The X × Y table over status group `b`'s students. */
  cross(x: JointDim, y: JointDim, b: StudentStatusKey): CrossTable {
    const axis = this.axisOf(x, y)
    const other = axis === x ? y : x
    const key = [axis, other].join('×')
    return this.once(`X:${key}:${b}`, () => {
      const hiddenOther = new Set(this.marginHidden(other, b))
      const forced = [...this.marginHidden(axis, b)]
      const pop = this.inStatus(b)
      const margin = countBy(pop, axis, this.vocab[axis])
      const linked: Record<string, number>[] = []
      for (const o of this.vocab[other]) {
        if (hiddenOther.has(o)) continue
        const row = countBy(
          pop.filter((r) => valueOf(r, other) === o),
          axis,
          this.vocab[axis],
        )
        linked.push(row, minus(margin, row))
      }
      // The margin (the unfiltered read's, or ?status=b's, breakdown) publishes
      // the column totals of every column it does not hide itself, and a
      // published total bounds that column's cells from above. The guard sees
      // them (small-cell-groups.ts `margin`): K asian 3 + black 7 = 10 beside a
      // published black total of 7 pinned asian at ≥ 3 (review round 6).
      const hiddenAxis =
        linked.length === 0
          ? new Set(forced)
          : suppressedKeys(suppressLinkedPartitions(linked, { forced, margin: { counts: margin, hidden: forced } })[0])
      return { axis, other, hiddenAxis, hiddenOther }
    })
  }

  /**
   * The Y values a read filtered to `selected` values of X must hide in its
   * Y breakdown (status group `b`): the table's hidden columns, or every value
   * when a selected X value is a hidden row (and the transpose).
   */
  forcedBreakdown(x: JointDim, selected: readonly string[], y: JointDim, b: StudentStatusKey): Set<string> {
    const t = this.cross(x, y, b)
    if (t.axis === y) {
      return selected.some((v) => t.hiddenOther.has(v)) ? new Set(this.vocab[y]) : new Set(t.hiddenAxis)
    }
    return selected.some((v) => t.hiddenAxis.has(v)) ? new Set(this.vocab[y]) : new Set(t.hiddenOther)
  }

  /** The Y values ?status=b (no other filter) must hide: all of them when the
   *  b column of the Y × status table is hidden. */
  forcedStatusColumn(y: JointDim, b: StudentStatusKey): Set<string> {
    return b !== 'enrolled' && this.statusHidden(y).has(b) ? new Set(this.vocab[y]) : new Set()
  }

  /** True when status `s` is hidden in the X × status table. */
  statusColumnHidden(x: JointDim, s: StudentStatusKey): boolean {
    return s !== 'enrolled' && this.statusHidden(x).has(s)
  }

  /** Statuses hidden in every row of the X × status table. */
  forcedStatuses(x: JointDim): StudentStatusKey[] {
    return [...this.statusHidden(x)].filter((s) => NON_ENROLLED.includes(s))
  }
}
