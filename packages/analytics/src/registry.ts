// ─────────────────────────────────────────────────────────────
// Metric registry. The single source of metric truth: adding a metric is one
// entry here (+ its file + a test). The compute layer (compute.ts) iterates
// this registry, so new metrics light up across the API automatically.
// ─────────────────────────────────────────────────────────────
import type { MetricDef, MetricKey, TargetBands } from './types.js'
import { DEFAULT_BANDS } from './health.js'
import { operatingMargin } from './metrics/operatingMargin.js'
import { daysCashOnHand } from './metrics/daysCashOnHand.js'
import { monthsOperatingReserve } from './metrics/monthsOperatingReserve.js'
import { tuitionDependency } from './metrics/tuitionDependency.js'
import { revenueMix } from './metrics/revenueMix.js'
import { expenseMix } from './metrics/expenseMix.js'
import { costPerPupil } from './metrics/costPerPupil.js'
import { netTuitionPerStudent } from './metrics/netTuitionPerStudent.js'
import { financialAidPerStudent } from './metrics/financialAidPerStudent.js'
import { aidPerAidedStudent } from './metrics/aidPerAidedStudent.js'
import { tuitionDiscountRate } from './metrics/tuitionDiscountRate.js'
import { pctStudentsOnAid } from './metrics/pctStudentsOnAid.js'

export const METRIC_REGISTRY: Record<MetricKey, MetricDef> = {
  operating_margin: operatingMargin,
  days_cash_on_hand: daysCashOnHand,
  months_operating_reserve: monthsOperatingReserve,
  tuition_dependency: tuitionDependency,
  revenue_mix: revenueMix,
  expense_mix: expenseMix,
  // Tier-2 operational metrics.
  cost_per_pupil: costPerPupil,
  net_tuition_per_student: netTuitionPerStudent,
  financial_aid_per_student: financialAidPerStudent,
  aid_per_aided_student: aidPerAidedStudent,
  tuition_discount_rate: tuitionDiscountRate,
  pct_students_on_aid: pctStudentsOnAid,
}

/** Stable ordering for the dashboard's default layout (Tier-1 first, then Tier-2). */
export const METRIC_KEYS: MetricKey[] = [
  'operating_margin',
  'days_cash_on_hand',
  'months_operating_reserve',
  'tuition_dependency',
  'revenue_mix',
  'expense_mix',
  'cost_per_pupil',
  'net_tuition_per_student',
  'financial_aid_per_student',
  'aid_per_aided_student',
  'tuition_discount_rate',
  'pct_students_on_aid',
]

/** All metric defs in default-layout order. */
export const ALL_METRICS: MetricDef[] = METRIC_KEYS.map((k) => METRIC_REGISTRY[k])

export function isMetricKey(key: string): key is MetricKey {
  return Object.prototype.hasOwnProperty.call(METRIC_REGISTRY, key)
}

export function getMetric(key: MetricKey): MetricDef {
  return METRIC_REGISTRY[key]
}

/** Static, recompute-free metadata for one metric (drives the drawer + meta API). */
export interface MetricMeta {
  key: MetricKey
  label: string
  unit: MetricDef['unit']
  category: MetricDef['category']
  goodDirection: MetricDef['goodDirection']
  basis?: string
  formula: string
  description: string
  bands?: TargetBands
}

/**
 * The metric catalog metadata (no values, no recompute) — what GET /metrics/meta
 * can serve. Derived from the registry + DEFAULT_BANDS in canonical order.
 */
export const METRIC_META: MetricMeta[] = METRIC_KEYS.map((key) => {
  const def = METRIC_REGISTRY[key]
  return {
    key: def.key,
    label: def.label,
    unit: def.unit,
    category: def.category,
    goodDirection: def.goodDirection,
    basis: def.basis,
    formula: def.formula,
    description: def.description,
    bands: DEFAULT_BANDS[key],
  }
})
