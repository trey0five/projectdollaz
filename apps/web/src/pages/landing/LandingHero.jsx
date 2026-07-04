// ─────────────────────────────────────────────────────────────────────────────
// LandingHero — dark navy opening act. Mask-revealed two-line H1, subhead,
// CTAs, and the live PennyDemo in a floating glass frame over StudioBackdrop.
// Load orchestration (per spec): kicker t100, H1 lines t220/t340, demo frame
// t420, subhead t520, CTAs + trust t660 — implemented as per-element delays on
// one 700ms [0.2,0.8,0.2,1] rise. Reduced motion: everything static.
// ─────────────────────────────────────────────────────────────────────────────
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import StudioBackdrop from '../../components/penny/studio/StudioBackdrop.jsx'
import PennyDemo from './PennyDemo.jsx'
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
      <StudioBackdrop />
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-navy-radial" />

      <div className="relative mx-auto grid max-w-6xl gap-12 px-5 pb-24 pt-32 sm:px-8 lg:grid-cols-[1fr_minmax(380px,460px)] lg:items-center">
        <div>
          <motion.p
            {...rise(0.1)}
            className="text-[12px] font-bold uppercase tracking-[0.22em] text-gold-light"
          >
            {HERO.kicker}
          </motion.p>

          <h1
            id="hero-title"
            className="mt-5 font-serif text-[42px] font-semibold leading-[1.06] tracking-[-0.01em] sm:text-[58px] lg:text-[70px]"
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

          <motion.p {...rise(0.52)} className="mt-6 max-w-xl text-[17px] leading-relaxed text-white/70">
            {HERO.subhead}
          </motion.p>

          <motion.div {...rise(0.66)}>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                to={HERO.ctaPrimary.to}
                className={`group relative inline-flex items-center justify-center overflow-hidden rounded-xl bg-gold-gradient px-8 py-4 text-[13px] font-bold uppercase tracking-[0.14em] text-navy-deep shadow-glow-lg transition-shadow hover:shadow-glow ${FOCUS_RING}`}
              >
                {/* Sheen sweep on hover (transform-only; hidden under reduce). */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 -translate-x-[160%] bg-sheen transition-transform duration-700 ease-out group-hover:translate-x-[160%] motion-reduce:hidden"
                />
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

        {/* The demo, in a floating glass frame. */}
        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE, delay: 0.42 }}
        >
          <motion.div
            animate={reduce ? undefined : { y: [0, -8, 0] }}
            transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
            className="rounded-2xl border border-gold/25 bg-white/[0.04] p-1.5 shadow-lift backdrop-blur-sm"
          >
            <div className="overflow-hidden rounded-xl bg-cream">
              <PennyDemo />
            </div>
          </motion.div>
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
