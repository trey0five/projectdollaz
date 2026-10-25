// Import tab — drop/browse an .xlsx budget spread, parse it CLIENT-SIDE via
// @finrep/ingestion's parseBudgetSpread, preview the result, then Confirm to PUT
// it to the server. On success the parent switches to the Monthly Spread tab.
//
// Flow states are derived from local state at render (no effects, no in-render
// component definitions). The parser runs in a try/catch so a malformed file
// shows a friendly inline error instead of crashing the page.
import { useEffect, useMemo, useRef, useState } from 'react'
import { UploadCloud, FileSpreadsheet, X, CheckCircle2, Loader2 } from 'lucide-react'
import { parseBudgetSpread } from '@finrep/ingestion'
import { analyticsApi, apiErrorMessage } from '../../lib/api.js'
import BudgetSpreadPreview from './BudgetSpreadPreview.jsx'
import SufficiencyPanel from './SufficiencyPanel.jsx'
import ResolveUnmatched from './ResolveUnmatched.jsx'
import { useBudgetAssessment } from '../../hooks/useBudgetAssessment.js'
import { Button } from '../ui/surface/index.js'
import '../../styles/pending/b2-finance.css'
import { asTableFile } from '../../lib/pdfTable.js'

function readBytes(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read file.'))
    reader.onload = (e) => resolve(e.target.result)
    reader.readAsArrayBuffer(file)
  })
}

const isXlsx = (name) => /\.xlsx?$/i.test(name || '')

export default function BudgetImport({ schoolId, periodId, canEdit, onImported, initialFile = null }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState('')
  const [spread, setSpread] = useState(null)
  const [parseError, setParseError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  // Bumped after a Resolve-unmatched save to FORCE a re-assessment (the throttled
  // hook only re-fetches when its key changes); the server then re-rolls with the
  // freshly-saved mapping overrides and resolved lines drop out of `unmatched`.
  const [resolveNonce, setResolveNonce] = useState(0)

  // ── Sufficiency check on the PARSED spread (before Confirm) ────────────────
  // A parsed spread is immutable per drop, so a cheap signature (format + row
  // count + summed annuals) keys it: one assess per file, none on re-render.
  const assessBody = useMemo(() => (spread ? { spread } : null), [spread])
  const assessKey = useMemo(() => {
    if (!spread) return ''
    const accounts = spread.accounts || []
    const sum = accounts.reduce((s, a) => s + (Number(a?.annual) || 0), 0)
    return `${spread.format}:${accounts.length}:${Math.round(sum)}:${resolveNonce}`
  }, [spread, resolveNonce])
  const { assessment, loading: assessLoading } = useBudgetAssessment(
    schoolId,
    periodId,
    assessBody,
    canEdit ? assessKey : '',
  )

  const reset = () => {
    setFileName('')
    setSpread(null)
    setParseError('')
    setSaveError('')
  }

  const handleFile = async (file) => {
    if (!file) return
    setSaveError('')
    // #52 — a PDF is rebuilt into its table by the API (an .xlsx from here on).
    try {
      file = await asTableFile(schoolId, file)
    } catch (e) {
      setFileName(file.name)
      setParseError(e?.response?.data?.message || 'Couldn’t read a table out of this PDF.')
      return
    }
    if (!isXlsx(file.name)) {
      setSpread(null)
      setFileName(file.name)
      setParseError('Please choose an .xlsx, .xls or PDF budget spreadsheet.')
      return
    }
    setFileName(file.name)
    setParseError('')
    try {
      const bytes = await readBytes(file)
      const parsed = parseBudgetSpread(bytes)
      setSpread(parsed)
    } catch (e) {
      setSpread(null)
      setParseError(e?.message || 'Could not parse this spreadsheet.')
    }
  }

  // A file handed over by the Finance upload sorter (#43): read it on mount.
  useEffect(() => {
    if (initialFile) queueMicrotask(() => void handleFile(initialFile))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    if (!canEdit) return
    const file = e.dataTransfer?.files?.[0]
    handleFile(file)
  }

  const onConfirm = async () => {
    if (!spread || !schoolId || !periodId) return
    setSaving(true)
    setSaveError('')
    try {
      const res = await analyticsApi.saveBudgetSpread(schoolId, periodId, { spread, fileName })
      onImported?.(res.data)
    } catch (e) {
      setSaveError(apiErrorMessage(e, 'Could not save the imported budget.'))
    } finally {
      setSaving(false)
    }
  }

  if (!canEdit) {
    return (
      <div className="b2-note">
        <p>Importing a budget is available to owners and accountants.</p>
      </div>
    )
  }

  if (!periodId) {
    return (
      <div className="b2-note">
        <p>Select a period to import a budget.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* The dropzone keeps its dashed affordance (an upload is an action). */}
      <label
        htmlFor="budget-spread-file"
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        data-active={dragging ? 'true' : undefined}
        className="b2-drop py-10"
      >
        <span className="b2-drop-icon">
          <UploadCloud size={28} aria-hidden="true" />
        </span>
        <div>
          <div className="text-heading font-semibold text-ink">Drop your budget spreadsheet</div>
          <p className="mt-0.5 text-small text-ink2">
            .xlsx · a standard template or a generic accounts-down / months-across layout
          </p>
        </div>
        <span className="btn btn-secondary btn-sm mt-1">Browse files</span>
        <input
          ref={inputRef}
          id="budget-spread-file"
          type="file"
          accept=".xlsx,.xls,.pdf"
          className="sr-only"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </label>

      {fileName && (
        <div className="fig">
          <span className="fig-label min-w-0">
            <FileSpreadsheet size={16} aria-hidden="true" className="shrink-0 text-ink2" />
            <span className="truncate font-medium text-ink">{fileName}</span>
          </span>
          <Button variant="quiet" size="sm" onClick={reset} aria-label="Clear selected file" icon={<X size={14} />} />
        </div>
      )}

      {parseError && (
        <p className="b2-callout" data-tone="risk" role="alert">
          {parseError}
        </p>
      )}

      {spread && (
        <>
          <BudgetSpreadPreview spread={spread} />

          <SufficiencyPanel assessment={assessment} loading={assessLoading} />

          <ResolveUnmatched
            schoolId={schoolId}
            unmatched={assessment?.unmatched ?? []}
            onResolved={() => setResolveNonce((n) => n + 1)}
          />

          {saveError && (
            <p className="b2-callout" data-tone="risk" role="alert">
              {saveError}
            </p>
          )}

          <div className="b2-actions">
            <div className="b2-actions-end">
              <Button variant="quiet" onClick={reset} disabled={saving}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={onConfirm}
                disabled={saving}
                icon={saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              >
                {saving ? 'Saving…' : 'Confirm import'}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
