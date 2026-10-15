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
// PREMIUM UI P4 (a2): the gap is a ledger Pill — ink figure, a 2px semantic mark
// (the school row on the registry's enrollment_vs_plan bands; elsewhere under
// plan → watch, over → good, on plan → neutral) — and the in-chart cap is
// ink on the chart's neutral band. No red/green tinted text, no amber wash.
//
// Columns are zero-based by construction (ColumnChart keeps a zero baseline
// for counts), so no grade's shortfall can be exaggerated by a truncated axis.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { bandsFor, healthStatus } from '@finrep/analytics'
import ColumnChart from '../analytics/charts/ColumnChart.jsx'
import Pill from '../ui/surface/Pill.jsx'
import '../../styles/pending/a2-carry.css'
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

/**
 * The gap as a ledger Pill. `tone` — when the caller can judge the gap against
 * the registry bands (the whole-school row: `enrollment_vs_plan`) — wins, so this
 * row's mark always agrees with the vitals strip above it. Without one (a single
 * grade has no registry band) the sign alone speaks, and under plan reads WATCH,
 * never risk: one child short in a grade is not a critical finding.
 */
function GapReadout({ gap, gapPct, tone = null }) {
  if (cellState(gap) === CELL_MASKED) {
    return <span className="text-[11px] font-semibold text-ink2">withheld</span>
  }
  if (!hasValue(gap)) return <span className="text-[11px] text-ink2">—</span>
  const under = gap.value < 0
  const even = gap.value === 0
  const signTone = even ? 'neutral' : under ? 'watch' : 'good'
  return (
    <Pill variant="status" tone={tone ?? signTone} className="tabular-nums">
      {signedCount(gap.value)}
      {hasValue(gapPct) ? <span className="font-medium text-ink2">{signedShare(gapPct.value)}</span> : null}
    </Pill>
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
  // The whole-school gap is judged on the SAME registry bands VsPlanKpi and
  // EnrollmentHero use, so −2.3% reads watch here exactly as it does above.
  const totalsBand =
    totals && Number.isFinite(Number(totals.gapPct))
      ? healthStatus(Number(totals.gapPct), bandsFor('enrollment_vs_plan'), true)
      : null
  const totalsTone = totalsBand && ['good', 'watch', 'risk'].includes(totalsBand) ? totalsBand : null

  return (
    <div>
      <ColumnChart
        rows={rows.map((r) => {
          const masked = cellState(r.actual) === CELL_MASKED
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
            // THE GAP READOUT, NOT THE COLUMN — and in ink: the sign carries the
            // direction, the readout below carries the semantic mark.
            capLabel:
              !masked && hasValue(r.gap)
                ? {
                    text: `${signedCount(r.gap.value)}${hasValue(r.gapPct) ? ` · ${signedShare(r.gapPct.value)}` : ''}`,
                    color: '#101C3D',
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
          className="mt-2 grid items-center gap-x-3 border-y border-hair px-1 py-2"
          style={{ gridTemplateColumns: 'minmax(64px, 84px) 1fr minmax(96px, auto)' }}
        >
          <span className="text-micro font-semibold uppercase text-ink2">School</span>
          <span className="text-[12px] text-ink2">
            {fmtCount(totals.actual)} counted against a plan of {fmtCount(totals.plan)}
          </span>
          <span className="flex items-center justify-end gap-2">
            <span className="text-small font-semibold tabular-nums text-ink">{fmtCount(totals.actual)}</span>
            <span className="text-[12px] tabular-nums text-ink2">/ {fmtCount(totals.plan)}</span>
            <GapReadout
              gap={{ value: totals.gap, suppressed: false }}
              gapPct={{ value: totals.gapPct, suppressed: false }}
              tone={totalsTone}
            />
          </span>
        </div>
      ) : null}

      {/* Legend — the two marks named, in their own ink. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-2.5 w-5 rounded-[2px]" style={{ background: ENROLL_HUE }} />
          <span className="text-micro font-semibold uppercase text-ink2">
            Actual — counted
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-5 rounded-[2px] border border-dashed"
            style={{ borderColor: PLAN_INK, background: `${PLAN_INK}0F` }}
          />
          <span className="text-micro font-semibold uppercase text-ink2">
            Plan — intended, never counted
          </span>
        </span>
      </div>

      {/* When the table and the tile quote different observations, say so HERE
          too — the reader comparing this total to the hero tile is owed it. */}
      {totals && totals.agreesWithTile === false ? (
        <p className="a2-note mt-3" data-tone="watch">
          This table is drawn from the reading on screen, while the headline tile quotes the headcount promoted to the
          fiscal year — and right now those are two different observations, so the two percentages differ. Re-sync your
          roster to bring them back together.
        </p>
      ) : null}
    </div>
  )
}
