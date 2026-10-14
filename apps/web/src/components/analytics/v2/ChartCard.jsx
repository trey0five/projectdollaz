// ─────────────────────────────────────────────────────────────────────────────
// ChartCard — the frame every analytics-v2 visual lives in (Charts gallery AND
// the Overview). Premium UI P3: it is a `Section`, not a card — the chart sits
// ON THE GROUND under a label row (eyebrow `sub` + hairline + the "as of"
// stamp, the ⓘ methodology popover and the "View as table" twin as the aside)
// and a 17px heading. It keeps its cross-link anchor (id = anchorId, the flash
// target from a scorecard "chart →" — `.sec[data-flash]` rings it) and its
// "view as table" twin (jumps to the Scorecard and flashes the row for
// `metricKey`). The chart PRIMITIVE is passed as children; this owns none of
// the drawing (dataviz stays in charts/). Entrance: a one-shot fade on mount
// (not on scroll — the page is complete at rest, plan §2.5).
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { Table2 } from 'lucide-react'
import InfoPopover from '../../ui/InfoPopover.jsx'
import { Section, Button } from '../../ui/surface/index.js'

// `info` (optional, additive): methodology content rendered behind an ⓘ popover
// in the label row — the progressive-disclosure home for a chart's full "what
// this measures" text once the body leads with a one-line caption instead.
export default function ChartCard({ id, metricKey, title, sub, asOf, info, infoLabel, onViewAsTable, delay = 0, className = '', children }) {
  const reduce = useReducedMotion()
  const aside = (
    <>
      {asOf && <span className="whitespace-nowrap tabular-nums">{asOf}</span>}
      {info && <InfoPopover label={infoLabel ?? 'How to read this chart'}>{info}</InfoPopover>}
      {metricKey && onViewAsTable && (
        <Button variant="quiet" size="sm" onClick={() => onViewAsTable(metricKey)} icon={<Table2 size={12} />}>
          View as table
        </Button>
      )}
    </>
  )
  return (
    <Section
      as={motion.section}
      id={id}
      label={sub ?? title}
      aside={aside}
      className={`sec-chart !mt-0 min-w-0${className ? ` ${className}` : ''}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduce ? 0 : 0.4, delay: reduce ? 0 : delay, ease: 'easeOut' }}
    >
      {sub ? <h4 className="mb-3 text-heading font-semibold text-ink">{title}</h4> : null}
      <div className="min-w-0">{children}</div>
    </Section>
  )
}
