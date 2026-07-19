// ─────────────────────────────────────────────────────────────────────────────
// @finrep/analytics — pure school NAME matcher (diocesan enrollment routing).
//
// PURE, TOTAL, NEVER-THROWS, ZERO I/O. Given a source name from a diocesan file
// and the org's known schools, score + tier each candidate so the API can
// AUTO-apply only unambiguous matches and route the rest to a human review step.
// Lives in the semantic-layer package (moat rule) so the API matches with it and
// the web previews with the SAME frozen scoring — they can never disagree.
//
// The load-bearing guard is the DISTINCTIVE-token hard-cap: "Annunciation Pre-K"
// (annunciation pk) can NEVER auto-apply onto "Annunciation Catholic Academy"
// (annunciation), because a distinctive token present on one side and absent on
// the other caps the score at 0.60 — below the AUTO threshold. Conservative by
// design: better a human confirms than a snapshot lands on the wrong school.
// ─────────────────────────────────────────────────────────────────────────────

/** Generic tokens dropped during normalization — they carry no distinguishing signal. */
export const GENERIC_TOKENS: ReadonlySet<string> = new Set([
  'catholic',
  'school',
  'academy',
  'the',
  'of',
  'and',
  'parish',
  'elementary',
  'high',
  'inc',
  'campus',
  'st',
  'saint',
  'schools',
])

/** Tokens KEPT that meaningfully distinguish two otherwise-similar schools. A
 *  distinctive token on one side but not the other caps the score (the guard). */
export const DISTINCTIVE_TOKENS: ReadonlySet<string> = new Set([
  'pk',
  'prep',
  'east',
  'west',
  'north',
  'south',
  'upper',
  'lower',
])

/** Match thresholds. AUTO = auto-apply; REVIEW = amber one-click; MARGIN = the
 *  minimum gap between the top and second candidate for an auto-apply. */
export const MATCH = { AUTO: 0.92, REVIEW: 0.62, MARGIN: 0.15 } as const

export type MatchTier = 'exact' | 'alias' | 'high' | 'review' | 'none'

export interface MatchSignals {
  exact: boolean
  tokenSet: number
  editRatio: number
  distinctiveConflict: boolean
}

export interface NameScore {
  score: number
  signals: MatchSignals
}

/** A candidate school the matcher ranks (id + display name). */
export interface MatchCandidate {
  schoolId: string
  name: string
}

/** One ranked candidate + its score/signals, for the review payload. */
export interface RankedCandidate extends MatchCandidate {
  confidence: number
  signals: MatchSignals
}

/** The chosen best match (or null) + all ranked candidates + the resolved tier. */
export interface NameMatchResult {
  tier: MatchTier
  best: { schoolId: string; name: string; confidence: number; viaAlias: boolean } | null
  ranked: RankedCandidate[]
}

// ── Normalization ─────────────────────────────────────────────────────────────

/**
 * Normalize a raw school name to a comparable form: strip diacritics, lowercase,
 * expand `&`→`and` and `saint`→`st`, canonicalize the PreK variants to `pk`, strip
 * punctuation, drop GENERIC_TOKENS, and sort the residual tokens. Returns both the
 * residual token set (for Jaccard) and the sorted-joined `normalized` string (for
 * edit distance + exact/alias equality). Never throws.
 */
export function normalizeSchoolName(raw: string | null | undefined): { normalized: string; tokens: string[] } {
  let s = String(raw ?? '')
  // Strip diacritics (NFKD → drop combining marks).
  s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  s = s.toLowerCase()
  // Word-level expansions BEFORE punctuation strip.
  s = s.replace(/&/g, ' and ')
  s = s.replace(/\bsaint\b/g, 'st')
  // Canonicalize PreK variants → a single distinctive `pk` token.
  s = s.replace(/\bpre[\s-]*kindergarten\b/g, 'pk')
  s = s.replace(/\bpre[\s-]*k\b/g, 'pk')
  s = s.replace(/\bprek\b/g, 'pk')
  // Strip everything but alphanumerics + whitespace.
  s = s.replace(/[^a-z0-9]+/g, ' ')
  const rawTokens = s.split(/\s+/).filter(Boolean)
  const tokens: string[] = []
  const seen = new Set<string>()
  for (const t of rawTokens) {
    if (GENERIC_TOKENS.has(t)) continue
    if (seen.has(t)) continue
    seen.add(t)
    tokens.push(t)
  }
  const normalized = [...tokens].sort().join(' ')
  return { normalized, tokens }
}

// ── Scoring ───────────────────────────────────────────────────────────────────

/** The minimum token-similarity ratio for two tokens to count as "the same word"
 *  (absorbs a single-char typo / transposition, e.g. Angles↔Angels). */
const TOKEN_FUZZ = 0.8

/** Damerau-Levenshtein edit distance (adjacent transposition costs 1) — so a
 *  two-letter swap reads as one edit, not two. Iterative full-matrix DP. */
function damerau(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const m = a.length
  const n = b.length
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = 0; i <= m; i++) d[i]![0] = i
  for (let j = 0; j <= n; j++) d[0]![j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, d[i - 2]![j - 2]! + 1)
      }
      d[i]![j] = v
    }
  }
  return d[m]![n]!
}

/** Similarity ratio in [0,1] from Damerau distance. */
function simRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  return maxLen === 0 ? 1 : 1 - damerau(a, b) / maxLen
}

/**
 * FUZZY token-set similarity (|∩| / |∪|) — two tokens count as intersecting when
 * they are equal OR their Damerau ratio ≥ TOKEN_FUZZ, so a single-letter typo does
 * not blow the whole token out of the intersection. Greedy 1-to-1 matching. Returns
 * 1 when both sides are empty.
 */
function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1
  const used = new Array<boolean>(b.length).fill(false)
  let matches = 0
  for (const ta of a) {
    let bestIdx = -1
    let bestRatio = 0
    for (let j = 0; j < b.length; j++) {
      if (used[j]) continue
      const r = ta === b[j] ? 1 : simRatio(ta, b[j]!)
      if (r > bestRatio) {
        bestRatio = r
        bestIdx = j
      }
    }
    if (bestIdx >= 0 && bestRatio >= TOKEN_FUZZ) {
      used[bestIdx] = true
      matches++
    }
  }
  const union = a.length + b.length - matches
  return union === 0 ? 0 : matches / union
}

/** The distinctive tokens present in a token list. */
function distinctiveOf(tokens: string[]): Set<string> {
  const out = new Set<string>()
  for (const t of tokens) if (DISTINCTIVE_TOKENS.has(t)) out.add(t)
  return out
}

/** True when one side carries a distinctive token the other lacks. */
function hasDistinctiveConflict(aTokens: string[], bTokens: string[]): boolean {
  const da = distinctiveOf(aTokens)
  const db = distinctiveOf(bTokens)
  for (const t of da) if (!db.has(t)) return true
  for (const t of db) if (!da.has(t)) return true
  return false
}

/**
 * Score a source name against a candidate name in [0,1] with per-signal detail.
 * Exact normalized equality → 1.0. Else 0.55·tokenSet + 0.45·editRatio, HARD-CAPPED
 * at 0.60 when a distinctive token differs between the two sides (the Annunciation
 * guard). Pure, never throws.
 */
export function scoreNameMatch(query: string, candidate: string): NameScore {
  const q = normalizeSchoolName(query)
  const c = normalizeSchoolName(candidate)
  const distinctiveConflict = hasDistinctiveConflict(q.tokens, c.tokens)

  if (q.normalized === c.normalized && q.normalized.length > 0) {
    return { score: 1, signals: { exact: true, tokenSet: 1, editRatio: 1, distinctiveConflict } }
  }
  const tokenSet = jaccard(q.tokens, c.tokens)
  const editRatio = q.normalized.length === 0 && c.normalized.length === 0 ? 0 : simRatio(q.normalized, c.normalized)
  let score = 0.55 * tokenSet + 0.45 * editRatio
  if (distinctiveConflict) score = Math.min(score, 0.6)
  // Round to 4 dp for stable transport/tests.
  score = Math.round(score * 10000) / 10000
  return { score, signals: { exact: false, tokenSet, editRatio, distinctiveConflict } }
}

/**
 * Match a source name to the best candidate. When `aliasHit` (an exact-normalized
 * learned alias → schoolId) is supplied, short-circuit to tier `alias` at
 * confidence 1.0 (safe because an alias key is exact-normalized). Otherwise score +
 * rank every candidate and resolve the tier conservatively:
 *   exact-normalized top (+ margin) → `exact`
 *   top ≥ AUTO && (top − second) ≥ MARGIN → `high` (auto-apply)
 *   top ≥ REVIEW → `review`
 *   else → `none`.
 */
export function matchSchoolName(
  query: string,
  candidates: MatchCandidate[],
  aliasHit?: MatchCandidate | null,
): NameMatchResult {
  const ranked: RankedCandidate[] = candidates
    .map((cand) => {
      const { score, signals } = scoreNameMatch(query, cand.name)
      return { schoolId: cand.schoolId, name: cand.name, confidence: score, signals }
    })
    .sort((a, b) => b.confidence - a.confidence)

  if (aliasHit) {
    return {
      tier: 'alias',
      best: { schoolId: aliasHit.schoolId, name: aliasHit.name, confidence: 1, viaAlias: true },
      ranked,
    }
  }

  if (ranked.length === 0) return { tier: 'none', best: null, ranked }

  const top = ranked[0]!
  const second = ranked[1]
  const margin = top.confidence - (second?.confidence ?? 0)

  let tier: MatchTier
  if (top.signals.exact && margin >= MATCH.MARGIN) tier = 'exact'
  else if (top.confidence >= MATCH.AUTO && margin >= MATCH.MARGIN) tier = 'high'
  else if (top.confidence >= MATCH.REVIEW) tier = 'review'
  else tier = 'none'

  const best =
    tier === 'none'
      ? null
      : { schoolId: top.schoolId, name: top.name, confidence: top.confidence, viaAlias: false }
  return { tier, best, ranked }
}
