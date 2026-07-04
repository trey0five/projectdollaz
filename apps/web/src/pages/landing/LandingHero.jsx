// ─────────────────────────────────────────────────────────────────────────────
// LandingHero — "Gold Dust → Coin". Six-word mask-revealed H1 beside a living
// canvas of ~700 gold flecks that spring-assemble into Penny's coin
// (GoldDustCoin); the pointer scatters them, they always return home. The
// backdrop is deliberately quiet (hairline + two drifting orbs) — NO diagonal
// light-sweep and no mote layer: the dust is the life here. The primary CTA
// lost its hover sheen for the same reason. The live PennyDemo moved to the
// PennyShowcase band below. Reduced motion: static text + assembled coin.
// ─────────────────────────────────────────────────────────────────────────────
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import GoldDustCoin from './GoldDustCoin.jsx'
import { EASE } from './Reveal.jsx'
import { HERO } from './landingContent.js'

const FOCUS_RING = 'outline-none focus-visible:ring-2 focus-visible:ring-gold/60'

export default function LandingHero() {
  const reduce = useReducedMotion()

  const rise = (delay) => ({
    initial: reduce ? false : { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, ease: EASE, delay },
  })

  // H1 mask reveal: each line clips an inner span rising from below.
  const maskLine = (delay) => ({
    initial: reduce ? false : { y: '110%' },
    animate: { y: 0 },
    transition: { duration: 0.7, ease: EASE, delay },
  })

  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate min-h-[100svh] overflow-hidden bg-studio-hero"
    >
      {/* Quiet backdrop: gold top hairline + two slow orbs. Intentionally NOT
          StudioBackdrop — its diagonal light-sweep and motes would fight the
          gold dust (and the sweep is the effect this redesign retires). */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <span
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(212,180,122,0.55), transparent)' }}
        />
        {reduce ? (
          <>
            <span className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gold/10 blur-3xl" />
            <span className="absolute -bottom-28 -left-16 h-60 w-60 rounded-full bg-navy-soft/25 blur-3xl" />
          </>
        ) : (
          <>
            <motion.span
              className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gold/10 blur-3xl"
              animate={{ x: [0, -28, 10, 0], y: [0, 24, -12, 0], opacity: [0.5, 0.85, 0.55, 0.5] }}
              transition={{ duration: 17, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.span
              className="absolute -bottom-28 -left-16 h-64 w-64 rounded-full bg-navy-soft/25 blur-3xl"
              animate={{ x: [0, 30, -12, 0], y: [0, -18, 10, 0], opacity: [0.5, 0.8, 0.55, 0.5] }}
              transition={{ duration: 21, repeat: Infinity, ease: 'easeInOut' }}
            />
          </>
        )}
      </span>
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-navy-radial" />

      <div className="relative mx-auto grid min-h-[100svh] max-w-6xl items-center gap-8 px-5 pb-24 pt-28 sm:px-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <motion.p
            {...rise(0.1)}
            className="text-[12px] font-bold uppercase tracking-[0.22em] text-gold-light"
          >
            {HERO.kicker}
          </motion.p>

          <h1
            id="hero-title"
            className="mt-5 font-serif text-[46px] font-semibold leading-[1.04] tracking-[-0.01em] sm:text-[64px] lg:text-[78px]"
          >
            <span className="block overflow-hidden">
              <motion.span {...maskLine(0.22)} className="block text-white">
                {HERO.h1Line1}
              </motion.span>
            </span>
            <span className="block overflow-hidden">
              <motion.span {...maskLine(0.34)} className="gold-text block">
                {HERO.h1Line2}
              </motion.span>
            </span>
          </h1>

          <motion.p {...rise(0.5)} className="mt-6 max-w-lg text-[17px] leading-relaxed text-white/70">
            {HERO.subhead}
          </motion.p>

          <motion.div {...rise(0.64)}>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                to={HERO.ctaPrimary.to}
                className={`inline-flex items-center justify-center rounded-xl bg-gold-gradient px-8 py-4 text-[13px] font-bold uppercase tracking-[0.14em] text-navy-deep shadow-glow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-glow motion-reduce:transform-none ${FOCUS_RING}`}
              >
                {HERO.ctaPrimary.label}
              </Link>
              <Link
                to={HERO.ctaGhost.to}
                className={`inline-flex items-center justify-center rounded-xl border-2 border-white/25 px-6 py-3.5 text-[13px] font-bold uppercase tracking-[0.14em] text-white transition-colors hover:border-gold/60 hover:text-gold-light ${FOCUS_RING}`}
              >
                {HERO.ctaGhost.label}
              </Link>
            </div>
            <p className="mt-6 text-[13px] text-white/60">{HERO.trustLine}</p>
          </motion.div>
        </div>

        {/* The gold dust. The canvas owns its column; a soft radial glow sits
            underneath so the assembled coin appears lit from within. */}
        <motion.div
          {...rise(0.3)}
          className="relative h-[320px] sm:h-[420px] lg:h-[540px]"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 h-[70%] w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold/[0.07] blur-3xl"
          />
          <GoldDustCoin />
        </motion.div>
      </div>

      {/* Scroll cue. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-5 flex flex-col items-center gap-1"
      >
        <ChevronDown size={20} className="text-gold/60 motion-safe:animate-float" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
          {HERO.scrollHint}
        </span>
      </div>
    </section>
  )
}
