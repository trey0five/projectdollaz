// ─────────────────────────────────────────────────────────────────────────────
// LandingHero — the headline glass card that STRADDLES the seam between the
// opening video and the first story act ("You don't check eight systems…").
// The old navy rising-motes band is gone: the card's top half floats over the
// video footage and its bottom half overlaps the LENGTHENED cream act below
// (LandingPage pads the acts container to make room). The glass is DARK
// (navy @ 75% + blur) so the white copy stays readable over both grounds.
// The live PennyDemo floats beside it (desktop) / in its own band (mobile).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import PennyDemo from './PennyDemo.jsx'
import { EASE } from './Reveal.jsx'
import { HERO } from './landingContent.js'

const FOCUS_RING = 'outline-none focus-visible:ring-2 focus-visible:ring-gold/60'

export default function LandingHero({ onIntroOpen }) {
  const reduce = useReducedMotion()
  // Desktop keeps the demo beside the card; phones get it in a band below.
  const [desktop, setDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = (e) => setDesktop(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Fixed-nav hand-off (VideoHero also fires this; first one wins).
  useEffect(() => {
    const id = setTimeout(() => onIntroOpen?.(), reduce ? 0 : 250)
    return () => clearTimeout(id)
  }, [reduce, onIntroOpen])

  const rise = (delay = 0) => ({
    initial: reduce ? false : { opacity: 0, y: 18 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true },
    transition: { duration: 0.6, ease: EASE, delay },
  })

  return (
    <>
      {/* Transparent straddle block: -mt lifts it over the video; -mb pulls the
          cream act section up under its lower half. No background of its own. */}
      <div
        aria-labelledby="hero-title"
        className="relative z-20 mx-auto -mb-24 -mt-24 grid max-w-6xl items-center gap-10 px-5 sm:-mb-32 sm:-mt-36 sm:px-8 lg:-mb-40 lg:-mt-56 lg:grid-cols-[1fr_minmax(380px,460px)]"
      >
        {/* ── The frosted glass card (dark glass — readable over video AND cream) ── */}
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE, delay: reduce ? 0 : 0.3 }}
          className="rounded-3xl border border-white/15 bg-[#0d1b33]/75 p-7 shadow-[0_30px_80px_-20px_rgba(4,10,26,0.7)] backdrop-blur-xl sm:p-10"
        >
          <motion.p
            {...rise(0.12)}
            className="text-[12px] font-bold uppercase tracking-[0.22em] text-gold-light"
          >
            {HERO.kicker}
          </motion.p>

          <h1
            id="hero-title"
            className="mt-4 font-serif text-[40px] font-semibold leading-[1.05] tracking-[-0.01em] sm:text-[54px] lg:text-[60px]"
          >
            <motion.span {...rise(0.18)} className="block text-white">
              {HERO.h1Line1}
            </motion.span>
            <motion.span {...rise(0.26)} className="relative block">
              <span className="gold-text inline-block pb-[0.16em]">{HERO.h1Line2}</span>
              {/* One gold shine sweeps the accent line after it settles. */}
              <span aria-hidden="true" className="hero-shine is-glinting">
                {HERO.h1Line2}
              </span>
            </motion.span>
          </h1>

          <motion.p {...rise(0.34)} className="mt-5 max-w-lg text-[16.5px] leading-relaxed text-white/75">
            {HERO.subhead}
          </motion.p>

          <motion.div {...rise(0.42)}>
            <div className="mt-7 flex flex-wrap items-center gap-4">
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
            <p className="mt-5 text-[13px] text-white/60">{HERO.trustLine}</p>
          </motion.div>
        </motion.div>

        {/* ── The live Penny demo, floating beside the card (desktop) ── */}
        {desktop && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE, delay: reduce ? 0 : 0.5 }}
          >
            <motion.div
              animate={reduce ? undefined : { y: [0, -8, 0] }}
              transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
              className="rounded-2xl border border-gold/25 bg-[#0d1b33]/60 p-1.5 shadow-lift backdrop-blur-md"
            >
              <div className="overflow-hidden rounded-xl bg-cream">
                <PennyDemo />
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>

      {/* MOBILE ONLY: the live Penny chat as a clean FLOATING card on the light
          page background (no navy slab) — mirroring how it floats on desktop. The
          top padding clears the straddling hero card's -mb overlap. */}
      {!desktop && (
        <section aria-label="Penny in action" className="px-5 pb-14 pt-32">
          <p className="mb-4 text-center text-[12px] font-bold uppercase tracking-[0.22em] text-[#7a5e00]">
            See Penny work
          </p>
          <div className="mx-auto max-w-md rounded-2xl border border-gold/30 bg-white p-1.5 shadow-[0_26px_60px_-24px_rgba(16,28,61,0.3)]">
            <div className="overflow-hidden rounded-xl bg-cream">
              <PennyDemo />
            </div>
          </div>
        </section>
      )}
    </>
  )
}
