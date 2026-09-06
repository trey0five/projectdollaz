// ─────────────────────────────────────────────────────────────────────────────
// useSpriteFrame — rAF-driven sprite-sheet frame writer for KyroDove's wingbeat.
//
// Writes `background-position` IMPERATIVELY through a ref (no React state, no
// re-render per frame — the same pattern OrbitScrolly uses for scroll-driven
// motion). The frame is deterministic from a start timestamp:
//   frame = floor((now − startTs) / 1000 × fps) % frames
// so it is pausable (holds the last frame while `playing` is false and resumes
// in phase), and `resetKey` restarts from frame 0 (the flight-state handoff).
//
// Why not CSS steps(): the frame can't be read or synced with the glide
// handoff, and the reduced-motion belt in index.css only kills named classes.
//
// Positioning uses PERCENTAGES so it is size-independent: with
// `background-size: cols×100% rows×100%` on an element the exact size of one
// cell, column c sits at c/(cols−1) × 100% (browsers interpolate percentage
// background-position against the overflow, which is exactly (cols−1) cells).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react'

export const framePosition = (frame, cols, rows) => {
  const col = frame % cols
  const row = Math.floor(frame / cols)
  const x = cols > 1 ? (col / (cols - 1)) * 100 : 0
  const y = rows > 1 ? (row / (rows - 1)) * 100 : 0
  return `${x}% ${y}%`
}

export default function useSpriteFrame({
  ref,
  frames = 1,
  cols = 1,
  rows = 1,
  fps = 24,
  playing = false,
  resetKey,
}) {
  const startRef = useRef(0)
  const pausedAtRef = useRef(null)
  const lastFrameRef = useRef(-1)
  const resetSeenRef = useRef(resetKey)

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    if (resetSeenRef.current !== resetKey || startRef.current === 0) {
      // Phase reset: restart the cycle from frame 0.
      resetSeenRef.current = resetKey
      startRef.current = now
      pausedAtRef.current = null
      lastFrameRef.current = -1
    } else if (pausedAtRef.current != null) {
      // Resume in phase: shift the start by however long we were paused.
      startRef.current += now - pausedAtRef.current
      pausedAtRef.current = null
    }
    const write = (t) => {
      const f = Math.floor(((t - startRef.current) / 1000) * fps) % frames
      if (f !== lastFrameRef.current) {
        lastFrameRef.current = f
        el.style.backgroundPosition = framePosition(f, cols, rows)
      }
    }
    write(now)
    if (!playing || frames <= 1) {
      pausedAtRef.current = now
      return undefined
    }
    let raf = 0
    const tick = (t) => {
      write(t)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      pausedAtRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now()
    }
  }, [ref, frames, cols, rows, fps, playing, resetKey])
}
