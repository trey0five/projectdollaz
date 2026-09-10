// ─────────────────────────────────────────────────────────────────────────────
// PennyLottieScene — a Duolingo-style scroll-ACTIVATED character vignette,
// hand-built in SVG + framer-motion (our free "Lottie"): the same mechanics a
// Lottie file gives you — keyframed vector groups played when the section
// scrolls into view — authored in code instead of After Effects. ("Penny" is the
// internal codename; the character is KYRO the owl.)
//
// The scene (plays on every viewport entry, ~2.2s, then settles into idle):
//   1. KYRO FLIES in from off-left (wingbeat sprite), glides for the last beat,
//      then lands with a squash-and-stretch touchdown
//   2. gold sparkle-stars pop around the landing spot (staggered)
//   3. two loose feathers drift down out of the touchdown
//   4. a sparkline DRAWS itself beneath the owl (pathLength) and its end-dot glows
//   5. idle: a gentle bob while the owl stays in view (the perched sprite breathes)
//
// Trigger = framer's useInView (IntersectionObserver under the hood — exactly
// Duolingo's mechanism; they use rootMargin for their fixed header, we use a
// -80px bottom margin so the play starts once the scene is genuinely on screen).
// The flight phase (flying → gliding → perched) is a small timer-driven state
// keyed on `inView`. Reduced motion: the composed final frame renders statically
// (perched, no sprite). Decorative only (aria-hidden); no new dependencies.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import PennyAvatar from '../../components/penny/PennyAvatar.jsx'
import { FALLBACK_GEOMETRY } from '../../components/penny/kyroDoveManifest.js'

// The touchdown squash pivots on the bird's FEET (a fraction of the owl box).
const FEET_ORIGIN = `${(FALLBACK_GEOMETRY.feet.x / FALLBACK_GEOMETRY.aspect * 100).toFixed(1)}% ${(FALLBACK_GEOMETRY.feet.y * 100).toFixed(1)}%`

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

// Loose feathers shed on touchdown: start point, horizontal drift, fall, delay.
const FEATHERS = [
  { x: 128, y: 96, dx: -58, dy: 62, delay: 0.72, tilt: -35 },
  { x: 196, y: 104, dx: 52, dy: 56, delay: 0.8, tilt: 30 },
]

// Flight timing (seconds after `inView`): wingbeat → glide → touchdown.
const GLIDE_AT = 0.65
const LAND_AT = 0.85

export default function PennyLottieScene() {
  const reduce = useReducedMotion()
  const ref = useRef(null)
  // Duolingo's trigger: IntersectionObserver. amount 0.6 + bottom margin so the
  // scene starts once it's properly on screen, and RE-ARMS after leaving.
  const inView = useInView(ref, { amount: 0.6, margin: '0px 0px -80px 0px' })
  const [phase, setPhase] = useState('flying')

  // Flight phase machine: timer-driven (not setState-for-derived-state), re-armed
  // on every viewport entry so the fly-in replays with the rest of the scene.
  useEffect(() => {
    if (reduce) return undefined
    if (!inView) {
      const t = setTimeout(() => setPhase('flying'), 0)
      return () => clearTimeout(t)
    }
    const t1 = setTimeout(() => setPhase('gliding'), GLIDE_AT * 1000)
    const t2 = setTimeout(() => setPhase('perched'), LAND_AT * 1000)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [inView, reduce])

  // Reduced motion (or SSR safety): the settled final frame, no choreography.
  if (reduce) {
    return (
      <div aria-hidden="true" className="mx-auto mb-2 flex h-[150px] w-[320px] items-end justify-center">
        <PennyAvatar size={96} state="perched" facing="right" />
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

        {/* ── Sparkle-stars popping around the landing spot ── */}
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

        {/* ── Loose feathers drifting down out of the touchdown ── */}
        {FEATHERS.map((f, i) => (
          <motion.ellipse
            key={i}
            cx={f.x}
            cy={f.y}
            rx="7"
            ry="2.6"
            fill="#ffffff"
            stroke="rgba(148,163,184,0.55)"
            strokeWidth="0.8"
            initial={false}
            animate={
              inView
                ? {
                    x: [0, f.dx * 0.4, f.dx * 0.7, f.dx],
                    y: [0, f.dy * 0.3, f.dy * 0.65, f.dy],
                    rotate: [f.tilt, -f.tilt, f.tilt, -f.tilt * 0.6],
                    opacity: [0, 0.95, 0.8, 0],
                  }
                : { x: 0, y: 0, rotate: f.tilt, opacity: 0 }
            }
            transition={{ duration: 1.5, delay: f.delay, ease: 'easeInOut' }}
            style={{ transformOrigin: `${f.x}px ${f.y}px` }}
          />
        ))}
      </svg>

      {/* ── KYRO: fly in from off-left → glide → squash-and-stretch touchdown → idle bob ── */}
      <motion.div
        className="absolute bottom-2 left-1/2 -ml-12"
        initial={false}
        animate={
          inView
            ? {
                x: [-180, -60, 0],
                y: [-90, -20, 0],
                opacity: [0, 1, 1],
              }
            : { x: -180, y: -90, opacity: 0 }
        }
        transition={
          inView
            ? { duration: LAND_AT, times: [0, 0.6, 1], ease: ['easeOut', 'easeIn'] }
            : { duration: 0.2 }
        }
      >
        {/* Touchdown squash rides ON TOP of the flight path (separate wrapper so
            transforms compose); starts the moment the owl perches. */}
        <motion.div
          initial={false}
          animate={
            inView && phase === 'perched'
              ? { scaleY: [0.82, 1.06, 1], scaleX: [1.14, 0.96, 1] }
              : { scaleY: 1, scaleX: 1 }
          }
          transition={inView && phase === 'perched' ? { duration: 0.4, times: [0, 0.55, 1] } : { duration: 0 }}
          style={{ transformOrigin: FEET_ORIGIN }}
        >
          {/* Idle bob once perched. */}
          <motion.div
            animate={inView && phase === 'perched' ? { y: [0, -5, 0] } : { y: 0 }}
            transition={
              inView && phase === 'perched'
                ? { duration: 2.6, delay: 0.4, repeat: Infinity, ease: 'easeInOut' }
                : undefined
            }
          >
            <PennyAvatar size={96} state={inView ? phase : 'flying'} facing="right" paused={!inView} />
          </motion.div>
        </motion.div>
      </motion.div>

      {/* Landing shadow: squashes on touchdown, breathes with the bob. */}
      <motion.div
        className="absolute bottom-0 left-1/2 h-2.5 w-20 -translate-x-1/2 rounded-full bg-black/30 blur-[3px]"
        initial={false}
        animate={
          inView
            ? phase === 'perched'
              ? { scaleX: [1.25, 0.95, 1], opacity: [0.8, 0.6, 0.65] }
              : { scaleX: 0.3, opacity: 0.15 }
            : { scaleX: 0.3, opacity: 0 }
        }
        transition={phase === 'perched' ? { duration: 0.4, times: [0, 0.55, 1] } : { duration: LAND_AT }}
      />
    </div>
  )
}
