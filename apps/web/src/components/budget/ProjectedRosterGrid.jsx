// Phase 4 — read-only "Projected roster" by grade (roll-forward output).
//
// Shows the SHARED `effective` map (effectiveEnrollment from @finrep/analytics),
// so every cell equals exactly what the server stores and what tuition is driven
// by. Each grade has a per-grade OVERRIDE affordance: an edit pill that REPLACES
// the computed value (written to rollForward.projectedOverrideByGrade[g]);
// overridden cells render in gold with a clear control (blank = use computed).
// The total row shows projected enrollment.
//
// Module-scope component + a render-HELPER for the cell (React-Compiler safe).
import { motion } from 'framer-motion'
import { Layers, Pencil, X } from 'lucide-react'
import { sanitizeInteger } from '../../lib/numericInput.js'
import { GRADE_ROW, GRADE_LABELS } from './driverModel.js'
import { gradeGridTotal } from '../../lib/mergeFeeder.js'

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// `effective` is the computed roster (already includes any overrides). `overrides`
// is the sparse override map. For display we want: the effective number, plus a
// flag for whether this grade is overridden.
function renderProjectedCell(grade, computedValue, isOverridden, editing, onStartEdit, onSetOverride, onClearOverride, disabled) {
  if (editing && !disabled) {
    return (
      <div key={`proj-${grade}`} className="flex flex-col">
        <span className="mb-0.5 flex min-h-[2.4em] items-end justify-center text-center text-[11px] font-semibold leading-tight text-muted">
          {GRADE_LABELS[grade] ?? grade}
        </span>
        <input
          type="text"
          inputMode="numeric"
          autoFocus
          value={computedValue === 0 ? '' : String(computedValue)}
          placeholder="0"
          onChange={(e) => onSetOverride(grade, num(sanitizeInteger(e.target.value)))}
          onBlur={() => onStartEdit(null)}
          className="w-full rounded-md border border-gold bg-gold/5 px-1.5 py-1.5 text-center text-[13px] font-semibold tabular-nums text-navy outline-none focus:ring-1 focus:ring-gold/40"
        />
      </div>
    )
  }
  return (
    <div key={`proj-${grade}`} className="flex flex-col">
      <span className="mb-0.5 flex min-h-[2.4em] items-end justify-center text-center text-[11px] font-semibold leading-tight text-muted">
        {GRADE_LABELS[grade] ?? grade}
      </span>
      <div
        className={`group relative flex items-center justify-center rounded-md border px-1.5 py-1.5 text-[13px] font-semibold tabular-nums ${
          isOverridden
            ? 'border-gold/60 bg-gold/15 text-gold'
            : 'border-rule bg-cream/40 text-navy'
        }`}
      >
        <span>{computedValue}</span>
        {!disabled && (
          <div className="absolute right-0.5 top-0.5 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              title="Override this grade"
              onClick={() => onStartEdit(grade)}
              className="rounded p-0.5 text-muted hover:text-gold"
            >
              <Pencil size={11} />
            </button>
            {isOverridden && (
              <button
                type="button"
                title="Clear override (use computed)"
                onClick={() => onClearOverride(grade)}
                className="rounded p-0.5 text-muted hover:text-rose-600"
              >
                <X size={11} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ProjectedRosterGrid({
  effective,
  overrides,
  editingGrade,
  onStartEdit,
  onSetOverride,
  onClearOverride,
  disabled,
}) {
  const eff = effective || {}
  const ov = overrides || {}
  const total = gradeGridTotal(eff)
  const overrideCount = GRADE_ROW.filter((g) => ov[g] !== undefined && ov[g] !== null).length

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="card-soft p-4"
    >
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold-gradient text-white">
          <Layers size={16} />
        </span>
        <div className="flex-1">
          <h4 className="font-serif text-[15px] font-semibold text-navy">Projected roster</h4>
          <p className="text-[12px] text-muted">
            Computed from roll-forward + new entrants — this exact grid drives tuition. Hover a cell
            to override a single grade.
          </p>
        </div>
        <span className="rounded-full bg-gold/15 px-2.5 py-1 text-[12px] font-semibold tabular-nums text-gold">
          {total} students
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {GRADE_ROW.map((g) =>
          renderProjectedCell(
            g,
            num(eff[g]),
            ov[g] !== undefined && ov[g] !== null,
            editingGrade === g,
            onStartEdit,
            onSetOverride,
            onClearOverride,
            disabled,
          ),
        )}
      </div>
      {overrideCount > 0 && (
        <p className="mt-2.5 text-[11.5px] text-gold">
          {overrideCount} grade{overrideCount === 1 ? '' : 's'} manually overridden (shown in gold).
        </p>
      )}
    </motion.div>
  )
}
