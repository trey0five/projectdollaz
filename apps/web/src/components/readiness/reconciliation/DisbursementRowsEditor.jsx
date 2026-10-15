import { useState } from 'react'
import { Plus, Trash2, Save } from 'lucide-react'
import { PROGRAM_OPTIONS } from '../../../lib/complianceMeta.js'
import { toApiRows } from '../../../lib/reconcileMapping.js'
import { sanitizeDecimal } from '../../../lib/numericInput.js'
import DatePicker from '../../ui/DatePicker.jsx'

const blankRow = () => ({
  studentRef: '',
  program: '',
  payDate: '',
  amount: '',
  term: '',
  batchRef: '',
})

function toDraft(d) {
  return {
    studentRef: d.studentRef ?? '',
    program: d.program ?? '',
    payDate: d.payDate ?? '',
    amount: d.amount == null ? '' : String(d.amount),
    term: d.term ?? '',
    batchRef: d.batchRef ?? '',
  }
}

/**
 * Manual add/edit of the disbursement set. Seeds from the existing rows so an
 * imported set can be tweaked. On save it PUTs the WHOLE set (replace semantics),
 * matching the API contract. Owner/accountant only (the parent gates rendering).
 */
export default function DisbursementRowsEditor({ existing, onSave, onCancel, saving }) {
  const [rows, setRows] = useState(() =>
    existing && existing.length > 0 ? existing.map(toDraft) : [blankRow()],
  )

  const update = (i, key, val) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)))
  const remove = (i) => setRows((rs) => rs.filter((_, idx) => idx !== i))
  const add = () => setRows((rs) => [...rs, blankRow()])

  const save = () => {
    const disbursements = rows.map((r) => ({
      studentRef: r.studentRef.trim() || null,
      program: r.program || null,
      payDate: r.payDate.trim() || null,
      amount: r.amount.trim() === '' ? null : Number(r.amount),
      term: r.term.trim() || null,
      batchRef: r.batchRef.trim() || null,
    }))
    onSave(toApiRows(disbursements))
  }

  return (
    <div className="panel space-y-3 p-5">
      <p className="text-heading font-semibold text-ink">Edit disbursements</p>
      <div className="dt-wrap">
        <table className="dt">
          <thead>
            <tr>
              <th scope="col">Student</th>
              <th scope="col">Program</th>
              <th scope="col">Pay date</th>
              <th scope="col">Amount</th>
              <th scope="col">Term</th>
              <th scope="col">Batch</th>
              <th scope="col"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="py-1">
                  <input
                    value={r.studentRef}
                    onChange={(e) => update(i, 'studentRef', e.target.value)}
                    className="w-24 h-7 rounded-[4px] border border-hair/[0.18] bg-white px-1.5 text-[13px] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25"
                  />
                </td>
                <td className="py-1">
                  <select
                    value={r.program}
                    onChange={(e) => update(i, 'program', e.target.value)}
                    className="h-7 rounded-[4px] border border-hair/[0.18] bg-white px-1 text-[13px] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25"
                  >
                    <option value="">—</option>
                    {PROGRAM_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1">
                  <DatePicker
                    value={r.payDate}
                    onChange={(v) => update(i, 'payDate', v)}
                    className="h-7 rounded-[4px] border border-hair/[0.18] bg-white px-1.5 text-[13px] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25"
                  />
                </td>
                <td className="py-1">
                  <input
                    inputMode="decimal"
                    value={r.amount}
                    onChange={(e) => update(i, 'amount', sanitizeDecimal(e.target.value))}
                    className="w-24 rounded border border-hair/[0.18] px-1.5 py-1 text-right text-[14px] tabular-nums"
                  />
                </td>
                <td className="py-1">
                  <input
                    value={r.term}
                    onChange={(e) => update(i, 'term', e.target.value)}
                    className="w-20 h-7 rounded-[4px] border border-hair/[0.18] bg-white px-1.5 text-[13px] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25"
                  />
                </td>
                <td className="py-1">
                  <input
                    value={r.batchRef}
                    onChange={(e) => update(i, 'batchRef', e.target.value)}
                    className="w-20 h-7 rounded-[4px] border border-hair/[0.18] bg-white px-1.5 text-[13px] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25"
                  />
                </td>
                <td className="py-1 text-right">
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="rounded-[4px] p-1 text-ink2 hover:bg-ink/[0.05] hover:text-ink"
                    aria-label="Remove row"
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={add} className="btn btn-secondary">
          <Plus size={15} /> Add row
        </button>
        <button type="button" onClick={save} className="btn btn-primary" disabled={saving}>
          <Save size={15} /> {saving ? 'Saving…' : 'Save set'}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-secondary" disabled={saving}>
          Cancel
        </button>
      </div>
    </div>
  )
}
