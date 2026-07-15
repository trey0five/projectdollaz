// ─────────────────────────────────────────────────────────────────────────────
// LedgerSpine — the signature effect: a 1px gold hairline running down the acts
// container (center on desktop, left gutter on mobile) whose inner fill draws
// with scroll (useScroll → useSpring, scaleY from origin-top — transform only).
//
// TimestampMedallion — one disc per act sitting ON the spine. As the drawn edge
// passes (approximated by the medallion crossing the 70% viewport line, the
// same offset the spine draws to), it "ignites": rule→gold border, ONE
// pulse-ring iteration, and the serif time stamp springs in.
//
// Reduced motion: spine fully drawn, all medallions gold and stamped, no pulse.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef } from 'react'
import { motion, useInView, useReducedMotion, useScroll, useSpring } from 'framer-motion'

export default function LedgerSpine({ containerRef }) {
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start 0.7', 'end 0.7'],
  })
  const drawn = useSpring(scrollYProgress, { stiffness: 90, damping: 26, mass: 0.4 })

  return (
    <div
      aria-hidden="true"
      // z-[1]: the act <section>s are positioned siblings painted AFTER this
      // div, so at z-auto their opaque backgrounds would cover the spine.
      // z-[1] lifts the 1px line above the section grounds; the medallions
      // (z-10) and any overlapping content stay above it.
      className="pointer-events-none absolute inset-y-0 left-[26px] z-[1] w-px -translate-x-1/2 lg:left-1/2"
    >
      {/* Faint full-height hairline behind the content. */}
      <div className="absolute inset-0 bg-gold opacity-40" />
      {/* The scroll-drawn gold fill. */}
      <motion.div
        className="absolute inset-x-0 top-0 h-full origin-top bg-gold"
        style={{ scaleY: reduce ? 1 : drawn }}
      />
    </div>
  )
}

// One timestamp medallion, absolutely positioned on the spine near the top of
// its act section (the section must be `relative`). Decorative — the time also
// lives in the act's visible kicker text.
//
// Two lit states, layered:
//   • `passed` (gold, once) — the spine's drawn edge has reached this act.
//   • `active` (BLUE, live) — the act is the one currently centered in the
//     viewport (a scroll-spy the parent section computes). Blue overrides gold
//     so "you are here" reads at a glance as you scroll the day.
export function TimestampMedallion({ time, tone = 'light', active = false }) {
  const reduce = useReducedMotion()
  const ref = useRef(null)
  // Ignite when the medallion crosses ~70% of the viewport — the same line the
  // spine's drawn edge tracks — and stay lit (once).
  const passed = useInView(ref, { once: true, margin: '0px 0px -30% 0px' })
  const lit = reduce || passed
  const [clock, meridiem] = time.split(' ')

  return (
    <div
      ref={ref}
      aria-hidden="true"
      // Mobile: 44px disc centered on the spine at x=26px → left edge at +4px,
      // so nothing crosses x=0 (no horizontal scroll). Desktop: 54px at center.
      className="pointer-events-none absolute left-[26px] top-10 z-10 -translate-x-1/2 lg:left-1/2"
    >
      <div
        className={`flex h-11 w-11 flex-col items-center justify-center rounded-full border transition-all duration-500 lg:h-[54px] lg:w-[54px] ${
          // Active → a WHITE disc so it pops on the section's blue flood.
          active
            ? 'scale-110 border-white bg-white shadow-[0_0_0_5px_rgba(255,255,255,0.35),0_10px_26px_-6px_rgba(37,99,235,0.7)]'
            : `${tone === 'dark' ? 'bg-navy-deep' : 'bg-cream'} ${
                lit ? 'border-gold' : 'border-rule'
              } ${lit && !reduce ? 'motion-safe:animate-[pulse-ring_1.4s_ease-out_1]' : ''}`
        }`}
      >
        <motion.span
          className="flex flex-col items-center leading-none"
          initial={reduce ? false : { scale: 1.2, rotate: -6, opacity: 0 }}
          animate={lit ? { scale: 1, rotate: 0, opacity: 1 } : undefined}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          <span
            className={`font-serif text-[13px] italic transition-colors duration-500 lg:text-[15px] ${
              active ? 'text-[#2563EB]' : 'text-gold'
            }`}
          >
            {clock}
          </span>
          <span
            className={`mt-0.5 font-sans text-[8px] font-bold uppercase tracking-[0.18em] transition-colors duration-500 ${
              active ? 'text-[#2563EB]' : 'text-gold'
            }`}
          >
            {meridiem}
          </span>
        </motion.span>
      </div>
    </div>
  )
}
