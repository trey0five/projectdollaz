// ─────────────────────────────────────────────────────────────────────────────
// usePennyDemoScript — drives the scripted Penny hero demo from the beat
// timelines in demoScenarios.js.
//
// Discipline (non-negotiable):
//   • Beats are CHAINED setTimeouts (never setInterval); typewriters are bounded
//     per-char intervals that self-clear at end of string.
//   • useInView on the frame ref — offscreen means ZERO live timers; scrolling
//     back restarts the current scenario from beat 0 (idempotent, so React
//     StrictMode's double-invoke is harmless).
//   • Full teardown on unmount / dependency change (every timer id tracked).
//   • useReducedMotion → Scenario 1's finished frame, statically, zero timers.
//
// The scenario loop: the final `advance` beat bumps scenarioIndex (mod 3); the
// effect re-runs, resets the transcript, and schedules the next scenario after
// a short gap so AnimatePresence (keyed on scenarioIndex, mode="wait") can fade
// the old transcript out before fresh content types in. It only runs while the
// demo is in view, and never under reduced motion (static finished frame).
// The Scholar blinks by itself; the scripted blink beats add the extra ones.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { useInView, useReducedMotion } from 'framer-motion'
import { INITIAL_DEMO_STATE, SCENARIOS, STATIC_FINAL_FRAME } from './demoScenarios.js'

// Hero load orchestration: the script starts at t=1300 on first run so the
// headline mask-reveal lands first; loop hand-offs wait just past the 300ms
// AnimatePresence exit fade.
const FIRST_RUN_DELAY = 1300
const LOOP_DELAY = 400

export default function usePennyDemoScript() {
  const reduce = useReducedMotion()
  const frameRef = useRef(null)
  const inView = useInView(frameRef, { amount: 0.25 })
  const [scenarioIndex, setScenarioIndex] = useState(0)
  const [state, setState] = useState(INITIAL_DEMO_STATE)
  // Flipped to false only once beats actually start, so a StrictMode
  // mount→unmount→mount still gives the real first run the full hero delay.
  const firstRunRef = useRef(true)

  // ── Beat runner ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (reduce || !inView) return undefined
    const scenario = SCENARIOS[scenarioIndex]
    const timers = new Set()
    const typers = new Map() // field → interval id
    let cancelled = false

    const clearTyper = (field) => {
      const id = typers.get(field)
      if (id !== undefined) {
        clearInterval(id)
        typers.delete(field)
      }
    }

    // Bounded typewriter: writes text.slice(0, i) until the string is exhausted,
    // then self-clears. A later beat patching the same field cancels it first.
    const startTyper = ({ field, text, ms }) => {
      clearTyper(field)
      let i = 0
      const id = setInterval(() => {
        i += 1
        const next = text.slice(0, i)
        setState((s) => ({ ...s, [field]: next }))
        if (i >= text.length) clearTyper(field)
      }, ms)
      typers.set(field, id)
    }

    const runBeat = (beatIndex) => {
      if (cancelled) return
      const beat = scenario.beats[beatIndex]
      if (!beat) return
      if (beat.advance) {
        setScenarioIndex((i) => (i + 1) % SCENARIOS.length)
        return
      }
      if (beat.patch) {
        // An explicit patch to a field being typed force-completes it.
        Object.keys(beat.patch).forEach(clearTyper)
        setState((s) => ({ ...s, ...beat.patch }))
      }
      if (beat.type) startTyper(beat.type)
      const next = scenario.beats[beatIndex + 1]
      if (next) {
        const id = setTimeout(() => runBeat(beatIndex + 1), next.at - beat.at)
        timers.add(id)
      }
    }

    const startDelay = firstRunRef.current ? FIRST_RUN_DELAY : LOOP_DELAY
    const startId = setTimeout(() => {
      firstRunRef.current = false
      // Reset here (after the exit fade), not synchronously on effect run, so
      // the outgoing AnimatePresence child keeps its finished transcript while
      // it fades; the incoming child is still at opacity 0 when this lands.
      setState(INITIAL_DEMO_STATE)
      runBeat(0)
    }, startDelay)
    timers.add(startId)

    return () => {
      cancelled = true
      timers.forEach((id) => clearTimeout(id))
      typers.forEach((id) => clearInterval(id))
      typers.clear()
    }
  }, [scenarioIndex, inView, reduce])

  return {
    frameRef,
    reduce,
    scenarioIndex,
    state: reduce ? STATIC_FINAL_FRAME : state,
  }
}
