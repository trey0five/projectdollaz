// ─────────────────────────────────────────────────────────────────────────────
// AgingRegisterTable — the open-item register for one side of the aging (the
// active tab: Receivables or Payables). Rows are the server-capped list, sorted
// oldest-then-largest, each a SINGLE CLICK into QuickBooks.
//
// The deep-link idiom is taken VERBATIM from TransactionList.jsx: when a row
// carries a `deepLink`, the whole row is an `<a target="_blank" rel="noopener
// noreferrer">` with a gold ExternalLink glyph; when it's null the row is a plain
// static div (no dead link). The server always supplies the fully-formed link —
// the client never builds a QuickBooks URL.
//
// Columns: Party · Doc# · Due · Days-overdue (bucket pill) · Open · [↗]. Screen-
// only (no-print) + overflow-x-auto with a min-width inner track so a phone
// scrolls the TABLE, never the page body.
// ─────────────────────────────────────────────────────────────────────────────
import { ExternalLink } from 'lucide-react'
import { formatShortDate } from '../../lib/format.js'
import { DataTable } from '../ui/surface/index.js'

// Premium UI P4: the register is a DataTable — the aging bucket is a 2px status
// mark (current = good, 1–60 = watch, 61+ = risk) + the bucket in ink, money
// right-aligned and tabular, and the QuickBooks deep link a quiet in-row link
// (keyboard-reachable; the row itself stays a row).
const BUCKET = {
  current: { label: 'Current', tone: 'good' },
  d1_30: { label: '1–30d', tone: 'neutral' },
  d31_60: { label: '31–60d', tone: 'watch' },
  d61_90: { label: '61–90d', tone: 'watch' },
  d90_plus: { label: '90+d', tone: 'risk' },
}

function fmtMoney(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '$0'
  const neg = v < 0
  return `${neg ? '−' : ''}$${Math.round(Math.abs(v)).toLocaleString('en-US')}`
}

const COLUMNS = [
  {
    key: 'party',
    header: 'Party',
    render: (r) => (
      <span className="block max-w-[260px] truncate font-semibold" title={r.party || ''}>
        {r.party || '—'}
      </span>
    ),
  },
  {
    key: 'docNumber',
    header: 'Doc #',
    className: 'whitespace-nowrap text-ink2',
    render: (r) =>
      r.deepLink ? (
        <a
          href={r.deepLink}
          target="_blank"
          rel="noopener noreferrer"
          className="dt-link"
          title="Open this document in QuickBooks"
        >
          {r.docNumber || 'Open'}
          <ExternalLink size={11} aria-hidden="true" />
          <span className="sr-only">(opens in QuickBooks)</span>
        </a>
      ) : (
        <span title="No linkable QuickBooks document for this row">{r.docNumber || '—'}</span>
      ),
  },
  {
    key: 'dueDate',
    header: 'Due',
    className: 'whitespace-nowrap tabular-nums text-ink2',
    render: (r) => (r.dueDate ? formatShortDate(r.dueDate) : '—'),
  },
  {
    key: 'bucket',
    header: 'Aging',
    className: 'whitespace-nowrap',
    render: (r) => {
      const def = BUCKET[r.bucket] ?? BUCKET.current
      const overdue = typeof r.daysOverdue === 'number' && r.daysOverdue > 0
      return (
        <span>
          {def.label}
          {overdue ? <span className="tabular-nums text-ink2"> · {r.daysOverdue}d</span> : null}
        </span>
      )
    },
  },
  { key: 'amount', header: 'Open', num: true, render: (r) => <span className="font-semibold">{fmtMoney(r.amount)}</span> },
]

export default function AgingRegisterTable({ items = [], totalCount = 0, side = 'receivables' }) {
  // Defensive oldest-then-largest sort (the server already sorts this way).
  const rows = [...items].sort(
    (a, b) => (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0) || (b.amount ?? 0) - (a.amount ?? 0),
  )
  const noun = side === 'payables' ? 'bills' : 'receivables'

  return (
    <div className="no-print">
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r, i) => r.deepLink ?? `${r.docNumber ?? 'row'}-${i}`}
        markOf={(r) => (BUCKET[r.bucket] ?? BUCKET.current).tone}
        empty={`All clear — no open ${noun}. Nothing outstanding on this side.`}
        caption={`Open ${noun}, oldest first`}
      />
      {rows.length === 0 ? null : totalCount > rows.length ? (
        <p className="sec-note italic">
          Showing {rows.length} of {totalCount} open {noun} (oldest first). Totals above are summed
          over all {totalCount}.
        </p>
      ) : (
        <p className="sec-note italic">Showing all {rows.length} open {noun} (oldest first).</p>
      )}
    </div>
  )
}
