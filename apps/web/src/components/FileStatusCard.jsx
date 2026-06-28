import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  AlertOctagon,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  FileSpreadsheet,
  History,
  Loader2,
  X,
} from 'lucide-react'
import { findUnmapped, DEFAULT_CHART } from '@finrep/engine'
import { useApp } from '../context/AppContext.jsx'
import { formatShortDate } from '../lib/format.js'
import RoleChip from './RoleChip.jsx'
import CountUp from './CountUp.jsx'
import MappingCategorySelect from './MappingCategorySelect.jsx'

// Stable empty Set so a missing mappingAccts (e.g. the read-only
// ReportViewProvider mount, which does NOT expose the mapping API) never
// throws on .has() and never churns identity between renders.
const EMPTY_SET = new Set()

/** One status card per imported file. */
export default function FileStatusCard({ file, needsReview, onOverride }) {
  // activeChart / mapAccount / mappingAccts come from the live AppProvider's
  // FROZEN mapping API; default-guard them for the read-only ReportViewProvider.
  const {
    setFileRole,
    removeFile,
    canEdit,
    mapAccount = () => {},
    activeChart = DEFAULT_CHART,
    mappingAccts = EMPTY_SET,
  } = useApp()
  const reduce = useReducedMotion()
  const [showReview, setShowReview] = useState(false)
  // The actual accounts behind the "N to review" flag: income-statement accounts
  // (acct ≥ 400) with a balance that aren't in the active chart yet, so they're
  // currently left OUT of the statements until categorized. Derived from the LIVE
  // activeChart (default chart + this session's category overlay), so a freshly
  // categorized account drops out immediately — this no longer matches the
  // stale parse-time file.unmappedCount.
  const unmapped = useMemo(
    () => findUnmapped(file.rows || [], activeChart),
    [file.rows, activeChart],
  )
  const reviewCount = unmapped.length

  // Once the last flagged account is categorized, show the all-done flourish for a
  // beat, then auto-collapse the panel so the card returns to its normal height —
  // otherwise the categorized card stays expanded and the slot cards go asymmetric.
  useEffect(() => {
    if (!showReview || reviewCount !== 0) return undefined
    const t = window.setTimeout(() => setShowReview(false), 2600)
    return () => window.clearTimeout(t)
  }, [showReview, reviewCount])

  const { id, fileName, status } = file
  const fromHistory = !!file.fromHistory
  const ring =
    status === 'error'
      ? 'border-[#e0a0a0]'
      : needsReview
        ? 'border-gold shadow-glow'
        : 'border-border'

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.26, ease: [0.22, 0.8, 0.2, 1] }}
      className={`relative flex w-full flex-col gap-3 rounded-2xl border-2 bg-white p-4 shadow-card ${ring}`}
    >
      {/* header */}
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-section text-navy">
          <FileSpreadsheet size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-navy" title={fileName}>
            {fileName}
          </p>
          {status === 'parsing' && (
            <p className="mt-0.5 flex items-center gap-1.5 text-[14px] italic text-muted">
              <Loader2 size={12} className="animate-spin" /> Parsing…
            </p>
          )}
          {status === 'error' && (
            <p className="mt-0.5 text-[14px] text-danger">{file.error}</p>
          )}
        </div>
        {canEdit && !fromHistory && (
          <button
            type="button"
            aria-label={`Remove ${fileName}`}
            onClick={() => removeFile(id)}
            className="rounded-md p-1 text-muted transition-colors hover:bg-section hover:text-danger"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* "from saved history" indicator for an auto-loaded comparative slot. */}
      {fromHistory && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-gold/10 px-3 py-2 text-[14px] font-medium text-[#7a5e00]">
          <span className="inline-flex items-center gap-1.5">
            <History size={13} className="text-gold" /> From saved history
            {file.historyPeriodLabel ? ` · ${file.historyPeriodLabel}` : ''}
          </span>
          {canEdit && onOverride && (
            <button
              type="button"
              onClick={onOverride}
              className="font-semibold text-gold hover:underline"
            >
              Upload to override
            </button>
          )}
        </div>
      )}

      {/* parsing skeleton */}
      {status === 'parsing' && (
        <div className="space-y-2">
          <div className="shimmer-bar h-3.5 w-2/3" />
          <div className="shimmer-bar h-3.5 w-1/2" />
        </div>
      )}

      {/* ready body */}
      {status === 'ready' && (
        <>
          {/* Metric chips: clean 2-column grid on phones, inline wrap at sm+. */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <span className="inline-flex w-full items-center justify-center rounded-full bg-section px-2.5 py-1 text-[14px] font-semibold text-navy sm:w-auto sm:justify-start">
              <CountUp value={file.rows.length} />&nbsp;accounts
            </span>

            <span className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-section px-2.5 py-1 text-[14px] text-muted sm:w-auto sm:justify-start">
              <CalendarDays size={12} className="text-gold" />
              {formatShortDate(file.metadata?.periodEndDate)}
            </span>

            {file.balance?.balanced ? (
              <motion.span
                initial={reduce ? false : { scale: 1.35, rotate: -8, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 320, damping: 16 }}
                className="inline-flex w-full items-center justify-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[14px] font-semibold text-emerald-700 sm:w-auto sm:justify-start"
              >
                <CheckCircle2 size={13} /> Balanced
              </motion.span>
            ) : (
              <span className="inline-flex w-full items-center justify-center gap-1 rounded-full bg-[#fdeeee] px-2.5 py-1 text-[14px] font-semibold text-danger sm:w-auto sm:justify-start">
                <AlertOctagon size={13} /> Out of balance
              </span>
            )}

            <AnimatePresence initial={false}>
              {reviewCount > 0 && (
                <motion.button
                  key="review-badge"
                  type="button"
                  layout={!reduce}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
                  animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.22, ease: [0.22, 0.8, 0.2, 1] }}
                  onClick={() => setShowReview((s) => !s)}
                  aria-expanded={showReview}
                  title="Show the accounts that need review"
                  className="inline-flex w-full items-center justify-center gap-1 rounded-full bg-[#fff8e6] px-2.5 py-1 text-[14px] font-semibold text-[#7a5e00] transition-colors hover:bg-[#fdeec2] sm:w-auto sm:justify-start"
                >
                  <AlertTriangle size={12} />{' '}
                  <span aria-live="polite">
                    <CountUp value={reviewCount} />
                    &nbsp;to review
                  </span>
                  <ChevronDown
                    size={13}
                    className={`transition-transform ${showReview ? 'rotate-180' : ''}`}
                  />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* Expandable "to review" detail: assign a category per unrecognized
              account. Picking persists via context.mapAccount (PATCH /mapping)
              AND drops the row out of the live activeChart-derived list. The
              panel stays mounted while showReview is on so the all-done success
              line can play even after the last row exits; it unmounts when the
              user collapses it. */}
          <AnimatePresence initial={false}>
            {showReview && (
              <motion.div
                initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                className="overflow-hidden rounded-xl border border-l-4 border-[#e8c96a] border-l-gold bg-[#fff8e6] px-3.5 py-3"
              >
                {reviewCount > 0 && (
                  <p className="text-[13px] leading-relaxed text-[#7a5e00]">
                    These accounts aren&rsquo;t in the standard chart yet, so they&rsquo;re{' '}
                    <span className="font-semibold">left out of your statements</span> until they&rsquo;re
                    categorized. Assign each a category to flow it in live:
                  </p>
                )}

                <div className="mt-1 divide-y divide-[#efdfa8]">
                  <AnimatePresence initial={false}>
                    {unmapped.map((r) => (
                      <motion.div
                        key={r.acct}
                        layout={!reduce}
                        initial={reduce ? { opacity: 0 } : { opacity: 0, x: -8 }}
                        animate={reduce ? { opacity: 1 } : { opacity: 1, x: 0 }}
                        exit={
                          reduce
                            ? { opacity: 0 }
                            : { opacity: 0, x: 12, height: 0, transition: { duration: 0.24 } }
                        }
                        transition={{ duration: 0.22, ease: [0.22, 0.8, 0.2, 1] }}
                      >
                        <MappingCategorySelect
                          row={r}
                          busy={mappingAccts.has(String(r.acct))}
                          disabled={!canEdit}
                          onPick={mapAccount}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                {/* One-shot all-done flourish once the last row has exited. */}
                {reviewCount === 0 && (
                  <motion.p
                    initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
                    animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center gap-1.5 text-[13px] font-semibold text-emerald-700"
                  >
                    <CheckCircle2 size={14} className="text-emerald-600" /> All accounts
                    categorized — they&rsquo;re now in your statements.
                  </motion.p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {needsReview && (
            <p className="flex items-center gap-1.5 text-[14px] font-medium text-[#7a5e00]">
              <AlertTriangle size={12} /> Confirm this file&rsquo;s role.
            </p>
          )}

          <div className="mt-1 flex items-center justify-between">
            <RoleChip
              role={file.role}
              confirmed={file.roleConfirmed}
              needsReview={needsReview}
              onChange={canEdit && !fromHistory ? (role) => setFileRole(id, role) : undefined}
            />
          </div>
        </>
      )}

      {/* error footer */}
      {status === 'error' && (
        <button
          type="button"
          onClick={() => removeFile(id)}
          className="self-start rounded-lg border-2 border-border px-3 py-1.5 text-[14px] font-semibold text-navy transition-colors hover:border-gold"
        >
          Remove
        </button>
      )}
    </motion.div>
  )
}
