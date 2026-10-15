// Driver Model — assumptions inputs (left column). Module-scope components +
// render-helper functions only (React-Compiler safe — no in-render component
// defs, no setState during render). Every numeric field rejects letters via
// sanitizeDecimal / sanitizeInteger and reports a parsed Number to the parent.
import { motion, useReducedMotion } from 'framer-motion'
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
import { Pill } from '../ui/surface/index.js'

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
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-ink2">
          {label}
        </span>
      )}
      <span className="flex h-9 items-center rounded-md border border-hair/[0.18] bg-white focus-within:border-[#2563EB] focus-within:ring-2 focus-within:ring-[#2563EB]/25">
        {prefix && <span className="pl-2.5 text-[13px] text-ink2">{prefix}</span>}
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
        {suffix && <span className="pr-2.5 text-[13px] text-ink2">{suffix}</span>}
      </span>
    </label>
  )
}

// ── Group shell — a titled group ON THE GROUND (the wizard step around it is
// the one Panel; a card per group would nest boxes). Icon stroke + ink title +
// ink-2 hint on a hairline, the badge (a Pill) at the end of the row.
// `bare` — the budget wizard already titles the step with the same words (one
// topic per step), so the group drops its own title/hint and keeps only the badge.
function Section({ icon, title, hint, children, badge, bare = false }) {
  const Icon = icon
  if (bare) {
    return (
      <div className="space-y-3">
        {badge ? <div className="flex justify-end">{badge}</div> : null}
        {children}
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5 border-b border-hair pb-2">
        <Icon size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-ink2" />
        <div className="min-w-0 flex-1">
          <h4 className="text-[15px] font-semibold leading-snug text-ink">{title}</h4>
          {hint && <p className="text-small text-ink2">{hint}</p>}
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
      <span className="mb-0.5 flex min-h-[2.4em] items-end justify-center text-center text-[11px] font-semibold leading-tight text-ink2">
        {GRADE_LABELS[grade] ?? grade}
      </span>
      <input
        type="text"
        inputMode="numeric"
        disabled={disabled}
        value={value === 0 ? '' : String(value)}
        placeholder="0"
        onChange={(e) => onCell(grade, num(sanitizeInteger(e.target.value)))}
        aria-label={`Students in ${GRADE_LABELS[grade] ?? grade}`}
        className="h-9 w-full rounded-md border border-hair/[0.18] bg-white px-1.5 text-center text-[13px] tabular-nums text-ink outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/25 disabled:opacity-50"
      />
    </div>
  )
}

// Section ids (stable keys for the optional `sections` filter). The wizard shows
// one topic per step by passing a single-id array; the full Driver Model tab
// passes nothing and gets all sections (default), so it keeps working unchanged.
export const ASSUMPTION_SECTIONS = ['enrollment', 'tuition', 'split', 'staffing', 'inflation']

export default function DriverAssumptionsForm({ assumptions, onChange, disabled, sections, bare = false }) {
  const reduce = useReducedMotion()
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
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      {show('enrollment') && (
      <Section
        bare={bare}
        icon={Users}
        title="Students in each grade"
        hint="How many students you expect per grade. This sets your tuition."
        badge={<Pill variant="count">{enrollTotal} students</Pill>}
      >
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {GRADE_ROW.map((g) => renderEnrollmentCell(g, a.enrollmentByGrade[g] ?? 0, setEnrollment, disabled))}
        </div>
      </Section>
      )}

      {show('tuition') && (
      <Section bare={bare} icon={DollarSign} title="Tuition price per grade" hint="The yearly tuition you charge each grade group.">
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
        bare={bare}
        icon={PieChart}
        title="How tuition gets paid"
        hint="Split your tuition by who pays. Must add up to 100%."
        badge={
          <Pill variant="status" tone={splitOk ? 'good' : 'watch'} className="tabular-nums">
            sums to {splitSum.toFixed(splitSum % 1 === 0 ? 0 : 1)}%
          </Pill>
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
        <p className="mt-2 text-[12px] leading-snug text-ink2">
          <strong className="text-ink">Parent / FACTS</strong> = families paying directly ·{' '}
          <strong className="text-ink">SUFS / FTC</strong> = Step Up (Florida Tax Credit) scholarship ·{' '}
          <strong className="text-ink">FES-UA</strong> = Step Up (Family Empowerment) scholarship.
        </p>
        {!splitOk && (
          <p className="b2-callout mt-2" data-tone="watch">
            These need to add up to 100% before you can apply the budget.
          </p>
        )}
      </Section>
      )}

      {show('staffing') && (
      <Section bare={bare} icon={Briefcase} title="Staff & pay" hint="How many staff in each role and their average pay. We add benefits on top.">
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
        bare={bare}
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
