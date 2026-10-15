// ─────────────────────────────────────────────────────────────────────────────
// GoalCard — the self-measuring MONEY shot of Strategic Planning, rendered as a
// RULED ROW on the ground (Premium UI P4: goals are rows with a progress rule +
// a status mark, not cards). Every metric goal proves it isn't typed in: a
// baseline→current→target RULE whose fill grows to pctToTarget, with an ink
// "expected pace" tick at expectedPct — the visible GAP between them IS the
// verdict, shown not asserted. A pace Pill, the band-status trend Sparkline, a
// Garamond count-up of the live value, and — for metric goals ONLY — a plain
// "computed live" source line naming the metric it reads. Milestone goals show
// {done}/{total} and their milestones (honest about the difference). The parent
// renders these inside a `.b1-list`. Reduced-motion respected.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Zap, Flag, ListChecks, User, Pencil, Trash2, Check } from 'lucide-react'
import Sparkline from '../analytics/Sparkline.jsx'
import { Pill } from '../ui/surface/index.js'
import PaceChip, { paceMeta } from './PaceChip.jsx'
import '../../styles/pending/b1-domain.css'

// ── Count up a FORMATTED metric string ("$1,234" · "8.5%" · "42 days") by
// animating only its numeric token and re-formatting to the same decimals, so we
// never need the format descriptor — the API's formatted string is the template.
function AnimatedFormatted({ formatted, className }) {
  const reduce = useReducedMotion()
  const match = typeof formatted === 'string' ? formatted.match(/^(\D*)([\d,]+(?:\.\d+)?)(.*)$/s) : null
  // Count toward the number the FORMATTED string shows, never the raw value: a
  // percent goal's raw current is a 0..1 fraction (0.05) while the string reads
  // "5.0%", so animating the raw value would settle on "0.1%".
  const target = match ? parseFloat(match[2].replace(/,/g, '')) : NaN
  // canAnimate is a STABLE boolean — never put the fresh `match` array in the effect
  // deps or the count restarts on every render (flickers back to 0).
  const canAnimate = Number.isFinite(target) && !reduce
  const [n, setN] = useState(canAnimate ? 0 : target)

  useEffect(() => {
    if (!canAnimate) return undefined
    const start = performance.now()
    let raf
    const tick = (now) => {
      const t = Math.min(1, (now - start) / 900)
      const eased = 1 - (1 - t) ** 3
      setN(eased * target)
      if (t < 1) raf = requestAnimationFrame(tick)
      else setN(target)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [canAnimate, target])

  if (!match) return <span className={className}>{formatted ?? '—'}</span>
  const [, prefix, numStr, suffix] = match
  const decimals = numStr.includes('.') ? numStr.split('.')[1].length : 0
  const shown =
    reduce || !Number.isFinite(n)
      ? formatted
      : `${prefix}${n.toLocaleString('en-US', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })}${suffix}`
  return <span className={`tabular-nums ${className ?? ''}`}>{shown}</span>
}

// The baseline→current→target rule. current & expected are 0..1 fractions.
function ProgressRail({ current, expected, reduce, formattedBaseline, formattedTarget, overshoot }) {
  // No reading yet (paceStatus no_data → pctToTarget null): draw no fill and give
  // no Behind/Ahead verdict — a missing number is not a zero.
  const measured = typeof current === 'number' && Number.isFinite(current)
  const cur = measured ? Math.min(Math.max(current, 0), 1) : 0
  const hasGhost = typeof expected === 'number' && Number.isFinite(expected)
  const ghost = hasGhost ? Math.min(Math.max(expected, 0), 1) : null
  const behind = hasGhost && cur < ghost

  return (
    <div>
      <div className="b1-prog b1-prog-lg !overflow-visible">
        {measured ? (
          <motion.span
            className={`b1-prog-fill origin-left ${overshoot ? 'tone-good' : 'tone-ink'}`}
            style={{ '--pct': cur * 100 }}
            initial={reduce ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: reduce ? 0 : 0.9, ease: [0.22, 1, 0.36, 1] }}
          />
        ) : null}
        {hasGhost ? (
          <span className="b1-prog-tick" style={{ '--at': ghost * 100 }} title="Where pace says you should be today" />
        ) : null}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11.5px] font-semibold tabular-nums text-ink2">
        <span>
          {formattedBaseline ?? '—'}
          <span className="ml-1 font-normal uppercase tracking-[0.08em]">base</span>
        </span>
        {!measured ? (
          <span className="text-ink">Not measured yet</span>
        ) : hasGhost ? (
          <span className="inline-flex items-center gap-1.5 text-ink">
            <i className={`mark ${behind ? 'tone-risk' : 'tone-good'}`} aria-hidden="true" />
            {behind ? 'Behind pace' : 'Ahead of pace'}
          </span>
        ) : null}
        <span>
          <span className="mr-1 font-normal uppercase tracking-[0.08em]">target</span>
          <span className="text-ink">{formattedTarget ?? '—'}</span>
        </span>
      </div>
    </div>
  )
}

export default function GoalCard({ goal, canEdit, onEdit, onDelete }) {
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
    <div className="group relative grid gap-x-8 gap-y-3 py-4 pl-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* the 2px status mark — the row's verdict at a glance */}
      <i className={`absolute bottom-4 left-0 top-4 w-[2px] tone-${meta.tone}`} style={{ background: 'currentColor' }} aria-hidden="true" />

      {/* left — pillar eyebrow, title, the live value */}
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {goal.pillarName ? <p className="pg-eyebrow !mb-0.5">{goal.pillarName}</p> : null}
            <h3 className="font-serif text-[19px] font-medium leading-snug text-ink">{goal.title}</h3>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <PaceChip status={goal.paceStatus} />
            {canEdit && onEdit ? (
              <button type="button" onClick={() => onEdit(goal)} aria-label={`Edit ${goal.title}`} className="b1-icon-act dt-actions group-hover:opacity-100 group-focus-within:opacity-100">
                <Pencil size={14} />
              </button>
            ) : null}
            {canEdit && onDelete ? (
              <button
                type="button"
                onClick={() => onDelete(goal)}
                aria-label={`Delete ${goal.title}`}
                className="b1-icon-act b1-icon-act-danger dt-actions group-hover:opacity-100 group-focus-within:opacity-100"
              >
                <Trash2 size={14} />
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {isMetric ? (
            <AnimatedFormatted
              formatted={goal.formattedCurrent}
              className="font-serif text-[30px] font-medium leading-none text-ink"
            />
          ) : isMilestone ? (
            <span className="font-serif text-[30px] font-medium leading-none tabular-nums text-ink">
              {msDone}
              <span className="text-ink2">/{milestones.length}</span>
            </span>
          ) : (
            <span className="font-serif text-[30px] font-medium leading-none tabular-nums text-ink">
              {taskDone}
              <span className="text-ink2">/{taskTotal}</span>
            </span>
          )}
          <span className="text-[12.5px] font-semibold text-ink2">
            {isMetric ? goal.metricLabel : isMilestone ? 'milestones done' : 'tasks done'}
          </span>
          {goal.overshoot ? (
            <Pill variant="status" tone="good">
              Past target
            </Pill>
          ) : null}
        </div>

        {/* source line — owner + where the number comes from */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink2">
          <span className="inline-flex items-center gap-1.5">
            <User size={13} aria-hidden="true" />
            {goal.owner?.name ?? 'Unassigned'}
          </span>
          {isMetric ? (
            <span
              className="inline-flex items-center gap-1.5"
              title={`This goal reads ${goal.metricLabel} live from your financials — it is never typed in.`}
            >
              <Zap size={12} className="tone-hue" aria-hidden="true" />
              Computed live from your QuickBooks &amp; enrollment data, not typed in
            </span>
          ) : isTaskRollup ? (
            <span className="inline-flex items-center gap-1.5">
              <ListChecks size={12} aria-hidden="true" /> Rolls up from linked tasks
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Flag size={12} aria-hidden="true" /> Tracked by milestones
            </span>
          )}
        </div>
      </div>

      {/* right — the self-measuring rule (+ milestones) and the trend */}
      <div className="min-w-0 self-center">
        {isMilestone ? (
          <>
            <div className="b1-prog b1-prog-lg">
              <motion.span
                className="b1-prog-fill tone-ink origin-left"
                style={{ '--pct': milestones.length ? (msDone / milestones.length) * 100 : 0 }}
                initial={reduce ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: reduce ? 0 : 0.8, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <ul className="mt-2.5 flex flex-col gap-1">
              {milestones.slice(0, 4).map((m) => (
                <li key={m.id} className="flex items-center gap-2 text-[12.5px]">
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-sm border ${
                      m.done ? 'border-ink bg-ink text-white' : 'border-ink/25 bg-white text-transparent'
                    }`}
                    aria-hidden="true"
                  >
                    <Check size={10} strokeWidth={3} />
                  </span>
                  <span className={m.done ? 'text-ink2 line-through' : 'text-ink'}>{m.label}</span>
                </li>
              ))}
            </ul>
          </>
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
              height={40}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
