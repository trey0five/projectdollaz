// Phase 4 — retention control for the roll-forward projection.
//
// Primary "Default retention %" input (default 93) drives every promoted cohort.
// An expandable disclosure (framer-motion height) exposes 14 per-grade percent
// overrides — blank inherits the default — writing rollForward.retentionByGrade.
// A "Graduating grade" select (default '8', options = GRADE_KEYS via GRADE_ROW)
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

function clampPct(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, n))
}

function renderOverrideCell(grade, raw, onCell, disabled) {
  // raw is the stored override (number) or undefined (inherits default).
  const value = raw === undefined || raw === null ? '' : String(raw)
  return (
    <div key={`ret-${grade}`} className="flex flex-col">
      <span className="mb-0.5 text-center text-[10.5px] font-semibold text-muted">
        Gr {GRADE_LABELS[grade] ?? grade}
      </span>
      <input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={value}
        placeholder="—"
        onChange={(e) => onCell(grade, sanitizeDecimal(e.target.value))}
        className="w-full rounded-md border border-rule bg-white px-1 py-1 text-center text-[12px] tabular-nums text-ink outline-none focus:border-gold focus:ring-1 focus:ring-gold/40 disabled:opacity-50"
      />
    </div>
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
  const grad = GRADE_ROW.includes(graduatingGrade) ? graduatingGrade : '8'

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
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="card-soft p-4"
    >
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/15 text-gold">
          <Percent size={16} />
        </span>
        <div className="flex-1">
          <h4 className="font-serif text-[15px] font-semibold text-navy">Retention</h4>
          <p className="text-[12px] text-muted">
            Share of each grade that returns and moves up. Applied to the grade students are{' '}
            <span className="font-semibold text-navy">leaving</span>.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
            Default retention %
          </span>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              inputMode="decimal"
              disabled={disabled}
              value={retentionPct === undefined || retentionPct === null ? '' : String(retentionPct)}
              placeholder="93"
              onChange={(e) => onDefaultChange(clampPct(sanitizeDecimal(e.target.value)))}
              className="w-24 rounded-md border border-rule bg-white px-2.5 py-1.5 text-center text-[14px] font-semibold tabular-nums text-navy outline-none focus:border-gold focus:ring-1 focus:ring-gold/40 disabled:opacity-50"
            />
            <span className="text-[13px] font-semibold text-muted">%</span>
          </div>
        </label>

        <label className="flex flex-col gap-1">
          <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
            <GraduationCap size={12} /> Graduating grade
          </span>
          <select
            disabled={disabled}
            value={grad}
            onChange={(e) => onGraduatingChange(e.target.value)}
            className="rounded-md border border-rule bg-white px-2.5 py-1.5 text-[13px] font-semibold text-navy outline-none focus:border-gold focus:ring-1 focus:ring-gold/40 disabled:opacity-50"
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
        className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-gold transition-colors hover:text-navy"
      >
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
        Per-grade overrides
        {overrideCount > 0 && (
          <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[11px] tabular-nums text-gold">
            {overrideCount}
          </span>
        )}
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
            <p className="mb-2 mt-3 text-[11.5px] text-muted">
              % of current Gr-N returning. Blank inherits the default ({retentionPct ?? 93}%).
            </p>
            <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-7">
              {GRADE_ROW.map((g) => renderOverrideCell(g, overrides[g], setOverride, disabled))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
