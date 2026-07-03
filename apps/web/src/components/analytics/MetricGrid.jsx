import { LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import MetricCard from './MetricCard.jsx'

/**
 * Responsive compact-card grid (Phase 4D → densified). Renders a PRE-RESOLVED
 * ordered list of { key, span, category } items (the parent derives these from the
 * effective 4C layout, so order/visibility/span are honored). All non-hero, non-mix
 * cards now pack into ONE continuous grid that fills the width — grouping meaning is
 * carried by each card's `category` eyebrow, not by separate narrow section grids,
 * so a lone-category card no longer strands an empty row. Mix metrics + hero vitals
 * are handled elsewhere by the parent and excluded from `items`. Wrapped in a
 * LayoutGroup so cards layout-animate into new slots when the saved order changes.
 */
export default function MetricGrid({ items, metricsByKey, trendsByKey, periodKey, onOpen }) {
  const reduce = useReducedMotion()
  let index = 0

  return (
    <LayoutGroup>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
        {items.map(({ key, span, category }) => {
          const m = metricsByKey[key]
          if (!m) return null
          const i = index++
          const wide = span === 2
          return (
            <motion.div
              key={key}
              layout={reduce ? false : 'position'}
              transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 22 }}
              className={wide ? 'col-span-2' : undefined}
            >
              <MetricCard
                metric={m}
                index={i}
                periodKey={periodKey}
                category={category}
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
