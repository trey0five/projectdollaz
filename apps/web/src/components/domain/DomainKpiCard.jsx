// ─────────────────────────────────────────────────────────────────────────────
// DomainKpiCard — one KPI tile for the Domain Command Center. Presentational and
// domain-agnostic: a label, a status dot, a big serif value, a colored sub-stat
// line, and a DECORATIVE status-colored gradient "wash" at the foot.
//
// The wash is a stylized motif — NOT data. These domains (Governance, Facilities,
// Advancement, Accreditation) carry no time-series, so we never draw a fake
// sparkline; the wash simply re-states the tile's health as a soft flourish.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import StatusDot from '../analytics/StatusDot.jsx'

// Status → the wash gradient + top-rule color. Mirrors StatusDot's mapping
// (good=gold, watch=navy-soft, risk=danger) so the dot and wash always agree.
const WASH = {
  good: { grad: 'from-gold/[0.14]', rule: 'bg-gold' },
  watch: { grad: 'from-navy-soft/[0.14]', rule: 'bg-navy-soft' },
  risk: { grad: 'from-danger/[0.14]', rule: 'bg-danger' },
  neutral: { grad: 'from-rule/[0.2]', rule: 'bg-rule' },
}

// Sub-stat tone → text color (bad=danger red, good=emerald, neutral=gold accent).
const SUB_TONE = {
  bad: 'text-danger',
  good: 'text-emerald-600',
  neutral: 'text-gold',
}

export default function DomainKpiCard({ label, value, sub, status = 'neutral', index = 0 }) {
  const reduce = useReducedMotion()
  const wash = WASH[status] ?? WASH.neutral
  const SubIcon = sub?.icon
  const toneCls = SUB_TONE[sub?.tone] ?? SUB_TONE.neutral

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, type: 'spring', stiffness: 260, damping: 22 }}
      className="card-soft relative flex flex-col overflow-hidden"
    >
      <div className="flex flex-col gap-3 p-4 pb-6 sm:p-5 sm:pb-7">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-sans text-[12px] font-semibold uppercase leading-snug tracking-[0.1em] text-muted">
            {label}
          </h3>
          <span className="mt-0.5 shrink-0">
            <StatusDot status={status} size={9} />
          </span>
        </div>

        <div className="font-serif text-[26px] font-semibold leading-none text-navy sm:text-[30px]">
          {value}
        </div>

        {sub ? (
          <div className={`flex items-center gap-1.5 text-[13px] font-semibold ${toneCls}`}>
            {SubIcon ? <SubIcon size={14} className="shrink-0" /> : null}
            <span className="truncate">{sub.text}</span>
          </div>
        ) : null}
      </div>

      {/* Decorative status wash — a soft gradient flourish with a thin top rule.
          Not a data sparkline; a stylized health motif. */}
      <div className="pointer-events-none relative mt-auto h-10 w-full">
        <div className={`absolute inset-x-0 top-0 h-[2px] ${wash.rule}`} />
        <div className={`absolute inset-0 bg-gradient-to-t ${wash.grad} to-transparent`} />
      </div>
    </motion.div>
  )
}
