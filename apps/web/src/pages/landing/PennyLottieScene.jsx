// ─────────────────────────────────────────────────────────────────────────────
// PennyLottieScene — a Duolingo-style scroll-ACTIVATED character vignette,
// hand-built in SVG + framer-motion (our free "Lottie"): the same mechanics a
// Lottie file gives you — keyframed vector groups played when the section
// scrolls into view — authored in code instead of After Effects.
//
// The scene (plays on every viewport entry, ~2.2s, then settles into idle):
//   1. Penny DROPS in with a spring + squash-and-stretch landing
//   2. gold sparkle-stars pop around her (staggered)
//   3. two mini coins arc out of the landing bounce
//   4. a sparkline DRAWS itself beneath her (pathLength) and its end-dot glows
//   5. idle: a gentle bob + periodic blinks while she stays in view
//
// Trigger = framer's useInView (IntersectionObserver under the hood — exactly
// Duolingo's mechanism; they use rootMargin for their fixed header, we use a
// -80px bottom margin so the play starts once she's genuinely on screen).
// Reduced motion: the composed final frame renders statically. Decorative only
// (aria-hidden); no new dependencies.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import PennyAvatar from '../../components/penny/PennyAvatar.jsx'

// Four-point sparkle path (cx, cy, r) — the classic glint.
const star = (cx, cy, r) => {
  const w = r * 0.32
  return `M ${cx} ${cy - r} C ${cx + w} ${cy - w}, ${cx + w} ${cy - w}, ${cx + r} ${cy} C ${cx + w} ${cy + w}, ${cx + w} ${cy + w}, ${cx} ${cy + r} C ${cx - w} ${cy + w}, ${cx - w} ${cy + w}, ${cx - r} ${cy} C ${cx - w} ${cy - w}, ${cx - w} ${cy - w}, ${cx} ${cy - r} Z`
}

// Sparkles: position (in the 320×200 stage), size, and entry delay.
const SPARKLES = [
  { x: 74, y: 52, r: 9, delay: 0.62 },
  { x: 250, y: 40, r: 7, delay: 0.74 },
  { x: 42, y: 118, r: 5.5, delay: 0.86 },
  { x: 276, y: 108, r: 6.5, delay: 0.95 },
  { x: 226, y: 156, r: 4.5, delay: 1.05 },
]

// Mini coins that arc out of the landing bounce: horizontal drift + peak height.
const COINS = [
  { dx: -74, peak: -66, delay: 0.5 },
  { dx: 78, peak: -54, delay: 0.56 },
]

export default function PennyLottieScene() {
  const reduce = useReducedMotion()
  const ref = useRef(null)
  // Duolingo's trigger: IntersectionObserver. amount 0.6 + bottom margin so the
  // scene starts once it's properly on screen, and RE-ARMS after leaving.
  const inView = useInView(ref, { amount: 0.6, margin: '0px 0px -80px 0px' })
  const [blink, setBlink] = useState(false)

  // Periodic double-blink while on screen (the "alive at idle" beat).
  useEffect(() => {
    if (!inView || reduce) return undefined
    let t2
    const t = setInterval(() => {
      setBlink(true)
      t2 = setTimeout(() => setBlink(false), 160)
    }, 3400)
    return () => {
      clearInterval(t)
      clearTimeout(t2)
    }
  }, [inView, reduce])

  // Reduced motion (or SSR safety): the settled final frame, no choreography.
  if (reduce) {
    return (
      <div aria-hidden="true" className="mx-auto mb-2 flex h-[150px] w-[320px] items-end justify-center">
        <PennyAvatar size={96} />
      </div>
    )
  }

  return (
    <div ref={ref} aria-hidden="true" className="relative mx-auto mb-2 h-[150px] w-[320px]">
      {/* ── Sparkline that draws itself beneath the landing spot ── */}
      <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 320 200">
        <motion.path
          d="M 48 176 L 96 168 L 136 172 L 178 152 L 224 158 L 272 132"
          fill="none"
          stroke="rgba(212,180,122,0.85)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={inView ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
          transition={{ duration: 0.9, delay: 0.75, ease: 'easeOut' }}
        />
        {/* Glowing end-dot lands as the line finishes. */}
        <motion.circle
          cx="272"
          cy="132"
          r="5"
          fill="#f4dd8b"
          initial={false}
          animate={inView ? { scale: [0, 1.5, 1], opacity: 1 } : { scale: 0, opacity: 0 }}
          transition={{ duration: 0.35, delay: 1.6 }}
          style={{ transformOrigin: '272px 132px', filter: 'drop-shadow(0 0 8px rgba(244,221,139,0.9))' }}
        />

        {/* ── Sparkle-stars popping around Penny ── */}
        {SPARKLES.map((s, i) => (
          <motion.path
            key={i}
            d={star(s.x, s.y, s.r)}
            fill="#f4dd8b"
            initial={false}
            animate={
              inView
                ? { scale: [0, 1.25, 1], opacity: [0, 1, 0.85], rotate: [0, 24] }
                : { scale: 0, opacity: 0, rotate: 0 }
            }
            transition={{ duration: 0.5, delay: s.delay, ease: 'easeOut' }}
            style={{ transformOrigin: `${s.x}px ${s.y}px` }}
          />
        ))}

        {/* ── Mini coins arcing out of the landing bounce ── */}
        {COINS.map((c, i) => (
          <motion.g key={i} initial={false}>
            <motion.circle
              cx="160"
              cy="150"
              r="9"
              fill="url(#penny-mini-coin)"
              stroke="#9a781b"
              strokeWidth="1.5"
              initial={false}
              animate={
                inView
                  ? { x: [0, c.dx * 0.6, c.dx], y: [0, c.peak, 6], opacity: [0, 1, 0], scale: [0.4, 1, 0.85] }
                  : { x: 0, y: 0, opacity: 0, scale: 0.4 }
              }
              transition={{ duration: 1.05, delay: c.delay, ease: 'easeOut' }}
            />
          </motion.g>
        ))}
        <defs>
          <radialGradient id="penny-mini-coin" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#fff7da" />
            <stop offset="55%" stopColor="#e2be55" />
            <stop offset="100%" stopColor="#c6982a" />
          </radialGradient>
        </defs>
      </svg>

      {/* ── Penny: drop in → squash-and-stretch landing → idle bob ── */}
      <motion.div
        className="absolute bottom-2 left-1/2 -ml-12"
        initial={false}
        animate={
          inView
            ? {
                y: [-130, 0, -16, 0],
                scaleY: [1, 0.82, 1.06, 1],
                scaleX: [1, 1.14, 0.96, 1],
                opacity: 1,
              }
            : { y: -130, scaleY: 1, scaleX: 1, opacity: 0 }
        }
        transition={
          inView
            ? { duration: 0.85, times: [0, 0.55, 0.8, 1], ease: ['easeIn', 'easeOut', 'easeIn', 'easeOut'] }
            : { duration: 0.2 }
        }
        style={{ transformOrigin: '50% 100%' }}
      >
        {/* Idle bob rides ON TOP of the entry (separate wrapper so transforms compose). */}
        <motion.div
          animate={inView ? { y: [0, -5, 0] } : { y: 0 }}
          transition={inView ? { duration: 2.6, delay: 1.1, repeat: Infinity, ease: 'easeInOut' } : undefined}
        >
          <PennyAvatar size={96} blink={blink} />
        </motion.div>
      </motion.div>

      {/* Landing shadow: squashes when she lands, breathes with the bob. */}
      <motion.div
        className="absolute bottom-0 left-1/2 h-2.5 w-20 -translate-x-1/2 rounded-full bg-black/30 blur-[3px]"
        initial={false}
        animate={inView ? { scaleX: [0.3, 1.25, 0.95, 1], opacity: [0, 0.8, 0.6, 0.65] } : { scaleX: 0.3, opacity: 0 }}
        transition={{ duration: 0.85, times: [0, 0.55, 0.8, 1] }}
      />
    </div>
  )
}
