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
  const dot = expected ? 'tone-neutral' : differs ? 'tone-risk' : 'tone-good'
  return (
    <li className="py-2 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink">
          <i aria-hidden className={`mark ${dot}`} />
          {check.label}
        </span>
        <span className="shrink-0 text-[11px] font-semibold tabular-nums text-ink2">
          {expected ? 'expected' : differs ? `off ${fmtMoney(check.diff)}` : 'tied'}
        </span>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-x-3 pl-3.5 text-[12px] text-ink2 tabular-nums">
        <span>
          QuickBooks <span className="font-semibold text-ink">{fmtMoney(check.qbo)}</span>
        </span>
        <span>
          Platform <span className="font-semibold text-ink">{fmtMoney(check.computed)}</span>
        </span>
      </div>
      {check.note ? (
        <p className={`mt-1 pl-3.5 text-[11.5px] leading-snug ${expected ? 'italic text-ink2' : 'text-ink2'}`}>
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
          tone: 'good',
          Icon: Check,
          text: 'Reconciled to QuickBooks',
        }
      : status === 'differs'
        ? {
            tone: 'watch',
            Icon: AlertTriangle,
            text: `Differs by ${fmtMoney(largestStrongDiff(checks))} — investigate`,
          }
        : {
            tone: 'neutral',
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
        className={`pill pill-status tone-${tone.tone} cursor-pointer transition-colors hover:border-hair/[0.3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]/50 disabled:cursor-default`}
      >
        <i className="pill-mark" aria-hidden="true" />
        {Icon ? <Icon size={11} aria-hidden="true" className="text-ink2" /> : null}
        {tone.text}
        {stale ? (
          <span
            className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-watch"
            title="This reconciliation is from an earlier sync — refresh to re-verify."
            aria-label="reconciliation may be stale"
          />
        ) : null}
        {hasChecks ? (
          <ChevronDown size={12} aria-hidden="true" className={`opacity-70 transition-transform ${open ? 'rotate-180' : ''}`} />
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
          <div className="pop !left-auto right-0 w-[min(20rem,calc(100vw-2rem))] !max-h-none p-4 text-left">
            <p className="mb-2 text-[15px] font-semibold text-ink">
              Reconciliation detail
            </p>
            <ul className="divide-y divide-hair">
              {checks.map((c) => (
                <CheckRow key={c.key} check={c} />
              ))}
            </ul>
            <p className="mt-3 border-t border-hair pt-2 text-[11px] leading-snug text-ink2">
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
