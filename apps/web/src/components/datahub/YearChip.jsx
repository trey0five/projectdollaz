import { motion, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  X,
} from 'lucide-react'
import { fmtDollar, formatShortDate } from '../../lib/format.js'
import DatePicker from '../ui/DatePicker.jsx'
import { Pill } from '../ui/surface/index.js'

// Save-phase visual states, mirroring FileStatusCard's ring idiom.
// The phase frame: a quiet hairline at rest, primary while saving, the 2px
// semantic left mark when saved / failed / needing a look (never a fill).
const PHASE_RING = {
  saving: 'border-[#2563EB]/50',
  saved: 'border-hair/[0.18] border-l-2 !border-l-good',
  failed: 'border-hair/[0.18] border-l-2 !border-l-risk',
}

/**
 * One year card in the bulk uploader timeline. Same card idiom as
 * FileStatusCard: filename/sheet, account count, balanced pill, an editable
 * period-end date (re-derives the year), status chips (duplicate / range),
 * remove, and the save-phase state (pending → saving → saved/failed).
 */
export default function YearChip({ candidate: c, canEdit, currentYear, onSetEndDate, onRemove }) {
  const reduce = useReducedMotion()
  const outOfRange = c.year != null && (c.year < 2000 || c.year > currentYear + 1)
  const busy = c.status === 'saving'
  const done = c.status === 'saved'
  const failed = c.status === 'failed'
  const locked = !canEdit || busy || done

  const ring = PHASE_RING[c.status] || (outOfRange || c.duplicate ? 'border-hair/[0.18] border-l-2 !border-l-watch' : 'border-hair/[0.18]')

  return (
    <motion.div
      layout={!reduce}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.26, ease: [0.22, 0.8, 0.2, 1] }}
      className={`relative flex w-[220px] shrink-0 flex-col gap-2.5 rounded-[8px] border bg-white p-3.5  ${ring}`}
    >
      {/* year headline + remove */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-heading font-semibold text-ink">
          {c.year != null ? `FY${c.year}` : 'Year?'}
        </span>
        <span className="flex items-center gap-1">
          {busy && <Loader2 size={15} className="animate-spin text-ink2" />}
          {done && <CheckCircle2 size={16} aria-label="saved" className="tone-good" />}
          {failed && <AlertTriangle size={15} className="tone-risk" />}
          {canEdit && !busy && !done && (
            <button
              type="button"
              aria-label={`Remove FY${c.year ?? ''}`}
              onClick={() => onRemove(c.key)}
              className="rounded-md p-1 text-ink2 transition-colors hover:bg-ground hover:text-[rgb(var(--c-risk))]"
            >
              <X size={15} />
            </button>
          )}
        </span>
      </div>

      {/* source */}
      <p className="flex items-center gap-1.5 truncate text-[13px] text-ink2" title={c.sourceName}>
        <FileSpreadsheet size={13} className="shrink-0 text-ink2" />
        <span className="truncate">
          {c.sourceName}
          {c.sheet ? ` — ${c.sheet}` : ''}
        </span>
      </p>
      {/* #40 / #32: how this year was read. */}
      {c.merged && (
        <p className="-mt-1.5 text-[12px] font-semibold text-ink2" data-testid="year-merged">
          P&amp;L + Balance Sheet
        </p>
      )}
      {c.metadata?.layout?.source === 'remembered' && (
        <p className="-mt-1.5 text-[12px] text-ink2" data-testid="year-remembered">
          Read with your saved columns
        </p>
      )}
      {c.metadata?.layout?.source === 'picked' && (
        <p className="-mt-1.5 text-[12px] text-ink2">Read with your columns</p>
      )}

      {/* metrics */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill variant="count">{c.accountCount} accounts</Pill>
        {c.balanced ? (
          <Pill variant="status" tone="good">Balanced</Pill>
        ) : (
          <Pill variant="status" tone="watch">off by {fmtDollar(Math.abs(c.imbalance || 0))}</Pill>
        )}
      </div>

      {/* editable period-end date (re-derives the year) */}
      <label className="flex items-center gap-1.5 text-[12.5px] text-ink2">
        <CalendarDays size={13} className="shrink-0 text-ink2" />
        {locked ? (
          <span className="font-medium text-ink">{formatShortDate(c.periodEndDate)}</span>
        ) : (
          <DatePicker
            value={c.periodEndDate || ''}
            onChange={(v) => onSetEndDate(c.key, v)}
            className="w-full rounded-md border border-hair/[0.18] bg-white px-2 py-1 text-[13px] font-medium text-ink outline-none ring-[#2563EB]/40 focus-visible:ring-2"
          />
        )}
      </label>

      {/* status chips */}
      {(c.duplicate || outOfRange || failed) && (
        <div className="flex flex-wrap gap-1.5">
          {c.duplicate && (
            <Pill variant="status" tone="watch" className="!h-auto min-h-[20px] whitespace-normal py-0.5">
              Duplicate of FY{c.year} — this file will be skipped
            </Pill>
          )}
          {outOfRange && !c.duplicate && (
            <Pill variant="status" tone="watch">Check this year</Pill>
          )}
          {failed && (
            <Pill variant="status" tone="risk">Couldn&rsquo;t save</Pill>
          )}
        </div>
      )}
    </motion.div>
  )
}
