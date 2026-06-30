// ─────────────────────────────────────────────────────────────
// Shared report cell primitives (4-column statements: SOA & SFP)
// ─────────────────────────────────────────────────────────────
import { fmt, fmtDollar, plain } from '../../lib/format.js'
import { useLineage } from '../../context/LineageContext.jsx'

export const COLS4 = 'grid grid-cols-[minmax(0,1fr)_150px_150px_150px]'

function cls(n, base) {
  if (n == null) return `${base} amt-ph`
  if (n === 0) return `${base} amt-zero`
  if (n < 0) return `${base} amt-neg`
  return base
}

/** Accounting line cell (em dash / parentheses for negatives). */
export function LineAmt({ value, show = true }) {
  const v = show ? value : null
  return <div className={cls(v, 'amt')}>{v == null ? '—' : fmt(v)}</div>
}

/** Subtotal cell — bold, top rule, dash when hidden. */
export function SubAmt({ value, show = true }) {
  if (!show || value == null)
    return <div className="amt border-t border-navy pt-1.5 font-semibold text-gray-300">—</div>
  return (
    <div className={`amt border-t border-navy pt-1.5 font-semibold text-navy ${value < 0 ? 'amt-neg' : ''}`}>
      {fmt(value)}
    </div>
  )
}

/** Plain numeric SFP cell (no parentheses; "0.00" shown for zero). */
export function PlainAmt({ value, show = true }) {
  if (!show || value == null) return <div className="amt text-gray-300">—</div>
  return <div className="amt">{plain(value)}</div>
}

/** SFP subtotal (single rule, plain number). */
export function PlainSub({ value, show = true }) {
  if (!show || value == null)
    return <div className="amt border-t border-navy pt-1.5 font-semibold text-gray-300">—</div>
  return <div className="amt border-t border-navy pt-1.5 font-semibold text-navy">{plain(value)}</div>
}

/** SFP grand total (double-weight rule, $ prefix). */
export function PlainTotal({ value, show = true }) {
  if (!show || value == null)
    return <div className="amt border-t-2 border-navy pt-2 font-semibold text-gray-300">—</div>
  return <div className="amt border-t-2 border-navy pt-2 font-semibold text-navy">$ {plain(value)}</div>
}

/**
 * Drill-down wrapper around any amount cell. ADDITIVE + screen-only: when the
 * lineage drill-down is wired (a LineageProvider is mounted), a lineKey is
 * given, and the cell is shown with a real value, it renders the SAME amount
 * inside a `no-print` button that opens the LineageDrawer for this line. In
 * every other case (no provider, no lineKey, hidden/empty cell, or print) it
 * renders the child amount untouched, so the printed DOM / PDF is byte-identical
 * and rows without lineage stay non-interactive.
 *
 * `statement` is the StatementId ('SOA'|'SFP'|'SCF'|'NetAssets'); `variant` is
 * the column ('cy'|'py'|'audit') for the 4-column statements (ignored for
 * SCF/NetAssets, which are CY-only).
 */
export function LineageCell({
  statement,
  variant = 'cy',
  lineKey,
  label,
  value,
  show = true,
  children,
}) {
  const lineage = useLineage()
  const clickable = !!(lineage?.onOpenLineage && lineKey && show && value != null)
  if (!clickable) return children
  return (
    <button
      type="button"
      onClick={(e) => {
        // The statement is wrapped in a zoom "Tap to zoom" role=button host;
        // stop the click from also opening the full-screen overlay.
        e.stopPropagation()
        lineage.onOpenLineage({ statement, variant, lineKey, label, value })
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') e.stopPropagation()
      }}
      title={`Trace ${label} to its source accounts`}
      className="lineage-cell w-full cursor-pointer rounded text-right outline-none transition-colors hover:bg-gold/10 focus-visible:ring-2 focus-visible:ring-gold/60"
    >
      {children}
    </button>
  )
}

/** Net-asset / dollar-prefixed value (used on SOA NA rows). */
export function DollarAmt({ value, show = true, final = false }) {
  const border = final ? 'border-t-2 pt-2' : ''
  if (!show || value == null)
    return <div className={`amt font-${final ? 'semibold' : 'normal'} border-navy ${border} text-gray-300`}>—</div>
  return (
    <div className={`amt border-navy ${border} ${final ? 'font-semibold text-navy' : ''}`}>
      {fmtDollar(value)}
    </div>
  )
}
