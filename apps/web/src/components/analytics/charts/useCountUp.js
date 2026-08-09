import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from './useReducedMotion.js'

// ─────────────────────────────────────────────────────────────────────────────
// useCountUp — ports the mockup's countUp(): parses a raw display string
// ("$1,234.5", "97%", "-50") into prefix / number / suffix, then animates the
// number from the PREVIOUSLY-RENDERED target → the new target with an
// ease-out-cubic over ~850ms, re-formatting each frame (preserving decimals +
// thousands separators). Returns the current display string to bind into an SVG
// <text>. First mount still counts 0 → target; after that a re-render tweens
// prev → next, so a value never sweeps through figures that were never true
// (e.g. a cash tile passing through $0 on re-projection).
//
// `enabled: false` skips the rAF loop entirely and returns the formatted target.
// Reduced motion (or a string with no number) → returns the final string with no
// animation. The animated interim value is written only from inside rAF (never a
// synchronous setState in the effect body).
// ─────────────────────────────────────────────────────────────────────────────
export function useCountUp(raw, { duration = 850, enabled = true } = {}) {
  const reduce = useReducedMotion()
  const final = String(raw ?? '')
  const numeric = /^([^0-9-]*)(-?[\d,]+\.?\d*)(.*)$/.test(final)
  const canAnimate = enabled && !reduce && numeric

  const [display, setDisplay] = useState(final)
  const rafRef = useRef(0)
  // The last target this hook animated to — the start of the NEXT tween.
  const prevTargetRef = useRef(null)

  useEffect(() => {
    if (!canAnimate) return
    const m = final.match(/^([^0-9-]*)(-?[\d,]+\.?\d*)(.*)$/)
    if (!m) return
    const [, pre, numStr, suf] = m
    const target = parseFloat(numStr.replace(/,/g, ''))
    const from = prevTargetRef.current ?? 0
    prevTargetRef.current = target
    const dec = (numStr.split('.')[1] || '').length
    const comma = numStr.includes(',')
    const t0 = performance.now()

    const frame = (t) => {
      const k = Math.min(1, (t - t0) / duration)
      const e = 1 - Math.pow(1 - k, 3)
      let out = (from + (target - from) * e).toFixed(dec)
      if (comma) out = (+out).toLocaleString('en-US', { minimumFractionDigits: dec })
      setDisplay(pre + out + suf) // written inside rAF → async, not a sync effect setState
      if (k < 1) rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(rafRef.current)
  }, [final, duration, canAnimate])

  return canAnimate ? display : final
}
