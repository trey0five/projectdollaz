import { motion, useReducedMotion } from 'framer-motion'
import { ShieldAlert } from 'lucide-react'
import { StatStrip, Stat } from '../../ui/surface/index.js'
import { capStatusMeta } from '../../../lib/capMeta.js'

/**
 * CAP rollup (Premium UI P4): the material / reportable / open / in-progress /
 * complete counts as a StatStrip (count-ups, 2px status marks), a primary-blue
 * remediation progress rule, and the Material -> CAP-required callout (a
 * MATERIAL exception REQUIRES a Corrective Action Plan submitted/forwarded to
 * DOE). No chips, no gold bar.
 */
export default function CapSummaryStrip({ summary }) {
  const reduce = useReducedMotion()
  if (!summary) return null

  const liveTotal =
    (summary.openCount ?? 0) + (summary.inProgressCount ?? 0) + (summary.completeCount ?? 0)
  const pct = liveTotal > 0 ? Math.round(((summary.completeCount ?? 0) / liveTotal) * 100) : 0
  const resolved = summary.resolvedCount ?? 0
  const stat = (n, label, tone) => (
    <Stat key={label} label={label} value={n} status={n > 0 ? tone : undefined} className={n === 0 ? 'opacity-60' : ''} />
  )

  return (
    <div>
      <StatStrip cols={resolved > 0 ? 6 : 5} className="stats-wrap stats-compact">
        {stat(summary.materialCount ?? 0, 'Material', 'risk')}
        {stat(summary.reportableCount ?? 0, 'Reportable', 'watch')}
        {stat(summary.openCount ?? 0, 'Open', capStatusMeta('open').palette)}
        {stat(summary.inProgressCount ?? 0, 'In progress', capStatusMeta('in_progress').palette)}
        {stat(summary.completeCount ?? 0, 'Complete', capStatusMeta('complete').palette)}
        {resolved > 0 ? stat(resolved, 'Resolved', 'good') : null}
      </StatStrip>

      {/* Remediation progress — a 2px primary rule that draws to its share once. */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2">
          <span>Remediation progress</span>
          <span className="tabular-nums text-ink">{pct}%</span>
        </div>
        <div
          className="h-0.5 w-full bg-ink/[0.08]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Remediation progress"
        >
          <motion.div
            className="h-full bg-[#2563EB]"
            initial={reduce ? false : { width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={reduce ? undefined : { duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      </div>

      {(summary.materialCount ?? 0) > 0 && (
        <div className="b2-callout b2-risk mt-4">
          <ShieldAlert size={14} aria-hidden="true" />
          <p className="leading-relaxed">
            <span className="font-semibold">A material exception requires a Corrective Action Plan.</span>{' '}
            A material exception must be remediated with a written plan submitted to /
            forwarded to the DOE. Repeated material exceptions in consecutive years can
            lead the Commissioner to deem the school ineligible — complete each plan below.
          </p>
        </div>
      )}
    </div>
  )
}
