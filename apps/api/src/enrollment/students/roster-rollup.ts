// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 — PURE roster→aggregate rollup, shared by StudentsService (snapshot
// auto-sync) and EnrollmentService (live 'roster'-mode summary/demographics).
// Lives in its own file so enrollment.service can consume it WITHOUT importing
// students.service (which imports enrollment.service — no ESM cycle). Aggregate
// counts only — this module never sees or emits a name.
// ─────────────────────────────────────────────────────────────────────────────
import { GRADE_KEYS, type DemographicBreakdown, type GradeKey } from '@finrep/analytics'

/** The minimal per-student projection the rollup needs (no names, no PII). */
export interface RosterRollupRow {
  status: string
  grade: string
  gender: string | null
  race: string | null
  ethnicity: string | null
}

export interface RosterRollup {
  /** Enrolled headcount (waitlist/withdrawn/graduated excluded). */
  totalEnrolled: number
  /** Enrolled count per canonical grade (zero grades omitted, GRADE_KEYS order). */
  byGrade: Partial<Record<GradeKey, number>>
  byStatus: { enrolled: number; waitlist: number; withdrawn: number; graduated: number }
  /** Canonical demographic COUNTS over the ENROLLED set (nulls = not recorded, omitted). */
  byDemographics: DemographicBreakdown
}

export function rosterRollup(students: RosterRollupRow[]): RosterRollup {
  const enrolled = students.filter((s) => s.status === 'enrolled')

  const byGrade: Partial<Record<GradeKey, number>> = {}
  for (const g of GRADE_KEYS) {
    const n = enrolled.filter((s) => s.grade === g).length
    if (n > 0) byGrade[g] = n
  }

  const byStatus = {
    enrolled: enrolled.length,
    waitlist: students.filter((s) => s.status === 'waitlist').length,
    withdrawn: students.filter((s) => s.status === 'withdrawn').length,
    graduated: students.filter((s) => s.status === 'graduated').length,
  }

  const byDemographics: DemographicBreakdown = {}
  const bump = (dim: 'gender' | 'race' | 'ethnicity', key: string | null) => {
    if (!key) return
    const map = (byDemographics[dim] ?? {}) as Record<string, number>
    map[key] = (map[key] ?? 0) + 1
    byDemographics[dim] = map as never
  }
  for (const s of enrolled) {
    bump('gender', s.gender)
    bump('race', s.race)
    bump('ethnicity', s.ethnicity)
  }

  return { totalEnrolled: enrolled.length, byGrade, byStatus, byDemographics }
}
