import { motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, ShieldAlert } from 'lucide-react'
import StatusDot from '../../analytics/StatusDot.jsx'
import { capStatusMeta } from '../../../lib/capMeta.js'

/**
 * CAP rollup: N material / M reportable / open / in-progress / complete chips, a
 * gold completion progress bar, and the Material -> CAP-required callout (a MATERIAL
 * exception REQUIRES a Corrective Action Plan submitted/forwarded to DOE).
 */
export default function CapSummaryStrip({ summary }) {
  const reduce = useReducedMotion()
  if (!summary) return null

  const liveTotal =
    (summary.openCount ?? 0) + (summary.inProgressCount ?? 0) + (summary.completeCount ?? 0)
  const pct = liveTotal > 0 ? Math.round(((summary.completeCount ?? 0) / liveTotal) * 100) : 0

  const chip = (n, label, palette) => (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] font-semibold ${
        capStatusMeta(palette).meta.chip
      } ${n === 0 ? 'opacity-50' : ''}`}
    >
      <StatusDot status={capStatusMeta(palette).palette} size={7} />
      <span className="tabular-nums">{n}</span>
      <span className="font-medium uppercase tracking-[0.06em]">{label}</span>
    </span>
  )

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      className="card-soft p-5"
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[12px] font-semibold text-red-700">
          <ShieldAlert size={13} />
          <span className="tabular-nums">{summary.materialCount ?? 0}</span>
          <span className="uppercase tracking-[0.06em]">Material</span>
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[12px] font-semibold text-amber-700">
          <AlertTriangle size={13} />
          <span className="tabular-nums">{summary.reportableCount ?? 0}</span>
          <span className="uppercase tracking-[0.06em]">Reportable</span>
        </span>
        <span className="h-5 w-px bg-border" aria-hidden />
        {chip(summary.openCount ?? 0, 'Open', 'open')}
        {chip(summary.inProgressCount ?? 0, 'In progress', 'in_progress')}
        {chip(summary.completeCount ?? 0, 'Complete', 'complete')}
        {(summary.resolvedCount ?? 0) > 0 && (
          <>
            <span className="h-5 w-px bg-border" aria-hidden />
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[12px] font-semibold text-emerald-700">
              <span className="tabular-nums">{summary.resolvedCount}</span>
              <span className="uppercase tracking-[0.06em]">Resolved</span>
            </span>
          </>
        )}
      </div>

      {/* Completion progress bar (gold gradient). */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
          <span>Remediation progress</span>
          <span className="tabular-nums text-navy">{pct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-navy/[0.06]">
          <motion.div
            className="h-full rounded-full bg-gold-gradient"
            initial={reduce ? false : { width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={reduce ? undefined : { type: 'spring', stiffness: 120, damping: 20 }}
          />
        </div>
      </div>

      {(summary.materialCount ?? 0) > 0 && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3">
          <ShieldAlert size={18} className="mt-0.5 shrink-0 text-red-600" />
          <p className="text-[13px] leading-relaxed text-red-800">
            <span className="font-semibold">A material exception requires a Corrective Action Plan.</span>{' '}
            A material exception must be remediated with a written plan submitted to /
            forwarded to the DOE. Repeated material exceptions in consecutive years can
            lead the Commissioner to deem the school ineligible — complete each plan below.
          </p>
        </div>
      )}
    </motion.div>
  )
}
