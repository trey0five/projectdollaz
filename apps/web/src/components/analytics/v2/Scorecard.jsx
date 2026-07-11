// ─────────────────────────────────────────────────────────────────────────────
// Scorecard — the School-scope metrics view. Reuses the EXACT v1 dashboard
// persistence: useDashboardLayout(schoolId) + CustomizeBar + CustomizePanel +
// orderedVisibleKeys, so a customize done here (or on /dashboard) carries across
// both surfaces — one server row, no migration. Renders METRIC ROW-CARDS instead
// of a spreadsheet: status-hue dot + name (+ band-target context line) | big
// tabular-nums value | delta chip | an inline PROGRESS RAIL locating the value
// between the risk→good band bounds (skipped when unbanded) | a tinted status
// pill | the "chart →" affordance that surfaces on row hover (rest state calm).
// AnalyticsDashboard.jsx is never touched. Every value/delta is the SAME
// MetricResult the Overview tile and the chart center render (value parity —
// @finrep/analytics is the one source).
//
// Cross-link: a row whose metric has a chart shows "chart →" (→ onCrossToChart);
// a highlight prop (from ?highlight= / legacy ?metric=) scrolls+flashes the row
// (av2-row-<key> + flashring), then calls onHighlightConsumed to strip it.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowDownRight, ArrowRight, ArrowUpRight, SlidersHorizontal } from 'lucide-react'
import { useDashboardLayout } from '../../../hooks/useAnalytics.js'
import { apiErrorMessage } from '../../../lib/api.js'
import { deltaTone } from '../../../lib/metricMeta.js'
import CustomizeBar from '../CustomizeBar.jsx'
import CustomizePanel from '../CustomizePanel.jsx'
import { formatMetric, formatMetricDeltaOf, formatMetricValue, metricFormat } from './helpers.js'
import { hasChart } from './chartAnchors.js'
import { flashElement } from './flash.js'
import { lightStatus, DELTA_CHIP_LIGHT } from './statusStyle.js'

const DEFAULT_KEYS = [
  'operating_margin', 'days_cash_on_hand', 'months_operating_reserve', 'tuition_dependency',
  'revenue_mix', 'expense_mix', 'cost_per_pupil', 'net_tuition_per_student',
  'financial_aid_per_student', 'aid_per_aided_student', 'tuition_discount_rate',
  'pct_students_on_aid', 'enrollment_change_yoy', 'student_teacher_ratio',
]

// Where the value sits between the risk→good band bounds, as a 4–100 fill %
// (clamped so even a deep-risk value shows a sliver). null → no rail (unbanded
// or degenerate band). Mirrors helpers.bandNormalize's direction handling.
function bandPct(m) {
  const b = m?.bands
  if (!b || m.value == null || !Number.isFinite(b.good) || !Number.isFinite(b.risk) || b.good === b.risk) return null
  const dir = b.goodDirection ?? m.goodDirection
  const t = dir === 'lower' ? (b.risk - m.value) / (b.risk - b.good) : (m.value - b.risk) / (b.good - b.risk)
  if (!Number.isFinite(t)) return null
  return Math.max(4, Math.min(100, t * 100))
}

// The band-target context line under the metric name ("Target ≥ 20%").
function bandContext(m) {
  const b = m?.bands
  if (!b || !Number.isFinite(b.good)) return null
  const dir = b.goodDirection ?? m.goodDirection
  return `Target ${dir === 'lower' ? '≤' : '≥'} ${formatMetricValue(b.good, metricFormat(m.key, m.unit))}`
}

function MetricRow({ m, scope, onCrossToChart, index, reduce }) {
  const ls = lightStatus(m.status)
  const banded = m.status && m.status !== 'neutral'
  const deltaText = formatMetricDeltaOf(m)
  const tone = deltaTone(m.periodOverPeriodDelta, m.goodDirection)
  const flat = m.periodOverPeriodDelta == null || m.periodOverPeriodDelta === 0
  const Arrow = m.periodOverPeriodDelta > 0 ? ArrowUpRight : ArrowDownRight
  const pct = bandPct(m)
  const context = bandContext(m)
  return (
    <motion.div
      id={`av2-row-${m.key}`}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index, 8) * 0.04, ease: 'easeOut' }}
      className="av2-row group rounded-xl bg-white px-4 py-3 ring-1 ring-slate-200/60 transition-colors hover:bg-slate-50"
    >
      {/* metric identity */}
      <div className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ls.dot }} />
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-navy">{m.label}</p>
          <p className="truncate text-[11.5px] text-slate-400 tabular-nums">{context ?? 'Contextual'}</p>
        </div>
      </div>

      {/* value */}
      <span className="text-right text-[19px] font-bold text-navy tabular-nums">{formatMetric(m)}</span>

      {/* delta chip */}
      <span className="av2-delta-cell justify-self-end">
        {deltaText ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold tabular-nums ${
              DELTA_CHIP_LIGHT[flat ? 'neutral' : tone]
            }`}
          >
            {!flat && <Arrow size={11} strokeWidth={2.5} />}
            {deltaText}
          </span>
        ) : (
          <span className="text-[12px] text-slate-300">—</span>
        )}
      </span>

      {/* band progress rail */}
      <span className="av2-rail-cell">
        {pct != null ? (
          <span className="av2-rail" role="img" aria-label={`${Math.round(pct)}% of the way to the healthy band`}>
            <span className={ls.rail} style={{ width: `${pct}%` }} />
          </span>
        ) : (
          <span aria-hidden="true" />
        )}
      </span>

      {/* status pill */}
      <span className="justify-self-end">
        {banded ? (
          <span className={ls.pill}>
            <i aria-hidden="true" />
            {ls.label}
          </span>
        ) : (
          <span className="text-[12px] text-slate-300">—</span>
        )}
      </span>

      {/* chart cross-link — surfaces on row hover / keyboard focus */}
      <span className="text-right">
        {hasChart(m.key, scope) && (
          <button
            type="button"
            onClick={() => onCrossToChart?.(m.key)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold text-navy-soft opacity-0 transition-opacity hover:text-navy focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 group-hover:opacity-100"
          >
            chart <ArrowRight size={12} />
          </button>
        )}
      </span>
    </motion.div>
  )
}

export default function Scorecard({
  scope = 'school',
  schoolId,
  metricsByKey,
  canCustomize,
  onCrossToChart,
  highlight,
  onHighlightConsumed,
}) {
  const reduce = useReducedMotion()
  const { layout: savedLayout, loading: layoutLoading, save: saveLayout, reset: resetLayout } =
    useDashboardLayout(schoolId)

  // Customize state — the SAME machinery as AnalyticsDashboard (server row shared).
  const [customizing, setCustomizing] = useState(false)
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const enter = () => {
    if (!savedLayout) return
    setDraft(savedLayout.map((i) => ({ ...i })))
    setError('')
    setCustomizing(true)
  }
  const cancel = () => {
    setDraft(null)
    setError('')
    setCustomizing(false)
  }
  const dirty = useMemo(
    () => customizing && draft != null && JSON.stringify(draft) !== JSON.stringify(savedLayout ?? []),
    [customizing, draft, savedLayout],
  )
  const onSave = async () => {
    if (!draft) return
    setSaving(true)
    setError('')
    try {
      await saveLayout(draft)
      setCustomizing(false)
      setDraft(null)
    } catch (e) {
      setError(apiErrorMessage(e, 'Could not save your layout.'))
    } finally {
      setSaving(false)
    }
  }
  const onReset = async () => {
    setSaving(true)
    setError('')
    try {
      await resetLayout()
      setCustomizing(false)
      setDraft(null)
    } catch (e) {
      setError(apiErrorMessage(e, 'Could not reset your layout.'))
    } finally {
      setSaving(false)
    }
  }

  const effectiveLayout = customizing && draft ? draft : savedLayout
  const orderedKeys = useMemo(() => {
    if (effectiveLayout && effectiveLayout.length) {
      return effectiveLayout.filter((i) => i.visible).map((i) => i.metricKey)
    }
    return DEFAULT_KEYS
  }, [effectiveLayout])

  // Only render rows whose metric is present in this period (gated/absent drop).
  const rows = useMemo(
    () => orderedKeys.map((k) => metricsByKey[k]).filter(Boolean),
    [orderedKeys, metricsByKey],
  )

  // Cross-link IN: scroll+flash the highlighted row once its data is present.
  useEffect(() => {
    if (!highlight || !metricsByKey[highlight]) return
    let cleanup = () => {}
    const t = window.setTimeout(() => {
      cleanup = flashElement(`av2-row-${highlight}`, reduce)
      onHighlightConsumed?.()
    }, 60)
    return () => {
      window.clearTimeout(t)
      cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight, metricsByKey])

  return (
    <div className="space-y-4">
      {canCustomize && (
        <div className="flex justify-end">
          {!customizing && (
            <button
              type="button"
              onClick={enter}
              disabled={layoutLoading}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-rule/60 px-3 py-1.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted transition-colors hover:border-gold hover:text-navy disabled:opacity-50"
            >
              <SlidersHorizontal size={13} /> Customize
            </button>
          )}
        </div>
      )}

      <AnimatePresence initial={false}>
        {customizing && draft && (
          <motion.div
            key="customize"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <CustomizeBar dirty={dirty} saving={saving} error={error} onSave={onSave} onCancel={cancel} onReset={onReset} />
            <div className="mb-2">
              <CustomizePanel draft={draft} onChange={setDraft} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={customizing ? 'pointer-events-none opacity-50' : ''}>
        <div className="mb-3">
          <h3 className="font-serif text-base font-semibold text-navy">This school&rsquo;s scorecard</h3>
          <p className="text-[13px] text-muted">
            Every number, one board — hover a row and click &ldquo;chart&nbsp;&rarr;&rdquo; to fly to its graph.
          </p>
        </div>
        <div className="space-y-2">
          {rows.map((m, i) => (
            <MetricRow key={m.key} m={m} scope={scope} onCrossToChart={onCrossToChart} index={i} reduce={reduce} />
          ))}
        </div>
        {rows.length === 0 && (
          <p className="py-8 text-center text-[14px] italic text-muted">No metrics for this period yet.</p>
        )}
      </div>
    </div>
  )
}
