import { LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import MetricCard from './MetricCard.jsx'

/**
 * The compact-metric strip (Phase 4D → Premium UI P3). Renders a PRE-RESOLVED
 * ordered list of { key, span, category } items (the parent derives these from
 * the effective 4C layout, so order/visibility/span are honored) as `Stat`s in
 * ONE `.stats` grid on the ground — vertical rules, no cards. Grouping meaning
 * is carried by each stat's `category` eyebrow. Mix metrics + hero vitals are
 * handled elsewhere by the parent and excluded from `items`. Wrapped in a
 * LayoutGroup so stats layout-animate into new slots when the saved order changes.
 */
export default function MetricGrid({ items, metricsByKey, trendsByKey, periodKey, onOpen }) {
  const reduce = useReducedMotion()

  return (
    <LayoutGroup>
      <div className="stats stats-compact grid-cols-2 md:grid-cols-3 xl:grid-cols-4" role="list">
        {items.map(({ key, span, category }) => {
          const m = metricsByKey[key]
          if (!m) return null
          const wide = span === 2
          return (
            <motion.div
              key={key}
              layout={reduce ? false : 'position'}
              transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 22 }}
              className={`stat-cell min-w-0${wide ? ' col-span-2' : ''}`}
            >
              <MetricCard metric={m} periodKey={periodKey} category={category} trendPoints={trendsByKey[key]?.points} onOpen={onOpen} />
            </motion.div>
          )
        })}
      </div>
    </LayoutGroup>
  )
}
