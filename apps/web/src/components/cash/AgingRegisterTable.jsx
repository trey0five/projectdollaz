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

// Bucket → the pill styling (navy-soft → gold → danger, matching the bars ramp).
const BUCKET_PILL = {
  current: { label: 'Current', cls: 'border-emerald-300/70 bg-emerald-50 text-emerald-700' },
  d1_30: { label: '1–30d', cls: 'border-navy-soft/40 bg-navy-soft/10 text-navy-soft' },
  d31_60: { label: '31–60d', cls: 'border-gold/40 bg-gold/10 text-[#7a5e00]' },
  d61_90: { label: '61–90d', cls: 'border-gold/60 bg-gold/20 text-[#7a5e00]' },
  d90_plus: { label: '90+d', cls: 'border-danger/30 bg-danger/10 text-danger' },
}

function fmtMoney(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '$0'
  const neg = v < 0
  return `${neg ? '−' : ''}$${Math.round(Math.abs(v)).toLocaleString('en-US')}`
}

// Grid template as an inline style (NOT an arbitrary Tailwind class): a
// grid-template-columns value with commas inside minmax() can drop out of the
// dev-server JIT, so we set it directly to guarantee the row lays out in columns.
const GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'minmax(120px,1.7fr) 72px 96px 120px minmax(96px,1fr)',
  gap: '0.5rem',
}

function BucketPill({ bucket, daysOverdue }) {
  const def = BUCKET_PILL[bucket] ?? BUCKET_PILL.current
  const overdue = typeof daysOverdue === 'number' && daysOverdue > 0
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11.5px] font-semibold ${def.cls}`}
    >
      {def.label}
      {overdue ? <span className="tabular-nums opacity-70">· {daysOverdue}d</span> : null}
    </span>
  )
}

function Row({ row }) {
  const linkable = !!row.deepLink
  const body = (
    <>
      <span className="min-w-0 truncate font-semibold text-navy" title={row.party || ''}>
        {row.party || '—'}
      </span>
      <span className="truncate text-muted" title={row.docNumber || ''}>
        {row.docNumber || '—'}
      </span>
      <span className="whitespace-nowrap tabular-nums text-muted">
        {row.dueDate ? formatShortDate(row.dueDate) : '—'}
      </span>
      <span className="flex items-center">
        <BucketPill bucket={row.bucket} daysOverdue={row.daysOverdue} />
      </span>
      <span className="flex items-center justify-end gap-1">
        <span className="tabular-nums font-semibold text-navy">{fmtMoney(row.amount)}</span>
        {linkable ? (
          <ExternalLink
            size={12}
            className="shrink-0 text-gold opacity-70 group-hover:opacity-100"
          />
        ) : null}
      </span>
    </>
  )
  const cls = 'items-center px-3 py-2.5 text-[13.5px]'
  if (!linkable) {
    return (
      <div className={cls} style={GRID_STYLE} title="No linkable QuickBooks document for this row">
        {body}
      </div>
    )
  }
  return (
    <a
      href={row.deepLink}
      target="_blank"
      rel="noopener noreferrer"
      style={GRID_STYLE}
      className={`group ${cls} outline-none transition-colors hover:bg-gold/10 focus-visible:bg-gold/10 focus-visible:ring-2 focus-visible:ring-gold/50`}
      title="Open this document in QuickBooks"
    >
      {body}
    </a>
  )
}

export default function AgingRegisterTable({ items = [], totalCount = 0, side = 'receivables' }) {
  // Defensive oldest-then-largest sort (the server already sorts this way).
  const rows = [...items].sort(
    (a, b) => (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0) || (b.amount ?? 0) - (a.amount ?? 0),
  )
  const noun = side === 'payables' ? 'bills' : 'receivables'

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-rule/60 bg-cream/50 px-6 py-12 text-center">
        <p className="font-serif text-[16px] italic text-muted">All clear — no open {noun}.</p>
        <p className="mt-1 text-[13px] text-muted">Nothing outstanding on this side.</p>
      </div>
    )
  }

  return (
    <div className="no-print">
      <div className="overflow-x-auto rounded-xl border border-rule/50 bg-white">
        <div className="min-w-[560px]">
          <div
            style={GRID_STYLE}
            className="border-b border-rule/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted"
          >
            <span>Party</span>
            <span>Doc #</span>
            <span>Due</span>
            <span>Aging</span>
            <span className="text-right">Open</span>
          </div>
          <div className="divide-y divide-rule/30">
            {rows.map((r, i) => (
              <Row key={r.deepLink ?? `${r.docNumber ?? 'row'}-${i}`} row={r} />
            ))}
          </div>
        </div>
      </div>
      {totalCount > rows.length ? (
        <p className="mt-2 text-[12.5px] italic text-muted">
          Showing {rows.length} of {totalCount} open {noun} (oldest first). Totals above are summed
          over all {totalCount}.
        </p>
      ) : (
        <p className="mt-2 text-[12.5px] italic text-muted">
          Showing all {rows.length} open {noun} (oldest first).
        </p>
      )}
    </div>
  )
}
