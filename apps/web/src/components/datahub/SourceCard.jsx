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
      className={`relative flex h-full flex-col rounded-2xl border-2 bg-white p-3.5 shadow-card transition-colors sm:p-5 ${ringCls}`}
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
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold sm:h-11 sm:w-11">
          <Icon size={20} className="sm:hidden" />
          <Icon size={22} className="hidden sm:block" />
        </span>
        <StatusBadge status={st} />
      </div>

      <h3 className="relative mt-2.5 font-serif text-base font-bold text-navy sm:mt-3 sm:text-xl">
        {source.title}
      </h3>
      <p className="relative mt-1 text-[12.5px] leading-relaxed text-muted sm:mt-1.5 sm:text-[15px]">
        {source.what}
      </p>

      {detail && (
        <p className="relative mt-2 text-[12px] font-medium text-navy/80 sm:mt-2.5 sm:text-[14.5px]">
          {detail}
        </p>
      )}

      {isActive && (
        <p className="relative mt-2 inline-flex items-center gap-1 self-start rounded-full bg-gold/15 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-gold sm:px-2.5 sm:text-[13px]">
          <Sparkles size={12} aria-hidden="true" /> Start here
        </p>
      )}

      {/* Flex spacer pins the action to the bottom so every card is the same height. */}
      <div className="relative mt-3 flex-1 sm:mt-4" />

      {/* Action: open the embed in a modal OR link out. */}
      <div className="relative">
        {isEmbed ? (
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex items-center gap-1.5 rounded-lg border-2 border-gold/40 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-gold transition-all hover:border-gold/70 hover:bg-gold/5 sm:px-3.5 sm:py-2 sm:text-[14px]"
          >
            {source.cta}
            <Maximize2 size={14} />
          </button>
        ) : (
          <Link
            to={source.to}
            className="group inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-gold transition-colors hover:text-gold-light sm:text-[14px]"
          >
            {source.cta}
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
      </div>
    </motion.section>
  )
}
