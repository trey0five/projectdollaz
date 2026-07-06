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
    <div className="space-y-3 rounded-2xl border border-gold/30 bg-white p-5">
      <p className="font-serif text-base font-semibold text-navy">Edit disbursements</p>
      <div className="overflow-x-auto">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-b border-rule text-left text-[12px] uppercase tracking-[0.08em] text-muted">
              <th className="px-2 py-1.5 font-semibold">Student</th>
              <th className="px-2 py-1.5 font-semibold">Program</th>
              <th className="px-2 py-1.5 font-semibold">Pay date</th>
              <th className="px-2 py-1.5 font-semibold">Amount</th>
              <th className="px-2 py-1.5 font-semibold">Term</th>
              <th className="px-2 py-1.5 font-semibold">Batch</th>
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-rule/40">
                <td className="px-1 py-1">
                  <input
                    value={r.studentRef}
                    onChange={(e) => update(i, 'studentRef', e.target.value)}
                    className="w-24 rounded border border-border px-1.5 py-1 text-[14px]"
                  />
                </td>
                <td className="px-1 py-1">
                  <select
                    value={r.program}
                    onChange={(e) => update(i, 'program', e.target.value)}
                    className="rounded border border-border px-1 py-1 text-[14px]"
                  >
                    <option value="">—</option>
                    {PROGRAM_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-1 py-1">
                  <DatePicker
                    value={r.payDate}
                    onChange={(v) => update(i, 'payDate', v)}
                    className="rounded border border-border px-1.5 py-1 text-[14px]"
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    inputMode="decimal"
                    value={r.amount}
                    onChange={(e) => update(i, 'amount', sanitizeDecimal(e.target.value))}
                    className="w-24 rounded border border-border px-1.5 py-1 text-right text-[14px] tabular-nums"
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    value={r.term}
                    onChange={(e) => update(i, 'term', e.target.value)}
                    className="w-20 rounded border border-border px-1.5 py-1 text-[14px]"
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    value={r.batchRef}
                    onChange={(e) => update(i, 'batchRef', e.target.value)}
                    className="w-20 rounded border border-border px-1.5 py-1 text-[14px]"
                  />
                </td>
                <td className="px-1 py-1 text-right">
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="text-muted hover:text-danger"
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
        <button type="button" onClick={add} className="btn-ghost">
          <Plus size={15} /> Add row
        </button>
        <button type="button" onClick={save} className="btn-primary disabled:opacity-50" disabled={saving}>
          <Save size={15} /> {saving ? 'Saving…' : 'Save set'}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost" disabled={saving}>
          Cancel
        </button>
      </div>
    </div>
  )
}
