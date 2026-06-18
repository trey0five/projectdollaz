import HeroVitalTile from './HeroVitalTile.jsx'

/**
 * Hero vitals row (Phase 4D): the financial-health vital metrics (the ones with
 * target bands) as large status tiles. The list of keys + order is derived by the
 * parent FROM the effective layout (visibility + order honored), so a hidden vital
 * never appears here and the order follows the saved layout. 3-up on desktop,
 * stacks on tablet/phone.
 */
export default function HeroVitals({ vitalKeys, metricsByKey, trendsByKey, periodKey, onOpen }) {
  const tiles = vitalKeys
    .map((key) => metricsByKey[key])
    .filter(Boolean)

  if (tiles.length === 0) return null

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
      {tiles.map((metric, i) => (
        <HeroVitalTile
          key={metric.key}
          metric={metric}
          index={i}
          periodKey={periodKey}
          trend={trendsByKey[metric.key]}
          onOpen={onOpen}
        />
      ))}
    </div>
  )
}
