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
    <div className="panel space-y-4 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-heading font-semibold text-ink">Map columns</p>
          <p className="text-small text-ink2">
            From <span className="font-semibold text-ink">{fileName}</span> · {headers.length} columns,{' '}
            {disbursements.length} rows
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MAPPING_FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="b2-label flex items-center gap-1">
              {f.label}
              {f.required && <span className="tone-risk">*</span>}
            </span>
            <select
              value={mapping[f.key] ?? ''}
              onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}
              className={`sel h-9 w-full !max-w-none ${f.required && !mapping[f.key] ? '!border-risk/50' : ''}`}
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
        <p className="b2-label">Preview</p>
        <MappingPreview disbursements={disbursements} />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-hair pt-4">
        <button
          type="button"
          onClick={onConfirm}
          disabled={!amountMapped || saving}
          className="btn btn-primary"
        >
          {saving ? 'Saving…' : 'Import disbursements'}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-quiet" disabled={saving}>
          Cancel
        </button>
        {!amountMapped && (
          <span className="b2-callout b2-risk py-1">Map the Amount column to continue.</span>
        )}
      </div>
    </div>
  )
}
