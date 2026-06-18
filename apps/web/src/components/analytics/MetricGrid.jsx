import { LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import MetricCard from './MetricCard.jsx'

/**
 * Responsive compact-card grid (Phase 4D). Renders a PRE-RESOLVED ordered list of
 * { key, span } items (the parent derives these from the effective 4C layout, so
 * order/visibility/span are honored). Mix metrics + hero vitals are handled
 * elsewhere by the parent and excluded from `items`. Wrapped in a LayoutGroup so
 * cards layout-animate into new slots when the saved order changes.
 */
export default function MetricGrid({ items, metricsByKey, trendsByKey, periodKey, onOpen }) {
  const reduce = useReducedMotion()
  let index = 0

  return (
    <LayoutGroup>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
        {items.map(({ key, span }) => {
          const m = metricsByKey[key]
          if (!m) return null
          const i = index++
          const wide = span === 2
          return (
            <motion.div
              key={key}
              layout={reduce ? false : 'position'}
              transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 22 }}
              className={wide ? 'col-span-2 xl:col-span-2' : undefined}
            >
              <MetricCard
                metric={m}
                index={i}
                periodKey={periodKey}
                trendPoints={trendsByKey[key]?.points}
                onOpen={onOpen}
              />
            </motion.div>
          )
        })}
      </div>
    </LayoutGroup>
  )
}
