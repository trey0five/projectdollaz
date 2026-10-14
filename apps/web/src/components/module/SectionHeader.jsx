// ─────────────────────────────────────────────────────────────────────────────
// SectionHeader / Section — the header every analysis panel wears.
//
// PREMIUM UI P2 (docs/Premium_UI_Plan.md §2.4): the tinted band with its glyph
// tile and chip eyebrow is retired. A section is now a LABEL RULE on the
// ground — 11px caps eyebrow, a hairline running to the aside — with the
// title in EB Garamond beneath it and the content sitting directly on the
// page. No border, no fill, no shadow: the seam between two panels is the rule
// and the whitespace, which is what a ruled document uses too.
//
// The PROPS ARE UNCHANGED (eyebrow · title · icon · aside · tone · delay ·
// reduce) so the academics dashboards and the network page need no edits; the
// icon now draws beside the label in ink-2 and `tone` colours the rule's lead
// mark (2px) only. The entrance stays one-shot (opacity/rise, reduced-motion
// gated).
//
// Lives in module/ rather than academics/ because the org-scope network page
// needs the identical chrome — two copies would drift, and the copy that drifts
// is always the one nobody is looking at.
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion'

const EASE = [0.22, 1, 0.36, 1]

export function SectionHeader({ eyebrow, title, icon: Icon, aside, tone }) {
  return (
    <header className="sec-head-block">
      <div className="sec-head">
        {tone ? <span aria-hidden="true" className="h-[10px] w-[2px] shrink-0" style={{ background: tone }} /> : null}
        {Icon ? <Icon size={13} className="shrink-0 text-ink2" aria-hidden="true" /> : null}
        {eyebrow ? <h2 className="sec-label">{eyebrow}</h2> : null}
        <span className="sec-rule" aria-hidden="true" />
        {aside ? <div className="sec-aside">{aside}</div> : null}
      </div>
      {title ? <h3 className="sec-title">{title}</h3> : null}
    </header>
  )
}

export function Section({ title, eyebrow, children, aside, icon, tone, delay = 0, reduce }) {
  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE, delay }}
      className="sec"
    >
      <SectionHeader eyebrow={eyebrow} title={title} icon={icon} aside={aside} tone={tone} />
      <div>{children}</div>
    </motion.section>
  )
}

export default Section
