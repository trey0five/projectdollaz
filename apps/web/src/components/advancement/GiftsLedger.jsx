// ─────────────────────────────────────────────────────────────────────────────
// GiftsLedger — the LIGHT gifts & pledges table for the campaign detail page
// (replaces the old dark row-expand GiftsPanel). Presentational: the parent owns
// loading, the confirm flows and every mutation; this renders rows + action
// affordances. Zero donor PII — the Label column is a non-identifying tag.
// ─────────────────────────────────────────────────────────────────────────────
import { Gift as GiftIcon, HandCoins, Pencil, Trash2, TrendingDown } from 'lucide-react'
import { GIFT_STATUS, GIFT_KIND_LABEL, fmtMoneyFull, shortDate } from './campaignMeta.js'

function Th({ children, right }) {
  return (
    <th
      className={`px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted ${
        right ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  )
}

function IconAction(props) {
  const { onClick, label, title, danger } = props
  const ActionIcon = props.Icon
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title ?? label}
      className={`rounded-lg border border-rule/60 p-1.5 text-muted transition hover:text-navy ${
        danger ? 'hover:border-danger/50 hover:text-danger' : 'hover:border-gold/60'
      }`}
    >
      <ActionIcon size={15} />
    </button>
  )
}

export default function GiftsLedger({ gifts, loading, canEdit, onEdit, onWriteOff, onDelete }) {
  if (loading || gifts === null)
    return (
      <div className="rounded-xl border border-dashed border-rule/60 bg-cream/50 px-6 py-10 text-center">
        <p className="text-[14px] text-muted">Loading gifts &amp; pledges…</p>
      </div>
    )
  if (gifts.length === 0)
    return (
      <div className="rounded-xl border border-dashed border-rule/60 bg-cream/50 px-6 py-10 text-center">
        <p className="font-serif text-[16px] italic text-muted">No gifts or pledges recorded yet.</p>
        <p className="mt-1 text-[13px] text-muted">
          Record the first entry to start rolling up what this campaign has raised.
        </p>
      </div>
    )

  return (
    <div className="overflow-x-auto rounded-xl border border-rule/50">
      <table className="w-full text-left text-[14px]">
        <thead className="bg-cream">
          <tr>
            <Th>Kind</Th>
            <Th right>Amount</Th>
            <Th>Status</Th>
            <Th>Label</Th>
            <Th>Source</Th>
            <Th>Date</Th>
            {canEdit ? <Th right>Actions</Th> : null}
          </tr>
        </thead>
        <tbody>
          {gifts.map((g) => {
            const KindIcon = g.kind === 'pledge' ? HandCoins : GiftIcon
            const status = GIFT_STATUS[g.status] ?? GIFT_STATUS.pledged
            const writtenOff = g.status === 'written_off'
            const pledgeUnfulfilled = g.kind === 'pledge' && !writtenOff && g.receivedAmount < g.amount
            return (
              <tr key={g.id} className="group border-t border-rule/50">
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-rule/60 bg-section px-2 py-0.5 text-[12px] font-semibold text-muted">
                    <KindIcon size={13} className="text-gold" />
                    {GIFT_KIND_LABEL[g.kind] ?? g.kind}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <span className={`font-semibold text-navy ${writtenOff ? 'line-through opacity-50' : ''}`}>
                    {fmtMoneyFull(g.amount)}
                  </span>
                  {g.kind === 'pledge' ? (
                    <div className="mt-0.5 text-[11.5px] text-muted">
                      {fmtMoneyFull(g.receivedAmount)} received of {fmtMoneyFull(g.amount)}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] font-semibold ${status.cls}`}
                  >
                    {status.label}
                  </span>
                </td>
                <td className="max-w-[220px] truncate px-4 py-3 text-navy">{g.label ?? '—'}</td>
                <td className="px-4 py-3 text-muted">{g.source ?? '—'}</td>
                <td className="px-4 py-3 text-muted">
                  {g.occurredOn ? (shortDate(g.occurredOn) ?? g.occurredOn) : '—'}
                </td>
                {canEdit ? (
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {pledgeUnfulfilled ? (
                        <button
                          type="button"
                          onClick={() => onEdit(g)}
                          className="rounded-lg border border-gold/50 bg-gold/10 px-2 py-1 text-[12px] font-semibold text-[#7a5e00] transition hover:bg-gold/20"
                        >
                          Record payment
                        </button>
                      ) : (
                        <IconAction Icon={Pencil} onClick={() => onEdit(g)} label="Edit entry" />
                      )}
                      {!writtenOff ? (
                        <IconAction
                          Icon={TrendingDown}
                          onClick={() => onWriteOff(g)}
                          label="Write off"
                          title="Write off"
                        />
                      ) : null}
                      <IconAction Icon={Trash2} danger onClick={() => onDelete(g)} label="Delete entry" />
                    </div>
                  </td>
                ) : null}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
