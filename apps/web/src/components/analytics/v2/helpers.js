// ─────────────────────────────────────────────────────────────────────────────
// helpers.js — pure derivations shared across the analytics-v2 views. NO data
// fetching, NO rendering. Every number that reaches a chart still passes through
// the canonical @finrep/analytics formatters at the render site (value parity).
// ─────────────────────────────────────────────────────────────────────────────
import { schoolColor, DEEMPH } from './chartPalette.js'
import { formatMetricValue, formatDelta, metricFormat } from '../../../lib/metricMeta.js'

// Re-export the seam formatters so views import from one place. metricFormat already
// applies the canonical mix→currency unit resolution (resolveDisplayUnit) internally.
export { formatMetricValue, formatDelta, metricFormat }

// The five REAL health dimensions of the Compare fingerprint rows (contract-frozen).
export const FINGERPRINT_DIMS = [
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
 * Build the DimensionRows dims for the selected compare schools: each of the five
 * health dimensions becomes a row-section with one cell per school (roster order,
 * constant across dimensions — color follows the entity). Score is band-normalized
 * (0 = risk bound, 100 = good bound) when the dim carries bands anywhere, else
 * min-max across the compared schools so the shared band is still meaningful.
 * Raw + formatted ride along so every bar can carry its direct value label.
 * @param {Array} schools  the CompareSchool[] subset (roster order = palette).
 * @returns {Array<{key:string, short:string, cells:Array<{id,name,color,raw,formatted,score}>}>}
 */
export function fingerprintDims(schools) {
  return FINGERPRINT_DIMS.map((dim) => {
    const cells = schools.map((s) => s.metrics?.[dim.key] ?? null)
    const anyBands = cells.find((c) => c?.bands)
    let scores
    if (anyBands) scores = cells.map((c) => bandNormalize(c?.value ?? null, c?.bands ?? null))
    else {
      const gd = cells.find((c) => c)?.goodDirection ?? 'higher'
      scores = minMaxNormalize(cells.map((c) => c?.value ?? null), gd)
    }
    return {
      key: dim.key,
      short: dim.short,
      cells: schools.map((s, si) => {
        const c = cells[si]
        const raw = c?.value ?? null
        return {
          id: s.schoolId,
          name: s.schoolName,
          color: schoolColor(s.seriesIndex ?? si),
          raw,
          formatted: c ? (c.formatted ?? formatMetric({ ...c, key: dim.key })) : null,
          score: raw == null ? null : scores[si],
        }
      }),
    }
  })
}

/** Pivot the compare schools onto one metric: [{schoolId,name,color,seriesIndex,cell}]. */
export function byMetric(schools, metricKey) {
  return schools.map((s, i) => ({
    schoolId: s.schoolId,
    name: s.schoolName,
    seriesIndex: s.seriesIndex ?? i,
    color: schoolColor(s.seriesIndex ?? i),
    cell: s.metrics?.[metricKey] ?? null,
  }))
}

/**
 * Fold a mix metric's components into ≤ `cap` donut segments: sorted desc, the
 * tail collapses into a DEEMPH-colored "Other" (dataviz: never cycle hues past
 * the fixed slots). Colors are the categorical slots in order — mix components
 * are a per-chart part-to-whole, not school entities, so slot order is stable
 * within the chart.
 * @returns {Array<{label:string, value:number, color:string, other?:boolean}>}
 */
export function foldMixComponents(components, cap = 6) {
  const parts = (components || [])
    .map((c) => ({ label: c.label, value: Number.isFinite(c.value) ? c.value : 0 }))
    .sort((a, b) => b.value - a.value)
  if (parts.length <= cap) return parts.map((p, i) => ({ ...p, color: schoolColor(i) }))
  const kept = parts.slice(0, cap - 1).map((p, i) => ({ ...p, color: schoolColor(i) }))
  const rest = parts.slice(cap - 1)
  kept.push({ label: 'Other', value: rest.reduce((a, b) => a + b.value, 0), color: DEEMPH, other: true })
  return kept
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
