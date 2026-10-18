// ─────────────────────────────────────────────────────────────────────────────
// PURE roster tallies behind the suppression basis (privacy review round 4).
//
// The public gate (aggregate-suppression.ts) decides what to publish from more
// than the filtered counts: it needs the WHOLE roster and the "base" reads a
// filtered request could be differenced against, each split BY STATUS, because
// every demographic breakdown is published over ONE status group. This module
// counts those row sets. It never sees a name — the projection has no name
// field — and it is shared by StudentsService.aggregate (rows from Prisma) and
// the attacker harness in the specs (rows from a fixture), so the two can never
// count differently.
// ─────────────────────────────────────────────────────────────────────────────
import { AGE_BAND_KEYS, STUDENT_STATUS_KEYS, type AgeBandKey, type StudentStatusKey } from '@finrep/analytics'

/** The per-student projection a tally needs (no names, no free text). */
export interface TallyRow {
  status: string
  grade: string
  gender: string | null
  race: string | null
  ethnicity: string | null
  ageBand: AgeBandKey
  hasIep: boolean
  has504: boolean
  ell: boolean
}

/** Counts over one row set. Null demographics are "not recorded" and omitted. */
export interface Tally {
  n: number
  grade: Partial<Record<string, number>>
  gender: Partial<Record<string, number>>
  race: Partial<Record<string, number>>
  ethnicity: Partial<Record<string, number>>
  ageBand: Record<AgeBandKey, number>
  flags: { iep: number; plan504: number; ell: number; any: number }
}

/** One tally per status group. Rows with a status outside the vocabulary are not counted. */
export type StatusTallies = Record<StudentStatusKey, Tally>

export function emptyTally(): Tally {
  return {
    n: 0,
    grade: {},
    gender: {},
    race: {},
    ethnicity: {},
    ageBand: Object.fromEntries(AGE_BAND_KEYS.map((k) => [k, 0])) as Record<AgeBandKey, number>,
    flags: { iep: 0, plan504: 0, ell: 0, any: 0 },
  }
}

function add(t: Tally, r: TallyRow): void {
  t.n++
  t.grade[r.grade] = (t.grade[r.grade] ?? 0) + 1
  if (r.gender) t.gender[r.gender] = (t.gender[r.gender] ?? 0) + 1
  if (r.race) t.race[r.race] = (t.race[r.race] ?? 0) + 1
  if (r.ethnicity) t.ethnicity[r.ethnicity] = (t.ethnicity[r.ethnicity] ?? 0) + 1
  t.ageBand[r.ageBand] = (t.ageBand[r.ageBand] ?? 0) + 1
  if (r.hasIep) t.flags.iep++
  if (r.has504) t.flags.plan504++
  if (r.ell) t.flags.ell++
  if (r.hasIep || r.has504 || r.ell) t.flags.any++
}

export function tallyByStatus(rows: readonly TallyRow[]): StatusTallies {
  const out = Object.fromEntries(STUDENT_STATUS_KEYS.map((k) => [k, emptyTally()])) as StatusTallies
  for (const r of rows) {
    if ((STUDENT_STATUS_KEYS as readonly string[]).includes(r.status)) add(out[r.status as StudentStatusKey], r)
  }
  return out
}

const addMap = (a: Partial<Record<string, number>>, b: Partial<Record<string, number>>) => {
  for (const [k, v] of Object.entries(b)) if (typeof v === 'number') a[k] = (a[k] ?? 0) + v
}

/** The union of several disjoint status groups. */
export function sumTallies(ts: readonly Tally[]): Tally {
  const out = emptyTally()
  for (const t of ts) {
    out.n += t.n
    addMap(out.grade, t.grade)
    addMap(out.gender, t.gender)
    addMap(out.race, t.race)
    addMap(out.ethnicity, t.ethnicity)
    for (const k of AGE_BAND_KEYS) out.ageBand[k] += t.ageBand[k] ?? 0
    out.flags.iep += t.flags.iep
    out.flags.plan504 += t.flags.plan504
    out.flags.ell += t.flags.ell
    out.flags.any += t.flags.any
  }
  return out
}

/** Every status group of a split, summed. */
export const allStatuses = (t: StatusTallies): Tally => sumTallies(STUDENT_STATUS_KEYS.map((k) => t[k]))

/** Per-status headcounts of a split — the status partition of that row set. */
export const statusCounts = (t: StatusTallies): Record<StudentStatusKey, number> =>
  Object.fromEntries(STUDENT_STATUS_KEYS.map((k) => [k, t[k].n])) as Record<StudentStatusKey, number>

const minusMap = (a: Partial<Record<string, number>>, b: Partial<Record<string, number>>) => {
  const out: Partial<Record<string, number>> = {}
  for (const [k, v] of Object.entries(a)) {
    if (typeof v !== 'number') continue
    const d = v - (b[k] ?? 0)
    if (d > 0) out[k] = d
  }
  return out
}

/** a − b for a row set b ⊆ a: the students in a and not in b (clamped at 0). */
export function minusTally(a: Tally, b: Tally): Tally {
  return {
    n: Math.max(0, a.n - b.n),
    grade: minusMap(a.grade, b.grade),
    gender: minusMap(a.gender, b.gender),
    race: minusMap(a.race, b.race),
    ethnicity: minusMap(a.ethnicity, b.ethnicity),
    ageBand: Object.fromEntries(AGE_BAND_KEYS.map((k) => [k, Math.max(0, (a.ageBand[k] ?? 0) - (b.ageBand[k] ?? 0))])) as Record<AgeBandKey, number>,
    flags: {
      iep: Math.max(0, a.flags.iep - b.flags.iep),
      plan504: Math.max(0, a.flags.plan504 - b.flags.plan504),
      ell: Math.max(0, a.flags.ell - b.flags.ell),
      any: Math.max(0, a.flags.any - b.flags.any),
    },
  }
}

export const minusTallies = (a: StatusTallies, b: StatusTallies): StatusTallies =>
  Object.fromEntries(STUDENT_STATUS_KEYS.map((k) => [k, minusTally(a[k], b[k])])) as StatusTallies
