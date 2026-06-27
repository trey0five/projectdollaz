// ─────────────────────────────────────────────────────────────────────────────
// Data hub — one reusable guided checklist card (module scope; the SOURCES config
// lives in DataHubPage like ReportsPage's REPORTS array — NOT an in-render def).
// Each card carries id={`datahub-card-${key}`} + data-card={key} so Penny anchors
// her spotlight ring + chevron to it (robust to responsive reflow). A card either
// LINKS out (trial balance, budget, schedules, compliance) or EMBEDS a panel
// inline (monthly, operational) via a toggle. Renders a lucide icon, the
// plain-English what/why, a StatusBadge from sources[key].status, the server
// `detail` line, and — when it's the active nextStep — a visible "Start here"
// affordance so guidance survives even when Penny is dismissed.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import StatusBadge from './StatusBadge.jsx'

export default function SourceCard({
  source,           // { key, title, Icon, what, cta }
  status,           // sources[key]: { status, detail, count, total, roles }
  isActive,         // true when this is summary.nextStep (Penny target)
  expanded,         // embed open?
  onToggle,         // toggle embed
  children,         // the embedded panel (only for embed cards)
}) {
  const reduce = useReducedMotion()
  const { Icon } = source
  const st = status?.status || 'optional'
  const detail = status?.detail || ''
  const isEmbed = source.action === 'embed'

  // Spotlight ring: animated gold pulse on the active card (primary pointing
  // mechanism, anchored by id). Reduced-motion -> a static 2px gold ring.
  const ringCls = isActive
    ? reduce
      ? 'border-gold ring-2 ring-gold/50'
      : 'border-gold/70'
    : 'border-gold/25 hover:border-gold/50'

  return (
    <motion.section
      id={`datahub-card-${source.key}`}
      data-card={source.key}
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative flex flex-col rounded-2xl border-2 bg-white p-5 shadow-card transition-colors ${ringCls}`}
    >
      {/* Animated spotlight pulse (decorative; pointer-events none). */}
      {isActive && !reduce && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-gold/60"
          animate={{ opacity: [0.15, 0.6, 0.15], scale: [1, 1.012, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      <div className="relative flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold">
          <Icon size={22} />
        </span>
        <StatusBadge status={st} />
      </div>

      <h3 className="relative mt-3 font-serif text-lg font-semibold text-navy">{source.title}</h3>
      <p className="relative mt-1.5 text-[13px] leading-relaxed text-muted">{source.what}</p>

      {detail && (
        <p className="relative mt-2.5 text-[12.5px] font-medium text-navy/80">{detail}</p>
      )}

      {isActive && (
        <p className="relative mt-2 inline-flex items-center gap-1 self-start rounded-full bg-gold/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-gold">
          <Sparkles size={12} aria-hidden="true" /> Start here
        </p>
      )}

      <div className="relative mt-4 flex-1" />

      {/* Action: embed toggle OR link-out. */}
      <div className="relative">
        {isEmbed ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={`datahub-embed-${source.key}`}
            className="inline-flex items-center gap-1.5 rounded-lg border-2 border-gold/40 px-3.5 py-2 text-[12px] font-bold uppercase tracking-[0.08em] text-gold transition-all hover:border-gold/70 hover:bg-gold/5"
          >
            {source.cta}
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        ) : (
          <Link
            to={source.to}
            className="group inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-gold transition-colors hover:text-gold-light"
          >
            {source.cta}
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
      </div>

      {/* Inline embed (Monthly / Operational). */}
      {isEmbed && (
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              id={`datahub-embed-${source.key}`}
              initial={reduce ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={reduce ? undefined : { opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="relative mt-4 overflow-hidden border-t border-rule/60 pt-4"
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </motion.section>
  )
}
