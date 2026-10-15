// Driver Model — LIVE computed preview. Renders the result of
// computeDriverBudget (passed in as `result`): a StatStrip of the headline
// figures, the tuition/fees/salaries/benefits detail as ruled figure columns,
// and the resulting category budget as a `.dt` sheet with per-category
// override inputs (Premium UI P4 — no KPI cards, no navy section bands, no gold
// total row). Pure presentation — no math here, no effects, module-scope
// components only (React-Compiler safe).
import { motion, useReducedMotion } from 'framer-motion'
import { Users, SlidersHorizontal } from 'lucide-react'
import {
  REVENUE_LINE_KEYS,
  EXPENSE_LINE_KEYS,
  REVENUE_LINE_LABELS,
  EXPENSE_LINE_LABELS,
} from '@finrep/analytics'
import { fmt } from '../../lib/format.js'
import { sanitizeDecimal } from '../../lib/numericInput.js'
import { Section, StatStrip, Stat } from '../ui/surface/index.js'
import { statMoney, statPct, signedMoney } from './StatFigure.jsx'

// Whole-dollar with thousands separators (em dash for blank/zero).
function money(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}
function dollar(n) {
  return n == null || Number.isNaN(n) ? '—' : `$${money(n)}`
}

// The four expense categories whose value is staffing-DRIVEN; for these an
// override is treated by the engine as an extra NON-SALARY amount ADDED on top of
// the computed pay/benefits (not a replacement), so we label them differently.
const ADDON_KEYS = new Set(['instructional', 'admin', 'facilities', 'fixedOther'])

// ── Category budget row with an inline override input (module scope) ──────────
function CategoryRow({ label, computed, overrideVal, onOverride, disabled, addOn }) {
  const isOverridden = overrideVal != null && overrideVal !== ''
  return (
    <tr>
      <td>
        {label}
        {addOn && <span className="ml-1.5 text-[11px] italic text-ink2">(pay-driven)</span>}
      </td>
      <td className="dt-num">{dollar(computed)}</td>
      <td className="dt-num">
        <span
          className="ml-auto flex w-max items-center rounded-[4px] border border-hair/[0.18] bg-white focus-within:border-[#2563EB] focus-within:ring-2 focus-within:ring-[#2563EB]/25"
          title={addOn ? 'Adds extra (non-pay) dollars on top of the calculated salaries' : 'Sets this line to the amount you type'}
        >
          <span className="pl-2 text-[12px] text-ink2">{addOn ? '+$' : '$'}</span>
          <input
            type="text"
            inputMode="decimal"
            disabled={disabled}
            value={isOverridden ? String(overrideVal) : ''}
            placeholder={addOn ? 'extra' : '—'}
            aria-label={`Set ${label} yourself`}
            onChange={(e) => {
              const s = sanitizeDecimal(e.target.value)
              onOverride(s === '' ? null : Number(s))
            }}
            className={`h-7 w-24 bg-transparent px-2 text-right text-[13px] tabular-nums text-ink outline-none ${
              isOverridden ? 'font-semibold' : ''
            }`}
          />
        </span>
      </td>
    </tr>
  )
}

// ── Render helpers ───────────────────────────────────────────────────────────

// One ruled figure line on the ground (label left, tabular value right).
function renderDetailRow(label, value, opts = {}) {
  return (
    <div key={`detail-${label}`} className="fig" style={opts.bold ? { borderTop: '2px solid rgb(var(--hair) / 0.18)' } : undefined}>
      <span className={`fig-label ${opts.bold ? 'font-semibold text-ink' : ''}`}>{label}</span>
      <span className="fig-value">{dollar(value)}</span>
    </div>
  )
}

export default function DriverPreview({ result, overrides, onOverrideChange, disabled }) {
  const reduce = useReducedMotion()
  if (!result) {
    return (
      <div className="b2-note">
        <p>Enter assumptions to preview the computed budget.</p>
      </div>
    )
  }

  const k = result.kpis ?? {}
  const d = result.detail ?? {}
  const sal = d.salaries ?? {}
  const revenue = result.revenue ?? {}
  const expense = result.expense ?? {}

  const setOverride = (key, val) => {
    const next = { ...(overrides ?? {}) }
    if (val == null || Number.isNaN(val)) delete next[key]
    else next[key] = val
    onOverrideChange(next)
  }

  const noStaff = (sal.total ?? 0) === 0

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      {/* Empty-staff guard: salaries are usually a school's biggest cost, so a
          zero-staff preview reads as an unrealistically large surplus. Say so. */}
      {noStaff && (
        <p className="b2-callout" data-tone="watch">
          <Users size={14} aria-hidden="true" />
          <span>
            <strong>Add your staff to finish the budget.</strong> Salaries are usually a school&rsquo;s
            biggest cost, so until you fill in <em>Staff &amp; pay</em> this looks far more positive than
            it really is.
          </span>
        </p>
      )}

      {/* The headline figures — plain-language labels with a hover explanation. */}
      <StatStrip cols={3} className="stats-wrap stats-compact">
        <Stat
          label="Students"
          value={Number.isFinite(k.enrollmentTotal) ? Math.round(k.enrollmentTotal) : null}
          title="Total students across all grades"
        />
        <Stat label="Cost per student" value={statMoney(k.costPerPupil)} title="Total spending ÷ number of students" />
        <Stat label="Tuition per student" value={statMoney(k.netTuitionPerStudent)} title="Tuition + fees ÷ number of students" />
        <Stat label="Pay % of spending" value={statPct(k.salariesPctOfExpense)} title="Salaries (before benefits) as a share of total spending" />
        <Stat
          label="Net income / (loss)"
          value={signedMoney(k.netIncome)}
          status={!k.netIncome ? 'neutral' : k.netIncome > 0 ? 'good' : 'risk'}
          title="Money in minus money out"
        />
        <Stat label="Total money in" value={statMoney(k.totalRevenue)} title="All budgeted revenue" />
      </StatStrip>

      {/* Tuition / fees / pay / benefits detail — ruled figure columns */}
      <div className="grid grid-cols-1 gap-x-10 gap-y-6 lg:grid-cols-2">
        <Section label="Where tuition comes from" className="!mt-0 min-w-0">
          {renderDetailRow('Tuition (students × prices)', d.grossTuition)}
          {renderDetailRow('· Families / FACTS', d.tuitionByProgram?.parent)}
          {renderDetailRow('· Step Up (FTC)', d.tuitionByProgram?.ftc)}
          {renderDetailRow('· Step Up (FES-UA)', d.tuitionByProgram?.fes)}
          {renderDetailRow('Fees', d.fees)}
          {renderDetailRow('Total tuition & fees', revenue.tuition, { bold: true })}
        </Section>
        <Section label="Pay & benefits" className="!mt-0 min-w-0">
          {renderDetailRow('Teachers', sal.teachers)}
          {renderDetailRow('Administration', sal.admin)}
          {renderDetailRow('Facilities & support', sal.facilities)}
          {renderDetailRow('Total pay', sal.total, { bold: true })}
          {renderDetailRow('Benefits', d.benefits)}
        </Section>
      </div>

      {/* Category budget + overrides — a .dt sheet */}
      <Section label="Your budget by category" aside={<SlidersHorizontal size={14} aria-hidden="true" />}>
        <p className="mb-3 text-small text-ink2">
          We calculated each line. Type in the last column to set one yourself — for the{' '}
          <span className="italic">(pay-driven)</span> lines that adds extra non-pay costs on top.
        </p>
        <div className="dt-wrap">
          <table className="dt">
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col" className="dt-num">Calculated</th>
                <th scope="col" className="dt-num">Set it yourself</th>
              </tr>
            </thead>
            <tbody>
              <tr className="dt-section">
                <td colSpan={3} className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink">
                  Revenue
                </td>
              </tr>
              {REVENUE_LINE_KEYS.map((key) => (
                <CategoryRow
                  key={`rev-${key}`}
                  label={REVENUE_LINE_LABELS[key] ?? key}
                  computed={revenue[key]}
                  overrideVal={overrides?.[key] ?? null}
                  onOverride={(v) => setOverride(key, v)}
                  disabled={disabled}
                />
              ))}
              <tr className="dt-section">
                <td colSpan={3} className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink">
                  Expense
                </td>
              </tr>
              {EXPENSE_LINE_KEYS.map((key) => (
                <CategoryRow
                  key={`exp-${key}`}
                  label={EXPENSE_LINE_LABELS[key] ?? key}
                  computed={expense[key]}
                  overrideVal={overrides?.[key] ?? null}
                  onOverride={(v) => setOverride(key, v)}
                  disabled={disabled}
                  addOn={ADDON_KEYS.has(key)}
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="dt-foot">
                <td className="text-[11px] uppercase tracking-[0.08em]">Net income</td>
                <td colSpan={2} className={`dt-num ${(k.netIncome ?? 0) < 0 ? 'tone-risk' : ''}`}>
                  {fmt(k.netIncome)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Section>
    </motion.div>
  )
}
