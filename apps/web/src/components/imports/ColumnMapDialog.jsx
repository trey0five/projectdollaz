// ─────────────────────────────────────────────────────────────────────────────
// ColumnMapDialog — "which column is the grade?" (#44). The finance column
// picker's idea for every other upload: the file's headers across the top, the
// first few rows underneath, and for each field we read a dropdown with our
// guess preselected. Apply re-runs the preview with the person's picks.
//
// Opens on its own when a required column couldn't be found (`problem`), and
// from the "Change how columns are read" link otherwise. Pure props: the server
// sends `table` ({ headers, sample, fields, mapping, needs }); this never parses.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, X } from 'lucide-react'
import Button from '../ui/surface/Button.jsx'

export default function ColumnMapDialog({ table, problem = null, onApply, onClose, busy = false }) {
  const [picks, setPicks] = useState(() => ({ ...(table?.mapping ?? {}) }))
  useEffect(() => {
    setPicks({ ...(table?.mapping ?? {}) })
  }, [table])
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  if (!table) return null

  const headers = table.headers ?? []
  const sample = table.sample ?? []
  const fields = table.fields ?? []
  const usedBy = (col) => fields.find((f) => picks[f.key] === col)?.label ?? null

  const apply = () => {
    // Send every field: a column index, or null for "no column" when we had a
    // guess the person cleared (so the server doesn't guess it back).
    const mapping = {}
    for (const f of fields) {
      const v = picks[f.key]
      if (typeof v === 'number') mapping[f.key] = v
      else if (f.key in (table.mapping ?? {})) mapping[f.key] = null
    }
    onApply?.(mapping)
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="colmap-title">
      <div className="max-h-[90vh] w-full max-w-[60rem] overflow-auto rounded-2xl bg-white p-5 shadow-2xl" data-testid="column-map-dialog">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="colmap-title" className="text-heading font-semibold text-ink">How should we read your columns?</h3>
            <p className="mt-1 text-small text-ink2">
              Pick the column for each field. We need {table.needs}; everything else is optional.
            </p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-md p-1 text-ink2 hover:bg-ground">
            <X size={16} />
          </button>
        </div>

        {problem ? (
          <p className="a2-note mt-3" data-tone="watch">
            <AlertTriangle size={13} aria-hidden /> {problem}
          </p>
        ) : null}

        {/* The file, as it is: headers and the first rows. */}
        <div className="mt-4 overflow-auto rounded-lg border border-hair">
          <table className="min-w-full text-[12.5px]">
            <thead className="bg-ground text-left text-ink2">
              <tr>
                {headers.map((h, i) => (
                  <th key={i} className="whitespace-nowrap px-2 py-1.5 font-semibold">
                    <span className="text-ink">{h || `Column ${i + 1}`}</span>
                    {usedBy(i) ? <span className="ml-1 rounded bg-[rgb(var(--c-module))]/10 px-1 text-[11px] text-ink">→ {usedBy(i)}</span> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sample.map((r, ri) => (
                <tr key={ri} className="border-t border-hair/60">
                  {headers.map((_, ci) => (
                    <td key={ci} className="max-w-[14rem] truncate whitespace-nowrap px-2 py-1 text-ink2">
                      {r[ci] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* One dropdown per field. */}
        <div className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {fields.map((f) => (
            <label key={f.key} className="flex items-center justify-between gap-3 text-small text-ink">
              <span>
                {f.label}
                {f.required ? <span className="text-ink2"> (needed)</span> : null}
              </span>
              <select
                aria-label={`Column for ${f.label}`}
                value={typeof picks[f.key] === 'number' ? String(picks[f.key]) : ''}
                onChange={(e) => {
                  const v = e.target.value === '' ? undefined : Number(e.target.value)
                  setPicks((prev) => {
                    const next = { ...prev }
                    // A column holds one field: taking it frees it elsewhere.
                    for (const k of Object.keys(next)) if (next[k] === v) delete next[k]
                    if (v === undefined) delete next[f.key]
                    else next[f.key] = v
                    return next
                  })
                }}
                className="a2-field max-w-[16rem]"
              >
                <option value="">— not in this file —</option>
                {headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `Column ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={apply} disabled={busy}>
            Use these columns
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
