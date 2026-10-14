// ─────────────────────────────────────────────────────────────
// Ingestion contract. Adapters turn pre-read file bytes into the
// engine's NormalizedRow shape. Ingestion is the ONLY place bytes
// become rows; it never touches FileReader/fs itself.
// ─────────────────────────────────────────────────────────────
import type { NormalizedRow } from '@finrep/engine'

export type { NormalizedRow }

/**
 * Optional metadata detected from a sheet's title / banner rows (the rows
 * ABOVE the data header). Purely additive — adapters still return identical
 * `rows`. Every field is optional except rowCount/sourceName so a title-less
 * file degrades gracefully to "manual fallback" in the UI.
 */
export interface SheetMetadata {
  /** Source file name (defaulted by the ingest facade). */
  sourceName: string
  /** Count of PARSED NormalizedRow (post-filter), not raw sheet rows. */
  rowCount: number
  /** Inferred fiscal year, e.g. 2026 from "FY26". */
  fiscalYear?: number
  /** YYYY-MM-DD — only emitted when confidently detected/inferred. */
  periodEndDate?: string
  /**
   * Provenance of periodEndDate: 'explicit' = parsed from in-sheet text
   * (e.g. "For the Year Ended June 30, 2025"); 'fiscal-year-end' = derived
   * from a detected FY token (FL June-30). An explicit date is preferred.
   */
  periodEndSource?: 'explicit' | 'fiscal-year-end' | 'filename'
  /** Parsed from in-sheet header text (e.g. "— Audited" / "— Unaudited"). */
  auditStatus?: 'audited' | 'unaudited'
  /** First non-empty banner/title row text. */
  periodTitle?: string
  /**
   * NEW (multi-sheet). Set when the sheet is a MONTHLY (as-of month-end, YTD)
   * trial balance rather than an annual one. 'YYYY-MM' of the month the sheet
   * represents; pair with isMonthly. For a monthly sheet periodEndDate is the
   * FISCAL-YEAR END the month belongs to (Jul–Jun), NOT the month itself.
   */
  monthKey?: string
  /** True when the sheet is a monthly YTD trial balance (see monthKey). */
  isMonthly?: boolean
  /** Sum of parsed row totals (the trial balance "net"), for the digest. */
  net?: number
  /** Count of parsed account rows (mirrors rowCount; kept explicit for the fan-out). */
  accountCount?: number
  /** The workbook sheet this metadata came from (multi-sheet fan-out). */
  sheet?: string
  /**
   * NEW (issue #31). Present ONLY when the rows came from a QuickBooks report
   * EXPORT (P&L / Statement of Activity, Balance Sheet, Budget vs Actuals)
   * rather than a plain trial balance — see statements/statementAdapter.ts.
   */
  statement?: StatementMetadata
}

/** 'pl' = Profit and Loss / Statement of Activity · 'bs' = Balance Sheet · 'bva' = Budget vs Actuals (P&L shaped). */
export type StatementType = 'pl' | 'bs' | 'bva'

export interface StatementMetadata {
  type: StatementType
  /** The banner title the type was detected from (or the sheet name). */
  title: string
  /**
   * Which half of a trial balance the rows are: 'pl' = activity only (no
   * balance-sheet accounts), 'bs' = balances only (no activity), 'full' = a
   * P&L merged with a Balance Sheet (+ a plug row when they did not tie).
   */
  partial: 'pl' | 'bs' | 'full'
  /** Printed accounting basis, when the banner says. */
  basis?: 'accrual' | 'cash'
  /** YYYY-MM-DD start of a "July 2025 - June 2026" range (periodEndDate holds the end). */
  periodStart?: string
  /** Header text of the value column that was read (e.g. "Actual", "Total", "Jan 2026"). */
  column?: string
  /**
   * Engine account numbers that were SYNTHESISED for unnumbered rows, with the
   * row name and section, so a mapping UI can re-key them. P&L: block base +
   * 1-based order within the section. BS: the engine's fixed default-chart
   * number for the section family (several rows may share one).
   */
  synthesized: Array<{ acct: number; name: string; section: 'revenue' | 'expense' | 'asset' | 'liability' | 'equity' }>
  /** 'full' only: the acct-399 plug total appended (null when the pair tied). */
  balancePlug?: number | null
  /** 'full' only: Σ of the pre-plug totals. */
  imbalance?: number
}

/**
 * One trial-balance-looking sheet discovered in a multi-sheet workbook. Sheets
 * that hold no account rows (e.g. an "Assumptions" tab) are NOT returned.
 */
export interface SheetCandidate {
  /** The workbook sheet name. */
  sheet: string
  rows: NormalizedRow[]
  metadata: SheetMetadata
}

export interface IngestionResult {
  rows: NormalizedRow[]
  startRow: number
  sourceName?: string
  warnings?: string[]
  /** NEW (optional => non-breaking). Detected sheet metadata. */
  metadata?: SheetMetadata
}

export interface IngestionAdapter {
  readonly format: 'xlsx' | 'csv'
  /** Cheap selection check by file name (and optionally bytes). */
  canHandle(fileName: string, bytes?: ArrayBuffer): boolean
  /** Parse pre-read bytes into normalized rows. */
  parse(bytes: ArrayBuffer, opts?: { sheet?: string }): IngestionResult
}
