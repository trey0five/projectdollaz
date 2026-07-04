// StudioParticles — an ambient field of slow-drifting blue particles behind the
// conversation view, so the light page doesn't read as flat/plain while Penny works.
// Purely decorative (aria-hidden, pointer-events-none), fixed to the viewport so it
// stays lively as the transcript scrolls. Compositor-only (transform/opacity) and
// fully hidden under prefers-reduced-motion. Positions are computed ONCE at module
// load (never during render) so it stays pure; keys are the stable index.
import { motion, useReducedMotion } from 'framer-motion'

const COUNT = 40

const PARTICLES = Array.from({ length: COUNT }, () => ({
  left: Math.random() * 100, // vw%
  top: Math.random() * 100, // vh%
  size: 4 + Math.random() * 8, // px
  drift: 30 + Math.random() * 55, // px vertical travel
  dur: 8 + Math.random() * 10, // s
  delay: Math.random() * 8, // s
  opacity: 0.22 + Math.random() * 0.33,
}))

export default function StudioParticles() {
  const reduce = useReducedMotion()
  if (reduce) return null

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* Soft navy glow blooms for depth. */}
      <span className="absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-navy/[0.05] blur-3xl" />
      <span className="absolute -right-16 top-2/3 h-64 w-64 rounded-full bg-navy-soft/[0.06] blur-3xl" />
      {PARTICLES.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
            opacity: p.opacity,
            background: 'radial-gradient(circle at 35% 30%, #4f7fd6, #2e508f 70%)',
            boxShadow: '0 0 10px rgba(58,107,214,0.55)',
          }}
          animate={{ y: [0, -p.drift, 0], opacity: [p.opacity, p.opacity * 1.7, p.opacity] }}
          transition={{ duration: p.dur, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}
