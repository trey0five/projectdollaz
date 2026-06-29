// Feeder anticipated-enrollment grid — a free 14-grade integer input for the
// NET-NEW students a school expects from feeder programs/parishes. These are
// ADDED ON TOP of the projected enrollment (DriverAssumptionsForm's grade grid)
// before the forecast's tuition is computed — so they raise gross tuition via the
// existing computeDriverBudget path. NOT a linked school; just an input.
//
// Mirrors DriverAssumptionsForm's enrollment cells (GRADE_ROW, sanitizeInteger,
// navy/gold). Module-scope component + a render-HELPER for the cell (React-
// Compiler safe — no in-render component defs, no setState in render).
import { motion } from 'framer-motion'
import { Sprout } from 'lucide-react'
import { sanitizeInteger } from '../../lib/numericInput.js'
import { GRADE_ROW, GRADE_LABELS } from './driverModel.js'
import { gradeGridTotal } from '../../lib/mergeFeeder.js'

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function renderFeederCell(grade, value, onCell, disabled) {
  return (
    <div key={`feeder-${grade}`} className="flex flex-col">
      <span className="mb-0.5 flex min-h-[2.4em] items-end justify-center text-center text-[11px] font-semibold leading-tight text-muted">
        {GRADE_LABELS[grade] ?? grade}
      </span>
      <input
        type="text"
        inputMode="numeric"
        disabled={disabled}
        value={value === 0 ? '' : String(value)}
        placeholder="0"
        onChange={(e) => onCell(grade, num(sanitizeInteger(e.target.value)))}
        className="w-full rounded-md border border-rule bg-white px-1.5 py-1.5 text-center text-[13px] tabular-nums text-ink outline-none focus:border-gold focus:ring-1 focus:ring-gold/40 disabled:opacity-50"
      />
    </div>
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
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="card-soft p-4"
    >
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/15 text-gold">
          <Sprout size={16} />
        </span>
        <div className="flex-1">
          <h4 className="font-serif text-[15px] font-semibold text-navy">{title}</h4>
          <p className="text-[12px] text-muted">
            {rollforward ? (
              <>
                Students entering fresh at any grade — entry grades{' '}
                <span className="font-semibold text-navy">(PK, K)</span> plus transfers anywhere.
              </>
            ) : (
              <>
                New students you expect from feeder schools/programs, added{' '}
                <span className="font-semibold text-navy">on top</span> of your projected enrollment
                (do not also add them to the grade grid).
              </>
            )}
          </p>
        </div>
        <span className="rounded-full bg-gold/15 px-2.5 py-1 text-[12px] font-semibold tabular-nums text-gold">
          +{total} students
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {GRADE_ROW.map((g) => renderFeederCell(g, grid[g] ?? 0, setCell, disabled))}
      </div>
    </motion.div>
  )
}
