// ─────────────────────────────────────────────────────────────────────────────
// SectionHeader / Section — the header every analysis panel wears.
//
// The version this replaces set the eyebrow and the title in the same white
// field as the data directly beneath them, at 9.5px and 19px. On a page of
// fifteen stacked panels that produced a wall with no seams: the reader had to
// actually READ a title to discover which chart they had scrolled to, which is
// the one thing a title is supposed to save them from.
//
// So the header is a BAND, not a line of text — its own tinted ground, a
// hairline closing it off from the data, a glyph tile carrying the panel's
// subject, and the eyebrow promoted to a chip. The scanning eye lands on a
// repeating shape at the top of each panel and reads a title only when it wants
// one. The left rail exists for the same reason a newspaper rules its columns:
// it says where a thing starts.
//
// Lives in module/ rather than academics/ because the org-scope network page
// needs the identical chrome — two copies would drift, and the copy that drifts
// is always the one nobody is looking at.
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion'

const EASE = [0.2, 0.8, 0.2, 1]

export function SectionHeader({ eyebrow, title, icon: Icon, aside, tone = '#0D9488' }) {
  return (
    <header
      className="relative flex items-start justify-between gap-3 border-b border-navy/[0.07] px-5 py-4"
      style={{ background: `linear-gradient(180deg, ${tone}12 0%, ${tone}00 100%)` }}
    >
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 h-full w-[3px]"
        style={{ background: `linear-gradient(180deg, ${tone} 0%, ${tone}00 100%)` }}
      />

      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span
            aria-hidden="true"
            className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl"
            style={{ background: `${tone}1A`, color: tone, boxShadow: `inset 0 0 0 1px ${tone}2E` }}
          >
            <Icon size={16} strokeWidth={2.2} />
          </span>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? (
            <span
              className="inline-flex items-center rounded-full px-2 py-[3px] font-mono text-[9px] font-bold uppercase tracking-[0.18em]"
              style={{ background: `${tone}16`, color: tone }}
            >
              {eyebrow}
            </span>
          ) : null}
          <h3 className="mt-1.5 font-serif text-[22px] font-semibold leading-tight tracking-[-0.01em] text-navy">
            {title}
          </h3>
        </div>
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </header>
  )
}

export function Section({ title, eyebrow, children, aside, icon, tone, delay = 0, reduce }) {
  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE, delay }}
      className="overflow-hidden rounded-2xl border border-navy/10 bg-white shadow-[0_18px_44px_-30px_rgba(16,28,61,0.4)]"
    >
      <SectionHeader eyebrow={eyebrow} title={title} icon={icon} aside={aside} tone={tone} />
      <div className="p-5">{children}</div>
    </motion.section>
  )
}

export default Section
