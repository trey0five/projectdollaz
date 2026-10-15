// StudioParticles — a quiet field of blue motes behind the conversation view, so
// the light page doesn't read as flat while KYRO works. Strictly ONE-SHOT
// (Premium UI §2.5): each mote fades in, drifts a short way up and fades back
// out once on mount — an arrival, not a permanent pattern on the ledger ground.
// No repeat, no loop; nothing remains on screen once it settles. Purely decorative
// (aria-hidden, pointer-events-none), fixed to the viewport, compositor-only
// (transform/opacity) and absent under prefers-reduced-motion. Positions are
// computed ONCE at module load (never during render) so it stays pure; keys
// are the stable index.
import { motion, useReducedMotion } from 'framer-motion'

const COUNT = 28

const PARTICLES = Array.from({ length: COUNT }, () => ({
  left: Math.random() * 100, // vw%
  top: Math.random() * 100, // vh%
  size: 3 + Math.random() * 5, // px
  drift: 18 + Math.random() * 30, // px vertical travel (once)
  dur: 2.4 + Math.random() * 2, // s
  delay: Math.random() * 1.2, // s
  opacity: 0.12 + Math.random() * 0.18,
}))

export default function StudioParticles() {
  const reduce = useReducedMotion()
  if (reduce) return null

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {PARTICLES.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full bg-[#2563eb]"
          style={{ left: `${p.left}%`, top: `${p.top}%`, width: p.size, height: p.size }}
          initial={{ y: p.drift, opacity: 0 }}
          animate={{ y: 0, opacity: [0, p.opacity, 0] }}
          transition={{
            duration: p.dur,
            delay: p.delay,
            ease: [0.22, 1, 0.36, 1],
            opacity: { duration: p.dur, delay: p.delay, times: [0, 0.4, 1], ease: 'easeOut' },
          }}
        />
      ))}
    </div>
  )
}
