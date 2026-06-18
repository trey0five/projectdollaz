import { fmtDollar, formatShortDate } from '../../../lib/format.js'
import { programLabel } from '../../../lib/complianceMeta.js'

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
      <div className="flex flex-wrap items-center gap-3 text-[12px]">
        <span className="font-semibold text-navy">
          {disbursements.length} row{disbursements.length === 1 ? '' : 's'}
        </span>
        <span className="text-muted">
          mapped total <span className="font-semibold text-navy tabular-nums">{fmtDollar(mappedTotal)}</span>
        </span>
        {badAmount > 0 && (
          <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-semibold text-danger">
            {badAmount} row{badAmount === 1 ? '' : 's'} with no parseable amount
          </span>
        )}
      </div>
      <div className="overflow-hidden rounded-lg border border-rule/60">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-rule bg-section text-left text-[10px] uppercase tracking-[0.08em] text-muted">
              <th className="px-3 py-1.5 font-semibold">Student</th>
              <th className="px-3 py-1.5 font-semibold">Program</th>
              <th className="px-3 py-1.5 font-semibold">Date</th>
              <th className="px-3 py-1.5 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule/40">
            {rows.map((d, i) => (
              <tr key={i} className="bg-white">
                <td className="px-3 py-1.5 text-navy">{d.studentRef ?? '—'}</td>
                <td className="px-3 py-1.5 text-muted">{d.program ? programLabel(d.program) : 'Unknown'}</td>
                <td className="px-3 py-1.5 text-muted">{formatShortDate(d.payDate)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-navy">
                  {typeof d.amount === 'number' && Number.isFinite(d.amount) ? fmtDollar(d.amount) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {disbursements.length > limit && (
        <p className="text-[11px] italic text-muted">…and {disbursements.length - limit} more.</p>
      )}
    </div>
  )
}
