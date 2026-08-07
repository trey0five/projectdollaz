// ─────────────────────────────────────────────────────────────────────────────
// The roll-forward. Opening balance + dated events → buckets, low point, and the
// one number the whole feature exists to produce: the date of first shortfall.
//
// ONE ENGINE, TWO HORIZONS. The 13-week cash-management view and the 12-month
// planning view are the SAME events bucketed differently. Building two models
// would guarantee they eventually disagree and someone would have to explain
// which one the board should believe. A test pins that both granularities over
// one event set reach an identical ending balance.
//
// WHY THE SHORTFALL DATE IS THE HEADLINE. Schools run negative from June through
// August — payroll and benefits continue while tuition receipts stop — and most
// heads feel that trough rather than see it coming. A dated breach, its size, and
// how many days of warning it carries is the single most useful output here.
//
// NO INVENTED THRESHOLD. When the school has not set a reserve floor, no
// shortfall is reported at all. Manufacturing a floor would manufacture an alarm
// the school never asked for, on a screen whose entire value is being trusted.
// ─────────────────────────────────────────────────────────────────────────────
import {
  addDays,
  daysBetween,
  isoToDays,
  lastDayOfMonth,
  monthKey,
  parseIso,
  startOfWeek,
  toIso,
} from './civil.js'
import { sortEvents } from './calendar.js'
import { CONFIDENCE_CLASSES } from './types.js'
import type {
  CashBucket,
  CashEvent,
  CashProjectionInput,
  CashProjectionResult,
  ConfidenceClass,
  Granularity,
} from './types.js'

const zeroByConfidence = (): Record<ConfidenceClass, number> => ({
  committed: 0,
  scheduled: 0,
  modelled: 0,
  assumption: 0,
})

/** Empty result for an input that cannot be projected — a SHAPE, never a null. */
function emptyResult(input: CashProjectionInput): CashProjectionResult {
  return {
    asOfDate: input.asOfDate,
    horizonEnd: input.horizonEnd,
    granularity: input.granularity,
    openingCash: Number.isFinite(input.openingCash) ? input.openingCash : 0,
    buckets: [],
    lowestBalance: Number.isFinite(input.openingCash) ? input.openingCash : 0,
    lowestDate: null,
    endingBalance: Number.isFinite(input.openingCash) ? input.openingCash : 0,
    firstShortfallDate: null,
    shortfallAmount: null,
    daysOfNotice: null,
    monthsCashAtLowPoint: null,
    byConfidence: zeroByConfidence(),
    totalReceipts: 0,
    totalDisbursements: 0,
  }
}

/** The bucket boundaries covering [from, to], at the requested granularity. */
function bucketWindows(
  from: string,
  to: string,
  granularity: Granularity,
): { start: string; end: string; key: string }[] {
  const toZ = isoToDays(to)
  if (toZ == null) return []
  const out: { start: string; end: string; key: string }[] = []

  if (granularity === 'week') {
    // Weeks are anchored on the Monday containing `from`, so the first bucket
    // holds the as-of date rather than starting a partial week beside it.
    let start = startOfWeek(from)
    for (let i = 0; i < 520 && start; i += 1) {
      const startZ = isoToDays(start)
      if (startZ == null || startZ > toZ) break
      const end = addDays(start, 6)
      if (!end) break
      out.push({ start, end, key: start })
      const next = addDays(start, 7)
      if (!next) break
      start = next
    }
    return out
  }

  const c = parseIso(from)
  if (!c) return []
  let y = c.y
  let m = c.m
  for (let i = 0; i < 120; i += 1) {
    const start = toIso({ y, m, d: 1 })
    const startZ = isoToDays(start)
    if (startZ == null || startZ > toZ) break
    const end = toIso({ y, m, d: lastDayOfMonth(y, m) })
    out.push({ start, end, key: monthKey(start) ?? start })
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

/**
 * Project cash forward.
 *
 * TOTAL: a malformed window, a non-finite opening balance or an empty event set
 * all return a complete empty shape rather than throwing. A forecast surface that
 * crashes on one bad row is worse than one that says it has nothing to show.
 */
export function projectCash(input: CashProjectionInput): CashProjectionResult {
  const asOfZ = isoToDays(input.asOfDate)
  const endZ = isoToDays(input.horizonEnd)
  if (asOfZ == null || endZ == null || endZ < asOfZ) return emptyResult(input)
  if (!Number.isFinite(input.openingCash)) return emptyResult(input)

  // Events strictly AFTER the as-of date. The opening balance already contains
  // everything that happened on or before it; counting an as-of-day event again
  // would double it.
  const events = sortEvents(
    input.events.filter((e) => {
      const z = isoToDays(e.date)
      return z != null && z > asOfZ && z <= endZ && Number.isFinite(e.amount)
    }),
  )

  const windows = bucketWindows(input.asOfDate, input.horizonEnd, input.granularity)
  if (windows.length === 0) return emptyResult(input)

  const threshold =
    typeof input.reserveThreshold === 'number' && Number.isFinite(input.reserveThreshold)
      ? input.reserveThreshold
      : null

  const byConfidence = zeroByConfidence()
  let balance = input.openingCash
  let lowestBalance = input.openingCash
  let lowestDate: string | null = null
  let firstShortfallDate: string | null = null
  let worstBreach: number | null = null
  let totalReceipts = 0
  let totalDisbursements = 0

  const buckets: CashBucket[] = []
  let cursor = 0

  for (const w of windows) {
    const wEndZ = isoToDays(w.end)
    if (wEndZ == null) continue
    const opening = balance
    const bucketByConfidence = zeroByConfidence()
    let receipts = 0
    let disbursements = 0

    while (cursor < events.length) {
      const e = events[cursor]
      const z = isoToDays(e.date)
      if (z == null || z > wEndZ) break
      const signed = e.direction === 'in' ? Math.abs(e.amount) : -Math.abs(e.amount)
      if (e.direction === 'in') receipts += Math.abs(e.amount)
      else disbursements += Math.abs(e.amount)
      bucketByConfidence[e.confidence] += signed
      byConfidence[e.confidence] += signed
      balance += signed

      // THE BREACH IS DETECTED AT THE EVENT, NOT THE BUCKET EDGE. A school that
      // dips under its reserve mid-week and recovers by Friday has still
      // breached, and a week-end-only check would hide exactly the moment the
      // business manager needed to act on.
      if (threshold != null && balance < threshold && firstShortfallDate == null) {
        firstShortfallDate = e.date
      }
      if (threshold != null && balance < threshold) {
        const gap = threshold - balance
        if (worstBreach == null || gap > worstBreach) worstBreach = gap
      }
      if (balance < lowestBalance) {
        lowestBalance = balance
        lowestDate = e.date
      }
      cursor += 1
    }

    totalReceipts += receipts
    totalDisbursements += disbursements

    buckets.push({
      start: w.start,
      end: w.end,
      key: w.key,
      openingBalance: opening,
      receipts,
      disbursements,
      netChange: receipts - disbursements,
      closingBalance: balance,
      byConfidence: bucketByConfidence,
      belowReserve: threshold != null && balance < threshold,
    })
  }

  const annualExpense =
    typeof input.annualOperatingExpense === 'number' &&
    Number.isFinite(input.annualOperatingExpense) &&
    input.annualOperatingExpense > 0
      ? input.annualOperatingExpense
      : null

  return {
    asOfDate: input.asOfDate,
    horizonEnd: input.horizonEnd,
    granularity: input.granularity,
    openingCash: input.openingCash,
    buckets,
    lowestBalance,
    lowestDate,
    endingBalance: balance,
    firstShortfallDate,
    shortfallAmount: worstBreach,
    daysOfNotice:
      firstShortfallDate == null ? null : daysBetween(input.asOfDate, firstShortfallDate),
    // Months of cash AT THE LOW POINT, not today — the low point is the moment
    // that matters, and quoting today's coverage over a summer trough would be
    // the reassuring half of a two-part truth.
    monthsCashAtLowPoint: annualExpense == null ? null : lowestBalance / (annualExpense / 12),
    byConfidence,
    totalReceipts,
    totalDisbursements,
  }
}

/**
 * The share of the horizon's movement that rests on genuinely known dates and
 * amounts. This is what lets the surface above say how much of a forecast is a
 * calendar and how much is an estimate, instead of presenting both alike.
 *
 * Measured over ABSOLUTE movement: a receipt and a disbursement of equal size are
 * two facts, not zero.
 */
export function committedShare(result: CashProjectionResult): number | null {
  let total = 0
  let committed = 0
  for (const k of CONFIDENCE_CLASSES) {
    total += Math.abs(result.byConfidence[k])
    if (k === 'committed') committed += Math.abs(result.byConfidence[k])
  }
  return total === 0 ? null : committed / total
}

/** Convenience: the events one bucket contains, for a drill-down. */
export function eventsInBucket(
  events: readonly CashEvent[],
  bucket: Pick<CashBucket, 'start' | 'end'>,
): CashEvent[] {
  const s = isoToDays(bucket.start)
  const e = isoToDays(bucket.end)
  if (s == null || e == null) return []
  return sortEvents(
    events.filter((ev) => {
      const z = isoToDays(ev.date)
      return z != null && z >= s && z <= e
    }),
  )
}
