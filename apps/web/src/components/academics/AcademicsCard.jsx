// ─────────────────────────────────────────────────────────────────────────────
// AcademicsCard — the Aurora frame every academics analysis panel wears
// (2026-10-15). A drop-in for module/SectionHeader's `Section`: the SAME props
// (eyebrow · title · icon · aside · tone · delay · reduce), so the dashboard,
// the cohort grid and the network page swap one import and nothing else.
//
// Each panel is a white rounded card with the module-hue rule along its top —
// "charts and tables sit in white cards inside a section" — with a small icon
// well, the eyebrow as a caps kicker, the title, and the aside on the right.
// The view's own AuroraSection strip sits above the cards, so a card never
// sits inside a card. No overflow clip: chart tooltips and (i) popovers may
// open past the edge.
//
// `info` (optional): the chart's "what this measures" explanation, behind an ⓘ
// in the header — the same progressive disclosure Enrollment's ChartCard uses,
// so the two analytics pages read alike and neither leads with a paragraph.
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion'
import InfoPopover from '../ui/InfoPopover.jsx'
import '../../styles/pending/aurora-enroll-acad.css'

const EASE = [0.22, 1, 0.36, 1]

export function Section({ title, eyebrow, children, aside, info = null, infoLabel, icon: Icon, tone, delay = 0, reduce }) {
  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE, delay }}
      className="acad-card"
      style={tone ? { '--acad-rule': tone } : undefined}
    >
      <header className="acad-card-head">
        {Icon ? (
          <span className="acad-card-well" aria-hidden="true">
            <Icon size={17} />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          {eyebrow ? <h2 className="acad-card-kicker">{eyebrow}</h2> : null}
          {title ? <h3 className="acad-card-title">{title}</h3> : null}
        </div>
        {aside || info ? (
          <div className="acad-card-aside">
            {aside}
            {info ? <InfoPopover label={infoLabel ?? 'How to read this chart'}>{info}</InfoPopover> : null}
          </div>
        ) : null}
      </header>
      <div className="min-w-0">{children}</div>
    </motion.section>
  )
}

export default Section
