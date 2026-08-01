import { FINDING_SEVERITIES, type FindingSeverity } from './finding-vocab.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase E — THE ONE NOTIFICATION PREDICATE.
//
// It lives in its own file, in apps/api/src/twin/, for exactly one reason: the
// alert service and the spec that proves "re-notifies exactly once" must share a
// single function. A predicate re-typed in a spec proves the spec, not the code.
//
// THREE EDGES, THREE WATERMARKS. "Exactly once" is not one condition. A finding
// can legitimately deserve a second email for three unrelated reasons — it came
// back after being cleared, it got worse, or the mute a human set has run out —
// and each needs its own high-water mark or the others swallow it:
//
//   lastNotifiedAt       when we last sent anything at all
//   notifiedReopenCount  the reopenCount AT that send  -> a re-arm is detectable
//   notifiedSeverity     the severity AT that send     -> an escalation is too
//
// AND ONE THING IT DELIBERATELY WILL NOT DO: it will never fire on a
// DE-ESCALATION. Clause (c) is strictly `>`. A `critical` that softens to `warn`
// satisfies no clause and sends nothing — a school does not need an email telling
// it that a problem got smaller, and a product that sends one teaches people to
// filter the whole channel.
//
// PURE. No clock of its own — `now` is passed in, so the acceptance sequence
// (notify, 44 days of silence, exactly one on lapse, silence after) is provable
// with an injected clock rather than with a sleep.
// ─────────────────────────────────────────────────────────────────────────────

/** Ordinal severity, low to high. `info` NEVER notifies (see `shouldNotify`). */
export const SEV_ORDER: Record<FindingSeverity, number> = {
  info: 0,
  warn: 1,
  critical: 2,
}

/** Total over anything the TEXT column can hold; an unknown value is the floor. */
export function sevOrder(v: string | null | undefined): number {
  if (typeof v === 'string' && (FINDING_SEVERITIES as readonly string[]).includes(v)) {
    return SEV_ORDER[v as FindingSeverity]
  }
  return SEV_ORDER.info
}

/**
 * The subset of an `AccreditationFinding` row the predicate reads. Structural, so
 * a spec can drive it with a literal and the service can hand it a Prisma row.
 */
export interface NotifiableFinding {
  severity: string
  status: string
  clearedAt: Date | null
  mutedUntil: Date | null
  lastNotifiedAt: Date | null
  reopenCount: number
  notifiedReopenCount: number
  notifiedSeverity: string | null
}

/**
 * Should this finding produce a notification right now?
 *
 * FALSE for every finding that is cleared, closed by a human, informational, or
 * inside a live mute — those are gates, not clauses. Past the gates, exactly four
 * clauses can open the door, and each one closes behind itself:
 *
 *   (a) never notified            — closed by writing lastNotifiedAt
 *   (b) re-armed since the send   — closed by writing notifiedReopenCount
 *   (c) escalated since the send  — closed by writing notifiedSeverity; STRICTLY
 *                                   `>`, so a de-escalation is silent
 *   (d) a mute lapsed             — closed permanently, because after the send
 *                                   lastNotifiedAt > mutedUntil forever
 */
export function shouldNotify(f: NotifiableFinding, now: Date): boolean {
  if (f.clearedAt !== null) return false
  if (f.status === 'resolved' || f.status === 'dismissed') return false
  // An `info` finding is a statement about our own visibility (SCHOOL-NOT-REPORTING
  // is the only one), never a warning. It belongs in the centre, not in an inbox.
  if (f.severity === 'info') return false
  // A live mute is a human saying "not now". It is honoured absolutely.
  if (f.mutedUntil !== null && f.mutedUntil.getTime() > now.getTime()) return false

  if (f.lastNotifiedAt === null) return true // (a)
  if (f.reopenCount > f.notifiedReopenCount) return true // (b)
  if (sevOrder(f.severity) > sevOrder(f.notifiedSeverity)) return true // (c)
  if (
    f.mutedUntil !== null &&
    f.mutedUntil.getTime() <= now.getTime() &&
    f.lastNotifiedAt.getTime() < f.mutedUntil.getTime()
  ) {
    return true // (d)
  }
  return false
}

/**
 * What a send writes back. Kept beside the predicate so the two can never drift:
 * every clause above is closed by exactly these three columns.
 */
export function notifySendData(
  f: Pick<NotifiableFinding, 'severity' | 'reopenCount'>,
  now: Date,
): { lastNotifiedAt: Date; notifiedReopenCount: number; notifiedSeverity: string } {
  return {
    lastNotifiedAt: now,
    notifiedReopenCount: f.reopenCount,
    notifiedSeverity: f.severity,
  }
}
