// ─────────────────────────────────────────────────────────────────────────────
// AcademicsHeatmap — "Where instruction is landing": grade × subject, each cell
// shaded by how far that grade sits from the same grade elsewhere.
//
// Replaces the private `Heatmap` in AssessmentDashboard.jsx. What changed, and
// why (every item is a dataviz rule the old grid broke):
//
//   • A LEGEND WITH REAL THRESHOLDS. The old map had none, and its scale was
//     re-derived from the worst cell on screen, so one tint meant a different
//     gap after every filter. The scale now steps by multiples of the family's
//     MATERIAL GAP (`unit.gap` — the same "a difference under N points is not
//     a difference" the ranked chart prints), so the domain is stable and the
//     first step is exactly "a difference that counts".
//   • BLUE ↔ RED THROUGH GREY, not red/green: the deuteranopia trap is gone,
//     and the sign is still printed so colour never carries meaning alone.
//   • THE BIG NUMBER IS THE THING THE COLOUR ENCODES. Colour encodes variance;
//     the old cell printed the score at 17px and the variance at 9px on a tinted
//     ground. Variance leads now; the score sits beneath it and in the tooltip.
//   • Suppressed (<5) is hatched amber; absent is a grey dash — two facts, two
//     marks, never the same grey.
//   • One reveal for the grid, no per-cell hover scale, keyboard-reachable
//     tooltips on every cell (HeatCell).
//
// Colour is a SELECTION over server-computed variance; no score arithmetic.
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion'
import { subjectLabelOf } from '@finrep/analytics'
import HeatCell, { HeatScaleLegend, HeatStateKeys } from '../analytics/charts/HeatCell.jsx'
import { DIVERGING_INK, divergingScale } from '../analytics/charts/heatScales.js'
import { fmtScore, signed } from './cohortKit.js'

const HUE = '#0D9488'
const EASE = [0.2, 0.8, 0.2, 1]
const label = subjectLabelOf

const hasNum = (v) => v !== null && v !== undefined && Number.isFinite(Number(v))

export default function AcademicsHeatmap({ cells = [], subjects = [], unit = null, reduce = false }) {
  const grades = [...new Set(cells.map((c) => c.grade))]
  if (grades.length === 0) return null
  const shown = subjects.filter((s) => cells.some((c) => c.subject === s && c.value !== null))
  if (shown.length === 0) return null

  const decimals = unit?.decimals ?? 0
  const points = unit?.points ?? 'points'
  // The family's material gap is the step. It comes from the semantic layer
  // with the unit; the fallback only exists so a family without one still draws.
  const gap = hasNum(unit?.gap) && Number(unit.gap) > 0 ? Number(unit.gap) : 5
  const scale = divergingScale(gap)
  const tick = (v) => signed(v, decimals)

  return (
    <div>
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="overflow-x-auto"
      >
        <table className="w-full min-w-[420px] border-separate" style={{ borderSpacing: '2px' }}>
          <caption className="sr-only">
            Score by grade and subject, each cell shaded by its gap from the same grade elsewhere in steps of {gap}{' '}
            {points}.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="w-14" />
              {shown.map((s) => (
                <th
                  key={s}
                  scope="col"
                  className="pb-1 text-center text-[9.5px] font-bold uppercase tracking-wider text-muted"
                >
                  {label(s)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grades.map((g) => (
              <tr key={g}>
                <th scope="row" className="pr-1 text-right text-[10.5px] font-bold text-muted">
                  Gr {g}
                </th>
                {shown.map((s) => {
                  const cell = cells.find((c) => c.grade === g && c.subject === s)
                  const suppressed = Boolean(cell?.suppressed)
                  const absent = !suppressed && !hasNum(cell?.value)
                  const state = suppressed ? 'suppressed' : absent ? 'absent' : 'value'
                  const variance = hasNum(cell?.variance) ? Number(cell.variance) : null
                  // A score with no comparison sits on the neutral step: the
                  // figure is real, the gap is simply not measurable.
                  const step = state === 'value' ? (variance === null ? scale.mid : scale.stepFor(variance)) : null
                  const title = `${label(s)} · Grade ${g}`
                  const tip =
                    state === 'suppressed'
                      ? { title, rows: [{ color: '#B45309', label: 'Students', value: 'Fewer than 5 — withheld' }] }
                      : state === 'absent'
                        ? { title, rows: [{ color: '#94A3B8', label: 'Score', value: 'No result on file' }] }
                        : {
                            title,
                            rows: [
                              { color: HUE, label: 'Score', value: fmtScore(cell.value, decimals) },
                              {
                                color: step.fill,
                                label: 'vs same grade elsewhere',
                                value: variance === null ? 'No comparison' : `${tick(variance)} ${points}`,
                              },
                            ],
                          }
                  const aria =
                    state === 'suppressed'
                      ? `${title}: fewer than 5 students, suppressed`
                      : state === 'absent'
                        ? `${title}: no result on file`
                        : `${title}: ${fmtScore(cell.value, decimals)}, ${
                            variance === null ? 'no comparison' : `${tick(variance)} ${points} versus the same grade elsewhere`
                          }`
                  return (
                    <td key={s} className="p-0">
                      <HeatCell state={state} step={step} label={aria} tip={tip} height={52} focusColor={HUE}>
                        {state === 'suppressed' ? (
                          <span className="text-[12px] font-bold">&lt;5</span>
                        ) : state === 'absent' ? (
                          <span className="text-[12px] font-bold">—</span>
                        ) : (
                          <span className="flex flex-col items-center leading-none">
                            <span className="text-[15px] font-bold tabular-nums">
                              {variance === null ? fmtScore(cell.value, decimals) : tick(variance)}
                            </span>
                            {variance !== null ? (
                              <span className="mt-1 text-[10.5px] font-semibold tabular-nums opacity-90">
                                {fmtScore(cell.value, decimals)}
                              </span>
                            ) : null}
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

      <HeatScaleLegend
        title={`Gap from the same grade elsewhere · ${points}`}
        steps={scale.steps}
        ticks={['', ...scale.ticks.map(tick), '']}
        extras={<HeatStateKeys absentLabel="no result on file" />}
        caption={
          <>
            Each cell leads with its gap; the score sits beneath. Within{' '}
            <span className="font-semibold tabular-nums">±{gap}</span> {points} is level (grey); every further {gap}{' '}
            {points} is one step darker —{' '}
            <span className="font-semibold" style={{ color: DIVERGING_INK.pos }}>
              blue ahead
            </span>
            ,{' '}
            <span className="font-semibold" style={{ color: DIVERGING_INK.neg }}>
              red behind
            </span>
            . The steps are fixed, so a cell keeps its shade whatever else is on screen.
          </>
        }
      />
    </div>
  )
}
