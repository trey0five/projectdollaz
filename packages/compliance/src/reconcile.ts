// ─────────────────────────────────────────────────────────────
// @finrep/compliance — Phase 2B scholarship RECONCILIATION (pure).
//
// Addresses AUP §IV (Deposit & Classification of Scholarship Funds) at the
// disbursement-vs-recorded-revenue level: take the funding organization's
// (Step Up For Students) per-disbursement detail and compare the SUM of those
// disbursements ("scholarship funds disbursed to the school") against the figure
// the school RECORDED on its books (the 2A scholarshipFundsReceived). A variance
// is the finding; the disbursed total can then be adopted as the recorded figure
// so 2A and 2B stay consistent and the $250k AUP trigger uses real data.
//
// PURE TypeScript. ZERO UI, ZERO I/O, no clock, no random. Deterministic: the
// same input ALWAYS yields a byte-identical result. NEVER throws — malformed rows
// surface as anomalies, never exceptions. The API/web parse the funding-org
// CSV/XLSX and pass already-parsed rows + the recorded figure INTO this module.
//
// Per-student bank-deposit tracing remains a §IV CHECKLIST item (we don't have
// bank/subledger data) — reconciliation here is disbursement-vs-recorded-revenue.
// ─────────────────────────────────────────────────────────────
import type { Program } from './types.js'

/** Scholarship program tiers, reusing the 2A Program union exactly. */
export type ScholarshipProgram = Program

/** The three valid program tiers, in canonical order (drives byProgram sort). */
export const SCHOLARSHIP_PROGRAMS: readonly ScholarshipProgram[] = [
  'FTC',
  'FES_EO',
  'FES_UA',
] as const

/** Default tolerance: an absolute floor of $1 OR'd with a percentage of the disbursed total. */
export const DEFAULT_TOLERANCE_ABS = 1
/** Default tolerance percentage of the disbursed total (0.5%). */
export const DEFAULT_TOLERANCE_PCT = 0.5

/**
 * ONE funding-organization disbursement record (already parsed). Every field
 * except `amount` is optional/nullable — funding-org exports vary, and the
 * reconciliation tolerates (and flags) the gaps rather than rejecting rows.
 */
export interface Disbursement {
  /** The student identifier on the funding-org record (used for duplicate detection). */
  studentRef?: string | null
  /** The covered program tier, or null/unknown (flagged as unknown_program). */
  program?: ScholarshipProgram | null
  /** ISO yyyy-mm-dd payment date (used for byMonth + out-of-period detection). */
  payDate?: string | null
  /** The disbursed amount in dollars. */
  amount: number
  /** Optional term/semester label (passed through; not reconciled). */
  term?: string | null
  /** Optional funding-org batch reference (passed through; not reconciled). */
  batchRef?: string | null
}

/** The reconciliation request: disbursements + the recorded figure + bounds + tolerances. */
export interface ReconciliationInput {
  disbursements: Disbursement[]
  /** The figure the school RECORDED on its books (the 2A scholarshipFundsReceived). */
  recordedScholarshipRevenue?: number | null
  /** ISO yyyy-mm-dd period start (for out-of-period date detection); optional. */
  periodStart?: string | null
  /** ISO yyyy-mm-dd period end (for out-of-period date detection); optional. */
  periodEnd?: string | null
  /** Absolute tolerance in dollars (default $1). */
  toleranceAbs?: number
  /** Percentage tolerance of the disbursed total (default 0.5). */
  tolerancePct?: number
}

/** A per-program rollup (always present for every tier seen; canonical order). */
export interface ProgramBreakdown {
  program: ScholarshipProgram | 'UNKNOWN'
  total: number
  count: number
}

/** A per-month rollup (yyyy-mm), sorted ascending; rows with no date roll into 'unknown'. */
export interface MonthBreakdown {
  month: string
  total: number
  count: number
}

/** The reconciliation status. */
export type ReconciliationStatus = 'matched' | 'variance' | 'needs_data'

/** The taxonomy of deterministic anomalies the reconciliation can surface. */
export type AnomalyType =
  | 'duplicate'
  | 'negative_amount'
  | 'zero_amount'
  | 'date_outside_period'
  | 'unknown_program'
  | 'missing_amount'

/** A single, deterministic anomaly. `index` points back into the input array when row-specific. */
export interface Anomaly {
  type: AnomalyType
  detail: string
  index?: number
}

/** The pure reconciliation result. All numbers; the UI formats. */
export interface ReconciliationResult {
  totalDisbursed: number
  count: number
  byProgram: ProgramBreakdown[]
  byMonth: MonthBreakdown[]
  recordedScholarshipRevenue: number | null
  /** recorded - totalDisbursed (null when the recorded figure is missing). */
  variance: number | null
  /** variance as a percentage of totalDisbursed (null when missing or total is 0). */
  variancePct: number | null
  status: ReconciliationStatus
  anomalies: Anomaly[]
}

// ── pure helpers ─────────────────────────────────────────────

/** Round to cents deterministically (round-half-up on magnitude) to kill FP drift. */
function round2(n: number): number {
  // Math.round is half-up for positives; mirror it for negatives so it's symmetric.
  return n < 0 ? -Math.round(-n * 100) / 100 : Math.round(n * 100) / 100
}

/** A finite number guard (NaN/Infinity are treated as "not a number"). */
function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** True when the program is one of the three covered tiers. */
function isKnownProgram(p: unknown): p is ScholarshipProgram {
  return p === 'FTC' || p === 'FES_EO' || p === 'FES_UA'
}

/** Canonical-order rank for a program bucket (UNKNOWN sorts last). */
function programRank(p: ScholarshipProgram | 'UNKNOWN'): number {
  const i = SCHOLARSHIP_PROGRAMS.indexOf(p as ScholarshipProgram)
  return i === -1 ? SCHOLARSHIP_PROGRAMS.length : i
}

/**
 * Validate an ISO yyyy-mm-dd date WITHOUT touching the clock. Returns the
 * yyyy-mm month bucket on success, or null when the string isn't a real date.
 * Done with string math + a small calendar table so it's clock-free and ICU-free.
 */
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
function isoMonth(iso: string | null | undefined): string | null {
  if (typeof iso !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1) return null
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  let max = DAYS_IN_MONTH[month - 1]
  if (month === 2 && leap) max = 29
  if (day > max) return null
  return `${m[1]}-${m[2]}`
}

/** Lexicographic ISO-date comparison is correct for zero-padded yyyy-mm-dd. */
function isValidIsoDate(iso: string | null | undefined): iso is string {
  return isoMonth(iso) !== null
}

// ── the reconciliation ───────────────────────────────────────

/**
 * Reconcile the funding-org disbursements against the recorded scholarship
 * revenue. PURE, deterministic, never throws. See module header for framing.
 *
 *  - totalDisbursed/count sum the finite amounts (missing/NaN amounts are skipped
 *    from the total AND flagged as missing_amount).
 *  - byProgram: every tier that appears, plus an 'UNKNOWN' bucket; canonical order.
 *  - byMonth: yyyy-mm buckets ascending, with an 'unknown' bucket for dateless rows
 *    sorted last.
 *  - status: needs_data when the recorded figure is missing; matched when
 *    |variance| <= max(toleranceAbs, tolerancePct% of totalDisbursed); else variance.
 *  - anomalies: deterministic + sorted (by type order, then index).
 */
export function reconcileScholarships(input: ReconciliationInput): ReconciliationResult {
  const rows = Array.isArray(input.disbursements) ? input.disbursements : []

  const toleranceAbs = isFiniteNum(input.toleranceAbs)
    ? Math.abs(input.toleranceAbs)
    : DEFAULT_TOLERANCE_ABS
  const tolerancePct = isFiniteNum(input.tolerancePct)
    ? Math.abs(input.tolerancePct)
    : DEFAULT_TOLERANCE_PCT

  const periodStart = isValidIsoDate(input.periodStart) ? input.periodStart : null
  const periodEnd = isValidIsoDate(input.periodEnd) ? input.periodEnd : null

  let totalDisbursed = 0
  let count = 0

  // Program + month accumulators.
  const progTotals = new Map<ScholarshipProgram | 'UNKNOWN', { total: number; count: number }>()
  const monthTotals = new Map<string, { total: number; count: number }>()

  // Duplicate detection: same studentRef + payDate + amount appearing > 1x.
  // First occurrence is the "canonical" one; subsequent ones are the duplicates.
  const seen = new Map<string, number>()

  const anomalies: Anomaly[] = []

  rows.forEach((row, index) => {
    const amount = row?.amount
    const hasAmount = isFiniteNum(amount)

    // Program bucket.
    const prog: ScholarshipProgram | 'UNKNOWN' = isKnownProgram(row?.program)
      ? row.program
      : 'UNKNOWN'
    if (!isKnownProgram(row?.program)) {
      anomalies.push({
        type: 'unknown_program',
        detail:
          row?.program == null
            ? 'Disbursement has no program tier.'
            : `Disbursement program "${String(row.program)}" is not one of FTC, FES_EO, FES_UA.`,
        index,
      })
    }

    if (!hasAmount) {
      anomalies.push({
        type: 'missing_amount',
        detail: 'Disbursement has no numeric amount.',
        index,
      })
    } else {
      totalDisbursed += amount
      count += 1

      const pb = progTotals.get(prog) ?? { total: 0, count: 0 }
      pb.total += amount
      pb.count += 1
      progTotals.set(prog, pb)

      const monthKey = isoMonth(row?.payDate) ?? 'unknown'
      const mb = monthTotals.get(monthKey) ?? { total: 0, count: 0 }
      mb.total += amount
      mb.count += 1
      monthTotals.set(monthKey, mb)

      if (amount < 0) {
        anomalies.push({
          type: 'negative_amount',
          detail: `Disbursement amount is negative (${amount}).`,
          index,
        })
      } else if (amount === 0) {
        anomalies.push({
          type: 'zero_amount',
          detail: 'Disbursement amount is zero.',
          index,
        })
      }
    }

    // Out-of-period date (only when a valid payDate AND a bound are present).
    if (isValidIsoDate(row?.payDate) && (periodStart || periodEnd)) {
      if (periodStart && row.payDate < periodStart) {
        anomalies.push({
          type: 'date_outside_period',
          detail: `Pay date ${row.payDate} is before the period start ${periodStart}.`,
          index,
        })
      } else if (periodEnd && row.payDate > periodEnd) {
        anomalies.push({
          type: 'date_outside_period',
          detail: `Pay date ${row.payDate} is after the period end ${periodEnd}.`,
          index,
        })
      }
    }

    // Duplicate detection (key only meaningful when all three parts present).
    if (row?.studentRef != null && isValidIsoDate(row?.payDate) && hasAmount) {
      const key = `${row.studentRef} ${row.payDate} ${amount}`
      const prior = seen.get(key)
      if (prior === undefined) {
        seen.set(key, index)
      } else {
        anomalies.push({
          type: 'duplicate',
          detail: `Duplicate of row ${prior}: same student "${row.studentRef}", pay date ${row.payDate}, amount ${amount}.`,
          index,
        })
      }
    }
  })

  totalDisbursed = round2(totalDisbursed)

  // byProgram — canonical order (FTC, FES_EO, FES_UA, then UNKNOWN).
  const byProgram: ProgramBreakdown[] = Array.from(progTotals.entries())
    .map(([program, v]) => ({ program, total: round2(v.total), count: v.count }))
    .sort((a, b) => programRank(a.program) - programRank(b.program))

  // byMonth — yyyy-mm ascending, 'unknown' last.
  const byMonth: MonthBreakdown[] = Array.from(monthTotals.entries())
    .map(([month, v]) => ({ month, total: round2(v.total), count: v.count }))
    .sort((a, b) => {
      if (a.month === 'unknown') return b.month === 'unknown' ? 0 : 1
      if (b.month === 'unknown') return -1
      return a.month < b.month ? -1 : a.month > b.month ? 1 : 0
    })

  // Anomalies — deterministic order: by type (taxonomy order), then by index.
  const TYPE_ORDER: AnomalyType[] = [
    'duplicate',
    'negative_amount',
    'zero_amount',
    'date_outside_period',
    'unknown_program',
    'missing_amount',
  ]
  anomalies.sort((a, b) => {
    const t = TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type)
    if (t !== 0) return t
    return (a.index ?? -1) - (b.index ?? -1)
  })

  // Recorded figure + variance + status.
  const recorded = isFiniteNum(input.recordedScholarshipRevenue)
    ? round2(input.recordedScholarshipRevenue)
    : null

  let variance: number | null = null
  let variancePct: number | null = null
  let status: ReconciliationStatus

  if (recorded === null) {
    status = 'needs_data'
  } else {
    variance = round2(recorded - totalDisbursed)
    variancePct =
      totalDisbursed === 0 ? null : round2((variance / totalDisbursed) * 100)
    const threshold = Math.max(toleranceAbs, (tolerancePct / 100) * totalDisbursed)
    status = Math.abs(variance) <= threshold ? 'matched' : 'variance'
  }

  return {
    totalDisbursed,
    count,
    byProgram,
    byMonth,
    recordedScholarshipRevenue: recorded,
    variance,
    variancePct,
    status,
    anomalies,
  }
}
