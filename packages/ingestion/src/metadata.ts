// ─────────────────────────────────────────────────────────────
// Pure metadata extraction. Adapters scan the rows ABOVE the detected
// data header (the title/banner rows they already read) and feed the
// joined cell text here. This module is byte-free and unit-testable.
//
// FL private-school fiscal year ends June 30, so a detected fiscal year
// (FY26) implies a period-end of YYYY-06-30 — but we only EMIT a
// periodEndDate when we can also justify it. An explicit date in the
// title always wins over the FY-end inference.
// ─────────────────────────────────────────────────────────────
import type { SheetMetadata } from './types.js'

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** Normalize a 2- or 4-digit fiscal-year token to a full year. */
function normalizeFiscalYear(raw: string): number {
  const n = parseInt(raw, 10)
  if (raw.length <= 2) return 2000 + n // FY26 -> 2026
  return n
}

/**
 * Detect a fiscal year from title text.
 * Prefers an explicit "FY26"/"FY 2026"/"FY'26" token; falls back to a bare
 * 4-digit 20xx year ONLY if no FY token is present (a bare year is weaker).
 */
export function detectFiscalYear(text: string): number | undefined {
  const fy = text.match(/\bFY\s?'?(\d{2,4})\b/i)
  if (fy?.[1]) return normalizeFiscalYear(fy[1])
  const bare = text.match(/\b(20\d{2})\b/)
  if (bare?.[1]) return parseInt(bare[1], 10)
  return undefined
}

/**
 * Detect an explicit audited/unaudited flag in title/banner text.
 *
 * CRITICAL ordering: a naive /audited/ test also matches INSIDE "unaudited",
 * so the un-?audited / management / draft patterns are tested FIRST. Only
 * once those are ruled out do we accept a bare "audited" as 'audited'.
 */
export function detectAuditStatus(text: string): 'audited' | 'unaudited' | undefined {
  if (/\bun-?audited\b/i.test(text)) return 'unaudited'
  if (/\baudited\b/i.test(text)) return 'audited'
  if (/\b(management|internal|draft)\b/i.test(text)) return 'unaudited'
  return undefined
}

/**
 * Detect an explicit period-end date in title text. Handles
 * "June 30, 2026" / "as of June 30 2026" / "for the year ended June 30, 2026"
 * / "6/30/2026" forms. Returns YYYY-MM-DD or undefined.
 */
export function detectExplicitDate(text: string): string | undefined {
  // "June 30, 2026"
  const named = text.match(
    /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/
  )
  if (named) {
    const mo = MONTHS[named[1]!.toLowerCase()]
    if (mo) {
      const day = parseInt(named[2]!, 10)
      if (day >= 1 && day <= 31) return `${named[3]}-${pad2(mo)}-${pad2(day)}`
    }
  }
  // "6/30/2026" or "06-30-2026"
  const numeric = text.match(/\b(\d{1,2})[/\-](\d{1,2})[/\-](20\d{2})\b/)
  if (numeric) {
    const mo = parseInt(numeric[1]!, 10)
    const day = parseInt(numeric[2]!, 10)
    if (mo >= 1 && mo <= 12 && day >= 1 && day <= 31) {
      return `${numeric[3]}-${pad2(mo)}-${pad2(day)}`
    }
  }
  // Bare "Month YYYY" (no day) → that month's END date. Used for an ANNUAL sheet
  // titled by a month; a YTD MONTHLY sheet routes through detectMonthYear instead
  // (its period is the FY-end, with the month carried in monthKey).
  const bareMonth = detectMonthYear(text)
  if (bareMonth) {
    return `${bareMonth.year}-${pad2(bareMonth.month)}-${pad2(lastDayOfMonth(bareMonth.year, bareMonth.month))}`
  }
  return undefined
}

/** Last calendar day of (year, month 1..12) — Gregorian leap rule. */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * Detect a bare "Month YYYY" / "MMM YYYY" token (no day), e.g. "Jul 2026" or
 * "September 2026". Deliberately does NOT match a day-qualified date like
 * "June 30, 2026" (that's an explicit annual period-end, handled elsewhere).
 */
export function detectMonthYear(text: string): { year: number; month: number } | undefined {
  const re = /\b([A-Za-z]{3,9})\.?\s+(20\d{2})\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const mo = MONTHS[m[1]!.toLowerCase()]
    if (mo) return { year: parseInt(m[2]!, 10), month: mo }
  }
  return undefined
}

/** True when the WHOLE string is just a "Month YYYY" token (e.g. a sheet tab "Jul 2026"). */
function isPureMonthYearToken(text: string): boolean {
  const m = text.trim().match(/^([A-Za-z]{3,9})\.?\s+(20\d{2})$/)
  return !!(m && MONTHS[m[1]!.toLowerCase()])
}

/**
 * The fiscal-year END date (YYYY-06-30, Jul–Jun FL FY) of the FY a given month
 * belongs to. Jul..Dec belong to the FY that STARTED that Jul → ends next
 * June; Jan..Jun belong to the FY that started the PRIOR Jul → ends this June.
 */
export function fiscalYearEndForMonth(year: number, month: number): string {
  const fyStartYear = month >= 7 ? year : year - 1
  return `${fyStartYear + 1}-06-30`
}

/**
 * Decide whether a sheet is a MONTHLY (as-of month-end, cumulative YTD) trial
 * balance and, if so, its monthKey + fiscal-year-end period date. A sheet is
 * monthly when it carries a bare "Month YYYY" AND a YTD/monthly signal — the
 * signal is either explicit ("YTD"/"month") in the banner OR the SHEET NAME
 * itself being a pure "Month YYYY" tab (how monthly workbooks are laid out).
 */
export function detectMonthly(
  bannerText: string,
  sheetName: string,
): { monthKey: string; periodEndDate: string } | undefined {
  const my = detectMonthYear(`${sheetName} ${bannerText}`)
  if (!my) return undefined
  const ytdSignal = /\bytd\b|\bmonth(ly|[- ]end|-to-date)?\b/i.test(bannerText)
  if (!ytdSignal && !isPureMonthYearToken(sheetName)) return undefined
  return {
    monthKey: `${my.year}-${pad2(my.month)}`,
    periodEndDate: fiscalYearEndForMonth(my.year, my.month),
  }
}

/**
 * Build SheetMetadata from the banner/title text above the data header.
 * `headerCells` is the flattened list of non-empty cell strings from the
 * rows preceding the first data row.
 */
export function extractSheetMetadata(
  headerCells: string[],
  sourceName: string,
  rowCount: number,
  opts?: { sheetName?: string; net?: number; accountCount?: number }
): SheetMetadata {
  const cells = headerCells.map((c) => (c ?? '').toString().trim()).filter(Boolean)
  const text = cells.join(' ')
  const sheetName = (opts?.sheetName ?? '').trim()

  const meta: SheetMetadata = { sourceName, rowCount }
  if (sheetName) meta.sheet = sheetName
  if (opts?.net !== undefined) meta.net = opts.net
  if (opts?.accountCount !== undefined) meta.accountCount = opts.accountCount

  const periodTitle = cells[0]
  if (periodTitle) meta.periodTitle = periodTitle

  const fiscalYear = detectFiscalYear(text)
  if (fiscalYear !== undefined) meta.fiscalYear = fiscalYear

  // MONTHLY (YTD, as-of month-end) sheets resolve to their fiscal-year END and
  // carry the month in monthKey — check this BEFORE the annual date logic so a
  // month-titled YTD sheet never collapses onto a month-end/FY date as "annual".
  const monthly = detectMonthly(text, sheetName)
  if (monthly) {
    meta.isMonthly = true
    meta.monthKey = monthly.monthKey
    meta.periodEndDate = monthly.periodEndDate
    meta.periodEndSource = 'fiscal-year-end'
  } else {
    // Prefer an EXPLICIT in-sheet date over an FY-derived one, and record which
    // source we used so the resolver/UI can weight explicit dates higher.
    const explicit = detectExplicitDate(text)
    if (explicit) {
      meta.periodEndDate = explicit
      meta.periodEndSource = 'explicit'
    } else if (fiscalYear !== undefined) {
      // FL private-school fiscal year ends June 30.
      meta.periodEndDate = `${fiscalYear}-06-30`
      meta.periodEndSource = 'fiscal-year-end'
    }
  }

  const auditStatus = detectAuditStatus(text)
  if (auditStatus) meta.auditStatus = auditStatus

  return meta
}
