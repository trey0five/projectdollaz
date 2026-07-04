// StudioBackdrop — the living navy hero backdrop for Penny Studio. Reuses the
// HomeCommandCenter LivingBackdrop language (gold top hairline + drifting glow
// orbs + a slow diagonal gold light-sweep) and layers ~12 gold motes drifting up
// via the CSS `studio-mote` keyframe. Purely decorative (aria-hidden); every loop
// is motion-safe: and the whole mote layer is hidden under reduced motion. NO
// <canvas> — all CSS/framer so it degrades cleanly.
import { motion, useReducedMotion } from 'framer-motion'

const MOTE_COUNT = 12

// Randomized mote placement computed ONCE at module load (never during render, so
// it stays pure/idempotent). Keys are the stable array index, never a random value.
const MOTES = Array.from({ length: MOTE_COUNT }, () => ({
  left: Math.random() * 100,
  bottom: Math.random() * 30,
  delay: Math.random() * 12,
  duration: 9 + Math.random() * 7,
}))

export default function StudioBackdrop() {
  const reduce = useReducedMotion()

  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Gold top hairline — always on. */}
      <span
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(212,180,122,0.55), transparent)' }}
      />

      {reduce ? (
        <>
          <span className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gold/10 blur-3xl" />
          <span className="absolute -bottom-28 -left-16 h-60 w-60 rounded-full bg-navy-soft/20 blur-3xl" />
        </>
      ) : (
        <>
          <motion.span
            className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gold/10 blur-3xl"
            animate={{ x: [0, -30, 10, 0], y: [0, 26, -14, 0], scale: [1, 1.14, 0.94, 1], opacity: [0.55, 0.9, 0.6, 0.55] }}
            transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.span
            className="absolute -bottom-28 -left-16 h-64 w-64 rounded-full bg-navy-soft/25 blur-3xl"
            animate={{ x: [0, 34, -12, 0], y: [0, -20, 12, 0], scale: [1, 1.1, 0.96, 1], opacity: [0.5, 0.82, 0.55, 0.5] }}
            transition={{ duration: 19, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.span
            className="absolute left-1/3 top-1/2 h-44 w-44 rounded-full bg-gold-light/10 blur-3xl"
            animate={{ x: [0, 66, -44, 0], y: [0, -32, 32, 0], opacity: [0.3, 0.6, 0.35, 0.3] }}
            transition={{ duration: 23, repeat: Infinity, ease: 'easeInOut' }}
          />
          {/* Diagonal gold light-sweep gliding across the hero. */}
          <motion.span
            className="absolute inset-y-[-20%] -left-1/3 w-1/3 -skew-x-12"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.05), rgba(212,180,122,0.16), rgba(255,255,255,0.05), transparent)' }}
            animate={{ x: ['0%', '440%'] }}
            transition={{ duration: 6, repeat: Infinity, repeatDelay: 4.5, ease: 'easeInOut' }}
          />

          {/* Gold motes drifting up (CSS keyframe; hidden under reduced motion). */}
          {MOTES.map((m, i) => (
            <span
              key={i}
              className="absolute h-[1.5px] w-[1.5px] rounded-full bg-gold-light/70 shadow-[0_0_6px_rgba(212,180,122,0.8)] motion-safe:animate-studio-mote motion-reduce:hidden"
              style={{
                left: `${m.left}%`,
                bottom: `${m.bottom}%`,
                animationDelay: `${m.delay}s`,
                animationDuration: `${m.duration}s`,
              }}
            />
          ))}
        </>
      )}
    </span>
  )
}
