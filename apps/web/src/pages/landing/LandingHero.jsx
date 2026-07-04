// ─────────────────────────────────────────────────────────────────────────────
// LandingHero — "The Opening Bell": a cinematic title-sequence intro.
//   phase 0  dark screen
//   phase 1  a gold ignition line draws across the center
//   phase 2  the hero "powers on" — a TV/CRT vertical bloom opens from that line
//   phase 3  the Penny coin appears, large, center stage (a held beat)
//   phase 4  the coin flies to the top-left and becomes the mascot lockup
//   phase 5  the headline racks into focus, word by word (blur → sharp)
//   phase 6  one gold shine sweeps the accent once; subhead, CTAs, trust and the
//            live Penny chat box follow through
// Kept from the prior hero: StudioBackdrop's rising gold motes (its diagonal
// light-sweep is dropped via sweep={false}) and the live PennyDemo chat frame.
// Click anywhere to skip to the settled state. Reduced motion: no choreography —
// everything renders settled with a plain fade.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import StudioBackdrop from '../../components/penny/studio/StudioBackdrop.jsx'
import PennyDemo from './PennyDemo.jsx'
import { EASE } from './Reveal.jsx'
import { HERO } from './landingContent.js'

const FOCUS_RING = 'outline-none focus-visible:ring-2 focus-visible:ring-gold/60'
const COIN = 48 // px — resting mascot coin diameter (its center is what we fly)

// Beat schedule (ms from mount): [line, open, coin-in, coin-flies, text, settle].
// The coin gets a real held beat (~600ms fully gold) between arriving center-
// stage and flying home. Interactive controls (nav) never wait on this, and a
// click short-circuits straight to the settled state.
const BEATS = [200, 750, 1250, 2200, 2950, 3450]

export default function LandingHero() {
  const reduce = useReducedMotion()
  const sectionRef = useRef(null)
  const brandRef = useRef(null)
  // phase 6 = fully settled. Reduced motion starts there; otherwise we climb.
  const [phase, setPhase] = useState(reduce ? 6 : 0)
  // Pixel delta that carries the coin's resting (top-left) center to stage center.
  const [center, setCenter] = useState({ x: 0, y: 0 })

  // Measure the coin's travel once laid out, and on resize.
  useLayoutEffect(() => {
    const measure = () => {
      const s = sectionRef.current
      const b = brandRef.current
      if (!s || !b) return
      const sr = s.getBoundingClientRect()
      const br = b.getBoundingClientRect()
      setCenter({
        x: sr.left + sr.width / 2 - (br.left + COIN / 2),
        y: sr.top + sr.height / 2 - (br.top + COIN / 2),
      })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // The timeline: advance phase on each beat. Cancelled on unmount / skip.
  useEffect(() => {
    if (reduce) return undefined
    const ids = BEATS.map((t, i) => setTimeout(() => setPhase(i + 1), t))
    return () => ids.forEach(clearTimeout)
  }, [reduce])

  const skip = () => setPhase(6)

  const open = phase >= 2
  const coinStaged = phase >= 3
  const coinHome = phase >= 4
  const textIn = phase >= 5
  const settled = phase >= 6

  // Coin animation target by phase (identity transform once home).
  const coinAnim = reduce
    ? { opacity: 1, x: 0, y: 0, scale: 1 }
    : coinHome
      ? { opacity: 1, x: 0, y: 0, scale: 1 }
      : { opacity: coinStaged ? 1 : 0, x: center.x, y: center.y, scale: 2.6 }

  const words1 = HERO.h1Line1.split(' ')
  const words2 = HERO.h1Line2.split(' ')

  // Per-word focus-pull; staggered only once text is cued.
  const word = (i) => ({
    initial: reduce ? false : { opacity: 0, filter: 'blur(14px)' },
    animate: textIn
      ? { opacity: 1, filter: 'blur(0px)' }
      : { opacity: 0, filter: 'blur(14px)' },
    transition: { duration: 0.7, ease: EASE, delay: textIn ? i * 0.07 : 0 },
  })

  // Follow-through elements (subhead / CTAs / trust / chat) rise once settled.
  const rise = (delay = 0) => ({
    initial: reduce ? false : { opacity: 0, y: 16 },
    animate: settled ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 },
    transition: { duration: 0.6, ease: EASE, delay },
  })

  return (
    <section
      ref={sectionRef}
      aria-labelledby="hero-title"
      onClick={reduce || settled ? undefined : skip}
      className="relative isolate min-h-[100svh] overflow-hidden bg-[#0a1526]"
    >
      {/* The "screen" that powers on: everything the TV-bloom reveals lives inside
          this clip. Before phase 2 it's a thin center slit; then it opens fully. */}
      <motion.div
        className="absolute inset-0 bg-studio-hero"
        initial={reduce ? false : { clipPath: 'inset(49.6% 0% 49.6% 0%)' }}
        animate={{ clipPath: reduce || open ? 'inset(0% 0% 0% 0%)' : 'inset(49.6% 0% 49.6% 0%)' }}
        transition={{ duration: 0.72, ease: EASE }}
      >
        <StudioBackdrop sweep={false} />
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-navy-radial" />

        <div className="relative mx-auto grid min-h-[100svh] max-w-6xl items-center gap-12 px-5 pb-24 pt-32 sm:px-8 lg:grid-cols-[1fr_minmax(380px,460px)]">
          <div>
            <motion.p
              {...rise(0.04)}
              className="text-[12px] font-bold uppercase tracking-[0.22em] text-gold-light"
            >
              {HERO.kicker}
            </motion.p>

            <h1
              id="hero-title"
              className="mt-5 font-serif text-[46px] font-semibold leading-[1.03] tracking-[-0.01em] sm:text-[62px] lg:text-[74px]"
            >
              <span className="block">
                {words1.map((w, i) => (
                  <motion.span key={i} {...word(i)} className="inline-block text-white">
                    {w}
                    {i < words1.length - 1 && ' '}
                  </motion.span>
                ))}
              </span>
              <span className="relative block gold-text">
                {words2.map((w, i) => (
                  <motion.span key={i} {...word(words1.length + i)} className="inline-block">
                    {w}
                    {i < words2.length - 1 && ' '}
                  </motion.span>
                ))}
                {/* One-shot shine, fired at settle (CSS handles reduced motion). */}
                <span aria-hidden="true" className={`hero-shine ${settled ? 'is-glinting' : ''}`}>
                  {HERO.h1Line2}
                </span>
              </span>
            </h1>

            <motion.p {...rise(0.06)} className="mt-6 max-w-lg text-[17px] leading-relaxed text-white/70">
              {HERO.subhead}
            </motion.p>

            <motion.div {...rise(0.14)}>
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

          {/* The live Penny chat box, in its floating glass frame. */}
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.96, y: 20 }}
            animate={settled ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.96, y: 20 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.1 }}
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
      </motion.div>

      {/* The gold ignition line — lives above the screen so it reads on the dark
          field before the bloom. Draws in (phase 1), fades as the screen opens. */}
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute left-[8%] right-[8%] top-1/2 z-20 h-px origin-center"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(212,180,122,0.9), transparent)' }}
        initial={reduce ? false : { scaleX: 0, opacity: 0 }}
        animate={{
          scaleX: !reduce && phase >= 1 ? 1 : 0,
          opacity: reduce ? 0 : open ? 0 : phase >= 1 ? 1 : 0,
        }}
        transition={{ duration: open ? 0.3 : 0.55, ease: 'easeOut' }}
      />

      {/* The mascot lockup. brandRef is the measured anchor; the coin flies from
          stage-center into this slot, the wordmark fades in behind it. */}
      <div
        ref={brandRef}
        className="pointer-events-none absolute left-5 top-24 z-30 flex items-center gap-3 sm:left-8"
      >
        <motion.div
          initial={false}
          animate={coinAnim}
          transition={
            coinHome
              ? { duration: 0.85, ease: EASE }
              : { duration: 0.4, ease: EASE }
          }
          className="relative grid place-items-center rounded-full font-serif font-bold text-[#6d5416]"
          style={{
            width: COIN,
            height: COIN,
            fontSize: 25,
            // Emboss baked entirely into the gradient (bright top-left → dark-gold
            // rim) so the coin reads gold at ANY scale — transform-scaled inset
            // box-shadows would blow up and grey it out at 2.6×.
            background:
              'radial-gradient(circle at 36% 30%, #fff3d0 0%, #f0dca6 22%, #e8d4a8 42%, #d4b47a 64%, #b89650 84%, #8a6d1f 100%)',
            boxShadow: '0 0 30px rgba(212,180,122,.4), inset 0 0 0 1.5px rgba(255,255,255,.3)',
          }}
        >
          P
        </motion.div>
        <motion.span
          initial={reduce ? false : { opacity: 0, x: -6 }}
          animate={coinHome ? { opacity: 1, x: 0 } : { opacity: 0, x: -6 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.15 }}
          className="font-serif text-[19px] font-semibold text-gold-light"
        >
          {HERO.brandName}
        </motion.span>
      </div>

      {/* Scroll cue — appears with the settle. */}
      <motion.div
        aria-hidden="true"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: settled ? 1 : 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex flex-col items-center gap-1"
      >
        <ChevronDown size={20} className="text-gold/60 motion-safe:animate-float" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
          {HERO.scrollHint}
        </span>
      </motion.div>
    </section>
  )
}
