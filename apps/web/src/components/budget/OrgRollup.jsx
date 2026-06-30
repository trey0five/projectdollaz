// Organizational Roll-up tab — the consolidated, multi-school budget view for the
// caller's organization. Reads the rollup endpoint (one call site in api.js) and
// renders a per-school totals table plus a consolidated category table. Strict
// org isolation is enforced server-side; the web just renders what it gets.
//
// Pure presentation over the `rollup` prop; everything derived at render (no
// effects, no in-render component definitions — React-Compiler safe).
import { motion } from 'framer-motion'
import { Building2, CheckCircle2, MinusCircle, Layers } from 'lucide-react'
import { fmt } from '../../lib/format.js'

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

export default function OrgRollup({ rollup, loading, error }) {
  if (loading) {
    return (
      <div className="card-soft animate-pulse px-6 py-14 text-center">
        <p className="font-serif text-base italic text-muted">Consolidating your organization…</p>
      </div>
    )
  }
  if (error) {
    return (
      <div className="card-soft border-dashed px-6 py-12 text-center">
        <p className="font-serif text-base italic text-muted">{error}</p>
      </div>
    )
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

  const summaryCard = (label, value, accent) => (
    <div key={label} className="card-vital p-4 text-center">
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</div>
      <div className={`mt-1 font-serif text-xl font-semibold ${accent || 'text-navy'}`}>
        {value == null ? '—' : fmt(value)}
      </div>
    </div>
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-5"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {summaryCard('Consolidated revenue', totalRevenue, 'text-emerald-700')}
        {summaryCard('Consolidated expenditures', totalExpenses, 'text-navy')}
        {summaryCard(
          'Surplus / (Deficit)',
          surplus,
          surplus != null && surplus < 0 ? 'text-rose-600' : 'text-gold',
        )}
      </div>

      {/* Per-school totals */}
      <div className="card-soft overflow-hidden p-0">
        <div className="flex items-center gap-2.5 border-b border-rule bg-cream/50 px-4 py-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold/15 text-gold">
            <Building2 size={17} />
          </span>
          <h3 className="font-serif text-base font-semibold text-navy sm:text-lg">
            Schools in your organization
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-cream">
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">School</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted">Revenue</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted">Expenditures</th>
                <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">Budget</th>
              </tr>
            </thead>
            <tbody>
              {schools.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center font-serif italic text-muted">
                    No schools found for your organization.
                  </td>
                </tr>
              )}
              {schools.map((s) => (
                <tr key={s.schoolId} className="border-t border-rule/50">
                  <td className="px-3 py-2 font-medium text-ink">{s.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink">{fmt(s.totalRevenue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink">{fmt(s.totalExpenses)}</td>
                  <td className="px-3 py-2 text-center">
                    {s.imported ?? s.hasBudget ? (
                      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-600">
                        <CheckCircle2 size={14} /> Imported
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted">
                        <MinusCircle size={14} /> Pending
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Consolidated category tables */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
    <div className="card-soft overflow-hidden p-0">
      <div className="flex items-center gap-2.5 border-b border-rule bg-cream/50 px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold/15 text-gold">
          <Layers size={16} />
        </span>
        <h3 className="font-serif text-base font-semibold text-navy">{title}</h3>
      </div>
      <table className="w-full border-collapse text-[13px]">
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={2} className="px-4 py-6 text-center font-serif italic text-muted">
                No data yet.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-rule/50">
              <td className="px-4 py-2 text-ink">{titleizeKey(r.key)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-ink">{fmt(r.value)}</td>
            </tr>
          ))}
          {rows.length > 0 && (
            <tr className="border-t border-gold/50 bg-gold/5">
              <td className="px-4 py-2 text-[12px] font-semibold uppercase tracking-wide text-navy">Total</td>
              <td className="px-4 py-2 text-right font-semibold tabular-nums text-navy">{fmt(total)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
