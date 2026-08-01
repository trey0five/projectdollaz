// ─────────────────────────────────────────────────────────────────────────────
// Accreditation Intelligence Phase D — SMALL-CELL SUPPRESSION (PURE).
//
// The real FERPA leak vector in a school platform is not a name in a payload —
// it is a PER-GRADE COUNT OF 3. "Grade 11: 3 students on financial aid" in a
// K-12 school with one section per grade identifies three families to anyone who
// can see the yearbook. This module is the one place that decision is made.
//
// TWO RULES, AND THE SECOND IS THE ONE THAT ACTUALLY PROTECTS ANYONE:
//
//  1. PRIMARY SUPPRESSION. A count of 1..9 is replaced by a BAND LITERAL, never
//     by a rounded or jittered number. Rounding and jitter both leak: repeated
//     queries average the noise away, and a "rounded to 5" cell next to a true
//     total is solvable.
//
//  2. COMPLEMENTARY SUPPRESSION. Suppressing ONE cell beside a published total
//     is undone by subtraction — total minus the published cells IS the hidden
//     cell. So when exactly one cell in a group is suppressed AND a total is
//     supplied, the smallest remaining NON-ZERO cell is suppressed too. Without
//     this, primary suppression is theatre.
//
// A PUBLISHED ZERO IS A FACT ABOUT NOBODY and is NEVER suppressed (NCES
// convention). "Grade 12: 0 students on aid" discloses no student. The
// differencing risk a zero creates is answered by complementary suppression, not
// by hiding zeros — hiding them would tell a reader that the cell is small,
// which is itself the disclosure.
//
// `null` IS NOT A SMALL CELL. An unknown count passes through as `null` with
// `suppressed: false`: "we do not know" and "we will not say" are different
// facts, and conflating them would let a data gap masquerade as a privacy
// protection.
//
// APPLIED SERVER-SIDE, BEFORE SERIALIZATION, ALWAYS. A number that reaches JSON
// is a number that has left the building — client-side masking protects nobody.
// The frozen application list:
//   1. every per-grade cell of an enrollment snapshot's byGrade map;
//   2. every per-cohort cell of a roster aggregate's counts (grade, gender,
//      race, ethnicity, age band, flags);
//   3. any future per-cohort count reaching a finding's evidence payload, a
//      briefing item, an assistant tool result, or a print page.
//
// THE CARVE-OUT, DELIBERATE. School-TOTAL enrollment, every finance metric and
// every already-shipped metric are NOT suppressed. Masking a 40-student school's
// total enrollment would break shipped payloads and protects nobody: the total is
// on the school's own website.
//
// DETERMINISM / PURITY CONTRACT: obeys the package purity guard — no clock, no
// randomness (in particular NO jitter), no I/O. Same input, same output, every
// time, on every host. That determinism is a privacy property, not just a
// testing convenience: a cell that is suppressed once must stay suppressed.
// ─────────────────────────────────────────────────────────────────────────────

export const SMALL_CELLS_VERSION = '1.0.0'

/** Below this, a count is replaced by a band literal. Sector/FERPA convention. */
export const MIN_CELL = 10

/** The literal the UI renders in place of a suppressed count. Frozen string. */
export const SMALL_CELL_BAND = 'fewer than 10'

/** A published zero is a fact about nobody and is NEVER suppressed. */
export const ZERO_IS_PUBLISHABLE = true

export type SmallCellReason = 'below_min_cell' | 'complementary'

export interface SmallCell<K extends string = string> {
  key: K
  /** The count, or null when suppressed. NEVER a rounded or jittered number. */
  value: number | null
  suppressed: boolean
  /** SMALL_CELL_BAND when suppressed, else null. */
  band: string | null
  /** Why this cell is hidden; null when it is published. */
  reason: SmallCellReason | null
}

function resolveThreshold(threshold: number | undefined): number {
  if (threshold === undefined || !Number.isFinite(threshold)) return MIN_CELL
  return Math.max(0, Math.trunc(threshold))
}

/**
 * SCALAR form, for a single count.
 *
 *   value === 0              -> published as 0   (a zero discloses nobody)
 *   1 <= value < threshold   -> suppressed, banded
 *   value >= threshold       -> published
 *   value === null           -> passes through as null, suppressed: false
 *
 * A negative or non-integer count is not a cohort size; it is treated as unknown
 * and passes through unsuppressed rather than being silently coerced.
 */
export function suppressSmallCells(
  value: number | null,
  threshold?: number,
): { value: number | null; suppressed: boolean; band: string | null } {
  const min = resolveThreshold(threshold)
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return { value: null, suppressed: false, band: null }
  }
  if (value < 0) return { value, suppressed: false, band: null }
  if (value === 0) return { value: 0, suppressed: false, band: null }
  if (value < min) return { value: null, suppressed: true, band: SMALL_CELL_BAND }
  return { value, suppressed: false, band: null }
}

/**
 * SET form, with COMPLEMENTARY SUPPRESSION.
 *
 * Pass 1 applies the scalar rule to every cell. If a `total` is supplied and
 * pass 1 suppressed EXACTLY ONE cell, that cell is recoverable by subtraction, so
 * pass 2 suppresses the smallest remaining NON-ZERO cell as well
 * (`reason: 'complementary'`).
 *
 * Zeros are never chosen as the complement: suppressing a published zero hides
 * nothing (its value is implied by the others) and would still leave the primary
 * cell solvable.
 *
 * DETERMINISTIC TIE-BREAK: smaller value first, then key ascending. Cell ORDER in
 * the returned array is always the input order.
 */
export function suppressSmallCellSet<K extends string>(
  cells: readonly { key: K; value: number }[],
  opts?: { total?: number | null; threshold?: number },
): { cells: SmallCell<K>[]; suppressedCount: number } {
  const min = resolveThreshold(opts?.threshold)

  const out: SmallCell<K>[] = cells.map((c) => {
    const scalar = suppressSmallCells(c.value, min)
    return {
      key: c.key,
      value: scalar.value,
      suppressed: scalar.suppressed,
      band: scalar.band,
      reason: scalar.suppressed ? ('below_min_cell' as SmallCellReason) : null,
    }
  })

  const primaryCount = out.filter((c) => c.suppressed).length
  const total = opts?.total

  if (primaryCount === 1 && total !== undefined && total !== null && Number.isFinite(total)) {
    // The lone suppressed cell = total - (the published cells). Hide a second one.
    let pick = -1
    for (let i = 0; i < out.length; i++) {
      const cell = out[i]
      if (cell.suppressed) continue
      if (cell.value === null || !Number.isFinite(cell.value) || cell.value <= 0) continue
      if (pick === -1) {
        pick = i
        continue
      }
      const best = out[pick]
      const bestValue = best.value as number
      const thisValue = cell.value
      if (thisValue < bestValue || (thisValue === bestValue && cell.key < best.key)) pick = i
    }
    if (pick >= 0) {
      out[pick] = {
        key: out[pick].key,
        value: null,
        suppressed: true,
        band: SMALL_CELL_BAND,
        reason: 'complementary',
      }
    }
  }

  return { cells: out, suppressedCount: out.filter((c) => c.suppressed).length }
}

export function isSuppressed(cell: SmallCell): boolean {
  return cell.suppressed
}
