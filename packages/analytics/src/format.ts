// ─────────────────────────────────────────────────────────────
// @finrep/analytics — canonical value/delta FORMATTERS.
//
// The SINGLE source of truth for turning a metric's numeric value into the
// strings every surface renders. PURE TypeScript: zero UI, zero IO, no engine
// import. The web dashboard, the API briefing, the board report, and Penny all
// call these so two people never see the same number formatted two ways.
//
// Three formatter shapes exist because three surfaces render differently and
// their output MUST stay byte-identical to what shipped:
//   • formatMetricValue     — the BARE dashboard/board form  (web metricMeta.js)
//   • formatMetricValueLong  — the PROSE briefing form        (api briefing.service.ts)
//   • formatMetricDelta      — the signed period-over-period  (web metricMeta.js)
// The `days` branch intentionally DIFFERS between the bare and long forms (bare:
// localized integer with commas; long: `Math.round + " day"/" days"`, no commas)
// — both are copied verbatim from their origin call sites; do NOT unify them.
// ─────────────────────────────────────────────────────────────
import type { MetricKey, MetricResult, MetricUnit } from './types.js'

/**
 * Mix metrics (revenue_mix / expense_mix) carry unit `'share'`, but their scalar
 * `.value` is a CURRENCY TOTAL (the sum the donut slices add up to). The display
 * layer must format that scalar as dollars, not a bogus percent. This is the
 * canonical home of that override (previously duplicated in the web layer).
 */
export const MIX_METRIC_KEYS: readonly MetricKey[] = ['revenue_mix', 'expense_mix']

/**
 * Resolve the unit a metric's SCALAR value should be formatted with, applying the
 * mix→currency override. For every non-mix metric this is the identity (returns
 * the metric's own unit); for a mix metric it returns `'currency'`.
 */
export function resolveDisplayUnit(key: MetricKey, unit: MetricUnit): MetricUnit {
  return MIX_METRIC_KEYS.includes(key) ? 'currency' : unit
}

/**
 * The BARE value form (dashboard cards, board KPI values, trend axes). Never
 * substitutes a dash for a real 0. Copied VERBATIM from the web's
 * metricMeta.js `formatMetricValue` so output stays byte-identical.
 */
export function formatMetricValue(value: number | null, unit: MetricUnit): string {
  if (value == null || Number.isNaN(value)) return '—'
  switch (unit) {
    case 'percent':
    case 'share':
      return `${(value * 100).toFixed(1)}%`
    case 'days':
      return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
    case 'months':
      return value.toLocaleString('en-US', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })
    case 'currency':
      return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    case 'ratio':
    default:
      return value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
  }
}

/**
 * The signed period-over-period delta form. Percent/share deltas render as
 * `+x.x pts`; the sign uses the unicode minus `−`. Returns `null` for a
 * null/NaN delta (the caller renders its own placeholder). Copied VERBATIM from
 * the web's metricMeta.js `formatDelta`.
 */
export function formatMetricDelta(delta: number | null, unit: MetricUnit): string | null {
  if (delta == null || Number.isNaN(delta)) return null
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : ''
  const abs = Math.abs(delta)
  switch (unit) {
    case 'percent':
    case 'share':
      return `${sign}${(abs * 100).toFixed(1)} pts`
    case 'days':
      return `${sign}${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    case 'months':
      return `${sign}${abs.toFixed(1)}`
    case 'currency':
      return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    case 'ratio':
    default:
      return `${sign}${abs.toFixed(2)}`
  }
}

/**
 * The PROSE value form used by the API briefing's `why` text, so e.g.
 * operating_margin reads "-2.0%" and days_cash_on_hand reads "45 days". Copied
 * VERBATIM from the API's briefing.service.ts `fmtMetric`. NOTE the `days`
 * branch differs from the bare form on purpose (Math.round + pluralized word, no
 * thousands commas) — keep both byte-exact to their sources.
 */
export function formatMetricValueLong(value: number | null, unit: MetricUnit): string {
  if (value === null || !Number.isFinite(value)) return 'unavailable'
  switch (unit) {
    case 'percent':
    case 'share':
      return `${(value * 100).toFixed(1)}%`
    case 'days':
      return `${Math.round(value)} day${Math.round(value) === 1 ? '' : 's'}`
    case 'months':
      return `${value.toFixed(1)} months`
    case 'currency':
      return `$${Math.round(value).toLocaleString('en-US')}`
    case 'ratio':
    default:
      return value.toFixed(2)
  }
}

/**
 * A small pure LINEAGE breadcrumb — "Derived from <formula> — <operand> = <value>
 * …" — assembled from a metric result's formula + its named inputs (each carrying
 * key/label/value/source). Additive first-cut used by the drawer / board / briefing
 * for traceability; never re-derives math.
 */
export function describeLineage(
  result: Pick<MetricResult, 'formula' | 'inputs'>,
): string {
  const base = `Derived from ${result.formula}`
  const parts = (result.inputs ?? []).map((i) => {
    const src = i.source ? ` [${i.source}]` : ''
    const val = i.value == null ? 'missing' : String(i.value)
    return `${i.label}${src} = ${val}`
  })
  return parts.length > 0 ? `${base} — ${parts.join('; ')}` : base
}
