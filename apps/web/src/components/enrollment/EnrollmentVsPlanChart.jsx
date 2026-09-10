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
// The actual is a SOLID column: somebody counted those children. The plan is a
// DASHED OUTLINE column in its own ink: nobody counted it, it is an intention typed
// into a budget. Two solid bars side by side — the default of every charting
// library and of the deck we are replacing — assert that both were observed, and
// one of them never was. The reader must be able to tell which number is a
// measurement without reading the legend.
//
// GRADES STAY IN CANONICAL ORDER, never sorted by size or by gap. The grades are
// a ladder; re-ordering them by value destroys the only axis the chart has.
//
// COLOUR SITS ON THE GAP READOUT, NOT ON THE COLUMN. A grade under plan is not a
// red grade — it is a grade with a red gap. Painting the whole column red would
// mark the children in it as a problem.
//
// Columns are zero-based by construction (ColumnChart keeps a zero baseline
// for counts), so no grade's shortfall can be exaggerated by a truncated axis.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import ColumnChart from '../analytics/charts/ColumnChart.jsx'
import {
  CELL_MASKED,
  CardEmpty,
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

export default function EnrollmentVsPlanChart({ vsPlan, planFailed = false, periodLabel = null, minCell = 5 }) {
  // Memoised so the rows are keyed on something stable.
  const rows = useMemo(() => vsPlan?.rows ?? [], [vsPlan])

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
      <ColumnChart
        rows={rows.map((r) => {
          const masked = cellState(r.actual) === CELL_MASKED
          const under = hasValue(r.gap) && r.gap.value < 0
          const even = hasValue(r.gap) && r.gap.value === 0
          return {
            id: String(r.grade),
            label: gradeLabelOf(r.grade),
            // A masked grade shows a hatched stub and the reason — never a
            // column of zero, which would say the grade is empty.
            vals: masked ? [null, null] : [hasValue(r.actual) ? r.actual.value : null, hasValue(r.plan) ? r.plan.value : null],
            suppressed: masked,
            formatted: masked ? [cellTitle(r.actual, { minCell }) ?? '<5', cellToken(r.plan)] : [cellToken(r.actual), cellToken(r.plan)],
            meta: [
              {
                label: 'Gap',
                value: masked ? 'withheld' : hasValue(r.gap) ? `${signedCount(r.gap.value)}${hasValue(r.gapPct) ? ` · ${signedShare(r.gapPct.value)}` : ''}` : '—',
              },
            ],
            // COLOUR SITS ON THE GAP READOUT, NOT ON THE COLUMN.
            capLabel:
              !masked && hasValue(r.gap)
                ? {
                    text: `${signedCount(r.gap.value)}${hasValue(r.gapPct) ? ` · ${signedShare(r.gapPct.value)}` : ''}`,
                    color: even ? '#64748B' : under ? '#DC2626' : '#047857',
                    bg: even ? 'rgba(100,116,139,0.12)' : under ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.12)',
                  }
                : undefined,
          }
        })}
        series={[
          { id: 'actual', label: 'Actual — counted', color: ENROLL_HUE },
          { id: 'plan', label: 'Plan — intended, never counted', color: PLAN_INK, style: 'dashed' },
        ]}
        legend={false}
        showValues="all"
        height={220}
        ariaLabel="Actual against plan, by grade"
      />

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
