// ─────────────────────────────────────────────────────────────────────────────
// Student matching — PURE (candidate rows + roster in, decisions out).
//
// A scores file rarely carries the same identifier the roster does, so matching
// runs a short ladder of increasingly forgiving rules and STOPS at the first
// confident answer:
//   1. external id (the SIS sourcedId) — exact, unambiguous, done
//   2. last + first + grade — the normal case for a hand-built file
//   3. last + first — when the file omits grade or the child changed grade
//   4. last + first initial + grade — "Amy" vs "Amelia", "Bob" vs "Robert"
//
// AMBIGUITY IS NOT A MATCH. Two children named Ryan Walsh in grade 5 means the
// row stays unmatched rather than being attached to a coin-flip: a wrong
// attachment is worse than an honest gap, because it silently misfiles one
// child's scores under another child's name.
//
// An unmatched row is still a first-class row — it ingests, it counts toward the
// school aggregate, and it appears in the review register so a human can attach
// it. A school with no roster loaded still gets complete dashboards.
// ─────────────────────────────────────────────────────────────────────────────

export interface RosterStudent {
  id: string
  firstName: string
  lastName: string
  grade: string
  externalId: string | null
}

export interface MatchCandidate {
  externalId: string | null
  firstName: string | null
  lastName: string | null
  gradeLevel: string | null
}

export type MatchRule = 'externalId' | 'nameGrade' | 'name' | 'initialGrade' | 'none'

export interface MatchDecision {
  studentId: string | null
  status: 'auto' | 'unmatched'
  rule: MatchRule
  /** Set when more than one roster student answered to the same rule. */
  ambiguous: boolean
}

export interface MatchSummary {
  matched: number
  unmatched: number
  ambiguous: number
  byRule: Record<MatchRule, number>
}

/** Fold accents, collapse spacing, drop punctuation: "O'Brien" ≡ "obrien". */
export function normalizeName(v: string | null | undefined): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeGrade(v: string | null | undefined): string {
  const s = String(v ?? '').trim().toUpperCase()
  if (s === '') return ''
  if (s === 'KG' || s === 'KDG' || s === 'KINDERGARTEN') return 'K'
  const n = Number.parseInt(s, 10)
  return Number.isFinite(n) ? String(n) : s
}

interface RosterIndex {
  byExternalId: Map<string, RosterStudent[]>
  byNameGrade: Map<string, RosterStudent[]>
  byName: Map<string, RosterStudent[]>
  byInitialGrade: Map<string, RosterStudent[]>
}

function push(map: Map<string, RosterStudent[]>, key: string, s: RosterStudent): void {
  if (key === '') return
  const list = map.get(key)
  if (list) list.push(s)
  else map.set(key, [s])
}

/** Build the lookup once per import — matching a 400-row file against a 400-row
 *  roster is otherwise 160,000 comparisons. */
export function indexRoster(roster: RosterStudent[]): RosterIndex {
  const idx: RosterIndex = {
    byExternalId: new Map(),
    byNameGrade: new Map(),
    byName: new Map(),
    byInitialGrade: new Map(),
  }
  for (const s of roster) {
    const last = normalizeName(s.lastName)
    const first = normalizeName(s.firstName)
    const grade = normalizeGrade(s.grade)
    if (s.externalId) push(idx.byExternalId, s.externalId.trim(), s)
    if (last && first) {
      push(idx.byName, `${last}|${first}`, s)
      if (grade) {
        push(idx.byNameGrade, `${last}|${first}|${grade}`, s)
        push(idx.byInitialGrade, `${last}|${first.charAt(0)}|${grade}`, s)
      }
    }
  }
  return idx
}

/** Resolve one candidate against the indexed roster. */
export function matchStudent(candidate: MatchCandidate, idx: RosterIndex): MatchDecision {
  const ext = candidate.externalId?.trim() ?? ''
  const last = normalizeName(candidate.lastName)
  const first = normalizeName(candidate.firstName)
  const grade = normalizeGrade(candidate.gradeLevel)

  const attempts: Array<{ rule: MatchRule; hits: RosterStudent[] | undefined }> = [
    { rule: 'externalId', hits: ext ? idx.byExternalId.get(ext) : undefined },
    { rule: 'nameGrade', hits: last && first && grade ? idx.byNameGrade.get(`${last}|${first}|${grade}`) : undefined },
    { rule: 'name', hits: last && first ? idx.byName.get(`${last}|${first}`) : undefined },
    {
      rule: 'initialGrade',
      hits: last && first && grade ? idx.byInitialGrade.get(`${last}|${first.charAt(0)}|${grade}`) : undefined,
    },
  ]

  for (const { rule, hits } of attempts) {
    if (!hits || hits.length === 0) continue
    if (hits.length > 1) {
      // Ambiguous at this rule — a looser rule cannot disambiguate what a
      // tighter one could not, so stop here rather than guessing downward.
      return { studentId: null, status: 'unmatched', rule, ambiguous: true }
    }
    return { studentId: hits[0].id, status: 'auto', rule, ambiguous: false }
  }
  return { studentId: null, status: 'unmatched', rule: 'none', ambiguous: false }
}

/** Match a whole file and report how it went — the numbers the review step shows. */
export function matchAll(
  candidates: MatchCandidate[],
  roster: RosterStudent[],
): { decisions: MatchDecision[]; summary: MatchSummary } {
  const idx = indexRoster(roster)
  const decisions = candidates.map((c) => matchStudent(c, idx))
  const byRule: Record<MatchRule, number> = { externalId: 0, nameGrade: 0, name: 0, initialGrade: 0, none: 0 }
  let matched = 0
  let ambiguous = 0
  for (const d of decisions) {
    byRule[d.rule] += 1
    if (d.status === 'auto') matched += 1
    if (d.ambiguous) ambiguous += 1
  }
  return {
    decisions,
    summary: { matched, unmatched: decisions.length - matched, ambiguous, byRule },
  }
}
