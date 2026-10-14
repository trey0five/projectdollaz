// ─────────────────────────────────────────────────────────────────────────────
// ModuleHero — the banner every module page opens with.
//
// WHY THE OLD ONE LOOKED CHEAP, since the fix follows from it:
//
// It was `linear-gradient(135deg, teal, dark-teal, navy)` — three stops of
// saturated colour across a wide box. Two things go wrong. The mid-stop sits at
// full saturation in the middle of the card, so the eye reads a visible BAND
// where the hues cross; and a large area of flat saturated colour has no depth,
// which is what makes a gradient look like a template rather than a product.
//
// So: a nearly-black ink ground, and the module hue applied as LIGHT rather than
// as fill — two soft radial blooms plus a top sheen. Colour arrives as if
// something behind the panel were glowing, which reads as depth instead of
// paint, and it keeps the hue unmistakable while using a tenth as much of it.
// A hairline grid adds texture at the threshold of visibility; without it a dark
// panel of this size looks like a hole in the page.
//
// The watermark bleeds off the right edge — see ModuleWatermark for why that
// matters — it fades and settles once; nothing loops (Premium UI P1 §2.5).
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import ModuleWatermark from './ModuleWatermark.jsx'

const EASE = [0.2, 0.8, 0.2, 1]

/** The ink ground every module shares, so the app reads as one product. */
const INK = '#0A1628'

/** Blend a hex over the ground at `a` — used for the blooms. */
const glow = (hex, a) => {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

/**
 * A brighter sibling of the hue, for anything DRAWN on the ink ground.
 *
 * The module hues are picked to sit on white, so on near-black they vanish —
 * teal #0D9488 at 16% over #0A1628 is functionally invisible, which is how the
 * first cut of this banner came out reading as plain navy with no module
 * identity at all. Lifting each channel toward white keeps the hue's character
 * and gives it something to say against the dark.
 */
const lift = (hex, amount = 0.55) => {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16)
  const mix = (c) => Math.round(c + (255 - c) * amount)
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`
}

/**
 * @param {object}   props
 * @param {string}   props.module     Module key, drives the watermark.
 * @param {string}   props.hue        The module's locked hue (#RRGGBB).
 * @param {node}     props.eyebrow    Small caps line above the headline.
 * @param {string}   props.title      The headline. One sentence, no truncation.
 * @param {node}    [props.subtitle]  A line of context under it.
 * @param {Array}   [props.stats]     [{ k, v }] — rendered as glass chips.
 * @param {node}    [props.aside]     Anything to hang top-right (a control).
 */
export default function ModuleHero({ module, hue, eyebrow, title, subtitle, stats = [], aside = null }) {
  const reduce = useReducedMotion()

  return (
    <motion.header
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE }}
      className="relative isolate overflow-hidden rounded-3xl px-6 py-7 text-white sm:px-8 sm:py-8"
      style={{
        background: INK,
        boxShadow: `0 30px 80px -40px ${glow(hue, 0.65)}, 0 2px 0 0 rgba(255,255,255,0.06) inset`,
      }}
    >
      {/* ── Light, not paint ── */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: [
            // The module's own light: hot at the source, falling away fast —
            // which is what keeps it from flattening back into a fill.
            `radial-gradient(70% 120% at 88% -10%, ${glow(hue, 0.85)} 0%, ${glow(hue, 0.34)} 34%, transparent 72%)`,
            // A cooler counter-light, so the far side is not simply black.
            `radial-gradient(56% 96% at 0% 108%, ${glow('#3B82F6', 0.4)} 0%, transparent 72%)`,
            // A faint rake across the middle, so the two do not meet as a band.
            `radial-gradient(90% 60% at 50% 50%, ${glow(hue, 0.14)} 0%, transparent 80%)`,
            `linear-gradient(180deg, rgba(255,255,255,0.09) 0%, transparent 26%)`,
          ].join(', '),
        }}
      />

      {/* ── Hairline grid: texture just above the threshold of noticing ── */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '34px 34px',
          maskImage: 'radial-gradient(80% 100% at 50% 0%, black 30%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(80% 100% at 50% 0%, black 30%, transparent 100%)',
        }}
      />

      {/* ── The mark, cropped by the frame ── */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-10 -z-10 w-[26rem] sm:-right-10 sm:w-[34rem]"
        initial={reduce ? false : { opacity: 0, scale: 1.06 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
        transition={reduce ? { duration: 0 } : { duration: 0.9, ease: EASE }}
        style={{ color: lift(hue, 0.62) }}
      >
        <ModuleWatermark module={module} opacity={0.3} className="h-auto w-full" />
      </motion.div>

      {/* ── Content ── */}
      <div className="relative flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          {eyebrow ? (
            <motion.p
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE, delay: 0.05 }}
              className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.24em]"
              style={{ color: lift(hue, 0.5) }}
            >
              {eyebrow}
            </motion.p>
          ) : null}

          <motion.h1
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE, delay: 0.1 }}
            className="mt-2 max-w-2xl text-balance font-serif text-[30px] font-semibold leading-[1.08] tracking-[-0.01em] sm:text-[38px]"
          >
            {title}
          </motion.h1>

          {subtitle ? (
            <motion.p
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE, delay: 0.16 }}
              className="mt-2.5 max-w-xl text-[14px] leading-relaxed text-white/65"
            >
              {subtitle}
            </motion.p>
          ) : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>

      {/* ── Glass stat chips ── */}
      {stats.length > 0 ? (
        <div className="relative mt-6 flex flex-wrap gap-2.5">
          {stats.map((s, i) => (
            <motion.div
              key={s.k}
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: EASE, delay: 0.22 + i * 0.06 }}
              className="relative overflow-hidden rounded-2xl px-4 py-2.5 backdrop-blur-sm"
              style={{
                background: 'rgba(255,255,255,0.07)',
                boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.14), inset 0 0 0 1px rgba(255,255,255,0.06)',
              }}
            >
              <p className="font-serif text-[24px] font-semibold leading-none tabular-nums">{s.v}</p>
              <p className="mt-1.5 font-mono text-[8.5px] font-bold uppercase tracking-[0.18em] text-white/55">
                {s.k}
              </p>
            </motion.div>
          ))}
        </div>
      ) : null}
    </motion.header>
  )
}
