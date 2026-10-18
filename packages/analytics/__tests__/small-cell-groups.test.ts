import { describe, it, expect } from 'vitest'
import {
  MIN_CELL,
  suppressPartition,
  suppressLinkedPartitions,
  decideLinkedPartitions,
  suppressOverlapGroup,
  overlapGroupHasHidden,
  pooledDiversityIndex,
  diversityIndex,
  type GroupCell,
} from '../src/index.js'

const val = (c: GroupCell | undefined): number | null => (c && !c.suppressed ? c.value : null)
const hiddenKeys = (cells: Record<string, GroupCell>) =>
  Object.keys(cells).filter((k) => cells[k].suppressed).sort()

/** Every "total − visible" an attacker can compute, as the hidden SUM. */
function residual(raw: Record<string, number>, cells: Record<string, GroupCell>): number {
  const total = Object.values(raw).reduce((s, n) => s + n, 0)
  const visible = Object.keys(cells).reduce((s, k) => s + (val(cells[k]) ?? 0), 0)
  return total - visible
}

describe('suppressOverlapGroup — support flags', () => {
  it('THE ON-CAMERA CASE: any 25 · ISP 14 · ELL 9 · 504 2 → 504 <5 and the total withheld, so 25 − 14 − 9 is never on the page', () => {
    const r = suppressOverlapGroup({ iep: 14, plan504: 2, ell: 9 }, 25)
    expect(r.parts.iep).toEqual({ suppressed: false, value: 14 })
    expect(r.parts.ell).toEqual({ suppressed: false, value: 9 })
    expect(r.parts.plan504).toEqual({ suppressed: true }) // small → prints <5
    expect(r.total).toEqual({ suppressed: true, reason: 'complementary' }) // NOT small → "withheld", never <5
    // No value key anywhere on a hidden cell — nothing to quote or subtract.
    expect('value' in r.parts.plan504).toBe(false)
    expect('value' in r.total).toBe(false)
  })

  it('two hidden flags: both <5, total withheld (complementary, not small)', () => {
    const r = suppressOverlapGroup({ iep: 14, plan504: 2, ell: 3 }, 19)
    expect(r.parts.plan504).toEqual({ suppressed: true })
    expect(r.parts.ell).toEqual({ suppressed: true })
    expect(r.parts.iep).toEqual({ suppressed: false, value: 14 })
    expect(r.total).toEqual({ suppressed: true, reason: 'complementary' })
  })

  it('a small total is honestly small (<5), not "withheld"', () => {
    const r = suppressOverlapGroup({ iep: 0, plan504: 3, ell: 0 }, 3)
    expect(r.total).toEqual({ suppressed: true })
    expect(r.parts.iep).toEqual({ suppressed: false, value: 0 }) // a zero is a fact about nobody
  })

  it('UNSUPPRESSED cases are unchanged: every figure published as-is', () => {
    // No overlap (29 = 14 + 6 + 9) and an overlap at the floor (24 ⇒ 5) both publish.
    for (const total of [29, 24]) {
      const r = suppressOverlapGroup({ iep: 14, plan504: 6, ell: 9 }, total)
      expect(r.parts).toEqual({
        iep: { suppressed: false, value: 14 },
        plan504: { suppressed: false, value: 6 },
        ell: { suppressed: false, value: 9 },
      })
      expect(r.total).toEqual({ suppressed: false, value: total })
    }
    expect(overlapGroupHasHidden({ iep: 14, plan504: 6, ell: 9 })).toBe(false)
    expect(overlapGroupHasHidden({ iep: 14, plan504: 2, ell: 9 })).toBe(true)
  })
})

describe('suppressOverlapGroup — the OVERLAP is a cross-tab too', () => {
  it('★ ISP 14 + 504 6 + ELL 9 beside any 27: 29 − 27 = 2 students on two lists — the union is withheld', () => {
    const r = suppressOverlapGroup({ iep: 14, plan504: 6, ell: 9 }, 27)
    expect(r.parts.iep).toEqual({ suppressed: false, value: 14 })
    expect(r.parts.plan504).toEqual({ suppressed: false, value: 6 })
    expect(r.parts.ell).toEqual({ suppressed: false, value: 9 })
    expect(r.total).toEqual({ suppressed: true, reason: 'complementary' })
  })
})

describe('suppressPartition — cells that sum to a published total', () => {
  it('one small cell takes a companion in KEY order, big enough that total − visible pins nothing (race: MENA 3)', () => {
    const raw = { white: 108, hispanicLatino: 38, black: 27, asian: 16, twoOrMore: 12, mena: 3 }
    const cells = suppressPartition(raw)
    expect(cells.mena).toEqual({ suppressed: true })
    // 'asian' is the first un-small key in code-unit order — chosen by NAME, not
    // by size, so the choice tells a reader nothing about the hidden values.
    expect(cells.asian).toEqual({ suppressed: true, reason: 'complementary' })
    expect(val(cells.twoOrMore)).toBe(12)
    expect(val(cells.white)).toBe(108)
    expect(hiddenKeys(cells)).toEqual(['asian', 'mena'])
    // The attacker's residual is the PAIR's sum, and it leaves MENA anywhere in 1..4.
    const R = residual(raw, cells)
    expect(R).toBe(19)
    expect(R - MIN_CELL).toBeGreaterThanOrEqual(MIN_CELL - 1)
  })

  it('THE RESIDUAL GUARD: a companion of exactly the floor would pin a 1 (R = 6 → p ≤ 1), so another is added', () => {
    const raw = { a: 1, b: 5, c: 30, d: 60 }
    const cells = suppressPartition(raw)
    expect(cells.a).toEqual({ suppressed: true })
    // b is first in key order but 1 + 5 = 6 would leave a = 6 − 5 = 1: not enough
    // alone, so c joins it. d stays visible.
    expect(cells.b).toEqual({ suppressed: true, reason: 'complementary' })
    expect(cells.c).toEqual({ suppressed: true, reason: 'complementary' })
    expect(val(cells.d)).toBe(60)
  })

  it('two small cells whose sum is tiny still take a companion (1 + 1 = 2 would pin both)', () => {
    const raw = { a: 1, b: 1, c: 40, d: 70 }
    const cells = suppressPartition(raw)
    expect(cells.a).toEqual({ suppressed: true })
    expect(cells.b).toEqual({ suppressed: true })
    expect(cells.c).toEqual({ suppressed: true, reason: 'complementary' })
    expect(val(cells.d)).toBe(70)
  })

  it('two small cells NEVER protect each other alone: 4 + 4 = 8 would prove both are exactly 4', () => {
    // The old rule published {a <5, b <5, c 40}: R = 8 with each ≤ 4 forces a = b = 4.
    const cells = suppressPartition({ a: 4, b: 4, c: 40 })
    expect(hiddenKeys(cells)).toEqual(['a', 'b', 'c'])
    expect(cells.c).toEqual({ suppressed: true, reason: 'complementary' })
  })

  it('pinned cells are published raw and never serve as companions', () => {
    const cells = suppressPartition({ enrolled: 204, waitlist: 3, withdrawn: 9, graduated: 18 }, { pinned: ['enrolled'] })
    expect(val(cells.enrolled)).toBe(204)
    expect(cells.waitlist).toEqual({ suppressed: true })
    // 'graduated' sorts first among the un-pinned cells.
    expect(cells.graduated).toEqual({ suppressed: true, reason: 'complementary' })
    expect(val(cells.withdrawn)).toBe(9)
  })

  it('FAIL CLOSED: no positive companion ⇒ every un-pinned cell, zeros included, is withheld alike', () => {
    const cells = suppressPartition({ enrolled: 204, waitlist: 3, withdrawn: 0 }, { pinned: ['enrolled'] })
    expect(val(cells.enrolled)).toBe(204)
    expect(cells.waitlist).toEqual({ suppressed: true, reason: 'complementary' })
    expect(cells.withdrawn).toEqual({ suppressed: true, reason: 'complementary' })
  })

  it('★ the reviewer’s zero case: {enrolled 204, waitlist 0, withdrawn 2, graduated 0} no longer proves withdrawn = 2', () => {
    // The old output was "withdrawn <5, graduated complementary": a complementary
    // cell is 0 or ≥ 5, the pair sum is 2, so graduated = 0 and withdrawn = 2.
    const cells = suppressPartition(
      { enrolled: 204, waitlist: 0, withdrawn: 2, graduated: 0 },
      { pinned: ['enrolled'] },
    )
    expect(cells.waitlist).toEqual({ suppressed: true, reason: 'complementary' })
    expect(cells.withdrawn).toEqual({ suppressed: true, reason: 'complementary' })
    expect(cells.graduated).toEqual({ suppressed: true, reason: 'complementary' })
    // Nothing says which of the three holds the 2.
    expect(Object.values(cells).some((c) => c.suppressed && c.reason === undefined)).toBe(false)
  })

  it('FAIL CLOSED when the companions run out before the guard holds', () => {
    // a 1 + b 5 + c 5: R = 11 < 1 + 3·5 − 1 = 15 with both companions in.
    const cells = suppressPartition({ a: 1, b: 5, c: 5 })
    expect(cells).toEqual({
      a: { suppressed: true, reason: 'complementary' },
      b: { suppressed: true, reason: 'complementary' },
      c: { suppressed: true, reason: 'complementary' },
    })
  })

  it('UNSUPPRESSED cases are unchanged', () => {
    const raw = { female: 101, male: 103 }
    expect(suppressPartition(raw)).toEqual({
      female: { suppressed: false, value: 101 },
      male: { suppressed: false, value: 103 },
    })
  })

  it('is deterministic and independent of input key order', () => {
    const raw = { x: 2, p: 12, q: 12, r: 50 }
    expect(suppressPartition(raw)).toEqual(suppressPartition({ r: 50, q: 12, p: 12, x: 2 }))
    expect(suppressPartition(raw).p).toEqual({ suppressed: true, reason: 'complementary' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// THE ENUMERATION ATTACK (review round 4). The code is public. A reader takes a
// published pattern, tries every split of the hidden sum that agrees with the
// labels (small 1..floor−1, complementary ≥ floor — or, for a group withheld
// whole, anything ≥ 0), re-runs suppressPartition on each, and keeps the splits
// that reproduce the published pattern. Whatever survives is what they know.
// ─────────────────────────────────────────────────────────────────────────────

type Pattern = Record<string, GroupCell>
const same = (a: Pattern, b: Pattern) => JSON.stringify(a, Object.keys(a).sort()) === JSON.stringify(b, Object.keys(b).sort())

/** Every value each hidden cell takes across the splits that reproduce `pub`. */
function attack(raw: Record<string, number>, pinned: string[] = []): { pub: Pattern; seen: Record<string, Set<number>>; failClosed: boolean } {
  const pub = suppressPartition(raw, { pinned })
  const keys = Object.keys(pub)
  const hiddenK = keys.filter((k) => pub[k].suppressed)
  const visibleSum = keys.reduce((s, k) => s + (val(pub[k]) ?? 0), 0)
  const total = Object.values(raw).reduce((s, n) => s + n, 0)
  const R = total - visibleSum
  const failClosed = hiddenK.length > 0 && hiddenK.every((k) => (pub[k] as { reason?: string }).reason === 'complementary') &&
    hiddenK.length === keys.filter((k) => !pinned.includes(k)).length
  const lo = (k: string) => (failClosed ? 0 : pub[k].suppressed && !(pub[k] as { reason?: string }).reason ? 1 : MIN_CELL)
  const hi = (k: string) => (failClosed ? R : !(pub[k] as { reason?: string }).reason ? MIN_CELL - 1 : R)
  const seen: Record<string, Set<number>> = Object.fromEntries(hiddenK.map((k) => [k, new Set<number>()]))
  const assign: Record<string, number> = {}
  const walk = (i: number, left: number) => {
    if (i === hiddenK.length - 1) {
      const k = hiddenK[i]
      if (left < lo(k) || left > hi(k)) return
      assign[k] = left
      const hyp = { ...raw, ...assign }
      if (same(suppressPartition(hyp, { pinned }), pub)) for (const kk of hiddenK) seen[kk].add(assign[kk])
      return
    }
    const k = hiddenK[i]
    for (let v = lo(k); v <= Math.min(hi(k), left); v++) {
      assign[k] = v
      walk(i + 1, left - v)
    }
  }
  if (hiddenK.length) walk(0, R)
  return { pub, seen, failClosed }
}

/** Deterministic PRNG (mulberry32) — the sweep is the same on every run. */
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('THE ENUMERATION ATTACK — the published pattern must not reveal the small cell', () => {
  it('★ the reviewer’s case {mena 1, asian 5, black 6, hispanicLatino 7, twoOrMore 8, white 100}: every MENA in 1..4 reproduces the pattern', () => {
    const { pub, seen } = attack({ mena: 1, asian: 5, black: 6, hispanicLatino: 7, twoOrMore: 8, white: 100 })
    expect(pub.mena).toEqual({ suppressed: true })
    expect([...seen.mena].sort()).toEqual([1, 2, 3, 4])
  })

  it('the attacker is not vacuous: the OLD smallest-that-is-enough rule pinned MENA = 1', () => {
    // Re-implemented here (the old companion rule) to prove the harness can see
    // the leak: under it only mena = 1 reproduced "mena <5, twoOrMore withheld".
    const old = (c: Record<string, number>): string => {
      const small = Object.keys(c).filter((k) => c[k] > 0 && c[k] < MIN_CELL)
      const cands = Object.keys(c).filter((k) => c[k] >= MIN_CELL).sort((a, b) => c[a] - c[b] || (a < b ? -1 : 1))
      const R0 = small.reduce((s, k) => s + c[k], 0)
      const ok = (extra: number) => R0 + extra - (small.length - 1) - MIN_CELL - (MIN_CELL - 1) >= 0
      const pick = cands.find((k) => ok(c[k])) ?? cands[cands.length - 1]
      return [...small, pick].sort().join(',')
    }
    const truth = { mena: 1, asian: 5, black: 6, hispanicLatino: 7, twoOrMore: 8, white: 100 }
    const pattern = old(truth)
    const survivors = [1, 2, 3, 4].filter((m) => old({ ...truth, mena: m, twoOrMore: 9 - m }) === pattern)
    expect(survivors).toEqual([1])
  })

  it('a seeded sweep of 400 random partitions: no small cell is ever narrowed below 1..floor−1', () => {
    const r = rng(20261017)
    const narrowed: string[] = []
    for (let t = 0; t < 400; t++) {
      const n = 3 + Math.floor(r() * 3) // 3..5 cells
      const raw: Record<string, number> = {}
      for (let i = 0; i < n; i++) {
        const roll = r()
        raw[`k${i}`] = roll < 0.35 ? 1 + Math.floor(r() * 4) : roll < 0.45 ? 0 : 5 + Math.floor(r() * 9)
      }
      const { pub, seen, failClosed } = attack(raw)
      if (failClosed) continue
      for (const k of Object.keys(seen)) {
        if (pub[k].suppressed && !(pub[k] as { reason?: string }).reason) {
          const got = [...seen[k]].sort((a, b) => a - b).join(',')
          if (got !== '1,2,3,4') narrowed.push(`${JSON.stringify(raw)} → ${k} ∈ {${got}}`)
        }
      }
    }
    expect(narrowed).toEqual([])
  })

  it('a group withheld whole names no cell: every hidden cell keeps at least two possible values', () => {
    const { pub, seen, failClosed } = attack({ enrolled: 204, waitlist: 0, withdrawn: 2, graduated: 0 }, ['enrolled'])
    expect(failClosed).toBe(true)
    for (const k of ['waitlist', 'withdrawn', 'graduated']) {
      expect(pub[k]).toEqual({ suppressed: true, reason: 'complementary' })
      expect(seen[k].size).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('suppressLinkedPartitions — one hidden-column decision across related rows', () => {
  it('a column small in ANY row is hidden in EVERY row, and the guard holds per row', () => {
    const enrolled = { asian: 16, black: 27, white: 108 }
    const others = { asian: 3, black: 9, white: 15 }
    const [e, o] = suppressLinkedPartitions([enrolled, others])
    // asian is small among the others → hidden in both rows (else 16 + 3 − 16).
    expect(e.asian).toEqual({ suppressed: true, reason: 'complementary' })
    expect(o.asian).toEqual({ suppressed: true })
    // 'black' is the first companion by key; the others row R = 12 ≥ 1 + 10 − 1.
    expect(e.black.suppressed).toBe(true)
    expect(o.black.suppressed).toBe(true)
    expect(val(e.white)).toBe(108)
    expect(val(o.white)).toBe(15)
  })

  it('forced columns are hidden in every row even when nothing is small', () => {
    const [a] = suppressLinkedPartitions([{ x: 40, y: 50 }], { forced: ['x'] })
    expect(a.x).toEqual({ suppressed: true, reason: 'complementary' })
    expect(val(a.y)).toBe(50)
  })

  it('a single row is exactly suppressPartition', () => {
    const raw = { white: 108, hispanicLatino: 38, black: 27, asian: 16, twoOrMore: 12, mena: 3 }
    expect(suppressLinkedPartitions([raw])[0]).toEqual(suppressPartition(raw))
  })
})

describe('suppressLinkedPartitions — the published MARGIN bounds companions (review round 6)', () => {
  it('★ colbound: a companion whose column total is published cannot protect alone', () => {
    // K: white 20, asian 3, black 7 — beside a published margin asian 16,
    // black 7, white 60. Hiding {asian, black} leaves asian + black = 10 and
    // black ≤ 7 ⇒ asian ≥ 3. With the margin the guard takes white too.
    const margin = { asian: 16, black: 7, white: 60 }
    const k = { asian: 3, black: 7, white: 20 }
    const rest = { asian: 13, black: 0, white: 40 }
    const without = suppressLinkedPartitions([k, rest])[0]
    expect(hiddenKeys(without)).toEqual(['asian', 'black'])
    const withMargin = suppressLinkedPartitions([k, rest], { margin: { counts: margin } })[0]
    expect(hiddenKeys(withMargin)).toEqual(['asian', 'black', 'white'])
  })

  it('★ a row the guard cannot make safe is REPORTED, so the caller can withhold its hidden sum', () => {
    // male waitlist 3 + withdrawn 4 = 7: fail closed hides both, but the sum 7
    // is still filteredTotal − enrolled beside a school-wide waitlist of "<5"
    // (⇒ withdrawn ≥ 3) — so the decision says which rows are exposed.
    const total = { enrolled: 77, waitlist: 4, withdrawn: 9 }
    const male = { enrolled: 36, waitlist: 3, withdrawn: 4 }
    const female = { enrolled: 41, waitlist: 1, withdrawn: 5 }
    const dec = decideLinkedPartitions([male, female], {
      pinned: ['enrolled'],
      margin: { counts: total, hidden: ['waitlist', 'withdrawn'] },
    })
    expect(dec.unsafeRows).toContain(0)
    expect(dec.cells[0].waitlist).toEqual({ suppressed: true, reason: 'complementary' })
    expect(dec.cells[0].withdrawn).toEqual({ suppressed: true, reason: 'complementary' })
    expect(val(dec.cells[0].enrolled)).toBe(36)
    // A safe decision reports nothing.
    expect(decideLinkedPartitions([{ a: 3, b: 30, c: 40 }]).unsafeRows).toEqual([])
  })

  it('★ protect: a hidden cell that is not small still gets a companion (never a lone hidden total)', () => {
    const counts = { female: 6, male: 7 }
    expect(hiddenKeys(suppressLinkedPartitions([counts], { forced: ['male'] })[0])).toEqual(['male'])
    expect(hiddenKeys(suppressLinkedPartitions([counts], { protect: ['male'] })[0])).toEqual(['female', 'male'])
  })

  it('★ PROPERTY: whenever the decision publishes, every small cell can still be 1 AND floor − 1 (brute force over every table the reader cannot rule out)', () => {
    // Random 3-column tables: a margin (honest labels) and one row with its
    // complement. For each small cell p of the row, search for a row that
    // agrees with everything published — the visible cells, the hidden sum,
    // published column totals as upper bounds, the margin's hidden columns
    // consistent with their labels — with p = 1, and with p = floor − 1.
    let seed = 7
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    const keys = ['a', 'b', 'c'] as const
    let checked = 0
    for (let trial = 0; trial < 3000; trial++) {
      const margin: Record<string, number> = {}
      const row: Record<string, number> = {}
      for (const k of keys) {
        margin[k] = Math.floor(rnd() * 14)
        row[k] = Math.floor(rnd() * (margin[k] + 1))
      }
      const rest = Object.fromEntries(keys.map((k) => [k, margin[k] - row[k]]))
      const mDec = suppressPartition(margin)
      const mHidden = keys.filter((k) => mDec[k].suppressed)
      const dec = decideLinkedPartitions([row, rest], { margin: { counts: margin, hidden: mHidden } })
      if (dec.unsafeRows.length) continue
      const H = keys.filter((k) => dec.cells[0][k].suppressed)
      const R = H.reduce((t, k) => t + row[k], 0)
      const TM = mHidden.reduce((t, k) => t + margin[k], 0)
      const labelOk = (k: string, t: number) =>
        mDec[k].suppressed && !(mDec[k] as { reason?: string }).reason ? t >= 1 && t < MIN_CELL : t === 0 || t >= MIN_CELL
      const Rrest = H.reduce((t, k) => t + rest[k], 0)
      const free = mHidden.filter((k) => H.includes(k)) // totals the reader does not know
      const fixedFree = mHidden.filter((k) => !H.includes(k)).reduce((t, k) => t + margin[k], 0) // row + rest publish them
      // Is there a row x (hidden cells, sum R, p = v) and margin totals t for
      // the unknown columns (labelled, summing with the rest to TM) such that
      // the complement t − x is non-negative with hidden sum Rrest?
      const feasible = (p: string, v: number): boolean => {
        const xs: Record<string, number>[] = []
        const rec = (i: number, acc: Record<string, number>, sum: number) => {
          if (i === H.length) {
            if (sum === R) xs.push(acc)
            return
          }
          const k = H[i]
          for (let x = 0; x <= R - sum; x++) {
            if (k === p && x !== v) continue
            if (!free.includes(k) && x > margin[k]) break
            rec(i + 1, { ...acc, [k]: x }, sum + x)
          }
        }
        rec(0, {}, 0)
        for (const x of xs) {
          const split = (j: number, left: number, restSum: number): boolean => {
            if (j === free.length) return left === 0 && restSum === Rrest
            const k = free[j]
            for (let t = x[k]; t <= left; t++) if (labelOk(k, t) && split(j + 1, left - t, restSum + t - x[k])) return true
            return false
          }
          const knownRest = H.filter((k) => !free.includes(k)).reduce((t, k) => t + margin[k] - x[k], 0)
          if (split(0, TM - fixedFree, knownRest)) return true
        }
        return false
      }
      for (const p of H) {
        if (!(row[p] > 0 && row[p] < MIN_CELL)) continue
        checked++
        expect(feasible(p, 1), JSON.stringify({ margin, row, H, p })).toBe(true)
        expect(feasible(p, MIN_CELL - 1), JSON.stringify({ margin, row, H, p })).toBe(true)
      }
    }
    expect(checked).toBeGreaterThan(50)
  })
})

describe('pooledDiversityIndex', () => {
  it('equals the plain index when nothing is hidden', () => {
    const raw = { white: 100, black: 40, asian: 20 }
    expect(pooledDiversityIndex(raw, suppressPartition(raw))).toBeCloseTo(diversityIndex(raw), 12)
  })

  it('cannot tell two splits of the same hidden sum apart (the index is no second equation)', () => {
    const a = { white: 108, hispanicLatino: 38, black: 27, asian: 16, twoOrMore: 12, mena: 3 }
    const b = { white: 108, hispanicLatino: 38, black: 27, asian: 15, twoOrMore: 12, mena: 4 }
    // Same published pattern (asian + mena hidden, sum 19) — the plain index differs.
    expect(suppressPartition(a)).toEqual(suppressPartition(b))
    expect(diversityIndex(a)).not.toBeCloseTo(diversityIndex(b), 6)
    expect(pooledDiversityIndex(a, suppressPartition(a))).toBe(pooledDiversityIndex(b, suppressPartition(b)))
  })
})
