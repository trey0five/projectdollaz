// ─────────────────────────────────────────────────────────────────────────────
// HomeVitalsStrip — a slim "school vitals" scoreboard under the HOME tile grid.
// Fills the page with real substance (the four headline KPIs, live) instead of
// whitespace. Self-contained: its own useAnalytics fetch, FAIL-SOFT — renders
// nothing while loading, on error, or with no saved period, so the tile map never
// waits on it. Each stat deep-links to /analytics?metric=<key> (the drawer
// preselects), mirroring the old HomeVitals behaviour.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import { Activity, ArrowRight } from 'lucide-react'
import { useAnalytics } from '../../hooks/useAnalytics.js'
import AnimatedMetricValue from '../analytics/AnimatedMetricValue.jsx'
import StatusDot from '../analytics/StatusDot.jsx'
import { metricFormat } from '../../lib/metricMeta.js'

const VITAL_KEYS = [
  'operating_margin',
  'days_cash_on_hand',
  'months_operating_reserve',
  'net_tuition_per_student',
]

export default function HomeVitalsStrip({ schoolId, periodId }) {
  const reduce = useReducedMotion()
  const navigate = useNavigate()
  const { metrics, loading, error, notEntitled } = useAnalytics(schoolId, periodId)

  const vitals = useMemo(() => {
    const byKey = {}
    for (const m of metrics ?? []) byKey[m.key] = m
    return VITAL_KEYS.map((k) => byKey[k]).filter((m) => m && m.available)
  }, [metrics])

  // Fail-soft: no period, still loading, errored, unentitled, or nothing
  // available → render nothing (the tile map stands alone).
  if (!schoolId || !periodId || loading || error || notEntitled || vitals.length === 0) return null

  return (
    <motion.section
      aria-label="School vitals"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduce ? 0 : 0.3, duration: 0.4 }}
      className="rounded-[18px] border border-navy/10 bg-white p-4 shadow-card sm:p-5"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-muted">
          <Activity size={14} className="text-gold" aria-hidden />
          School vitals
        </h2>
        <Link
          to="/analytics"
          className="group inline-flex items-center gap-1 text-[12.5px] font-semibold text-gold transition-colors hover:text-navy"
        >
          Open analytics
          <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {vitals.map((m, i) => (
          <motion.button
            key={m.key}
            type="button"
            onClick={() => navigate(`/analytics?metric=${m.key}`)}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduce ? 0 : 0.36 + i * 0.06, duration: 0.3 }}
            whileHover={reduce ? undefined : { y: -2 }}
            aria-label={`${m.label} details`}
            className="rounded-xl border border-navy/5 bg-section/60 px-3.5 py-3 text-left outline-none transition-colors hover:border-gold/40 focus-visible:ring-2 focus-visible:ring-gold/60"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[11px] font-semibold uppercase tracking-[0.09em] text-muted">
                {m.label}
              </span>
              <StatusDot status={m.status} size={8} />
            </div>
            <div className="mt-1.5 font-serif text-[24px] font-semibold leading-none text-navy sm:text-[26px]">
              <AnimatedMetricValue key={periodId} value={m.value} format={metricFormat(m.key, m.unit)} />
            </div>
          </motion.button>
        ))}
      </div>
    </motion.section>
  )
}
