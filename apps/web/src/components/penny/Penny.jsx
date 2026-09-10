// ─────────────────────────────────────────────────────────────────────────────
// Penny — ONE global floating mascot (mounted once in AuthedLayout), replacing
// the old bottom-right "Ask FinRep" launcher AND the data-hub-only guide mascot.
// "Penny" is the internal codename; what the user sees is KYRO the owl
// (KyroDove via PennyAvatar). KYRO plays two roles:
//   • GUIDE: when usePenny() has an active guide, KYRO measures the target element
//     by id, scrolls it into view if off-screen, FLIES from its home corner
//     (bottom-right) in an arc to just beside the card (flying → gliding for the
//     last ~200ms → perched with a settle bounce), and shows a speech bubble
//     (message + optional CTA + tour Step n/m + Next/Done + dismiss). A gold
//     chevron points at the card. KYRO faces its direction of travel while
//     flying, faces the card once perched, and faces LEFT into the page at home.
//   • AI: clicking the owl opens "KYRO AI" (the streaming PennyChat) and clears
//     any active guide — KYRO IS the assistant.
//
// HOOKS DISCIPLINE: the ONLY setState-in-effect are `box` (genuine DOM
// measurement, mirroring the old GuideMascot), `flight` (the flying → gliding →
// perched phase machine, keyed on the travel target) and `bob` (timer). Everything
// else — the active step, travel offset, flight duration/arc/facing, chevron
// position — is derived during render via const/useMemo, never stored in state.
// All hooks run unconditionally; Penny ALWAYS renders (no !activeId early return
// here — that guard lives only in PennyChat).
//
// GEOMETRY: the owl is a BOX (height doveH, width doveH × aspect) whose three
// sprite states share one anchor point inside it, so the box position is all the
// travel math needs: bubble/chevron alignment matches the old coin behaviour.
//
// ACCESSIBILITY: the bubble is role=status aria-live=polite; the owl is a real
// <button> with aria-label + aria-expanded; the avatar/chevron are aria-hidden.
// Reduced motion: no flight/bob/sprite/smooth-scroll — the target is jumped into
// view instantly and the owl is placed beside it, perched, so guidance is still
// fully available. Small re-targets while perched (a scroll nudging the measured
// rect by less than one owl-height) tween in place without a take-off.
// PRINT: everything is wrapped in .no-print.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import { X, ChevronRight, ChevronLeft } from 'lucide-react'
import { usePenny } from '../../context/PennyContext.jsx'
import PennyAvatar from './PennyAvatar.jsx'
import { useKyroGeometry } from './KyroDove.jsx'
import PennyChat from './PennyChat.jsx'

const MARGIN = 12 // viewport edge clamp
const HOME_X = 20 // home corner inset (matches bottom-5 right-5, ~20px)
const HOME_Y = 20
const SPEED = 900 // px/s cruising speed → duration = clamp(dist/SPEED, 0.6, 1.4)
const GLIDE_S = 0.2 // the last 200ms of every flight are a glide

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const flightFor = (dx, dy) => {
  const dist = Math.hypot(dx, dy)
  return {
    dist,
    dur: clamp(dist / SPEED, 0.6, 1.4),
    lift: clamp(dist * 0.12, 24, 80),
  }
}

export default function Penny() {
  const reduce = useReducedMotion()
  const { pathname } = useLocation()
  const { chatOpen, toggleChat, closeChat, guide, advance, dismissGuide } = usePenny()
  const geom = useKyroGeometry()

  // The sanctioned setState-in-effect writes: measured target rect, flight phase, bob.
  const [box, setBox] = useState(null)
  const [flight, setFlight] = useState({
    phase: 'perched',
    fromX: 0,
    fromY: 0,
    toX: 0,
    toY: 0,
    moved: false,
    hop: false, // small perched re-target: tween without a wingbeat/arc
  })
  const [bob, setBob] = useState(false)

  // KYRO renders smaller on phones (the 64px mascot overlapped cards on mobile).
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const on = () => setCompact(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const doveH = compact ? 46 : 64
  const H = doveH
  const W = Math.round(doveH * geom.aspect)

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
      // like a not-yet-mounted target: leave KYRO parked rather than fly to (0,0).
      if (r.width === 0 && r.height === 0) return
      const onScreen = r.top >= 0 && r.bottom <= window.innerHeight
      if (allowScroll && !onScreen) {
        // An instant jump is not motion — reduced-motion users still get the
        // target on screen (otherwise the owl would perch beside a clamped edge).
        el.scrollIntoView({ behavior: reduce ? 'instant' : 'smooth', block: 'center' })
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

  // ── Travel geometry (pure; derived from box). Returns the owl BOX's offset from
  // its home corner so the travelling wrapper can animate x/y. ──────────────────
  const travel = useMemo(() => {
    if (!box || typeof window === 'undefined') {
      return { x: 0, y: 0, parked: true, placeRight: false }
    }
    const vw = window.innerWidth
    const vh = window.innerHeight
    let placeRight = false
    // Desired box just LEFT of the card, vertically centred on it.
    let bl = box.left - 18 - W
    const cy0 = box.top + box.height / 2
    let bt = cy0 - H / 2
    if (bl < 16) {
      placeRight = true
      bl = box.right + 18
    }
    bl = clamp(bl, MARGIN, vw - MARGIN - W)
    bt = clamp(bt, MARGIN + 150, vh - MARGIN - H) // reserve 150px for the bubble
    // Home corner is bottom-RIGHT (the box sits HOME_X in from the right edge).
    // The flight transform (bl − homeL) then carries KYRO to a target — including
    // nav items in the LEFT sidebar — and back home to the right.
    const homeL = vw - HOME_X - W
    const homeT = vh - HOME_Y - H
    return { x: bl - homeL, y: bt - homeT, parked: false, placeRight }
  }, [box, W, H])

  // ── Flight phase machine (sanctioned setState-in-effect, keyed on the travel
  // target): flying → gliding (last GLIDE_S) → perched. `lastRef` remembers the
  // previous target so the effect is a no-op when nothing moved (mount, re-measure
  // to the same spot). Under reduced motion the owl is placed instantly, perched.
  const lastRef = useRef({ x: 0, y: 0 })
  const phaseRef = useRef('perched')
  useEffect(() => {
    phaseRef.current = flight.phase
  }, [flight.phase])
  useEffect(() => {
    const prev = lastRef.current
    if (prev.x === travel.x && prev.y === travel.y) return undefined
    lastRef.current = { x: travel.x, y: travel.y }
    const dx = travel.x - prev.x
    const dy = travel.y - prev.y
    const next = { fromX: prev.x, fromY: prev.y, toX: travel.x, toY: travel.y, moved: true }
    // Intentional setState-in-effect (see header): the target and phase must change
    // in the same commit so framer never starts a flight with a stale duration.
    if (reduce) {
      setFlight({ ...next, phase: 'perched', hop: false })
      return undefined
    }
    // Small re-target while perched (scroll/resize nudged the rect): tween in
    // place, no wingbeat, no arc.
    if (phaseRef.current === 'perched' && Math.hypot(dx, dy) < H) {
      setFlight({ ...next, phase: 'perched', hop: true })
      return undefined
    }
    setFlight({ ...next, phase: 'flying', hop: false })
    const { dur } = flightFor(dx, dy)
    const t1 = window.setTimeout(
      () => setFlight((f) => ({ ...f, phase: 'gliding' })),
      (dur - GLIDE_S) * 1000,
    )
    const t2 = window.setTimeout(() => setFlight((f) => ({ ...f, phase: 'perched' })), dur * 1000)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [travel.x, travel.y, reduce, H])

  // ── Idle head-bob: a 260ms burst every 5–9s while perched (skipped in reduce). ─
  useEffect(() => {
    if (reduce || flight.phase !== 'perched') return undefined
    let timer
    let off
    const loop = () => {
      timer = window.setTimeout(() => {
        setBob(true)
        off = window.setTimeout(() => setBob(false), 260)
        loop()
      }, 5000 + Math.random() * 4000)
    }
    loop()
    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(off)
    }
  }, [reduce, flight.phase])

  // Derived flight numbers for THIS leg (from → to).
  const dx = flight.toX - flight.fromX
  const dy = flight.toY - flight.fromY
  const { dur, lift } = flightFor(dx, dy)
  const phase = reduce ? 'perched' : flight.phase
  // Facing: direction of travel while airborne; once perched, toward the card
  // (or LEFT into the page when parked at home).
  const facing =
    phase !== 'perched' && dx !== 0
      ? dx < 0
        ? 'left'
        : 'right'
      : box
        ? travel.placeRight
          ? 'left'
          : 'right'
        : 'left'

  const showBubble = step && !chatOpen
  const lastIndex = guide ? guide.steps.length - 1 : 0
  const isLast = guide ? guide.index >= lastIndex : true

  // On the full-page KYRO Studio (/penny) the page mounts its OWN usePennyChat
  // engine instance. Suppress the floating owl here (AFTER all hooks, so hook
  // order is stable) so there's exactly one engine + one `penny:ai-ask` listener.
  if (pathname.startsWith('/penny')) return null

  return (
    <div className="no-print">
      {/* (i) Chevron — anchored to the card edge, pointing at it (static in reduce). */}
      {box && step && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none fixed z-[54] text-penny drop-shadow"
          style={{
            left: travel.placeRight ? box.right + 2 : box.left - 26,
            top: box.top + box.height / 2 - 14,
          }}
          initial={{ opacity: 0 }}
          animate={
            reduce
              ? { opacity: 1 }
              : { opacity: [0, 1, 1], x: travel.placeRight ? [0, 6, 0] : [0, -6, 0] }
          }
          transition={
            reduce ? { duration: 0 } : { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }
          }
        >
          {travel.placeRight ? (
            <ChevronLeft size={28} strokeWidth={3} />
          ) : (
            <ChevronRight size={28} strokeWidth={3} />
          )}
        </motion.div>
      )}

      {/* (ii) Travelling wrapper — flies in an arc from the home corner to beside
          the card. `[null, …]` starts y from wherever the owl is NOW, so
          home↔card↔card all arc; the mid keyframe is the lift. */}
      <motion.div
        className="pointer-events-none fixed bottom-5 right-5 z-[55]"
        animate={
          reduce
            ? { x: travel.x, y: travel.y }
            : flight.hop
              ? { x: flight.toX, y: flight.toY }
              : { x: flight.toX, y: [null, Math.min(flight.fromY, flight.toY) - lift, flight.toY] }
        }
        transition={
          reduce
            ? { duration: 0 }
            : flight.hop
              ? { duration: 0.3, ease: 'easeOut' }
              : {
                  x: { duration: dur, ease: 'easeInOut' },
                  y: { duration: dur, times: [0, 0.45, 1], ease: ['easeOut', 'easeIn'] },
                }
        }
      >
        {/* Speech bubble. z-[1]: the owl's wings overflow its box sideways and
            upward-ish while airborne, so the bubble (an earlier sibling) must
            paint above them — a wingtip passes BEHIND the bubble, never over it. */}
        <AnimatePresence>
          {showBubble && (
            <motion.div
              key={`${guide.index}-${step.targetId}`}
              role="status"
              aria-live="polite"
              initial={reduce ? false : { opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? undefined : { opacity: 0, y: 8, scale: 0.96 }}
              style={{ bottom: H + 8 }}
              className={`pointer-events-auto absolute z-[1] w-[min(19rem,calc(100vw-3rem))] rounded-2xl border-2 border-penny/40 bg-white px-4 py-3 shadow-card ${
                travel.placeRight || travel.parked ? 'right-0 rounded-br-md' : 'left-0 rounded-bl-md'
              }`}
            >
              <button
                type="button"
                onClick={dismissGuide}
                aria-label="Dismiss KYRO"
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-rule bg-white text-muted shadow-sm transition-colors hover:text-navy"
              >
                <X size={13} />
              </button>
              <p className="pr-2 text-[15px] leading-relaxed text-navy">{step.message}</p>
              {step.action && (
                <button
                  type="button"
                  onClick={step.action.onClick}
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-penny-gradient px-3 py-1.5 text-[14px] font-bold uppercase tracking-[0.08em] text-navy shadow-penny-glow transition-transform hover:-translate-y-0.5"
                >
                  {step.action.label} <ChevronRight size={14} />
                </button>
              )}
              {step.ctaLabel && (
                <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-penny/15 px-2.5 py-0.5 text-[12.5px] font-semibold text-penny">
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
                    className="inline-flex items-center gap-1.5 rounded-lg bg-penny-gradient px-3 py-1.5 text-[14px] font-bold uppercase tracking-[0.08em] text-navy shadow-penny-glow transition-transform hover:-translate-y-0.5"
                  >
                    {isLast ? 'Done' : 'Next'} <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Landing settle (one-shot CSS keyframe when a flight ends), then the
            parked 3s bob loop + the randomized head-bob — all composed, all off
            in reduce. */}
        <div
          className={
            !reduce && phase === 'perched' && flight.moved
              ? 'motion-safe:animate-[kyro-settle_280ms_ease-out_1]'
              : ''
          }
        >
          <motion.div
            animate={reduce || !travel.parked || phase !== 'perched' ? { y: 0 } : { y: [0, -5, 0] }}
            transition={
              reduce || !travel.parked || phase !== 'perched'
                ? { duration: 0 }
                : { duration: 3, repeat: Infinity, ease: 'easeInOut' }
            }
          >
            <motion.div
              animate={bob && !reduce ? { y: [0, -2, 0], rotate: [0, -3, 0] } : { y: 0, rotate: 0 }}
              transition={{ duration: 0.26, ease: 'easeInOut' }}
              style={{ transformOrigin: '60% 90%' }}
            >
              <button
                type="button"
                data-testid="kyro-dove"
                onClick={() => {
                  dismissGuide()
                  toggleChat()
                }}
                aria-label={chatOpen ? 'Close KYRO AI' : 'Open KYRO AI'}
                aria-expanded={chatOpen}
                className="pointer-events-auto relative block rounded-2xl transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-penny/60"
              >
                <PennyAvatar size={doveH} state={phase} facing={facing} active={chatOpen} />
              </button>
            </motion.div>
          </motion.div>
        </div>
      </motion.div>

      {/* (iii) KYRO AI chat — controlled, anchored bottom-right above the owl. */}
      <PennyChat open={chatOpen} onClose={closeChat} />
    </div>
  )
}
