// ─────────────────────────────────────────────────────────────────────────────
// The saved KYRO insight (period_insights) must follow the data.
//
// Live report 2026-10-15 (Verify Test School): a P&L saved alone and then the
// full P&L + Balance Sheet pair for the same period left a warning describing
// the P&L-only save ("Days Cash on Hand is a risk at 0 days" beside 152 days);
// a review-popup Approve (mapping merge → rebuild) left "Not enough data…".
//
// Two layers keep the cache honest:
//   1. InsightService keys the cache on the snapshot's generated-at time as well
//      as the metric values, so ANY new snapshot (whatever path wrote it) misses.
//   2. Every path that writes or clears a period's statement snapshot calls
//      clearPeriodInsights, so the stale row is gone the moment the data moves.
//      Later periods are cleared too: their period-over-period deltas read this
//      period's snapshot as their "prior".
//
// Best-effort and never throws: an insight cache hiccup must never fail a save,
// a delete or a remap — the fingerprint check is still there behind it.
// ─────────────────────────────────────────────────────────────────────────────
import type { PrismaService } from '../prisma/prisma.service.js'

type InsightPrisma = Pick<PrismaService, 'periodInsight'>

/**
 * Delete the cached insight of `fiscalPeriodId` and of every later period of the
 * school (their deltas compare against it). With no period → the whole school.
 * Returns the number of rows removed (0 on any failure).
 */
export async function clearPeriodInsights(
  prisma: InsightPrisma | null | undefined,
  schoolId: string,
  fiscalPeriodId?: string | null,
  periodEndDate?: Date | null,
): Promise<number> {
  try {
    const table = prisma?.periodInsight
    if (!table || typeof table.deleteMany !== 'function') return 0
    const where = fiscalPeriodId
      ? periodEndDate
        ? {
            schoolId,
            OR: [
              { fiscalPeriodId },
              { fiscalPeriod: { periodEndDate: { gt: periodEndDate } } },
            ],
          }
        : { schoolId, fiscalPeriodId }
      : { schoolId }
    const res = await table.deleteMany({ where })
    return res?.count ?? 0
  } catch {
    return 0
  }
}
