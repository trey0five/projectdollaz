// ─────────────────────────────────────────────────────────────────────────────
// E4 — ACTUAL vs PLAN, BY GRADE. The marquee chart: the whole-school number
// says whether you missed, and only this says WHICH GRADES CARRIED THE MISS.
//
// (The plan per grade has been resolved and thrown away by every consumer in the
// domain — EnrollmentPlanService.resolveDetailed() returns planByGrade and the
// summary endpoint keeps only the total. This is the first surface to draw it.)
//
// ── OBSERVED AND PLANNED ARE DIFFERENT CLASSES OF FACT, SO THEY ARE DIFFERENT
//    CLASSES OF MARK ────────────────────────────────────────────────────────
// The actual is a SOLID FILL: somebody counted those children. The plan is a
// DASHED OUTLINE in its own ink: nobody counted it, it is an intention typed
// into a budget. Two solid bars side by side — the default of every charting
// library and of the deck we are replacing — assert that both were observed, and
// one of them never was. The reader must be able to tell which number is a
// measurement without reading the legend.
//
// GRADES STAY IN CANONICAL ORDER, never sorted by size or by gap. The grades are
// a ladder; re-ordering them by value destroys the only axis the chart has.
//
// COLOUR SITS ON THE GAP READOUT, NOT ON THE BAR. A grade under plan is not a
// red grade — it is a grade with a red gap. Painting the whole bar red would
// mark the children in it as a problem.
//
// Bars are zero-based by construction (width is a fraction of the largest value
// on the chart), so no grade's shortfall can be exaggerated by a truncated axis.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useTooltip } from '../analytics/charts/Tooltip.jsx'
import {
  CELL_MASKED,
  CardEmpty,
  EASE,
  ENROLL_HUE,
  PLAN_INK,
  cellState,
  cellTitle,
  cellToken,
  fmtCount,
  gradeLabelOf,
  hasValue,
  signedCount,
  signedShare,
} from './enrollmentAnalyticsKit.jsx'

const MASK_HATCH =
  'repeating-linear-gradient(135deg, rgba(180,83,9,0.14) 0 5px, rgba(180,83,9,0.04) 5px 10px)'

function GapReadout({ gap, gapPct }) {
  if (cellState(gap) === CELL_MASKED) {
    return <span className="text-[11px] font-semibold text-amber-700">withheld</span>
  }
  if (!hasValue(gap)) return <span className="text-[11px] text-muted">—</span>
  const under = gap.value < 0
  const even = gap.value === 0
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
        even ? 'bg-slate-100 text-slate-500' : under ? 'bg-red-500/10 text-red-600' : 'bg-emerald-500/10 text-emerald-700'
      }`}
    >
      {signedCount(gap.value)}
      {hasValue(gapPct) ? <span className="font-semibold opacity-70">{signedShare(gapPct.value)}</span> : null}
    </span>
  )
}

export default function EnrollmentVsPlanChart({ vsPlan, planFailed = false, periodLabel = null, minCell = 5, reduce = false }) {
  const tip = useTooltip()

  // Memoised so the domain below is keyed on something stable — a fresh `[]`
  // every render would re-run the scan on every render.
  const rows = useMemo(() => vsPlan?.rows ?? [], [vsPlan])
  // The shared bar domain — geometry over the values already on the chart.
  const max = useMemo(() => {
    let m = 0
    for (const r of rows) {
      if (hasValue(r.actual)) m = Math.max(m, r.actual.value)
      if (hasValue(r.plan)) m = Math.max(m, r.plan.value)
    }
    return Math.max(m, 1)
  }, [rows])

  if (!vsPlan) {
    // Two different absences, two different sentences. "We could not read your
    // plan" and "you have not set one" call for opposite actions.
    return planFailed ? (
      <CardEmpty>
        Your enrollment plan could not be read, so there is nothing to compare this year&apos;s actuals against. This is
        a fault on our side rather than something missing from your data — try again, and tell us if it persists.
      </CardEmpty>
    ) : (
      <CardEmpty>
        No enrollment plan has been entered{periodLabel ? ` for ${periodLabel}` : ''}, so there is no target to measure
        against. Set a planned headcount by grade in Planning and this chart shows exactly which grades carry any miss.
      </CardEmpty>
    )
  }

  const totals = vsPlan.totals

  return (
    <div>
      <div role="list">
        {rows.map((r, i) => {
          const masked = cellState(r.actual) === CELL_MASKED
          const aw = hasValue(r.actual) ? Math.max(1, (100 * r.actual.value) / max) : 0
          const pw = hasValue(r.plan) ? Math.max(1, (100 * r.plan.value) / max) : 0
          const tipRows = masked
            ? [{ color: '#B45309', label: 'Hidden', value: cellTitle(r.actual, { minCell }) }]
            : [
                { color: ENROLL_HUE, label: 'Actual (counted)', value: cellToken(r.actual) },
                { color: PLAN_INK, label: 'Plan (intended)', value: cellToken(r.plan) },
                { color: '#94A3B8', label: 'Gap', value: hasValue(r.gap) ? signedCount(r.gap.value) : '—' },
              ]
          return (
            <div
              key={r.grade}
              role="listitem"
              className="grid items-center gap-x-3 border-b border-navy/[0.05] py-2 last:border-b-0"
              style={{ gridTemplateColumns: 'minmax(64px, 84px) 1fr minmax(96px, auto)' }}
              onMouseMove={(ev) => tip.show({ title: gradeLabelOf(r.grade), rows: tipRows }, ev.clientX, ev.clientY)}
              onMouseLeave={() => tip.hide()}
            >
              <span className="truncate text-[12px] font-semibold text-navy">{gradeLabelOf(r.grade)}</span>

              <span className="grid min-w-0 gap-[3px]">
                {masked ? (
                  // A masked grade shows the SLOT and the reason — never a bar of
                  // zero, which would say the grade is empty.
                  <span
                    className="flex h-[26px] items-center rounded-md px-2 text-[10.5px] font-bold text-amber-700"
                    style={{ background: MASK_HATCH, boxShadow: 'inset 0 0 0 1px rgba(180,83,9,0.28)' }}
                    title={cellTitle(r.actual, { minCell }) ?? undefined}
                  >
                    &lt;5 — hidden so no child is identifiable
                  </span>
                ) : (
                  <>
                    {/* ACTUAL — solid. Somebody counted this.
                        The WIDTH is the datum and lives on the bar itself; the
                        scaleX is only the entrance. (An earlier cut put the
                        width on a child of the coloured element, which drew
                        every grade as a full-width bar — identical bars for
                        different counts, the one failure this chart cannot
                        have.) */}
                    <motion.span
                      data-enr-bar="actual"
                      className="block h-3 rounded-r-[3px]"
                      style={{ background: ENROLL_HUE, width: `${aw}%`, transformOrigin: 'left' }}
                      initial={reduce ? false : { scaleX: 0 }}
                      whileInView={{ scaleX: 1 }}
                      viewport={{ once: true, margin: '-30px' }}
                      transition={{ duration: 0.5, ease: EASE, delay: reduce ? 0 : i * 0.06 }}
                      aria-hidden="true"
                    />
                    {/* PLAN — dashed outline, barely filled. Nobody counted this. */}
                    <motion.span
                      data-enr-bar="plan"
                      className="block h-3 rounded-r-[3px] border-y border-r border-dashed"
                      style={{
                        width: `${pw}%`,
                        borderColor: PLAN_INK,
                        background: `${PLAN_INK}0F`,
                        transformOrigin: 'left',
                      }}
                      initial={reduce ? false : { scaleX: 0 }}
                      whileInView={{ scaleX: 1 }}
                      viewport={{ once: true, margin: '-30px' }}
                      transition={{ duration: 0.5, ease: EASE, delay: reduce ? 0 : i * 0.06 + 0.08 }}
                      aria-hidden="true"
                    />
                  </>
                )}
              </span>

              <span
                className="flex items-center justify-end gap-2"
                aria-label={`${gradeLabelOf(r.grade)}: actual ${cellToken(r.actual)}, plan ${cellToken(
                  r.plan,
                )}, gap ${hasValue(r.gap) ? signedCount(r.gap.value) : 'withheld'}`}
              >
                <span className="text-[12px] font-bold tabular-nums text-navy">{cellToken(r.actual)}</span>
                <span className="text-[11px] tabular-nums text-muted">/ {cellToken(r.plan)}</span>
                <GapReadout gap={r.gap} gapPct={r.gapPct} />
              </span>
            </div>
          )
        })}
      </div>

      {/* The whole-school line. Server-summed, never suppressed — a school-wide
          figure identifies nobody — and printed here so the rows have a total to
          be read against. */}
      {totals ? (
        <div
          className="mt-2 grid items-center gap-x-3 rounded-lg bg-navy/[0.035] px-2 py-2"
          style={{ gridTemplateColumns: 'minmax(64px, 84px) 1fr minmax(96px, auto)' }}
        >
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">School</span>
          <span className="text-[11px] text-muted">
            {fmtCount(totals.actual)} counted against a plan of {fmtCount(totals.plan)}
          </span>
          <span className="flex items-center justify-end gap-2">
            <span className="text-[12.5px] font-bold tabular-nums text-navy">{fmtCount(totals.actual)}</span>
            <span className="text-[11px] tabular-nums text-muted">/ {fmtCount(totals.plan)}</span>
            <GapReadout
              gap={{ value: totals.gap, suppressed: false }}
              gapPct={{ value: totals.gapPct, suppressed: false }}
            />
          </span>
        </div>
      ) : null}

      {/* Legend — the two marks named, in their own ink. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-2.5 w-5 rounded-[2px]" style={{ background: ENROLL_HUE }} />
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted">
            Actual — counted
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-5 rounded-[2px] border border-dashed"
            style={{ borderColor: PLAN_INK, background: `${PLAN_INK}0F` }}
          />
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted">
            Plan — intended, never counted
          </span>
        </span>
      </div>

      {/* When the table and the tile quote different observations, say so HERE
          too — the reader comparing this total to the hero tile is owed it. */}
      {totals && totals.agreesWithTile === false ? (
        <p className="mt-2.5 rounded-lg bg-amber-500/[0.08] px-3 py-2 text-[11.5px] leading-snug text-amber-800 ring-1 ring-amber-500/20">
          This table is drawn from the reading on screen, while the headline tile quotes the headcount promoted to the
          fiscal year — and right now those are two different observations, so the two percentages differ. Re-sync your
          roster to bring them back together.
        </p>
      ) : null}
    </div>
  )
}
