// Feeder anticipated-enrollment grid — a free 14-grade integer input for the
// NET-NEW students a school expects from feeder programs/parishes. These are
// ADDED ON TOP of the projected enrollment (DriverAssumptionsForm's grade grid)
// before the forecast's tuition is computed — so they raise gross tuition via the
// existing computeDriverBudget path. NOT a linked school; just an input.
//
// A `.dt` sheet (Grade · Incoming, total foot) over GRADE_ROW + sanitizeInteger. Module-scope component + a render-HELPER for the cell (React-
// Compiler safe — no in-render component defs, no setState in render).
import { Sprout } from 'lucide-react'
import { sanitizeInteger } from '../../lib/numericInput.js'
import { GRADE_ROW, GRADE_LABELS } from './driverModel.js'
import { gradeGridTotal } from '../../lib/mergeFeeder.js'
import { Section, Pill } from '../ui/surface/index.js'
import '../../styles/pending/b2-finance.css'

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// One sheet row: the grade, then its integer input (right-aligned, tabular).
function renderFeederRow(grade, value, onCell, disabled) {
  const label = GRADE_LABELS[grade] ?? grade
  return (
    <tr key={`feeder-${grade}`}>
      <td>{label}</td>
      <td className="dt-num py-1">
        <input
          type="text"
          inputMode="numeric"
          disabled={disabled}
          value={value === 0 ? '' : String(value)}
          placeholder="0"
          aria-label={`${label} — incoming students`}
          onChange={(e) => onCell(grade, num(sanitizeInteger(e.target.value)))}
          className="b2-cell-input ml-auto block max-w-[7rem]"
        />
      </td>
    </tr>
  )
}

export default function FeederEnrollmentGrid({ feeder, onChange, disabled, mode }) {
  const grid = feeder || {}
  const total = gradeGridTotal(grid)

  // In roll-forward mode the SAME feeder field is the "New entrants by grade"
  // input (no second field, same operational persistence) — only the copy changes.
  const rollforward = mode === 'rollforward'
  const title = rollforward ? 'New entrants by grade' : 'Anticipated incoming students (feeder)'

  const setCell = (grade, v) => onChange({ ...grid, [grade]: v })

  return (
    <Section label={title} aside={<Pill variant="count">+{total} students</Pill>} className="first:mt-0">
      <p className="mb-2 flex items-start gap-2 text-small text-ink2">
        <Sprout size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
        <span>
          {rollforward ? (
            <>
              Students entering fresh at any grade — entry grades{' '}
              <span className="font-semibold text-ink">(PK, K)</span> plus transfers anywhere.
            </>
          ) : (
            <>
              New students you expect from feeder schools/programs, added{' '}
              <span className="font-semibold text-ink">on top</span> of your projected enrollment (do
              not also add them to the grade grid).
            </>
          )}
        </span>
      </p>
      <div className="dt-wrap">
        <table className="dt">
          <thead>
            <tr>
              <th scope="col">Grade</th>
              <th scope="col" className="dt-num">{rollforward ? 'New entrants' : 'Incoming'}</th>
            </tr>
          </thead>
          <tbody>{GRADE_ROW.map((g) => renderFeederRow(g, grid[g] ?? 0, setCell, disabled))}</tbody>
          <tfoot>
            <tr className="dt-foot">
              <td>Total</td>
              <td className="dt-num">+{total}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Section>
  )
}
