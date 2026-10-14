// ─────────────────────────────────────────────────────────────────────────────
// BriefingPerformers — the "top-3 performing" metrics on the RIGHT of the
// daily-briefing stage, as IN-STAGE STATS (Premium UI P2: the glass chips are
// gone; three Stats separated by white hairlines, each with its delta mark and
// a mini sparkline, each a link into the metric drawer).
// Self-contained + FAIL-SOFT like HomeVitalsStrip: its own metrics fetch, its own
// per-metric trend fetch for the sparklines, and it renders NOTHING while
// loading, on error, with no period, or when there's nothing genuinely positive
// to show — so the stage never waits on it and never shows a fabricated win.
//
// "Performing" is HONEST: a stat only appears for a real metric whose real
// period-over-period delta improved (deltaTone === 'good'), ranked by relative
// move; if fewer than three improved we top up with metrics sitting in their
// healthy band ('good' status). Values, deltas and sparklines are all real.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { useAnalytics } from '../../hooks/useAnalytics.js'
import { analyticsApi } from '../../lib/api.js'
import Sparkline from '../analytics/Sparkline.jsx'
import { StatStrip, Stat } from '../ui/surface/index.js'
import { metricFormat, formatMetricValue, formatDelta, deltaTone } from '../../lib/metricMeta.js'

// Rank helper: a rough RELATIVE move so metrics in different units compare fairly.
const relMove = (m) =>
  m.value ? Math.abs(m.periodOverPeriodDelta / m.value) : Math.abs(m.periodOverPeriodDelta)

export default function BriefingPerformers({ schoolId, periodId }) {
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
    <StatStrip cols={picks.length} className="stats-stage w-full lg:flex-1" aria-label="Top performing metrics">
      {picks.map((m) => {
        const fmt = metricFormat(m.key, m.unit)
        const pts = trends[m.key]?.points
        const hasSpark = pts && pts.filter((p) => p.value != null).length >= 2
        const deltaText = m.periodOverPeriodDelta != null ? formatDelta(m.periodOverPeriodDelta, fmt) : null
        return (
          <Stat
            key={m.key}
            to={`/analytics?metric=${m.key}`}
            label={m.label}
            value={formatMetricValue(m.value, fmt)}
            delta={deltaText ? { text: deltaText, tone: deltaTone(m.periodOverPeriodDelta, m.goodDirection) } : null}
            aria-label={`${m.label} — open in analytics`}
          >
            {hasSpark ? (
              <div className="mt-2 h-8 opacity-90" aria-hidden="true">
                <Sparkline points={pts} status={m.status} height={32} stroke="#38BDF8" />
              </div>
            ) : null}
          </Stat>
        )
      })}
    </StatStrip>
  )
}
