// ─────────────────────────────────────────────────────────────
// @finrep/ingestion — pluggable trial-balance ingestion adapters.
// The ONLY place file bytes are turned into normalized rows.
// ─────────────────────────────────────────────────────────────
export type {
  IngestionAdapter,
  IngestionResult,
  NormalizedRow,
  SheetMetadata,
  SheetCandidate,
  StatementMetadata,
  StatementType,
  StatementSectionFact,
  ColumnChoice,
  SavedLayout,
  SyntheticPin,
  SyntheticRegistry,
  IntakeMemory,
  IngestOptions,
} from './types.js'
export {
  excelAdapter,
  parseTrialBalance,
  listTrialBalanceSheets,
  detectStartRow,
  detectColumns,
} from './adapters/excelAdapter.js'
export { csvAdapter, parseTrialBalanceCsv } from './adapters/csvAdapter.js'
export { adapters, getAdapter, ingest } from './registry.js'

// Intake (#32 / #40 / #41): plain failures + preview, picked columns, school
// memory, statement-half pairing, re-keying synthesized numbers. Browser-safe.
export type { IngestErrorCode, IngestFailure } from './intake/errors.js'
export { IngestError, isIngestError, ingestFailureOf } from './intake/errors.js'
export type { FilePreview, PreviewColumn, PreviewWarning, FailureVariant, ColumnRole } from './intake/preview.js'
export {
  PREVIEW_ROWS,
  PREVIEW_COLS,
  previewFile,
  layoutSignature,
  explainFailure,
  columnLetter,
  findDebitCreditPair,
  unassignedNumericColumns,
} from './intake/preview.js'
export { parseWithColumns, gridReadsAsStatement, columnHoldsAmounts, columnsHoldingAmounts, BUDGETISH, MONEY_HEADER } from './intake/override.js'
export { EMPTY_INTAKE_MEMORY, buildIntakeMemory } from './intake/memory.js'
export type { StatementHalf, PairResult } from './statements/pairing.js'
export {
  syntheticKey,
  syntheticKeys,
  statementHalf,
  pairStatements,
  asStatementResult,
} from './statements/pairing.js'
export { validateSyntheticRenumber, renumberSynthetic } from './statements/renumber.js'
export { statementSections, normalizeStatementSection, STATEMENT_SECTION_KEYS } from './statements/sections.js'
export type { StatementSectionKey } from './statements/sections.js'

// QuickBooks statement EXPORTS (P&L / Statement of Activity, Balance Sheet,
// Budget vs Actuals) → trial-balance rows (issue #31). Browser + node.
export type { StatementParseOptions, StatementSheetResult, RawGrid } from './statements/statementAdapter.js'
export {
  statementAdapter,
  isStatementExport,
  hasDebitCreditHeader,
  isBudgetReport,
  ACTUAL_HEADER,
  hasKnownSectionRow,
  detectStatementType,
  statementTypeFromFileName,
  StatementExportError,
  parseStatementGrid,
  parseStatementWorkbook,
  parseStatementCsv,
  parseStatementExport,
  listStatementSheets,
  isStatementPair,
  mergeStatementResults,
  statementsTie,
  statementGap,
  STATEMENT_TIE_TOLERANCE,
  parseMoney,
  bannerDates,
  csvToGrid,
  STATEMENT_PLUG_DESC,
  BS_RESULT_LABELS,
} from './statements/statementAdapter.js'
// The TB conventions every QuickBooks path shares (sign, engine blocks, plug).
// apps/api's qbo-company.synth.ts / qbo.client.ts re-export these.
export type { TbSection, PlugResult } from './statements/tbConventions.js'
export {
  QBO_REVENUE_BASE,
  QBO_EXPENSE_BASE,
  QBO_SYNTHETIC_BASE,
  QBO_SYNTHETIC_OFFSET,
  QBO_SYNTHETIC_SPAN,
  fnv1a,
  normalizeLeafName,
  syntheticOffset,
  BS_ENGINE_ACCT,
  sectionSign,
  normalizeGroup,
  PNL_REVENUE_GROUPS,
  PNL_EXPENSE_GROUPS,
  pnlSectionFromGroups,
  bsSectionFromGroups,
  pnlGroupSign,
  bsGroupSign,
  sectionFromAcct,
  round2,
  PLUG_ACCT,
  PLUG_DESC,
  applyBalancePlug,
} from './statements/tbConventions.js'

// Metadata extraction (pure)
export {
  extractSheetMetadata,
  detectFiscalYear,
  detectExplicitDate,
  detectAuditStatus,
  detectMonthYear,
  detectMonthly,
  fiscalYearEndForMonth,
} from './metadata.js'

// Role + period classification (pure)
export type {
  Role,
  RoleClassification,
  ClassifyInput,
  ResolvedFile,
  RoleConflict,
  ResolveResult,
  PeriodType,
  PeriodInference,
} from './classify.js'
export {
  statementLabel,
  classifyRole,
  resolveRoles,
  inferPeriod,
  isFiscalYearEnd,
  FL_FISCAL_YEAR_END,
} from './classify.js'

// OneRoster 1.1/1.2 CSV enrollment parser is SERVER-ONLY (node:zlib for the ZIP)
// and deliberately NOT re-exported here — import it from '@finrep/ingestion/oneroster'
// so this browser-safe barrel never drags a node: builtin into the web bundle.

// Budget-spread parser (format-agnostic; standard 'diocesan' spread template preset). Browser + node.
export type {
  BudgetSpread,
  BudgetSpreadAccount,
  BudgetSpreadFormat,
  BudgetSpreadSkippedRow,
} from './budget/budgetSpread.js'
export { parseBudgetSpread } from './budget/budgetSpread.js'
