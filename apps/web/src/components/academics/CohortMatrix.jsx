// ─────────────────────────────────────────────────────────────────────────────
// CohortMatrix — every cohort against every subject, in one glance.
//
// The panels above answer "did this group move"; this answers the question a
// head of school asks next, which is "was that one subject or the whole
// battery". It is a REAL TABLE — <th scope> on both axes — because it is read
// down columns and across rows by people using screen readers and by anyone
// pasting it into a board packet.
//
// TWO RULES IT EXISTS TO KEEP.
//
// 1. TONE FROM DIRECTION, NEVER SIGN. See `cohortStep` in cohortKit.
// 2. A SUPPRESSED CELL IS NEVER A ZERO. `<5` and `—` are different marks for
//    different facts: a number withheld to protect fewer than five children,
//    and a number nobody ever filed. A zero in either place would be the table
//    asserting "no change", which is a claim about a figure we do not have.
//
// The cells are the shared HeatCell on the shared diverging scale (blue ↔ red
// through grey, stepped by the family's material gap), so this grid, the
// grade × subject map and the enrollment grid all read the same way: a legend
// with real thresholds, a 2px surface gap and no ring, keyboard-reachable
// tooltips, and the amber hatch for "<5".
//
// Total Battery is the publisher's OWN reported composite, not the mean of the
// subject columns beside it, so the column sits first behind a hairline and the
// caption says so. Reading that column as a row average is the one misread this
// layout can invite.
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion'
import HeatCell, { HeatScaleLegend, HeatStateKeys } from '../analytics/charts/HeatCell.jsx'
import { DIVERGING_INK } from '../analytics/charts/heatScales.js'
import { COH_EASE, COH_HUE, cohortScale, cohortStep, fmtScore, legTitle, signed } from './cohortKit.js'

const TOTAL = 'total'

const ARROW = { gained: '▲', declined: '▼', held: '•' }

/** The mark a cell wears when there is no number to print. */
function blankOf(cell) {
  if (!cell) return { token: '—', state: 'absent', title: 'No result on file' }
  if (cell.startState === 'suppressed' || cell.endState === 'suppressed')
    return { token: '<5', state: 'suppressed', title: legTitle('suppressed') }
  if (cell.startState !== 'observed') return { token: '—', state: 'absent', title: legTitle(cell.startState) }
  if (cell.endState !== 'observed') return { token: '—', state: 'absent', title: legTitle(cell.endState) }
  return null
}

export default function CohortMatrix({ matrix, onlyKeys = null, unit, gap, schoolName, reduce = false }) {
  const keep = onlyKeys ? new Set(onlyKeys) : null
  const cohorts = (matrix?.cohorts ?? []).filter((c) => !keep || keep.has(c.key))
  const series = [...(matrix?.series ?? [])].sort((a, b) => (a.key === TOTAL ? -1 : b.key === TOTAL ? 1 : 0))
  const cells = (matrix?.cells ?? []).filter((c) => !keep || keep.has(c.cohortKey))
  if (cohorts.length === 0 || series.length === 0) return null

  const byCell = new Map(cells.map((c) => [`${c.cohortKey}|${c.series}`, c]))
  // The scale is built from the family's material gap — the same number the
  // server ruled `direction` against — never from the largest move on screen.
  const scale = cohortScale(gap)
  const decimals = unit?.decimals ?? 0
  const tick = (v) => signed(v, decimals)

  // The composite's NAME comes from the server, per family — this file must
  // never type 'Total Battery' over an ACT or SAT school.
  const totalLabel = series.find((s) => s.key === TOTAL)?.label ?? 'Composite'

  return (
    <div>
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: COH_EASE }}
        className="coh-matrix-scroll -mx-1 overflow-x-auto px-1"
        // A scroll container that only a mouse can reach is a column of numbers
        // a keyboard reader cannot get to. Focusable + named, so it is announced
        // and can be scrolled with the arrow keys.
        tabIndex={0}
        role="region"
        aria-label={`Net change by cohort and subject at ${schoolName ?? 'this school'}, scrollable`}
      >
        <table className="w-full min-w-[520px] border-separate" style={{ borderSpacing: '2px' }}>
          <caption className="sr-only">
            Net change by cohort and subject at {schoolName ?? 'this school'}, shaded in steps of {scale.gap}{' '}
            {unit.points}
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="coh-matrix-stick sticky left-0 z-10 bg-white pr-2 text-left text-[8.5px] font-bold uppercase tracking-[0.14em] text-muted"
              >
                Cohort
              </th>
              {series.map((s, i) => (
                <th
                  key={s.key}
                  scope="col"
                  className="px-1 pb-1 text-center text-[8.5px] font-bold uppercase tracking-[0.14em] text-muted"
                  style={
                    i === 0 && s.key === TOTAL
                      ? { borderRight: '1px solid rgba(16,28,61,0.12)', color: '#0f766e' }
                      : undefined
                  }
                >
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohorts.map((c) => (
              <tr key={c.key}>
                <th
                  scope="row"
                  className="coh-matrix-stick sticky left-0 z-10 whitespace-nowrap bg-white pr-2 text-right text-[11.5px] font-semibold text-navy"
                >
                  {c.label}
                </th>
                {series.map((s, col) => {
                  const cell = byCell.get(`${c.key}|${s.key}`)
                  const blank = blankOf(cell)
                  const step = blank ? null : cohortStep(scale, cell.direction, cell.netChange)
                  const state = blank ? blank.state : step ? 'value' : 'absent'
                  const title = `${c.label} · ${s.label}`
                  const held = !blank && cell.direction === 'held'
                  const tip = blank
                    ? { title, rows: [{ color: blank.state === 'suppressed' ? '#B45309' : '#94A3B8', label: 'Result', value: blank.title }] }
                    : {
                        title,
                        rows: [
                          {
                            color: COH_HUE,
                            label: 'Start → end',
                            value: `${fmtScore(cell.startValue, decimals)} → ${fmtScore(cell.endValue, decimals)}`,
                          },
                          {
                            color: step?.fill ?? '#94A3B8',
                            label: 'Net change',
                            value: `${tick(cell.netChange)} ${unit.points}${held ? ' · within the noise' : ''}`,
                          },
                        ],
                      }
                  const aria = blank
                    ? `${title}: ${blank.title}`
                    : `${title}: ${fmtScore(cell.startValue, decimals)} to ${fmtScore(cell.endValue, decimals)}, ${tick(
                        cell.netChange,
                      )} ${unit.points}${held ? `, smaller than ${scale.gap} — within the noise` : ''}`
                  return (
                    <td
                      key={s.key}
                      className="p-0"
                      style={
                        col === 0 && s.key === TOTAL
                          ? { borderRight: '1px solid rgba(16,28,61,0.12)' }
                          : undefined
                      }
                    >
                      <HeatCell state={state} step={step} label={aria} tip={tip} height={46} focusColor={COH_HUE}>
                        {blank ? (
                          <span className="text-[11px] font-bold">{blank.token}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 leading-none">
                            <span className="text-[11px]">{ARROW[cell.direction] ?? '•'}</span>
                            <span className="text-[15px] font-bold tabular-nums">{tick(cell.netChange)}</span>
                          </span>
                        )}
                      </HeatCell>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </motion.div>

      <MatrixLegend unit={unit} scale={scale} tick={tick} schoolName={schoolName} totalLabel={totalLabel} />
    </div>
  )
}

/** Every word of it derived from the live unit — never typed. */
function MatrixLegend({ unit, scale, tick, schoolName, totalLabel }) {
  const gap = scale.gap
  return (
    <div className="space-y-1.5">
      <HeatScaleLegend
        title={`Net change · ${unit.points}`}
        steps={scale.steps}
        ticks={['', ...scale.ticks.map(tick), '']}
        extras={
          <>
            <span className="inline-flex items-center gap-1 pb-3.5 text-[10.5px] text-muted">
              <span style={{ color: DIVERGING_INK.pos }}>▲</span> Gained — {gap} {unit.points} or more
            </span>
            <span className="inline-flex items-center gap-1 pb-3.5 text-[10.5px] text-muted">
              <span style={{ color: DIVERGING_INK.mid }}>•</span> Within the noise — smaller than {gap} {unit.points}
            </span>
            <span className="inline-flex items-center gap-1 pb-3.5 text-[10.5px] text-muted">
              <span style={{ color: DIVERGING_INK.neg }}>▼</span> Declined
            </span>
            <HeatStateKeys suppressedLabel="suppressed" absentLabel="not on file" />
          </>
        }
      />
      {/* Each row spans DIFFERENT grades, so the sentence names the rule rather
          than one row's grades — naming grade 3 here would be false on row two. */}
      <p className="text-[11px] leading-snug text-muted">
        Every row is one group of children at {schoolName ?? 'this school'}, and its net change is that row&rsquo;s
        end-grade score minus its start-grade score. Every further {gap} {unit.points} is one shade darker, blue for
        gained and red for declined; the steps are fixed, not re-scaled to the largest move shown. {totalLabel} is the
        publisher&rsquo;s own reported composite — not an average of the subject columns beside it.
      </p>
    </div>
  )
}
