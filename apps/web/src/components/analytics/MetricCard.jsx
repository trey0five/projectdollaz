import HeroVitalTile from './HeroVitalTile.jsx'

/**
 * Compact metric Stat (Phase 4D → Premium UI P3): the same `HeroVitalTile` in
 * its compact size — label, count-up value, 2px status mark (only for banded
 * metrics — contextual ones stay neutral), goodDirection-toned delta Pill, a
 * small sparkline — with the category eyebrow above. The whole stat is a button
 * that opens the drill-down drawer; keeps id=`metric-<key>` for Penny.
 */
export default function MetricCard({ metric, trendPoints, periodKey, category, onOpen }) {
  return <HeroVitalTile metric={metric} periodKey={periodKey} trend={trendPoints ? { points: trendPoints } : null} onOpen={onOpen} category={category} compact />
}
