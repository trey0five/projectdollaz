// Import preview — a read-only summary of a client-parsed BudgetSpread BEFORE it
// is committed. Surfaces the detected format, month range, account count, parser
// warnings, and a compact accounts × months table so the user can sanity-check
// the parse. Pure presentation over the `spread` prop; derives everything at
// render (no effects, no in-render component definitions — React-Compiler safe).
import { motion } from 'framer-motion'
import { FileCheck2, AlertTriangle, CalendarRange, ListTree } from 'lucide-react'
import { fmt } from '../../lib/format.js'

// The parser is sign-lossless and format-agnostic, so reconciliation here is a
// best-effort summary: sum the account annuals and compare to the sheet's own
// printed grand totals when the parser captured them (diocesan preset).
function summarize(spread) {
  const accounts = spread.accounts || []
  const sumAnnual = (a) =>
    a.annual != null
      ? Number(a.annual)
      : (a.months || []).reduce((s, m) => s + (Number(m) || 0), 0)
  const totalAnnual = accounts.reduce((s, a) => s + sumAnnual(a), 0)
  // Sheet-printed grand totals, under either architect's field name.
  const sheet = spread.sheetTotals || spread.reconciliation || {}
  const sheetRevenue =
    sheet.revenue ?? sheet.sheetRevenueTotal ?? null
  const sheetExpense =
    sheet.expense ?? sheet.sheetExpenseTotal ?? null
  return { totalAnnual, accountCount: accounts.length, sheetRevenue, sheetExpense }
}

export default function BudgetSpreadPreview({ spread }) {
  if (!spread) return null
  const monthLabels =
    spread.monthLabels && spread.monthLabels.length
      ? spread.monthLabels
      : spread.monthKeys || []
  const cols = (spread.monthKeys || []).length
  const warnings = spread.warnings || []
  const { totalAnnual, accountCount, sheetRevenue, sheetExpense } = summarize(spread)
  const preview = (spread.accounts || []).slice(0, 12)

  const stat = (Icon, label, value) => (
    <div key={label} className="flex items-center gap-2.5 rounded-xl border border-rule bg-cream/50 px-3 py-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold/15 text-gold">
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</div>
        <div className="truncate font-serif text-sm font-semibold text-navy">{value}</div>
      </div>
    </div>
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {stat(
          FileCheck2,
          'Format',
          spread.format === 'diocesan' ? 'Diocesan template' : 'Generic spread',
        )}
        {stat(
          CalendarRange,
          'Months',
          monthLabels.length
            ? `${monthLabels[0]} – ${monthLabels[monthLabels.length - 1]}`
            : '—',
        )}
        {stat(ListTree, 'Accounts', accountCount)}
        {stat(FileCheck2, 'Sum of annuals', fmt(totalAnnual))}
      </div>

      {(sheetRevenue != null || sheetExpense != null) && (
        <div className="rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 text-[13px]">
          <div className="font-semibold text-navy">Sheet-printed grand totals</div>
          <div className="mt-1 flex flex-wrap gap-x-8 gap-y-1 text-ink">
            {sheetRevenue != null && (
              <span>
                Total operating revenues: <strong>{fmt(sheetRevenue)}</strong>
              </span>
            )}
            {sheetExpense != null && (
              <span>
                Total operating expenditures: <strong>{fmt(sheetExpense)}</strong>
              </span>
            )}
          </div>
          <p className="mt-1 text-[12px] text-muted">
            The server recomputes rollup totals from the GL accounts and reports any
            difference from these printed figures.
          </p>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-700">
            <AlertTriangle size={13} /> {warnings.length} parser warning
            {warnings.length === 1 ? '' : 's'}
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[12px] text-amber-800">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card-soft overflow-hidden p-0">
        <div className="border-b border-rule bg-cream/50 px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
          Preview · first {preview.length} of {accountCount} accounts
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-cream">
                <th className="px-2.5 py-2 text-left font-semibold uppercase tracking-wide text-muted">Acct</th>
                <th className="px-2.5 py-2 text-left font-semibold uppercase tracking-wide text-muted">Description</th>
                {monthLabels.slice(0, 3).map((m, i) => (
                  <th key={i} className="px-2.5 py-2 text-right font-semibold uppercase tracking-wide text-muted">
                    {m}
                  </th>
                ))}
                <th className="px-2.5 py-2 text-right font-semibold uppercase tracking-wide text-muted">…</th>
                <th className="px-2.5 py-2 text-right font-semibold uppercase tracking-wide text-gold">Annual</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((a) => {
                const annual =
                  a.annual != null
                    ? Number(a.annual)
                    : (a.months || []).reduce((s, m) => s + (Number(m) || 0), 0)
                return (
                  <tr key={`${a.acct}-${a.label}`} className="border-t border-rule/40">
                    <td className="px-2.5 py-1.5 font-semibold tabular-nums text-muted">{a.acct}</td>
                    <td className="max-w-[220px] truncate px-2.5 py-1.5 text-ink">{a.label}</td>
                    {Array.from({ length: 3 }, (_, i) => (
                      <td key={i} className="px-2.5 py-1.5 text-right tabular-nums text-ink">
                        {fmt(a.months?.[i])}
                      </td>
                    ))}
                    <td className="px-2.5 py-1.5 text-right text-muted">{cols > 3 ? '…' : ''}</td>
                    <td className="px-2.5 py-1.5 text-right font-semibold tabular-nums text-navy">
                      {fmt(annual)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  )
}
