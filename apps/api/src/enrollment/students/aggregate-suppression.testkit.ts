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
  for (const [name, dim, rawDim] of dims) {
    if (!dim) continue
    if (sum(rawDim) !== raw.filteredTotal) continue // the relation does not hold — no subtraction exists
    if (!groupTotalVisible) continue
    const hiddenKeys = Object.keys(dim).filter((k) => !effectivelyVisible(`${name}.${k}`, dim[k]))
    if (hiddenKeys.length === 1) {
      violations.push(
        `${name}.${hiddenKeys[0]} is the ONLY hidden cell of a dimension that sums to a published total — it equals total − visible cells`,
      )
    }
    // The reverse direction: a hidden filteredTotal behind a fully-visible dimension.
    if (hiddenKeys.length === 0 && isHidden(pub.filteredTotal)) {
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
