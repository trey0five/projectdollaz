// ─────────────────────────────────────────────────────────────
// QuickBooks transaction drill list (Phase 6 — GL detail).
//
// The fourth unfurl of the audit trail: after "these accounts summed to this
// line," this shows the ACTUAL QuickBooks transactions inside those accounts —
// Date · Type · Payee · Memo · Amount — each row a single click into
// QuickBooks (deepLink, new tab), the running total sweeping toward the figure,
// and an honest reconcile badge (green "Ties to the penny" / amber "differs").
//
// Fed the canonical QbDrillResult. Presentational + read-only:
//   • opening pseudo-row for SFP balance lines (reconcile.opening) leads the list;
//   • rows group under an account sub-header when the line draws on >1 account;
//   • a non-linkable row (deepLink null) renders as a static row, not a link;
//   • no-print (screen-only affordance) + overflow-x-auto so mobile never
//     scrolls the page body horizontally; reduced-motion → static total.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { ExternalLink, CheckCircle2, AlertTriangle } from 'lucide-react'
import { fmt, fmtDollar, formatShortDate } from '../../lib/format.js'

/** rAF ease-out count-up for the running total. Static under reduced motion or a
 *  non-finite target. setState runs only inside the rAF callback (never in the
 *  effect body), matching AnimatedMetricValue's lint-clean pattern. */
function RunningTotal({ value }) {
  const reduce = useReducedMotion()
  const numeric = typeof value === 'number' && Number.isFinite(value)
  const animate = numeric && !reduce
  const [display, setDisplay] = useState(animate ? 0 : value)

  useEffect(() => {
    if (!animate) return undefined
    let raf
    const start = performance.now()
    const dur = 900
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(eased * value)
      if (t < 1) raf = requestAnimationFrame(tick)
      else setDisplay(value)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, animate])

  return (
    <span className="font-serif text-[26px] font-medium leading-none tabular-nums text-ink">
      {fmtDollar(animate ? display : value)}
    </span>
  )
}

const GRID = 'grid grid-cols-[84px_54px_minmax(50px,1fr)_minmax(50px,1fr)_84px] gap-1.5'

function TxnRow({ txn }) {
  const linkable = !!txn.deepLink
  const body = (
    <>
      <span className="whitespace-nowrap tabular-nums text-ink2">{formatShortDate(txn.date)}</span>
      <span className="truncate text-ink" title={txn.type}>
        {txn.type || '—'}
      </span>
      <span className="truncate text-ink" title={txn.payee || ''}>
        {txn.payee || '—'}
      </span>
      <span className="truncate text-ink2" title={txn.memo || ''}>
        {txn.memo || '—'}
      </span>
      <span className="flex items-center justify-end gap-1">
        <span className={`tabular-nums ${txn.amount < 0 ? 'amt-neg' : 'text-ink'}`}>
          {fmt(txn.amount)}
        </span>
        {linkable && (
          <ExternalLink size={12} aria-hidden="true" className="shrink-0 text-ink2 opacity-60 group-hover:opacity-100" />
        )}
      </span>
    </>
  )
  const cls = `${GRID} min-h-[36px] items-center border-b border-hair px-1 py-1.5 text-[13px]`
  if (!linkable) {
    return (
      <div className={cls} title="No linkable QuickBooks transaction for this row">
        {body}
      </div>
    )
  }
  return (
    <a
      href={txn.deepLink}
      target="_blank"
      rel="noopener noreferrer"
      className={`group ${cls} outline-none transition-colors hover:bg-ink/[0.03] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2563EB]/50`}
      title="Open this transaction in QuickBooks"
    >
      {body}
    </a>
  )
}

// Compare account names leniently: the GL row's account (transactions[].account)
// may be fully-qualified ("Income:Tuition") while the linkage name is the leaf
// ("Tuition"), so match on the trailing leaf, case-insensitive — mirrors the
// server's own matchesAccount() so multi-account rows don't scatter to "Other".
function acctLeaf(s) {
  return String(s ?? '')
    .split(':')
    .pop()
    .trim()
    .toLowerCase()
}

export default function TransactionList({ result }) {
  const txns = result?.transactions ?? []
  const reconcile = result?.reconcile ?? {}
  const accounts = result?.accounts ?? []
  const ties = !!reconcile.ties
  const hasOpening = reconcile.opening != null

  // Running total = the line's drilled sum, which the server already computes as
  // (opening plug + Σ all rows). Count up to it so the figure the user clicked
  // assembles from the rows below (opening pseudo-row + txns). Do NOT re-add opening.
  const runningTotal = reconcile.drilledSum ?? 0

  // Group under an account sub-header only when >1 account feeds the line.
  const multiAccount = accounts.length > 1
  const groups = multiAccount
    ? accounts
        .map((a) => ({
          name: a.name || `Account ${a.acct}`,
          rows: txns.filter((t) => acctLeaf(t.account) === acctLeaf(a.name)),
        }))
        .filter((g) => g.rows.length > 0)
    : [{ name: null, rows: txns }]
  // Any txns whose account didn't match a named group (defensive) go in a tail bucket.
  if (multiAccount) {
    const claimed = new Set(groups.flatMap((g) => g.rows))
    const orphan = txns.filter((t) => !claimed.has(t))
    if (orphan.length) groups.push({ name: 'Other', rows: orphan })
  }

  return (
    <div className="no-print">
      {/* running total + reconcile badge */}
      <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="stat-label">Running total</p>
          <RunningTotal value={runningTotal} />
        </div>
        <div className={`b2-callout py-1 font-semibold ${ties ? 'b2-good' : 'b2-watch'}`}>
          {ties ? <CheckCircle2 size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}
          {ties
            ? 'Ties to the penny'
            : `Differs by ${fmt(Math.abs(reconcile.diff ?? 0))}${reconcile.note ? ` — ${reconcile.note}` : ''}`}
        </div>
      </div>

      {/* Empty: the line drilled but QuickBooks returned no transactions for the
          window (honest — the reconcile badge above still shows any line/txn gap). */}
      {txns.length === 0 && !hasOpening ? (
        <div className="b2-note">
          No QuickBooks transactions found for this line in the period.
        </div>
      ) : (
        <>
      {/* transaction table (horizontal scroll on mobile; body never overflows) */}
      <div className="overflow-x-auto">
        <div className="min-w-[380px]">
          <div
            className={`${GRID} border-b border-hair bg-ground px-1 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2`}
          >
            <span>Date</span>
            <span>Type</span>
            <span>Payee</span>
            <span>Memo</span>
            <span className="text-right">Amount</span>
          </div>

          {/* SFP opening-balance pseudo-row (prior-year balance rolled forward) */}
          {hasOpening && (
            <div className={`${GRID} min-h-[36px] items-center border-b border-hair bg-ground px-1 py-1.5 text-[13px]`}>
              <span className="text-ink2">—</span>
              <span className="col-span-2 truncate italic text-ink2">Opening balance (prior years)</span>
              <span className="text-ink2">—</span>
              <span className="text-right tabular-nums text-ink">{fmt(reconcile.opening)}</span>
            </div>
          )}

          {groups.map((g) => (
            <div key={g.name ?? '_'}>
              {g.name && (
                <p className="border-b border-hair px-1 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink">
                  {g.name}
                </p>
              )}
              {g.rows.map((t, i) => (
                <TxnRow key={t.txnId ?? `${g.name}-${i}`} txn={t} />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* cap note — honest "showing top N of M" when the account is large */}
      {reconcile.capped && (
        <p className="mt-2 text-[12px] italic text-ink2">
          Showing the {reconcile.shown} largest of {reconcile.total} transactions (total still reconciled).
        </p>
      )}
        </>
      )}
    </div>
  )
}
