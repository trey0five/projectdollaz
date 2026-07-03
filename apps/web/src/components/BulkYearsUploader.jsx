import { useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react'
import { usePersistence } from '../context/PersistenceContext.jsx'
import {
  dedupeByYear,
  expandFileToCandidates,
  partitionCandidates,
  readBytes,
} from '../lib/trendIntake.js'
import { formatShortDate } from '../lib/format.js'
import YearTimeline from './datahub/YearTimeline.jsx'

const ACCEPT = '.xlsx,.xls,.csv'

// FY options for an undated file's manual year picker (never guessed silently).
function yearOptions() {
  const now = new Date().getFullYear()
  const out = []
  for (let y = now + 1; y >= now - 15; y -= 1) out.push(y)
  return out
}

/**
 * Bulk "Add years" uploader — one file (or one workbook sheet) per year, filed
 * as role cy so each becomes its own saved period → an annual trend point. Does
 * NOT mount AppProvider (it drives PersistenceContext.savePeriods directly), so
 * the single-mode autosave debounce can never fire mid-bulk.
 */
export default function BulkYearsUploader({ canEdit, onOpenMonthly }) {
  const persistence = usePersistence()
  const reduce = useReducedMotion()
  const inputRef = useRef(null)
  const depth = useRef(0)

  const [candidates, setCandidates] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const [reading, setReading] = useState(false)
  const [phase, setPhase] = useState('idle') // idle | saving | done
  const [progress, setProgress] = useState(null) // { index, total, payload }
  const [summary, setSummary] = useState(null) // { saved, failed, blocked, total }

  const { annual, monthly, undated, errors } = useMemo(
    () => partitionCandidates(candidates),
    [candidates],
  )
  const savable = useMemo(
    () => annual.filter((c) => c.status === 'ready' && !c.duplicate),
    [annual],
  )
  const YEAR_OPTIONS = useMemo(() => yearOptions(), [])
  const saving = phase === 'saving'

  // ── File intake ───────────────────────────────────────────────────────────
  const addFiles = async (fileList) => {
    const list = Array.from(fileList || [])
    if (!list.length) return
    setReading(true)
    setSummary(null)
    setPhase('idle')
    const expanded = await Promise.all(
      list.map(async (f) => {
        try {
          const bytes = await readBytes(f)
          return await expandFileToCandidates(f.name, bytes)
        } catch (e) {
          return [
            {
              key: `err_${f.name}_${Date.now()}`,
              sourceName: f.name,
              sheet: null,
              rows: [],
              metadata: {},
              periodEndDate: null,
              periodType: 'fy',
              year: null,
              isMonthly: false,
              accountCount: 0,
              balanced: false,
              imbalance: 0,
              status: 'error',
              error: e?.message || 'Could not read this file.',
            },
          ]
        }
      }),
    )
    setCandidates((prev) => dedupeByYear([...prev, ...expanded.flat()]))
    setReading(false)
  }

  const onBrowse = (e) => {
    if (e.target.files?.length) addFiles(e.target.files)
    e.target.value = ''
  }
  const onDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    depth.current = 0
    setDragOver(false)
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files)
  }

  // ── Per-candidate edits ─────────────────────────────────────────────────────
  const setEndDate = (key, iso) => {
    setCandidates((prev) =>
      dedupeByYear(
        prev.map((c) => {
          if (c.key !== key) return c
          const periodEndDate = iso || null
          const year = periodEndDate
            ? Number(periodEndDate.slice(0, 4))
            : c.metadata?.fiscalYear ?? null
          const periodType = periodEndDate && /-06-30$/.test(periodEndDate) ? 'fy' : 'ytd'
          return { ...c, periodEndDate, year, periodType }
        }),
      ),
    )
  }
  const setUndatedYear = (key, yearStr) => {
    const year = parseInt(yearStr, 10)
    if (!year) return
    setCandidates((prev) =>
      dedupeByYear(
        prev.map((c) =>
          c.key === key
            ? { ...c, periodEndDate: `${year}-06-30`, periodType: 'fy', year }
            : c,
        ),
      ),
    )
  }
  // Re-dedupe after removal: if the removed candidate was the winner of a shared
  // end-date, the survivor must lose its `duplicate:true` flag or it would be
  // silently dropped from the save.
  const removeCandidate = (key) =>
    setCandidates((prev) => dedupeByYear(prev.filter((c) => c.key !== key)))

  // ── Save ────────────────────────────────────────────────────────────────────
  const runSave = async (targets) => {
    const ordered = [...targets].sort((a, b) =>
      (a.periodEndDate || '') < (b.periodEndDate || '')
        ? -1
        : (a.periodEndDate || '') > (b.periodEndDate || '')
          ? 1
          : 0,
    )
    if (ordered.length === 0) return
    const payloads = ordered.map((c) => ({
      __key: c.key,
      periodEndDate: c.periodEndDate,
      periodType: c.periodType,
      label: undefined,
      imports: [
        {
          role: 'cy',
          sourceName: `${c.sourceName}${c.sheet ? ` — ${c.sheet}` : ''}`,
          rows: c.rows,
          metadata: c.metadata || {},
        },
      ],
    }))

    setPhase('saving')
    setSummary(null)
    const { saved, failed, blocked } = await persistence.savePeriods(payloads, {
      onProgress: ({ index, total, payload }) => {
        setProgress({ index, total, payload })
        setCandidates((prev) =>
          prev.map((c) => (c.key === payload.__key ? { ...c, status: 'saving' } : c)),
        )
      },
    })

    const savedKeys = new Set(saved.map((s) => s.payload.__key))
    const failedKeys = new Set(failed.map((f) => f.payload.__key))
    setCandidates((prev) =>
      prev.map((c) => {
        if (savedKeys.has(c.key)) return { ...c, status: 'saved' }
        if (failedKeys.has(c.key)) return { ...c, status: 'failed' }
        // A candidate left mid-flight (a 402 blocked the batch) reverts to ready.
        if (c.status === 'saving') return { ...c, status: 'ready' }
        return c
      }),
    )
    setProgress(null)
    setPhase('done')
    setSummary({
      saved: saved.length,
      failed: failed.length,
      blocked: !!blocked,
      total: payloads.length,
    })
  }

  const handleSave = () => runSave(savable)
  const handleRetry = () => runSave(annual.filter((c) => c.status === 'failed'))

  const hasReviewable = annual.length > 0 || undated.length > 0 || errors.length > 0
  const monthlyOnly = annual.length === 0 && monthly.length > 0

  return (
    <div className="space-y-5">
      {/* ── Dropzone ── */}
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
        role="button"
        tabIndex={0}
        aria-label="Drop one trial balance per year, or press Enter to browse"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDrop={onDrop}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onDragEnter={(e) => {
          e.preventDefault()
          depth.current += 1
          setDragOver(true)
        }}
        onDragLeave={() => {
          depth.current = Math.max(0, depth.current - 1)
          if (depth.current === 0) setDragOver(false)
        }}
        className={`group flex cursor-pointer flex-col items-center gap-4 rounded-2xl border-2 border-dashed px-5 py-9 text-center outline-none transition-all focus-visible:border-gold focus-visible:shadow-glow ${
          dragOver ? 'border-gold bg-[#fff8e6] shadow-glow' : 'border-gold/60 bg-section hover:border-gold hover:shadow-glow'
        }`}
      >
        <motion.span
          className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-glow"
          animate={reduce ? undefined : { y: [0, -8, 0] }}
          transition={reduce ? undefined : { duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <UploadCloud size={30} />
        </motion.span>
        <div>
          <h3 className="font-serif text-lg font-semibold text-navy sm:text-xl">
            Drop one file per year — or a workbook with a sheet per year
          </h3>
          <p className="mx-auto mt-1.5 max-w-lg font-serif text-[15px] italic text-muted">
            We&rsquo;ll detect each year, save it, and light up your trend. Accepts .xlsx, .xls, and
            .csv.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={(e) => {
            e.stopPropagation()
            inputRef.current?.click()
          }}
        >
          Browse files
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={onBrowse}
        />
      </motion.div>

      {reading && (
        <p className="flex items-center gap-2 text-[15px] italic text-muted">
          <Loader2 size={14} className="animate-spin text-gold" /> Reading your files…
        </p>
      )}

      {/* ── Monthly-only redirect ── */}
      {monthlyOnly && (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-l-4 border-[#e8c96a] border-l-gold bg-[#fff8e6] px-4 py-3 text-[15px] text-[#7a5e00] sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-start gap-2">
            <CalendarClock size={16} className="mt-0.5 shrink-0" />
            This looks like a month-by-month workbook — those belong under Monthly numbers.
          </span>
          {onOpenMonthly && (
            <button
              type="button"
              onClick={onOpenMonthly}
              className="shrink-0 rounded-lg border border-gold/60 bg-white px-3 py-1.5 text-[14px] font-semibold text-navy transition-colors hover:bg-gold/10"
            >
              Open Monthly numbers
            </button>
          )}
        </div>
      )}

      {/* ── Mixed workbook: some sheets are monthly and were skipped ── */}
      {!monthlyOnly && monthly.length > 0 && (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-l-4 border-[#e8c96a] border-l-gold bg-[#fff8e6] px-4 py-2.5 text-[14px] text-[#7a5e00] sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-start gap-2">
            <CalendarClock size={15} className="mt-0.5 shrink-0" />
            {monthly.length} sheet{monthly.length === 1 ? '' : 's'} look monthly and{' '}
            {monthly.length === 1 ? 'was' : 'were'} skipped — those belong under Monthly numbers.
          </span>
          {onOpenMonthly && (
            <button
              type="button"
              onClick={onOpenMonthly}
              className="shrink-0 rounded-lg border border-gold/60 bg-white px-3 py-1 text-[13px] font-semibold text-navy transition-colors hover:bg-gold/10"
            >
              Open Monthly numbers
            </button>
          )}
        </div>
      )}

      {/* ── Timeline (annual set) ── */}
      {annual.length > 0 && (
        <div className="rounded-2xl border-2 border-gold/20 bg-white p-4 shadow-card">
          <p className="mb-3 flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.1em] text-gold">
            <Sparkles size={13} /> Your year-over-year trend
          </p>
          <YearTimeline
            annual={annual}
            canEdit={canEdit}
            onSetEndDate={setEndDate}
            onRemove={removeCandidate}
          />
        </div>
      )}

      {/* ── Undated files: manual year picker ── */}
      {undated.length > 0 && (
        <div className="rounded-xl border border-l-4 border-[#e8c96a] border-l-gold bg-[#fff8e6] px-4 py-3">
          <p className="mb-2 flex items-center gap-1.5 text-[14px] font-semibold text-[#7a5e00]">
            <AlertTriangle size={14} /> We couldn&rsquo;t detect the year
          </p>
          <div className="space-y-2">
            {undated.map((c) => (
              <div
                key={c.key}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/70 px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-1.5 text-[14px] text-navy">
                  <FileSpreadsheet size={13} className="shrink-0 text-navy/60" />
                  <span className="truncate">
                    {c.sourceName}
                    {c.sheet ? ` — ${c.sheet}` : ''}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <select
                    aria-label="Pick the fiscal year"
                    defaultValue=""
                    onChange={(e) => setUndatedYear(c.key, e.target.value)}
                    className="rounded-md border border-gold/40 bg-white px-2 py-1 text-[14px] font-semibold text-navy outline-none ring-gold/40 focus-visible:ring-2"
                  >
                    <option value="" disabled>
                      Set year…
                    </option>
                    {YEAR_OPTIONS.map((y) => (
                      <option key={y} value={y}>
                        FY{y}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label={`Remove ${c.sourceName}`}
                    onClick={() => removeCandidate(c.key)}
                    className="rounded-md p-1 text-muted transition-colors hover:bg-section hover:text-danger"
                  >
                    <X size={15} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Parse errors ── */}
      {errors.length > 0 && (
        <div className="space-y-2">
          {errors.map((c) => (
            <div
              key={c.key}
              className="flex items-center justify-between gap-2 rounded-lg border border-[#e0a0a0] bg-[#fdeeee] px-3 py-2 text-[14px] text-danger"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <AlertTriangle size={14} className="shrink-0" />
                <span className="truncate">
                  {c.sourceName}: {c.error}
                </span>
              </span>
              <button
                type="button"
                aria-label={`Remove ${c.sourceName}`}
                onClick={() => removeCandidate(c.key)}
                className="rounded-md p-1 text-danger transition-colors hover:bg-white"
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Progress bar ── */}
      <AnimatePresence>
        {saving && progress && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-xl border border-gold/30 bg-white p-3.5 shadow-card"
          >
            <p className="mb-2 flex items-center gap-1.5 text-[14px] font-semibold text-navy">
              <Loader2 size={13} className="animate-spin text-gold" />
              Saving year {progress.index + 1} of {progress.total} —{' '}
              {formatShortDate(progress.payload?.periodEndDate)}…
            </p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-section">
              <motion.div
                className="h-full rounded-full bg-gold-gradient"
                initial={false}
                animate={{ width: `${((progress.index + 1) / progress.total) * 100}%` }}
                transition={{ type: 'spring', stiffness: 120, damping: 20 }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Result summary ── */}
      {phase === 'done' && summary && (
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
          className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-[15px] ${
            summary.blocked
              ? 'border-[#e0a0a0] bg-[#fdeeee] text-danger'
              : summary.failed
                ? 'border-gold/40 bg-[#fff8e6] text-[#7a5e00]'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          <span className="flex items-center gap-2 font-semibold">
            {summary.blocked ? (
              <>
                <AlertTriangle size={16} /> Your trial has ended — subscribe to save statements.
              </>
            ) : summary.failed ? (
              <>
                <AlertTriangle size={16} /> Saved {summary.saved} of {summary.total}.
              </>
            ) : (
              <>
                <CheckCircle2 size={16} /> Added {summary.saved} year
                {summary.saved === 1 ? '' : 's'} — your year-over-year trend is now live.
              </>
            )}
          </span>
          {summary.failed > 0 && !summary.blocked && (
            <button
              type="button"
              onClick={handleRetry}
              className="shrink-0 rounded-lg border border-gold/60 bg-white px-3 py-1.5 text-[14px] font-semibold text-navy transition-colors hover:bg-gold/10"
            >
              Retry failed
            </button>
          )}
        </motion.div>
      )}

      {/* ── Save action ── */}
      {canEdit && hasReviewable && (
        <div className="flex items-center justify-end gap-3 border-t border-rule/60 pt-4">
          {savable.length > 0 && (
            <span className="text-[14px] text-muted">
              {savable.length} year{savable.length === 1 ? '' : 's'} ready
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || savable.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-gold-gradient px-5 py-2.5 text-[15px] font-bold uppercase tracking-[0.06em] text-navy shadow-glow transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Sparkles size={16} /> Save {savable.length || ''} year
                {savable.length === 1 ? '' : 's'} &amp; build trend
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
