// StudioBackdrop — the KYRO stage backdrop for Penny Studio: a gold top
// hairline, two light pools (KYRO gold + one blue counter-light) that drift into
// place, ONE diagonal gold light-sweep, and ~26 gold motes that rise ONCE on
// mount. Strictly one-shot (Premium UI §2.5): every layer settles and rests —
// no repeat, no loop. Purely decorative (aria-hidden); the motion layer is
// skipped under reduced motion. NO <canvas> — all framer so it degrades cleanly.
import { motion, useReducedMotion } from 'framer-motion'

const MOTE_COUNT = 26

// Randomized mote placement computed ONCE at module load (never during render, so
// it stays pure/idempotent). Keys are the stable array index, never a random value.
const MOTES = Array.from({ length: MOTE_COUNT }, () => ({
  left: Math.random() * 100,
  bottom: Math.random() * 55,
  delay: Math.random() * 2.5,
  duration: 5 + Math.random() * 3,
}))

// `sweep` toggles the single diagonal gold light-sweep. It's on by default (Penny
// Studio keeps it); the marketing hero passes sweep={false}.
export default function StudioBackdrop({ sweep = true }) {
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
          <span className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-penny/10 blur-3xl" />
          <span className="absolute -bottom-28 -left-16 h-60 w-60 rounded-full bg-[#2563eb]/15 blur-3xl" />
        </>
      ) : (
        <>
          {/* Two light pools that drift INTO place once and rest (no loop). */}
          <motion.span
            className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-penny/10 blur-3xl"
            initial={{ x: 30, y: -20, opacity: 0 }}
            animate={{ x: 0, y: 0, opacity: 0.8 }}
            transition={{ duration: 2.4, ease: [0.22, 1, 0.36, 1] }}
          />
          <motion.span
            className="absolute -bottom-28 -left-16 h-64 w-64 rounded-full bg-[#2563eb]/15 blur-3xl"
            initial={{ x: -30, y: 20, opacity: 0 }}
            animate={{ x: 0, y: 0, opacity: 0.7 }}
            transition={{ duration: 2.8, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
          />
          {/* Diagonal gold light-sweep: ONE pass across the hero on arrival. */}
          {sweep && (
            <motion.span
              className="absolute inset-y-[-20%] -left-1/3 w-1/3 -skew-x-12"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.05), rgba(212,180,122,0.16), rgba(255,255,255,0.05), transparent)' }}
              initial={{ x: '0%' }}
              animate={{ x: '440%' }}
              transition={{ duration: 2.2, ease: 'easeInOut', delay: 0.4 }}
            />
          )}

          {/* Gold motes: each rises once (no repeat) — the welcome, not a loop. */}
          {MOTES.map((m, i) => (
            <motion.span
              key={i}
              className="absolute h-[3px] w-[3px] rounded-full bg-penny-light shadow-[0_0_10px_rgba(212,180,122,0.95)]"
              style={{ left: `${m.left}%`, bottom: `${m.bottom}%` }}
              initial={{ y: 0, opacity: 0 }}
              animate={{ y: -380, opacity: [0, 0.7, 0.7, 0] }}
              transition={{
                duration: m.duration,
                delay: m.delay,
                ease: 'linear',
                opacity: { duration: m.duration, delay: m.delay, times: [0, 0.1, 0.9, 1] },
              }}
            />
          ))}
        </>
      )}
    </span>
  )
}
