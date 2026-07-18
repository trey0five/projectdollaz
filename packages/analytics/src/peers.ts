// ─────────────────────────────────────────────────────────────
// @finrep/analytics — School Comparison peer-benchmarking vocabulary.
//
// PURE, TOTAL, NEVER-THROWS. The single source of truth for the peer-grouping
// vocab (size bands, school types, grade ordinals) + the deterministic
// peer-group resolution ladder + direction-aware distribution stats. Lives in the
// semantic-layer package (per the moat rule: never hardcode a band/formula in a
// component) so the API forms the group + the web renders the controls off the
// SAME frozen exports. Zero UI, zero I/O. GRADE_KEYS is reused from driver.ts so
// grade vocab never forks from plannedEnrollmentByGrade.
// ─────────────────────────────────────────────────────────────
import { GRADE_KEYS } from './driver.js'

// ── Size bands (derived from enrollment; NEVER stored) ────────────────────────

export const SIZE_BANDS = [
  { key: 'xs', label: '< 200', min: 0, max: 199 },
  { key: 'sm', label: '200–500', min: 200, max: 499 },
  { key: 'md', label: '500–1,000', min: 500, max: 999 },
  { key: 'lg', label: '1,000+', min: 1000, max: Infinity },
] as const
export type SizeBandKey = (typeof SIZE_BANDS)[number]['key']

/** Adjustable default catalog of school types (validated in the DTO, not a DB enum). */
export const SCHOOL_TYPES = [
  'Elementary',
  'Middle',
  'High',
  'K-8',
  'K-12',
  'PK-12',
  'Other',
] as const
export type SchoolType = (typeof SCHOOL_TYPES)[number]

/** The dimensions a peer group can be formed on. */
export type PeerDim = 'size' | 'county' | 'district' | 'type' | 'grade'

/** The full ordered dim list — the toggle vocabulary the web renders. */
export const PEER_DIMS: readonly PeerDim[] = ['size', 'county', 'district', 'type', 'grade']

/** Default dims when the caller sends none: size + type + grade range. */
export const DEFAULT_PEER_DIMS: readonly PeerDim[] = ['size', 'type', 'grade']

/**
 * Drop order for the relaxation ladder — the WEAKEST signal is dropped FIRST.
 * district(1) → county(2) → grade(3) → size(4) → type(5). Index = drop priority.
 */
const DROP_ORDER: readonly PeerDim[] = ['district', 'county', 'grade', 'size', 'type']

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Map a headcount to its size band. null enrollment → null (unknown). */
export function sizeBandOf(enrollment: number | null): SizeBandKey | null {
  if (enrollment == null || !Number.isFinite(enrollment)) return null
  for (const b of SIZE_BANDS) {
    if (enrollment >= b.min && enrollment <= b.max) return b.key
  }
  return null
}

/** Human label for a size band key; null → null. */
export function sizeBandLabel(key: SizeBandKey | null): string | null {
  if (key == null) return null
  const b = SIZE_BANDS.find((x) => x.key === key)
  return b ? b.label : null
}

/**
 * Ordinal position of a grade key within GRADE_KEYS: PK3=0, PK4=1, K=2, 1=3 … 12=14.
 * Unknown key → -1 (so callers can guard "missing" endpoints).
 */
export function gradeOrdinal(key: string): number {
  const i = (GRADE_KEYS as readonly string[]).indexOf(key)
  return i
}

/**
 * Inclusive ordinal overlap of two grade ranges. Requires all four endpoints to be
 * known grade keys; any missing/unknown endpoint → false (never overlap on
 * incomplete data). Tolerates lo/hi that arrive out of order by min/max-ing.
 */
export function gradeRangeOverlap(
  aLo: string | null,
  aHi: string | null,
  bLo: string | null,
  bHi: string | null,
): boolean {
  if (aLo == null || aHi == null || bLo == null || bHi == null) return false
  const a1 = gradeOrdinal(aLo)
  const a2 = gradeOrdinal(aHi)
  const b1 = gradeOrdinal(bLo)
  const b2 = gradeOrdinal(bHi)
  if (a1 < 0 || a2 < 0 || b1 < 0 || b2 < 0) return false
  const aMin = Math.min(a1, a2)
  const aMax = Math.max(a1, a2)
  const bMin = Math.min(b1, b2)
  const bMax = Math.max(b1, b2)
  return aMin <= bMax && bMin <= aMax
}

/** English ordinal: 1→"1st", 2→"2nd", 3→"3rd", 11→"11th", 21→"21st", 22→"22nd". */
export function ordinal(n: number): string {
  const abs = Math.abs(Math.trunc(n))
  const rem100 = abs % 100
  const rem10 = abs % 10
  let suffix = 'th'
  if (rem100 < 11 || rem100 > 13) {
    if (rem10 === 1) suffix = 'st'
    else if (rem10 === 2) suffix = 'nd'
    else if (rem10 === 3) suffix = 'rd'
  }
  return `${n}${suffix}`
}

const normStr = (s: string | null): string | null =>
  s == null ? null : s.trim().toLowerCase() || null

// ── Peer profile + dimension matching ─────────────────────────────────────────

export interface PeerProfile {
  schoolId: string
  enrollment: number | null
  county: string | null
  district: string | null
  schoolType: string | null
  gradeLow: string | null
  gradeHigh: string | null
}

/**
 * Does `cand` match `focus` on one dimension? All string dims require BOTH sides
 * non-null (a null on either side is "unknown" and never matches). Strings are
 * normalized (trim + lowercase). size compares derived bands (both enrollments
 * must resolve to a band). grade requires all four grade endpoints present.
 */
export function dimMatches(focus: PeerProfile, cand: PeerProfile, dim: PeerDim): boolean {
  switch (dim) {
    case 'size': {
      const a = sizeBandOf(focus.enrollment)
      const b = sizeBandOf(cand.enrollment)
      return a != null && b != null && a === b
    }
    case 'county': {
      const a = normStr(focus.county)
      const b = normStr(cand.county)
      return a != null && b != null && a === b
    }
    case 'district': {
      const a = normStr(focus.district)
      const b = normStr(cand.district)
      return a != null && b != null && a === b
    }
    case 'type': {
      const a = normStr(focus.schoolType)
      const b = normStr(cand.schoolType)
      return a != null && b != null && a === b
    }
    case 'grade':
      return gradeRangeOverlap(focus.gradeLow, focus.gradeHigh, cand.gradeLow, cand.gradeHigh)
    default: {
      const _never: never = dim
      return _never
    }
  }
}

export type MatchTier = 'exact' | 'relaxed' | 'all-schools' | 'none'

export interface PeerGroupResult {
  peerIds: string[]
  matchTier: MatchTier
  /** Dims still applied after relaxation. */
  activeDims: PeerDim[]
  /** Dims dropped to reach minPeers (weakest first). */
  relaxedDims: PeerDim[]
}

/**
 * Resolve the peer group with the relaxation ladder. Starts from `selectedDims`
 * (defaulting to DEFAULT_PEER_DIMS when empty); a candidate is a peer iff it
 * matches EVERY active dim. When too few peers, the weakest active dim is dropped
 * (district → county → grade → size → type) and we retry. When every dim is
 * relaxed and still short: `all-schools` (all candidates) if any candidate exists,
 * else `none`.
 */
export function resolvePeerGroup(
  focus: PeerProfile,
  candidates: PeerProfile[],
  selectedDims: PeerDim[],
  opts: { minPeers: number },
): PeerGroupResult {
  const minPeers = Math.max(1, Math.trunc(opts.minPeers))
  // De-dup + keep only real dims, preserving the caller's order.
  const seed = selectedDims.length ? selectedDims : [...DEFAULT_PEER_DIMS]
  let activeDims: PeerDim[] = []
  for (const d of seed) {
    if ((PEER_DIMS as readonly string[]).includes(d) && !activeDims.includes(d)) {
      activeDims.push(d)
    }
  }
  const relaxedDims: PeerDim[] = []

  // Loop the ladder. Bounded by the number of dims (each pass drops one).
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const peers = candidates.filter((c) => activeDims.every((d) => dimMatches(focus, c, d)))
    if (peers.length >= minPeers) {
      return {
        peerIds: peers.map((p) => p.schoolId),
        matchTier: relaxedDims.length ? 'relaxed' : 'exact',
        activeDims,
        relaxedDims,
      }
    }
    // Drop the weakest active dim, if any remains.
    const toDrop = DROP_ORDER.find((d) => activeDims.includes(d))
    if (toDrop) {
      relaxedDims.push(toDrop)
      activeDims = activeDims.filter((d) => d !== toDrop)
      continue
    }
    // Everything relaxed and still short of minPeers.
    if (candidates.length > 0) {
      return {
        peerIds: candidates.map((p) => p.schoolId),
        matchTier: 'all-schools',
        activeDims: [],
        relaxedDims,
      }
    }
    return { peerIds: [], matchTier: 'none', activeDims: [], relaxedDims }
  }
}

// ── Distribution stats (direction-aware) ──────────────────────────────────────

export type SampleTier = 'rich' | 'small' | 'headtohead' | 'none'

export interface PeerStats {
  count: number
  median: number
  mean: number
  p25: number
  p75: number
  min: number
  max: number
  /** 1 = best (direction-aware); ties share the better rank. */
  rank: number
  /** Fraction of the OTHER group members the focus is at least as good as, [0,1]. */
  percentile: number
  sample: SampleTier
}

/** Sample tier from the number of peers (not the group) carrying a value. */
export function sampleTierOf(peerCount: number): SampleTier {
  if (peerCount <= 0) return 'none'
  if (peerCount === 1) return 'headtohead'
  if (peerCount <= 4) return 'small'
  return 'rich'
}

/** Linear-interpolated quantile over a pre-sorted ascending array. */
function quantile(sorted: number[], q: number): number {
  const n = sorted.length
  if (n === 0) return 0
  if (n === 1) return sorted[0]
  const idx = q * (n - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  const frac = idx - lo
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac
}

/**
 * Direction-aware distribution of the focus value within its peers. `goodDirection`
 * is 'higher' | 'lower' (never 'neutral'). The median/quartiles/min/max/mean are
 * computed over the GROUP (focus + non-null peers); rank/percentile locate the
 * focus within it. A null focus value is null-safe: rank = count+1, percentile 0.
 * `sample` reflects the NUMBER OF PEERS with a value (headtohead == 1 peer).
 */
export function computePeerStats(
  focusValue: number | null,
  peerValues: number[],
  goodDirection: 'higher' | 'lower',
): PeerStats {
  const cleanPeers = peerValues.filter((v) => v != null && Number.isFinite(v))
  const sample = sampleTierOf(cleanPeers.length)
  const hasFocus = focusValue != null && Number.isFinite(focusValue)
  const group = (hasFocus ? [focusValue as number, ...cleanPeers] : [...cleanPeers]).slice()
  const count = group.length

  if (count === 0) {
    return {
      count: 0,
      median: 0,
      mean: 0,
      p25: 0,
      p75: 0,
      min: 0,
      max: 0,
      rank: hasFocus ? 1 : 1,
      percentile: 0,
      sample,
    }
  }

  const sorted = [...group].sort((a, b) => a - b)
  const mean = group.reduce((s, v) => s + v, 0) / count
  const median = quantile(sorted, 0.5)
  const p25 = quantile(sorted, 0.25)
  const p75 = quantile(sorted, 0.75)
  const min = sorted[0]
  const max = sorted[sorted.length - 1]

  if (!hasFocus) {
    // No focus value → return the peer distribution; rank worst, percentile 0.
    return { count, median, mean, p25, p75, min, max, rank: count + 1, percentile: 0, sample }
  }

  const fv = focusValue as number
  const isBetter = (other: number): boolean =>
    goodDirection === 'higher' ? other > fv : other < fv
  // Others = group minus this focus (remove exactly one occurrence of fv).
  const others: number[] = []
  let removed = false
  for (const v of group) {
    if (!removed && v === fv) {
      removed = true
      continue
    }
    others.push(v)
  }
  const strictlyBetter = others.filter((v) => isBetter(v)).length
  const rank = strictlyBetter + 1
  const atLeastAsGood = others.length - strictlyBetter
  const percentile = others.length > 0 ? atLeastAsGood / others.length : 0

  return { count, median, mean, p25, p75, min, max, rank, percentile, sample }
}
