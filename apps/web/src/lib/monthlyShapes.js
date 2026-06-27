// ─────────────────────────────────────────────────────────────────────────────
// Monthly Actuals Foundation — WEB seam mirror (source of truth for the web side).
//
// Plain JSDoc/object documentation of the monthly-snapshots + monthly-actuals
// API contract. Engineer A's class-validator DTOs + response objects are the API
// adapter of the SAME seam; both sides honor these shapes verbatim. No TypeScript
// generics, no package-boundary edit — these typedefs are advisory and a couple of
// tiny runtime helpers (month-key math + FY month labels) the upload UI reuses.
//
// BUSINESS RULE: a monthly trial balance is "AS-OF MONTH-END = cumulative YTD"
// within the fiscal year (Jul–Jun). The user PICKS the monthKey from a Jul→Jun
// dropdown; we do NOT auto-trust the file metadata for the month.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {string} MonthKey  'YYYY-MM', server-validated ^\d{4}-(0[1-9]|1[0-2])$
 *   AND within the period's FY (Jul–Jun).
 */

/**
 * @typedef {Object} MonthlyRow  Identical to NormalizedRow / ImportRowDto.
 * @property {number} acct   integer account number
 * @property {string} desc   account description
 * @property {number} total  signed amount
 */

/**
 * @typedef {Object} CategoryActuals
 * @property {Record<string, number>} revenue  revenue_mix component map (catKey → amount)
 * @property {Record<string, number>} expense  expense_mix component map (catKey → amount)
 *   catKeys are the SAME vocabulary as the annual dashboard — reuse existing label maps.
 */

/**
 * EXACT engine SFPResult keys (packages/engine/src/types/results.ts). NOTE:
 * `totalLiab` NOT `totalLiabilities`; `totalNA` is net assets (there is NO
 * `netAssets` field). Balance-sheet items are point-in-time as of month-end.
 * @typedef {Object|null} MonthlyBalanceSheet
 * @property {number} cash
 * @property {number} restrictedCash
 * @property {number} totalAssets
 * @property {number} totalLiab
 * @property {number} naWithout
 * @property {number} naWith
 * @property {number} totalNA
 * @property {number} totalLiabNA
 */

/**
 * @typedef {Object} MonthlySnapshotSummary  Lightweight management-list row.
 * @property {MonthKey} monthKey
 * @property {string} sourceName
 * @property {number} rowCount
 * @property {string|null} uploadedBy
 * @property {string} updatedAt  ISO timestamp
 */

/**
 * @typedef {Object} MonthlySnapshotListResponse  GET monthly-snapshots.
 * @property {MonthKey} fiscalYearStart  'YYYY-07'
 * @property {MonthlySnapshotSummary[]} months  ascending Jul→Jun
 */

/**
 * @typedef {Object} CreateMonthlySnapshotBody  POST monthly-snapshots request.
 * @property {MonthKey} monthKey
 * @property {string} sourceName  ≤255 chars (the file name)
 * @property {MonthlyRow[]} rows  ≤20000
 */

/**
 * @typedef {Object} CreateMonthlySnapshotResponse  POST 201 (payload/rows NOT echoed).
 * @property {MonthKey} monthKey
 * @property {string} sourceName
 * @property {number} rowCount
 * @property {string|null} uploadedBy
 * @property {string} engineVersion
 * @property {string} mappingVersion
 * @property {string} standardChartVersion
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {boolean} replaced  true when an existing month was overwritten
 */

/**
 * @typedef {Object} MonthlyMetric  Existing MetricResult shape PLUS partialYear.
 * @property {string} key
 * @property {number} [value]
 * @property {boolean} available
 * @property {string[]} [inputsMissing]
 * @property {Object} [components]
 * @property {boolean} partialYear  true only for the two parameterized metrics
 *   (days_cash_on_hand, months_operating_reserve)
 */

/**
 * @typedef {Object} MonthlyActualsResponse  GET monthly-actuals.
 * @property {MonthKey|null} monthKey
 * @property {MonthKey} fiscalYearStart
 * @property {MonthKey[]} monthsAvailable
 * @property {MonthKey|null} priorMonthKey
 * @property {number} monthsElapsed
 * @property {number} daysElapsed
 * @property {CategoryActuals} ytd
 * @property {CategoryActuals} mtd
 * @property {MonthlyBalanceSheet} balanceSheet
 * @property {MonthlyMetric[]} metrics
 */

/** Validate a 'YYYY-MM' month key shape (mirrors the server regex). */
export const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/
export const isMonthKey = (s) => typeof s === 'string' && MONTH_KEY_RE.test(s)

// Short month names, indexed 1..12 (Jan=1).
const MONTH_NAMES = [
  '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/**
 * Human label for a 'YYYY-MM' key, e.g. '2025-11' → 'Nov 2025'.
 * @param {MonthKey} monthKey
 * @returns {string}
 */
export function monthKeyLabel(monthKey) {
  if (!isMonthKey(monthKey)) return monthKey || ''
  const [y, m] = monthKey.split('-')
  return `${MONTH_NAMES[Number(m)]} ${y}`
}

/**
 * The 12 fiscal-year month keys Jul→Jun for a given FY start 'YYYY-07'.
 * July & later stay in the start year; Jan–Jun roll into the next calendar year.
 * Pure, deterministic — no Date.now(). Falls back to deriving from a bare year
 * if given just 'YYYY'.
 * @param {MonthKey|string} fiscalYearStart  'YYYY-07' (or 'YYYY')
 * @returns {{ monthKey: MonthKey, label: string, monthNum: number }[]}
 */
export function fyMonthKeys(fiscalYearStart) {
  const startYear = Number(String(fiscalYearStart || '').slice(0, 4))
  if (!Number.isFinite(startYear) || startYear <= 0) return []
  const out = []
  for (let i = 0; i < 12; i += 1) {
    const monthNum = ((6 + i) % 12) + 1 // Jul(7) .. Jun(6)
    const year = monthNum >= 7 ? startYear : startYear + 1
    const monthKey = `${year}-${String(monthNum).padStart(2, '0')}`
    out.push({ monthKey, label: monthKeyLabel(monthKey), monthNum })
  }
  return out
}

/**
 * Derive the FY start key 'YYYY-07' that CONTAINS a given month key. Used only as
 * a fallback when the list endpoint hasn't returned fiscalYearStart yet (e.g. a
 * pre-filled replace before the first fetch settles).
 * @param {MonthKey} monthKey
 * @returns {MonthKey|null}
 */
export function fyStartForMonth(monthKey) {
  if (!isMonthKey(monthKey)) return null
  const [y, m] = monthKey.split('-').map(Number)
  const startYear = m >= 7 ? y : y - 1
  return `${startYear}-07`
}
