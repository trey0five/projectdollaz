// ─────────────────────────────────────────────────────────────────────────────
// GoalCard — the self-measuring MONEY shot of Strategic Planning. Every metric
// goal proves it isn't typed in: a baseline→current→target RAIL with an animated
// current marker (left 0→pctToTarget) and a faint "expected pace" GHOST marker at
// expectedPct — the visible GAP between them IS the verdict, shown not asserted. A
// pace-severity chip, the band-status trend Sparkline, a big count-up of the live
// value, and — for metric goals ONLY — a PULSING gold pill naming the metric it is
// computed from. Milestone goals show {done}/{total} with a neutral chip and NO
// live pill (honest about the difference). On-theme, reduced-motion respected.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Zap, Flag, ListChecks, User, Pencil, Trash2, ArrowUpRight } from 'lucide-react'
import Sparkline from '../analytics/Sparkline.jsx'
import PaceChip, { paceMeta } from './PaceChip.jsx'

// ── Count up a FORMATTED metric string ("$1,234" · "8.5%" · "42 days") by
// animating only its numeric token and re-formatting to the same decimals, so we
// never need the format descriptor — the API's formatted string is the template.
function AnimatedFormatted({ formatted, value, className }) {
  const reduce = useReducedMotion()
  const match = typeof formatted === 'string' ? formatted.match(/^(\D*)([\d,]+(?:\.\d+)?)(.*)$/s) : null
  // canAnimate is a STABLE boolean — never put the fresh `match` array in the effect
  // deps or the count restarts on every render (flickers back to 0).
  const canAnimate = typeof value === 'number' && Number.isFinite(value) && !!match && !reduce
  const [n, setN] = useState(canAnimate ? 0 : value)

  useEffect(() => {
    if (!canAnimate) return undefined
    const start = performance.now()
    let raf
    const tick = (now) => {
      const t = Math.min(1, (now - start) / 900)
      const eased = 1 - (1 - t) ** 3
      setN(eased * value)
      if (t < 1) raf = requestAnimationFrame(tick)
      else setN(value)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [canAnimate, value])

  if (!match) return <span className={className}>{formatted ?? '—'}</span>
  const [, prefix, numStr, suffix] = match
  const decimals = numStr.includes('.') ? numStr.split('.')[1].length : 0
  const shown = reduce
    ? formatted
    : `${prefix}${n.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}${suffix}`
  return <span className={`tabular-nums ${className ?? ''}`}>{shown}</span>
}

// The baseline→current→target rail. current & ghost are 0..1 fractions.
function ProgressRail({ current, expected, reduce, formattedBaseline, formattedTarget, overshoot }) {
  const cur = Math.min(Math.max(current ?? 0, 0), 1)
  const hasGhost = typeof expected === 'number' && Number.isFinite(expected)
  const ghost = hasGhost ? Math.min(Math.max(expected, 0), 1) : null
  const behind = hasGhost && cur < ghost

  return (
    <div className="mt-1">
      {/* the rail + markers */}
      <div className="relative h-11">
        {/* track */}
        <div className="absolute inset-x-0 top-[26px] h-2.5 overflow-hidden rounded-full border border-rule/50 bg-section">
          <motion.div
            className={`h-full ${overshoot ? 'bg-emerald-500' : 'bg-gold-gradient'}`}
            initial={reduce ? false : { width: 0 }}
            animate={{ width: `${cur * 100}%` }}
            transition={{ duration: reduce ? 0 : 0.9, ease: 'easeOut' }}
          />
        </div>

        {/* expected-pace GHOST marker */}
        {hasGhost ? (
          <motion.div
            className="absolute top-[16px] flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${ghost * 100}%` }}
            initial={reduce ? { opacity: 0 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: reduce ? 0 : 0.5 }}
          >
            <span className="h-[22px] w-0 border-l-2 border-dashed border-navy/45" />
            <span className="mt-0.5 whitespace-nowrap text-[9.5px] font-semibold uppercase tracking-[0.08em] text-navy/50">
              pace
            </span>
          </motion.div>
        ) : null}

        {/* CURRENT marker (animated along the rail) */}
        <motion.div
          className="absolute top-[18px] -translate-x-1/2"
          initial={reduce ? false : { left: '0%' }}
          animate={{ left: `${cur * 100}%` }}
          transition={{ duration: reduce ? 0 : 0.9, ease: 'easeOut' }}
        >
          <span
            className={`block h-[18px] w-[18px] rounded-full border-[3px] border-white shadow-glow ${
              overshoot ? 'bg-emerald-500' : 'bg-gold'
            }`}
          />
        </motion.div>
      </div>

      {/* baseline / target end-labels + the verdict caption */}
      <div className="mt-1 flex items-center justify-between text-[11.5px] font-semibold text-muted">
        <span>{formattedBaseline ?? '—'}<span className="ml-1 font-normal uppercase tracking-[0.08em] text-muted/70">base</span></span>
        {hasGhost ? (
          <span className={behind ? 'text-danger' : 'text-emerald-600'}>
            {behind ? 'Behind pace' : 'Ahead of pace'}
          </span>
        ) : null}
        <span className="ml-1 font-normal uppercase tracking-[0.08em] text-muted/70">target<span className="ml-1 font-semibold not-italic text-navy">{formattedTarget ?? '—'}</span></span>
      </div>
    </div>
  )
}

export default function GoalCard({ goal, index = 0, canEdit, onEdit, onDelete }) {
  const reduce = useReducedMotion()
  const isMetric = goal.goalType === 'metric'
  const isMilestone = goal.goalType === 'milestone'
  const isTaskRollup = goal.goalType === 'task_rollup'
  const meta = paceMeta(goal.paceStatus)

  const milestones = goal.milestones ?? []
  const msDone = milestones.filter((m) => m.done).length
  const taskDone = goal.linkedTaskCounts?.done ?? 0
  const taskTotal = goal.linkedTaskCounts?.total ?? 0

  const trendPoints = (goal.trend ?? []).map((t) => ({ periodEndDate: t.date, value: t.value }))

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduce ? 0 : index * 0.06, type: 'spring', stiffness: 240, damping: 24 }}
      whileHover={reduce ? undefined : { y: -3 }}
      className="card-soft group relative flex flex-col overflow-hidden p-4 sm:p-5"
    >
      {/* header — pillar/metric eyebrow, title, pace chip */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {goal.pillarName ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{goal.pillarName}</p>
          ) : null}
          <h3 className="mt-0.5 font-serif text-[18px] font-semibold leading-snug text-navy">{goal.title}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <PaceChip status={goal.paceStatus} />
          {canEdit && onEdit ? (
            <button
              type="button"
              onClick={() => onEdit(goal)}
              aria-label={`Edit ${goal.title}`}
              className="rounded-lg border border-rule/60 p-1.5 text-muted opacity-0 transition hover:border-gold/60 hover:text-navy group-hover:opacity-100"
            >
              <Pencil size={14} />
            </button>
          ) : null}
          {canEdit && onDelete ? (
            <button
              type="button"
              onClick={() => onDelete(goal)}
              aria-label={`Delete ${goal.title}`}
              className="rounded-lg border border-rule/60 p-1.5 text-muted opacity-0 transition hover:border-danger/50 hover:text-danger group-hover:opacity-100"
            >
              <Trash2 size={14} />
            </button>
          ) : null}
        </div>
      </div>

      {/* big current value */}
      <div className="mt-3 flex items-end gap-2">
        {isMetric ? (
          <AnimatedFormatted
            formatted={goal.formattedCurrent}
            value={goal.current}
            className="font-serif text-[34px] font-semibold leading-none text-navy"
          />
        ) : isMilestone ? (
          <span className="font-serif text-[34px] font-semibold leading-none text-navy tabular-nums">
            {msDone}
            <span className="text-muted">/{milestones.length}</span>
          </span>
        ) : (
          <span className="font-serif text-[34px] font-semibold leading-none text-navy tabular-nums">
            {taskDone}
            <span className="text-muted">/{taskTotal}</span>
          </span>
        )}
        <span className="pb-1 text-[12.5px] font-semibold text-muted">
          {isMetric ? goal.metricLabel : isMilestone ? 'milestones done' : 'tasks done'}
        </span>
        {goal.overshoot ? (
          <span className="mb-1 inline-flex items-center gap-1 rounded-md border border-emerald-300/70 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">
            <ArrowUpRight size={12} /> Past target
          </span>
        ) : null}
      </div>

      {/* the self-measuring rail (metric + task_rollup have a pct-to-target) */}
      {isMilestone ? (
        <div className="mt-4">
          <div className="h-2.5 w-full overflow-hidden rounded-full border border-rule/50 bg-section">
            <motion.div
              className="h-full bg-gold-gradient"
              initial={reduce ? false : { width: 0 }}
              animate={{ width: `${milestones.length ? (msDone / milestones.length) * 100 : 0}%` }}
              transition={{ duration: reduce ? 0 : 0.8, ease: 'easeOut' }}
            />
          </div>
          <ul className="mt-2.5 flex flex-col gap-1">
            {milestones.slice(0, 4).map((m) => (
              <li key={m.id} className="flex items-center gap-2 text-[12.5px]">
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                    m.done ? 'border-gold bg-gold text-navy' : 'border-rule/70 bg-white text-transparent'
                  }`}
                >
                  <Flag size={9} />
                </span>
                <span className={m.done ? 'text-muted line-through' : 'text-navy'}>{m.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ProgressRail
          current={goal.pctToTarget}
          expected={goal.expectedPct}
          reduce={reduce}
          formattedBaseline={goal.formattedBaseline}
          formattedTarget={goal.formattedTarget}
          overshoot={goal.overshoot}
        />
      )}

      {/* trend sparkline — status-coloured to the band, target drawn as the line */}
      {trendPoints.length >= 2 ? (
        <div className="mt-3">
          <Sparkline
            points={trendPoints}
            status={meta.dot}
            threshold={typeof goal.target === 'number' ? goal.target : null}
            thresholdLabel={goal.formattedTarget}
            height={44}
          />
        </div>
      ) : null}

      {/* footer — owner + the LIVE pill (metric only) */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-rule/40 pt-3">
        <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
          {goal.owner?.name ? (
            <>
              <User size={13} /> {goal.owner.name}
            </>
          ) : (
            <span className="text-muted/70">Unassigned</span>
          )}
        </span>

        {isMetric ? (
          <motion.span
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: reduce ? 0 : 0.35 }}
            className={`inline-flex items-center gap-1.5 rounded-full border border-gold/50 bg-gold/10 px-2.5 py-1 text-[11.5px] font-semibold text-[#7a5e00] ${
              reduce ? '' : 'animate-pulse-ring'
            }`}
            title={`This goal reads ${goal.metricLabel} live from your financials — it is never typed in.`}
          >
            <Zap size={12} className="text-gold" />
            Computed live from your QuickBooks &amp; enrollment data — not typed in
          </motion.span>
        ) : isTaskRollup ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rule/60 bg-section px-2.5 py-1 text-[11.5px] font-semibold text-muted">
            <ListChecks size={12} /> Rolls up from linked tasks
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rule/60 bg-section px-2.5 py-1 text-[11.5px] font-semibold text-muted">
            <Flag size={12} /> Tracked by milestones
          </span>
        )}
      </div>
    </motion.div>
  )
}
