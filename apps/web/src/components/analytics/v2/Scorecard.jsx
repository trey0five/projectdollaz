// ─────────────────────────────────────────────────────────────────────────────
// Scorecard — the School-scope metrics TABLE. Reuses the EXACT v1 dashboard
// persistence: useDashboardLayout(schoolId) + CustomizeBar + CustomizePanel +
// orderedVisibleKeys, so a customize done here (or on /dashboard) carries across
// both surfaces — one server row, no migration. Renders a table (Metric · Value ·
// Context · Status · chart →) instead of the hero/grid; AnalyticsDashboard.jsx is
// never touched. Every value/delta is the SAME MetricResult the Overview tile and
// the chart center render (value parity — @finrep/analytics is the one source).
//
// Cross-link: a row whose metric has a chart shows "chart →" (→ onCrossToChart);
// a highlight prop (from ?highlight= / legacy ?metric=) scrolls+flashes the row,
// then calls onHighlightConsumed to strip it.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, SlidersHorizontal } from 'lucide-react'
import { useDashboardLayout } from '../../../hooks/useAnalytics.js'
import { apiErrorMessage } from '../../../lib/api.js'
import { statusMeta, deltaTone } from '../../../lib/metricMeta.js'
import CustomizeBar from '../CustomizeBar.jsx'
import CustomizePanel from '../CustomizePanel.jsx'
import { formatMetric, formatMetricDeltaOf } from './helpers.js'
import { hasChart } from './chartAnchors.js'
import { flashElement } from './flash.js'

const DEFAULT_KEYS = [
  'operating_margin', 'days_cash_on_hand', 'months_operating_reserve', 'tuition_dependency',
  'revenue_mix', 'expense_mix', 'cost_per_pupil', 'net_tuition_per_student',
  'financial_aid_per_student', 'aid_per_aided_student', 'tuition_discount_rate',
  'pct_students_on_aid', 'enrollment_change_yoy', 'student_teacher_ratio',
]

const TONE_TEXT = { good: 'text-[#2f7d4f]', bad: 'text-danger', neutral: 'text-muted' }

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

      <div className={`card-soft overflow-x-auto p-4 sm:p-5 ${customizing ? 'pointer-events-none opacity-50' : ''}`}>
        <h3 className="mb-1 font-serif text-base font-semibold text-navy">This school&rsquo;s scorecard</h3>
        <p className="mb-3 text-[13px] text-muted">
          Every number, one table — click &ldquo;chart&nbsp;&rarr;&rdquo; to fly to its graph.
        </p>
        <table className="av2-lb">
          <thead>
            <tr className="text-muted">
              <th className="bg-white">Metric</th>
              <th>Value</th>
              <th>Change</th>
              <th>Status</th>
              <th aria-label="Cross-link" />
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const sm = statusMeta(m.status)
              const deltaText = formatMetricDeltaOf(m)
              const tone = deltaTone(m.periodOverPeriodDelta, m.goodDirection)
              return (
                <tr key={m.key} id={`av2-row-${m.key}`} className="border-t border-rule/50 text-navy">
                  <td className="bg-white text-navy">{m.label}</td>
                  <td className="font-semibold tabular-nums">{formatMetric(m)}</td>
                  <td className={`tabular-nums ${TONE_TEXT[tone]}`}>{deltaText ?? '—'}</td>
                  <td>
                    {m.status && m.status !== 'neutral' ? (
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold ${sm.chip}`}>
                        <span className={`h-2 w-2 rounded-full ${sm.dot}`} />
                        {sm.label}
                      </span>
                    ) : (
                      <span className="text-[12px] text-muted">—</span>
                    )}
                  </td>
                  <td className="text-right">
                    {hasChart(m.key, scope) && (
                      <button
                        type="button"
                        onClick={() => onCrossToChart?.(m.key)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold text-navy-soft transition-colors hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
                      >
                        chart <ArrowRight size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="py-8 text-center text-[14px] italic text-muted">No metrics for this period yet.</p>
        )}
      </div>
    </div>
  )
}
