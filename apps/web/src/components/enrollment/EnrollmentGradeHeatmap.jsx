// ─────────────────────────────────────────────────────────────────────────────
// E2 — GRADE × SCHOOL YEAR, AS A HEATMAP.
//
// This is the chart we are explicitly beating. The diocesan deck plots five eras
// against fifteen grades as SEVENTY-FIVE GROUPED BARS in one frame: no reader
// can compare grade 3 in 2019 with grade 3 in 2024 across that thicket, which is
// the only question the chart exists to answer.
//
// A matrix answers it directly. Grade runs down in CANONICAL order (never sorted
// by size — the grades are a ladder and re-ordering them destroys the axis),
// school year runs across, and one cell is one reading. The eye compares along a
// row for "is this grade growing" and down a column for "what does the school
// look like this year", and both comparisons are exact because every cell is
// weighted on ONE shared domain.
//
// SINGLE HUE, VARYING WEIGHT, IN STEPS. Headcount is a magnitude: no midpoint,
// no good and no bad. A diverging or categorical scheme would paint a meaning
// into the number that the number does not carry. The weight is SIX validated
// steps (heatScales.SEQUENTIAL_STEPS) on a zero-based scale whose top is the
// grid's largest cell rounded up to a nice number, so the legend can print the
// real thresholds and the ink on every step clears AA — the old continuous
// ramp flipped its ink at t≈0.55, the one band where neither ink was legible.
//
// SHADE IS SIZE, NOT CHANGE. A grade that fell from 126 to 79 shows as a paler
// cell, never a red one; read along the row for the movement.
//
// THE COUNT IS PRINTED IN THE CELL, not hidden behind the pointer. The ramp
// gives the instant shape; the figure gives the exact read; hover adds the date
// the column was taken and the row's context. Nothing a keyboard or a printout
// cannot reach.
//
// A masked cell is BLANK WITH A REASON and a suppressed pattern — never a zero,
// never shaded as though it were small. A grade that was never reported that
// year is a third thing again, and looks like neither.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { motion } from 'framer-motion'
import HeatCell, { HeatScaleLegend, HeatStateKeys } from '../analytics/charts/HeatCell.jsx'
import { sequentialScale } from '../analytics/charts/heatScales.js'
import {
  CELL_MASKED,
  CardEmpty,
  EASE,
  ENROLL_HUE,
  cellState,
  cellTitle,
  cellToken,
  fmtCount,
  fmtDate,
  gradeLabelOf,
  hasValue,
  schoolYearLabel,
} from './enrollmentAnalyticsKit.jsx'

export default function EnrollmentGradeHeatmap({ gradeByYear, minCell = 5, reduce = false }) {
  const { years, grades, byKey, observed, max } = useMemo(() => {
    const ys = gradeByYear?.years ?? []
    const gs = gradeByYear?.grades ?? []
    // A grade with no cell for a year is a HOLE in the array, not a null entry —
    // the server omits it entirely. A Map lookup that misses therefore means
    // "no reading", which is exactly the third state the cell renderer draws.
    const map = new Map()
    for (const c of gradeByYear?.cells ?? []) map.set(`${c.grade}|${c.schoolYear}`, c.count)
    const obs = new Map()
    for (const o of gradeByYear?.observedByYear ?? []) obs.set(o.schoolYear, o)
    // The shared domain, over every cell on the grid. Geometry, not analysis:
    // no count is being combined with another, only located.
    let m = 0
    for (const c of gradeByYear?.cells ?? []) if (hasValue(c.count)) m = Math.max(m, c.count.value)
    return { years: ys, grades: gs, byKey: map, observed: obs, max: m }
  }, [gradeByYear])

  // Six steps on [0, top], top = the largest cell rounded UP to a nice number —
  // so the legend's ticks are round and a new reading rarely re-tints the grid.
  const scale = useMemo(() => sequentialScale(max), [max])

  if (!gradeByYear || years.length === 0 || grades.length === 0) {
    return (
      <CardEmpty>
        No grade-level reading is on file yet. A roster upload or a SIS sync fills this grid one column per school
        year.
      </CardEmpty>
    )
  }

  const cellFor = (grade, year) => byKey.get(`${grade}|${year}`) ?? null

  const tipFor = (grade, year, c) => {
    const o = observed.get(year)
    const state = cellState(c)
    const step = state === 'value' ? scale.stepFor(c.value) : null
    return {
      title: `${gradeLabelOf(grade)} · ${schoolYearLabel(year)}`,
      rows: [
        {
          color: step?.fill ?? (state === CELL_MASKED ? '#B45309' : '#94A3B8'),
          label: 'Students',
          value: state === 'value' ? fmtCount(c.value) : cellTitle(c, { minCell }),
        },
        ...(o ? [{ color: '#CBD5E1', label: 'Counted on', value: fmtDate(o.observedOn) }] : []),
        ...(o && o.total != null ? [{ color: '#CBD5E1', label: 'School total', value: fmtCount(o.total) }] : []), // total is withheld (null) when a grade in that year is suppressed
      ],
    }
  }

  return (
    <div>
      {/* ONE reveal for the whole grid. A per-cell in-view trigger left cells below the
          fold unpainted in a full-page capture and could stall inside the
          scroll container; the grid now fades in once and the cells are static. */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="-mx-1 overflow-x-auto px-1 pb-1"
      >
        {/* Cells are CAPPED, not stretched. A two-year grid spread across a full
            card turns each cell into a 480px slab that reads as a bar chart —
            the very form this replaces. Fixed-width columns keep a cell a cell
            whether the school has two years on file or five. */}
        <table
          className="min-w-[380px] max-w-full border-separate"
          style={{ borderSpacing: '2px', width: `${76 + years.length * 118}px` }}
        >
          <caption className="sr-only">
            Headcount by grade and school year. Every cell is shaded on one shared scale from 0 to{' '}
            {fmtCount(scale.top)} students in {scale.steps.length} steps, so cells are comparable across the whole
            grid.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="w-[76px] px-1 pb-1 text-left">
                <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted">Grade</span>
              </th>
              {years.map((y) => {
                const o = observed.get(y)
                return (
                  <th key={y} scope="col" className="px-1 pb-1 text-center" style={{ width: 118 }}>
                    <span className="block text-[11px] font-bold tabular-nums text-navy">{schoolYearLabel(y)}</span>
                    {/* The column dates itself. A column headed only "2026" is a
                        year; this one is a READING, taken on a real day. */}
                    {o ? (
                      <span className="block text-[9px] font-medium tabular-nums text-muted">
                        {fmtDate(o.observedOn)}
                      </span>
                    ) : null}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {grades.map((g) => (
              <tr key={g}>
                <th scope="row" className="px-1 text-left">
                  <span className="whitespace-nowrap text-[11.5px] font-semibold text-navy">{gradeLabelOf(g)}</span>
                </th>
                {years.map((y) => {
                  const c = cellFor(g, y)
                  const state = cellState(c)
                  const masked = state === CELL_MASKED
                  const absent = state === 'absent'
                  const title = c ? cellTitle(c, { minCell }) : 'No reading on file for this grade and year.'
                  const heatState = masked ? 'suppressed' : absent ? 'absent' : 'value'
                  return (
                    <td key={y} className="p-0">
                      <HeatCell
                        state={heatState}
                        step={heatState === 'value' ? scale.stepFor(c.value) : null}
                        height={44}
                        focusColor={ENROLL_HUE}
                        label={`${gradeLabelOf(g)}, ${schoolYearLabel(y)}: ${
                          state === 'value' ? `${fmtCount(c.value)} students` : title
                        }`}
                        tip={tipFor(g, y, c)}
                        className="text-[12px] font-bold tabular-nums"
                      >
                        {absent ? '·' : cellToken(c)}
                      </HeatCell>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </motion.div>

      {/* The scale, stated once — with its real thresholds, and that it starts at zero. */}
      <HeatScaleLegend
        title="Students in the grade"
        steps={scale.steps}
        ticks={scale.ticks.map((t) => fmtCount(t))}
        extras={<HeatStateKeys suppressedLabel="hidden, not zero" absentLabel="no reading that year" absentToken="·" />}
        caption="Shade is size, not change — read along a row for movement."
      />

      {years.length === 1 ? (
        <p className="mt-2.5 text-[11.5px] leading-snug text-muted">
          Only one school year is on file, so this grid is a single column — a grade ladder. The comparison across years
          it is built for lights up with next year&apos;s reading.
        </p>
      ) : null}
    </div>
  )
}
