// ─────────────────────────────────────────────────────────────
// Compute layer: turns ReportBundle snapshots into MetricResults.
//
// DETERMINISTIC: pure arithmetic on snapshot numbers only — no Date, no clock,
// no random. Computing twice from the same snapshot yields byte-identical
// numbers (see __tests__/determinism.test.ts).
// ─────────────────────────────────────────────────────────────
import type { ReportBundle } from '@finrep/engine'
import type {
  MetricKey,
  MetricResult,
  MetricTrend,
  PeriodFinancials,
  PeriodOperational,
  TrendPoint,
} from './types.js'
import { fromBundle } from './adapt.js'
import { ALL_METRICS, getMetric, METRIC_KEYS } from './registry.js'
import { bandsFor, healthStatus } from './health.js'

/**
 * Run one metric def against current (+ optional prior) financials and assemble
 * the full MetricResult including the period-over-period delta.
 *
 * PoP delta = current.value - prior.value, but ONLY when both periods produced
 * an available value; otherwise null (never fabricated).
 */
function evaluate(
  key: MetricKey,
  cur: PeriodFinancials,
  prior?: PeriodFinancials,
  curOp?: PeriodOperational,
  priorOp?: PeriodOperational,
): MetricResult {
  const def = getMetric(key)
  const out = def.compute(cur, prior, curOp, priorOp)

  let periodOverPeriodDelta: number | null = null
  if (prior && out.available && out.value !== null) {
    // PoP recompute uses the PRIOR period's OWN operational data (priorOp), so
    // Tier-2 deltas are correct; Tier-1 metrics ignore the operational args.
    const priorOut = def.compute(prior, undefined, priorOp, undefined)
    if (priorOut.available && priorOut.value !== null) {
      periodOverPeriodDelta = out.value - priorOut.value
    }
  }

  // Phase 4D additive fields: target band -> health status, named inputs,
  // formula/description metadata. The numeric fields above are unchanged.
  const bands = bandsFor(def.key)
  const status = healthStatus(out.value, bands, out.available)

  return {
    key: def.key,
    label: def.label,
    unit: def.unit,
    category: def.category,
    goodDirection: def.goodDirection,
    basis: def.basis,
    formula: def.formula,
    description: def.description,
    available: out.available,
    value: out.value,
    inputsMissing: out.inputsMissing,
    periodOverPeriodDelta,
    status,
    bands,
    inputs: out.inputs ?? [],
    components: out.components,
  }
}

export interface ComputeMetricsArgs {
  /** The period's own ReportBundle (from its latest snapshot). */
  current: ReportBundle
  /** The immediately-prior fiscal period's ReportBundle, for PoP deltas. */
  prior?: ReportBundle | null
  /**
   * The period's operational data (enrollment/aid), loaded by the API and passed
   * in as plain numbers. Absent/null => Tier-2 metrics are unavailable.
   */
  currentOperational?: PeriodOperational | null
  /** The nearest-prior period's operational data, for Tier-2 PoP deltas. */
  priorOperational?: PeriodOperational | null
  /**
   * Partial-year (monthly) basis: days elapsed from FY-start through the as-of
   * month-end, inclusive. When provided, days_cash_on_hand annualizes off this
   * instead of 365. Omit (the annual path) => byte-identical to today.
   */
  elapsedDays?: number | null
  /**
   * Partial-year (monthly) basis: months elapsed from FY-start (Jul=1..Jun=12).
   * When provided, months_operating_reserve annualizes off this instead of 12.
   * Omit (the annual path) => byte-identical to today.
   */
  elapsedMonths?: number | null
}

/**
 * Compute every metric (Tier-1 financial + Tier-2 operational) for one period.
 * Returns an ordered array of MetricResult (default-layout order). Tier-2 metrics
 * are unavailable (with inputsMissing) when operational data is absent.
 */
export function computeMetricsForPeriod(args: ComputeMetricsArgs): MetricResult[] {
  const cur = fromBundle(args.current)
  // Partial-year (monthly) basis, threaded onto the CURRENT period only. Annual
  // callers pass neither, so these stay undefined and the metric denominators
  // fall back to the full-year 365/12 constants (byte-identical to today).
  cur.elapsedDays = args.elapsedDays ?? undefined
  cur.elapsedMonths = args.elapsedMonths ?? undefined
  const prior = args.prior ? fromBundle(args.prior) : undefined
  const curOp = args.currentOperational ?? undefined
  const priorOp = args.priorOperational ?? undefined
  return ALL_METRICS.map((def) => evaluate(def.key, cur, prior, curOp, priorOp))
}

/** Keyed form of computeMetricsForPeriod (convenience for lookups/tests). */
export function computeMetricsRecord(
  args: ComputeMetricsArgs,
): Record<MetricKey, MetricResult> {
  const list = computeMetricsForPeriod(args)
  const rec = {} as Record<MetricKey, MetricResult>
  for (const r of list) rec[r.key] = r
  return rec
}

export interface TrendSeriesEntry {
  periodId: string
  label: string
  /** YYYY-MM-DD. */
  periodEndDate: string
  bundle: ReportBundle
  /** The period's operational data (Tier-2 trends). Absent => point unavailable. */
  operational?: PeriodOperational | null
}

/**
 * Compute a single metric's trend across the school's periods. The caller passes
 * the latest snapshot per period; this fn sorts oldest -> newest by
 * periodEndDate and emits a point per period (value null when unavailable).
 */
export function computeTrend(
  metricKey: MetricKey,
  series: TrendSeriesEntry[],
): MetricTrend {
  const def = getMetric(metricKey)
  const ordered = [...series].sort((a, b) =>
    a.periodEndDate < b.periodEndDate ? -1 : a.periodEndDate > b.periodEndDate ? 1 : 0,
  )
  const points: TrendPoint[] = ordered.map((e) => {
    const out = def.compute(fromBundle(e.bundle), undefined, e.operational ?? undefined)
    return {
      periodId: e.periodId,
      label: e.label,
      periodEndDate: e.periodEndDate,
      value: out.available ? out.value : null,
      available: out.available,
    }
  })
  return {
    metric: def.key,
    label: def.label,
    unit: def.unit,
    goodDirection: def.goodDirection,
    points,
  }
}

export { METRIC_KEYS }
