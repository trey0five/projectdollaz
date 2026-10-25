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
import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Panel, StatStrip, Stat, Button } from '../ui/surface/index.js'
import '../../styles/pending/b2-finance.css'
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
import { getIntakeMemory } from '../../lib/intakeMemory.js'
import { failureFromError, failureText } from '../../lib/ingestFailure.js'
import { fyMonthKeys } from '../../lib/monthlyShapes.js'
import { asTableFile } from '../../lib/pdfTable.js'

// The signed net of the parsed rows as an accounting dollar figure ($0.00 when
// the rows net to zero — a balanced trial balance), never a bare number.
function netOfRows(n) {
  const v = Number(n) || 0
  const s = `$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return v < 0 ? `(${s})` : s
}

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
  /** A file handed over by the Finance upload sorter (#43): read it on mount. */
  initialFile = null,
  onSaved,
  onCancel,
}) {
  const reduce = useReducedMotion()
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
    // #52 — a PDF is rebuilt into its table by the API (an .xlsx from here on).
    try {
      file = await asTableFile(schoolId, file)
    } catch (e) {
      setFileName(file.name)
      setParseError(e?.response?.data?.message || 'Couldn’t read a table out of this PDF.')
      return
    }
    if (!isXlsx(file.name)) {
      setParsed(null)
      setFileName(file.name)
      setParseError('Please choose an .xlsx, .xls or PDF trial balance.')
      return
    }
    setFileName(file.name)
    setParseError('')
    try {
      const bytes = await readBytes(file)
      // #32: the school's remembered layouts help a monthly file too (no
      // picker here — a file that still can't be read says why, plainly).
      const memory = await getIntakeMemory(schoolId)
      const { rows, metadata } = ingest(file.name, bytes, { memory })
      if (!Array.isArray(rows) || rows.length === 0) {
        setParsed(null)
        setParseError('No account rows were found in this spreadsheet.')
        return
      }
      setParsed({ rows, metadata })
    } catch (e) {
      setParsed(null)
      setParseError(failureText(failureFromError(e)) || 'Could not parse this spreadsheet.')
    }
  }

  useEffect(() => {
    if (initialFile) queueMicrotask(() => void handleFile(initialFile))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // Premium UI P4: the upload is an action, so it is the one Panel here — the
  // dashed dropzone at 8px inside it, the parsed summary a compact StatStrip,
  // the month a native select, the actions on the Panel's hairline foot.
  return (
    <motion.div initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Panel
        title="Upload a monthly trial balance"
        actions={
          onCancel ? (
            <Button variant="quiet" size="sm" onClick={onCancel} aria-label="Close upload" icon={<X size={16} />} />
          ) : null
        }
        footer={
          parsed ? (
            <>
              {onCancel && (
                <Button variant="quiet" onClick={onCancel} disabled={saving}>
                  Cancel
                </Button>
              )}
              <Button
                variant="primary"
                onClick={onConfirm}
                disabled={!canConfirm}
                icon={saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              >
                {saving ? 'Saving…' : willReplace ? 'Replace month' : 'Save month'}
              </Button>
            </>
          ) : null
        }
      >
        <div className="space-y-5">
          <p className="text-small text-ink2">
            A month-end, cumulative-YTD trial balance (.xlsx) — the standard QuickBooks / Blackbaud export.
          </p>

          <label
            htmlFor="monthly-tb-file"
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            data-active={dragging ? 'true' : undefined}
            className="b2-drop py-9"
          >
            <span className="b2-drop-icon">
              <UploadCloud size={28} aria-hidden="true" />
            </span>
            <div>
              <div className="text-heading font-semibold text-ink">Drop your monthly trial balance</div>
              <p className="mt-0.5 text-small text-ink2">.xlsx · accounts with month-end balances</p>
            </div>
            <span className="btn btn-secondary btn-sm mt-1">Browse files</span>
            <input
              ref={inputRef}
              id="monthly-tb-file"
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
            <p className="b2-callout b2-risk" role="alert">
              {parseError}
            </p>
          )}

          {parsed && (
            <>
              <StatStrip cols={2} className="stats-compact">
                <Stat label="Accounts parsed" value={summary?.rowCount ?? 0} />
                <Stat label="Net of rows" value={netOfRows(summary?.total)} />
              </StatStrip>

              {/* REQUIRED month picker — the user PICKS the month; we do not auto-trust
                  file metadata. Months already loaded are flagged "will replace". */}
              <div>
                <label htmlFor="monthly-tb-month" className="b2-label flex items-center gap-1.5">
                  <CalendarRange size={13} aria-hidden="true" /> Which month is this?
                </label>
                <select
                  id="monthly-tb-month"
                  value={monthKey}
                  onChange={(e) => setMonthKey(e.target.value)}
                  className="sel h-9 w-full !max-w-md"
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
                  <p className="b2-callout b2-watch mt-2">
                    <AlertTriangle size={13} aria-hidden="true" /> This month is already loaded — saving will replace it.
                  </p>
                )}
              </div>

              {saveError && (
                <p className="b2-callout b2-risk" role="alert">
                  {saveError}
                </p>
              )}
            </>
          )}
        </div>
      </Panel>
    </motion.div>
  )
}
