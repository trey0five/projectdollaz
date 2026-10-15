// ─────────────────────────────────────────────────────────────────────────────
// CampaignProgress — the fundraising progress RULE. One viz, two cuts:
//   size="row"  — a 2px rule + "{pct}% of goal" caption for register rows.
//   size="hero" — a 4px rule + raised/pledged caption + pace mark for the
//                 campaign detail header.
// Segments: RECEIVED (solid ink, or the module hue rule under ModuleAccent)
// then PLEDGED-OUTSTANDING (hatched ink). A 1px ink PACE TICK marks how much of
// the campaign timeline has elapsed, so "54% raised, 80% elapsed" reads at a
// glance. Goal exceeded → a good-green end mark. No goal → the bare hairline
// track and "no goal set". Premium UI P4: a rule, never a fat rounded bar.
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion'
import { fmtMoneyFull, fmtPct } from './campaignMeta.js'
import { Pill } from '../ui/surface/index.js'
import '../../styles/pending/b1-domain.css'

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

/**
 * The campaign's pace against its own timeline: % of goal raised vs % of the
 * window elapsed (±5pt deadband). Null when there is no goal or no window —
 * never a guess. { label, tone } with tone good | risk | neutral.
 */
export function campaignPace({ raised, goal, startDate, closeDate, status = null }) {
  const hasGoal = typeof goal === 'number' && Number.isFinite(goal) && goal > 0
  if (!hasGoal) return null
  // Pace only means something while a campaign is running: a PLANNED one has
  // not started (nothing could be raised yet), and a CLOSED one has an
  // outcome, not a pace — "Closed at 80% of goal", never "Behind pace" forever.
  if (status === 'planned') return null
  const raisedNum = typeof raised === 'number' && Number.isFinite(raised) ? raised : 0
  const pct = raisedNum / goal
  if (status === 'closed') {
    return { label: `Closed at ${fmtPct(pct) ?? '0%'} of goal`, tone: pct >= 1 ? 'good' : 'neutral', closed: true }
  }
  if (pct > 1) return { label: 'Goal exceeded', tone: 'good' }
  const elapsed = timelineElapsed(startDate, closeDate)
  if (elapsed == null) return null
  if (pct >= elapsed + 0.05) return { label: 'Ahead of pace', tone: 'good' }
  if (pct <= elapsed - 0.05) return { label: 'Behind pace', tone: 'risk' }
  return { label: 'On pace', tone: 'neutral' }
}

export default function CampaignProgress({
  raised,
  pledgedOutstanding = 0,
  goal,
  startDate,
  closeDate,
  status = null, // 'planned' | 'active' | 'closed' — pace is judged only while active
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
  const paceChip = hero ? campaignPace({ raised: raisedNum, goal, startDate, closeDate, status }) : null

  const pctLabel = fmtPct(pct)
  const HATCH = 'repeating-linear-gradient(135deg, rgb(var(--c-ink) / 0.55) 0 2px, transparent 2px 4px)'

  const track = (
    <div className={`b1-prog${hero ? ' b1-prog-lg' : ''} !overflow-visible`}>
      {hasGoal ? (
        <>
          <motion.span
            className="b1-prog-fill tone-ink origin-left"
            style={{ '--pct': receivedFrac * 100 }}
            initial={reduce ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: reduce ? 0 : 0.6, ease: [0.22, 1, 0.36, 1] }}
          />
          {pledgedFrac > 0 ? (
            <span
              className="absolute inset-y-0"
              style={{ left: `${receivedFrac * 100}%`, width: `${pledgedFrac * 100}%`, backgroundImage: HATCH }}
              title="Committed, not yet received"
            />
          ) : null}
          {over ? <span className="absolute -inset-y-1 right-0 w-[2px] bg-good" aria-hidden="true" /> : null}
          {elapsed != null ? (
            <span
              className="b1-prog-tick"
              style={{ '--at': elapsed * 100 }}
              title={`Pace: ${Math.round(elapsed * 100)}% of timeline elapsed`}
            />
          ) : null}
        </>
      ) : null}
    </div>
  )

  if (!hero) {
    return (
      <div>
        {track}
        <div className="mt-1.5 text-[11.5px] font-semibold tabular-nums text-ink2">
          {pctLabel ? `${pctLabel} of goal` : 'no goal set'}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      {track}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[13px]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-ink2">
            <span className="font-semibold tabular-nums text-ink">{fmtMoneyFull(raisedNum)}</span> raised
          </span>
          {outstanding > 0 ? (
            <span className="tabular-nums text-ink2">
              <span className="font-semibold text-ink">+{fmtMoneyFull(outstanding)}</span> pledged
            </span>
          ) : null}
          {paceChip ? (
            <Pill variant="status" tone={paceChip.tone}>
              {paceChip.label}
            </Pill>
          ) : null}
        </div>
        <span className="font-semibold tabular-nums text-ink2">
          {hasGoal ? `${pctLabel ?? '0%'} of ${fmtMoneyFull(goal)}` : 'no goal set'}
        </span>
      </div>
    </div>
  )
}
