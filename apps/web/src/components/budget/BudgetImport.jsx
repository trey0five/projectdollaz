// Import tab — drop/browse an .xlsx budget spread, parse it CLIENT-SIDE via
// @finrep/ingestion's parseBudgetSpread, preview the result, then Confirm to PUT
// it to the server. On success the parent switches to the Monthly Spread tab.
//
// Flow states are derived from local state at render (no effects, no in-render
// component definitions). The parser runs in a try/catch so a malformed file
// shows a friendly inline error instead of crashing the page.
import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { UploadCloud, FileSpreadsheet, X, CheckCircle2, Loader2 } from 'lucide-react'
import { parseBudgetSpread } from '@finrep/ingestion'
import { analyticsApi, apiErrorMessage } from '../../lib/api.js'
import BudgetSpreadPreview from './BudgetSpreadPreview.jsx'

function readBytes(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read file.'))
    reader.onload = (e) => resolve(e.target.result)
    reader.readAsArrayBuffer(file)
  })
}

const isXlsx = (name) => /\.xlsx?$/i.test(name || '')

export default function BudgetImport({ schoolId, periodId, canEdit, onImported }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState('')
  const [spread, setSpread] = useState(null)
  const [parseError, setParseError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const reset = () => {
    setFileName('')
    setSpread(null)
    setParseError('')
    setSaveError('')
  }

  const handleFile = async (file) => {
    if (!file) return
    setSaveError('')
    if (!isXlsx(file.name)) {
      setSpread(null)
      setFileName(file.name)
      setParseError('Please choose an .xlsx (or .xls) budget spreadsheet.')
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
      <div className="card-soft px-6 py-10 text-center">
        <p className="font-serif text-lg italic text-muted">
          Importing a budget is available to owners and accountants.
        </p>
      </div>
    )
  }

  if (!periodId) {
    return (
      <div className="card-soft border-dashed px-6 py-10 text-center">
        <p className="font-serif text-lg italic text-muted">Select a period to import a budget.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <label
        htmlFor="budget-spread-file"
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragging ? 'border-gold bg-gold/10' : 'border-rule bg-cream/40 hover:border-gold/50'
        }`}
      >
        <motion.span
          animate={{ y: dragging ? -4 : 0 }}
          className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-glow"
        >
          <UploadCloud size={26} />
        </motion.span>
        <div>
          <div className="font-serif text-lg font-semibold text-navy">
            Drop your budget spreadsheet
          </div>
          <p className="mt-0.5 text-[13px] text-muted">
            .xlsx · the diocesan template or a generic accounts-down / months-across layout
          </p>
        </div>
        <span className="btn-ghost mt-1 text-[12px]">Browse files</span>
        <input
          ref={inputRef}
          id="budget-spread-file"
          type="file"
          accept=".xlsx,.xls"
          className="sr-only"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </label>

      {fileName && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-rule bg-white px-3.5 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <FileSpreadsheet size={18} className="shrink-0 text-gold" />
            <span className="truncate text-[13px] font-medium text-ink">{fileName}</span>
          </div>
          <button
            type="button"
            onClick={reset}
            aria-label="Clear selected file"
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-rule/30 hover:text-navy"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {parseError && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-700">
          {parseError}
        </div>
      )}

      {spread && (
        <>
          <BudgetSpreadPreview spread={spread} />

          {saveError && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-700">
              {saveError}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button type="button" onClick={reset} className="btn-ghost" disabled={saving}>
              Cancel
            </button>
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={onConfirm}
              disabled={saving}
              className="btn-primary inline-flex items-center gap-2 disabled:opacity-60"
            >
              {saving ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <CheckCircle2 size={15} /> Confirm import
                </>
              )}
            </motion.button>
          </div>
        </>
      )}
    </div>
  )
}
