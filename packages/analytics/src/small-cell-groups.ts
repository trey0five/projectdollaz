// ─────────────────────────────────────────────────────────────────────────────
// @finrep/analytics — COMPLEMENTARY small-cell suppression for GROUPS of counts.
//
// `suppressSmallCell` (academics/assessments.ts) floors ONE count. A floored
// count printed beside its siblings and their total is undone by subtraction:
// "Any support flag 25 · ISP 14 · ELL 9 · 504 <5" hands the reader 25 − 14 − 9 =
// 2. That is the bug family review has found three times (and the demo
// pre-production found a fourth, on camera). This module is the ONE place the
// group rule lives, so every surface that prints these numbers — the overview
// chips, the analytics cards, the students/aggregate route, KYRO's tools — makes
// the SAME decision on the SAME counts and no two surfaces can be subtracted
// against each other.
//
// TWO GROUP SHAPES, TWO RULES:
//
//  · PARTITION (`suppressPartition`) — cells that sum to a published total
//    (race, gender, ethnicity, statuses, age bands, grades: the whole-school
//    headcount is raw by product decision). A hidden cell is protected by hiding
//    COMPANIONS so that `total − visible` only ever yields the SUM of several
//    hidden cells, and that sum is large enough that it pins none of them (the
//    residual guard below).
//
//  · OVERLAPPING GROUP (`suppressOverlapGroup`) — support flags. A student can
//    carry an ISP AND a 504 AND be an English learner, and `any` is the size of
//    the union, so `any − Σ visible flags` is a LOWER BOUND on a hidden flag (and
//    exact whenever the flags do not overlap, which in a small school they mostly
//    do not). Companion hiding cannot fix that against every other surface (the
//    accreditation twin publishes ISP/504/ELL against a 10-student floor, which
//    puts an upper bound on any companion we would choose), so the rule is the
//    twin's own: WHEN ANY FLAG IS HIDDEN, THE TOTAL IS HIDDEN TOO. Nothing is
//    then left to subtract.
//
// HONEST LABELS. A cell hidden because it is small carries no reason (the
// established `{ suppressed: true }` shape — every surface prints `<5`). A cell
// hidden only to protect a neighbour carries `reason: 'complementary'` and is
// printed "withheld", never `<5`: printing `<5` over a 25 would be a lie, and the
// residual guard is what makes telling the truth about it safe (see below). A
// group withheld whole (FAIL CLOSED, below) labels every cell "withheld" — true
// of each of them, and it does not say which one is small. Honest labels are
// safe for ONE partition; where several rows share a hidden column against a
// published column total (the roster's filtered reads), a caller must relabel
// every hidden cell alike, or the small rows can be counted (review round 6 —
// aggregate-suppression.ts does). The `margin` option makes the guard account
// for those published column totals.
//
// THE RESIDUAL GUARD (partition). With honest labels a reader knows each small
// cell is 1..floor−1 and each companion is ≥ floor, and `total − visible` gives
// the hidden sum R. For a small cell p the derivable upper bound is
// R − (other small cells × 1) − (companions × floor). The group is published only
// once R ≥ P + (m + 1)·floor − 1 (P small cells, m ≥ 1 companions): that keeps
// the bound at floor−1 or above with a margin of one, and leaves at least one
// companion unbounded above, so every small cell can still be ANY of 1..floor−1.
// The textbook failure this closes: NHPI 1 + a companion of exactly 5 → R = 6 →
// NHPI ≤ 1 → NHPI = 1.
//
// VALUE-INDEPENDENT COMPANION ORDER (review round 4). The code is public, so the
// pattern of what is hidden is itself published information. When companions
// were chosen smallest-first (or "the smallest that is enough"), a reader could
// re-run the rule on every split of R and keep only the splits that reproduce
// the published pattern — {mena 1, asian 5, black 6, hispanicLatino 7,
// twoOrMore 8, white 100} published as "mena <5, twoOrMore withheld" was
// reproduced ONLY by mena = 1. Companions are now taken in canonical KEY order
// (code-unit order, never the values), and the stop test above is strict, so
// for every published pattern and every small cell p and every v in
// 1..floor−1 there is a split with p = v that the rule maps to the SAME
// pattern: put the other small cells at 1 and the earlier companions at the
// floor (each earlier stop test then fails), and let the last companion absorb
// the rest of R. small-cell-groups.test.ts enumerates this.
//
// FAIL CLOSED (review round 4). When the companions run out before the guard
// holds (or no positive companion exists at all), EVERY un-pinned cell of the
// group — zeros included — is withheld, all with the same `complementary`
// label. The old fallback hid a ZERO as the companion and labelled it
// "complementary", and a reader who knows a complementary cell is 0 or ≥ floor
// solved {withdrawn 2, graduated 0} exactly from a pair sum of 2. A uniform
// label says nothing about which cell is small; what is left is the hidden sum
// itself, which the published totals concede by product decision.
//
// LINKED ROWS (`suppressLinkedPartitions`). Two partitions of the SAME
// categories over related populations (rows) share ONE hidden column set, and
// the guard must hold in every row. Callers that publish two rows whose
// difference is a third population pass that third row too.
//
// HONEST LIMITS (documented, not hidden):
//   · Protection is per group. Two surfaces counting DIFFERENT populations can be
//     differenced against each other — the linked-tables problem. The enrollment
//     layer answers it by publishing every demographic breakdown over ONE status
//     group (enrolled, unless a single other status is chosen), so no published
//     partition is the sum of two others (aggregate-suppression.ts).
//
// PURE, TOTAL, DETERMINISTIC (no clock, no randomness): a cell suppressed once is
// suppressed every time, on every host, so every surface that asks about the
// same counts gets the same answer.
// ─────────────────────────────────────────────────────────────────────────────
import { MIN_CELL } from './academics/assessments.js'

/** Why a cell was hidden. Absent ⇒ it is small itself (prints `<5`). */
export type WithheldReason = 'complementary'

/** One cell's published decision. A hidden cell carries NO value. */
export type GroupCell =
  | { suppressed: false; value: number }
  | { suppressed: true; reason?: WithheldReason }

export interface GroupOptions {
  /** The floor; defaults to the canonical MIN_CELL. */
  minCell?: number
}

export interface PartitionOptions<K extends string = string> extends GroupOptions {
  /**
   * Keys whose exact value is republished RAW elsewhere in the same payload by
   * product decision (e.g. `status.enrolled` ↔ `kpis.enrolled`). A pinned cell
   * is published as-is, never serves as a companion, and never counts as
   * protection for another hidden cell.
   */
  pinned?: readonly K[]
}

const floorOf = (o?: GroupOptions): number =>
  o?.minCell !== undefined && Number.isFinite(o.minCell) && o.minCell > 0 ? Math.trunc(o.minCell) : MIN_CELL

const clean = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0)

/** True when a count is a findable small group: 0 < n < floor. Zero is a fact about nobody. */
export function isSmallCount(n: number, opts?: GroupOptions): boolean {
  const v = clean(n)
  return v > 0 && v < floorOf(opts)
}

const SMALL: GroupCell = { suppressed: true }
const COMPANION: GroupCell = { suppressed: true, reason: 'complementary' }
const shown = (value: number): GroupCell => ({ suppressed: false, value })

/** Canonical, value-independent order: plain code-unit comparison of the keys. */
const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

export interface LinkedOptions<K extends string = string> extends PartitionOptions<K> {
  /**
   * Keys that must be hidden in every row whatever their values (e.g. the cells
   * another surface already hides). They count as hidden mass for the guard.
   */
  forced?: readonly K[]
  /**
   * The COLUMN TOTALS of the table these rows belong to, as another surface
   * publishes them (the unfiltered read's breakdown is the margin of every
   * X × Y table), with the keys that margin itself hides. Every row must be a
   * SUB-POPULATION of the margin's population: a table's rows, a row's
   * complement (margin − row), or any narrower slice of either.
   *
   * A published column total bounds every cell of that column from above, and
   * the margin's honest labels bound its hidden totals too ("<5" is at most
   * floor − 1, a companion at least floor). So the residual guard's "a companion
   * is unbounded above" no longer holds (review round 6, the column-bound
   * attack: K asian 3 + black 7 = 10 beside a published black total of 7 ⇒
   * asian ≥ 3; and male waitlist + withdrawn = 7 beside a school-wide waitlist
   * of "<5" ⇒ withdrawn ≥ 3). With the margin given, a row is safe only when
   * every small cell p in it can still be 1 — its two FRÉCHET conditions:
   *   · the row's other hidden cells can absorb R − 1: Σ over them of
   *     min(R, their bound) ≥ R − 1, where a published column is bounded by
   *     its total and the margin's hidden columns together by their hidden
   *     sum (each "<5" one by floor − 1);
   *   · the rest of p's column fits outside the row: t_p − 1 ≤ T − R (T = the
   *     hidden columns' total mass; a margin-hidden p counts at its label's
   *     least value).
   * The upper end (p can be floor − 1) holds already: R by the residual guard,
   * t_p because a published total is 0 or at least the floor.
   */
  margin?: { counts: Partial<Record<K, number>>; hidden?: readonly K[] }
  /**
   * Keys hidden in every row AND protected like a small cell: the guard must
   * leave their value undetermined (they need companions). For cells whose
   * value must not be published although they are not small themselves — a
   * row total whose exact value would undo another table's protection.
   */
  protect?: readonly K[]
}

export interface LinkedDecision<K extends string> {
  cells: Record<K, GroupCell>[]
  /** Rows the guard could not make safe (the decision failed closed). Every
   *  un-pinned cell is withheld, but the row's hidden SUM is whatever the
   *  callers publish beside it — a caller that publishes that sum must hide it. */
  unsafeRows: number[]
}

/**
 * LINKED PARTITIONS: several rows over the same categories that share ONE
 * hidden-column decision. A column is hidden in every row or in none; the
 * residual guard (see the header) must hold in every row that has a small cell;
 * companions are taken in canonical key order; and when they run out first,
 * every un-pinned cell of every row is withheld (fail closed).
 *
 * A row's absent key is not published in that row (and is not hidden mass).
 */
export function suppressLinkedPartitions<K extends string>(
  rows: readonly Partial<Record<K, number>>[],
  opts: LinkedOptions<K> = {},
): Record<K, GroupCell>[] {
  return decideLinkedPartitions(rows, opts).cells
}

/** `suppressLinkedPartitions`, also reporting which rows it could not make safe. */
export function decideLinkedPartitions<K extends string>(
  rows: readonly Partial<Record<K, number>>[],
  opts: LinkedOptions<K> = {},
): LinkedDecision<K> {
  const floor = floorOf(opts)
  const pinned = new Set<string>(opts.pinned ?? [])
  const protect = new Set<string>((opts.protect ?? []).filter((k) => !pinned.has(k)))
  const parsed: Map<K, number>[] = rows.map((counts) => {
    const m = new Map<K, number>()
    for (const [k, n] of Object.entries(counts ?? {}) as [K, unknown][]) {
      if (typeof n !== 'number' || !Number.isFinite(n)) continue
      m.set(k, n < 0 ? 0 : n)
    }
    return m
  })
  const keys = [...new Set(parsed.flatMap((m) => [...m.keys()]))].sort(byKey)
  const isSmall = (n: number | undefined): boolean => n !== undefined && n > 0 && n < floor
  /** Needs protecting in this row: small, or a protected key with someone behind it. */
  const needs = (k: K, n: number | undefined): boolean =>
    isSmall(n) || (protect.has(k) && n !== undefined && n > 0)
  const marginCounts: Map<K, number> | null = opts.margin
    ? new Map(
        (Object.entries(opts.margin.counts ?? {}) as [K, unknown][])
          .filter((e): e is [K, number] => typeof e[1] === 'number' && Number.isFinite(e[1]))
          .map(([k, n]) => [k, n < 0 ? 0 : n]),
      )
    : null
  const marginHidden = new Set<K>(opts.margin?.hidden ?? [])

  const hidden = new Set<K>()
  for (const k of keys) {
    if (pinned.has(k)) continue
    if (parsed.some((m) => needs(k, m.get(k))) || (opts.forced ?? []).includes(k) || protect.has(k)) hidden.add(k)
  }

  const out: Record<K, GroupCell>[] = parsed.map(() => ({}) as Record<K, GroupCell>)
  const publish = (failClosed: boolean) => {
    parsed.forEach((m, i) => {
      for (const [k, n] of m) {
        if (pinned.has(k)) out[i][k] = shown(n)
        else if (failClosed) out[i][k] = COMPANION
        else if (!hidden.has(k)) out[i][k] = shown(n)
        else out[i][k] = isSmall(n) ? SMALL : COMPANION
      }
    })
    return out
  }
  if (hidden.size === 0) return { cells: publish(false), unsafeRows: [] }

  // THE COLUMN BOUND (see `margin`): each cell p that needs protecting must
  // still be able to be 1 inside its Fréchet bounds.
  const columnSafe = (m: Map<K, number>, R: number): boolean => {
    if (!marginCounts) return true
    const tot = (k: K): number => marginCounts.get(k) ?? 0
    let T = 0
    let TM = 0
    for (const c of hidden) {
      T += tot(c)
      if (marginHidden.has(c)) TM += tot(c)
    }
    // The least value a margin-hidden total can have, by its honest label.
    const leastInMargin = (c: K): number => (tot(c) === 0 ? 0 : isSmall(tot(c)) ? 1 : floor)
    for (const p of hidden) {
      const n = m.get(p)
      if (!needs(p, n)) continue
      const pInM = marginHidden.has(p)
      let cap = 0
      let capM = 0
      let unboundedM = false
      for (const c of hidden) {
        if (c === p || !m.has(c)) continue
        if (marginHidden.has(c)) {
          if (isSmall(tot(c))) capM += floor - 1
          else unboundedM = true
        } else cap += Math.min(R, tot(c))
      }
      let mCap = TM - (pInM ? leastInMargin(p) : 0)
      if (!unboundedM) mCap = Math.min(mCap, capM)
      cap += Math.max(0, Math.min(R, mCap))
      if (R - 1 > cap) return false
      const tLeast = pInM ? leastInMargin(p) : tot(p)
      if (tLeast - 1 > T - R) return false
    }
    return true
  }

  // A row is safe when it has no small cell, or when its hidden sum leaves every
  // small cell anywhere in 1..floor−1 (P small, m ≥ 1 other hidden cells):
  // R ≥ P + (m + 1)·floor − 1 — and, given the margin, the column bound holds.
  const rowSafe = (m: Map<K, number>): boolean => {
    let P = 0
    let others = 0
    let R = 0
    for (const k of hidden) {
      const n = m.get(k)
      if (n === undefined) continue
      R += n
      if (needs(k, n)) P++
      else others++
    }
    if (P === 0) return true
    if (!(others >= 1 && R >= P + (others + 1) * floor - 1)) return false
    return columnSafe(m, R)
  }
  const allSafe = () => parsed.every(rowSafe)

  // Companions: un-pinned, not already hidden, at or above the floor somewhere —
  // in KEY order, never value order (see the header: the order must not depend
  // on anything the published pattern hides).
  const candidates = keys.filter((k) => !pinned.has(k) && !hidden.has(k) && parsed.some((m) => (m.get(k) ?? 0) >= floor))
  for (const k of candidates) {
    if (allSafe()) break
    hidden.add(k)
  }
  const unsafeRows = parsed.map((m, i) => (rowSafe(m) ? -1 : i)).filter((i) => i >= 0)
  return { cells: publish(unsafeRows.length > 0), unsafeRows }
}

/**
 * A PARTITION of a published total → per-cell decisions with complementary
 * suppression, the residual guard, canonical companion order and the
 * fail-closed fallback (see the header). Keys with a non-numeric value are
 * dropped.
 */
export function suppressPartition<K extends string>(
  counts: Partial<Record<K, number>>,
  opts: PartitionOptions<K> = {},
): Record<K, GroupCell> {
  return suppressLinkedPartitions([counts], opts)[0]
}

/**
 * An OVERLAPPING group (support flags): components + the size of their union.
 * Each component is floored on its own; the total is hidden too (as
 * `complementary` unless it is itself small) when:
 *   · ANY component is hidden — a visible union minus the visible components
 *     bounds (and with no overlap, equals) the hidden one; or
 *   · the components' OVERLAP is small — Σ components − union counts the extra
 *     memberships (with two flags it IS the students carrying both), so a
 *     visible union beside visible parts publishes that cross-tab: ISP 14 +
 *     ELL 9 − any 21 = 2 students with both. Zero overlap is a fact about
 *     nobody and leaves the total visible.
 */
export function suppressOverlapGroup<K extends string>(
  parts: Record<K, number>,
  total: number,
  opts: GroupOptions = {},
): { parts: Record<K, GroupCell>; total: GroupCell } {
  const floor = floorOf(opts)
  const out = {} as Record<K, GroupCell>
  let anyHidden = false
  let sum = 0
  for (const [k, n] of Object.entries(parts) as [K, number][]) {
    sum += clean(n)
    if (isSmallCount(n, { minCell: floor })) {
      out[k] = SMALL
      anyHidden = true
    } else {
      out[k] = shown(clean(n))
    }
  }
  const t = clean(total)
  const overlapSmall = isSmallCount(sum - t, { minCell: floor })
  const totalCell: GroupCell = isSmallCount(t, { minCell: floor })
    ? SMALL
    : anyHidden || overlapSmall
      ? COMPANION
      : shown(t)
  return { parts: out, total: totalCell }
}

/** True when any component of an overlapping group would be hidden. */
export function overlapGroupHasHidden(parts: Record<string, number>, opts: GroupOptions = {}): boolean {
  return Object.values(parts).some((n) => isSmallCount(n, opts))
}

/**
 * Blau/Simpson diversity over a partition AFTER suppression: every hidden cell
 * is POOLED into one "withheld" group before the index is taken. The plain index
 * (1 − Σp²) published beside the visible counts and the total is a second
 * equation on the hidden cells — with their sum it solves them exactly. The
 * pooled index carries nothing beyond the hidden SUM the partition already
 * concedes. Identical to the plain index when nothing is hidden.
 */
export function pooledDiversityIndex<K extends string>(
  counts: Partial<Record<K, number>>,
  cells: Partial<Record<K, GroupCell>>,
): number {
  let pooled = 0
  let total = 0
  let sumSq = 0
  for (const [k, n] of Object.entries(counts) as [K, unknown][]) {
    const v = clean(n)
    if (v === 0) continue
    total += v
    if (cells[k]?.suppressed) pooled += v
    else sumSq += v * v
  }
  if (total === 0) return 0
  sumSq += pooled * pooled
  const idx = 1 - sumSq / (total * total)
  return idx < 0 ? 0 : idx > 1 ? 1 : idx
}
