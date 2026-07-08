// ─────────────────────────────────────────────────────────────────────────────
// IntroFX — the hero's opening spectacle: THE HUNDRED PARTS. ~90 scattered UI
// shards (ledger rows, DUE/SIGNED/FY26 chips, mini cards, motes) drift across
// the dark hero in slow parallax — the chaos of running a school — until Penny
// pulses (a gold shockwave) and every shard arcs into the platform's corner as
// the headline stamps in. The motion IS the headline: "A hundred moving parts.
// One platform." All geometry is deterministic (seeded PRNG) so every load
// plays the same show. (The Coin Drop / Minting alternates were compared live
// and retired.)
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion'
import { EASE } from './Reveal.jsx'

// Beat schedule [ms, phase] — 3 Penny center · 4 pulse/converge + headline ·
// 5 chat unfold · 6 settle. Padded so the shard-field gets its moment.
export const INTRO_BEATS = [
  [150, 3],
  [2100, 4],
  [2700, 5],
  [3300, 6],
]

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
    // The shards scatter across 4–96vw with fixed pixel widths, so on a narrow phone
    // they read oversized and the right-edge ones clip. Scaling the whole field down
    // (origin-center) shrinks each shard and pulls the outer ones inward so nothing is
    // cut, then returns to 1× on tablet/desktop where there's room. Decorative + transient.
    <div
      className="pointer-events-none absolute inset-0 z-20 origin-center scale-[0.7] overflow-hidden sm:scale-90 lg:scale-100"
      aria-hidden="true"
    >
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

/** The opening overlay (a pointer-events-none layer inside the hero). */
export default function IntroOverlay({ phase, reduce }) {
  return <PartsOverlay phase={phase} reduce={reduce} />
}
