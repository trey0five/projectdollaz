// ─────────────────────────────────────────────────────────────
// @finrep/analytics — pure, deterministic Tier-1 financial metrics.
// ZERO UI, ZERO I/O. Consumes the engine's ReportBundle output (types only).
// ─────────────────────────────────────────────────────────────

// Types
export type {
  MetricUnit,
  MetricCategory,
  MetricDomain,
  ScopeAggregation,
  MetricInputSpec,
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

// Canonical formatters (single source of truth for value/delta strings) + the
// mix→currency display override + the lineage breadcrumb. Consumed by the web
// dashboard, the API briefing, the board report, and Penny so no surface drifts.
export {
  MIX_METRIC_KEYS,
  resolveDisplayUnit,
  formatMetricValue,
  formatMetricDelta,
  formatMetricValueLong,
  describeLineage,
} from './format.js'

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
  scopeRuleFor,
} from './registry.js'
export type { MetricMeta } from './registry.js'

// Compute
export {
  computeMetricsForPeriod,
  computeMetricsRecord,
  computeTrend,
  assembleMetricResult,
} from './compute.js'
export type {
  ComputeMetricsArgs,
  TrendSeriesEntry,
} from './compute.js'

// Org-scope (canonical semantic layer v1) — the generic, registry-driven
// school→organization rollup: org metric = def.compute(Σ extensive components),
// never avg(per-school values). Reuses the per-school def.compute + assembler.
export {
  computeOrgMetrics,
  sumFinancials,
  sumOperational,
} from './org-compute.js'
export type {
  SchoolPeriodInputs,
  OrgMetricResult,
} from './org-compute.js'

// Dashboard layout (Phase 4C) — pure layout helpers + the metric-key whitelist
// reused for API validation so the package and API never drift.
export {
  CHART_VARIANTS,
  SPANS,
  defaultDashboardLayout,
  reconcileDashboardLayout,
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

// FY-End Forecast (Phase 2) — the ONE shared addition: feeder enrollment merge.
// driver.ts stays byte-for-byte unchanged; the feeder is folded in here before
// computeDriverBudget. Imported by the API (server save) AND web (live preview).
export {
  mergeFeederEnrollment,
  rollForwardEnrollment,
  effectiveEnrollment,
} from './forecast.js'
export type {
  ProjectionMethod,
  RollForwardInput,
  RollForwardConfig,
  EffectiveEnrollmentInput,
} from './forecast.js'

// Cash-runway shock projection (Phase 2) — pure, never-throws 12-month days-cash
// projection under a one-off annual shock. Powers the cash-consequence clause of
// the cross-domain enrollment→tuition→cash briefing item.
export { projectCashRunway } from './cashRunway.js'
export type {
  CashRunwayInput,
  CashRunwayBreach,
  CashRunwayResult,
} from './cashRunway.js'

// School Comparison — peer-benchmarking vocabulary + pure group/stats math. The
// ONE canonical home for size bands, school types, grade ordinals, the relaxation
// ladder, and direction-aware distribution stats. Consumed by the API (forms the
// group) AND the web (renders the dim controls) so the two never fork.
export {
  SIZE_BANDS,
  SCHOOL_TYPES,
  PEER_DIMS,
  DEFAULT_PEER_DIMS,
  sizeBandOf,
  sizeBandLabel,
  gradeOrdinal,
  gradeRangeOverlap,
  ordinal,
  dimMatches,
  resolvePeerGroup,
  sampleTierOf,
  computePeerStats,
} from './peers.js'
export type {
  SizeBandKey,
  SchoolType,
  PeerDim,
  PeerProfile,
  MatchTier,
  PeerGroupResult,
  SampleTier,
  PeerStats,
} from './peers.js'

// Version
export { ANALYTICS_VERSION } from './version.js'
