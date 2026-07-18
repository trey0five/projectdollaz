import { describe, expect, it } from 'vitest'
import { GRADE_KEYS } from '../src/driver.js'
import {
  sizeBandOf,
  sizeBandLabel,
  gradeOrdinal,
  gradeRangeOverlap,
  ordinal,
  dimMatches,
  resolvePeerGroup,
  computePeerStats,
  type PeerProfile,
  type PeerDim,
} from '../src/peers.js'

// A tiny profile builder — every field optional, defaults null.
function prof(id: string, over: Partial<PeerProfile> = {}): PeerProfile {
  return {
    schoolId: id,
    enrollment: null,
    county: null,
    district: null,
    schoolType: null,
    gradeLow: null,
    gradeHigh: null,
    ...over,
  }
}

describe('sizeBandOf', () => {
  it('bands by enrollment thresholds', () => {
    expect(sizeBandOf(0)).toBe('xs')
    expect(sizeBandOf(199)).toBe('xs')
    expect(sizeBandOf(200)).toBe('sm')
    expect(sizeBandOf(499)).toBe('sm')
    expect(sizeBandOf(500)).toBe('md')
    expect(sizeBandOf(999)).toBe('md')
    expect(sizeBandOf(1000)).toBe('lg')
    expect(sizeBandOf(5000)).toBe('lg')
  })
  it('null enrollment → null band', () => {
    expect(sizeBandOf(null)).toBeNull()
  })
  it('sizeBandLabel maps keys, null → null', () => {
    expect(sizeBandLabel('sm')).toBe('200–500')
    expect(sizeBandLabel('lg')).toBe('1,000+')
    expect(sizeBandLabel(null)).toBeNull()
  })
})

describe('gradeOrdinal + gradeRangeOverlap', () => {
  it('is monotonic over GRADE_KEYS', () => {
    for (let i = 1; i < GRADE_KEYS.length; i++) {
      expect(gradeOrdinal(GRADE_KEYS[i])).toBeGreaterThan(gradeOrdinal(GRADE_KEYS[i - 1]))
    }
    expect(gradeOrdinal('PK3')).toBe(0)
    expect(gradeOrdinal('12')).toBe(GRADE_KEYS.length - 1)
    expect(gradeOrdinal('nope')).toBe(-1)
  })
  it('PK3–8 overlaps 6–12', () => {
    expect(gradeRangeOverlap('PK3', '8', '6', '12')).toBe(true)
  })
  it('K–5 does NOT overlap 9–12', () => {
    expect(gradeRangeOverlap('K', '5', '9', '12')).toBe(false)
  })
  it('null endpoints never overlap', () => {
    expect(gradeRangeOverlap(null, '8', '6', '12')).toBe(false)
    expect(gradeRangeOverlap('PK3', '8', '6', null)).toBe(false)
  })
})

describe('ordinal', () => {
  it('formats English ordinals', () => {
    expect(ordinal(1)).toBe('1st')
    expect(ordinal(2)).toBe('2nd')
    expect(ordinal(3)).toBe('3rd')
    expect(ordinal(4)).toBe('4th')
    expect(ordinal(11)).toBe('11th')
    expect(ordinal(12)).toBe('12th')
    expect(ordinal(13)).toBe('13th')
    expect(ordinal(21)).toBe('21st')
    expect(ordinal(22)).toBe('22nd')
    expect(ordinal(23)).toBe('23rd')
  })
})

describe('dimMatches', () => {
  it('size matches only when both bands resolve and are equal', () => {
    const f = prof('f', { enrollment: 300 })
    expect(dimMatches(f, prof('c', { enrollment: 350 }), 'size')).toBe(true)
    expect(dimMatches(f, prof('c', { enrollment: 800 }), 'size')).toBe(false)
    expect(dimMatches(f, prof('c', { enrollment: null }), 'size')).toBe(false)
  })
  it('string dims need both sides non-null and normalized-equal', () => {
    const f = prof('f', { county: ' Miami-Dade ', schoolType: 'K-8' })
    expect(dimMatches(f, prof('c', { county: 'miami-dade' }), 'county')).toBe(true)
    expect(dimMatches(f, prof('c', { county: null }), 'county')).toBe(false)
    expect(dimMatches(f, prof('c', { schoolType: 'k-8' }), 'type')).toBe(true)
  })
  it('grade uses range overlap', () => {
    const f = prof('f', { gradeLow: 'PK3', gradeHigh: '8' })
    expect(dimMatches(f, prof('c', { gradeLow: '6', gradeHigh: '12' }), 'grade')).toBe(true)
    expect(dimMatches(f, prof('c', { gradeLow: '9', gradeHigh: '12' }), 'grade')).toBe(false)
  })
})

describe('resolvePeerGroup', () => {
  const dims: PeerDim[] = ['size', 'type', 'district']
  const focus = prof('f', {
    enrollment: 300,
    schoolType: 'K-8',
    district: 'D1',
    county: 'C1',
    gradeLow: 'PK3',
    gradeHigh: '8',
  })

  it('exact tier when >= minPeers match all dims', () => {
    const cands = [
      prof('a', { enrollment: 320, schoolType: 'K-8', district: 'D1' }),
      prof('b', { enrollment: 280, schoolType: 'K-8', district: 'D1' }),
      prof('c', { enrollment: 450, schoolType: 'K-8', district: 'D1' }),
    ]
    const r = resolvePeerGroup(focus, cands, dims, { minPeers: 3 })
    expect(r.matchTier).toBe('exact')
    expect(r.peerIds.sort()).toEqual(['a', 'b', 'c'])
    expect(r.relaxedDims).toEqual([])
    expect(r.activeDims.sort()).toEqual(['district', 'size', 'type'])
  })

  it('drops the weakest dim first (district before type) and reports relaxedDims', () => {
    // Only 1 shares district; dropping district (weakest) yields 3 same-size,K-8.
    const cands = [
      prof('a', { enrollment: 320, schoolType: 'K-8', district: 'D1' }),
      prof('b', { enrollment: 280, schoolType: 'K-8', district: 'D2' }),
      prof('c', { enrollment: 450, schoolType: 'K-8', district: 'D3' }),
    ]
    const r = resolvePeerGroup(focus, cands, dims, { minPeers: 3 })
    expect(r.matchTier).toBe('relaxed')
    expect(r.relaxedDims).toEqual(['district'])
    expect(r.activeDims.sort()).toEqual(['size', 'type'])
    expect(r.peerIds.sort()).toEqual(['a', 'b', 'c'])
  })

  it('all-schools when every dim relaxes but candidates exist', () => {
    const cands = [
      prof('a', { enrollment: 900, schoolType: 'High', district: 'D9' }),
      prof('b', { enrollment: 1200, schoolType: 'PK-12', district: 'D8' }),
    ]
    const r = resolvePeerGroup(focus, cands, dims, { minPeers: 3 })
    expect(r.matchTier).toBe('all-schools')
    expect(r.activeDims).toEqual([])
    expect(r.peerIds.sort()).toEqual(['a', 'b'])
  })

  it('none when there are no candidates', () => {
    const r = resolvePeerGroup(focus, [], dims, { minPeers: 3 })
    expect(r.matchTier).toBe('none')
    expect(r.peerIds).toEqual([])
  })
})

describe('computePeerStats', () => {
  it('quartiles on a known 5-value set', () => {
    // group = focus 30 + peers [10,20,40,50] → sorted [10,20,30,40,50]
    const s = computePeerStats(30, [10, 20, 40, 50], 'higher')
    expect(s.count).toBe(5)
    expect(s.min).toBe(10)
    expect(s.max).toBe(50)
    expect(s.median).toBe(30)
    expect(s.p25).toBe(20)
    expect(s.p75).toBe(40)
    expect(s.mean).toBe(30)
    expect(s.sample).toBe('small') // 4 peers
  })

  it('direction flips rank/percentile', () => {
    // focus 30 among [10,20,40,50].
    const higher = computePeerStats(30, [10, 20, 40, 50], 'higher')
    // higher: two peers better (40,50) → rank 3; beats/ties 2 of 4 → 0.5
    expect(higher.rank).toBe(3)
    expect(higher.percentile).toBeCloseTo(0.5, 10)
    const lower = computePeerStats(30, [10, 20, 40, 50], 'lower')
    // lower: two peers better (10,20) → rank 3; beats 2 of 4 → 0.5
    expect(lower.rank).toBe(3)
    expect(lower.percentile).toBeCloseTo(0.5, 10)

    // A best-on-higher value.
    const best = computePeerStats(100, [10, 20, 40, 50], 'higher')
    expect(best.rank).toBe(1)
    expect(best.percentile).toBeCloseTo(1, 10)
  })

  it('sample tiers by peer count', () => {
    expect(computePeerStats(5, [], 'higher').sample).toBe('none')
    expect(computePeerStats(5, [1], 'higher').sample).toBe('headtohead')
    expect(computePeerStats(5, [1, 2], 'higher').sample).toBe('small')
    expect(computePeerStats(5, [1, 2, 3, 4], 'higher').sample).toBe('small')
    expect(computePeerStats(5, [1, 2, 3, 4, 6], 'higher').sample).toBe('rich')
  })

  it('null focus value is safe', () => {
    const s = computePeerStats(null, [10, 20, 30], 'higher')
    expect(s.count).toBe(3)
    expect(s.rank).toBe(4) // count + 1
    expect(s.percentile).toBe(0)
    expect(s.median).toBe(20)
  })

  it('empty group returns zeros', () => {
    const s = computePeerStats(null, [], 'higher')
    expect(s.count).toBe(0)
    expect(s.sample).toBe('none')
    expect(s.percentile).toBe(0)
  })
})
