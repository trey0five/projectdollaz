import { useState } from 'react'
import { fmtDollar, formatShortDate } from '../../../lib/format.js'
import { programLabel } from '../../../lib/complianceMeta.js'

const PAGE = 25

/** The funding-org disbursements table (read view). Paged for large sets. */
export default function DisbursementsTable({ disbursements }) {
  const [shown, setShown] = useState(PAGE)

  if (!disbursements || disbursements.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-rule px-4 py-6 text-center text-[13px] italic text-muted">
        No disbursements imported for this period yet.
      </p>
    )
  }

  const rows = disbursements.slice(0, shown)

  return (
    <div className="overflow-hidden rounded-xl border border-rule/60">
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-rule bg-section text-left text-[10px] uppercase tracking-[0.08em] text-muted">
              <th className="px-3 py-2 font-semibold">Student</th>
              <th className="px-3 py-2 font-semibold">Program</th>
              <th className="px-3 py-2 font-semibold">Pay date</th>
              <th className="px-3 py-2 font-semibold">Term</th>
              <th className="px-3 py-2 font-semibold">Batch</th>
              <th className="px-3 py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule/40">
            {rows.map((d) => (
              <tr key={d.id} className="bg-white hover:bg-section/60">
                <td className="px-3 py-2 text-navy">{d.studentRef ?? '—'}</td>
                <td className="px-3 py-2">
                  {d.program ? (
                    <span className="rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-semibold text-[#7a5e00]">
                      {programLabel(d.program)}
                    </span>
                  ) : (
                    <span className="text-muted">Unknown</span>
                  )}
                </td>
                <td className="px-3 py-2 text-muted">{formatShortDate(d.payDate)}</td>
                <td className="px-3 py-2 text-muted">{d.term ?? '—'}</td>
                <td className="px-3 py-2 text-muted">{d.batchRef ?? '—'}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${d.amount < 0 ? 'text-danger' : 'text-navy'}`}>
                  {fmtDollar(d.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown < disbursements.length && (
        <button
          type="button"
          onClick={() => setShown((s) => s + PAGE)}
          className="w-full border-t border-rule bg-section py-2 text-[12px] font-semibold text-gold hover:bg-gold/5"
        >
          Show more ({disbursements.length - shown} remaining)
        </button>
      )}
    </div>
  )
}
