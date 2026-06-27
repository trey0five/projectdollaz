// ─────────────────────────────────────────────────────────────────────────────
// Penny — the animated guide mascot for the Data hub (the star feature). A fixed
// bottom-right floating gold coin (PennyAvatar) + a speech bubble that points at
// the next incomplete step. The state machine is a PURE FUNCTION of `summary`
// plus a local dismiss/replay flag: the target + phase are derived during render
// via useMemo (no setState-in-effect). Required state writes (intro-seen flag,
// scroll-into-view, advance pop) are deferred with Promise.resolve().then or run
// in a microtask-guarded effect.
//
// POINTING (merged, both — each alone is ambiguous on a multi-card grid):
//   1. SPOTLIGHT GLOW RING — lives ON each SourceCard (id=datahub-card-${key}),
//      so anchoring survives responsive reflow. This file just decides the target.
//   2. FLOATING CHEVRON — a gold chevron flies from Penny toward the active card's
//      measured bounding box; Penny tilts ~8° toward it. Off-screen target =>
//      smooth scroll-into-view first (reduced-motion skips the hijack).
//
// STATES: intro (first visit) → pointing → advance (a step flipped present) →
// celebrate (allReady) → dismiss (minimize to a tiny coin tab) → replay.
//
// ACCESSIBILITY: the bubble container is role=status aria-live=polite (hints are
// announced); the avatar/ring/chevron are aria-hidden (decorative). Dismiss /
// minimize / replay are real <button>s with aria-labels. Penny never autofocuses,
// never steals focus, never blocks interaction (pointer-events scoped to itself).
// It is stacked in a corner lane ABOVE the existing AssistantWidget so they never
// overlap. Reduced-motion: no bob/blink/flip/chevron/confetti/scroll — a static
// ring (on the card) + the same bubble text + each card's "Start here" affordance.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useMemo, useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { X, Coins, ChevronRight } from 'lucide-react'
import PennyAvatar from './PennyAvatar.jsx'

const INTRO_KEY = 'finrep:datahub:penny:introSeen'
const DISMISS_KEY = 'finrep:datahub:penny:dismissed'

const readLS = (k) => {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(k) === '1'
  } catch {
    return false
  }
}
const writeLS = (k, v) => {
  try {
    window.localStorage.setItem(k, v ? '1' : '0')
  } catch {
    /* ignore */
  }
}

// Per-step bubble copy (the friendly contextual hint). Keyed by source key.
const HINTS = {
  trialBalances: "Start here. Drop in your trial balance and I'll turn it into your statements.",
  monthly: 'Adding each month here lets your board watch the year unfold.',
  operational: 'A few quick numbers here unlock your per-student metrics.',
  budget: 'Bring in your budget so we can compare plan vs. reality.',
  schedules: 'Add supporting schedules if your board packet needs them.',
  compliance: 'A few compliance answers prep you for a readiness check.',
}
const INTRO_COPY =
  "Hi, I'm Penny! I help you get your numbers in. There's just one thing we really need to start — your trial balance. Want me to show you?"
const CELEBRATE_COPY =
  "That's everything we need — your statements are ready to roll. You can always come back to add more anytime."
const ADVANCE_PREFIX = 'Nice, that one is in. '

const GuideMascot = forwardRef(function GuideMascot({ summary, onActiveStep }, ref) {
  const reduce = useReducedMotion()
  const nextStep = summary?.nextStep ?? null
  const allReady = !!summary?.allReady

  const [dismissed, setDismissed] = useState(() => readLS(DISMISS_KEY))
  const [introSeen, setIntroSeen] = useState(() => readLS(INTRO_KEY))
  const [introActive, setIntroActive] = useState(() => !readLS(INTRO_KEY))
  const [blink, setBlink] = useState(false)
  const [popKey, setPopKey] = useState(0)
  const prevStepRef = useRef(nextStep)
  const chevronTargetRef = useRef({ x: 0, y: 0, visible: false })
  const [chevron, setChevron] = useState({ x: 0, y: 0, visible: false })

  // Guided "Show me around" walkthrough — step through every card in order. Works
  // even when everything is already done (the old replay just re-set intro, which
  // the celebrate phase swallowed — so the button looked broken).
  const order = useMemo(() => summary?.order || [], [summary])
  const [tourIndex, setTourIndex] = useState(null) // null = not touring
  const touring = tourIndex != null && tourIndex >= 0 && tourIndex < order.length
  const activeStep = touring ? order[tourIndex] : allReady ? null : nextStep
  const startTour = () => {
    setDismissed(false)
    writeLS(DISMISS_KEY, false)
    setIntroActive(false)
    setTourIndex(order.length ? 0 : null)
  }
  const tourNext = () =>
    setTourIndex((i) => (i == null || i + 1 >= order.length ? null : i + 1))

  // Imperative replay handle for the hub header's "Show me around" button.
  useImperativeHandle(ref, () => ({ replay: startTour }))

  // PHASE is a pure function of summary + intro/dismiss flags (no setState here).
  const phase = useMemo(() => {
    if (introActive && !allReady) return 'intro'
    if (touring) return 'tour'
    if (allReady) return 'celebrate'
    if (nextStep) return 'pointing'
    return 'idle'
  }, [introActive, touring, allReady, nextStep])

  // Bubble copy derived from phase + active step.
  const bubble = useMemo(() => {
    if (phase === 'intro') return INTRO_COPY
    if (phase === 'celebrate') return CELEBRATE_COPY
    if (phase === 'tour') return HINTS[activeStep] || 'Here’s where this one goes.'
    if (phase === 'pointing') return HINTS[nextStep] || 'Let’s get this one in next.'
    return 'You’re all set here.'
  }, [phase, nextStep, activeStep])

  // Detect an advance (nextStep changed to a new value) -> quick pop + sparkle.
  useEffect(() => {
    const prev = prevStepRef.current
    if (prev && nextStep && prev !== nextStep) {
      setPopKey((k) => k + 1)
    }
    prevStepRef.current = nextStep
  }, [nextStep])

  // Tell the hub which card to highlight during the walkthrough so the card's glow
  // ring follows Penny; null when not touring (ring falls back to summary.nextStep).
  useEffect(() => {
    onActiveStep?.(touring ? activeStep : null)
  }, [touring, activeStep, onActiveStep])

  // Idle blink (randomized so multiple mounts don't sync). Skipped in reduced-motion.
  useEffect(() => {
    if (reduce || dismissed) return undefined
    let timer
    const loop = () => {
      timer = window.setTimeout(() => {
        setBlink(true)
        window.setTimeout(() => setBlink(false), 140)
        loop()
      }, 4000 + Math.random() * 3000)
    }
    loop()
    return () => window.clearTimeout(timer)
  }, [reduce, dismissed])

  // Glance direction: derive from the chevron target relative to Penny (bottom-right).
  const glance = chevron.visible ? (chevron.x < window.innerWidth - 180 ? -1 : 0) : 0

  // Measure the active card & (optionally) scroll it into view, then aim the chevron.
  // Microtask-deferred write; reduced-motion skips the scroll hijack + chevron.
  useEffect(() => {
    if (dismissed || !activeStep || (phase !== 'pointing' && phase !== 'tour')) {
      setChevron((c) => (c.visible ? { ...c, visible: false } : c))
      return undefined
    }
    let cancelled = false
    const aim = () => {
      const el = document.getElementById(`datahub-card-${activeStep}`)
      if (!el || cancelled) return
      const r = el.getBoundingClientRect()
      const onScreen = r.top >= 0 && r.bottom <= window.innerHeight
      if (!onScreen && !reduce) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      if (reduce) return
      // Aim at the card's right edge / vertical center.
      const target = { x: r.right - 24, y: r.top + r.height / 2, visible: true }
      chevronTargetRef.current = target
      if (!cancelled) setChevron(target)
    }
    const id = window.setTimeout(aim, 60)
    const onResize = () => aim()
    window.addEventListener('resize', onResize)
    return () => {
      cancelled = true
      window.clearTimeout(id)
      window.removeEventListener('resize', onResize)
    }
  }, [activeStep, phase, dismissed, reduce])

  const advanceFromIntro = () => {
    if (!introSeen) {
      setIntroSeen(true)
      writeLS(INTRO_KEY, true)
    }
    startTour()
  }

  const onDismiss = () => {
    setDismissed(true)
    writeLS(DISMISS_KEY, true)
    setChevron((c) => ({ ...c, visible: false }))
  }
  const onReopen = () => {
    setDismissed(false)
    writeLS(DISMISS_KEY, false)
  }

  // ── Minimized: a tiny floating coin tab (discoverable re-entry). ────────────
  if (dismissed) {
    return (
      <button
        type="button"
        onClick={onReopen}
        aria-label="Show Penny"
        className="fixed bottom-[148px] right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full border-2 border-gold/60 bg-navy text-gold shadow-navy-glow transition-transform hover:scale-105"
      >
        <Coins size={20} />
      </button>
    )
  }

  const celebrate = phase === 'celebrate'

  return (
    <>
      {/* Floating directional chevron (accent; decorative). */}
      {!reduce && chevron.visible && (phase === 'pointing' || phase === 'tour') && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none fixed z-30 text-gold drop-shadow"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1], x: [0, -6, 0] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          style={{ left: chevron.x, top: chevron.y - 14 }}
        >
          <ChevronRight size={28} strokeWidth={3} />
        </motion.div>
      )}

      {/* Confetti on celebrate. */}
      <AnimatePresence>
        {celebrate && !reduce && (
          <div aria-hidden="true" className="pointer-events-none fixed bottom-[110px] right-12 z-40">
            {Array.from({ length: 10 }).map((_, i) => (
              <motion.span
                key={i}
                className="absolute block h-2 w-2 rounded-[2px]"
                style={{ backgroundColor: i % 2 ? '#E8CC6A' : '#16243B' }}
                initial={{ opacity: 0, y: 0, x: 0, rotate: 0 }}
                animate={{
                  opacity: [1, 1, 0],
                  y: [-10, -60 - i * 6],
                  x: [(i - 5) * 8, (i - 5) * 16],
                  rotate: [0, 180 + i * 20],
                }}
                transition={{ duration: 1.2, delay: i * 0.04, ease: 'easeOut' }}
              />
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* Penny + bubble, stacked ABOVE the AssistantWidget (which sits ~bottom-5). */}
      <div className="fixed bottom-[88px] right-5 z-40 flex max-w-[min(20rem,calc(100vw-2.5rem))] flex-col items-end">
        {/* Speech bubble (the meaning carrier). */}
        <AnimatePresence>
          <motion.div
            key={`${phase}-${activeStep}`}
            role="status"
            aria-live="polite"
            initial={reduce ? false : { opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, y: 8, scale: 0.96 }}
            className="relative mb-2 rounded-2xl rounded-br-md border-2 border-gold/40 bg-white px-4 py-3 shadow-card"
          >
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Hide Penny"
              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-rule bg-white text-muted shadow-sm transition-colors hover:text-navy"
            >
              <X size={13} />
            </button>
            <p className="pr-2 text-[13px] leading-relaxed text-navy">{bubble}</p>
            {phase === 'intro' && (
              <button
                type="button"
                onClick={advanceFromIntro}
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-gold-gradient px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-navy shadow-glow transition-transform hover:-translate-y-0.5"
              >
                Show me <ChevronRight size={14} />
              </button>
            )}
            {phase === 'tour' && (
              <div className="mt-2.5 flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Step {tourIndex + 1} of {order.length}
                </span>
                <button
                  type="button"
                  onClick={tourNext}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gold-gradient px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-navy shadow-glow transition-transform hover:-translate-y-0.5"
                >
                  {tourIndex + 1 >= order.length ? 'Done' : 'Next'} <ChevronRight size={14} />
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* The coin. Bobs idly; tilts toward the target; pops on advance. */}
        <motion.div
          key={popKey}
          className="origin-bottom"
          animate={
            reduce
              ? undefined
              : celebrate
                ? { y: [0, -10, 0, -6, 0] }
                : { y: [0, -4, 0], rotate: chevron.visible ? -8 : 0 }
          }
          transition={
            reduce
              ? undefined
              : celebrate
                ? { duration: 0.7 }
                : { y: { duration: 3, repeat: Infinity, ease: 'easeInOut' }, rotate: { duration: 0.5 } }
          }
        >
          <motion.div
            animate={reduce ? undefined : { scale: [1, 1.12, 1] }}
            transition={{ duration: 0.4 }}
          >
            <PennyAvatar size={56} glance={glance} blink={blink} celebrate={celebrate} />
          </motion.div>
        </motion.div>
      </div>
    </>
  )
})

export default GuideMascot
