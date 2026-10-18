// ─────────────────────────────────────────────────────────────────────────────
// LandingHero — the headline glass card that STRADDLES the seam between the
// opening video and the page below. The glass is DARK (navy @ 75% + blur) so
// the white copy stays readable over both the footage and the light ground;
// the headline is Montserrat semibold with the blue-gradient accent line and
// one shine sweep across it. The live KYRO demo floats beside it (desktop,
// with a slow bob) or sits in its own band (phones).
// Styles: landing-restore-top.css (literal, landing-scoped values).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import PennyDemo from './PennyDemo.jsx'
import { EASE } from './Reveal.jsx'
import { HERO } from './landingContent.js'
import '../../styles/landing-restore-top.css'

const FOCUS_RING = 'outline-none lr-focus'

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

  // Each line of the card rises in once.
  const rise = (delay = 0) => ({
    initial: reduce ? false : { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, ease: EASE, delay: reduce ? 0 : delay },
  })

  return (
    <>
      {/* Transparent straddle block: -mt lifts it over the video; -mb pulls the
          section below up under its lower half. No background of its own. */}
      {/* Desktop overlap is 144px (lg:-mt-36), not deeper: the hero video ends on the
          KYRO wordmark + "Knowledge Yielding Resource Optimizer" in the bottom quarter
          of its frame, and the video is anchored object-bottom so the crop trims the top.
          A deeper overlap hides the tagline on every desktop size. */}
      <div
        aria-labelledby="hero-title"
        className="relative z-20 mx-auto -mb-24 -mt-24 grid max-w-6xl items-center gap-10 px-5 sm:-mb-32 sm:-mt-36 sm:px-8 lg:-mb-40 lg:-mt-36 lg:grid-cols-[1fr_minmax(380px,460px)]"
      >
        {/* ── The frosted glass card (dark glass — readable over video AND ground) ── */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE, delay: reduce ? 0 : 0.3 }}
          className="lr-hero-card"
        >
          <motion.p {...rise(0.42)} className="lr-kicker">
            {HERO.kicker}
          </motion.p>

          <h1 id="hero-title" className="lr-h1 mt-4">
            <motion.span {...rise(0.48)} className="block text-white">
              {HERO.h1Line1}
            </motion.span>
            <motion.span {...rise(0.56)} className="relative block">
              <span className="lr-accent">{HERO.h1Line2}</span>
              {/* One bright shine sweeps the accent line once it settles
                  (index.css .hero-shine; hidden under reduced motion). */}
              {!reduce && (
                <span aria-hidden="true" className="hero-shine is-glinting" style={{ animationDelay: '1.3s' }}>
                  {HERO.h1Line2}
                </span>
              )}
            </motion.span>
          </h1>

          <motion.p {...rise(0.64)} className="lr-subhead mt-5 max-w-lg">
            {HERO.subhead}
          </motion.p>

          <motion.div {...rise(0.72)}>
            <div className="mt-7 flex flex-wrap items-center gap-4">
              <Link to={HERO.ctaPrimary.to} className={`lr-cta lr-cta-lg ${FOCUS_RING}`}>
                {HERO.ctaPrimary.label}
              </Link>
              <Link to={HERO.ctaGhost.to} className={`lr-ghost ${FOCUS_RING}`}>
                {HERO.ctaGhost.label}
              </Link>
            </div>
            <p className="mt-5 text-[13px] text-white/60">{HERO.trustLine}</p>
          </motion.div>
        </motion.div>

        {/* ── The live KYRO demo, floating beside the card (desktop) ── */}
        {desktop && (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE, delay: reduce ? 0 : 0.5 }}
          >
            {/* A slow 7s bob — the panel floats (still under reduced motion). */}
            <motion.div
              animate={reduce ? undefined : { y: [0, -8, 0] }}
              transition={reduce ? undefined : { duration: 7, repeat: Infinity, ease: 'easeInOut' }}
              className="lr-demo-float"
            >
              <div className="lr-demo-inner">
                <PennyDemo />
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>

      {/* MOBILE ONLY: the live KYRO chat as a clean FLOATING card on the light
          page ground — mirroring how it floats on desktop. The top padding
          clears the straddling hero card's -mb overlap. */}
      {!desktop && (
        <section aria-label="KYRO in action" className="px-5 pb-14 pt-32 sm:px-8">
          <p className="lr-see-label">See KYRO work</p>
          <div className="lr-demo-card mx-auto max-w-md">
            <div className="lr-demo-inner">
              <PennyDemo />
            </div>
          </div>
        </section>
      )}
    </>
  )
}
