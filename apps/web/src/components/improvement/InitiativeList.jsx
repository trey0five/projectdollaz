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
import { AlertTriangle, ChevronRight, UserRound } from 'lucide-react'
import {
  IMPROVEMENT_HUE,
  ORIGIN_LABELS,
  RISK_SIGNAL_META,
  STATUS_LABELS,
  hueAlpha,
  pctLabel,
  shortDate,
} from './improvementMeta.js'

const SIGNAL_CLASS = {
  bad: 'border-danger/35 bg-danger/10 text-danger',
  warn: 'border-amber-400/40 bg-amber-50 text-amber-700',
  good: 'border-rule/60 bg-cream/60 text-muted',
}

export default function InitiativeList({ initiatives = [], onOpen, reduce = false }) {
  if (initiatives.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-rule/60 bg-cream/50 px-6 py-12 text-center">
        <p className="font-serif text-[16px] italic text-muted">No initiatives yet.</p>
        <p className="mt-1 text-[13px] text-muted">
          Take one of the recommendations above, or add your own — either way it gets an owner, a
          date and a way to measure itself.
        </p>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-rule/40 rounded-xl border border-rule/50">
      {initiatives.map((it, i) => {
        const signal = RISK_SIGNAL_META[it.riskSignal] ?? RISK_SIGNAL_META.none
        const pct = pctLabel(it.progressPct)
        const due = shortDate(it.dueDate)
        return (
          <motion.li
            key={it.id}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduce ? 0 : Math.min(i * 0.03, 0.18), duration: 0.24 }}
            data-testid="initiative-row"
          >
            <button
              type="button"
              onClick={() => onOpen?.(it)}
              className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 text-left transition hover:bg-cream/60"
            >
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: it.progressSource ? IMPROVEMENT_HUE : hueAlpha(0.3) }}
              />
              <span className="min-w-0 flex-1 basis-[240px]">
                <span className="block truncate text-[13.5px] font-semibold text-navy">{it.title}</span>
                <span className="block truncate text-[11.5px] text-muted">
                  {ORIGIN_LABELS[it.originType] ?? it.originType}
                  {it.goalTitle ? ` · ${it.goalTitle}` : ''}
                </span>
              </span>

              <span className="shrink-0 rounded-md border border-rule/60 bg-white px-1.5 py-0.5 text-[11.5px] font-semibold text-muted">
                {STATUS_LABELS[it.status] ?? it.status}
              </span>

              <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-navy">
                {pct ?? (
                  <span className="font-normal text-muted" data-testid="no-pct-label">
                    {it.progressSource == null ? 'Status only' : 'Not measured yet'}
                  </span>
                )}
              </span>

              <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-muted">
                <UserRound size={12} aria-hidden />
                {it.owner?.name ?? 'Unassigned'}
              </span>

              <span className="shrink-0 text-[12px] text-muted">{due ? `due ${due}` : 'no due date'}</span>

              {it.riskSignal && it.riskSignal !== 'none' ? (
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-semibold ${
                    SIGNAL_CLASS[signal.tone] ?? SIGNAL_CLASS.good
                  }`}
                >
                  <AlertTriangle size={11} aria-hidden />
                  {signal.label}
                </span>
              ) : null}

              <ChevronRight size={14} className="shrink-0 text-muted" aria-hidden />
            </button>
          </motion.li>
        )
      })}
    </ul>
  )
}
