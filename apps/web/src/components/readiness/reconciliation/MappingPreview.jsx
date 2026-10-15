import { fmtDollar, formatShortDate } from '../../../lib/format.js'
import { programLabel } from '../../../lib/complianceMeta.js'
import { Pill } from '../../ui/surface/index.js'

/** A small preview of the first N mapped rows so the user can sanity-check. */
export default function MappingPreview({ disbursements, limit = 6 }) {
  const rows = disbursements.slice(0, limit)
  const mappedTotal = disbursements.reduce(
    (a, d) => (typeof d.amount === 'number' && Number.isFinite(d.amount) ? a + d.amount : a),
    0,
  )
  const badAmount = disbursements.filter(
    (d) => !(typeof d.amount === 'number' && Number.isFinite(d.amount)),
  ).length

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-[13px]">
        <span className="font-semibold text-ink">
          {disbursements.length} row{disbursements.length === 1 ? '' : 's'}
        </span>
        <span className="text-ink2">
          mapped total <span className="font-semibold text-ink tabular-nums">{fmtDollar(mappedTotal)}</span>
        </span>
        {badAmount > 0 && (
          <Pill variant="status" tone="risk">
            {badAmount} row{badAmount === 1 ? '' : 's'} with no parseable amount
          </Pill>
        )}
      </div>
      <div className="dt-wrap">
        <table className="dt">
          <thead>
            <tr>
              <th scope="col">Student</th>
              <th scope="col">Program</th>
              <th scope="col">Date</th>
              <th scope="col" className="dt-num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d, i) => (
              <tr key={i}>
                <td>{d.studentRef ?? '—'}</td>
                <td className="text-ink2">{d.program ? programLabel(d.program) : 'Unknown'}</td>
                <td className="whitespace-nowrap text-ink2">{formatShortDate(d.payDate)}</td>
                <td className="dt-num">
                  {typeof d.amount === 'number' && Number.isFinite(d.amount) ? fmtDollar(d.amount) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {disbursements.length > limit && (
        <p className="text-[13px] italic text-ink2">…and {disbursements.length - limit} more.</p>
      )}
    </div>
  )
}
