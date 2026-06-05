// ─────────────────────────────────────────────────────────────
// @finrep/engine — pure TypeScript financial-statement engine.
// ZERO UI, ZERO I/O. Inputs as args -> outputs as return values.
// ─────────────────────────────────────────────────────────────

// Types
export type { NormalizedRow, Dataset, SourceRowRef } from './types/rows.js'
export type { SchoolConfig } from './types/school.js'
export type {
  SOAResult,
  SOAResults,
  SFPResult,
  SFPResults,
  SCFResult,
  NetAssetsColumn,
  NetAssetsResult,
  ReportMeta,
  GenerateReportsArgs,
  ReportBundle,
} from './types/results.js'
export type {
  ValidationResult,
  ValidationIssue,
} from './types/validation.js'
export type {
  StatementId,
  LineLineage,
  StatementLineage,
  ReportLineage,
} from './types/lineage.js'

// Standard Chart of Accounts (SCoA) layer
export type {
  SCoaCategory,
  Section,
  ScoaCategoryDef,
} from './scoa/categories.js'
export { SCOA_CATEGORIES } from './scoa/categories.js'
export type { SchoolToScoaMapping } from './scoa/defaultMapping.js'
export { ACCT_MAP, DEFAULT_MAPPING } from './scoa/defaultMapping.js'
export type { StandardChart } from './scoa/chart.js'
export {
  DEFAULT_CHART,
  categoryOf,
  categoryDef,
  sumByAccts,
  sumByCategory,
} from './scoa/chart.js'

// Calculators
export { calcSOA } from './calc/soa.js'
export { calcSFP } from './calc/sfp.js'
export { calcSCF } from './calc/scf.js'
export { calcNetAssets } from './calc/netAssets.js'
export { validateDataset, findUnmapped, hasEquityRow } from './calc/validate.js'
export { generateReports } from './calc/generateReports.js'

// School data (begin balances)
export { SCHOOLS, SCHOOL_OPTIONS } from './data/schools.js'

// Versions
export {
  ENGINE_VERSION,
  MAPPING_VERSION,
  STANDARD_CHART_VERSION,
} from './version.js'
