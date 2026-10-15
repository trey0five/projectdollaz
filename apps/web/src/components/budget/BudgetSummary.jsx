// ─────────────────────────────────────────────────────────────────────────────
// BudgetSummary — the friendly, beginner-facing RESULT view of the one budget for
// a (school, period). NOT the 150-row grid. Premium UI P4 (the ledger): a
// Section rule carrying the source Pill, a StatStrip of the headline figures
// (count-ups, vertical rules, a 2px status mark on the net), the revenue-by-
// group / expense-by-group breakdown as two DataTables with a total foot row,
// and the two actions ("Edit / redo setup" → onEdit, "View full spreadsheet"
// → onViewAdvanced) on a hairline. No KPI cards, no gold net band.
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
import { Sparkles, FileSpreadsheet, PencilLine, ArrowRight, Table2 } from 'lucide-react'
import {
  REVENUE_LINE_KEYS,
  EXPENSE_LINE_KEYS,
  REVENUE_LINE_LABELS,
  EXPENSE_LINE_LABELS,
} from '@finrep/analytics'
import { describeBudgetSource } from './budgetSource.js'
import { Section, StatStrip, Stat, DataTable, Pill, Button } from '../ui/surface/index.js'

// Whole-dollar, thousands separators, accounting parentheses for a loss; em
// dash for blank.
function dollar(n) {
  if (n == null || Number.isNaN(n)) return '—'
  const s = `$${Math.abs(Number(n)).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  return Number(n) < 0 ? `(${s})` : s
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
    <Pill>
      {isImport ? <FileSpreadsheet size={11} aria-hidden="true" /> : <Sparkles size={11} aria-hidden="true" />}
      {source.label}
      {isImport && source.fileName && (
        <span className="max-w-[180px] truncate font-medium text-ink2" title={source.fileName}>
          · {source.fileName}
        </span>
      )}
    </Pill>
  )
}

const GROUP_COLUMNS = [
  { key: 'label', header: 'Category' },
  { key: 'value', header: 'Budget', num: true, render: (r) => dollar(r.value) },
]

// ── Render helper: one category breakdown as a DataTable with a total foot ──
function renderGroupTable(title, keys, labels, map, total) {
  const rows = keys
    .map((key) => ({ key, label: labels[key] ?? key, value: Number(map?.[key]) || 0 }))
    .filter((r) => r.value !== 0)
  return (
    <Section label={title} className="!mt-0 min-w-0">
      <DataTable
        columns={GROUP_COLUMNS}
        rows={rows}
        rowKey="key"
        empty="No amounts by category yet — open the full spreadsheet for the line detail."
        footRows={rows.length > 0 ? [{ key: 'total', label: 'Total', value: total }] : []}
        caption={title}
      />
    </Section>
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

  const hasGroupDetail =
    Object.keys(lines.revenue ?? {}).length > 0 || Object.keys(lines.expense ?? {}).length > 0
  const statCount = 3 + (enrollmentTotal != null ? 1 : 0) + (costPerPupil != null ? 1 : 0)

  return (
    <div key="budget-summary">
      <Section label="Your budget for this period" aside={<SourceBadge source={source} />} className="!mt-0">
        <StatStrip cols={statCount} className="stats-wrap">
          <Stat label="Total money in" value={totalRevenue} format="currency" title="All budgeted revenue" />
          <Stat label="Total spending" value={totalExpense} format="currency" title="All budgeted expense" />
          <Stat
            label="Net income / (loss)"
            value={dollar(netIncome)}
            status={!netIncome ? 'neutral' : netIncome > 0 ? 'good' : 'risk'}
            title="Money in minus money out"
          />
          {enrollmentTotal != null && (
            <Stat label="Students" value={Number(enrollmentTotal)} title="Total students across all grades" />
          )}
          {costPerPupil != null && (
            <Stat label="Cost per student" value={costPerPupil} format="currency" title="Total spending ÷ number of students" />
          )}
        </StatStrip>
      </Section>

      {/* Revenue / expense by group */}
      {hasGroupDetail ? (
        <div className="mt-8 grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-2">
          {renderGroupTable('Money in by category', REVENUE_LINE_KEYS, REVENUE_LINE_LABELS, lines.revenue, totalRevenue)}
          {renderGroupTable('Spending by category', EXPENSE_LINE_KEYS, EXPENSE_LINE_LABELS, lines.expense, totalExpense)}
        </div>
      ) : (
        <p className="sec-note">
          This budget was imported as labels only — open the full spreadsheet for the line detail.
        </p>
      )}

      {/* Actions on a hairline */}
      <div className="b2-actions">
        <span className="text-small text-ink2">
          Net for the year <b className="font-semibold tabular-nums text-ink">{dollar(netIncome)}</b>
        </span>
        <div className="b2-actions-end">
          {canEdit && (
            <Button variant="secondary" onClick={onEdit} icon={<PencilLine size={14} />}>
              Edit / redo setup
            </Button>
          )}
          <Button variant="primary" onClick={onViewAdvanced} icon={<Table2 size={14} />}>
            View full spreadsheet <ArrowRight size={14} aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  )
}
