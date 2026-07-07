// ─────────────────────────────────────────────────────────────────────────────
// Strategic Planning — the PURE progress/pace verdict. Framework-free (no Nest,
// no Prisma, no I/O), and — critically — CLOCK-FREE: the caller passes `asOf` IN,
// so computing twice with the same inputs yields byte-identical output (trivially
// unit-testable, and no hidden Date.now() drift between the register and the
// briefing). This is the ONE place the "on pace / behind" judgement is made.
//
// DIRECTION-AGNOSTIC by construction: progress is `(current − baseline) / (target
// − baseline)`. A down-is-good metric (e.g. tuition_discount_rate: baseline 0.30 →
// target 0.20) needs NO special-casing — when the target is BELOW the baseline the
// denominator is negative, and a value that moved DOWN produces a POSITIVE fraction
// exactly like an up-is-good metric that moved up. Nothing here reads goodDirection.
// ─────────────────────────────────────────────────────────────────────────────

/** Slip inside this fraction of schedule is still "on track" (a 5% grace band). */
export const SLIP_TOLERANCE = 0.05
/** Behind by more than SLIP but within this fraction is "at risk"; beyond = "behind". */
export const RISK_TOLERANCE = 0.15

/** The five terminal pace verdicts. */
export type PaceStatus = 'on_track' | 'at_risk' | 'behind' | 'achieved' | 'no_data'

export interface PaceArgs {
  /** Frozen baseline value (raw metric number, or 0 for count-based goals). */
  baseline: number | null
  /** Current measured value (raw metric number, or done-count / manual fraction). */
  current: number | null
  /** Target value (raw metric number, or total-count / 1 for a fraction goal). */
  target: number | null
  /** ISO yyyy-mm-dd the schedule window opens (goal start / baseline date). */
  startDate: string | null
  /** ISO yyyy-mm-dd the goal is due. */
  targetDate: string | null
  /** ISO date/time "as of" — passed IN (no clock inside). */
  asOf: string
}

export interface PaceResult {
  /** Fraction of the way from baseline → target, CLAMPED 0..1; null when no data. */
  pctToTarget: number | null
  /** Fraction of the schedule elapsed at asOf, CLAMPED 0..1; null with no window. */
  expectedPct: number | null
  paceStatus: PaceStatus
  /** True when the RAW (unclamped) progress exceeded the target (>1). */
  overshoot: boolean
}

/** Clamp to the closed unit interval. */
export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

/** Parse an ISO date (yyyy-mm-dd or full ISO) to epoch ms at UTC; NaN when unparseable. */
function toMs(iso: string | null): number {
  if (!iso) return Number.NaN
  // Accept both a bare yyyy-mm-dd (@db.Date) and a full timestamp.
  const s = iso.length <= 10 ? `${iso}T00:00:00.000Z` : iso
  return Date.parse(s)
}

/**
 * Fraction of the schedule elapsed at `asOf`, clamped 0..1. Null when either
 * endpoint is missing/unparseable. A zero/negative window (targetDate ≤ startDate)
 * resolves to 1 (the goal is fully "due"), never a divide-by-zero.
 */
export function expectedFraction(
  startDate: string | null,
  targetDate: string | null,
  asOf: string,
): number | null {
  const s = toMs(startDate)
  const t = toMs(targetDate)
  const a = toMs(asOf)
  if (Number.isNaN(s) || Number.isNaN(t) || Number.isNaN(a)) return null
  if (t <= s) return 1
  return clamp01((a - s) / (t - s))
}

/**
 * THE pace verdict. Given a frozen baseline, a current value, a target, the
 * schedule window, and asOf, classify how the goal is tracking:
 *   • no_data  — any of baseline/current/target is null, or target === baseline
 *                (a zero-width goal is immeasurable, never a divide-by-zero);
 *   • achieved — the target has been reached or passed (raw progress ≥ 1);
 *   • else compare ACHIEVED progress vs EXPECTED progress:
 *       behindBy = expectedPct − pctToTarget
 *         ≤ SLIP_TOLERANCE  → on_track   (ahead, or within the 5% grace band)
 *         ≤ RISK_TOLERANCE  → at_risk
 *         otherwise         → behind
 * When there is no schedule window (expectedPct null) nothing is "due" yet, so a
 * goal that is merely making progress is on_track (bandStatus still colours risk).
 */
export function computePace(args: PaceArgs): PaceResult {
  const expectedPct = expectedFraction(args.startDate, args.targetDate, args.asOf)
  const { baseline, current, target } = args

  if (baseline === null || current === null || target === null) {
    return { pctToTarget: null, expectedPct, paceStatus: 'no_data', overshoot: false }
  }
  const denom = target - baseline
  if (denom === 0) {
    return { pctToTarget: null, expectedPct, paceStatus: 'no_data', overshoot: false }
  }

  const rawPct = (current - baseline) / denom
  const pctToTarget = clamp01(rawPct)
  const overshoot = rawPct > 1

  if (rawPct >= 1) {
    return { pctToTarget: 1, expectedPct, paceStatus: 'achieved', overshoot }
  }

  // No schedule → nothing is due yet; making any progress reads on_track.
  const exp = expectedPct ?? 0
  const behindBy = exp - pctToTarget
  const paceStatus: PaceStatus =
    behindBy <= SLIP_TOLERANCE ? 'on_track' : behindBy <= RISK_TOLERANCE ? 'at_risk' : 'behind'
  return { pctToTarget, expectedPct, paceStatus, overshoot }
}

/** Worst-of pace across a set of goals for a rollup (behind > at_risk > on_track).
 *  achieved / no_data are IGNORED for the worst-of (a done or unmeasured goal never
 *  drags a rollup down). Returns 'on_track' when nothing worse is present. */
export function worstPace(statuses: readonly PaceStatus[]): PaceStatus {
  if (statuses.includes('behind')) return 'behind'
  if (statuses.includes('at_risk')) return 'at_risk'
  return 'on_track'
}

/** Equal-weight mean of the defined (non-null) fractions, or null when none. */
export function meanFraction(values: readonly (number | null)[]): number | null {
  const defined = values.filter((v): v is number => v !== null)
  if (defined.length === 0) return null
  return defined.reduce((a, b) => a + b, 0) / defined.length
}
