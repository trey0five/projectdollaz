// ─────────────────────────────────────────────────────────────────────────────
// helpers.js — pure derivations shared across the analytics-v2 views. NO data
// fetching, NO rendering. Every number that reaches a chart still passes through
// the canonical @finrep/analytics formatters at the render site (value parity).
// ─────────────────────────────────────────────────────────────────────────────
import { seriesColor } from '../charts/palette.js'
import { formatMetricValue, formatDelta, metricFormat } from '../../../lib/metricMeta.js'

// Re-export the seam formatters so views import from one place. metricFormat already
// applies the canonical mix→currency unit resolution (resolveDisplayUnit) internally.
export { formatMetricValue, formatDelta, metricFormat }

// The five REAL health dimensions the Compare radar fingerprints (contract-frozen).
export const RADAR_DIMS = [
  { key: 'days_cash_on_hand', short: 'Cash' },
  { key: 'operating_margin', short: 'Margin' },
  { key: 'tuition_dependency', short: 'Tuition dep.' },
  { key: 'student_teacher_ratio', short: 'Stu:Teacher' },
  { key: 'pct_students_on_aid', short: '% on aid' },
]

/** Format a MetricResult-ish {key,value,unit} with the canonical mix→currency rule. */
export function formatMetric(m) {
  if (!m) return '—'
  return formatMetricValue(m.value ?? null, metricFormat(m.key, m.unit))
}
export function formatMetricDeltaOf(m) {
  if (!m || m.periodOverPeriodDelta == null) return null
  return formatDelta(m.periodOverPeriodDelta, metricFormat(m.key, m.unit))
}

// Band-normalize one value to 0..100 given target bands (good→100, risk→0), honoring
// goodDirection. Returns null when bands are absent (caller falls back to min-max).
function bandNormalize(value, bands) {
  if (value == null || !bands || !Number.isFinite(bands.good) || !Number.isFinite(bands.risk)) return null
  const { good, risk, goodDirection } = bands
  const span = good - risk
  if (!Number.isFinite(span) || span === 0) return null // degenerate band → let caller fall back
  const t = goodDirection === 'lower' ? (risk - value) / (risk - good) : (value - risk) / (good - risk)
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.min(1, t)) * 100
}

// Min-max normalize a set of raw values to 0..100, respecting goodDirection (so
// "lower is better" inverts). Used for contextual dims with no target band.
function minMaxNormalize(values, goodDirection) {
  const nums = values.filter((v) => v != null && Number.isFinite(v))
  if (nums.length === 0) return values.map(() => null)
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const span = max - min || 1
  return values.map((v) => {
    if (v == null || !Number.isFinite(v)) return null
    const t = (v - min) / span
    return (goodDirection === 'lower' ? 1 - t : t) * 100
  })
}

/**
 * Build the Radar axes + normalized series for the selected compare schools.
 * @param {Array} schools  the CompareSchool[] subset (roster order = palette).
 * @returns {{axes:string[], series:[{id,color,vals}]}}
 */
export function radarFingerprints(schools) {
  const axes = RADAR_DIMS.map((d) => d.short)
  // Per-dim normalization: band-normalize when the dim carries bands anywhere,
  // else min-max across the compared schools so the axis is still meaningful.
  const perDimNorm = RADAR_DIMS.map((dim) => {
    const cells = schools.map((s) => s.metrics?.[dim.key])
    const anyBands = cells.find((c) => c?.bands)
    if (anyBands) return cells.map((c) => bandNormalize(c?.value ?? null, c?.bands ?? null) ?? 0)
    const gd = cells.find((c) => c)?.goodDirection ?? 'higher'
    return minMaxNormalize(cells.map((c) => c?.value ?? null), gd).map((v) => v ?? 0)
  })
  const series = schools.map((s, si) => ({
    id: s.schoolName,
    color: seriesColor(s.seriesIndex ?? si),
    vals: RADAR_DIMS.map((_, di) => perDimNorm[di][si]),
  }))
  return { axes, series }
}

/** Pivot the compare schools onto one metric: [{schoolId,name,color,seriesIndex,cell}]. */
export function byMetric(schools, metricKey) {
  return schools.map((s, i) => ({
    schoolId: s.schoolId,
    name: s.schoolName,
    seriesIndex: s.seriesIndex ?? i,
    color: seriesColor(s.seriesIndex ?? i),
    cell: s.metrics?.[metricKey] ?? null,
  }))
}

// ── Fiscal-year helpers (Jul–Jun; July anchor 'YYYY-07') ─────────────────────
/** The FY LABEL for a period end date (Jul→Jun): end 2026-06-30 ⇒ 2026. */
export function fyLabelOf(periodEndDate) {
  if (!periodEndDate) return null
  const [y, m] = periodEndDate.split('-').map(Number)
  return m >= 7 ? y + 1 : y
}
/** The July-anchor START string for an FY label: FY2026 ⇒ '2025-07'. */
export function fyStartOfLabel(label) {
  return label ? `${label - 1}-07` : null
}
/** Derive the descending FY option list from a school's snapshot periods. */
export function fyOptionsFromPeriods(periods) {
  const seen = new Map()
  for (const p of periods || []) {
    const label = fyLabelOf(p.periodEndDate)
    if (label && !seen.has(label)) seen.set(label, { label, start: fyStartOfLabel(label) })
  }
  return [...seen.values()].sort((a, b) => b.label - a.label)
}
