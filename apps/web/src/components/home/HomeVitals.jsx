// Live vitals row for the home command center: 3 health-graded KPI tiles
// (operating_margin, days_cash_on_hand, months_operating_reserve) reusing the
// analytics HeroVitalTile, plus a compliance status tile. Clicking a KPI tile
// deep-links to /analytics?metric=<key> so the analytics dashboard preselects
// and opens that metric's drill-down drawer (lands the user on the relevant
// detail, not the default view). 4-up on desktop, responsive down to 1-up.
import { useNavigate } from 'react-router-dom'
import HeroVitalTile from '../analytics/HeroVitalTile.jsx'
import ComplianceVitalTile from './ComplianceVitalTile.jsx'
import { MetricCardSkeleton } from '../analytics/skeletons.jsx'

const VITAL_KEYS = ['operating_margin', 'days_cash_on_hand', 'months_operating_reserve']

export default function HomeVitals({
  metricsByKey,
  trendsByKey,
  periodKey,
  loading,
  complianceSummary,
  complianceLoading,
}) {
  const navigate = useNavigate()

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <MetricCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  const tiles = VITAL_KEYS.map((k) => metricsByKey[k]).filter(Boolean)

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {tiles.map((metric, i) => (
        <HeroVitalTile
          key={metric.key}
          metric={metric}
          index={i}
          periodKey={periodKey}
          trend={trendsByKey[metric.key]}
          onOpen={() => navigate(`/analytics?metric=${metric.key}`)}
        />
      ))}
      <ComplianceVitalTile
        summary={complianceSummary}
        loading={complianceLoading}
        index={tiles.length}
      />
    </div>
  )
}
