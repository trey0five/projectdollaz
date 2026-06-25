// ─────────────────────────────────────────────────────────────────────────────
// BudgetSummary — the friendly, beginner-facing RESULT view of the one budget for
// a (school, period). NOT the 150-row grid. Shows a source badge, a few KPI
// cards, a revenue-by-group / expense-by-group breakdown, the net, and the two
// actions ("Edit / redo setup" → onEdit, "View full spreadsheet →" → onViewAdvanced).
//
// KPI source of truth: when the budget was built with the guided setup,
// lines.driverModel.kpis carries everything; otherwise we derive enrollment-less
// basics (total revenue / total expense / surplus) from lines.revenue/expense
// (falling back to budget.totalRevenue/totalExpenses) so imported and manual
// budgets still get a sensible summary.
//
// React-Compiler safe: module-scope components + render-helper functions only,
// no effects, no setState.
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion'
import {
  Coins,
  Wallet,
  TrendingUp,
  Sparkles,
  FileSpreadsheet,
  PencilLine,
  ArrowRight,
  Table2,
} from 'lucide-react'
import {
  REVENUE_LINE_KEYS,
  EXPENSE_LINE_KEYS,
  REVENUE_LINE_LABELS,
  EXPENSE_LINE_LABELS,
} from '@finrep/analytics'
import { fmtDollar } from '../../lib/format.js'
import { describeBudgetSource } from './budgetSource.js'

// Whole-dollar, thousands separators; em dash for blank.
function dollar(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

function sumValues(map) {
  if (!map) return 0
  return Object.values(map).reduce((s, v) => {
    const n = Number(v)
    return s + (Number.isFinite(n) ? n : 0)
  }, 0)
}

// ── Source badge (module scope) ──────────────────────────────────────────────
function SourceBadge({ source }) {
  const isImport = source.kind === 'import'
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-navy px-3 py-1 text-[12px] font-semibold text-gold-light shadow-sm">
      {isImport ? <FileSpreadsheet size={13} /> : <Sparkles size={13} />}
      {source.label}
      {isImport && source.fileName && (
        <span className="ml-0.5 max-w-[180px] truncate font-normal text-gold-light/80">
          · {source.fileName}
        </span>
      )}
    </span>
  )
}

// ── KPI card (module scope) ──────────────────────────────────────────────────
function SummaryCard({ icon, label, value, tone = 'navy', hint }) {
  const Icon = icon
  const toneCls =
    tone === 'positive'
      ? 'text-emerald-600'
      : tone === 'negative'
        ? 'text-rose-600'
        : 'text-navy'
  return (
    <div className="card-soft flex items-center gap-3 p-4" title={hint || undefined}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold">
        <Icon size={19} />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
          {label}
        </div>
        <div className={`font-serif text-xl font-semibold tabular-nums ${toneCls}`}>{value}</div>
      </div>
    </div>
  )
}

// ── Render helpers ───────────────────────────────────────────────────────────
function renderGroupRow(key, label, value) {
  return (
    <div
      key={`grp-${key}`}
      className="flex items-center justify-between border-t border-rule/40 py-1.5 first:border-t-0"
    >
      <span className="text-[13px] text-ink">{label}</span>
      <span className="text-[13px] tabular-nums text-ink">{dollar(value)}</span>
    </div>
  )
}

function renderGroupCard(title, keys, labels, map, total) {
  const rows = keys
    .map((key) => ({ key, label: labels[key] ?? key, value: Number(map?.[key]) || 0 }))
    .filter((r) => r.value !== 0)
  return (
    <div className="card-soft p-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-serif text-[15px] font-semibold text-navy">{title}</h4>
        <span className="text-[13px] font-semibold tabular-nums text-navy">{dollar(total)}</span>
      </div>
      {rows.length > 0 ? (
        <div>{rows.map((r) => renderGroupRow(r.key, r.label, r.value))}</div>
      ) : (
        <p className="py-1.5 text-[12.5px] italic text-muted">
          No amounts by category yet — open the full spreadsheet for the line detail.
        </p>
      )}
    </div>
  )
}

export default function BudgetSummary({ budget, canEdit, onEdit, onViewAdvanced }) {
  const lines = budget?.lines ?? {}
  const source = describeBudgetSource(budget)
  const kpis = lines.driverModel?.kpis ?? null

  // KPI numbers: prefer the driver KPIs; else sum the category rollups; else the
  // stored top-line totals. sumValues returns 0 (not null) for an empty map, so
  // use || to let a real stored total win when there's no by-category detail.
  const totalRevenue = kpis?.totalRevenue ?? (sumValues(lines.revenue) || budget?.totalRevenue || 0)
  const totalExpense = kpis?.totalExpense ?? (sumValues(lines.expense) || budget?.totalExpenses || 0)
  const netIncome = kpis?.netIncome ?? totalRevenue - totalExpense
  const enrollmentTotal = kpis?.enrollmentTotal ?? null
  const costPerPupil = kpis?.costPerPupil ?? null

  const netTone = netIncome >= 0 ? 'positive' : 'negative'
  const hasGroupDetail =
    Object.keys(lines.revenue ?? {}).length > 0 || Object.keys(lines.expense ?? {}).length > 0

  return (
    <motion.div
      key="budget-summary"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-5"
    >
      {/* Header: title + source badge */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-gradient text-gold-light">
            <Wallet size={20} />
          </span>
          <div>
            <h3 className="font-serif text-lg font-semibold text-navy">Your budget for this period</h3>
            <p className="text-[13px] text-muted">A friendly summary of what&rsquo;s set up.</p>
          </div>
        </div>
        <SourceBadge source={source} />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryCard icon={Coins} label="Total money in" value={dollar(totalRevenue)} hint="All budgeted revenue" />
        <SummaryCard icon={Wallet} label="Total spending" value={dollar(totalExpense)} hint="All budgeted expense" />
        <SummaryCard
          icon={TrendingUp}
          label="Net income / (loss)"
          value={dollar(netIncome)}
          tone={netTone}
          hint="Money in minus money out"
        />
        {enrollmentTotal != null && (
          <SummaryCard icon={Coins} label="Students" value={Number(enrollmentTotal).toLocaleString('en-US')} hint="Total students across all grades" />
        )}
        {costPerPupil != null && (
          <SummaryCard icon={Coins} label="Cost per student" value={dollar(costPerPupil)} hint="Total spending ÷ number of students" />
        )}
      </div>

      {/* Revenue / expense by group */}
      {hasGroupDetail ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {renderGroupCard('Money in by category', REVENUE_LINE_KEYS, REVENUE_LINE_LABELS, lines.revenue, totalRevenue)}
          {renderGroupCard('Spending by category', EXPENSE_LINE_KEYS, EXPENSE_LINE_LABELS, lines.expense, totalExpense)}
        </div>
      ) : (
        <div className="card-soft border-dashed px-4 py-4 text-center">
          <p className="text-[13px] italic text-muted">
            This budget was imported as labels only — open the full spreadsheet for the line detail.
          </p>
        </div>
      )}

      {/* Net footer band */}
      <div className="flex items-center justify-between rounded-xl border border-gold/40 bg-gold/10 px-4 py-3">
        <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-navy">
          Net income / (loss)
        </span>
        <span
          className={`font-serif text-lg font-semibold tabular-nums ${
            netIncome >= 0 ? 'text-emerald-600' : 'text-rose-600'
          }`}
        >
          {fmtDollar(netIncome)}
        </span>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {canEdit && (
          <button type="button" onClick={onEdit} className="btn-ghost inline-flex items-center gap-2">
            <PencilLine size={15} /> Edit / redo setup
          </button>
        )}
        <button
          type="button"
          onClick={onViewAdvanced}
          className="btn-primary inline-flex items-center gap-2"
        >
          <Table2 size={15} /> View full spreadsheet <ArrowRight size={15} />
        </button>
      </div>
    </motion.div>
  )
}
