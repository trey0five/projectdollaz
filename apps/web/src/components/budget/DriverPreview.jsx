// Driver Model — LIVE computed preview (right column). Renders the result of
// computeDriverBudget (passed in as `result`): KPI cards, the tuition/fees/
// salaries/benefits detail, and the resulting category budget with per-category
// overrides. Pure presentation — no math here, no effects, module-scope
// components only (React-Compiler safe).
import { motion } from 'framer-motion'
import {
  Users,
  Coins,
  GraduationCap,
  Percent,
  Wallet,
  SlidersHorizontal,
} from 'lucide-react'
import {
  REVENUE_LINE_KEYS,
  EXPENSE_LINE_KEYS,
  REVENUE_LINE_LABELS,
  EXPENSE_LINE_LABELS,
} from '@finrep/analytics'
import { fmt } from '../../lib/format.js'
import { sanitizeDecimal } from '../../lib/numericInput.js'

// Whole-dollar with thousands separators (em dash for blank/zero).
function money(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}
function dollar(n) {
  return n == null || Number.isNaN(n) ? '—' : `$${money(n)}`
}
function pct(frac) {
  if (frac == null || Number.isNaN(frac)) return '—'
  return `${(frac * 100).toFixed(1)}%`
}

// The four expense categories whose value is staffing-DRIVEN; for these an
// override is treated by the engine as an extra NON-SALARY amount ADDED on top of
// the computed pay/benefits (not a replacement), so we label them differently.
const ADDON_KEYS = new Set(['instructional', 'admin', 'facilities', 'fixedOther'])

// ── KPI card (module scope) ──────────────────────────────────────────────────
function KpiCard({ icon, label, value, tone = 'navy', hint }) {
  const Icon = icon
  const toneCls =
    tone === 'positive'
      ? 'text-emerald-600'
      : tone === 'negative'
        ? 'text-rose-600'
        : 'text-navy'
  return (
    <div className="card-soft flex items-center gap-3 p-3.5" title={hint || undefined}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold">
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
          {label}
        </div>
        <div className={`font-serif text-lg font-semibold tabular-nums ${toneCls}`}>{value}</div>
      </div>
    </div>
  )
}

// ── Category budget row with an inline override input (module scope) ──────────
function CategoryRow({ label, computed, overrideVal, onOverride, disabled, addOn }) {
  const isOverridden = overrideVal != null && overrideVal !== ''
  return (
    <tr className="border-t border-rule/50 hover:bg-gold/[0.04]">
      <td className="px-3 py-1.5 text-[13px] text-ink">
        {label}
        {addOn && <span className="ml-1.5 text-[11px] italic text-muted">(pay-driven)</span>}
      </td>
      <td className="px-3 py-1.5 text-right text-[13px] tabular-nums text-ink">{dollar(computed)}</td>
      <td className="px-2 py-1.5">
        <span
          className="flex items-center justify-end rounded-md border border-rule bg-white focus-within:border-gold focus-within:ring-1 focus-within:ring-gold/40"
          title={addOn ? 'Adds extra (non-pay) dollars on top of the calculated salaries' : 'Sets this line to the amount you type'}
        >
          <span className="pl-2 text-[12px] text-muted">{addOn ? '+$' : '$'}</span>
          <input
            type="text"
            inputMode="decimal"
            disabled={disabled}
            value={isOverridden ? String(overrideVal) : ''}
            placeholder={addOn ? 'extra' : '—'}
            onChange={(e) => {
              const s = sanitizeDecimal(e.target.value)
              onOverride(s === '' ? null : Number(s))
            }}
            className={`w-24 bg-transparent px-2 py-1 text-right text-[13px] tabular-nums outline-none ${
              isOverridden ? 'text-navy font-semibold' : 'text-ink'
            }`}
          />
        </span>
      </td>
    </tr>
  )
}

// ── Render helpers ───────────────────────────────────────────────────────────

function renderDetailRow(label, value, opts = {}) {
  return (
    <div
      key={`detail-${label}`}
      className={`flex items-center justify-between py-1 ${opts.bold ? 'font-semibold text-navy' : 'text-ink'}`}
    >
      <span className="text-[13px]">{label}</span>
      <span className="text-[13px] tabular-nums">{dollar(value)}</span>
    </div>
  )
}

export default function DriverPreview({ result, overrides, onOverrideChange, disabled }) {
  if (!result) {
    return (
      <div className="card-soft border-dashed px-6 py-14 text-center">
        <p className="font-serif text-base italic text-muted">
          Enter assumptions to preview the computed budget.
        </p>
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

  const netTone = (k.netIncome ?? 0) >= 0 ? 'positive' : 'negative'
  const noStaff = (sal.total ?? 0) === 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-4"
    >
      {/* Empty-staff guard: salaries are usually a school's biggest cost, so a
          zero-staff preview reads as an unrealistically large surplus. Say so. */}
      {noStaff && (
        <div className="card-soft border-amber-300 bg-amber-50/60 px-4 py-3">
          <p className="flex items-start gap-2 text-[12.5px] text-amber-800">
            <Users size={15} className="mt-0.5 shrink-0" />
            <span>
              <strong>Add your staff to finish the budget.</strong> Salaries are usually a school&rsquo;s
              biggest cost, so until you fill in <em>Staff &amp; pay</em> on the left this looks far more
              positive than it really is.
            </span>
          </p>
        </div>
      )}

      {/* KPI cards — plain-language labels with a hover explanation each. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard icon={Users} label="Students" value={money(k.enrollmentTotal)} hint="Total students across all grades" />
        <KpiCard icon={Coins} label="Cost per student" value={dollar(k.costPerPupil)} hint="Total spending ÷ number of students" />
        <KpiCard icon={GraduationCap} label="Tuition per student" value={dollar(k.netTuitionPerStudent)} hint="Tuition + fees ÷ number of students" />
        <KpiCard icon={Percent} label="Pay % of spending" value={pct(k.salariesPctOfExpense)} hint="Salaries (before benefits) as a share of total spending" />
        <KpiCard icon={Wallet} label="Net income / (loss)" value={dollar(k.netIncome)} tone={netTone} hint="Money in minus money out" />
        <KpiCard icon={Coins} label="Total money in" value={dollar(k.totalRevenue)} hint="All budgeted revenue" />
      </div>

      {/* Tuition / fees / pay / benefits detail */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card-soft p-4">
          <h4 className="mb-2 font-serif text-[15px] font-semibold text-navy">Where tuition comes from</h4>
          <div className="divide-y divide-rule/40">
            {renderDetailRow('Tuition (students × prices)', d.grossTuition)}
            {renderDetailRow('· Families / FACTS', d.tuitionByProgram?.parent)}
            {renderDetailRow('· Step Up (FTC)', d.tuitionByProgram?.ftc)}
            {renderDetailRow('· Step Up (FES-UA)', d.tuitionByProgram?.fes)}
            {renderDetailRow('Fees', d.fees)}
            {renderDetailRow('Total tuition & fees', revenue.tuition, { bold: true })}
          </div>
        </div>
        <div className="card-soft p-4">
          <h4 className="mb-2 font-serif text-[15px] font-semibold text-navy">Pay &amp; benefits</h4>
          <div className="divide-y divide-rule/40">
            {renderDetailRow('Teachers', sal.teachers)}
            {renderDetailRow('Administration', sal.admin)}
            {renderDetailRow('Facilities & support', sal.facilities)}
            {renderDetailRow('Total pay', sal.total, { bold: true })}
            {renderDetailRow('Benefits', d.benefits)}
          </div>
        </div>
      </div>

      {/* Category budget + overrides */}
      <div className="card-soft overflow-hidden p-0">
        <div className="flex items-center gap-2.5 border-b border-rule bg-cream/50 px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/15 text-gold">
            <SlidersHorizontal size={16} />
          </span>
          <div>
            <h4 className="font-serif text-[15px] font-semibold text-navy">Your budget by category</h4>
            <p className="text-[12px] text-muted">
              We calculated each line. Type in the last column to set one yourself — for the{' '}
              <span className="italic">(pay-driven)</span> lines that adds extra non-pay costs on top.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-cream">
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Category
                </th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Calculated
                </th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-gold">
                  Set it yourself
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-navy-gradient">
                <td colSpan={3} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-gold-light">
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
              <tr className="bg-navy-gradient">
                <td colSpan={3} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-gold-light">
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
              <tr className="border-t-2 border-gold/60 bg-gold/10">
                <td className="px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-navy">
                  Net income
                </td>
                <td
                  colSpan={2}
                  className={`px-3 py-2 text-right text-[14px] font-semibold tabular-nums ${
                    (k.netIncome ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {fmt(k.netIncome)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  )
}
