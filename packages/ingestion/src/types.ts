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
  /**
   * NEW (#32). Present ONLY when the rows came from a column layout the person
   * PICKED (or one remembered from an earlier pick) instead of the automatic
   * read. An automatic read never sets it.
   */
  layout?: SavedLayout
}

/**
 * Normalised report section an account was printed under (A1). P&L:
 * income · otherIncome · expenses · otherExpense · costOfGoodsSold. Balance
 * sheet: bank · accountsReceivable · otherCurrentAssets · fixedAssets ·
 * otherAssets · accountsPayable · creditCards · otherCurrentLiabilities ·
 * longTermLiabilities · equity — plus the coarse currentAssets / assets /
 * currentLiabilities / liabilities when only the outer heading is printed.
 */
export type StatementSectionKey =
  | 'income'
  | 'otherIncome'
  | 'expenses'
  | 'otherExpense'
  | 'costOfGoodsSold'
  | 'bank'
  | 'accountsReceivable'
  | 'otherCurrentAssets'
  | 'currentAssets'
  | 'fixedAssets'
  | 'otherAssets'
  | 'assets'
  | 'accountsPayable'
  | 'creditCards'
  | 'otherCurrentLiabilities'
  | 'currentLiabilities'
  | 'longTermLiabilities'
  | 'liabilities'
  | 'equity'

export interface StatementSectionFact {
  /** Which report the account was printed on. */
  statement: 'pl' | 'bs'
  section: StatementSectionKey
  /**
   * How the section is known: 'section' = printed under that heading;
   * 'number' = a flat report with no headings, so the account number's block
   * (4xxxx income …) — the same fact that signed the row; 'position' = a
   * balance-sheet-numbered row inside a flat P&L, placed by its neighbours
   * (#41 S-C). Only 'section' is as strong as a QuickBooks AccountType.
   */
  basis: 'section' | 'number' | 'position'
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
  synthesized: Array<{
    acct: number
    name: string
    section: 'revenue' | 'expense' | 'asset' | 'liability' | 'equity'
    /**
     * NEW (#40/#41). 'remembered' = the number this school used for the same
     * account last time (a pin from IntakeMemory.synthetic); 'user' = the
     * person re-keyed it. Absent for a hashed number and for BS family numbers.
     */
    source?: 'remembered' | 'user'
  }>
  /**
   * NEW (A1). Where each account sits on the report, keyed by account number
   * (as a string — JSON keys). A QuickBooks statement export prints every
   * account under its section (Income / Expenses / Bank Accounts / Fixed
   * Assets / Other Current Liabilities / Equity …) — as reliable as the
   * AccountType the live sync reads — so the mapping step can sort accounts
   * by section instead of asking a person to confirm name-only guesses.
   * Covers explicitly numbered accounts and synthesized P&L numbers; the
   * balance sheet's shared engine family numbers (100, 120, 200 …) are left
   * out (the default chart already maps them). An account number that shows
   * up under two different sections is left out too (ambiguous).
   */
  sections?: Record<string, StatementSectionFact>
  /**
   * NEW. Set when the file was a WORKBOOK holding more statement sheets than
   * were imported (e.g. 'P&L Jan 2026' + 'P&L FY26' + 'Balance Sheet' → the
   * FY26 P&L + Balance Sheet pair was used). `statements` = how many statement
   * sheets the workbook holds; `used` = the sheet names that became these
   * rows; `unused` = the rest (import them with the multi-year uploader).
   * Absent for a single-sheet file or a workbook whose sheets were all used.
   * `code` is the stable key the web keys its "This workbook has N
   * statements: we used … Use Add years for the others." line on.
   */
  workbook?: { code: 'other-statement-sheets'; statements: number; used: string[]; unused: string[] }
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

// ── Intake: picked columns + per-school memory (#32, #41 S-B(b)) ─────────────

/**
 * A person's (or memory's) reading of one sheet. 0-based indices into the SAME
 * grid ingestion reads: xlsx = XLSX.utils.sheet_to_json(ws,{header:1,defval:null})
 * (index 0 = the sheet's !ref START column), csv = csvToGrid(text).
 */
export interface ColumnChoice {
  /** Workbook sheet the indices refer to; null/omitted = CSV, or the sheet ingest() would read. */
  sheet?: string | null
  /** Row holding the column names; -1 = no header row (data starts at row 0). */
  headerRow: number
  /** Account-number column; -1 = none — ONLY valid when the grid reads as a QuickBooks statement (numbers synthesised). */
  acct: number
  /** Account-name column; -1 = none (names become `Account <acct>`; requires acct >= 0). */
  desc: number
  /** Single signed balance column; -1 when debit+credit are used. */
  amount: number
  /** Debit / Credit columns; -1 when unused. Both or neither; mutually exclusive with amount. */
  debit: number
  credit: number
}

/** Stored at Import.metadata.layout when the rows came from a picked/remembered layout. */
export interface SavedLayout extends ColumnChoice {
  /** layoutSignature(grid, headerRow); null = header-less, never auto-applied. */
  signature: string | null
  source: 'picked' | 'remembered'
}

export interface SyntheticPin {
  acct: number
  section: 'revenue' | 'expense'
  name: string
}
/** key = syntheticKey(section, name, ordinal), e.g. "revenue:tuition", "expense:supplies#2". */
export type SyntheticRegistry = Record<string, SyntheticPin>

/** A school's intake memory, derived from its Import.metadata history (no table of its own). */
export interface IntakeMemory {
  /** Newest first, unique signature, signature !== null, ≤ 20. */
  layouts: SavedLayout[]
  /** P&L synthesized pins only, ≤ 2000. */
  synthetic: SyntheticRegistry
}

export interface IngestOptions {
  sheet?: string
  column?: string
  /** Explicit picker choice. Bypasses detection of columns (NOT of statement-ness). */
  columns?: ColumnChoice
  /** School memory. null/undefined ⇒ output byte-identical to today. */
  memory?: IntakeMemory | null
}
