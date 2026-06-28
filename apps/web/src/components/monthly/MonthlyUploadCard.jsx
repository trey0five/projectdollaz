// ─────────────────────────────────────────────────────────────────────────────
// Monthly Actuals — upload card. Drop/browse a month-end trial balance (.xlsx),
// parse it CLIENT-SIDE via @finrep/ingestion's `ingest(file.name, bytes)` (the
// SAME parser the annual intake uses at AppContext.jsx — NOT parseBudgetSpread),
// pick the fiscal-year month it represents, then POST { monthKey, sourceName,
// rows } to the monthly-snapshots endpoint.
//
// Flow states derive from local state at render (no effects, no in-render
// component defs — React-Compiler safe). The parser runs in a try/catch so a
// malformed file shows a friendly inline error instead of crashing the page.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  UploadCloud,
  FileSpreadsheet,
  X,
  CheckCircle2,
  Loader2,
  CalendarRange,
  AlertTriangle,
} from 'lucide-react'
import { ingest } from '@finrep/ingestion'
import { monthlyApi, apiErrorMessage } from '../../lib/api.js'
import { fyMonthKeys } from '../../lib/monthlyShapes.js'
import { fmt } from '../../lib/format.js'

function readBytes(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read file.'))
    reader.onload = (e) => resolve(e.target.result)
    reader.readAsArrayBuffer(file)
  })
}

const isXlsx = (name) => /\.xlsx?$/i.test(name || '')

export default function MonthlyUploadCard({
  schoolId,
  periodId,
  fiscalYearStart,
  loadedMonthKeys = [],
  initialMonthKey = '',
  onSaved,
  onCancel,
}) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState(null) // { rows, metadata }
  const [parseError, setParseError] = useState('')
  const [monthKey, setMonthKey] = useState(initialMonthKey)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const fyMonths = useMemo(() => fyMonthKeys(fiscalYearStart), [fiscalYearStart])
  const loadedSet = useMemo(() => new Set(loadedMonthKeys), [loadedMonthKeys])

  // Cheap signature of the parse so the preview stat row is memo-stable.
  const summary = useMemo(() => {
    if (!parsed) return null
    const rows = parsed.rows || []
    const total = rows.reduce((s, r) => s + (Number(r?.total) || 0), 0)
    return { rowCount: rows.length, total }
  }, [parsed])

  const reset = () => {
    setFileName('')
    setParsed(null)
    setParseError('')
    setSaveError('')
  }

  const handleFile = async (file) => {
    if (!file) return
    setSaveError('')
    if (!isXlsx(file.name)) {
      setParsed(null)
      setFileName(file.name)
      setParseError('Please choose an .xlsx (or .xls) trial balance.')
      return
    }
    setFileName(file.name)
    setParseError('')
    try {
      const bytes = await readBytes(file)
      const { rows, metadata } = ingest(file.name, bytes)
      if (!Array.isArray(rows) || rows.length === 0) {
        setParsed(null)
        setParseError('No account rows were found in this spreadsheet.')
        return
      }
      setParsed({ rows, metadata })
    } catch (e) {
      setParsed(null)
      setParseError(e?.message || 'Could not parse this spreadsheet.')
    }
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer?.files?.[0])
  }

  const onConfirm = async () => {
    if (!parsed || !monthKey || !schoolId || !periodId) return
    setSaving(true)
    setSaveError('')
    try {
      const res = await monthlyApi.upload(schoolId, periodId, {
        monthKey,
        sourceName: fileName,
        rows: parsed.rows,
      })
      onSaved?.(res.data)
      reset()
    } catch (e) {
      setSaveError(apiErrorMessage(e, 'Could not save this monthly trial balance.'))
    } finally {
      setSaving(false)
    }
  }

  const willReplace = monthKey && loadedSet.has(monthKey)
  const canConfirm = !!parsed && !!monthKey && !saving

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5 rounded-2xl border border-gold/30 bg-white p-5 shadow-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg font-semibold text-navy">Upload a monthly trial balance</h3>
          <p className="mt-0.5 text-[15px] text-muted">
            A month-end, cumulative-YTD trial balance (.xlsx) — the standard QuickBooks / Blackbaud
            export.
          </p>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close upload"
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-rule/30 hover:text-navy"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <label
        htmlFor="monthly-tb-file"
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
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
          <div className="font-serif text-lg font-semibold text-navy">Drop your monthly trial balance</div>
          <p className="mt-0.5 text-[15px] text-muted">.xlsx · accounts with month-end balances</p>
        </div>
        <span className="btn-ghost mt-1 text-[14px]">Browse files</span>
        <input
          ref={inputRef}
          id="monthly-tb-file"
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
            <span className="truncate text-[15px] font-medium text-ink">{fileName}</span>
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
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-[15px] font-medium text-rose-700">
          {parseError}
        </div>
      )}

      {parsed && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-rule bg-cream/40 px-4 py-3">
              <div className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">
                Accounts parsed
              </div>
              <div className="mt-0.5 font-serif text-xl font-semibold text-navy">
                {summary?.rowCount ?? 0}
              </div>
            </div>
            <div className="rounded-xl border border-rule bg-cream/40 px-4 py-3">
              <div className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">
                Net of rows
              </div>
              <div className="mt-0.5 font-serif text-xl font-semibold text-navy">
                {fmt(summary?.total ?? 0)}
              </div>
            </div>
          </div>

          {/* REQUIRED month picker — the user PICKS the month; we do not auto-trust
              file metadata. Months already loaded are flagged "will replace". */}
          <div>
            <label
              htmlFor="monthly-tb-month"
              className="mb-1.5 flex items-center gap-1.5 text-[14px] font-semibold uppercase tracking-[0.08em] text-muted"
            >
              <CalendarRange size={14} className="text-gold" /> Which month is this?
            </label>
            <select
              id="monthly-tb-month"
              value={monthKey}
              onChange={(e) => setMonthKey(e.target.value)}
              className="w-full rounded-xl border border-rule bg-white px-3.5 py-2.5 text-[16px] text-ink focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/30"
            >
              <option value="">Select a fiscal-year month…</option>
              {fyMonths.map((m) => (
                <option key={m.monthKey} value={m.monthKey}>
                  {m.label}
                  {loadedSet.has(m.monthKey) ? '  — loaded, will replace' : ''}
                </option>
              ))}
            </select>
            {willReplace && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[14px] font-medium text-amber-700">
                <AlertTriangle size={13} /> This month is already loaded — saving will replace it.
              </p>
            )}
          </div>

          {saveError && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-[15px] font-medium text-rose-700">
              {saveError}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3">
            {onCancel && (
              <button type="button" onClick={onCancel} className="btn-ghost" disabled={saving}>
                Cancel
              </button>
            )}
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={onConfirm}
              disabled={!canConfirm}
              className="btn-primary inline-flex items-center gap-2 disabled:opacity-60"
            >
              {saving ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <CheckCircle2 size={15} /> {willReplace ? 'Replace month' : 'Save month'}
                </>
              )}
            </motion.button>
          </div>
        </>
      )}
    </motion.div>
  )
}
