import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'

// ─────────────────────────────────────────────────────────────────────────────
// StatFigure — a count-up for a Stat whose value is MONEY (or a percent) on a
// live-editing surface (capital/cash/campaign schedules, the driver budget, the
// forecast). The surface Stat counts up only bare numbers, and its currency path
// (AnimatedMetricValue) restarts from 0 on EVERY change and prints a negative as
// "$-1,234". This tweens from the value on screen to the new one (so typing in a
// row eases the total instead of re-running it from zero), runs once on mount,
// respects reduced motion, and speaks whole-dollar accounting: $1,234 / ($1,234).
//
// Pass the RESULT of statMoney()/statPct() as a Stat `value` (a node renders
// as-is). null/NaN → null, which the Stat renders as its em dash.
// Proposed primitive change (P4-C): a Stat `format="accounting"` that does this.
// ─────────────────────────────────────────────────────────────────────────────
const dollars = (v) => {
  const r = Math.round(v)
  const s = `$${Math.abs(r).toLocaleString('en-US')}`
  return r < 0 ? `(${s})` : s
}
const percent = (v) => `${(v * 100).toFixed(1)}%`

function Tween({ value, render, duration = 0.8 }) {
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(reduce ? value : 0)
  const fromRef = useRef(reduce ? value : 0)
  useEffect(() => {
    if (reduce) return undefined
    const from = fromRef.current
    const start = performance.now()
    let raf
    const tick = (now) => {
      const t = Math.min(1, (now - start) / (duration * 1000))
      const v = from + (value - from) * (1 - Math.pow(1 - t, 3))
      fromRef.current = v
      setShown(v)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, reduce, duration])
  // Reduced motion: the final value, straight away (no tween, no state).
  return <>{render(reduce ? value : shown)}</>
}

const finite = (n) => n != null && n !== '' && Number.isFinite(Number(n))

/** Whole-dollar money that counts up: $1,234 / ($1,234). */
export function statMoney(n) {
  return finite(n) ? <Tween value={Number(n)} render={dollars} /> : null
}

/** A fraction (0.42) shown as a percent (42.0%) that counts up. */
export function statPct(frac) {
  return finite(frac) ? <Tween value={Number(frac)} render={percent} /> : null
}

/** A signed money figure as a static accounting STRING: $1,234 / ($1,234). */
export function signedMoney(n) {
  return finite(n) ? dollars(Number(n)) : null
}
