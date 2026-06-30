// ─────────────────────────────────────────────────────────────
// @finrep/ingestion — pluggable trial-balance ingestion adapters.
// The ONLY place file bytes are turned into normalized rows.
// ─────────────────────────────────────────────────────────────
export type {
  IngestionAdapter,
  IngestionResult,
  NormalizedRow,
  SheetMetadata,
} from './types.js'
export { excelAdapter, parseTrialBalance } from './adapters/excelAdapter.js'
export { csvAdapter, parseTrialBalanceCsv } from './adapters/csvAdapter.js'
export { adapters, getAdapter, ingest } from './registry.js'

// Metadata extraction (pure)
export {
  extractSheetMetadata,
  detectFiscalYear,
  detectExplicitDate,
  detectAuditStatus,
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
  classifyRole,
  resolveRoles,
  inferPeriod,
  isFiscalYearEnd,
  FL_FISCAL_YEAR_END,
} from './classify.js'

// Budget-spread parser (format-agnostic; standard 'diocesan' spread template preset). Browser + node.
export type {
  BudgetSpread,
  BudgetSpreadAccount,
  BudgetSpreadFormat,
  BudgetSpreadSkippedRow,
} from './budget/budgetSpread.js'
export { parseBudgetSpread } from './budget/budgetSpread.js'
