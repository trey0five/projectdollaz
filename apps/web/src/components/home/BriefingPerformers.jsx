// ─────────────────────────────────────────────────────────────────────────────
// BriefingPerformers — the "top-3 performing" cards embedded on the RIGHT of the
// daily-briefing hero (the reference's Finance / Enrollment / Advancement cards).
// Self-contained + FAIL-SOFT like HomeVitalsStrip: its own metrics fetch, its own
// per-metric trend fetch for the mini sparklines, and it renders NOTHING while
// loading, on error, with no period, or when there's nothing genuinely positive
// to show — so the hero never waits on it and never shows a fabricated win.
//
// "Performing" is HONEST: a card only appears for a real metric whose real
// period-over-period delta improved (deltaTone === 'good'), ranked by relative
// move; if fewer than three improved we top up with metrics sitting in their
// healthy band ('good' status). Values, deltas and sparklines are all real.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useAnalytics } from '../../hooks/useAnalytics.js'
import { analyticsApi } from '../../lib/api.js'
import Sparkline from '../analytics/Sparkline.jsx'
import DeltaChip from '../analytics/DeltaChip.jsx'
import MetricIcon from '../analytics/MetricIcon.jsx'
import { metricFormat, formatMetricValue, deltaTone } from '../../lib/metricMeta.js'

// Rank helper: a rough RELATIVE move so metrics in different units compare fairly.
const relMove = (m) =>
  m.value ? Math.abs(m.periodOverPeriodDelta / m.value) : Math.abs(m.periodOverPeriodDelta)

export default function BriefingPerformers({ schoolId, periodId }) {
  const reduce = useReducedMotion()
  const navigate = useNavigate()
  const { metrics, loading, error, notEntitled } = useAnalytics(schoolId, periodId)
  const [trends, setTrends] = useState({})

  // Pick up to three genuinely-good performers. Improving metrics first (ranked by
  // relative move), then healthy-band metrics to top up — never a regressor.
  const picks = useMemo(() => {
    const avail = (metrics ?? []).filter((m) => m && m.available && m.value != null)
    const improving = avail
      .filter(
        (m) =>
          m.periodOverPeriodDelta != null &&
          deltaTone(m.periodOverPeriodDelta, m.goodDirection) === 'good',
      )
      .sort((a, b) => relMove(b) - relMove(a))
    const chosen = [...improving]
    if (chosen.length < 3) {
      const seen = new Set(chosen.map((m) => m.key))
      for (const m of avail) {
        if (chosen.length >= 3) break
        if (!seen.has(m.key) && m.status === 'good') chosen.push(m)
      }
    }
    return chosen.slice(0, 3)
  }, [metrics])

  // Fetch each picked metric's trend series for its sparkline (one round trip
  // each, in parallel — the AnalyticsDashboard pattern). Fail-soft per key.
  useEffect(() => {
    let cancelled = false
    const keys = picks.map((m) => m.key)
    // Defer ALL setState into a microtask (the codebase's set-state-in-effect
    // convention), so the empty-guard reset doesn't fire synchronously either.
    Promise.resolve().then(async () => {
      if (cancelled) return
      if (!schoolId || keys.length === 0) {
        setTrends({})
        return
      }
      const results = await Promise.all(
        keys.map((k) =>
          analyticsApi
            .trends(schoolId, k)
            .then((r) => [k, r.data])
            .catch(() => [k, null]),
        ),
      )
      if (cancelled) return
      const map = {}
      for (const [k, v] of results) if (v) map[k] = v
      setTrends(map)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, picks.map((m) => m.key).join(',')])

  if (!schoolId || !periodId || loading || error || notEntitled || picks.length === 0) return null

  return (
    // Mobile: a horizontal swipe row (scroll-snap) instead of three stacked
    // cards — one card ≈ one swipe, no vertical scroll cost. sm+: the 3-col grid.
    <div className="flex w-full min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0 lg:flex-1">
      {picks.map((m, i) => {
        const fmt = metricFormat(m.key, m.unit)
        const pts = trends[m.key]?.points
        const hasSpark = pts && pts.filter((p) => p.value != null).length >= 2
        return (
          <motion.button
            key={m.key}
            type="button"
            onClick={() => navigate(`/analytics?metric=${m.key}`)}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduce ? 0 : 0.15 + i * 0.08, duration: 0.4 }}
            whileHover={reduce ? undefined : { y: -3 }}
            aria-label={`${m.label} — open in analytics`}
            className="group flex min-w-[72%] snap-start flex-col gap-2 overflow-hidden rounded-2xl border border-white/12 bg-white/[0.07] p-3.5 text-left outline-none backdrop-blur-sm ring-gold/50 transition-colors hover:border-white/25 hover:bg-white/[0.11] focus-visible:ring-2 sm:min-w-0"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/90">
                <MetricIcon metricKey={m.key} size={16} />
              </span>
              <span className="truncate text-[13px] font-semibold text-white/90">{m.label}</span>
            </div>

            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="font-serif text-[19px] font-semibold leading-none text-white">
                {formatMetricValue(m.value, fmt)}
              </span>
              <DeltaChip
                delta={m.periodOverPeriodDelta}
                format={fmt}
                goodDirection={m.goodDirection}
                onDark
              />
            </div>

            <div className="mt-0.5 h-9">
              {hasSpark ? (
                <Sparkline points={pts} status={m.status} height={36} />
              ) : (
                <span
                  aria-hidden="true"
                  className="block h-px w-full translate-y-4 bg-gradient-to-r from-white/25 to-transparent"
                />
              )}
            </div>
          </motion.button>
        )
      })}
    </div>
  )
}
