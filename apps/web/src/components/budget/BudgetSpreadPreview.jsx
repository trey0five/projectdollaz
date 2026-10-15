// Import preview — a read-only summary of a client-parsed BudgetSpread BEFORE it
// is committed. Premium UI P4: the detected format, month range, account count
// and sum of annuals as a compact StatStrip; the sheet-printed grand totals as
// ruled figure lines; parser warnings as a watch callout; and the first rows as
// a `.dt` sheet (right-aligned tabular money). Pure presentation over the
// `spread` prop; derives everything at render (no effects, no in-render
// component definitions — React-Compiler safe).
import { AlertTriangle } from 'lucide-react'
import { fmt } from '../../lib/format.js'
import { Section, StatStrip, Stat } from '../ui/surface/index.js'
import { statMoney } from './StatFigure.jsx'

// The parser is sign-lossless and format-agnostic, so reconciliation here is a
// best-effort summary: sum the account annuals and compare to the sheet's own
// printed grand totals when the parser captured them (standard spread template preset).
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

  return (
    <div className="space-y-5">
      <StatStrip cols={4} className="stats-compact">
        <Stat label="Format" value={spread.format === 'diocesan' ? 'Standard template' : 'Generic spread'} className="stat-text" />
        <Stat
          label="Months"
          value={monthLabels.length ? `${monthLabels[0]} – ${monthLabels[monthLabels.length - 1]}` : '—'}
          className="stat-text"
        />
        <Stat label="Accounts" value={accountCount} />
        <Stat label="Sum of annuals" value={statMoney(totalAnnual)} />
      </StatStrip>

      {(sheetRevenue != null || sheetExpense != null) && (
        <Section label="Sheet-printed grand totals">
          {sheetRevenue != null && (
            <div className="fig">
              <span className="fig-label">Total operating revenues</span>
              <span className="fig-value">{fmt(sheetRevenue)}</span>
            </div>
          )}
          {sheetExpense != null && (
            <div className="fig">
              <span className="fig-label">Total operating expenditures</span>
              <span className="fig-value">{fmt(sheetExpense)}</span>
            </div>
          )}
          <p className="sec-note">
            The server recomputes rollup totals from the GL accounts and reports any difference from
            these printed figures.
          </p>
        </Section>
      )}

      {warnings.length > 0 && (
        <div className="b2-callout" data-tone="watch">
          <AlertTriangle size={14} aria-hidden="true" />
          <div>
            <p className="font-semibold">
              {warnings.length} parser warning{warnings.length === 1 ? '' : 's'}
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink2">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <Section label={`Preview · first ${preview.length} of ${accountCount} accounts`}>
        <div className="dt-wrap">
          <table className="dt">
            <thead>
              <tr>
                <th scope="col">Acct</th>
                <th scope="col">Description</th>
                {monthLabels.slice(0, 3).map((m, i) => (
                  <th key={i} scope="col" className="dt-num">
                    {m}
                  </th>
                ))}
                <th scope="col" className="dt-num" aria-label="More months">…</th>
                <th scope="col" className="dt-num">Annual</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((a, idx) => {
                const annual =
                  a.annual != null
                    ? Number(a.annual)
                    : (a.months || []).reduce((s, m) => s + (Number(m) || 0), 0)
                return (
                  <tr key={`${idx}-${a.acct}-${a.label}`}>
                    <td className="font-semibold tabular-nums text-ink2">{a.acct || '—'}</td>
                    <td className="max-w-[220px] truncate" title={a.label}>{a.label}</td>
                    {Array.from({ length: 3 }, (_, i) => (
                      <td key={i} className="dt-num">
                        {fmt(a.months?.[i])}
                      </td>
                    ))}
                    <td className="dt-num text-ink2">{cols > 3 ? '…' : ''}</td>
                    <td className="dt-num font-semibold">{fmt(annual)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}
