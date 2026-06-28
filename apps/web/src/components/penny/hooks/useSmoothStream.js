/**
 * useSmoothStream — typewriter smoothing for streamed assistant text.
 *
 * The model emits tokens in uneven bursts, so feeding raw deltas straight
 * to the DOM produces choppy spurts. This hook decouples reveal speed from
 * network arrival: a requestAnimationFrame loop advances a *displayed*
 * length toward the *target* length at a steady, gap-proportional cadence.
 *
 *   - Reveal rate scales with the remaining gap so a big burst catches up
 *     fast while small deltas type out smoothly (~75 chars/sec steady state).
 *   - prefers-reduced-motion: smoothing is skipped entirely — displayed
 *     text always equals the target immediately (no animation).
 *   - On `done`, call flush() to jump displayed text to the full final
 *     target so trailing characters are never dropped before the message
 *     is committed to history.
 *   - reset() clears the buffer when a new stream starts.
 *
 * Ported from the Nagare AI reference (TS -> JS).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function useSmoothStream(target) {
  const [displayed, setDisplayed] = useState('')

  // Mutable refs drive the rAF loop without triggering re-renders per char.
  const targetRef = useRef('')
  const lenRef = useRef(0)
  const rafRef = useRef(null)
  const lastTsRef = useRef(0)
  const reducedRef = useRef(prefersReducedMotion())

  // Keep the reduced-motion flag live if the user changes the OS setting.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => { reducedRef.current = mq.matches }
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])

  const stopLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    lastTsRef.current = 0
  }, [])

  // The rAF tick — STEADY, time-based reveal. Reveal at a steady
  // chars-per-second based on elapsed wall time; because the baseline
  // (STEADY_CPS) is slower than the model's burst arrival, a buffer of
  // pending characters almost always exists, so the text types out
  // continuously. When the model runs far ahead the rate scales up so the
  // tail never visibly lags.
  const STEADY_CPS = 75
  // The tick callback recurses (schedules the next frame as itself). We hold it
  // in a ref so the rAF re-schedule never closes over a stale/forward
  // declaration, keeping the body free of self-reference.
  const tickRef = useRef(null)
  const tick = useCallback((ts) => {
    const target = targetRef.current
    const gap = target.length - lenRef.current
    if (gap <= 0) {
      // Caught up — idle until more text arrives (setTarget restarts us).
      rafRef.current = null
      lastTsRef.current = 0
      return
    }
    const last = lastTsRef.current
    lastTsRef.current = ts
    // Seconds since the previous frame; clamp so a backgrounded tab that
    // resumes doesn't dump the whole buffer in one frame.
    const dt = last ? Math.min((ts - last) / 1000, 0.1) : 1 / 60
    // Steady baseline, accelerating when the model has surged ahead.
    let cps = STEADY_CPS
    if (gap > 280) cps = gap * 4
    else if (gap > 90) cps = STEADY_CPS * 4
    const step = Math.min(gap, Math.max(1, Math.round(cps * dt)))
    lenRef.current += step
    setDisplayed(target.slice(0, lenRef.current))
    rafRef.current = requestAnimationFrame((next) => tickRef.current?.(next))
  }, [])
  useEffect(() => {
    tickRef.current = tick
  }, [tick])

  const setTarget = useCallback((full) => {
    targetRef.current = full
    if (reducedRef.current) {
      // Reduced motion: no animation, displayed always equals target.
      lenRef.current = full.length
      setDisplayed(full)
      return
    }
    // Kick the loop if it isn't already running.
    if (rafRef.current == null && lenRef.current < full.length) {
      rafRef.current = requestAnimationFrame((next) => tickRef.current?.(next))
    }
  }, [])

  const flush = useCallback(() => {
    stopLoop()
    const full = targetRef.current
    lenRef.current = full.length
    setDisplayed(full)
  }, [stopLoop])

  const reset = useCallback(() => {
    stopLoop()
    targetRef.current = ''
    lenRef.current = 0
    setDisplayed('')
  }, [stopLoop])

  // Optional initial/controlled target — keep the buffer in sync if a caller
  // passes one. Harmless no-op when undefined.
  useEffect(() => {
    if (typeof target === 'string') setTarget(target)
  }, [target, setTarget])

  // Cancel any in-flight frame on unmount.
  useEffect(() => stopLoop, [stopLoop])

  // `displayed` changes per frame; the control methods are stable. Splitting
  // them into a memoized `controls` object lets consumers depend on the
  // controls without re-memoizing on every revealed character.
  const controls = useMemo(
    () => ({ setTarget, flush, reset }),
    [setTarget, flush, reset],
  )

  return { displayed, ...controls }
}
