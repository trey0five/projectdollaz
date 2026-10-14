// ─────────────────────────────────────────────────────────────────────────────
// AuroraFlow — the "alive" decorative feature behind the daily-briefing stage.
// Layered, blurred gradient RIBBONS of BLUE LIGHT (primary → sky, nothing else:
// Premium UI P2 recoloured the violet/coral stops out — the stage is ink with
// blue light only). Purely decorative (aria-hidden), pointer-events-none, and
// GPU-cheap (only transform + opacity animate).
//
// ONE-SHOT (§2.5): each ribbon settles once on mount — a slow drift from a
// slightly offset, dimmer start into its resting place — and then holds. No
// infinite loop. Under reduced motion the ribbons render at rest.
// Self-contained: no props, no data — drop it in as the first child of a
// position:relative dark container that has overflow-hidden.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'

// The three ribbons. Each is a smooth bezier sweeping up-and-right across the
// bottom-right of the band, stroked with its own blue gradient and blurred into
// a soft light-stream. `from` is where it starts its one settle.
const RIBBONS = [
  {
    id: 'a',
    d: 'M -40 210 C 160 150, 300 250, 480 120 S 760 40, 900 90',
    width: 44,
    grad: 'aurora-a',
    opacity: 0.55,
    from: { x: 26, y: -16 },
    duration: 2.4,
  },
  {
    id: 'b',
    d: 'M -20 250 C 200 210, 320 120, 520 190 S 780 150, 940 60',
    width: 62,
    grad: 'aurora-b',
    opacity: 0.5,
    from: { x: -22, y: 14 },
    duration: 2.8,
  },
  {
    id: 'c',
    d: 'M 60 300 C 240 250, 360 300, 560 240 S 820 220, 980 150',
    width: 34,
    grad: 'aurora-c',
    opacity: 0.6,
    from: { x: 18, y: -10 },
    duration: 3.2,
  },
]

export const AURORA_STOPS = { primary: '#2563EB', sky: '#38BDF8', deep: '#0EA5E9' }

export default function AuroraFlow() {
  const reduce = useReducedMotion()

  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
      {/* The aurora lives on the right ~two-thirds and bleeds off the edges. */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1000 320"
        preserveAspectRatio="xMaxYMid slice"
        fill="none"
      >
        <defs>
          <linearGradient id="aurora-a" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor={AURORA_STOPS.primary} stopOpacity="0" />
            <stop offset="45%" stopColor={AURORA_STOPS.primary} stopOpacity="1" />
            <stop offset="100%" stopColor={AURORA_STOPS.sky} stopOpacity="0.25" />
          </linearGradient>
          <linearGradient id="aurora-b" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor={AURORA_STOPS.deep} stopOpacity="0" />
            <stop offset="50%" stopColor={AURORA_STOPS.sky} stopOpacity="0.9" />
            <stop offset="100%" stopColor={AURORA_STOPS.primary} stopOpacity="0.3" />
          </linearGradient>
          <linearGradient id="aurora-c" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor={AURORA_STOPS.sky} stopOpacity="0" />
            <stop offset="55%" stopColor={AURORA_STOPS.deep} stopOpacity="1" />
            <stop offset="100%" stopColor={AURORA_STOPS.sky} stopOpacity="0.4" />
          </linearGradient>
          {/* Soft glow: blur the strokes into light-streams. */}
          <filter id="aurora-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
        </defs>

        <g filter="url(#aurora-blur)">
          {RIBBONS.map((r) =>
            reduce ? (
              <path key={r.id} d={r.d} stroke={`url(#${r.grad})`} strokeWidth={r.width} strokeLinecap="round" opacity={r.opacity} />
            ) : (
              <motion.path
                key={r.id}
                d={r.d}
                stroke={`url(#${r.grad})`}
                strokeWidth={r.width}
                strokeLinecap="round"
                initial={{ x: r.from.x, y: r.from.y, opacity: r.opacity * 0.5 }}
                animate={{ x: 0, y: 0, opacity: r.opacity }}
                transition={{ duration: r.duration, ease: [0.22, 1, 0.36, 1] }}
              />
            ),
          )}
        </g>
      </svg>
    </span>
  )
}
