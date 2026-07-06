// ─────────────────────────────────────────────────────────────────────────────
// IntroFX — three alternate hero OPENINGS, compared live via ?intro= :
//   parts  "The Hundred Parts": ~90 scattered UI shards (rows/chips/cards) drift
//          in slow parallax — the chaos of running a school — until Penny pulses
//          (gold shockwave) and every shard arcs into the platform's corner.
//   drop   "The Coin Drop": ripple rings mark Penny's bounces as she lands with
//          real weight, then a gold trail streaks as she rolls to the chat.
//   mint   "The Minting": a blank gold disc is STAMPED by a descending die —
//          flash, shockwave rings, a particle burst — minting Penny on screen.
// Each is a pointer-events-none overlay layered into the hero; the base
// timeline (fly → chat unfold → settle) continues unchanged afterward. All
// geometry is deterministic (seeded PRNG) so every load plays the same show.
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion'
import { EASE } from './Reveal.jsx'

export const INTRO_VARIANTS = ['parts', 'drop', 'mint']

// Per-variant beat schedules [ms, phase] — same phases as the classic hero
// (3 Penny center · 4 fly + headline · 5 chat unfold · 6 settle), padded to
// give each spectacle its moment.
export const INTRO_BEATS = {
  classic: [
    [150, 3],
    [1050, 4],
    [1650, 5],
    [2250, 6],
  ],
  parts: [
    [150, 3],
    [2100, 4],
    [2700, 5],
    [3300, 6],
  ],
  drop: [
    [150, 3],
    [1950, 4],
    [2650, 5],
    [3250, 6],
  ],
  mint: [
    [1200, 3],
    [2000, 4],
    [2600, 5],
    [3200, 6],
  ],
}

// ── Deterministic pseudo-randomness (mulberry32) — same show every load ──────
function mulberry32(seed) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── THE HUNDRED PARTS ─────────────────────────────────────────────────────────
// Shard kinds: a ledger row (label + bar), a status chip, a mini card, a dot.
const SHARDS = (() => {
  const rnd = mulberry32(20260706)
  return Array.from({ length: 90 }, (_, i) => {
    const kind = i % 9 === 0 ? 'card' : i % 4 === 0 ? 'chip' : i % 3 === 0 ? 'dot' : 'row'
    return {
      id: i,
      kind,
      // Scatter across the full viewport, denser toward the middle band.
      x: 4 + rnd() * 92, // vw
      y: 6 + rnd() * 84, // vh
      rot: -24 + rnd() * 48,
      scale: 0.7 + rnd() * 0.6,
      drift: 6 + rnd() * 14, // px of idle bob
      dur: 5 + rnd() * 6, // idle bob duration
      delayK: rnd(), // convergence stagger
      w: kind === 'card' ? 64 + rnd() * 40 : kind === 'row' ? 56 + rnd() * 48 : 0,
    }
  })
})()

function Shard({ s, converge, reduce }) {
  // Converge target: the chat's corner of the hero (right column, mid height).
  const target = { left: '68vw', top: '44vh' }
  const body =
    s.kind === 'row' ? (
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-6 rounded bg-white/25" />
        <span className="h-1.5 rounded bg-gold/50" style={{ width: s.w * 0.5 }} />
      </span>
    ) : s.kind === 'chip' ? (
      <span className="rounded-full border border-gold/40 bg-gold/15 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-gold-light/90">
        {['due', 'draft', 'signed', 'open', 'FY26', '92%'][s.id % 6]}
      </span>
    ) : s.kind === 'card' ? (
      <span
        className="block rounded-md border border-white/15 bg-white/[0.07] p-1.5"
        style={{ width: s.w }}
      >
        <span className="block h-1 w-2/3 rounded bg-white/30" />
        <span className="mt-1 block h-1 w-1/2 rounded bg-gold/40" />
      </span>
    ) : (
      <span className="block h-1.5 w-1.5 rounded-full bg-gold/60" />
    )

  return (
    <motion.span
      className="absolute will-change-transform"
      style={{ left: `${s.x}vw`, top: `${s.y}vh` }}
      initial={reduce ? false : { opacity: 0, rotate: s.rot, scale: s.scale }}
      animate={
        converge
          ? {
              opacity: 0,
              left: target.left,
              top: target.top,
              rotate: 0,
              scale: 0.2,
            }
          : {
              opacity: 0.85,
              rotate: s.rot,
              scale: s.scale,
              y: [0, -s.drift, 0],
            }
      }
      transition={
        converge
          ? { duration: 0.7, ease: EASE, delay: s.delayK * 0.25 }
          : {
              opacity: { duration: 0.9, delay: 0.15 + s.delayK * 0.8 },
              y: { duration: s.dur, repeat: Infinity, ease: 'easeInOut' },
            }
      }
      aria-hidden="true"
    >
      {body}
    </motion.span>
  )
}

function PartsOverlay({ phase, reduce }) {
  const converge = phase >= 4
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden="true">
      {SHARDS.map((s) => (
        <Shard key={s.id} s={s} converge={converge} reduce={reduce} />
      ))}
      {/* Penny's pulse: one gold shockwave from center as the snap begins */}
      {converge && !reduce && (
        <motion.span
          className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-gold/70"
          initial={{ scale: 0.4, opacity: 0.9 }}
          animate={{ scale: 14, opacity: 0 }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
        />
      )}
    </div>
  )
}

// ── THE COIN DROP ─────────────────────────────────────────────────────────────
// Ripple rings timed to the coin's bounces (the coin itself is the hero's own
// mascot element, driven with drop keyframes in LandingHero).
const DROP_RINGS = [
  { at: 0.75, size: 30 }, // first (hardest) impact
  { at: 1.25, size: 22 }, // second bounce
  { at: 1.6, size: 16 }, // final settle
]

function DropOverlay({ phase, reduce }) {
  if (reduce) return null
  const rolling = phase >= 4
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden="true">
      {phase >= 3 &&
        DROP_RINGS.map((r) => (
          <motion.span
            key={r.at}
            className="absolute left-1/2 top-1/2 rounded-full border-2 border-gold/60"
            style={{ width: r.size, height: r.size, marginLeft: -r.size / 2, marginTop: -r.size / 2 }}
            initial={{ scale: 1, opacity: 0 }}
            animate={{ scale: 9, opacity: [0, 0.8, 0] }}
            transition={{ duration: 0.9, delay: r.at, ease: 'easeOut' }}
          />
        ))}
      {/* The roll trail: a gold streak sweeping from center toward the chat */}
      {rolling && (
        <motion.span
          className="absolute left-1/2 top-1/2 h-[3px] origin-left rounded-full bg-gold-gradient shadow-glow"
          initial={{ width: 0, opacity: 0.9 }}
          animate={{ width: '19vw', opacity: [0.9, 0.9, 0] }}
          transition={{ duration: 0.9, ease: EASE }}
        />
      )}
    </div>
  )
}

// ── THE MINTING ───────────────────────────────────────────────────────────────
const PARTICLES = (() => {
  const rnd = mulberry32(1897)
  return Array.from({ length: 16 }, (_, i) => {
    const angle = (i / 16) * Math.PI * 2 + rnd() * 0.4
    const dist = 90 + rnd() * 130
    return {
      id: i,
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist,
      size: 3 + rnd() * 5,
      dur: 0.6 + rnd() * 0.5,
    }
  })
})()

// The die strikes at ~900ms; the coin face (phase 3) lands at 1200ms.
const STRIKE_DELAY = 0.55
const STRIKE_DUR = 0.3

function MintOverlay({ phase, reduce }) {
  if (reduce) return null
  const struck = phase >= 3
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden="true">
      {/* The blank coin — a gold disc awaiting its face (hidden once minted) */}
      {!struck && (
        <motion.span
          className="absolute left-1/2 top-1/2 h-[130px] w-[130px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-gold/70 bg-gold-gradient shadow-glow"
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.45, ease: EASE }}
        />
      )}
      {/* The die: descends, strikes, retracts */}
      <motion.div
        className="absolute left-1/2 top-0 w-40 -translate-x-1/2"
        initial={{ y: '-30vh' }}
        animate={{ y: ['-30vh', 'calc(50vh - 170px)', '-30vh'] }}
        transition={{
          duration: STRIKE_DUR * 2 + 0.25,
          times: [0, 0.45, 1],
          delay: STRIKE_DELAY,
          ease: ['easeIn', 'easeOut'],
        }}
      >
        <div className="mx-auto h-28 w-24 rounded-b-2xl rounded-t-lg border-2 border-gold/60 bg-navy-gradient shadow-navy-glow">
          <div className="mx-auto mt-3 h-1.5 w-12 rounded bg-gold/40" />
          <div className="mx-auto mt-1.5 h-1.5 w-8 rounded bg-gold/25" />
        </div>
      </motion.div>
      {/* Strike flash + shockwave rings + particles */}
      <motion.span
        className="absolute inset-0 bg-[radial-gradient(40%_40%_at_50%_50%,rgba(232,212,168,0.75),transparent_70%)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.95, 0] }}
        transition={{ duration: 0.5, delay: STRIKE_DELAY + STRIKE_DUR }}
      />
      {[0, 0.12, 0.24].map((d, i) => (
        <motion.span
          key={i}
          className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-gold/60"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 10 + i * 3, opacity: [0, 0.7, 0] }}
          transition={{ duration: 1, delay: STRIKE_DELAY + STRIKE_DUR + d, ease: 'easeOut' }}
        />
      ))}
      {PARTICLES.map((pt) => (
        <motion.span
          key={pt.id}
          className="absolute left-1/2 top-1/2 rounded-full bg-gold"
          style={{ width: pt.size, height: pt.size }}
          initial={{ x: 0, y: 0, opacity: 0 }}
          animate={{ x: pt.dx, y: pt.dy, opacity: [0, 1, 0] }}
          transition={{ duration: pt.dur, delay: STRIKE_DELAY + STRIKE_DUR, ease: 'easeOut' }}
        />
      ))}
    </div>
  )
}

/** The overlay for the chosen variant ('classic' renders nothing). */
export default function IntroOverlay({ variant, phase, reduce }) {
  if (variant === 'parts') return <PartsOverlay phase={phase} reduce={reduce} />
  if (variant === 'drop') return <DropOverlay phase={phase} reduce={reduce} />
  if (variant === 'mint') return <MintOverlay phase={phase} reduce={reduce} />
  return null
}
