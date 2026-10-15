// ─────────────────────────────────────────────────────────────────────────────
// LandingHero — the headline card that STRADDLES the seam between the opening
// video and the page ground. It is part of the page's ONE ink band (the video
// above it): solid ink, a white hairline, no glass, no glow. The headline is
// EB Garamond at editorial scale (56/60 desktop). The live KYRO demo sits
// beside it (desktop) in a Panel — the one raised surface — or in its own band
// below (phones).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Button, Panel } from '../../components/ui/surface/index.js'
import PennyDemo from './PennyDemo.jsx'
import { EASE } from './Reveal.jsx'
import { HERO } from './landingContent.js'
import '../../styles/pending/p5-landing.css'

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

  // One-shot rise for each line of the card (never repeats).
  const rise = (delay = 0) => ({
    initial: reduce ? false : { opacity: 0, y: 14 },
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
        className="relative z-20 mx-auto -mb-24 -mt-24 grid max-w-6xl items-center gap-10 lg:items-start px-5 sm:-mb-32 sm:-mt-36 sm:px-8 lg:-mb-40 lg:-mt-36 lg:grid-cols-[1fr_minmax(380px,460px)]"
      >
        {/* ── The headline card: solid ink, part of the video's ink band ── */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE, delay: reduce ? 0 : 0.3 }}
          className="rounded-lg border border-white/10 bg-[#0a1628] p-7 sm:p-10"
        >
          <motion.p {...rise(0.4)} className="text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-white/60">
            {HERO.kicker}
          </motion.p>

          <h1
            id="hero-title"
            className="mt-4 font-serif text-[34px] font-medium leading-[38px] sm:text-[48px] sm:leading-[52px] lg:text-[56px] lg:leading-[60px]"
          >
            <motion.span {...rise(0.46)} className="block text-white">
              {HERO.h1Line1}
            </motion.span>
            <motion.span {...rise(0.54)} className="block text-[#93c5fd]">
              {HERO.h1Line2}
            </motion.span>
          </h1>

          <motion.p {...rise(0.62)} className="mt-5 max-w-lg text-[17px] leading-[26px] text-white/75">
            {HERO.subhead}
          </motion.p>

          <motion.div {...rise(0.7)}>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button to={HERO.ctaPrimary.to} variant="primary" className="btn-lg">
                {HERO.ctaPrimary.label}
              </Button>
              <Button to={HERO.ctaGhost.to} variant="quiet" className="btn-lg btn-on-dark focus-visible:!outline-white/60">
                {HERO.ctaGhost.label}
              </Button>
            </div>
            <p className="mt-5 text-[13px] leading-[18px] text-white/60">{HERO.trustLine}</p>
          </motion.div>
        </motion.div>

        {/* ── The live KYRO demo, in a Panel beside the card (desktop) ── */}
        {desktop && (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: reduce ? 0 : 0.5 }}
          >
            <Panel padded={false} className="overflow-hidden">
              <PennyDemo />
            </Panel>
          </motion.div>
        )}
      </div>

      {/* MOBILE ONLY: the live KYRO chat on the ground under a section rule.
          The top padding clears the straddling hero card's -mb overlap. */}
      {!desktop && (
        <section aria-label="KYRO in action" className="px-5 pb-14 pt-32 sm:px-8">
          <div className="mx-auto max-w-md">
            <div className="sec-head">
              <p className="sec-label">See KYRO work</p>
              <span className="sec-rule" aria-hidden="true" />
            </div>
            <Panel padded={false} className="overflow-hidden">
              <PennyDemo />
            </Panel>
          </div>
        </section>
      )}
    </>
  )
}
