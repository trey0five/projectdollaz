// ─────────────────────────────────────────────────────────────────────────────
// Data hub — one reusable guided checklist card (module scope; the SOURCES config
// lives in DataHubPage like ReportsPage's REPORTS array — NOT an in-render def).
// Each card carries id={`datahub-card-${key}`} + data-card={key} so Penny anchors
// her spotlight ring + chevron to it (robust to responsive reflow). A card either
// LINKS out (trial balance, budget, schedules, compliance) or opens an EMBED panel
// (monthly, operational) in a MODAL via onOpen. All cards are equal-height (h-full
// + a flex spacer that pins the action to the bottom). Renders a lucide icon, the
// plain-English what/why, a StatusBadge, the server `detail` line, and — when it's
// the active step — a "Start here" affordance so guidance survives Penny dismiss.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ArrowRight, Maximize2, Sparkles } from 'lucide-react'
import StatusBadge from './StatusBadge.jsx'
import { Button } from '../ui/surface/index.js'

// Premium UI P4: each checklist source is a `Tile` (hairline, 2px hue rule,
// the one-shot hover flood) carrying a status Pill; the active / next step
// wears a 2px primary frame (static — the old infinite spotlight pulse is
// gone; motion is one-shot). The action is a real Button / link in the foot.
export default function SourceCard({
  source, // { key, title, Icon, what, cta, action, to }
  status, // sources[key]: { status, detail, count, total, roles }
  isActive, // true when this is the active/next step (Penny target)
  onOpen, // open the embed modal (embed cards only)
}) {
  const reduce = useReducedMotion()
  const { Icon } = source
  const st = status?.status || 'optional'
  const detail = status?.detail || ''
  const isEmbed = source.action === 'embed'

  return (
    <motion.section
      id={`datahub-card-${source.key}`}
      data-card={source.key}
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className={`tile h-full ${isActive ? 'outline outline-2 outline-offset-2 outline-[#2563EB]/60' : ''}`}
      style={{ '--c-module': '37 99 235' }}
    >
      <div className="tile-head">
        <div className="flex min-w-0 items-center gap-3">
          <span className="tile-icon">
            <Icon size={20} aria-hidden="true" />
          </span>
          <h3 className="tile-title">{source.title}</h3>
        </div>
        <StatusBadge status={st} />
      </div>
      <p className="tile-body">{source.what}</p>

      {detail && <p className="text-[12.5px] font-medium text-ink">{detail}</p>}

      {isActive && (
        <p className="inline-flex items-center gap-1 self-start text-[11px] font-semibold uppercase tracking-[0.08em] text-ink">
          <Sparkles size={12} aria-hidden="true" className="text-penny" /> Start here
        </p>
      )}

      {/* Action: open the embed in a modal OR link out — pinned to the foot. */}
      <div className="tile-foot">
        {isEmbed ? (
          <Button variant="secondary" size="sm" onClick={onOpen}>
            {source.cta}
            <Maximize2 size={12} aria-hidden="true" />
          </Button>
        ) : (
          <Link to={source.to} className="dt-link group text-small">
            {source.cta}
            <ArrowRight size={14} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
      </div>
    </motion.section>
  )
}
