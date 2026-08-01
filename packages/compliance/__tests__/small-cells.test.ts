// AIC Phase D — small-cell suppression. The real leak vector is a per-grade count
// of 3, and complementary suppression is the half that actually protects anyone.
import { describe, it, expect } from 'vitest'
import {
  MIN_CELL,
  SMALL_CELLS_VERSION,
  SMALL_CELL_BAND,
  ZERO_IS_PUBLISHABLE,
  isSuppressed,
  suppressSmallCellSet,
  suppressSmallCells,
  type SmallCell,
} from '../src/small-cells.js'

describe('constants', () => {
  it('pins the frozen threshold, band literal and version', () => {
    expect(MIN_CELL).toBe(10)
    expect(SMALL_CELL_BAND).toBe('fewer than 10')
    expect(ZERO_IS_PUBLISHABLE).toBe(true)
    expect(SMALL_CELLS_VERSION).toBe('1.0.0')
  })
})

describe('suppressSmallCells — the scalar rule', () => {
  it('suppresses 1..9 and bands them', () => {
    for (let v = 1; v <= 9; v++) {
      expect(suppressSmallCells(v)).toEqual({ value: null, suppressed: true, band: SMALL_CELL_BAND })
    }
  })

  it('publishes MIN_CELL and above', () => {
    for (const v of [10, 11, 40, 1200]) {
      expect(suppressSmallCells(v)).toEqual({ value: v, suppressed: false, band: null })
    }
  })

  it('PUBLISHES a zero — a zero is a fact about nobody', () => {
    expect(suppressSmallCells(0)).toEqual({ value: 0, suppressed: false, band: null })
  })

  it('passes null through as unknown, NOT as a small cell', () => {
    // "we do not know" and "we will not say" are different facts.
    expect(suppressSmallCells(null)).toEqual({ value: null, suppressed: false, band: null })
  })

  it('NEVER rounds or jitters — a suppressed value is null, full stop', () => {
    const r = suppressSmallCells(7)
    expect(r.value).toBeNull()
    expect(typeof r.value).not.toBe('number')
  })

  it('honours an explicit threshold', () => {
    expect(suppressSmallCells(12, 20).suppressed).toBe(true)
    expect(suppressSmallCells(12, 5).suppressed).toBe(false)
  })

  it('is deterministic — the same count is suppressed every single time', () => {
    const first = suppressSmallCells(4)
    for (let i = 0; i < 50; i++) expect(suppressSmallCells(4)).toEqual(first)
  })
})

describe('suppressSmallCellSet — complementary suppression', () => {
  it('the frozen spec case: one small cell beside a total takes the next-smallest with it', () => {
    const { cells, suppressedCount } = suppressSmallCellSet(
      [
        { key: 'a', value: 12 },
        { key: 'b', value: 3 },
        { key: 'c', value: 40 },
      ],
      { total: 55 },
    )
    expect(suppressedCount).toBe(2)
    expect(cells).toEqual<SmallCell<'a' | 'b' | 'c'>[]>([
      { key: 'a', value: null, suppressed: true, band: SMALL_CELL_BAND, reason: 'complementary' },
      { key: 'b', value: null, suppressed: true, band: SMALL_CELL_BAND, reason: 'below_min_cell' },
      { key: 'c', value: 40, suppressed: false, band: null, reason: null },
    ])
  })

  it('the frozen spec case: nothing small, nothing suppressed', () => {
    const { cells, suppressedCount } = suppressSmallCellSet(
      [
        { key: 'a', value: 12 },
        { key: 'b', value: 0 },
        { key: 'c', value: 40 },
      ],
      { total: 52 },
    )
    expect(suppressedCount).toBe(0)
    expect(cells.map((c) => c.value)).toEqual([12, 0, 40])
    expect(cells.every((c) => c.reason === null)).toBe(true)
  })

  it('without a total there is nothing to subtract from, so no complement is taken', () => {
    const { cells, suppressedCount } = suppressSmallCellSet([
      { key: 'a', value: 12 },
      { key: 'b', value: 3 },
      { key: 'c', value: 40 },
    ])
    expect(suppressedCount).toBe(1)
    expect(cells[1].reason).toBe('below_min_cell')
    expect(cells[0].value).toBe(12)
  })

  it('TWO primary suppressions already defeat subtraction — no third is taken', () => {
    const { cells, suppressedCount } = suppressSmallCellSet(
      [
        { key: 'a', value: 12 },
        { key: 'b', value: 3 },
        { key: 'c', value: 4 },
        { key: 'd', value: 40 },
      ],
      { total: 59 },
    )
    expect(suppressedCount).toBe(2)
    expect(cells.filter((c) => c.suppressed).map((c) => c.key)).toEqual(['b', 'c'])
    expect(cells.every((c) => c.reason !== 'complementary')).toBe(true)
  })

  it('NEVER picks a zero as the complement — hiding a zero hides nothing', () => {
    const { cells } = suppressSmallCellSet(
      [
        { key: 'a', value: 0 },
        { key: 'b', value: 3 },
        { key: 'c', value: 25 },
        { key: 'd', value: 40 },
      ],
      { total: 68 },
    )
    const suppressed = cells.filter((c) => c.suppressed).map((c) => c.key)
    expect(suppressed).toEqual(['b', 'c']) // 'a' (a zero) is published, 'c' is the complement
    expect(cells[0].value).toBe(0)
  })

  it('tie-breaks deterministically: smaller value first, then key ascending', () => {
    const run = () =>
      suppressSmallCellSet(
        [
          { key: 'z', value: 20 },
          { key: 'm', value: 20 },
          { key: 'a', value: 20 },
          { key: 'q', value: 2 },
        ],
        { total: 62 },
      )
    const first = run()
    expect(first.cells.filter((c) => c.suppressed).map((c) => c.key).sort()).toEqual(['a', 'q'])
    for (let i = 0; i < 20; i++) expect(run()).toEqual(first)
  })

  it('preserves input order in the returned array', () => {
    const { cells } = suppressSmallCellSet(
      [
        { key: 'k12', value: 3 },
        { key: 'k11', value: 30 },
        { key: 'k10', value: 31 },
      ],
      { total: 64 },
    )
    expect(cells.map((c) => c.key)).toEqual(['k12', 'k11', 'k10'])
  })

  it('leaves nothing to complement when every cell is already suppressed', () => {
    const { cells, suppressedCount } = suppressSmallCellSet(
      [
        { key: 'a', value: 2 },
        { key: 'b', value: 30 },
      ],
      { total: 32 },
    )
    // 'a' is primary; 'b' is the only remaining non-zero cell, so it is taken too.
    expect(suppressedCount).toBe(2)
    expect(cells[1].reason).toBe('complementary')
  })

  it('does not crash when the lone suppressed cell has no eligible complement', () => {
    const { cells, suppressedCount } = suppressSmallCellSet(
      [
        { key: 'a', value: 5 },
        { key: 'b', value: 0 },
      ],
      { total: 5 },
    )
    expect(suppressedCount).toBe(1)
    expect(cells[1].value).toBe(0)
  })

  it('honours an explicit threshold across the whole set', () => {
    const { suppressedCount } = suppressSmallCellSet(
      [
        { key: 'a', value: 12 },
        { key: 'b', value: 14 },
        { key: 'c', value: 40 },
      ],
      { total: 66, threshold: 15 },
    )
    // Both a and b fall under 15 -> two primaries, so no complement.
    expect(suppressedCount).toBe(2)
  })

  it('handles the empty set', () => {
    expect(suppressSmallCellSet([])).toEqual({ cells: [], suppressedCount: 0 })
  })

  it('is the ONLY thing that can put a small cohort count into a payload', () => {
    // The realistic shape: per-grade aid counts leaving the twin.
    const byGrade = [
      { key: 'K', value: 22 },
      { key: '1', value: 19 },
      { key: '2', value: 3 },
      { key: '3', value: 24 },
    ] as const
    const { cells } = suppressSmallCellSet([...byGrade], { total: 68 })
    for (const cell of cells) {
      if (cell.suppressed) {
        expect(cell.value).toBeNull()
        expect(cell.band).toBe(SMALL_CELL_BAND)
        expect(isSuppressed(cell)).toBe(true)
      } else {
        expect(cell.value).toBeGreaterThanOrEqual(MIN_CELL)
        expect(cell.band).toBeNull()
      }
    }
    // Nothing under MIN_CELL survives into the serialized payload.
    const serialized = JSON.parse(JSON.stringify(cells)) as SmallCell[]
    for (const cell of serialized) {
      expect(cell.value === null || cell.value === 0 || cell.value >= MIN_CELL).toBe(true)
    }
  })

  it('a lone suppressed cell is never recoverable by subtraction from the total', () => {
    const total = 55
    const { cells } = suppressSmallCellSet(
      [
        { key: 'a', value: 12 },
        { key: 'b', value: 3 },
        { key: 'c', value: 40 },
      ],
      { total },
    )
    const publishedSum = cells.reduce((acc, c) => acc + (c.value ?? 0), 0)
    const hidden = cells.filter((c) => c.suppressed)
    expect(hidden.length).toBeGreaterThan(1) // more than one unknown => underdetermined
    expect(total - publishedSum).toBe(15) // 12 + 3, and neither is recoverable alone
  })
})
