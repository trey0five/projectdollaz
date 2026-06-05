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
  periodEndSource?: 'explicit' | 'fiscal-year-end'
  /** Parsed from in-sheet header text (e.g. "— Audited" / "— Unaudited"). */
  auditStatus?: 'audited' | 'unaudited'
  /** First non-empty banner/title row text. */
  periodTitle?: string
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
