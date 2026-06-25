// Driver Model — assumptions inputs (left column). Module-scope components +
// render-helper functions only (React-Compiler safe — no in-render component
// defs, no setState during render). Every numeric field rejects letters via
// sanitizeDecimal / sanitizeInteger and reports a parsed Number to the parent.
import { motion } from 'framer-motion'
import { Users, DollarSign, PieChart, Briefcase, TrendingUp } from 'lucide-react'
import { sanitizeDecimal, sanitizeInteger } from '../../lib/numericInput.js'
import {
  GRADE_ROW,
  GRADE_LABELS,
  rateBandLabel,
  ROLE_ORDER,
  ROLE_LABELS,
  PROGRAM_LABELS,
  programSplitSum,
} from './driverModel.js'

// Parse a sanitized string to a Number for state; blank/partial → 0.
function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// One labeled numeric input. `integer` picks the digits-only sanitizer.
function NumberField({ label, value, onChange, integer = false, disabled, prefix, suffix, min }) {
  const sanitize = integer ? sanitizeInteger : sanitizeDecimal
  return (
    <label className="block">
      {label != null && (
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
          {label}
        </span>
      )}
      <span className="flex items-center rounded-lg border border-rule bg-white focus-within:border-gold focus-within:ring-1 focus-within:ring-gold/40">
        {prefix && <span className="pl-2.5 text-[13px] text-muted">{prefix}</span>}
        <input
          type="text"
          inputMode={integer ? 'numeric' : 'decimal'}
          disabled={disabled}
          value={value === 0 ? '' : String(value)}
          placeholder="0"
          min={min}
          onChange={(e) => onChange(num(sanitize(e.target.value)))}
          className="w-full bg-transparent px-2.5 py-1.5 text-right text-[14px] tabular-nums text-ink outline-none disabled:opacity-50"
        />
        {suffix && <span className="pr-2.5 text-[13px] text-muted">{suffix}</span>}
      </span>
    </label>
  )
}

// ── Section shell ────────────────────────────────────────────────────────────
function Section({ icon, title, hint, children, badge }) {
  const Icon = icon
  return (
    <div className="card-soft p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/15 text-gold">
          <Icon size={16} />
        </span>
        <div className="flex-1">
          <h4 className="font-serif text-[15px] font-semibold text-navy">{title}</h4>
          {hint && <p className="text-[12px] text-muted">{hint}</p>}
        </div>
        {badge}
      </div>
      {children}
    </div>
  )
}

// ── Render helpers (called as {renderX()} with keys — NOT components) ──────────

function renderEnrollmentCell(grade, value, onCell, disabled) {
  return (
    <div key={`enr-${grade}`} className="flex flex-col">
      <span className="mb-0.5 text-center text-[11px] font-semibold text-muted">
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

// Section ids (stable keys for the optional `sections` filter). The wizard shows
// one topic per step by passing a single-id array; the full Driver Model tab
// passes nothing and gets all sections (default), so it keeps working unchanged.
export const ASSUMPTION_SECTIONS = ['enrollment', 'tuition', 'split', 'staffing', 'inflation']

export default function DriverAssumptionsForm({ assumptions, onChange, disabled, sections }) {
  const a = assumptions
  // `sections` undefined → show all (backward compatible). Otherwise only the ids listed.
  const show = (id) => sections == null || sections.includes(id)

  // Immutable patch helpers — each returns a fresh assumptions object so the
  // parent's useMemo preview recomputes. No mutation of the prop.
  const setEnrollment = (grade, v) =>
    onChange({ ...a, enrollmentByGrade: { ...a.enrollmentByGrade, [grade]: v } })
  const setRate = (band, v) =>
    onChange({ ...a, tuitionRates: { ...a.tuitionRates, [band]: v } })
  const setSplit = (key, v) =>
    onChange({ ...a, tuitionProgramSplit: { ...a.tuitionProgramSplit, [key]: v } })
  const setFee = (v) => onChange({ ...a, feePerStudent: v })
  const setInflation = (v) => onChange({ ...a, inflationPct: v })
  const setBenefits = (v) =>
    onChange({ ...a, staffing: { ...a.staffing, benefitsPct: v } })
  const setRole = (role, field, v) =>
    onChange({
      ...a,
      staffing: { ...a.staffing, [role]: { ...a.staffing[role], [field]: v } },
    })

  const enrollTotal = GRADE_ROW.reduce((s, g) => s + (Number(a.enrollmentByGrade[g]) || 0), 0)
  const bands = Object.keys(a.tuitionRates || {})
  const splitSum = programSplitSum(a.tuitionProgramSplit)
  const splitOk = Math.abs(splitSum - 100) < 0.01

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-4"
    >
      {show('enrollment') && (
      <Section
        icon={Users}
        title="Students in each grade"
        hint="How many students you expect per grade. This sets your tuition."
        badge={
          <span className="rounded-full bg-navy/[0.06] px-2.5 py-1 text-[12px] font-semibold tabular-nums text-navy">
            {enrollTotal} students
          </span>
        }
      >
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-7">
          {GRADE_ROW.map((g) => renderEnrollmentCell(g, a.enrollmentByGrade[g] ?? 0, setEnrollment, disabled))}
        </div>
      </Section>
      )}

      {show('tuition') && (
      <Section icon={DollarSign} title="Tuition price per grade" hint="The yearly tuition you charge each grade group.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {bands.map((b) => (
            <NumberField
              key={`rate-${b}`}
              label={rateBandLabel(b)}
              value={a.tuitionRates[b] ?? 0}
              onChange={(v) => setRate(b, v)}
              prefix="$"
              disabled={disabled}
            />
          ))}
        </div>
        <div className="mt-3">
          <NumberField
            label="Extra fees per student (registration, activity)"
            value={a.feePerStudent ?? 0}
            onChange={setFee}
            prefix="$"
            disabled={disabled}
          />
        </div>
      </Section>
      )}

      {show('split') && (
      <Section
        icon={PieChart}
        title="How tuition gets paid"
        hint="Split your tuition by who pays. Must add up to 100%."
        badge={
          <span
            className={`rounded-full px-2.5 py-1 text-[12px] font-semibold tabular-nums ${
              splitOk
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-amber-100 text-amber-700'
            }`}
          >
            sums to {splitSum.toFixed(splitSum % 1 === 0 ? 0 : 1)}%
          </span>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {['parent', 'ftc', 'fes'].map((k) => (
            <NumberField
              key={`split-${k}`}
              label={PROGRAM_LABELS[k]}
              value={a.tuitionProgramSplit[k] ?? 0}
              onChange={(v) => setSplit(k, v)}
              suffix="%"
              disabled={disabled}
            />
          ))}
        </div>
        <p className="mt-2 text-[11.5px] leading-snug text-muted">
          <strong className="text-navy">Parent / FACTS</strong> = families paying directly ·{' '}
          <strong className="text-navy">SUFS / FTC</strong> = Step Up (Florida Tax Credit) scholarship ·{' '}
          <strong className="text-navy">FES-UA</strong> = Step Up (Family Empowerment) scholarship.
        </p>
        {!splitOk && (
          <p className="mt-2 text-[12px] font-medium text-amber-700">
            These need to add up to 100% before you can apply the budget.
          </p>
        )}
      </Section>
      )}

      {show('staffing') && (
      <Section icon={Briefcase} title="Staff & pay" hint="How many staff in each role and their average pay. We add benefits on top.">
        <div className="space-y-3">
          {ROLE_ORDER.map((role) => (
            <div key={`role-${role}`} className="grid grid-cols-2 items-end gap-3">
              <NumberField
                label={`${ROLE_LABELS[role]} — how many`}
                value={a.staffing[role]?.count ?? 0}
                onChange={(v) => setRole(role, 'count', v)}
                integer
                disabled={disabled}
              />
              <NumberField
                label="Average pay each"
                value={a.staffing[role]?.avgSalary ?? 0}
                onChange={(v) => setRole(role, 'avgSalary', v)}
                prefix="$"
                disabled={disabled}
              />
            </div>
          ))}
          <NumberField
            label="Benefits (% added on top of pay)"
            value={a.staffing.benefitsPct ?? 0}
            onChange={setBenefits}
            suffix="%"
            disabled={disabled}
          />
        </div>
      </Section>
      )}

      {show('inflation') && (
      <Section
        icon={TrendingUp}
        title="Everything else"
        hint="We grow all your other budget lines from last year by this amount."
      >
        <NumberField
          label="Yearly increase"
          value={a.inflationPct ?? 0}
          onChange={setInflation}
          suffix="%"
          disabled={disabled}
        />
      </Section>
      )}
    </motion.div>
  )
}
