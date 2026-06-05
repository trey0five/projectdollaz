import { motion, useReducedMotion } from 'framer-motion'
import {
  AlertOctagon,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  X,
} from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { formatShortDate } from '../lib/format.js'
import RoleChip from './RoleChip.jsx'
import CountUp from './CountUp.jsx'

/** One status card per imported file. */
export default function FileStatusCard({ file, needsReview }) {
  const { setFileRole, removeFile } = useApp()
  const reduce = useReducedMotion()

  const { id, fileName, status } = file
  const ring =
    status === 'error'
      ? 'border-[#e0a0a0]'
      : needsReview
        ? 'border-gold shadow-glow'
        : 'border-border'

  return (
    <motion.div
      layout
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
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
            <p className="mt-0.5 flex items-center gap-1.5 text-[12px] italic text-muted">
              <Loader2 size={12} className="animate-spin" /> Parsing…
            </p>
          )}
          {status === 'error' && (
            <p className="mt-0.5 text-[12px] text-danger">{file.error}</p>
          )}
        </div>
        <button
          type="button"
          aria-label={`Remove ${fileName}`}
          onClick={() => removeFile(id)}
          className="rounded-md p-1 text-muted transition-colors hover:bg-section hover:text-danger"
        >
          <X size={16} />
        </button>
      </div>

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
            <span className="inline-flex w-full items-center justify-center rounded-full bg-section px-2.5 py-1 text-[12px] font-semibold text-navy sm:w-auto sm:justify-start">
              <CountUp value={file.rows.length} />&nbsp;accounts
            </span>

            <span className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-section px-2.5 py-1 text-[12px] text-muted sm:w-auto sm:justify-start">
              <CalendarDays size={12} className="text-gold" />
              {formatShortDate(file.metadata?.periodEndDate)}
            </span>

            {file.balance?.balanced ? (
              <motion.span
                initial={reduce ? false : { scale: 1.35, rotate: -8, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 320, damping: 16 }}
                className="inline-flex w-full items-center justify-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-semibold text-emerald-700 sm:w-auto sm:justify-start"
              >
                <CheckCircle2 size={13} /> Balanced
              </motion.span>
            ) : (
              <span className="inline-flex w-full items-center justify-center gap-1 rounded-full bg-[#fdeeee] px-2.5 py-1 text-[12px] font-semibold text-danger sm:w-auto sm:justify-start">
                <AlertOctagon size={13} /> Out of balance
              </span>
            )}

            {file.unmappedCount > 0 && (
              <span className="inline-flex w-full items-center justify-center gap-1 rounded-full bg-[#fff8e6] px-2.5 py-1 text-[12px] font-semibold text-[#7a5e00] sm:w-auto sm:justify-start">
                <AlertTriangle size={12} /> {file.unmappedCount} to review
              </span>
            )}
          </div>

          {needsReview && (
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-[#7a5e00]">
              <AlertTriangle size={12} /> Confirm this file&rsquo;s role.
            </p>
          )}

          <div className="mt-1 flex items-center justify-between">
            <RoleChip
              role={file.role}
              confirmed={file.roleConfirmed}
              needsReview={needsReview}
              onChange={(role) => setFileRole(id, role)}
            />
          </div>
        </>
      )}

      {/* error footer */}
      {status === 'error' && (
        <button
          type="button"
          onClick={() => removeFile(id)}
          className="self-start rounded-lg border-2 border-border px-3 py-1.5 text-[12px] font-semibold text-navy transition-colors hover:border-gold"
        >
          Remove
        </button>
      )}
    </motion.div>
  )
}
