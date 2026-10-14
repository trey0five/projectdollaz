import HeroVitalTile from './HeroVitalTile.jsx'
import { StatStrip } from '../ui/surface/index.js'

/**
 * Hero vitals strip (Phase 4D → Premium UI P3): the financial-health vital
 * metrics (the ones with target bands) as Stats in a `StatStrip` on the ground.
 * The list of keys + order is derived by the parent FROM the effective layout
 * (visibility + order honored), so a hidden vital never appears here and the
 * order follows the saved layout.
 */
export default function HeroVitals({ vitalKeys, metricsByKey, trendsByKey, periodKey, onOpen }) {
  const tiles = vitalKeys
    .map((key) => metricsByKey[key])
    .filter(Boolean)

  if (tiles.length === 0) return null

  return (
    <StatStrip cols={tiles.length} className="grid-cols-1 sm:grid-cols-3">
      {tiles.map((metric) => (
        <HeroVitalTile key={metric.key} metric={metric} periodKey={periodKey} trend={trendsByKey[metric.key]} onOpen={onOpen} />
      ))}
    </StatStrip>
  )
}
