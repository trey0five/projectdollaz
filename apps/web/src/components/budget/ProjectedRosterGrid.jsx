// Phase 4 — read-only "Projected roster" by grade (roll-forward output).
//
// Shows the SHARED `effective` map (effectiveEnrollment from @finrep/analytics),
// so every cell equals exactly what the server stores and what tuition is driven
// by. Each grade has a per-grade OVERRIDE affordance: an edit pill that REPLACES
// the computed value (written to rollForward.projectedOverrideByGrade[g]);
// overridden rows carry an "override" Pill and a clear control (blank = use computed).
// The total row shows projected enrollment.
//
// Module-scope component + a render-HELPER for the cell (React-Compiler safe).
import { Layers, Pencil, X } from 'lucide-react'
import { sanitizeInteger } from '../../lib/numericInput.js'
import { GRADE_ROW, GRADE_LABELS } from './driverModel.js'
import { gradeGridTotal } from '../../lib/mergeFeeder.js'
import { Section, Pill } from '../ui/surface/index.js'

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// `effective` is the computed roster (already includes any overrides). `overrides`
// is the sparse override map. One `.dt` row per grade: the grade, the effective
// number (or the override input while editing), and the row actions (edit /
// clear) that fade in on hover and stay on under focus / touch.
function renderProjectedRow(grade, computedValue, isOverridden, editing, onStartEdit, onSetOverride, onClearOverride, disabled) {
  const label = GRADE_LABELS[grade] ?? grade
  return (
    <tr key={`proj-${grade}`}>
      <td>
        {label}
        {isOverridden && (
          <Pill variant="status" tone="neutral" className="ml-2">
            override
          </Pill>
        )}
      </td>
      <td className="dt-num py-1 font-semibold">
        {editing && !disabled ? (
          <input
            type="text"
            inputMode="numeric"
            autoFocus
            value={computedValue === 0 ? '' : String(computedValue)}
            placeholder="0"
            aria-label={`${label} — projected students (override)`}
            onChange={(e) => onSetOverride(grade, num(sanitizeInteger(e.target.value)))}
            onBlur={() => onStartEdit(null)}
            className="b2-cell-input ml-auto block max-w-[7rem] font-semibold"
          />
        ) : (
          computedValue
        )}
      </td>
      <td className="w-[1%] whitespace-nowrap">
        {!disabled && (
          <span className="dt-actions inline-flex gap-1">
            <button
              type="button"
              title="Override this grade"
              aria-label={`Override ${label}`}
              onClick={() => onStartEdit(grade)}
              className="dt-link p-1"
            >
              <Pencil size={12} aria-hidden="true" />
            </button>
            {isOverridden && (
              <button
                type="button"
                title="Clear override (use computed)"
                aria-label={`Clear the ${label} override`}
                onClick={() => onClearOverride(grade)}
                className="dt-link p-1"
              >
                <X size={12} aria-hidden="true" />
              </button>
            )}
          </span>
        )}
      </td>
    </tr>
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
    <Section label="Projected roster" aside={<Pill variant="count">{total} students</Pill>} className="first:mt-0">
      <p className="mb-2 flex items-start gap-2 text-small text-ink2">
        <Layers size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
        Computed from roll-forward + new entrants — this exact roster drives tuition. Use the pencil to
        override a single grade.
      </p>
      <div className="dt-wrap">
        <table className="dt">
          <thead>
            <tr>
              <th scope="col">Grade</th>
              <th scope="col" className="dt-num">Projected</th>
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {GRADE_ROW.map((g) =>
              renderProjectedRow(
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
          </tbody>
          <tfoot>
            <tr className="dt-foot">
              <td>Total</td>
              <td className="dt-num">{total}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {overrideCount > 0 && (
        <p className="sec-note">
          {overrideCount} grade{overrideCount === 1 ? '' : 's'} manually overridden (marked “override”).
        </p>
      )}
    </Section>
  )
}
