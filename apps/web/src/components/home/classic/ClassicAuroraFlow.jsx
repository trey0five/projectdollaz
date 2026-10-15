// ─────────────────────────────────────────────────────────────────────────────
// ClassicAuroraFlow — the "alive" feature behind the CLASSIC school-home briefing
// band (forked verbatim from the pre-Premium-UI AuroraFlow at origin/main 74caaba;
// the owner asked for this look back on the school home). Layered, blurred
// gradient RIBBONS (blue → purple → coral) that drift and breathe. Purely
// decorative (aria-hidden), pointer-events-none, transform/opacity only. The
// drift loops INFINITELY by design (the restored look), and renders STATIC under
// prefers-reduced-motion (useReducedMotion → plain paths, no animation).
// The SVG ids carry a `classic-` prefix so this band can never resolve the
// shared AuroraFlow's gradients (or vice versa) if both are ever mounted.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'

// The three flowing ribbons. Each is a smooth bezier sweeping up-and-right across
// the bottom-right of the band, stroked with its own gradient and blurred into a
// soft light-stream. `drift` is the slow float applied to the whole ribbon group.
const RIBBONS = [
  {
    id: 'a',
    d: 'M -40 210 C 160 150, 300 250, 480 120 S 760 40, 900 90',
    width: 44,
    grad: 'classic-aurora-a',
    opacity: 0.55,
    drift: { x: [0, 26, -14, 0], y: [0, -16, 10, 0], duration: 15 },
  },
  {
    id: 'b',
    d: 'M -20 250 C 200 210, 320 120, 520 190 S 780 150, 940 60',
    width: 62,
    grad: 'classic-aurora-b',
    opacity: 0.5,
    drift: { x: [0, -22, 16, 0], y: [0, 14, -12, 0], duration: 19 },
  },
  {
    id: 'c',
    d: 'M 60 300 C 240 250, 360 300, 560 240 S 820 220, 980 150',
    width: 34,
    grad: 'classic-aurora-c',
    opacity: 0.65,
    drift: { x: [0, 18, -20, 0], y: [0, -10, 14, 0], duration: 23 },
  },
]

export default function ClassicAuroraFlow() {
  const reduce = useReducedMotion()

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
    >
      {/* The aurora lives on the right ~two-thirds and bleeds off the edges. */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1000 320"
        preserveAspectRatio="xMaxYMid slice"
        fill="none"
      >
        <defs>
          <linearGradient id="classic-aurora-a" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#2f6bff" stopOpacity="0" />
            <stop offset="45%" stopColor="#4f7dff" stopOpacity="1" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.2" />
          </linearGradient>
          <linearGradient id="classic-aurora-b" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#7c5cff" stopOpacity="0" />
            <stop offset="50%" stopColor="#a855f7" stopOpacity="1" />
            <stop offset="100%" stopColor="#ff6b5c" stopOpacity="0.35" />
          </linearGradient>
          <linearGradient id="classic-aurora-c" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#ff7a5c" stopOpacity="0" />
            <stop offset="55%" stopColor="#ff6b7a" stopOpacity="1" />
            <stop offset="100%" stopColor="#ffb37a" stopOpacity="0.4" />
          </linearGradient>
          {/* Soft glow: blur the strokes into light-streams. */}
          <filter id="classic-aurora-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
        </defs>

        <g filter="url(#classic-aurora-blur)">
          {RIBBONS.map((r) =>
            reduce ? (
              <path
                key={r.id}
                d={r.d}
                stroke={`url(#${r.grad})`}
                strokeWidth={r.width}
                strokeLinecap="round"
                opacity={r.opacity}
              />
            ) : (
              <motion.path
                key={r.id}
                d={r.d}
                stroke={`url(#${r.grad})`}
                strokeWidth={r.width}
                strokeLinecap="round"
                initial={{ opacity: r.opacity }}
                animate={{
                  x: r.drift.x,
                  y: r.drift.y,
                  opacity: [r.opacity * 0.75, r.opacity, r.opacity * 0.8, r.opacity * 0.75],
                }}
                transition={{ duration: r.drift.duration, repeat: Infinity, ease: 'easeInOut' }}
              />
            ),
          )}
        </g>
      </svg>
    </span>
  )
}
