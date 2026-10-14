// ─────────────────────────────────────────────────────────────────────────────
// Scorecard — the School-scope metrics view. Reuses the EXACT v1 dashboard
// persistence: useDashboardLayout(schoolId) + CustomizeBar + CustomizePanel +
// orderedVisibleKeys, so a customize done here (or on /dashboard) carries across
// both surfaces — one server row, no migration.
//
// Premium UI P3 (plan sketch 4): ONE `DataTable` per section — Metric (with its
// target under the name) · Target · Value · Δ · Status · chart → — values
// right-aligned tabular, a 2px status mark per row, the section label as the
// `Section` rule. "Attention first" is the DEFAULT SORT (risk → watch → good →
// contextual, layout order within a rank), not a button pair; any column header
// re-sorts. Banded and contextual metrics share the table (a contextual row
// prints "—" for target and status) so one board holds every figure.
// AnalyticsDashboard.jsx is never touched. Every value/delta is the SAME
// MetricResult the Overview Stat and the chart centre render (value parity —
// @finrep/analytics is the one source).
//
// Cross-link: a row whose metric has a chart shows "chart →" on hover
// (→ onCrossToChart); a highlight prop (from ?highlight= / legacy ?metric=)
// scrolls+flashes the ROW (id av2-row-<key>; `tr[data-flash]` in surface.css),
// then calls onHighlightConsumed to strip it.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowDownRight, ArrowRight, ArrowUpRight, SlidersHorizontal } from 'lucide-react'
import { useDashboardLayout } from '../../../hooks/useAnalytics.js'
import { apiErrorMessage } from '../../../lib/api.js'
import { deltaTone, metricSection, SECTION_ORDER } from '../../../lib/metricMeta.js'
import CustomizeBar from '../CustomizeBar.jsx'
import CustomizePanel from '../CustomizePanel.jsx'
import { formatMetric, formatMetricDeltaOf, formatMetricValue, metricFormat } from './helpers.js'
import { hasChart } from './chartAnchors.js'
import { flashElement } from './flash.js'
import { lightStatus, DELTA_TONE, MARK } from './statusStyle.js'
import AnimatedMetricValue from '../AnimatedMetricValue.jsx'
import { Section, DataTable, Pill, Toolbar, Button } from '../../ui/surface/index.js'

const DEFAULT_KEYS = [
  'operating_margin', 'days_cash_on_hand', 'months_operating_reserve', 'tuition_dependency',
  'revenue_mix', 'expense_mix', 'cost_per_pupil', 'net_tuition_per_student',
  'financial_aid_per_student', 'aid_per_aided_student', 'tuition_discount_rate',
  'pct_students_on_aid', 'enrollment_change_yoy', 'student_teacher_ratio',
  // Phase 6 — HR & Planning module metrics, appended LAST (mirrors METRIC_KEYS
  // order; the server's default-layout append keeps saved layouts in sync).
  'total_staff_fte', 'fte_change_yoy', 'teaching_staff_share',
  'forecast_vs_budget_net', 'forecast_operating_margin', 'plan_readiness',
]

// The band target ("≥ 20%") — null when the metric carries no agreed band.
function bandTarget(m) {
  const b = m?.bands
  if (!b || !Number.isFinite(b.good)) return null
  const dir = b.goodDirection ?? m.goodDirection
  return `${dir === 'lower' ? '≤' : '≥'} ${formatMetricValue(b.good, metricFormat(m.key, m.unit))}`
}

// Attention rank: risk first, then watch, good, and contextual (no band) last.
const RANK = { risk: 0, watch: 1, good: 2 }
const rankOf = (m) => RANK[m.status] ?? 3

function DeltaCell({ m }) {
  const text = formatMetricDeltaOf(m)
  if (!text) return <span className="text-ink2">—</span>
  const flat = m.periodOverPeriodDelta == null || m.periodOverPeriodDelta === 0
  const tone = flat ? 'neutral' : DELTA_TONE[deltaTone(m.periodOverPeriodDelta, m.goodDirection)] ?? 'neutral'
  const Arrow = m.periodOverPeriodDelta > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <Pill variant="status" tone={tone}>
      {!flat && <Arrow size={11} strokeWidth={2.5} aria-hidden="true" />}
      {text}
    </Pill>
  )
}

function buildColumns({ scope, onCrossToChart }) {
  return [
    {
      key: 'label',
      header: 'Metric',
      sortable: true,
      className: 'dt-nowrap',
      render: (m) => <span className="font-semibold text-ink">{m.label}</span>,
    },
    {
      key: 'target',
      header: 'Target',
      num: true,
      sortValue: (m) => m?.bands?.good ?? null,
      // A phone has no room for the target column; the band still reads via the mark + status.
      className: 'dt-nowrap hidden sm:table-cell',
      headerClassName: 'hidden sm:table-cell',
      render: (m) => bandTarget(m) ?? <span className="text-ink2">—</span>,
    },
    {
      key: 'value',
      header: 'Value',
      num: true,
      sortable: true,
      sortValue: (m) => (typeof m.value === 'number' && Number.isFinite(m.value) ? m.value : null),
      render: (m) => (
        <span className="font-semibold text-ink">
          {typeof m.value === 'number' && Number.isFinite(m.value) ? (
            <AnimatedMetricValue value={m.value} format={metricFormat(m.key, m.unit)} />
          ) : (
            formatMetric(m)
          )}
        </span>
      ),
    },
    {
      key: 'delta',
      header: 'Δ',
      num: true,
      sortable: true,
      sortValue: (m) => m.periodOverPeriodDelta ?? null,
      render: (m) => <DeltaCell m={m} />,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortValue: (m) => rankOf(m),
      render: (m) => (m.status && m.status !== 'neutral' ? lightStatus(m.status).label : <span className="text-ink2">—</span>),
    },
    {
      key: 'chart',
      header: '',
      num: true,
      width: '5rem',
      render: (m) =>
        hasChart(m.key, scope) ? (
          <span className="dt-actions">
            <button type="button" className="dt-link" onClick={() => onCrossToChart?.(m.key)} aria-label={`Open the ${m.label} chart`}>
              chart <ArrowRight size={12} aria-hidden="true" />
            </button>
          </span>
        ) : null,
    },
  ]
}

// Attention-first is the default order: by rank, then the user's layout order.
function attentionFirst(list) {
  return list
    .map((m, i) => [m, i])
    .sort(([a, ia], [b, ib]) => rankOf(a) - rankOf(b) || ia - ib)
    .map(([m]) => m)
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
  // Column sort: null = attention first (the default); any header click takes over.
  const [sort, setSort] = useState(null)

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

  // Only render rows whose metric is present in this period (gated/absent drop),
  // in the customize order; attention-first re-ranks within each section.
  const rows = useMemo(
    () => orderedKeys.map((k) => metricsByKey[k]).filter(Boolean),
    [orderedKeys, metricsByKey],
  )

  // Phase 6 — domain sections: a pure render-time partition of the SAME ordered
  // rows into the §0 sections (finance+operations+aid merge). Within-section
  // customize order is preserved; useDashboardLayout persistence is untouched.
  const sections = useMemo(() => {
    const by = new Map()
    for (const m of rows) {
      const title = metricSection(m.key)
      if (!by.has(title)) by.set(title, [])
      by.get(title).push(m)
    }
    return SECTION_ORDER.filter((t) => by.get(t)?.length).map((t) => ({ title: t, rows: attentionFirst(by.get(t)) }))
  }, [rows])
  // Section labels render ONLY when ≥2 sections are non-empty — a finance-only
  // school (one merged section) keeps a single board under one label.
  const sectioned = sections.length >= 2

  const columns = useMemo(() => buildColumns({ scope, onCrossToChart }), [scope, onCrossToChart])
  const rowProps = (m) => ({ id: `av2-row-${m.key}` })
  const markOf = (m) => MARK[m.status] ?? null

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

  const table = (list, caption) => (
    <DataTable
      columns={columns}
      rows={list}
      rowKey="key"
      markOf={markOf}
      rowProps={rowProps}
      sort={sort}
      onSort={setSort}
      caption={caption}
      empty="No metrics for this period yet."
    />
  )

  return (
    <div>
      <Toolbar
        aside={
          <>
            <span className="text-small text-ink2">
              {sort ? 'Sorted by column' : 'Attention first'} · hover a row for its chart
            </span>
            {sort ? (
              <Button variant="quiet" size="sm" onClick={() => setSort(null)}>
                Attention first
              </Button>
            ) : null}
            {canCustomize && !customizing && (
              <Button variant="secondary" size="sm" onClick={enter} disabled={layoutLoading} icon={<SlidersHorizontal size={13} />}>
                Customize
              </Button>
            )}
          </>
        }
      >
        <span className="text-heading font-semibold text-ink">This school&rsquo;s scorecard</span>
      </Toolbar>

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
        {!sectioned ? (
          <Section label="Financial health" aside="measured against your targets" className="!mt-4">
            {table(attentionFirst(rows), 'Scorecard')}
          </Section>
        ) : (
          sections.map((sec, i) => (
            <Section key={sec.title} label={sec.title} className={i === 0 ? '!mt-4' : undefined}>
              {table(sec.rows, `${sec.title} scorecard`)}
            </Section>
          ))
        )}
      </div>
    </div>
  )
}
