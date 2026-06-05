// ─────────────────────────────────────────────────────────────
// Shared report cell primitives (4-column statements: SOA & SFP)
// ─────────────────────────────────────────────────────────────
import { fmt, fmtDollar, plain } from '../../lib/format.js'

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
