// ─────────────────────────────────────────────────────────────────────────────
// LandingHero — "The Opening Bell": a cinematic title-sequence intro.
//   phase 0  dark screen (no spinner — RootRoute's fallback is the same navy)
//   phase 1  a gold ignition line draws across the center
//   phase 2  the hero "powers on" — a TV/CRT vertical bloom opens from that line
//   phase 3  the Penny mascot (the smiling gold coin) appears, large, center stage
//   phase 4  the mascot flies to the right, to the chat box's header-avatar spot
//   phase 5  the chat box unfolds outward from the mascot — it *becomes* the live
//            Penny AI chat — while the headline racks into focus, word by word
//   phase 6  one gold shine sweeps the accent once; subhead, CTAs and trust settle
// Kept: StudioBackdrop's rising gold motes (its diagonal light-sweep is dropped
// via sweep={false}). On phones the mascot doesn't fly to an off-screen chat —
// it fades at center and the chat scales up in place. Click to skip; reduced
// motion renders everything settled with a plain fade.
// ─────────────────────────────────────────────────────────────────────────────
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import StudioBackdrop from '../../components/penny/studio/StudioBackdrop.jsx'
import PennyAvatar from '../../components/penny/PennyAvatar.jsx'
import PennyDemo from './PennyDemo.jsx'
import IntroOverlay, { INTRO_BEATS } from './IntroFX.jsx'
import { EASE } from './Reveal.jsx'
import { HERO } from './landingContent.js'

const FOCUS_RING = 'outline-none focus-visible:ring-2 focus-visible:ring-gold/60'
const COIN = 52 // px — the flying mascot diameter (≈ the chat header avatar)
// The chat header avatar's center, measured from the floating frame's top-left:
// p-1.5 (6) + px-4 / py-3 (16 / 12) + half the 44px avatar (22).
const AV_X = 6 + 16 + 22
const AV_Y = 6 + 12 + 22

// Beat schedules live in IntroFX (per intro variant: classic / parts / drop /
// mint); phases 3–6 mean the same thing in every variant.

// ── "One platform." decoding out of NUMBERS ──────────────────────────────────
// Each character cycles through digits and locks left-to-right into the final
// gold serif text — a hundred numbers resolving into the one platform. Runs
// once when `play` flips true; reduced motion renders the finished line.
const DIGITS = '0123456789'
function NumberDecode({ text, play, reduce }) {
  const [out, setOut] = useState(() => (reduce ? text : text.replace(/[^ ]/g, '0')))
  const ran = useRef(false)
  useEffect(() => {
    if (reduce || !play || ran.current) return undefined
    ran.current = true
    const chars = text.split('')
    // Char i locks at 260ms + 55ms·i; until then it cycles digits.
    const lockAt = chars.map((_, i) => 260 + i * 55)
    const start = performance.now()
    let raf
    const tick = (now) => {
      const t = now - start
      let done = true
      setOut(
        chars
          .map((c, i) => {
            if (c === ' ') return ' '
            if (t >= lockAt[i]) return c
            done = false
            // Deterministic cycle (no flicker-rand): pace by time + offset by slot.
            return DIGITS[Math.floor(t / 42 + i * 3) % 10]
          })
          .join(''),
      )
      if (!done) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [play, reduce, text])
  return <>{out}</>
}

export default function LandingHero({ onIntroOpen }) {
  const reduce = useReducedMotion()
  const sectionRef = useRef(null)
  const chatRef = useRef(null) // the (unscaled) grid cell wrapping the chat box
  // Start at phase 2 — the "screen" is already on (Penny will fade in center).
  const [phase, setPhase] = useState(reduce ? 6 : 2)
  // lg+ gets the full fly-to-chat; phones fade the coin at center instead (the
  // chat would be below the fold, so flying to it would leave the frame).
  const [flyToChat, setFlyToChat] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = (e) => setFlyToChat(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  // Where the mascot sits (its resting base = the chat avatar spot) and the
  // translate that carries it up to stage-center.
  const [coinPos, setCoinPos] = useState({ left: 0, top: 0 })
  const [toCenter, setToCenter] = useState({ x: 0, y: 0 })

  useLayoutEffect(() => {
    const measure = () => {
      const s = sectionRef.current
      if (!s) return
      const sr = s.getBoundingClientRect()
      if (flyToChat && chatRef.current) {
        const cr = chatRef.current.getBoundingClientRect() // outer cell = full-size layout box
        const avX = cr.left - sr.left + AV_X
        const avY = cr.top - sr.top + AV_Y
        setCoinPos({ left: avX - COIN / 2, top: avY - COIN / 2 })
        setToCenter({ x: sr.width / 2 - avX, y: sr.height / 2 - avY })
      } else {
        // Mobile: the mascot just appears at the viewport center and fades — the
        // chat lives in its own section below, so there's nothing to fly to.
        const cy = Math.min(sr.height, window.innerHeight) / 2
        setCoinPos({ left: sr.width / 2 - COIN / 2, top: cy - COIN / 2 })
        setToCenter({ x: 0, y: 0 })
      }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [flyToChat])

  useEffect(() => {
    if (reduce) return undefined
    const ids = INTRO_BEATS.map(([t, p]) => setTimeout(() => setPhase(p), t))
    return () => ids.forEach(clearTimeout)
  }, [reduce])

  const skip = () => setPhase(6)

  const coinStaged = phase >= 3
  const coinFlown = phase >= 4
  const chatExpand = phase >= 5
  // The headline racks in the moment the mascot starts moving right (phase 4),
  // not after the chat has finished unfolding.
  const textIn = phase >= 4
  const settled = phase >= 6

  // The hero now opens on Penny centered (no dark pre-open field), so the fixed
  // nav just fades in shortly after mount. (onIntroOpen is memoized by the
  // parent, so this runs once.)
  useEffect(() => {
    const id = setTimeout(() => onIntroOpen?.(), reduce ? 0 : 250)
    return () => clearTimeout(id)
  }, [reduce, onIntroOpen])

  // Mascot animation. It appears center-stage (big), flies to the avatar spot
  // (lg only), then fades as the chat unfolds from underneath it.
  const bigCenter = { x: toCenter.x, y: toCenter.y, scale: 2.5 }
  const home = { x: 0, y: 0, scale: 1 }
  const coinAnim = reduce
    ? { opacity: 0 }
    : chatExpand
      ? { opacity: 0, ...(flyToChat ? home : bigCenter) }
      : coinFlown
        ? { opacity: 1, ...(flyToChat ? home : bigCenter) }
        : { opacity: coinStaged ? 1 : 0, ...bigCenter }
  const coinTransition =
    coinFlown && !chatExpand && flyToChat
      ? { duration: 0.6, ease: EASE } // the flight
      : chatExpand
        ? { duration: 0.35, ease: EASE } // the fade
        : { duration: 0.4, ease: EASE } // the appear

  const words1 = HERO.h1Line1.split(' ')
  // Line 1: each word rises out from behind its own baseline mask — a title-
  // sequence entrance to pair with the shard convergence happening behind it.
  const word = (i) => ({
    initial: reduce ? false : { y: '115%', opacity: 0 },
    animate: textIn ? { y: '0%', opacity: 1 } : { y: '115%', opacity: 0 },
    transition: { duration: 0.55, ease: EASE, delay: textIn ? 0.05 + i * 0.06 : 0 },
  })
  const rise = (delay = 0) => ({
    initial: reduce ? false : { opacity: 0, y: 16 },
    animate: settled ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 },
    transition: { duration: 0.6, ease: EASE, delay },
  })

  return (
    <>
    <section
      ref={sectionRef}
      aria-labelledby="hero-title"
      onClick={reduce || settled ? undefined : skip}
      className="relative isolate min-h-[100svh] overflow-hidden bg-[#0a1526]"
    >
      {/* The hero backdrop (navy gradient + rising motes), shown from the start. */}
      <div className="absolute inset-0 bg-studio-hero">
        <StudioBackdrop sweep={false} />
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-navy-radial" />

        {/* The opening spectacle: the hundred parts drifting, then converging. */}
        <IntroOverlay phase={phase} reduce={reduce} />

        <div className="relative mx-auto grid min-h-[100svh] max-w-6xl items-start gap-12 px-5 pb-24 pt-32 sm:px-8 lg:grid-cols-[1fr_minmax(380px,460px)] lg:items-center">
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
                  <Fragment key={i}>
                    {/* Each word rises out of its own overflow mask (pb keeps
                        descenders unclipped at rest). */}
                    <span className="inline-block overflow-hidden pb-[0.12em] align-bottom">
                      <motion.span {...word(i)} className="inline-block text-white">
                        {w}
                      </motion.span>
                    </span>
                    {i < words1.length - 1 ? ' ' : ''}
                  </Fragment>
                ))}
              </span>
              {/* Line 2 DECODES from numbers. The text nodes swap characters
                  (no per-word framer layers), so background-clip:text can live
                  on the LINE wrapper — only its opacity animates. */}
              <span className="relative block">
                <motion.span
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: textIn ? 1 : 0 }}
                  transition={{ duration: 0.3, ease: EASE }}
                  className="gold-text inline-block pb-[0.16em]"
                >
                  <NumberDecode text={HERO.h1Line2} play={textIn} reduce={!!reduce} />
                </motion.span>
                {settled && (
                  <span aria-hidden="true" className={`hero-shine ${settled ? 'is-glinting' : ''}`}>
                    {HERO.h1Line2}
                  </span>
                )}
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

          {/* The chat cell — DESKTOP ONLY. chatRef is the coin's flight target;
              the frame unfolds from the mascot's landing point (transform-origin
              at the header-avatar corner). On mobile the chat lives in its own
              section below the hero (so it isn't clipped by the 100svh screen). */}
          {flyToChat && (
            <div ref={chatRef}>
              <motion.div
                initial={reduce ? false : { scale: 0.08, opacity: 0 }}
                animate={reduce || chatExpand ? { scale: 1, opacity: 1 } : { scale: 0.08, opacity: 0 }}
                transition={{ duration: 0.6, ease: EASE }}
                style={{ transformOrigin: `${AV_X}px ${AV_Y}px` }}
              >
                <motion.div
                  animate={reduce || !settled ? undefined : { y: [0, -8, 0] }}
                  transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
                  className="rounded-2xl border border-gold/25 bg-white/[0.04] p-1.5 shadow-lift backdrop-blur-sm"
                >
                  <div className="overflow-hidden rounded-xl bg-cream">
                    <PennyDemo />
                  </div>
                </motion.div>
              </motion.div>
            </div>
          )}
        </div>
      </div>

      {/* The Penny mascot (the smiling gold coin). Appears center-stage, flies to
          the chat's header-avatar spot, then fades as the chat unfolds into it. */}
      <motion.div
        aria-hidden="true"
        initial={false}
        animate={coinAnim}
        transition={coinTransition}
        className="pointer-events-none absolute z-30 rounded-full"
        style={{
          left: coinPos.left,
          top: coinPos.top,
          width: COIN,
          height: COIN,
          boxShadow: '0 0 36px rgba(212,180,122,.5)',
        }}
      >
        <PennyAvatar size={COIN} />
      </motion.div>

      {/* Scroll cue — appears with the settle. */}
      <motion.div
        aria-hidden="true"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: settled ? 1 : 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="pointer-events-none absolute inset-x-0 bottom-5 z-20 hidden flex-col items-center gap-1 lg:flex"
      >
        <ChevronDown size={20} className="text-gold/60 motion-safe:animate-float" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
          {HERO.scrollHint}
        </span>
      </motion.div>
    </section>

    {/* MOBILE ONLY: the live Penny chat, in its own navy band below the hero
        (on desktop it lives inside the hero, beside the headline). */}
    {!flyToChat && (
      <section aria-label="Penny in action" className="bg-navy-deep px-5 pb-14 pt-2">
        <p className="mb-4 text-center text-[12px] font-bold uppercase tracking-[0.22em] text-gold-light">
          See Penny work
        </p>
        <div className="mx-auto max-w-md rounded-2xl border border-gold/25 bg-white/[0.04] p-1.5 shadow-lift backdrop-blur-sm">
          <div className="overflow-hidden rounded-xl bg-cream">
            <PennyDemo />
          </div>
        </div>
      </section>
    )}
    </>
  )
}
