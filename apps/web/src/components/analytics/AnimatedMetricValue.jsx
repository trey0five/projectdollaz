import { useEffect, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { formatMetricValue } from '../../lib/metricMeta.js'

/**
 * Format-aware count-up. Generalizes CountUp.jsx to floats + a formatter so
 * percent/days/months/currency values animate correctly. Keeps the rAF ease-out
 * cubic + prefers-reduced-motion gate. Re-keyed by the parent on period change
 * so the number re-counts when the selected period changes.
 *
 * When reduced-motion is on or the value isn't numeric, we render the final value
 * directly (no animation, no setState-in-effect) — the effect only runs to drive
 * the actual count-up.
 */
export default function AnimatedMetricValue({ value, format, duration = 0.9 }) {
  const reduce = useReducedMotion()
  const numeric = typeof value === 'number' && !Number.isNaN(value)
  const animate = numeric && !reduce
  const [display, setDisplay] = useState(animate ? 0 : value)

  useEffect(() => {
    if (!animate) return undefined
    let raf
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - start) / (duration * 1000))
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(eased * value)
      if (t < 1) raf = requestAnimationFrame(tick)
      else setDisplay(value)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration, animate])

  return <>{formatMetricValue(animate ? display : value, format)}</>
}
