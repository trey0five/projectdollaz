import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import { isEvaluationOverdue, isInspectionOverdue } from '../twin/twin-contract.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC PHASE J — COUNTS ONLY. NEVER A NAME.
//
// This is the ONLY file under apps/api/src/assistant/ permitted to read the staff
// evaluation register, and it reads exactly three columns. `no-penny-pii.spec.ts`
// pins both halves of that sentence.
//
// WHY IT IS A DIRECT PRISMA READ AND NOT AN INJECTED HR SERVICE. `HrModule`
// exports nothing, deliberately. Exporting `StaffEvaluationsService` would hand
// this file `StaffEvaluationPublic`, which carries an evaluator identity and a
// person identity, and the safety of everything downstream would then rest on this
// file remembering not to read fields it had been handed. A three-column select
// cannot leak an identity because it never loads one — the guarantee is structural,
// not behavioural, and that is the difference between a rule and a habit.
//
// THE SELECT BELOW IS A SAFETY BOUNDARY, NOT A PERFORMANCE CHOICE. Widening it —
// by any column naming a person, for any reason, however convenient the caller
// finds it — is the PII-1 mutation this phase's guard exists to catch, and it must
// fail review even when it arrives as a small diff with a plausible explanation.
//
// WHY THE PREDICATES ARE IMPORTED FROM THE TWIN CONTRACT. `isEvaluationOverdue` and
// `isInspectionOverdue` are the SAME functions that gate HR-EVAL-OVERDUE and
// FAC-INSPECTION-DUE. A second copy here would let the number Penny speaks disagree
// with the number that fired the rule the user is reading about — the disagreement
// would be invisible, permanent and impossible to explain. Importing a pure
// function from a contract file is not a Nest module edge: twin-contract.ts is
// types and pure predicates with no decorator in it.
//
// "COLLECTED, AND THERE ARE ZERO ROWS" IS NOT "WE DO NOT COLLECT THIS." An empty
// register returns `total: 0` and a real `asOf`, never a refusal. Conflating the
// two is the §0 failure in miniature: a product that reports its own empty register
// as an absent capability teaches people to stop entering data into it.
// ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000

/** UTC calendar day, the house civil-day convention. */
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Whole civil days from `fromIso` to `toIso` (negative when `toIso` is earlier). */
function daysBetweenIso(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00.000Z`)
  const b = Date.parse(`${toIso}T00:00:00.000Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.round((b - a) / DAY_MS)
}

/**
 * The register's shape as Penny may ever see it.
 *
 * NOTE WHAT IS NOT HERE: no id, no person reference, no evaluator, no title, no
 * free text. There is no field on this object a model could render as a person.
 */
export interface StaffEvaluationCoverage {
  total: number
  overdue: number
  /** Days past the OLDEST still-overdue row's OWN recorded due date. 0 when none. */
  oldestOverdueDays: number
  completedLast12m: number
  byStatus: Record<string, number>
}

/** The compliance-inspection subset of the facilities register, as counts. */
export interface InspectionCoverage {
  total: number
  overdue: number
  oldestOverdueDays: number
  byStatus: Record<string, number>
}

export interface CoverageCounts<T> {
  counts: T
  asOf: string
}

function tally(values: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const v of values) out[v] = (out[v] ?? 0) + 1
  return out
}

@Injectable()
export class CoverageService {
  private readonly logger = new Logger(CoverageService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Teacher-evaluation COUNTS for one school.
   *
   * Returns `null` only when the read itself failed. Unreadable is NOT "zero
   * overdue" — the same rule the twin register holds — so the caller refuses
   * rather than reporting a comfortable zero it never observed.
   */
  async staffEvaluations(
    schoolId: string,
    now: Date = new Date(),
  ): Promise<CoverageCounts<StaffEvaluationCoverage> | null> {
    try {
      const rows = await this.prisma.staffEvaluation.findMany({
        where: { schoolId },
        // EXACTLY THESE THREE COLUMNS. Pinned by no-penny-pii.spec.ts, which
        // compares the select key set — adding a fourth turns that spec red.
        select: { completedDate: true, dueDate: true, status: true },
      })
      const today = isoDay(now)
      const overdue = rows.filter((r) => isEvaluationOverdue(r, today))
      let oldest = 0
      for (const r of overdue) {
        const days = daysBetweenIso(isoDay(r.dueDate), today)
        if (days > oldest) oldest = days
      }
      const cutoff = isoDay(new Date(Date.parse(`${today}T00:00:00.000Z`) - 365 * DAY_MS))
      const completedLast12m = rows.filter(
        (r) => r.completedDate !== null && isoDay(r.completedDate) >= cutoff,
      ).length
      return {
        counts: {
          total: rows.length,
          overdue: overdue.length,
          oldestOverdueDays: oldest,
          completedLast12m,
          byStatus: tally(rows.map((r) => r.status)),
        },
        asOf: today,
      }
    } catch (e) {
      this.logger.warn(`staff evaluation coverage unreadable for ${schoolId}: ${String(e)}`)
      return null
    }
  }

  /**
   * Compliance-inspection COUNTS for one school. `complianceKind IS NOT NULL` is
   * the whole filter — the kind is DECLARED by the school and is never guessed from
   * a title or a category, exactly as the twin register reads it.
   */
  async complianceInspections(
    schoolId: string,
    now: Date = new Date(),
  ): Promise<CoverageCounts<InspectionCoverage> | null> {
    try {
      const rows = await this.prisma.maintenanceItem.findMany({
        where: { schoolId, complianceKind: { not: null } },
        select: { status: true, targetDate: true, complianceKind: true },
      })
      const today = isoDay(now)
      const overdue = rows.filter((r) => isInspectionOverdue(r, today))
      let oldest = 0
      for (const r of overdue) {
        if (r.targetDate === null) continue
        const days = daysBetweenIso(isoDay(r.targetDate), today)
        if (days > oldest) oldest = days
      }
      return {
        counts: {
          total: rows.length,
          overdue: overdue.length,
          oldestOverdueDays: oldest,
          byStatus: tally(rows.map((r) => r.status)),
        },
        asOf: today,
      }
    } catch (e) {
      this.logger.warn(`inspection coverage unreadable for ${schoolId}: ${String(e)}`)
      return null
    }
  }
}
