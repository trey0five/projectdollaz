// ─────────────────────────────────────────────────────────────────────────────
// GiftsLedger — the LIGHT gifts & pledges table for the campaign detail page
// (replaces the old dark row-expand GiftsPanel). Presentational: the parent owns
// loading, the confirm flows and every mutation; this renders rows + action
// affordances. Zero donor PII — the Label column is a non-identifying tag.
// ─────────────────────────────────────────────────────────────────────────────
import { Gift as GiftIcon, HandCoins, Pencil, Trash2, TrendingDown } from 'lucide-react'
import { GIFT_STATUS, GIFT_KIND_LABEL, fmtMoneyFull, shortDate } from './campaignMeta.js'
import { DataTable, Pill, Button } from '../ui/surface/index.js'
import '../../styles/pending/b1-domain.css'

function IconAction(props) {
  const { onClick, label, title, danger } = props
  const ActionIcon = props.Icon
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title ?? label}
      className={`b1-icon-act${danger ? ' b1-icon-act-danger' : ''}`}
    >
      <ActionIcon size={15} />
    </button>
  )
}

export default function GiftsLedger({ gifts, loading, canEdit, onEdit, onWriteOff, onDelete }) {
  if (loading || gifts === null)
    return (
      <div className="b1-empty">
        <p>Loading gifts &amp; pledges…</p>
      </div>
    )
  if (gifts.length === 0)
    return (
      <div className="b1-empty">
        <p className="b1-empty-title">No gifts or pledges recorded yet</p>
        <p>Record the first entry to start rolling up what this campaign has raised.</p>
      </div>
    )

  const columns = [
    {
      key: 'kind',
      header: 'Kind',
      sortable: true,
      render: (g) => {
        const KindIcon = g.kind === 'pledge' ? HandCoins : GiftIcon
        return (
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <KindIcon size={13} className="tone-hue" aria-hidden="true" />
            {GIFT_KIND_LABEL[g.kind] ?? g.kind}
          </span>
        )
      },
    },
    {
      key: 'amount',
      header: 'Amount',
      num: true,
      sortable: true,
      render: (g) => (
        <>
          <span className={`font-semibold ${g.status === 'written_off' ? 'line-through opacity-50' : ''}`}>
            {fmtMoneyFull(g.amount)}
          </span>
          {g.kind === 'pledge' ? (
            <span className="dt-sub whitespace-nowrap">
              {fmtMoneyFull(g.receivedAmount)} received of {fmtMoneyFull(g.amount)}
            </span>
          ) : null}
        </>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (g) => {
        const status = GIFT_STATUS[g.status] ?? GIFT_STATUS.pledged
        return (
          <Pill variant="status" tone={status.tone}>
            {status.label}
          </Pill>
        )
      },
    },
    { key: 'label', header: 'Label', render: (g) => <span className="block max-w-[220px] truncate">{g.label ?? '—'}</span> },
    { key: 'source', header: 'Source', render: (g) => <span className="text-ink2">{g.source ?? '—'}</span> },
    {
      key: 'occurredOn',
      header: 'Date',
      sortable: true,
      render: (g) => (
        <span className="whitespace-nowrap text-ink2">{g.occurredOn ? (shortDate(g.occurredOn) ?? g.occurredOn) : '—'}</span>
      ),
    },
  ]
  if (canEdit)
    columns.push({
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      headerClassName: 'dt-num',
      className: 'dt-num',
      render: (g) => {
        const writtenOff = g.status === 'written_off'
        const pledgeUnfulfilled = g.kind === 'pledge' && !writtenOff && g.receivedAmount < g.amount
        return (
          <div className="inline-flex items-center justify-end gap-1">
            {pledgeUnfulfilled ? (
              <Button size="sm" onClick={() => onEdit(g)}>
                Record payment
              </Button>
            ) : (
              <span className="dt-actions">
                <IconAction Icon={Pencil} onClick={() => onEdit(g)} label="Edit entry" />
              </span>
            )}
            <span className="dt-actions inline-flex gap-1">
              {!writtenOff ? (
                <IconAction Icon={TrendingDown} onClick={() => onWriteOff(g)} label="Write off" title="Write off" />
              ) : null}
              <IconAction Icon={Trash2} danger onClick={() => onDelete(g)} label="Delete entry" />
            </span>
          </div>
        )
      },
    })

  return <DataTable caption="Gifts and pledges" columns={columns} rows={gifts} />
}
