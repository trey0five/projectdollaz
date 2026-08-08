// ─────────────────────────────────────────────────────────────────────────────
// CashWorkbook — the treasury grid, the way every business manager already
// reads one in Excel: opening balance / receipts by category / disbursements by
// category / net / closing, one column per week or month.
//
// THE ROWS COME FROM THE ENGINE (`workbookRows` in @finrep/analytics), not from
// local aggregation — the grid a treasurer reads and the chart beside it must
// be one derivation, and the engine's tests pin that its subtotals, categories
// and closing row reconcile. This component only paints.
//
// Below-reserve columns are flagged in the CLOSING row and the column header —
// the whole point of the grid is seeing WHICH week goes wrong, and a red cell
// buried mid-table is easy to scan past.
//
// Pattern: MonthlySpreadGrid (budget) — sticky frozen label column, tabular
// numerals, navy-gradient section headers, gold accents.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { useState } from 'react'
import { categoryNoun } from './whyLine.js'

/** Column-key → short label: '2026-07' → 'Jul 26'; week starts → 'Jul 6'. */
function colLabel(key, granularity) {
  if (granularity === 'month') {
    const [y, m] = key.split('-')
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${names[Number(m) - 1] ?? m} ${String(y).slice(2)}`
  }
  const [, m, d] = key.split('-')
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${names[Number(m) - 1] ?? m} ${Number(d)}`
}

/** Compact money for a dense grid: 1234567 → '1,234.6K' is noise; use '1.23M'. */
function cell(v) {
  if (v == null) return ''
  if (v === 0) return '—'
  const abs = Math.abs(v)
  const s =
    abs >= 1_000_000
      ? `${(abs / 1_000_000).toFixed(2)}M`
      : abs >= 10_000
        ? `${Math.round(abs / 1000)}K`
        : abs >= 1_000
          ? `${(abs / 1000).toFixed(1)}K`
          : `${Math.round(abs)}`
  return v < 0 ? `(${s})` : s
}

/** Provenance chip per category row, when the sources say where it came from. */
function sourceBadge(rowKey, side, sources) {
  if (!sources) return null
  if (rowKey === 'receivables' && sources.qbo_ar?.count > 0) return 'QB'
  if (rowKey === 'payables' && sources.qbo_ap?.count > 0) return 'QB'
  if (rowKey === 'tuition' && sources.tuition_driver?.count > 0) return 'driver'
  return null
}

const ROW_TONE = {
  opening: 'bg-cream/60 font-semibold text-navy',
  subtotal: 'border-t border-rule/70 bg-cream/40 font-semibold text-navy',
  net: 'border-t border-rule/70 bg-white font-semibold text-navy',
  closing: 'border-t-2 border-gold/60 bg-gold/10 font-bold text-navy',
}

export default function CashWorkbook({ workbook, granularity = 'week', sources = null, reserveThreshold = null }) {
  const reduce = useReducedMotion()
  const [hoverCol, setHoverCol] = useState(null)
  if (!workbook || workbook.columns.length === 0) return null
  const { columns, rows } = workbook

  return (
    <motion.div
      initial={reduce ? { opacity: 1 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 0.8, 0.2, 1] }}
      className="overflow-x-auto rounded-2xl border border-rule/60 bg-white"
    >
      <table className="w-max min-w-full border-collapse text-[12.5px]" onMouseLeave={() => setHoverCol(null)}>
        <thead>
          <tr className="bg-cream">
            <th className="sticky left-0 z-20 bg-cream px-3 py-2 text-left font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
              Cash flow
            </th>
            {columns.map((c, i) => (
              <th
                key={c.key}
                onMouseEnter={() => setHoverCol(i)}
                className={`whitespace-nowrap px-2.5 py-2 text-right font-mono text-[10px] font-bold uppercase tracking-[0.1em] ${
                  c.belowReserve ? 'text-danger' : 'text-muted'
                } ${hoverCol === i ? 'bg-gold/[0.08]' : ''}`}
              >
                {/* The breach flag lives in the HEADER too — which column goes
                    wrong is the grid's whole answer. */}
                {c.belowReserve ? <span aria-hidden="true" className="mr-1 inline-block h-[6px] w-[6px] rounded-full bg-danger" /> : null}
                {colLabel(c.key, granularity)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            if (row.kind === 'section') {
              return (
                <tr key={row.key} className="bg-navy-gradient">
                  <td
                    colSpan={columns.length + 1}
                    className="sticky left-0 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-gold-light"
                  >
                    {row.label}
                  </td>
                </tr>
              )
            }
            const tone = ROW_TONE[row.kind] ?? 'text-ink'
            const badge = row.kind === 'category' ? sourceBadge(row.key, row.side, sources) : null
            return (
              <tr key={`${row.kind}:${row.key}`} className={`${tone} transition-colors hover:bg-gold/[0.04]`}>
                <td className={`sticky left-0 z-10 whitespace-nowrap px-3 py-1.5 text-left ${row.kind === 'category' ? 'bg-white pl-5' : 'bg-inherit'}`}>
                  {row.kind === 'category' ? categoryNoun(row.key) : row.label}
                  {badge ? (
                    <span className="ml-1.5 rounded border border-rule/70 bg-section px-1 py-px font-mono text-[9px] font-bold uppercase tracking-wide text-muted">
                      {badge}
                    </span>
                  ) : null}
                </td>
                {row.values.map((v, i) => {
                  const col = columns[i]
                  const breachCell = row.kind === 'closing' && col.belowReserve
                  const negative = typeof v === 'number' && v < 0
                  return (
                    <td
                      key={col.key}
                      onMouseEnter={() => setHoverCol(i)}
                      className={`whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums ${
                        breachCell
                          ? 'bg-danger/10 font-bold text-danger'
                          : negative
                            ? 'text-danger'
                            : ''
                      } ${hoverCol === i && !breachCell ? 'bg-gold/[0.08]' : ''}`}
                      title={v == null ? undefined : `$${Math.round(v).toLocaleString()}`}
                    >
                      {cell(v)}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      {reserveThreshold != null ? (
        <p className="border-t border-rule/60 bg-cream/40 px-3 py-2 text-[11.5px] text-muted">
          <span aria-hidden="true" className="mr-1 inline-block h-[6px] w-[6px] rounded-full bg-danger" />
          A flagged column closes below your ${Math.round(reserveThreshold).toLocaleString()} reserve.
          Hover any cell for the exact figure.
        </p>
      ) : null}
    </motion.div>
  )
}
