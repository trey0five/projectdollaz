// ─────────────────────────────────────────────────────────────────────────────
// @finrep/compliance — Policy REVIEW-STATUS (Phase 3 Governance v1).
//
// A PURE, framework-free, INJECTABLE-`now` function shared by BOTH the governance
// PoliciesService (to enrich each CRUD response) AND the analytics BriefingService
// (the new 'governance' STEP). One source of truth → the register list and the
// briefing can never disagree about a policy's review status.
//
// DETERMINISM CONTRACT: this module reads NOTHING ambient — it never constructs a
// date object, never calls the clock, never touches I/O. It obeys the package
// PURITY GUARD (see __tests__/purity.test.ts, which forbids the date-static and
// date-constructor tokens): all date math is done on plain integers via a
// proleptic-Gregorian day-number (civil ↔ days-since-epoch), so the same (input,
// now) ALWAYS yields the same result on any host/timezone. `now` arrives as a
// caller-supplied value and we only READ its UTC accessors.
//
// HONESTY CONTRACT: a policy with no anchor date, a non-positive interval, or a
// non-'active' lifecycle status yields { status:'unknown', nextReviewDate:null,
// daysUntilDue:null }. We NEVER fabricate a review date.
// ─────────────────────────────────────────────────────────────────────────────

export type ReviewStatus = 'current' | 'due-soon' | 'overdue' | 'unknown'

/** Default "due soon" horizon — matches the 60-day compliance/AUP cadence. */
export const DUE_SOON_DAYS = 60

/** Overdue by at least a full quarter → the briefing escalates warn → critical. */
export const BADLY_OVERDUE_DAYS = 90

export interface PolicyReviewInput {
  /** yyyy-mm-dd string, a JS Date (@db.Date), or null. */
  adoptedDate: Date | string | null
  /** yyyy-mm-dd string, a JS Date (@db.Date), or null. */
  lastReviewedDate: Date | string | null
  reviewIntervalMonths: number
  /**
   * The policy LIFECYCLE status ('active' | 'draft' | 'retired'). Only 'active'
   * policies have a live review clock; draft/retired → 'unknown'. Optional (a
   * caller that only cares about the date math omits it; treated as active).
   */
  status?: string
}

export interface PolicyReviewResult {
  status: ReviewStatus
  /** yyyy-mm-dd, or null when unknown (never fabricated). */
  nextReviewDate: string | null
  /** Whole days until the next review; negative = overdue by N days; null unknown. */
  daysUntilDue: number | null
}

/** A calendar date as plain integers (proleptic Gregorian, UTC — no Date object). */
export interface Civil {
  y: number
  m: number // 1-12
  d: number // 1-31
}

// Days from civil date → days since 1970-01-01 (Howard Hinnant's algorithm).
// Pure integer math; no Date, no timezone. EXPORTED so the sibling task-urgency
// helper reuses the exact same UTC-accessor day math (one source of truth, no
// drift) — both stay within the package purity guard.
export function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y
  const era = Math.floor((yy >= 0 ? yy : yy - 399) / 400)
  const yoe = yy - era * 400
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

/** Last day of a given (year, month 1-12) — leap-year aware, pure. */
function lastDayOfMonth(y: number, m: number): number {
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (m === 2 && (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))) return 29
  return days[m - 1]
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function civilToIso(c: Civil): string {
  return `${c.y}-${pad(c.m)}-${pad(c.d)}`
}

/** Normalize a Date|string|null to a Civil, or null. Only READS a Date's UTC
 *  accessors (never constructs one), keeping the module purity-guard clean.
 *  EXPORTED so task-urgency shares the identical parse (no drift). */
export function toCivil(v: Date | string | null | undefined): Civil | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'object' && typeof (v as Date).getUTCFullYear === 'function') {
    const dt = v as Date
    const t = dt.getTime()
    if (Number.isNaN(t)) return null
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }
  }
  const iso = String(v).slice(0, 10)
  const mm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!mm) return null
  const y = Number(mm[1])
  const m = Number(mm[2])
  const d = Number(mm[3])
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return { y, m, d }
}

/** Add `months` to a Civil, clamping day overflow (Jan-31 + 1mo → Feb-28/29). */
function addMonths(c: Civil, months: number): Civil {
  const total = c.m - 1 + months
  const y = c.y + Math.floor(total / 12)
  const m = ((total % 12) + 12) % 12 + 1
  const d = Math.min(c.d, lastDayOfMonth(y, m))
  return { y, m, d }
}

/**
 * Compute a policy's review status. `now` is INJECTED for determinism; tests pin
 * a fixed value, callers pass the current time (we only read its UTC accessors).
 *
 *   anchor          = lastReviewedDate ?? adoptedDate
 *   nextReviewDate  = anchor + reviewIntervalMonths (calendar, day-clamped)
 *   daysUntilDue    = (nextReview − today) in whole UTC days
 *   status          = overdue (<0) | due-soon (0..dueSoonDays) | current (>)
 *
 * Returns 'unknown' (no fabricated date) when there is no anchor date, the
 * interval is non-positive, or the lifecycle status is not 'active'.
 */
export function computeReviewStatus(
  p: PolicyReviewInput,
  now: Date,
  dueSoonDays = DUE_SOON_DAYS,
): PolicyReviewResult {
  const unknown: PolicyReviewResult = {
    status: 'unknown',
    nextReviewDate: null,
    daysUntilDue: null,
  }

  // Lifecycle gate: only 'active' policies have a live review clock.
  if (p.status !== undefined && p.status !== 'active') return unknown

  // Guard a non-positive / non-finite interval.
  if (!Number.isFinite(p.reviewIntervalMonths) || p.reviewIntervalMonths <= 0) return unknown

  // anchor = lastReviewed wins over adopted; either may be null.
  const anchor = toCivil(p.lastReviewedDate) ?? toCivil(p.adoptedDate)
  if (anchor === null) return unknown

  const next = addMonths(anchor, Math.trunc(p.reviewIntervalMonths))
  const nextDays = daysFromCivil(next.y, next.m, next.d)
  // Decompose `now` to its UTC calendar day (accessor reads only — no Date built).
  const todayDays = daysFromCivil(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate())
  const daysUntilDue = nextDays - todayDays

  let status: ReviewStatus
  if (daysUntilDue < 0) status = 'overdue'
  else if (daysUntilDue <= dueSoonDays) status = 'due-soon'
  else status = 'current'

  return { status, nextReviewDate: civilToIso(next), daysUntilDue }
}
