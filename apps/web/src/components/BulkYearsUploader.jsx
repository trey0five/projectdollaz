import { useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import '../styles/pending/b2-finance.css'
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
  candidateFromColumns,
  errorCandidate,
  settleCandidates,
  pairChosen,
  candidateName as nameOf,
} from '../lib/trendIntake.js'
import { formatShortDate } from '../lib/format.js'
import { getIntakeMemory, invalidateIntakeMemory } from '../lib/intakeMemory.js'
import YearTimeline from './datahub/YearTimeline.jsx'
import ColumnPicker from './intake/ColumnPicker.jsx'

const HALF_LABEL = { pl: 'Income only', bs: 'Balance sheet only' }
const OTHER_HALF = { pl: 'Balance Sheet', bs: 'Profit and Loss' }

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
  // What KYRO remembers about this school's uploads (#32 / #41) — null = none.
  const [memory, setMemory] = useState(null)
  // The ONE open column picker, by error-candidate key (#32).
  const [pickerKey, setPickerKey] = useState(null)

  const { annual, monthly, undated, partial, errors } = useMemo(
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
    // The school's remembered layouts + numbers (any failure → null = today's read).
    const mem = await getIntakeMemory(persistence.schoolId)
    setMemory(mem)
    const expanded = await Promise.all(
      list.map(async (f) => {
        let bytes = null
        try {
          bytes = await readBytes(f)
          return await expandFileToCandidates(f.name, bytes, mem)
        } catch (e) {
          return [errorCandidate(f.name, e, bytes)]
        }
      }),
    )
    const added = expanded.flat()
    setCandidates((prev) => settleCandidates([...prev, ...added]))
    // Open the picker for the first file KYRO couldn't read but could preview.
    const firstPickable = added.find((c) => c.status === 'error' && c.failure?.canPick && c.bytes)
    if (firstPickable) setPickerKey((prev) => prev ?? firstPickable.key)
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
  const removeCandidate = (key) => {
    setCandidates((prev) => settleCandidates(prev.filter((c) => c.key !== key)))
    setPickerKey((prev) => (prev === key ? null : prev))
  }

  // "Pair with…" (#41 S-D): the person says which P&L goes with which BS.
  const pairWith = (aKey, bKey) => setCandidates((prev) => pairChosen(prev, aKey, bKey))

  // The column picker's "Use these columns" (#32): re-read in the handler and
  // replace the error candidate, then pair again (it may be a statement half).
  const applyColumns = (key, choice) => {
    const target = candidates.find((c) => c.key === key)
    if (!target?.bytes) return
    try {
      const next = candidateFromColumns(target, target.bytes, choice, memory)
      setCandidates((prev) => settleCandidates(prev.map((c) => (c.key === key ? next : c))))
      setPickerKey(null)
    } catch {
      /* the picker only enables its button on a live success */
    }
  }

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
          sourceName: nameOf(c).slice(0, 255),
          rows: c.rows,
          metadata: c.metadata || {},
        },
      ],
    }))

    setPhase('saving')
    setSummary(null)
    // A1: a QuickBooks statement export's clear accounts sort themselves ON THE
    // SAVE — ImportsService.create applies the sure, section-backed categories
    // against the school's REAL mapping (an account it already knows is never
    // re-pointed) before each year's statements are built. Nothing is PATCHed
    // from here: this browser can't see the school's stored picks, so a PATCH
    // would overwrite them. Real trial balances keep confirm-first review.
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
    // A save can add a picked layout / KYRO's numbers to the school's memory.
    invalidateIntakeMemory(persistence.schoolId)
    if (saved.length > 0) {
      window.dispatchEvent(new CustomEvent('penny:data-changed', { detail: { key: 'metrics' } }))
    }
    setSummary({
      saved: saved.length,
      failed: failed.length,
      blocked: !!blocked,
      total: payloads.length,
    })
  }

  const handleSave = () => runSave(savable)
  const handleRetry = () => runSave(annual.filter((c) => c.status === 'failed'))

  const hasReviewable =
    annual.length > 0 || undated.length > 0 || errors.length > 0 || partial.length > 0
  const pickerCand = pickerKey ? errors.find((c) => c.key === pickerKey && c.bytes && c.failure?.preview) : null
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
        data-active={dragOver ? 'true' : undefined}
        className="b2-drop gap-4 px-5 py-9"
      >
        <span className="b2-drop-icon">
          <UploadCloud size={30} aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-heading font-semibold text-ink sm:text-xl">
            Drop one file per year — or a workbook with a sheet per year
          </h3>
          <p className="mx-auto mt-1.5 max-w-lg text-small text-ink2">
            We&rsquo;ll detect each year, save it, and light up your trend. Accepts .xlsx, .xls, and
            .csv.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
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
        <p className="flex items-center gap-2 text-[15px] italic text-ink2">
          <Loader2 size={14} className="animate-spin text-ink2" /> Reading your files…
        </p>
      )}

      {/* ── Monthly-only redirect ── */}
      {monthlyOnly && (
        <div className="b2-callout" data-tone="watch">
          <div className="flex min-w-0 flex-1 flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-start gap-2">
            <CalendarClock size={16} className="mt-0.5 shrink-0 text-ink2" />
            This looks like a month-by-month workbook — those belong under Monthly numbers.
          </span>
          {onOpenMonthly && (
            <button
              type="button"
              onClick={onOpenMonthly}
              className="shrink-0 rounded-lg border border-hair/[0.3] bg-white px-3 py-1.5 text-[14px] font-semibold text-ink transition-colors hover:bg-ink/[0.04]"
            >
              Open Monthly numbers
            </button>
          )}
          </div>
        </div>
      )}

      {/* ── Mixed workbook: some sheets are monthly and were skipped ── */}
      {!monthlyOnly && monthly.length > 0 && (
        <div className="b2-callout" data-tone="watch">
          <div className="flex min-w-0 flex-1 flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-start gap-2">
            <CalendarClock size={15} className="mt-0.5 shrink-0 text-ink2" />
            {monthly.length} sheet{monthly.length === 1 ? '' : 's'} look monthly and{' '}
            {monthly.length === 1 ? 'was' : 'were'} skipped — those belong under Monthly numbers.
          </span>
          {onOpenMonthly && (
            <button
              type="button"
              onClick={onOpenMonthly}
              className="shrink-0 rounded-lg border border-hair/[0.3] bg-white px-3 py-1 text-[13px] font-semibold text-ink transition-colors hover:bg-ink/[0.04]"
            >
              Open Monthly numbers
            </button>
          )}
          </div>
        </div>
      )}

      {/* ── Timeline (annual set) ── */}
      {annual.length > 0 && (
        <div className="panel p-4">
          <p className="mb-3 flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.1em] text-ink2">
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

      {/* ── Half a trial balance (#41 S-D): never saved as a year ── */}
      {partial.length > 0 && (
        <div className="b2-callout" data-tone="watch" data-testid="bulk-partials">
          <div className="min-w-0 flex-1">
            <p className="mb-1 flex items-center gap-1.5 text-[14px] font-semibold text-ink">
              <AlertTriangle size={14} className="text-ink2" /> Half a trial balance — not added yet
            </p>
            <div className="divide-y divide-hair/[0.1]">
              {partial.map((c) => {
                const partners = partial.filter((o) => o.key !== c.key && o.partial && o.partial !== c.partial)
                return (
                  <div key={c.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="flex min-w-0 flex-1 basis-[14rem] flex-col text-[14px] text-ink">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <FileSpreadsheet size={13} className="shrink-0 text-ink2" />
                        <span className="truncate">{nameOf(c)}</span>
                      </span>
                      <span className="text-[12.5px] text-ink2">
                        {HALF_LABEL[c.partial]}
                        {c.periodEndDate ? ` · ${formatShortDate(c.periodEndDate)}` : ''}
                      </span>
                      {c.noTie && (
                        <span className="text-[12.5px] font-medium text-[rgb(var(--c-risk))]" data-testid="bulk-no-tie">
                          {c.noTie.gap.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} apart from{' '}
                          {c.noTie.partnerName}, so they can’t be combined — check both are for the same company,
                          period and accounting basis.
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      {partners.length > 0 ? (
                        <select
                          aria-label={`Pair ${nameOf(c)} with`}
                          defaultValue=""
                          onChange={(e) => e.target.value && pairWith(c.key, e.target.value)}
                          className="max-w-[16rem] rounded-md border border-hair bg-white px-2 py-1 text-[13.5px] font-semibold text-ink outline-none ring-[#2563EB]/40 focus-visible:ring-2"
                        >
                          <option value="" disabled>
                            Pair with…
                          </option>
                          {partners.map((o) => (
                            <option key={o.key} value={o.key}>
                              {nameOf(o)}
                              {o.periodEndDate ? ` (${formatShortDate(o.periodEndDate)})` : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[13px] text-ink2">
                          Add its {OTHER_HALF[c.partial]} to save this year.
                        </span>
                      )}
                      <button
                        type="button"
                        aria-label={`Remove ${nameOf(c)}`}
                        onClick={() => removeCandidate(c.key)}
                        className="rounded-md p-1 text-ink2 transition-colors hover:bg-ground hover:text-[rgb(var(--c-risk))]"
                      >
                        <X size={15} />
                      </button>
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Undated files: manual year picker ── */}
      {undated.length > 0 && (
        <div className="b2-callout" data-tone="watch">
          <div className="min-w-0 flex-1">
          <p className="mb-2 flex items-center gap-1.5 text-[14px] font-semibold text-ink">
            <AlertTriangle size={14} className="text-ink2" /> We couldn&rsquo;t detect the year
          </p>
          <div className="divide-y divide-hair/[0.1]">
            {undated.map((c) => (
              <div
                key={c.key}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span className="flex min-w-0 items-center gap-1.5 text-[14px] text-ink">
                  <FileSpreadsheet size={13} className="shrink-0 text-ink2" />
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
                    className="rounded-md border border-hair bg-white px-2 py-1 text-[14px] font-semibold text-ink outline-none ring-[#2563EB]/40 focus-visible:ring-2"
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
                    className="rounded-md p-1 text-ink2 transition-colors hover:bg-ground hover:text-[rgb(var(--c-risk))]"
                  >
                    <X size={15} />
                  </button>
                </span>
              </div>
            ))}
          </div>
          </div>
        </div>
      )}

      {/* ── Parse errors ── */}
      {errors.length > 0 && (
        <div className="space-y-2">
          {errors.map((c) => (
            <div
              key={c.key}
              className="b2-callout"
              data-tone="risk"
            >
              <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-2 text-[14px]">
              <span className="flex min-w-0 flex-1 basis-[16rem] items-start gap-1.5">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-ink2" />
                <span className="min-w-0">
                  <span className="font-semibold">{c.sourceName}</span>
                  {': '}
                  {c.failure ? (
                    <>
                      {c.failure.reason}
                      {c.failure.ask && <span className="font-semibold"> {c.failure.ask}</span>}
                    </>
                  ) : (
                    c.error
                  )}
                </span>
              </span>
              {canEdit && c.failure?.canPick && c.bytes && pickerKey !== c.key && (
                <button
                  type="button"
                  onClick={() => setPickerKey(c.key)}
                  className="btn btn-primary btn-sm shrink-0"
                >
                  Pick the columns
                </button>
              )}
              <button
                type="button"
                aria-label={`Remove ${c.sourceName}`}
                onClick={() => removeCandidate(c.key)}
                className="rounded-md p-1 text-ink2 transition-colors hover:bg-ground hover:text-[rgb(var(--c-risk))]"
              >
                <X size={15} />
              </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── The column picker (#32): one at a time, under the errors ── */}
      {canEdit && pickerCand && (
        <ColumnPicker
          key={pickerCand.key}
          fileName={pickerCand.sourceName}
          bytes={pickerCand.bytes}
          preview={pickerCand.failure.preview}
          initial={pickerCand.failure.preview.guess}
          memory={memory}
          onApply={(choice) => applyColumns(pickerCand.key, choice)}
          onCancel={() => setPickerKey(null)}
        />
      )}

      {/* ── Progress bar ── */}
      <AnimatePresence>
        {saving && progress && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-[8px] border border-hair bg-white p-3.5 "
          >
            <p className="mb-2 flex items-center gap-1.5 text-[14px] font-semibold text-ink">
              <Loader2 size={13} className="animate-spin text-ink2" />
              Saving year {progress.index + 1} of {progress.total} —{' '}
              {formatShortDate(progress.payload?.periodEndDate)}…
            </p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-ground">
              <motion.div
                className="h-full rounded-full bg-[#2563EB]"
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
          className="b2-callout"
          data-tone={summary.blocked ? 'risk' : summary.failed ? 'watch' : 'good'}
        >
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 text-[15px]">
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
              className="shrink-0 rounded-lg border border-hair/[0.3] bg-white px-3 py-1.5 text-[14px] font-semibold text-ink transition-colors hover:bg-ink/[0.04]"
            >
              Retry failed
            </button>
          )}
          </div>
        </motion.div>
      )}

      {/* ── Save action ── */}
      {canEdit && hasReviewable && (
        <div className="flex items-center justify-end gap-3 border-t border-hair pt-4">
          {savable.length > 0 && (
            <span className="text-[14px] text-ink2">
              {savable.length} year{savable.length === 1 ? '' : 's'} ready
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || savable.length === 0}
            className="inline-flex items-center gap-2 rounded-lg btn btn-primary px-5 py-2.5 text-[15px] font-bold uppercase tracking-[0.06em] transition-transform disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
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
