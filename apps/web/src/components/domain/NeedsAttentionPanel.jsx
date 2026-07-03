// ─────────────────────────────────────────────────────────────────────────────
// NeedsAttentionPanel — the right-hand rail of the Domain Command Center. A
// prioritised list of "items that need a decision" for the domain: each row is a
// status dot + a bold navy title + a muted one-line "why" + optional one-click
// action button(s). Presentational — the parent computes the items and wires the
// actions. Empty state is a friendly "all caught up".
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'
import StatusDot from '../analytics/StatusDot.jsx'

function ActionButton({ action }) {
  const cls = action.primary
    ? 'bg-gold-gradient text-navy shadow-glow hover:brightness-105'
    : 'border border-rule/70 bg-white text-navy hover:border-gold/60 hover:text-gold'
  return (
    <button
      type="button"
      onClick={action.onClick}
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-semibold transition ${cls}`}
    >
      {action.label}
    </button>
  )
}

export default function NeedsAttentionPanel({ items = [] }) {
  const reduce = useReducedMotion()

  return (
    <div className="card-soft flex flex-col p-4 sm:p-5">
      <h2 className="font-serif text-lg font-semibold text-navy">Needs attention</h2>

      {items.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-rule/60 bg-cream/60 px-4 py-8 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={20} />
          </span>
          <p className="text-[14px] font-semibold text-navy">You&apos;re all caught up</p>
          <p className="text-[12.5px] text-muted">No decisions waiting on you right now.</p>
        </div>
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {items.map((item, i) => (
            <motion.li
              key={item.id}
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: 8 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="flex gap-2.5 rounded-xl border border-rule/50 bg-cream/50 p-3"
            >
              <span className="mt-1.5 shrink-0">
                <StatusDot status={item.tone} size={9} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold leading-snug text-navy">{item.title}</p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{item.why}</p>
                {item.actions?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {item.actions.map((action, ai) => (
                      <ActionButton key={ai} action={action} />
                    ))}
                  </div>
                ) : null}
              </div>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  )
}
