import { useMemo } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  FileSpreadsheet,
  History,
  Loader2,
  X,
} from 'lucide-react'
import { findUnmapped, DEFAULT_CHART } from '@finrep/engine'
import { useApp } from '../context/AppContext.jsx'
import { formatShortDate } from '../lib/format.js'
import { balancePill } from '../lib/statementNotes.js'
import { reviewButtonLabel } from '../lib/reviewQueue.js'
import { openReviewModal } from '../lib/reviewModalStore.js'
import { AuroraLightButton } from './ui/aurora/index.js'
import RoleChip from './RoleChip.jsx'
import StatementNotes from './intake/StatementNotes.jsx'
import CountUp from './CountUp.jsx'

// Stable empty Set so a missing context value (e.g. the read-only
// ReportViewProvider mount, which does NOT expose the mapping API) never
// throws on .has() and never churns identity between renders.
const EMPTY_SET = new Set()

// The review button's amber (the Aurora watch hue).
const WATCH_HUE = '#d97706'

/** One status card per imported file. */
export default function FileStatusCard({ file, needsReview, onOverride }) {
  // activeChart comes from the live AppProvider; default-guard it for the
  // read-only ReportViewProvider.
  const {
    setFileRole,
    removeFile,
    canEdit,
    activeChart = DEFAULT_CHART,
    // Accounts the saved snapshot shows the server already places (A4).
    serverMappedAccts = EMPTY_SET,
    // #32 / #40 actions — absent on the read-only report mount.
    openColumnPicker = null,
    combineFiles = null,
    renumberAccount = null,
    loadFilesForRole = null,
    schoolId = null,
    byRole = null,
  } = useApp()
  // The slot this card actually OCCUPIES (resolveRoles), which is where its
  // other statement half must go — never the nearest empty box.
  const slotRole = ['cy', 'py', 'audit'].find((r) => byRole?.[r]?.id === file.id) ?? null
  const reduce = useReducedMotion()
  // The accounts behind "Review N accounts": accounts with a balance that the
  // active chart can't place yet, so they're currently left OUT of the
  // statements until somebody says what they are. Derived from the LIVE
  // activeChart (default chart + this session's picks), so a freshly sorted
  // account drops out immediately. Accounts the saved snapshot shows the
  // SERVER already places are not asked about again (GET /mapping returns no
  // entries, so after a reload this browser alone would re-flag them).
  const unmapped = useMemo(
    () =>
      findUnmapped(file.rows || [], activeChart).filter(
        (r) => !serverMappedAccts.has(String(r.acct)),
      ),
    [file.rows, activeChart, serverMappedAccts],
  )
  const reviewCount = unmapped.length

  // A5: the review happens in ONE popup (ReviewAccountsHost, mounted once in
  // the intake) — this card, the Add-data callout and the Finance band all
  // open the same one. Grouped, full names, suggestions pre-filled, one save.
  const openReview = () => openReviewModal(schoolId)

  const { id, fileName, status } = file
  const fromHistory = !!file.fromHistory
  const pill = balancePill(file)
  // A ruled column, not a card-in-panel: the 2px top rule carries the state
  // (risk = parse error, watch = accounts to review, hairline = fine).
  const ring =
    status === 'error'
      ? 'border-[rgb(var(--c-risk))]'
      : needsReview
        ? 'border-[rgb(var(--c-watch))]'
        : 'border-hair'

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.26, ease: [0.22, 0.8, 0.2, 1] }}
      className={`relative flex w-full flex-col gap-3 border-t-2 pt-3 ${ring}`}
    >
      {/* header */}
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex shrink-0 text-ink2">
          <FileSpreadsheet size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink" title={fileName}>
            {fileName}
          </p>
          {status === 'parsing' && (
            <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] italic text-ink2">
              <Loader2 size={12} className="animate-spin" /> Parsing…
            </p>
          )}
          {status === 'error' &&
            (file.failure ? (
              // #32: WHY in plain words, then the one question that unblocks it.
              <p className="mt-0.5 text-[12.5px] leading-snug text-ink" data-testid="file-error">
                {file.failure.reason}
                {file.failure.ask && <span className="font-semibold"> {file.failure.ask}</span>}
              </p>
            ) : (
              <p className="mt-0.5 text-[12.5px] text-ink">{file.error}</p>
            ))}
        </div>
        {canEdit && !fromHistory && (
          <button
            type="button"
            aria-label={`Remove ${fileName}`}
            onClick={() => removeFile(id)}
            className="rounded-md p-1 text-ink2 transition-colors hover:bg-ground hover:text-[rgb(var(--c-risk))]"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* "from saved history" indicator for an auto-loaded comparative slot. */}
      {fromHistory && (
        <div className="flex flex-wrap items-center gap-2 border-l-2 border-hair/[0.3] pl-3 text-[13px] font-medium text-ink">
          <span className="inline-flex items-center gap-1.5">
            <History size={13} className="text-ink2" /> From saved history
            {file.historyPeriodLabel ? ` · ${file.historyPeriodLabel}` : ''}
          </span>
          {canEdit && onOverride && (
            <button
              type="button"
              onClick={onOverride}
              className="font-semibold text-ink2 hover:underline"
            >
              Upload to override
            </button>
          )}
        </div>
      )}

      {/* parsing skeleton */}
      {status === 'parsing' && (
        <div className="space-y-2">
          <div className="h-3.5 w-2/3 animate-pulse rounded-[4px] bg-ink/[0.06]" />
          <div className="h-3.5 w-1/2 animate-pulse rounded-[4px] bg-ink/[0.06]" />
        </div>
      )}

      {/* ready body */}
      {status === 'ready' && (
        <>
          {/* Metric chips: clean 2-column grid on phones, inline wrap at sm+. */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <span className="pill pill-count w-full justify-center sm:w-auto">
              <CountUp value={file.rows.length} />&nbsp;accounts
            </span>

            <span className="pill w-full justify-center text-ink2 sm:w-auto">
              <CalendarDays size={12} className="text-ink2" />
              {formatShortDate(file.metadata?.periodEndDate)}
            </span>

            {/* #40: half a trial balance REPLACES "Balanced" — a P&L alone nets
                to its own surplus, so "Balanced" would be true of the arithmetic
                and false of the books. */}
            {pill.kind === 'half' ? (
              <span
                className="pill pill-status tone-watch w-full justify-center sm:w-auto"
                data-testid="half-pill"
              >
                <AlertTriangle size={13} /> {pill.label}
              </span>
            ) : pill.kind === 'offBy' ? (
              <span
                className="pill pill-status tone-watch w-full justify-center sm:w-auto"
                data-testid="offby-pill"
                title="Debits and credits don’t match — a column (often the credits) may be missing."
              >
                <AlertTriangle size={13} /> {pill.label}
              </span>
            ) : pill.kind === 'balanced' ? (
              <motion.span
                initial={reduce ? false : { scale: 1.35, rotate: -8, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 320, damping: 16 }}
                className="pill pill-status tone-good w-full justify-center sm:w-auto"
              >
                <CheckCircle2 size={13} /> Balanced
              </motion.span>
            ) : (
              <span className="pill pill-status tone-risk w-full justify-center sm:w-auto">
                <AlertOctagon size={13} /> Out of balance
              </span>
            )}

          </div>

          {/* A4: "N to review" is no longer a small chip — it's a clear amber
              button that opens the review popup (A5). */}
          <AnimatePresence initial={false}>
            {canEdit && reviewCount > 0 && (
              <motion.div
                key="review-button"
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
                transition={{ duration: 0.22, ease: [0.22, 0.8, 0.2, 1] }}
              >
                <AuroraLightButton
                  size="sm"
                  hue={WATCH_HUE}
                  onClick={openReview}
                  aria-haspopup="dialog"
                  data-testid="review-accounts-button"
                  title="Show the accounts that need a quick check"
                  className="w-full justify-center sm:w-auto"
                >
                  <AlertTriangle size={14} aria-hidden="true" />
                  <span aria-live="polite">{reviewButtonLabel(reviewCount)}</span>
                  <ArrowRight size={14} aria-hidden="true" />
                </AuroraLightButton>
              </motion.div>
            )}
          </AnimatePresence>

          <StatementNotes
            file={file}
            canEdit={canEdit}
            onCombine={combineFiles ? (partnerId) => combineFiles(id, partnerId) : undefined}
            onChangeColumns={openColumnPicker ? () => openColumnPicker(id) : undefined}
            onRenumber={renumberAccount || undefined}
            onAddHalf={
              loadFilesForRole && !fromHistory
                ? (role, list) => loadFilesForRole(slotRole ?? role, list)
                : undefined
            }
          />

          {needsReview && (
            <p className="flex items-center gap-1.5 text-[14px] font-medium text-ink">
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

      {/* error footer — "Pick the columns" when KYRO could read the grid at all. */}
      {status === 'error' && (
        <div className="flex flex-wrap gap-2">
          {canEdit && file.failure?.canPick && file.bytes && openColumnPicker && (
            <button
              type="button"
              onClick={() => openColumnPicker(id)}
              className="btn btn-primary btn-sm"
            >
              Pick the columns
            </button>
          )}
          <button
            type="button"
            onClick={() => removeFile(id)}
            className="btn btn-secondary btn-sm"
          >
            Remove
          </button>
        </div>
      )}
    </motion.div>
  )
}
