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

// Save-phase visual states, mirroring FileStatusCard's ring idiom.
const PHASE_RING = {
  saving: 'border-gold shadow-glow',
  saved: 'border-emerald-400 shadow-glow',
  failed: 'border-[#e0a0a0]',
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

  const ring = PHASE_RING[c.status] || (outOfRange || c.duplicate ? 'border-gold' : 'border-border')

  return (
    <motion.div
      layout={!reduce}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.26, ease: [0.22, 0.8, 0.2, 1] }}
      className={`relative flex w-[220px] shrink-0 flex-col gap-2.5 rounded-2xl border-2 bg-white p-3.5 shadow-card ${ring}`}
    >
      {/* year headline + remove */}
      <div className="flex items-start justify-between gap-2">
        <span className="font-serif text-lg font-semibold text-navy">
          {c.year != null ? `FY${c.year}` : 'Year?'}
        </span>
        <span className="flex items-center gap-1">
          {busy && <Loader2 size={15} className="animate-spin text-gold" />}
          {done && <CheckCircle2 size={16} className="text-emerald-600" />}
          {failed && <AlertTriangle size={15} className="text-danger" />}
          {canEdit && !busy && !done && (
            <button
              type="button"
              aria-label={`Remove FY${c.year ?? ''}`}
              onClick={() => onRemove(c.key)}
              className="rounded-md p-1 text-muted transition-colors hover:bg-section hover:text-danger"
            >
              <X size={15} />
            </button>
          )}
        </span>
      </div>

      {/* source */}
      <p className="flex items-center gap-1.5 truncate text-[13px] text-muted" title={c.sourceName}>
        <FileSpreadsheet size={13} className="shrink-0 text-navy/60" />
        <span className="truncate">
          {c.sourceName}
          {c.sheet ? ` — ${c.sheet}` : ''}
        </span>
      </p>

      {/* metrics */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center rounded-full bg-section px-2 py-0.5 text-[12.5px] font-semibold text-navy">
          {c.accountCount} accounts
        </span>
        {c.balanced ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[12.5px] font-semibold text-emerald-700">
            <CheckCircle2 size={12} /> Balanced
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#fff8e6] px-2 py-0.5 text-[12.5px] font-semibold text-[#7a5e00]">
            <AlertTriangle size={12} /> off by {fmtDollar(Math.abs(c.imbalance || 0))}
          </span>
        )}
      </div>

      {/* editable period-end date (re-derives the year) */}
      <label className="flex items-center gap-1.5 text-[12.5px] text-muted">
        <CalendarDays size={13} className="shrink-0 text-gold" />
        {locked ? (
          <span className="font-medium text-navy">{formatShortDate(c.periodEndDate)}</span>
        ) : (
          <DatePicker
            value={c.periodEndDate || ''}
            onChange={(v) => onSetEndDate(c.key, v)}
            className="w-full rounded-md border border-border bg-white px-2 py-1 text-[13px] font-medium text-navy outline-none ring-gold/40 focus-visible:ring-2"
          />
        )}
      </label>

      {/* status chips */}
      {(c.duplicate || outOfRange || failed) && (
        <div className="flex flex-wrap gap-1.5">
          {c.duplicate && (
            <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[12px] font-semibold text-[#7a5e00]">
              Duplicate of FY{c.year} — this file will be skipped
            </span>
          )}
          {outOfRange && !c.duplicate && (
            <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[12px] font-semibold text-[#7a5e00]">
              <AlertTriangle size={11} /> Check this year
            </span>
          )}
          {failed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#fdeeee] px-2 py-0.5 text-[12px] font-semibold text-danger">
              Couldn&rsquo;t save
            </span>
          )}
        </div>
      )}
    </motion.div>
  )
}
