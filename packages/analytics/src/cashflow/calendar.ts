// ─────────────────────────────────────────────────────────────────────────────
// Recurring commitments → dated cash events.
//
// THIS IS WHERE THE WEEKLY GRAIN COMES FROM, and it is worth being explicit
// about because nothing else in this product has one. Every financial record
// KYRO holds is monthly or annual — trial balances, snapshots, budgets. A weekly
// cash view cannot be sliced out of monthly accounting without inventing detail
// that was never observed.
//
// But commitments are not accounting records. Payroll runs on the 15th and the
// last day. Debt service is due on the 1st. Insurance is quarterly. Those are
// CALENDAR facts and they carry their own precision, so the weekly view is
// assembled from dates the school actually knows rather than interpolated out of
// a month-end balance. That is why one engine can serve a 13-week cash-management
// view and a 12-month planning view without the two disagreeing.
//
// TOTAL AND NEVER-THROWS. A malformed date yields no events rather than an
// exception — a single bad commitment row must not take down a school's whole
// forecast.
// ─────────────────────────────────────────────────────────────────────────────
import { addDays, addMonths, isoToDays, lastDayOfMonth, parseIso, toIso } from './civil.js'
import type { CashCommitmentInput, CashEvent } from './types.js'

/** Hard stop on expansion, so a daily-ish recurrence over a long horizon cannot run away. */
const MAX_OCCURRENCES = 1000

/**
 * Expand ONE commitment across [from, to] inclusive.
 *
 * `semimonthly` uses `dayRule` (default the 15th and the last day, which is the
 * payroll pattern most schools run). Day 31 means "last day of this month",
 * clamped per month — see addMonths' note on why a 31st that rolls forward into
 * the next month would drift a payroll a week out of place over a year.
 */
export function expandCommitment(
  c: CashCommitmentInput,
  from: string,
  to: string,
): CashEvent[] {
  const fromZ = isoToDays(from)
  const toZ = isoToDays(to)
  const startZ = isoToDays(c.startDate)
  if (fromZ == null || toZ == null || startZ == null || toZ < fromZ) return []
  if (!Number.isFinite(c.amount) || c.amount === 0) return []

  const endZ = c.endDate ? isoToDays(c.endDate) : null
  // The commitment's own end date narrows the window; it never widens it.
  const stopZ = endZ == null ? toZ : Math.min(toZ, endZ)
  if (stopZ < fromZ) return []

  const dates = occurrenceDates(c, from, to, stopZ)
  const out: CashEvent[] = []
  for (const date of dates) {
    const z = isoToDays(date)
    if (z == null || z < fromZ || z > stopZ || z < startZ) continue
    out.push({
      date,
      amount: Math.abs(c.amount),
      direction: c.direction,
      label: c.label,
      category: c.category,
      confidence: c.confidence,
      sourceRef: `commitment:${c.id}`,
    })
  }
  return out
}

/** The raw occurrence dates for a recurrence, before windowing. */
function occurrenceDates(
  c: CashCommitmentInput,
  from: string,
  to: string,
  stopZ: number,
): string[] {
  const start = parseIso(c.startDate)
  if (!start) return []
  const out: string[] = []

  if (c.recurrence === 'once') return [c.startDate]

  if (c.recurrence === 'weekly' || c.recurrence === 'biweekly') {
    const step = c.recurrence === 'weekly' ? 7 : 14
    let cur = c.startDate
    for (let i = 0; i < MAX_OCCURRENCES; i += 1) {
      const z = isoToDays(cur)
      if (z == null || z > stopZ) break
      out.push(cur)
      const next = addDays(cur, step)
      if (!next) break
      cur = next
    }
    return out
  }

  if (c.recurrence === 'semimonthly') {
    // Default to the 15th and the last day — the pattern most school payrolls run.
    const rule = c.dayRule && c.dayRule.length > 0 ? [...c.dayRule] : [15, 31]
    const days = rule.filter((d) => Number.isInteger(d) && d >= 1 && d <= 31).sort((a, b) => a - b)
    if (days.length === 0) return []
    let y = start.y
    let m = start.m
    for (let i = 0; i < MAX_OCCURRENCES; i += 1) {
      for (const d of days) {
        // 31 (or any overshoot) means the LAST day of THIS month, not a spill
        // into the next one.
        const dd = Math.min(d, lastDayOfMonth(y, m))
        out.push(toIso({ y, m, d: dd }))
      }
      const lastZ = isoToDays(out[out.length - 1] ?? '')
      if (lastZ == null || lastZ > stopZ) break
      m += 1
      if (m > 12) {
        m = 1
        y += 1
      }
    }
    return out
  }

  const stepMonths = c.recurrence === 'monthly' ? 1 : c.recurrence === 'quarterly' ? 3 : 12
  let cur = c.startDate
  for (let i = 0; i < MAX_OCCURRENCES; i += 1) {
    const z = isoToDays(cur)
    if (z == null || z > stopZ) break
    out.push(cur)
    // Stepping from the ORIGINAL start, not from the clamped previous date: a
    // 31st clamped to Feb 28 must return to the 31st in March rather than
    // walking backwards down the calendar for the rest of the year.
    const next = addMonths(c.startDate, stepMonths * (i + 1))
    if (!next) break
    cur = next
  }
  return out
}

/** Expand every commitment across the window, in date order. */
export function expandCommitments(
  commitments: readonly CashCommitmentInput[],
  from: string,
  to: string,
): CashEvent[] {
  const out: CashEvent[] = []
  for (const c of commitments) out.push(...expandCommitment(c, from, to))
  return sortEvents(out)
}

/**
 * Stable date order. Ties break on category then label so two runs over the same
 * data produce byte-identical output — the determinism this engine is built for
 * has to hold at the ordering level too, not just the arithmetic.
 */
export function sortEvents(events: readonly CashEvent[]): CashEvent[] {
  return [...events].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.category.localeCompare(b.category) ||
      a.label.localeCompare(b.label) ||
      a.sourceRef.localeCompare(b.sourceRef),
  )
}
