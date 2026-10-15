import { useState } from 'react'
import { fmtDollar, formatShortDate } from '../../../lib/format.js'
import { programLabel } from '../../../lib/complianceMeta.js'
import { DataTable } from '../../ui/surface/index.js'

const PAGE = 25

const COLUMNS = [
  { key: 'studentRef', header: 'Student', render: (d) => d.studentRef ?? '—' },
  {
    key: 'program',
    header: 'Program',
    render: (d) => (d.program ? programLabel(d.program) : <span className="text-ink2">Unknown</span>),
  },
  { key: 'payDate', header: 'Pay date', className: 'whitespace-nowrap text-ink2', render: (d) => formatShortDate(d.payDate) },
  { key: 'term', header: 'Term', className: 'text-ink2', render: (d) => d.term ?? '—' },
  { key: 'batchRef', header: 'Batch', className: 'text-ink2', render: (d) => d.batchRef ?? '—' },
  {
    key: 'amount',
    header: 'Amount',
    num: true,
    render: (d) => <span className={d.amount < 0 ? 'amt-neg' : ''}>{fmtDollar(d.amount)}</span>,
  },
]

/** The funding-org disbursements table (read view). Paged for large sets. */
export default function DisbursementsTable({ disbursements }) {
  const [shown, setShown] = useState(PAGE)

  if (!disbursements || disbursements.length === 0) {
    return <p className="b2-note">No disbursements imported for this period yet.</p>
  }

  const rows = disbursements.slice(0, shown)

  return (
    <div>
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey="id"
        caption="Funding-org disbursements"
      />
      {shown < disbursements.length && (
        <div className="mt-2">
          <button type="button" onClick={() => setShown((s) => s + PAGE)} className="dt-link">
            Show more ({disbursements.length - shown} remaining)
          </button>
        </div>
      )}
    </div>
  )
}
