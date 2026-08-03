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
      className="scroll-mt-24 rounded-3xl border border-rule/60 bg-white p-4 shadow-sm sm:p-5"
    >
      <header className="flex flex-wrap items-start gap-3 border-b border-rule/50 pb-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-[13px] font-bold text-white"
          style={{ background: hue }}
          aria-hidden
        >
          {Icon ? <Icon size={18} /> : index}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Act {index}
          </p>
          <h2
            id={id ? `${id}-title` : undefined}
            className="font-serif text-[19px] font-semibold leading-tight text-navy"
          >
            {title}
          </h2>
          {kicker ? (
            <p className="mt-1 max-w-[70ch] text-[12.5px] leading-relaxed text-muted">{kicker}</p>
          ) : null}
        </div>
        {aside ? <div className="flex shrink-0 flex-wrap items-center gap-2">{aside}</div> : null}
      </header>
      <div className="pt-3.5">{children}</div>
    </motion.section>
  )
}
