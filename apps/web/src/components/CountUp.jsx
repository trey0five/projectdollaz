import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'

/**
 * Counts from 0 up to `value` once on mount. Respects prefers-reduced-motion
 * (renders the final value instantly).
 */
export default function CountUp({ value, duration = 0.9 }) {
  const reduce = useReducedMotion()
  const [display, setDisplay] = useState(reduce ? value : 0)
  const ranRef = useRef(false)

  useEffect(() => {
    if (reduce || ranRef.current) {
      setDisplay(value)
      return
    }
    ranRef.current = true
    let raf
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - start) / (duration * 1000))
      // ease-out
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(eased * value))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration, reduce])

  return <>{display.toLocaleString('en-US')}</>
}
