// ─────────────────────────────────────────────────────────────────────────────
// Penny — ONE global floating gold coin (mounted once in AuthedLayout), replacing
// the old bottom-right "Ask FinRep" launcher AND the data-hub-only guide mascot.
// Penny plays two roles:
//   • GUIDE: when usePenny() has an active guide, Penny measures the target element
//     by id, scrolls it into view if off-screen, GLIDES from her home corner
//     (bottom-LEFT) to just beside the card, and shows a speech bubble (message +
//     optional CTA + tour Step n/m + Next/Done + dismiss). A gold chevron points at
//     the card.
//   • AI: clicking the coin opens "Penny AI" (the streaming PennyChat) and clears
//     any active guide — Penny IS the assistant now.
//
// HOOKS DISCIPLINE: the ONLY setState-in-effect are `box` (genuine DOM measurement,
// mirroring the old GuideMascot) and `blink` (timer). Everything else — the active
// step, travel offset, chevron position, glance — is derived during render via
// const/useMemo, never stored in state. All hooks run unconditionally; Penny ALWAYS
// renders (no !activeId early return here — that guard lives only in PennyChat).
//
// ACCESSIBILITY: the bubble is role=status aria-live=polite; the coin is a real
// <button> with aria-label + aria-expanded; the avatar/chevron are aria-hidden.
// Full reduced-motion support: no travel/bob/blink/chevron/scroll-hijack — the
// bubble simply appears at the home corner so guidance is still fully available.
// PRINT: everything is wrapped in .no-print.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { X, ChevronRight, ChevronLeft } from 'lucide-react'
import { usePenny } from '../../context/PennyContext.jsx'
import PennyAvatar from './PennyAvatar.jsx'
import PennyChat from './PennyChat.jsx'

const MARGIN = 12 // viewport edge clamp
const HOME_X = 20 // home corner inset (matches bottom-5 left-5)
const HOME_Y = 20

export default function Penny() {
  const reduce = useReducedMotion()
  const { chatOpen, toggleChat, closeChat, guide, advance, dismissGuide } = usePenny()

  // The two sanctioned setState-in-effect writes: measured target rect + blink.
  const [box, setBox] = useState(null)
  const [blink, setBlink] = useState(false)

  // Penny renders smaller on phones (the 64px coin overlapped cards on mobile).
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const on = () => setCompact(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const coinPx = compact ? 46 : 64
  const COIN = coinPx / 2 // half the rendered coin size, used for travel geometry

  // DERIVED (never stored in state via effect).
  const step = guide ? guide.steps[guide.index] : null
  // Agent walkthroughs always show Step n/m + Done (even single-step) so the user
  // can dismiss; page tours only show the strip when multi-step.
  const touring = !!guide && (guide.steps.length > 1 || guide.agent)

  // ── Measurement effect (the one allowed setState-in-effect for `box`). ────────
  // Reads the target element's rect, scrolls it into view if off-screen, and keeps
  // the rect fresh on resize/scroll. Mirrors the old GuideMascot measurement.
  useEffect(() => {
    if (!step || chatOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: DOM-measurement effect (see header); resetting the rect when there's no step must be synchronous to avoid a stale highlight box flashing.
      setBox(null)
      return undefined
    }
    let cancelled = false
    // `allowScroll` is true ONLY for the initial measure passes (one-shot per step):
    // resize/scroll listeners re-measure the rect but never re-trigger scrollIntoView,
    // so a target taller than the viewport can't trap the page in a scroll-fight.
    const measure = (allowScroll) => {
      const el = document.getElementById(step.targetId)
      if (!el || cancelled) return
      const r = el.getBoundingClientRect()
      // A zero-area rect means the target is present in the DOM but not visible in
      // this layout (e.g. the desktop nav is `hidden lg:flex` on mobile). Treat it
      // like a not-yet-mounted target: leave Penny parked rather than glide to (0,0).
      if (r.width === 0 && r.height === 0) return
      const onScreen = r.top >= 0 && r.bottom <= window.innerHeight
      if (allowScroll && !onScreen && !reduce) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      if (cancelled) return
      setBox({
        top: r.top,
        left: r.left,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      })
    }
    // Bounded retry schedule (idempotent measure): an agent guide may navigate to a
    // NEW page/modal first, so the target can mount a beat after the step changes.
    // These passes re-measure until it appears, then settle after the smooth scroll.
    const RETRY_MS = [60, 220, 420, 700, 1100, 1600]
    const timers = RETRY_MS.map((ms) => window.setTimeout(() => measure(true), ms))
    const onMove = () => measure(false)
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, { passive: true })
    return () => {
      cancelled = true
      timers.forEach((t) => window.clearTimeout(t))
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove)
    }
  }, [step, chatOpen, reduce])

  // ── Idle blink (randomized; skipped in reduced-motion). ───────────────────────
  useEffect(() => {
    if (reduce) return undefined
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
  }, [reduce])

  // ── Travel geometry (pure; derived from box). Returns the coin's offset from its
  // home corner so the travelling wrapper can animate x/y. ──────────────────────
  const travel = useMemo(() => {
    if (!box || reduce || typeof window === 'undefined') {
      return { x: 0, y: 0, parked: true, placeRight: false }
    }
    const vw = window.innerWidth
    const vh = window.innerHeight
    let placeRight = false
    // Desired coin CENTER just LEFT of the card.
    let cx = box.left - 18 - COIN
    const cy0 = box.top + box.height / 2
    if (cx - COIN < 16) {
      placeRight = true
      cx = box.right + 18 + COIN
    }
    cx = Math.max(MARGIN + COIN, Math.min(vw - MARGIN - COIN, cx))
    const cy = Math.max(MARGIN + 150, Math.min(vh - MARGIN - COIN, cy0)) // reserve 150px for bubble
    const homeCx = HOME_X + COIN
    const homeCy = vh - HOME_Y - COIN
    return { x: cx - homeCx, y: cy - homeCy, parked: false, placeRight }
  }, [box, reduce, COIN])

  // Glance toward the card (or straight ahead when parked).
  const glance = box ? (travel.placeRight ? -1 : 1) : 0

  const spring = reduce
    ? { duration: 0 }
    : { type: 'spring', stiffness: 220, damping: 26, mass: 0.9 }

  const showBubble = step && !chatOpen
  const lastIndex = guide ? guide.steps.length - 1 : 0
  const isLast = guide ? guide.index >= lastIndex : true

  return (
    <div className="no-print">
      {/* (i) Chevron — anchored to the card edge, pointing at it. */}
      {!reduce && box && step && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none fixed z-[54] text-gold drop-shadow"
          style={{
            left: travel.placeRight ? box.right + 2 : box.left - 26,
            top: box.top + box.height / 2 - 14,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1], x: travel.placeRight ? [0, 6, 0] : [0, -6, 0] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        >
          {travel.placeRight ? (
            <ChevronLeft size={28} strokeWidth={3} />
          ) : (
            <ChevronRight size={28} strokeWidth={3} />
          )}
        </motion.div>
      )}

      {/* (ii) Travelling wrapper — glides from the home corner to beside the card. */}
      <motion.div
        className="pointer-events-none fixed bottom-5 left-5 z-[55]"
        animate={reduce ? { x: 0, y: 0 } : { x: travel.x, y: travel.y }}
        transition={spring}
      >
        {/* Speech bubble. */}
        <AnimatePresence>
          {showBubble && (
            <motion.div
              key={`${guide.index}-${step.targetId}`}
              role="status"
              aria-live="polite"
              initial={reduce ? false : { opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? undefined : { opacity: 0, y: 8, scale: 0.96 }}
              className={`pointer-events-auto absolute bottom-[72px] w-[min(19rem,calc(100vw-3rem))] rounded-2xl border-2 border-gold/40 bg-white px-4 py-3 shadow-card ${
                travel.placeRight ? 'right-0 rounded-br-md' : 'left-0 rounded-bl-md'
              }`}
            >
              <button
                type="button"
                onClick={dismissGuide}
                aria-label="Dismiss Penny"
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-rule bg-white text-muted shadow-sm transition-colors hover:text-navy"
              >
                <X size={13} />
              </button>
              <p className="pr-2 text-[15px] leading-relaxed text-navy">{step.message}</p>
              {step.action && (
                <button
                  type="button"
                  onClick={step.action.onClick}
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-gold-gradient px-3 py-1.5 text-[14px] font-bold uppercase tracking-[0.08em] text-navy shadow-glow transition-transform hover:-translate-y-0.5"
                >
                  {step.action.label} <ChevronRight size={14} />
                </button>
              )}
              {step.ctaLabel && (
                <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-gold/15 px-2.5 py-0.5 text-[12.5px] font-semibold text-gold">
                  <ChevronRight size={12} aria-hidden /> {step.ctaLabel}
                </p>
              )}
              {touring && (
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
                    Step {guide.index + 1} of {guide.steps.length}
                  </span>
                  <button
                    type="button"
                    onClick={advance}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gold-gradient px-3 py-1.5 text-[14px] font-bold uppercase tracking-[0.08em] text-navy shadow-glow transition-transform hover:-translate-y-0.5"
                  >
                    {isLast ? 'Done' : 'Next'} <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Inner bob (composes with travel) — stops while travelling and at reduce. */}
        <motion.div
          animate={reduce || !travel.parked ? { y: 0 } : { y: [0, -5, 0] }}
          transition={
            reduce || !travel.parked
              ? { duration: 0 }
              : { duration: 3, repeat: Infinity, ease: 'easeInOut' }
          }
        >
          <button
            type="button"
            onClick={() => {
              dismissGuide()
              toggleChat()
            }}
            aria-label={chatOpen ? 'Close Penny AI' : 'Open Penny AI'}
            aria-expanded={chatOpen}
            className="pointer-events-auto relative block rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
          >
            <PennyAvatar size={coinPx} glance={glance} blink={blink} active={chatOpen} />
          </button>
        </motion.div>
      </motion.div>

      {/* (iii) Penny AI chat — controlled, anchored bottom-left above the coin. */}
      <PennyChat open={chatOpen} onClose={closeChat} />
    </div>
  )
}
