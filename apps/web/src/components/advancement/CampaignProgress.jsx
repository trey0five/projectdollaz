// ─────────────────────────────────────────────────────────────────────────────
// CampaignProgress — the fundraising thermometer. One viz, two cuts:
//   size="row"  — compact bar + "{pct}% of goal" caption for register rows.
//   size="hero" — tall bar + raised/pledged caption + pace chip for the
//                 campaign detail hero.
// Segments: RECEIVED (bg-gold-gradient — resolves to the module's rose CTA
// gradient inside ModuleAccent, so hue-awareness is free) then PLEDGED-
// OUTSTANDING (translucent gold). A thin navy PACE TICK marks how much of the
// campaign timeline has elapsed, so "54% raised, 80% elapsed" reads at a glance.
// No goal → dashed empty track ("no goal set").
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion'
import { fmtMoneyFull, fmtPct } from './campaignMeta.js'

// Fraction of the campaign timeline already elapsed (0..1), or null when the
// window is unknown/degenerate. UTC-anchored like shortDate to avoid tz drift.
function timelineElapsed(startDate, closeDate) {
  if (!startDate || !closeDate) return null
  const start = new Date(`${startDate.slice(0, 10)}T00:00:00.000Z`).getTime()
  const close = new Date(`${closeDate.slice(0, 10)}T00:00:00.000Z`).getTime()
  if (Number.isNaN(start) || Number.isNaN(close) || close <= start) return null
  const now = Date.now()
  return Math.min(Math.max((now - start) / (close - start), 0), 1)
}

export default function CampaignProgress({
  raised,
  pledgedOutstanding = 0,
  goal,
  startDate,
  closeDate,
  size = 'row', // 'row' | 'hero'
  reduce,
}) {
  const hero = size === 'hero'
  const hasGoal = typeof goal === 'number' && Number.isFinite(goal) && goal > 0
  const raisedNum = typeof raised === 'number' && Number.isFinite(raised) ? raised : 0
  const outstanding =
    typeof pledgedOutstanding === 'number' && Number.isFinite(pledgedOutstanding)
      ? Math.max(pledgedOutstanding, 0)
      : 0

  const pct = hasGoal ? raisedNum / goal : null
  const over = hasGoal && pct > 1
  const receivedFrac = hasGoal ? Math.min(Math.max(pct, 0), 1) : 0
  // Pledged-but-not-received rides on top of received, capped at the track end.
  const pledgedFrac = hasGoal ? Math.min(outstanding / goal, Math.max(1 - receivedFrac, 0)) : 0

  const elapsed = hasGoal ? timelineElapsed(startDate, closeDate) : null

  // Hero pace chip: compare % of goal to % of timeline elapsed (±5pt deadband).
  let paceChip = null
  if (hero && hasGoal) {
    if (over) paceChip = { label: 'Goal exceeded', cls: 'border-emerald-300/70 bg-emerald-50 text-emerald-700' }
    else if (elapsed != null) {
      if (pct >= elapsed + 0.05)
        paceChip = { label: 'Ahead of pace', cls: 'border-emerald-300/70 bg-emerald-50 text-emerald-700' }
      else if (pct <= elapsed - 0.05)
        paceChip = { label: 'Behind pace', cls: 'border-danger/30 bg-danger/10 text-danger' }
      else paceChip = { label: 'On pace', cls: 'border-rule/60 bg-section text-muted' }
    }
  }

  const trackH = hero ? 'h-4' : 'h-2.5'
  const pctLabel = fmtPct(pct)

  const track = hasGoal ? (
    <div className={`relative w-full overflow-hidden rounded-full border border-rule/50 bg-section ${trackH}`}>
      <div className="absolute inset-0 flex">
        <motion.div
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${receivedFrac * 100}%` }}
          transition={{ duration: reduce ? 0 : 0.6, ease: 'easeOut' }}
          className="h-full shrink-0 bg-gold-gradient"
        />
        {pledgedFrac > 0 ? (
          <motion.div
            initial={reduce ? false : { width: 0 }}
            animate={{ width: `${pledgedFrac * 100}%` }}
            transition={{ duration: reduce ? 0 : 0.6, ease: 'easeOut' }}
            className="h-full shrink-0 bg-gold/30"
            title="Committed, not yet received"
          />
        ) : null}
      </div>
      {/* Goal exceeded → emerald end-cap on the maxed bar. */}
      {over ? <div className="absolute inset-y-0 right-0 w-1.5 bg-emerald-500" /> : null}
      {/* Pace tick — how far through the campaign window today sits. */}
      {elapsed != null ? (
        <div
          className="absolute inset-y-0 w-[2px] bg-navy/50"
          style={{ left: `${elapsed * 100}%` }}
          title={`Pace: ${Math.round(elapsed * 100)}% of timeline elapsed`}
        />
      ) : null}
    </div>
  ) : (
    <div className={`w-full rounded-full border border-dashed border-rule/60 bg-section/60 ${trackH}`} />
  )

  if (!hero) {
    return (
      <div>
        {track}
        <div className="mt-1 text-[11.5px] font-semibold text-muted">
          {pctLabel ? `${pctLabel} of goal` : 'no goal set'}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {track}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[13px]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-muted">
            <span className="font-semibold text-navy">{fmtMoneyFull(raisedNum)}</span> raised
          </span>
          {outstanding > 0 ? (
            <span className="font-semibold text-gold">+{fmtMoneyFull(outstanding)} pledged</span>
          ) : null}
          {paceChip ? (
            <span
              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11.5px] font-semibold ${paceChip.cls}`}
            >
              {paceChip.label}
            </span>
          ) : null}
        </div>
        <span className="font-semibold text-muted">
          {hasGoal ? `${pctLabel ?? '0%'} of ${fmtMoneyFull(goal)}` : 'no goal set'}
        </span>
      </div>
    </div>
  )
}
