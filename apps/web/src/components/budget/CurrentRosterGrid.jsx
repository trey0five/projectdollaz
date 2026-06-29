// Phase 4 — "This year's roster" current-enrollment grid (roll-forward input).
//
// A 14-grade integer grid for THIS year's actual enrollment by grade, which the
// roll-forward ages up one grade with retention. Mirrors FeederEnrollmentGrid's
// cell layout / sanitizeInteger / navy-gold. "Seed from this year" prefills from
// the saved driver assumptions' enrollmentByGrade, else an even spread of the
// operational enrollment scalar total (reuses seedAssumptions' even-spread). The
// seeded values stay editable. Writes rollForward.currentByGrade.
//
// Module-scope component + a render-HELPER for the cell (React-Compiler safe).
import { motion } from 'framer-motion'
import { Users, Wand2 } from 'lucide-react'
import { sanitizeInteger } from '../../lib/numericInput.js'
import { GRADE_ROW, GRADE_LABELS } from './driverModel.js'
import { gradeGridTotal } from '../../lib/mergeFeeder.js'

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

function renderRosterCell(grade, value, onCell, disabled) {
  return (
    <div key={`roster-${grade}`} className="flex flex-col">
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

export default function CurrentRosterGrid({ current, onChange, onSeed, disabled }) {
  const grid = current || {}
  const total = gradeGridTotal(grid)

  const setCell = (grade, v) => onChange({ ...grid, [grade]: v })

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="card-soft p-4"
    >
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy/[0.08] text-navy">
          <Users size={16} />
        </span>
        <div className="flex-1">
          <h4 className="font-serif text-[15px] font-semibold text-navy">This year’s roster</h4>
          <p className="text-[12px] text-muted">
            Current enrollment by grade. Roll-forward ages each grade up one year, applying your
            retention rate.
          </p>
        </div>
        <span className="rounded-full bg-navy/[0.06] px-2.5 py-1 text-[12px] font-semibold tabular-nums text-navy">
          {total} students
        </span>
      </div>
      {onSeed && (
        <button
          type="button"
          disabled={disabled}
          onClick={onSeed}
          className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-gold/40 bg-gold/10 px-3 py-1.5 text-[12.5px] font-semibold text-gold transition-colors hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Wand2 size={14} /> Seed from this year
        </button>
      )}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {GRADE_ROW.map((g) => renderRosterCell(g, grid[g] ?? 0, setCell, disabled))}
      </div>
    </motion.div>
  )
}
