// Phase 4 — retention control for the roll-forward projection.
//
// Primary "Default retention %" input (default 93) drives every promoted cohort.
// An expandable disclosure (framer-motion height) exposes 15 per-grade percent
// overrides — blank inherits the default — writing rollForward.retentionByGrade.
// A "Graduating grade" select (default = top grade, options = GRADE_KEYS via GRADE_ROW)
// writes rollForward.graduatingGrade: that grade's current cohort exits the school
// instead of rolling up.
//
// SEMANTICS: retention is keyed by the SOURCE grade — '% of current Gr-N
// returning' (the grade students are LEAVING). Labeled explicitly to avoid the
// source-vs-destination ambiguity.
//
// Module-scope component + render helpers (React-Compiler safe).
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Percent, ChevronDown, GraduationCap } from 'lucide-react'
import { sanitizeDecimal } from '../../lib/numericInput.js'
import { GRADE_ROW, GRADE_LABELS } from './driverModel.js'
import { Section, Pill } from '../ui/surface/index.js'
import '../../styles/pending/b2-finance.css'

function clampPct(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, n))
}

function renderOverrideRow(grade, raw, onCell, disabled) {
  // raw is the stored override (number) or undefined (inherits default).
  const value = raw === undefined || raw === null ? '' : String(raw)
  const label = GRADE_LABELS[grade] ?? grade
  return (
    <tr key={`ret-${grade}`}>
      <td>Gr {label}</td>
      <td className="dt-num py-1">
        <input
          type="text"
          inputMode="decimal"
          disabled={disabled}
          value={value}
          placeholder="—"
          aria-label={`Gr ${label} — % returning`}
          onChange={(e) => onCell(grade, sanitizeDecimal(e.target.value))}
          className="b2-cell-input ml-auto block max-w-[6rem]"
        />
      </td>
    </tr>
  )
}

export default function RetentionControl({
  retentionPct,
  retentionByGrade,
  graduatingGrade,
  onDefaultChange,
  onOverrideChange,
  onGraduatingChange,
  disabled,
}) {
  const [open, setOpen] = useState(false)
  const overrides = retentionByGrade || {}
  const overrideCount = GRADE_ROW.filter((g) => overrides[g] !== undefined && overrides[g] !== null).length
  const grad = GRADE_ROW.includes(graduatingGrade)
    ? graduatingGrade
    : GRADE_ROW[GRADE_ROW.length - 1]

  // Per-grade cell change: blank clears the override (inherit default), else
  // store the clamped number. We pass the SANITIZED string in and decide here.
  const setOverride = (grade, str) => {
    if (str === '' || str === '.') {
      onOverrideChange(grade, undefined)
    } else {
      onOverrideChange(grade, clampPct(str))
    }
  }

  return (
    <Section label="Retention" className="first:mt-0">
      <p className="mb-3 flex items-start gap-2 text-small text-ink2">
        <Percent size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
        <span>
          Share of each grade that returns and moves up. Applied to the grade students are{' '}
          <span className="font-semibold text-ink">leaving</span>.
        </span>
      </p>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="b2-label !mb-0">Default retention %</span>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              inputMode="decimal"
              disabled={disabled}
              value={retentionPct === undefined || retentionPct === null ? '' : String(retentionPct)}
              placeholder="93"
              onChange={(e) => onDefaultChange(clampPct(sanitizeDecimal(e.target.value)))}
              className="b2-input w-24 text-center font-semibold tabular-nums disabled:opacity-50"
            />
            <span className="text-[13px] font-semibold text-ink2">%</span>
          </div>
        </label>

        <label className="flex flex-col gap-1">
          <span className="b2-label !mb-0 flex items-center gap-1">
            <GraduationCap size={12} aria-hidden="true" /> Graduating grade
          </span>
          <select
            disabled={disabled}
            value={grad}
            onChange={(e) => onGraduatingChange(e.target.value)}
            className="sel h-9 disabled:opacity-50"
          >
            {GRADE_ROW.map((g) => (
              <option key={g} value={g}>
                {GRADE_LABELS[g] ?? g}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="dt-link mt-3"
      >
        <ChevronDown size={14} aria-hidden="true" className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        Per-grade overrides
        {overrideCount > 0 && <Pill variant="count">{overrideCount}</Pill>}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <p className="mb-2 mt-3 text-[12px] text-ink2">
              % of current Gr-N returning. Blank inherits the default ({retentionPct ?? 93}%).
            </p>
            <div className="dt-wrap">
              <table className="dt">
                <thead>
                  <tr>
                    <th scope="col">Leaving grade</th>
                    <th scope="col" className="dt-num">% returning</th>
                  </tr>
                </thead>
                <tbody>{GRADE_ROW.map((g) => renderOverrideRow(g, overrides[g], setOverride, disabled))}</tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Section>
  )
}
