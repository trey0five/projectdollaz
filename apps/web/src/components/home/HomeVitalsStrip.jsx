// ─────────────────────────────────────────────────────────────────────────────
// HomeVitalsStrip — the "school vitals" under the HOME tile grid: the four
// headline KPIs, live, as a STAT STRIP on the ground (Premium UI P2 — the white
// card of four tinted boxes is gone; numbers sit between vertical rules with
// a 2px status mark and count up once). Self-contained: its own useAnalytics
// fetch, FAIL-SOFT — renders nothing while loading, on error, or with no saved
// period, so the tile map never waits on it. Each stat deep-links to
// /analytics?metric=<key> (the drawer preselects).
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAnalytics } from '../../hooks/useAnalytics.js'
import { Section, StatStrip, Stat } from '../ui/surface/index.js'
import { metricFormat, isBandedStatus } from '../../lib/metricMeta.js'

const VITAL_KEYS = [
  'operating_margin',
  'days_cash_on_hand',
  'months_operating_reserve',
  'net_tuition_per_student',
]

// Status → the Stat's 2px mark. Only a banded status carries colour.
const MARK = { good: 'good', watch: 'watch', risk: 'risk' }

export default function HomeVitalsStrip({ schoolId, periodId }) {
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
    <Section
      label="School vitals"
      aria-label="School vitals"
      aside={
        <Link to="/analytics" className="group inline-flex items-center gap-1 font-semibold text-navy-soft hover:text-ink">
          Open analytics
          <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      }
    >
      <StatStrip cols={vitals.length} className="vitals-strip">
        {vitals.map((m) => (
          <Stat
            // Re-keyed on the period so the count-up replays when the period changes.
            key={`${m.key}:${periodId}`}
            to={`/analytics?metric=${m.key}`}
            label={m.label}
            value={m.value}
            format={metricFormat(m.key, m.unit)}
            status={isBandedStatus(m.status) ? MARK[m.status] : undefined}
            aria-label={`${m.label} details`}
          />
        ))}
      </StatStrip>
    </Section>
  )
}
