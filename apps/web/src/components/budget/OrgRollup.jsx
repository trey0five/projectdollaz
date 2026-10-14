// Organizational Roll-up tab — the consolidated, multi-school budget view for the
// caller's organization. Reads the rollup endpoint (one call site in api.js) and
// renders a per-school totals table plus a consolidated category table. Strict
// org isolation is enforced server-side; the web just renders what it gets.
//
// Pure presentation over the `rollup` prop; everything derived at render (no
// effects, no in-render component definitions — React-Compiler safe).
// Premium UI P3: the three consolidated figures are a `StatStrip`; the tables
// are `DataTable`s under Section rules (sticky head, `.dt-num`, a footer line
// for each category total) — no cards, no icon tiles, no gold total row.
import { motion } from 'framer-motion'
import { fmt } from '../../lib/format.js'
import { Section, StatStrip, Stat, DataTable, Pill } from '../ui/surface/index.js'

function titleizeKey(key) {
  if (!key) return 'Other'
  const spaced = String(key)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

// Build the consolidated category rows from either { consolidated: {...} } or a
// flat { rollup: {...} } shape (so this survives an integration route tweak).
function categoryRows(consolidated, section) {
  const obj = consolidated?.[section] || {}
  return Object.keys(obj)
    .map((key) => ({ key, value: Number(obj[key]) || 0 }))
    .filter((r) => r.value !== 0)
    .sort((a, b) => b.value - a.value)
}

const SCHOOL_COLUMNS = [
  { key: 'name', header: 'School', sortable: true, render: (s) => <span className="font-semibold text-ink">{s.name}</span> },
  { key: 'totalRevenue', header: 'Revenue', num: true, sortable: true, render: (s) => fmt(s.totalRevenue) },
  { key: 'totalExpenses', header: 'Expenditures', num: true, sortable: true, render: (s) => fmt(s.totalExpenses) },
  {
    key: 'budget',
    header: 'Budget',
    sortable: true,
    sortValue: (s) => ((s.imported ?? s.hasBudget) ? 0 : 1),
    render: (s) =>
      (s.imported ?? s.hasBudget) ? (
        <Pill variant="status" tone="good">Imported</Pill>
      ) : (
        <Pill variant="status" tone="neutral">Pending</Pill>
      ),
  },
]

const CATEGORY_COLUMNS = [
  { key: 'key', header: 'Category', render: (r) => (r.isTotal ? 'Total' : titleizeKey(r.key)) },
  { key: 'value', header: 'Amount', num: true, render: (r) => fmt(r.value) },
]

export default function OrgRollup({ rollup, loading, error }) {
  if (loading) {
    return <p className="sec-note animate-pulse py-12 text-center italic">Consolidating your organization…</p>
  }
  if (error) {
    return <p className="sec-note py-12 text-center italic">{error}</p>
  }
  if (!rollup) return null

  const schools = rollup.schools || []
  const consolidated = rollup.consolidated || rollup.rollup || {}
  const totalRevenue =
    consolidated.totalRevenue ?? rollup.totalRevenue ?? null
  const totalExpenses =
    consolidated.totalExpenses ?? rollup.totalExpenses ?? null
  const surplus =
    totalRevenue != null && totalExpenses != null ? totalRevenue - totalExpenses : null

  const revRows = categoryRows(consolidated, 'revenue')
  const expRows = categoryRows(consolidated, 'expense')

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <StatStrip cols={3}>
        <Stat label="Consolidated revenue" value={totalRevenue == null ? '—' : fmt(totalRevenue)} />
        <Stat label="Consolidated expenditures" value={totalExpenses == null ? '—' : fmt(totalExpenses)} />
        <Stat
          label="Surplus / (Deficit)"
          value={surplus == null ? '—' : fmt(surplus)}
          status={surplus == null ? undefined : surplus < 0 ? 'risk' : 'good'}
        />
      </StatStrip>

      {/* Per-school totals */}
      <Section label="Schools in your organization">
        <DataTable columns={SCHOOL_COLUMNS} rows={schools} rowKey="schoolId" caption="Schools in your organization" empty="No schools found for your organization." />
      </Section>

      {/* Consolidated category tables */}
      <div className="grid grid-cols-1 gap-x-10 lg:grid-cols-2">
        <CategoryTable title="Consolidated revenue" rows={revRows} />
        <CategoryTable title="Consolidated expenditures" rows={expRows} />
      </div>
    </motion.div>
  )
}

// Module-scope helper component (NOT defined inside render — React-Compiler safe).
function CategoryTable({ title, rows }) {
  const total = rows.reduce((s, r) => s + r.value, 0)
  return (
    <Section label={title} className="min-w-0">
      <DataTable
        columns={CATEGORY_COLUMNS}
        rows={rows}
        rowKey="key"
        footRows={rows.length > 0 ? [{ key: '__total', value: total, isTotal: true }] : []}
        caption={title}
        empty="No data yet."
      />
    </Section>
  )
}
