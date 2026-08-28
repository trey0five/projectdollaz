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
// SINGLE HUE, VARYING WEIGHT. Headcount is a magnitude: no midpoint, no good and
// no bad. A diverging or categorical scheme would paint a meaning into the
// number that the number does not carry.
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
import { useTooltip } from '../analytics/charts/Tooltip.jsx'
import {
  CELL_MASKED,
  CardEmpty,
  EASE,
  cellState,
  cellTitle,
  cellToken,
  fmtCount,
  fmtDate,
  gradeLabelOf,
  hasValue,
  rampFill,
  rampInk,
  schoolYearLabel,
} from './enrollmentAnalyticsKit.jsx'

export default function EnrollmentGradeHeatmap({ gradeByYear, minCell = 5, reduce = false }) {
  const tip = useTooltip()

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
    // The shared domain, over every VISIBLE cell on the grid. Geometry, not
    // analysis: no count is being combined with another, only located.
    let m = 0
    for (const c of gradeByYear?.cells ?? []) if (hasValue(c.count)) m = Math.max(m, c.count.value)
    return { years: ys, grades: gs, byKey: map, observed: obs, max: m }
  }, [gradeByYear])

  if (!gradeByYear || years.length === 0 || grades.length === 0) {
    return (
      <CardEmpty>
        No grade-level reading is on file yet. A roster upload or a SIS sync fills this grid one column per school
        year.
      </CardEmpty>
    )
  }

  const cellFor = (grade, year) => byKey.get(`${grade}|${year}`) ?? null

  const showTip = (grade, year, c, ev) => {
    const o = observed.get(year)
    const state = cellState(c)
    tip.show(
      {
        title: `${gradeLabelOf(grade)} · ${schoolYearLabel(year)}`,
        rows: [
          {
            color: '#0EA5E9',
            label: 'Students',
            value: state === 'value' ? fmtCount(c.value) : cellTitle(c, { minCell }),
          },
          ...(o ? [{ color: '#CBD5E1', label: 'Counted on', value: fmtDate(o.observedOn) }] : []),
          ...(o ? [{ color: '#CBD5E1', label: 'School total', value: fmtCount(o.total) }] : []),
        ],
      },
      ev.clientX,
      ev.clientY,
    )
  }

  return (
    <div>
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        {/* Cells are CAPPED, not stretched. A two-year grid spread across a full
            card turns each cell into a 480px slab that reads as a bar chart —
            the very form this replaces. Fixed-width columns keep a cell a cell
            whether the school has two years on file or five. */}
        <table
          className="min-w-[380px] max-w-full border-separate"
          style={{ borderSpacing: '3px', width: `${76 + years.length * 118}px` }}
        >
          <caption className="sr-only">
            Headcount by grade and school year. Every cell is shaded on one shared scale from 0 to {fmtCount(max)}{' '}
            students, so cells are comparable across the whole grid.
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
            {grades.map((g, gi) => (
              <tr key={g}>
                <th scope="row" className="px-1 text-left">
                  <span className="whitespace-nowrap text-[11.5px] font-semibold text-navy">{gradeLabelOf(g)}</span>
                </th>
                {years.map((y, yi) => {
                  const c = cellFor(g, y)
                  const state = cellState(c)
                  const t = state === 'value' && max > 0 ? c.value / max : 0
                  const masked = state === CELL_MASKED
                  const absent = state === 'absent'
                  const title = c ? cellTitle(c, { minCell }) : 'No reading on file for this grade and year.'
                  return (
                    <td key={y} className="p-0">
                      <motion.div
                        initial={reduce ? false : { opacity: 0, scale: 0.86 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true, margin: '-30px' }}
                        transition={{
                          duration: 0.32,
                          ease: EASE,
                          delay: reduce ? 0 : Math.min(0.5, (gi * years.length + yi) * 0.012),
                        }}
                        title={title ?? undefined}
                        tabIndex={0}
                        role="img"
                        aria-label={`${gradeLabelOf(g)}, ${schoolYearLabel(y)}: ${
                          state === 'value' ? `${fmtCount(c.value)} students` : title
                        }`}
                        onMouseMove={(ev) => showTip(g, y, c, ev)}
                        onMouseLeave={() => tip.hide()}
                        onFocus={(ev) => {
                          const r = ev.currentTarget.getBoundingClientRect()
                          showTip(g, y, c, { clientX: r.left + r.width / 2, clientY: r.bottom })
                        }}
                        onBlur={() => tip.hide()}
                        className="grid h-9 place-items-center rounded-md text-[12px] font-bold tabular-nums outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-sky-500"
                        style={
                          // Three states, three surfaces. The masked cell wears a
                          // hatch so it cannot be mistaken for a pale — i.e. small
                          // — reading, and the absent cell is barely there at all.
                          masked
                            ? {
                                color: '#B45309',
                                background:
                                  'repeating-linear-gradient(135deg, rgba(180,83,9,0.14) 0 5px, rgba(180,83,9,0.04) 5px 10px)',
                                boxShadow: 'inset 0 0 0 1px rgba(180,83,9,0.28)',
                              }
                            : absent
                              ? { color: '#CBD5E1', background: 'rgba(16,28,61,0.025)' }
                              : { color: rampInk(t), background: rampFill(t) }
                        }
                      >
                        {absent ? '·' : cellToken(c)}
                      </motion.div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* The scale, stated once — including that it starts at zero. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted">0</span>
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-24 rounded-full"
            style={{ background: `linear-gradient(90deg, ${rampFill(0)}, ${rampFill(1)})` }}
          />
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted tabular-nums">
            {fmtCount(max)} students
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3 rounded-[3px]"
            style={{
              background:
                'repeating-linear-gradient(135deg, rgba(180,83,9,0.14) 0 5px, rgba(180,83,9,0.04) 5px 10px)',
              boxShadow: 'inset 0 0 0 1px rgba(180,83,9,0.28)',
            }}
          />
          <span className="text-[11px] text-muted">
            <span className="font-mono font-bold text-amber-700">&lt;5</span> — hidden, not zero
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-3 w-3 rounded-[3px] bg-navy/[0.03]" />
          <span className="text-[11px] text-muted">
            <span className="font-mono font-bold text-slate-300">·</span> — no reading that year
          </span>
        </span>
      </div>

      {years.length === 1 ? (
        <p className="mt-2.5 text-[11.5px] leading-snug text-muted">
          Only one school year is on file, so this grid is a single column — a grade ladder. The comparison across years
          it is built for lights up with next year&apos;s reading.
        </p>
      ) : null}
    </div>
  )
}
