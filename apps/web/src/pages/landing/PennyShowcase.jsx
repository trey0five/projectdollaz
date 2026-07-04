// ─────────────────────────────────────────────────────────────────────────────
// PennyShowcase — the live scripted PennyDemo in its floating glass frame,
// relocated out of the hero (which now belongs to the gold-dust coin) into its
// own navy band directly beneath it. Text left, demo right — the same visual
// grammar the hero used, so the handoff reads as one continuous navy opening.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import PennyDemo from './PennyDemo.jsx'
import Reveal from './Reveal.jsx'
import { SHOWCASE } from './landingContent.js'

export default function PennyShowcase() {
  const reduce = useReducedMotion()

  return (
    <section
      aria-labelledby="showcase-h2"
      className="relative overflow-hidden bg-navy-deep py-20 sm:py-24"
    >
      {/* Gold hairline seam between the hero and this band. */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(212,180,122,0.4), transparent)' }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 top-1/3 h-64 w-64 rounded-full bg-navy-soft/25 blur-3xl"
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_minmax(380px,460px)]">
        <div>
          <Reveal>
            <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-gold-light">
              {SHOWCASE.kicker}
            </p>
          </Reveal>
          <Reveal delay={0.07}>
            <h2
              id="showcase-h2"
              className="mt-4 font-serif text-[30px] font-semibold leading-tight text-white sm:text-[38px]"
            >
              {SHOWCASE.h2}
            </h2>
          </Reveal>
          <Reveal delay={0.14}>
            <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-white/70">
              {SHOWCASE.body}
            </p>
          </Reveal>
        </div>

        {/* The demo, in the floating glass frame (unchanged from the old hero). */}
        <Reveal delay={0.12}>
          <motion.div
            animate={reduce ? undefined : { y: [0, -8, 0] }}
            transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
            className="rounded-2xl border border-gold/25 bg-white/[0.04] p-1.5 shadow-lift backdrop-blur-sm"
          >
            <div className="overflow-hidden rounded-xl bg-cream">
              <PennyDemo />
            </div>
          </motion.div>
        </Reveal>
      </div>
    </section>
  )
}
