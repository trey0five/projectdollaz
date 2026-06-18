import { MAPPING_FIELDS } from '../../../lib/reconcileMapping.js'
import MappingPreview from './MappingPreview.jsx'

/**
 * The lightweight column-mapping step: for each target field, pick which detected
 * header feeds it (auto-mapped by default; tolerant of varying funding-org
 * headers). Amount is required to save.
 */
export default function ColumnMappingPanel({
  fileName,
  headers,
  mapping,
  setMapping,
  disbursements,
  onConfirm,
  onCancel,
  saving,
}) {
  const amountMapped = !!mapping.amount

  return (
    <div className="space-y-4 rounded-2xl border border-gold/30 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-serif text-base font-semibold text-navy">Map columns</p>
          <p className="text-[12px] text-muted">
            From <span className="font-semibold text-navy">{fileName}</span> · {headers.length} columns,{' '}
            {disbursements.length} rows
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MAPPING_FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              {f.label}
              {f.required && <span className="text-danger">*</span>}
            </span>
            <select
              value={mapping[f.key] ?? ''}
              onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}
              className={`w-full rounded-lg border bg-white px-2.5 py-2 text-[13px] text-navy focus:outline-none focus:ring-2 focus:ring-gold/40 ${
                f.required && !mapping[f.key] ? 'border-danger/50' : 'border-border'
              }`}
            >
              <option value="">— not mapped —</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Preview</p>
        <MappingPreview disbursements={disbursements} />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={!amountMapped || saving}
          className="btn-primary disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Import disbursements'}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost" disabled={saving}>
          Cancel
        </button>
        {!amountMapped && (
          <span className="text-[12px] text-danger">Map the Amount column to continue.</span>
        )}
      </div>
    </div>
  )
}
