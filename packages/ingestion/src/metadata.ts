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
  return undefined
}

/**
 * Build SheetMetadata from the banner/title text above the data header.
 * `headerCells` is the flattened list of non-empty cell strings from the
 * rows preceding the first data row.
 */
export function extractSheetMetadata(
  headerCells: string[],
  sourceName: string,
  rowCount: number
): SheetMetadata {
  const cells = headerCells.map((c) => (c ?? '').toString().trim()).filter(Boolean)
  const text = cells.join(' ')

  const meta: SheetMetadata = { sourceName, rowCount }

  const periodTitle = cells[0]
  if (periodTitle) meta.periodTitle = periodTitle

  const fiscalYear = detectFiscalYear(text)
  if (fiscalYear !== undefined) meta.fiscalYear = fiscalYear

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

  const auditStatus = detectAuditStatus(text)
  if (auditStatus) meta.auditStatus = auditStatus

  return meta
}
