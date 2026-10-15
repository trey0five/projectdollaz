// ─────────────────────────────────────────────────────────────────────────────
// InitiativeList — the /improvement register: every initiative for the school,
// GOAL-AGNOSTIC (a Phase-G initiative may be attached to no strategic goal at
// all), one clickable row each.
//
// A row shows a percentage ONLY when the server computed one. `progressPct` is
// null for every status-only row — the legacy shape — and those rows read
// "Status only", never "0%". The same rule the drawer holds, at the summary
// altitude where it is easiest to break.
//
// AND "Status only" IS NOT THE ONLY WAY TO HAVE NO PERCENTAGE. A row bound to a
// KPI the school has not yet reported comes back with `progressSource: 'metric'`
// and `progressPct: null` (computePace with a null current → `no_data`). Printing
// "Status only" there would report that nobody chose to measure this work, when in
// fact somebody did and the reading has not arrived — two different facts, and the
// second is the one that should send a head of school to the data hub. So the
// no-percentage label is chosen from `progressSource`, not from the null.
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion'
import { ChevronRight, UserRound } from 'lucide-react'
import { Pill } from '../ui/surface/index.js'
import '../../styles/pending/b1-domain.css'
import { ORIGIN_LABELS, RISK_SIGNAL_META, STATUS_LABELS, pctLabel, shortDate } from './improvementMeta.js'

// Server risk-signal tone → the Pill / mark tone.
const SIGNAL_TONE = { bad: 'risk', warn: 'watch', good: 'neutral' }

export default function InitiativeList({ initiatives = [], onOpen, reduce = false }) {
  if (initiatives.length === 0) {
    return (
      <div className="b1-empty">
        <p className="b1-empty-title">No initiatives yet</p>
        <p>
          Take one of the recommendations above, or add your own. Either way it gets an owner, a date and a way to
          measure itself.
        </p>
      </div>
    )
  }

  return (
    <ul className="b1-list">
      {initiatives.map((it, i) => {
        const signal = RISK_SIGNAL_META[it.riskSignal] ?? RISK_SIGNAL_META.none
        const flagged = it.riskSignal && it.riskSignal !== 'none'
        const tone = SIGNAL_TONE[signal.tone] ?? 'neutral'
        const pct = pctLabel(it.progressPct)
        const due = shortDate(it.dueDate)
        return (
          <motion.li
            key={it.id}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: reduce ? 0 : Math.min(i * 0.015, 0.3), duration: 0.24 }}
            data-testid="initiative-row"
          >
            <button
              type="button"
              onClick={() => onOpen?.(it)}
              className="b1-row b1-row-link relative w-full !pl-3 text-left lg:!flex-nowrap"
            >
              {/* the 2px status mark: the server's risk signal, or nothing */}
              {flagged ? (
                <i className={`absolute bottom-2 left-0 top-2 w-[2px] tone-${tone}`} style={{ background: 'currentColor' }} aria-hidden />
              ) : null}
              <span className="min-w-0 flex-1 basis-[240px]">
                <span className="block font-semibold text-ink [overflow-wrap:anywhere]">{it.title}</span>
                <span className="block text-[11.5px] text-ink2">
                  {ORIGIN_LABELS[it.originType] ?? it.originType}
                  {it.goalTitle ? ` · ${it.goalTitle}` : ''}
                </span>
              </span>

              <span className="shrink-0 text-[12px] text-ink2">{STATUS_LABELS[it.status] ?? it.status}</span>

              <span className="shrink-0 whitespace-nowrap text-right text-[13px] font-semibold tabular-nums text-ink">
                {pct ?? (
                  <span className="font-normal text-ink2" data-testid="no-pct-label">
                    {it.progressSource == null ? 'Status only' : 'Not measured yet'}
                  </span>
                )}
              </span>

              <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[12px] text-ink2">
                <UserRound size={12} aria-hidden />
                {it.owner?.name ?? 'Unassigned'}
              </span>

              <span className="shrink-0 whitespace-nowrap text-[12px] tabular-nums text-ink2">{due ? `due ${due}` : 'no due date'}</span>

              {flagged ? (
                <Pill variant="status" tone={tone}>
                  {signal.label}
                </Pill>
              ) : null}

              <ChevronRight size={14} className="shrink-0 text-ink2" aria-hidden />
            </button>
          </motion.li>
        )
      })}
    </ul>
  )
}
