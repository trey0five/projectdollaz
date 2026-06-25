// ─────────────────────────────────────────────────────────────
// @finrep/analytics — pure, deterministic Tier-1 financial metrics.
// ZERO UI, ZERO I/O. Consumes the engine's ReportBundle output (types only).
// ─────────────────────────────────────────────────────────────

// Types
export type {
  MetricUnit,
  MetricCategory,
  GoodDirection,
  MetricKey,
  PeriodFinancials,
  PeriodOperational,
  RevenueLineKey,
  ExpenseLineKey,
  MixComponent,
  MetricInput,
  HealthStatus,
  TargetBands,
  MetricComputeOutput,
  MetricDef,
  MetricResult,
  TrendPoint,
  MetricTrend,
} from './types.js'

// Health / target bands (Phase 4D)
export { DEFAULT_BANDS, bandsFor, healthStatus } from './health.js'

// Rule-based insight generator (Phase 4D — always-on baseline)
export { generateInsight } from './insight.js'

// Adapter
export {
  fromBundle,
  REVENUE_LINE_KEYS,
  EXPENSE_LINE_KEYS,
  REVENUE_LINE_LABELS,
  EXPENSE_LINE_LABELS,
} from './adapt.js'

// Registry
export {
  METRIC_REGISTRY,
  METRIC_KEYS,
  ALL_METRICS,
  METRIC_META,
  isMetricKey,
  getMetric,
} from './registry.js'
export type { MetricMeta } from './registry.js'

// Compute
export {
  computeMetricsForPeriod,
  computeMetricsRecord,
  computeTrend,
} from './compute.js'
export type {
  ComputeMetricsArgs,
  TrendSeriesEntry,
} from './compute.js'

// Dashboard layout (Phase 4C) — pure layout helpers + the metric-key whitelist
// reused for API validation so the package and API never drift.
export {
  CHART_VARIANTS,
  SPANS,
  defaultDashboardLayout,
  validateDashboardLayout,
} from './dashboard.js'
export type {
  DashboardChartVariant,
  DashboardSpan,
  DashboardLayoutItem,
  DashboardLayout,
  ValidateLayoutResult,
} from './dashboard.js'

// Driver model (Phase 2) — pure enrollment×tuition budget contract. Single
// source of truth for the math; imported by the API (authoritative save) AND
// the web (live preview), so they never drift.
export {
  GRADE_KEYS,
  TUITION_BANDS,
  bandOf,
  evenMonths,
  toDriverPriorContext,
  defaultAssumptions,
  computeDriverBudget,
} from './driver.js'
export type {
  GradeKey,
  TuitionBand,
  RevenueKey,
  ExpenseKey,
  DriverAssumptions,
  DriverPriorContext,
  DriverBudgetResult,
  ComputeDriverOptions,
} from './driver.js'

// Version
export { ANALYTICS_VERSION } from './version.js'
