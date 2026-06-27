// ─────────────────────────────────────────────────────────────
// Pure FY-elapsed helpers for the Monthly Actuals Foundation.
//
// A monthly trial balance is AS-OF MONTH-END = cumulative YTD within the fiscal
// year (Jul–Jun). From a monthKey 'YYYY-MM' alone we can derive the fiscal year,
// the elapsed months/days basis (used to make days_cash_on_hand /
// months_operating_reserve honest at a partial year), and the full ordered list
// of the FY's 12 month keys.
//
// DETERMINISTIC: derived purely from the two YYYY-MM string components — NO
// Date.now(), no timezone, no clock. Do NOT reuse board-report's
// deriveFiscalYearStart (it assumes a full-year period-end and misderives on a
// mid-year month-end).
// ─────────────────────────────────────────────────────────────

/** Strict 'YYYY-MM' shape, month 01..12. Mirrors the API/route validation. */
export const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/** Calendar days in a given month (mm 1..12), Gregorian leap rule. */
function daysInMonth(year: number, mm: number): number {
  // Day 0 of the next month === last day of this month.
  return new Date(Date.UTC(year, mm, 0)).getUTCDate()
}

export interface FyElapsed {
  /** FY-start month key, always '<fyStartYear>-07'. */
  fiscalYearStart: string
  /** The four-digit calendar year July of the FY falls in. */
  fyStartYear: number
  /** Months from FY-start: Jul=1 .. Jun=12. */
  elapsedMonths: number
  /** Calendar days from Jul 1 of the FY through the LAST day of monthKey's month, inclusive. */
  elapsedDays: number
}

/**
 * Decompose a monthKey 'YYYY-MM' into its FY-relative elapsed basis.
 * FY-start = July of (mm >= 7 ? yyyy : yyyy-1).
 * elapsedMonths = ((mm - 7 + 12) % 12) + 1.
 * elapsedDays = sum of calendar days Jul..monthKey's month (inclusive).
 * Throws on a malformed monthKey (callers validate first, but defensive).
 */
export function fyElapsed(monthKey: string): FyElapsed {
  if (!MONTH_KEY_RE.test(monthKey)) {
    throw new Error(`Invalid monthKey '${monthKey}' (expected YYYY-MM).`)
  }
  const yyyy = Number(monthKey.slice(0, 4))
  const mm = Number(monthKey.slice(5, 7))

  const fyStartYear = mm >= 7 ? yyyy : yyyy - 1
  const elapsedMonths = ((mm - 7 + 12) % 12) + 1

  // Walk Jul (year fyStartYear) forward `elapsedMonths` months, summing days.
  let elapsedDays = 0
  for (let i = 0; i < elapsedMonths; i++) {
    const monthIndex0 = (6 + i) % 12 // Jul = calendar month 7 -> index 6 added to 1-based below
    const calMonth = monthIndex0 + 1 // 1-based month
    const calYear = calMonth >= 7 ? fyStartYear : fyStartYear + 1
    elapsedDays += daysInMonth(calYear, calMonth)
  }

  return {
    fiscalYearStart: `${fyStartYear}-07`,
    fyStartYear,
    elapsedMonths,
    elapsedDays,
  }
}

/** The FY-start month key ('YYYY-07') for a monthKey's fiscal year. */
export function fiscalYearStartOf(monthKey: string): string {
  return fyElapsed(monthKey).fiscalYearStart
}

/** The 12 month keys of a fiscal year in order, Jul -> Jun. */
export function fyMonthKeys(fyStartYear: number): string[] {
  const keys: string[] = []
  for (let i = 0; i < 12; i++) {
    const calMonth = ((6 + i) % 12) + 1 // 7,8,..12,1,..6
    const calYear = calMonth >= 7 ? fyStartYear : fyStartYear + 1
    keys.push(`${calYear}-${String(calMonth).padStart(2, '0')}`)
  }
  return keys
}

/** True when monthKey is one of the 12 month keys of the FY that owns it. (Always true for a valid key — the FY is derived FROM the key — but kept explicit for the period-FY check below.) */
export function isMonthKeyInFy(monthKey: string, fyStartYear: number): boolean {
  return fyMonthKeys(fyStartYear).includes(monthKey)
}

/**
 * Derive the fiscal-year start year a period END date belongs to (Jul–Jun).
 * A period ending in Jul..Dec belongs to the FY that STARTED that same Jul; a
 * period ending Jan..Jun belongs to the FY that started the PRIOR Jul. Used to
 * validate that an uploaded monthKey falls inside the target period's FY.
 */
export function fyStartYearForPeriodEnd(periodEndDate: Date): number {
  const yyyy = periodEndDate.getUTCFullYear()
  const mm = periodEndDate.getUTCMonth() + 1 // 1-based
  return mm >= 7 ? yyyy : yyyy - 1
}
