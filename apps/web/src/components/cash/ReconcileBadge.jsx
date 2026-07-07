// ─────────────────────────────────────────────────────────────────────────────
// ReconcileBadge — the header "Reconciled to QuickBooks" trust pill for the /cash
// page. It ties the platform's computed statements back to QuickBooks' own native
// reports and states the verdict in one glance:
//   • tied     → green  ✓ "Reconciled to QuickBooks"
//   • differs  → amber  ⚠ "Differs by $X — investigate"  (X = the largest STRONG-
//                check dollar break; strong = cash + net income, the same-TB ties
//                that MUST hold — a synthesized-cash-change gap never drives this)
//   • unknown  → neutral "—"  (no statement snapshot yet to verify against)
//
// Clicking the pill expands a popover listing every reconciliation check:
//   label · QuickBooks {qbo} vs Platform {computed} · diff · note
// The 'expected' check (indirect/synthesized cash-change) is rendered in a neutral
// "expected difference" tone with its honest note — it reads as EXPECTED, never as
// a failure. On-theme navy/gold, EB Garamond heading; the popover is right-aligned
// and width-capped so it never pushes the mobile header horizontally.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { Check, AlertTriangle, ChevronDown } from 'lucide-react'

function fmtMoney(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—'
  const neg = v < 0
  return `${neg ? '−' : ''}$${Math.round(Math.abs(v)).toLocaleString('en-US')}`
}

// Strong checks (cash + net income) come off the SAME accrual trial balance and
// must tie; the largest strong break is what the badge headlines.
const STRONG_KEYS = new Set(['cash', 'net_income'])

function largestStrongDiff(checks) {
  let max = 0
  for (const c of checks ?? []) {
    if (!STRONG_KEYS.has(c.key)) continue
    if (c.status !== 'differs') continue
    const d = Math.abs(Number(c.diff ?? 0))
    if (Number.isFinite(d) && d > max) max = d
  }
  return max
}

function CheckRow({ check }) {
  const expected = check.status === 'expected'
  const differs = check.status === 'differs'
  const dot = expected ? 'bg-muted/50' : differs ? 'bg-danger' : 'bg-emerald-500'
  return (
    <li className="py-2 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-navy">
          <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${dot}`} />
          {check.label}
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            expected
              ? 'bg-section text-muted'
              : differs
                ? 'bg-gold/15 text-[#7a5e00]'
                : 'bg-emerald-50 text-emerald-700'
          }`}
        >
          {expected ? 'expected' : differs ? `off ${fmtMoney(check.diff)}` : 'tied'}
        </span>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-x-3 pl-3.5 text-[12px] text-muted tabular-nums">
        <span>
          QuickBooks <span className="font-semibold text-ink">{fmtMoney(check.qbo)}</span>
        </span>
        <span>
          Platform <span className="font-semibold text-ink">{fmtMoney(check.computed)}</span>
        </span>
      </div>
      {check.note ? (
        <p className={`mt-1 pl-3.5 text-[11.5px] leading-snug ${expected ? 'italic text-muted' : 'text-muted'}`}>
          {check.note}
        </p>
      ) : null}
    </li>
  )
}

export default function ReconcileBadge({ reconciliation, stale = false }) {
  const [open, setOpen] = useState(false)
  const status = reconciliation?.status ?? 'unknown'
  const checks = reconciliation?.checks ?? []
  const hasChecks = checks.length > 0

  const tone =
    status === 'tied'
      ? {
          pill: 'border-emerald-200 bg-emerald-50 text-emerald-700',
          Icon: Check,
          text: 'Reconciled to QuickBooks',
        }
      : status === 'differs'
        ? {
            pill: 'border-gold/40 bg-gold/10 text-[#7a5e00]',
            Icon: AlertTriangle,
            text: `Differs by ${fmtMoney(largestStrongDiff(checks))} — investigate`,
          }
        : {
            pill: 'border-rule/60 bg-white text-muted',
            Icon: null,
            text: 'Not yet reconciled',
          }
  const { Icon } = tone

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={!hasChecks}
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition hover:brightness-[0.98] disabled:cursor-default ${tone.pill}`}
      >
        {Icon ? <Icon size={13} /> : <span aria-hidden>—</span>}
        {tone.text}
        {stale ? (
          <span
            className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-gold/80"
            title="This reconciliation is from an earlier sync — refresh to re-verify."
            aria-label="reconciliation may be stale"
          />
        ) : null}
        {hasChecks ? (
          <ChevronDown size={13} className={`opacity-70 transition-transform ${open ? 'rotate-180' : ''}`} />
        ) : null}
      </button>

      {open && hasChecks ? (
        <>
          {/* Click-away scrim (transparent) so a tap outside closes the popover. */}
          <button
            type="button"
            aria-label="Close reconciliation detail"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div className="absolute right-0 z-40 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-rule/60 bg-white p-4 text-left shadow-paper">
            <p className="mb-2 font-serif text-[15px] font-semibold text-navy">
              Reconciliation detail
            </p>
            <ul className="divide-y divide-rule/40">
              {checks.map((c) => (
                <CheckRow key={c.key} check={c} />
              ))}
            </ul>
            <p className="mt-3 border-t border-rule/40 pt-2 text-[11px] leading-snug text-muted">
              Strong checks (cash &amp; net income) come off the same trial balance and must tie. The
              cash-change check is an <span className="font-semibold">expected</span> difference —
              our indirect cash flow is synthesized, so accrual timing makes it drift.
            </p>
          </div>
        </>
      ) : null}
    </div>
  )
}
