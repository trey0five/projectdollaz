// ─────────────────────────────────────────────────────────────────────────────
// ActSection — the shared chrome for the six acts of the Mock Visit.
//
// One wrapper so the six acts cannot drift apart visually, and so
// `prefers-reduced-motion` is honoured in exactly ONE place (acceptance 5).
//
// THE REDUCED-MOTION CONTRACT, stated plainly because it is the failure this
// spec-checks: when `reduce` is true the section passes `initial={false}` to
// framer-motion, which means NO initial style is written at all — not
// `opacity: 0`, not a transform, not a zero height. A reduced-motion reader gets
// the fully rendered act on first paint. The failure mode this prevents is the
// common one: `initial={{opacity:0}}` with `transition={{duration:0}}`, which
// still paints an invisible element for one frame and, if the animation never
// runs (jsdom, a print stylesheet, a paused tab), leaves it invisible forever.
//
// NO ACT IS COLLAPSIBLE. There is no `defaultOpen`, no `<details>`, no "show
// more" — most of all not on Act 5, whose whole reason for existing is that it is
// read (§2.3, acceptance 6). The component takes no prop that could hide content.
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion'

export default function ActSection({
  /** 1..6 — printed as the act number, the only numeral this file emits. */
  index,
  /** The act's name. Passed in by the page; never composed here. */
  title,
  /** A short standing sentence about what the act IS. Never about the school. */
  kicker = null,
  /** The act hue — a CSS colour string owned by the page. */
  hue = '#2563EB',
  Icon = null,
  /** Rendered at the right of the header (counts, a play control). */
  aside = null,
  reduce = false,
  id,
  children,
}) {
  // `animate`, NOT `whileInView`. whileInView needs IntersectionObserver, which
  // jsdom does not implement and which a print stylesheet never fires — either way
  // the section would sit at opacity 0 forever. An entrance animation is not worth
  // a blank act.
  return (
    <motion.section
      id={id}
      data-act={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.4, ease: 'easeOut' }}
      // PREMIUM UI P4: a Section on the ground — the act number as the label
      // row (with the act's icon as a stroke in the hue), the title in Garamond,
      // the kicker as prose. No card.
      className="sec scroll-mt-24"
    >
      <header className="sec-head-block">
        <div className="sec-head">
          {Icon ? <Icon size={13} aria-hidden style={{ color: hue }} className="shrink-0" /> : null}
          <h2 className="sec-label">Act {index}</h2>
          <span className="sec-rule" aria-hidden="true" />
          {aside ? <div className="sec-aside">{aside}</div> : null}
        </div>
        <h3 id={id ? `${id}-title` : undefined} className="sec-title !mb-1">
          {title}
        </h3>
        {kicker ? <p className="mb-3 max-w-[70ch] text-small leading-relaxed text-ink2">{kicker}</p> : null}
      </header>
      <div>{children}</div>
    </motion.section>
  )
}
