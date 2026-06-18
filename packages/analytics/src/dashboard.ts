// ─────────────────────────────────────────────────────────────
// Phase 4C — per-school dashboard layout: PURE, IO-free helpers.
//
// The single source of truth for the layout shape, the metric-key whitelist
// (reuses isMetricKey/METRIC_KEYS so the API and package never drift), the
// DEFAULT layout, and the STRICT validator. Zero UI, zero IO — imports only
// types + the registry. Keeps the package purity guarantee intact.
//
// A layout is an ORDERED, non-empty array of items, one per metric the school
// has chosen to configure. `visible:false` keeps a metric in the config (so it
// can be re-enabled) but the UI doesn't render it. The array ORDER is the render
// order.
// ─────────────────────────────────────────────────────────────
import type { MetricKey } from './types.js'
import { METRIC_KEYS, isMetricKey } from './registry.js'

/** Per-metric chart variant. Mix metrics always render as a donut (a UI rule). */
export type DashboardChartVariant = 'auto' | 'value' | 'trend'

/** How many grid columns a card spans. */
export type DashboardSpan = 1 | 2

/** One configured metric in the dashboard layout. */
export interface DashboardLayoutItem {
  metricKey: MetricKey
  /** false = retained in config but not rendered. */
  visible: boolean
  /** Optional render variant; normalized to 'auto' when omitted. */
  chart?: DashboardChartVariant
  /** Optional column span; normalized to 1 when omitted. */
  span?: DashboardSpan
}

/** An ordered list of configured metrics; order IS render order. */
export type DashboardLayout = DashboardLayoutItem[]

/** The allowed chart variants — single source for the enum check. */
export const CHART_VARIANTS: readonly DashboardChartVariant[] = ['auto', 'value', 'trend']

/** The allowed spans — single source for the enum check. */
export const SPANS: readonly DashboardSpan[] = [1, 2]

/**
 * The DEFAULT layout: every registry metric, in canonical order, all visible,
 * chart 'auto', span 1. Returned by GET (isDefault:true) when no row is saved
 * and produced by "Reset to default". Derived from METRIC_KEYS at call time, so
 * the default automatically reflects the registry's canonical set/order.
 */
export function defaultDashboardLayout(): DashboardLayout {
  return METRIC_KEYS.map((metricKey) => ({
    metricKey,
    visible: true,
    chart: 'auto' as DashboardChartVariant,
    span: 1 as DashboardSpan,
  }))
}

/** Discriminated result of validateDashboardLayout — never throws. */
export type ValidateLayoutResult =
  | { ok: true; value: DashboardLayout }
  | { ok: false; error: string }

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * STRICT, pure validator. Returns a NORMALIZED layout on success (chart/span
 * defaults filled, extra keys dropped) so the persisted shape is always
 * canonical. Rejects (ok:false + message — the Nest layer maps to 400):
 *   - non-array / empty array
 *   - any item that isn't a plain object
 *   - a metricKey that isn't a known registry key (the whitelist)
 *   - a non-boolean `visible`
 *   - a `chart` outside CHART_VARIANTS / a `span` outside SPANS
 *   - any duplicate metricKey across items
 */
export function validateDashboardLayout(input: unknown): ValidateLayoutResult {
  if (!Array.isArray(input)) {
    return { ok: false, error: 'layout must be an array.' }
  }
  if (input.length === 0) {
    return { ok: false, error: 'layout must not be empty.' }
  }

  const seen = new Set<string>()
  const value: DashboardLayout = []

  for (let i = 0; i < input.length; i++) {
    const raw = input[i]
    if (!isPlainObject(raw)) {
      return { ok: false, error: `layout[${i}] must be an object.` }
    }

    const { metricKey, visible, chart, span } = raw

    if (typeof metricKey !== 'string' || !isMetricKey(metricKey)) {
      return { ok: false, error: `layout[${i}].metricKey is not a known metric: ${String(metricKey)}` }
    }
    if (seen.has(metricKey)) {
      return { ok: false, error: `layout[${i}].metricKey is a duplicate: ${metricKey}` }
    }
    seen.add(metricKey)

    if (typeof visible !== 'boolean') {
      return { ok: false, error: `layout[${i}].visible must be a boolean.` }
    }

    let normChart: DashboardChartVariant = 'auto'
    if (chart !== undefined) {
      if (typeof chart !== 'string' || !CHART_VARIANTS.includes(chart as DashboardChartVariant)) {
        return { ok: false, error: `layout[${i}].chart must be one of ${CHART_VARIANTS.join(', ')}.` }
      }
      normChart = chart as DashboardChartVariant
    }

    let normSpan: DashboardSpan = 1
    if (span !== undefined) {
      if (typeof span !== 'number' || !SPANS.includes(span as DashboardSpan)) {
        return { ok: false, error: `layout[${i}].span must be one of ${SPANS.join(', ')}.` }
      }
      normSpan = span as DashboardSpan
    }

    value.push({
      metricKey: metricKey as MetricKey,
      visible,
      chart: normChart,
      span: normSpan,
    })
  }

  return { ok: true, value }
}
