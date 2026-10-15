// Phase 4 — "This year's roster" current-enrollment grid (roll-forward input).
//
// A 14-grade integer grid for THIS year's actual enrollment by grade, which the
// roll-forward ages up one grade with retention. Mirrors FeederEnrollmentGrid's
// sheet layout / sanitizeInteger (a `.dt` sheet: Grade · Students, total foot). "Seed from this year" prefills from
// the saved driver assumptions' enrollmentByGrade, else an even spread of the
// operational enrollment scalar total (reuses seedAssumptions' even-spread). The
// seeded values stay editable. Writes rollForward.currentByGrade.
//
// Module-scope component + a render-HELPER for the cell (React-Compiler safe).
import { Users, Wand2 } from 'lucide-react'
import { sanitizeInteger } from '../../lib/numericInput.js'
import { GRADE_ROW, GRADE_LABELS } from './driverModel.js'
import { gradeGridTotal } from '../../lib/mergeFeeder.js'
import { Section, Pill, Button } from '../ui/surface/index.js'
import '../../styles/pending/b2-finance.css'

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// Even-spread of a scalar total across the 14 grades (mirrors seedAssumptions).
function evenSpread(total) {
  const out = {}
  if (!Number.isFinite(total) || total <= 0) return out
  const per = Math.floor(total / GRADE_ROW.length)
  let remainder = total - per * GRADE_ROW.length
  for (const g of GRADE_ROW) {
    out[g] = per + (remainder > 0 ? 1 : 0)
    if (remainder > 0) remainder -= 1
  }
  return out
}

// Build a seed from saved driver assumptions, else even-spread of the operational
// enrollment scalar total. Returns a fixed-key grid (zeros allowed).
export function seedCurrentRoster({ driverAssumptions, budgetContext }) {
  const fromDriver = driverAssumptions?.enrollmentByGrade
  if (fromDriver && GRADE_ROW.some((g) => num(fromDriver[g]) > 0)) {
    const out = {}
    for (const g of GRADE_ROW) out[g] = num(fromDriver[g])
    return out
  }
  const drivers = budgetContext?.drivers ?? null
  const total =
    drivers?.current?.enrollment ??
    drivers?.prior?.enrollment ??
    drivers?.baselineEnrollment ??
    null
  const spread = evenSpread(total)
  const out = {}
  for (const g of GRADE_ROW) out[g] = num(spread[g])
  return out
}

// One sheet row: the grade, then its integer input (right-aligned, tabular).
function renderRosterRow(grade, value, onCell, disabled) {
  const label = GRADE_LABELS[grade] ?? grade
  return (
    <tr key={`roster-${grade}`}>
      <td>{label}</td>
      <td className="dt-num py-1">
        <input
          type="text"
          inputMode="numeric"
          disabled={disabled}
          value={value === 0 ? '' : String(value)}
          placeholder="0"
          aria-label={`${label} — students this year`}
          onChange={(e) => onCell(grade, num(sanitizeInteger(e.target.value)))}
          className="b2-cell-input ml-auto block max-w-[7rem]"
        />
      </td>
    </tr>
  )
}

export default function CurrentRosterGrid({ current, onChange, onSeed, disabled }) {
  const grid = current || {}
  const total = gradeGridTotal(grid)

  const setCell = (grade, v) => onChange({ ...grid, [grade]: v })

  return (
    <Section label="This year’s roster" aside={<Pill variant="count">{total} students</Pill>} className="first:mt-0">
      <p className="mb-2 flex items-start gap-2 text-small text-ink2">
        <Users size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
        Current enrollment by grade. Roll-forward ages each grade up one year, applying your retention rate.
      </p>
      {onSeed && (
        <Button variant="secondary" size="sm" disabled={disabled} onClick={onSeed} icon={<Wand2 size={13} />} className="mb-2">
          Seed from this year
        </Button>
      )}
      <div className="dt-wrap">
        <table className="dt">
          <thead>
            <tr>
              <th scope="col">Grade</th>
              <th scope="col" className="dt-num">Students</th>
            </tr>
          </thead>
          <tbody>{GRADE_ROW.map((g) => renderRosterRow(g, grid[g] ?? 0, setCell, disabled))}</tbody>
          <tfoot>
            <tr className="dt-foot">
              <td>Total</td>
              <td className="dt-num">{total}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Section>
  )
}
