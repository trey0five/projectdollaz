// Organization KPI strip (canonical semantic layer v1) — a MODEST, read-only
// org-scope KPI band shown above the consolidated statements. Reads the
// org-metrics endpoint (one call site in api.js / useOrgMetrics) and renders the
// Tier-1 banded metrics as compact tiles with the SAME status coloring + value
// formatting the per-school dashboard uses.
//
// The moat made visible: each org value is the metric's OWN formula run on the
// SUM of every reporting school's extensive components (e.g. org operating margin
// = (Σrev−Σexp)/Σrev), NEVER the average of per-school values. A "based on N of M
// schools reporting" caption + an "enrollment-weighted" tag on the weighted
// per-pupil metrics make that explicit.
//
// Pure presentation over the `metrics` prop; everything derived at render (no
// effects, no in-render component definitions — React-Compiler safe). Navy/gold
// theme; no-print; advisory.
import { motion, useReducedMotion } from 'framer-motion'
import { Gauge } from 'lucide-react'
import StatusDot from '../analytics/StatusDot.jsx'
import { metricFormat, formatMetricValue, isBandedStatus } from '../../lib/metricMeta.js'

// The org strip leads with the four Tier-1 banded metrics (status-colored), then a
// few key operational/weighted ratios. We deliberately omit the mix donuts here
// (the consolidated SOA/SFP below already shows the org composition).
const STRIP_KEYS = [
  'operating_margin',
  'days_cash_on_hand',
  'months_operating_reserve',
  'tuition_dependency',
  'cost_per_pupil',
  'tuition_discount_rate',
  'pct_students_on_aid',
]

// Weighted metrics get an honest "enrollment-weighted" hint so users understand
// the org value is recompute-from-sums, not a naive average.
const WEIGHTED = {
  cost_per_pupil: 'enrollment-weighted',
  net_tuition_per_student: 'enrollment-weighted',
  financial_aid_per_student: 'enrollment-weighted',
  aid_per_aided_student: 'aided-count-weighted',
}

function Tile({ metric, index, reduce }) {
  const unavailable = !metric.available
  const showStatus = !unavailable && isBandedStatus(metric.status)
  const fmt = metricFormat(metric.key, metric.unit)
  const weightedHint = WEIGHTED[metric.key]

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, type: 'spring', stiffness: 260, damping: 22 }}
      className="card-vital flex min-w-[8.5rem] flex-1 flex-col gap-1 p-3 sm:p-4"
    >
      <div className="flex items-center gap-2">
        <h3 className="font-sans text-[11.5px] font-semibold uppercase leading-snug tracking-[0.1em] text-muted">
          {metric.label}
        </h3>
        {showStatus && (
          <span className="ml-auto">
            <StatusDot status={metric.status} size={9} />
          </span>
        )}
      </div>
      <p
        className={`font-serif text-2xl leading-none ${unavailable ? 'text-muted' : 'text-navy'}`}
      >
        {unavailable ? '—' : formatMetricValue(metric.value, fmt)}
      </p>
      {weightedHint && !unavailable && (
        <p className="text-[10.5px] uppercase tracking-[0.08em] text-muted">{weightedHint}</p>
      )}
    </motion.div>
  )
}

export default function OrgKpiStrip({ metrics, loading, error }) {
  const reduce = useReducedMotion()

  if (loading) {
    return (
      <div className="card-soft mb-4 animate-pulse px-6 py-8 text-center">
        <p className="font-serif text-sm italic text-muted">Loading organization KPIs…</p>
      </div>
    )
  }
  // Read-only / advisory: a KPI failure must never block the consolidated
  // statements below it, so we render nothing on error rather than an alarm.
  if (error || !metrics) return null

  const byKey = {}
  for (const m of metrics.metrics ?? []) byKey[m.key] = m
  const tiles = STRIP_KEYS.map((k) => byKey[k]).filter(Boolean)
  if (tiles.length === 0) return null

  const reported = metrics.reportedCount ?? 0
  const total = metrics.schoolCount ?? 0

  return (
    <section className="mb-5" aria-label="Organization KPIs">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold/15 text-gold">
          <Gauge size={15} />
        </span>
        <h2 className="font-serif text-lg text-navy">Organization KPIs</h2>
        {total > 0 && (
          <span className="ml-auto text-[11.5px] uppercase tracking-[0.08em] text-muted">
            Based on {reported} of {total} schools reporting
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        {tiles.map((m, i) => (
          <Tile key={m.key} metric={m} index={i} reduce={reduce} />
        ))}
      </div>
    </section>
  )
}
