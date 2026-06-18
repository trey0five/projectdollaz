import { motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import StatusDot from '../analytics/StatusDot.jsx'
import { complianceStatusMeta } from '../../lib/complianceMeta.js'

const COUNT_ORDER = [
  { key: 'pass', status: 'pass' },
  { key: 'reportable', status: 'reportable' },
  { key: 'material', status: 'material' },
  { key: 'watch', status: 'watch' },
  { key: 'needs_data', status: 'needs_data' },
  { key: 'manual', status: 'manual' },
  { key: 'not_applicable', status: 'not_applicable' },
]

/**
 * Overall readiness rollup: a strip of per-status count chips reusing the health
 * palette, plus a Material -> Corrective Action Plan callout (a NOTE only — 2D
 * owns the actual CAP document).
 */
export default function ReadinessSummary({ summary }) {
  const reduce = useReducedMotion()
  if (!summary) return null
  const counts = summary.counts ?? {}

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      className="card-flashy p-5"
    >
      <h3 className="mb-3 font-serif text-lg font-semibold text-navy">
        Overall readiness
      </h3>
      <div className="flex flex-wrap gap-2.5">
        {COUNT_ORDER.map(({ key, status }) => {
          const n = counts[key] ?? 0
          const { palette, label, meta } = complianceStatusMeta(status)
          return (
            <span
              key={key}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] font-semibold ${meta.chip} ${
                n === 0 ? 'opacity-50' : ''
              }`}
            >
              <StatusDot status={palette} size={7} />
              <span className="tabular-nums">{n}</span>
              <span className="font-medium uppercase tracking-[0.06em]">{label}</span>
            </span>
          )
        })}
      </div>

      {summary.hasMaterial && (
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 flex items-start gap-3 rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3"
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-600" />
          <p className="text-[13px] text-red-700">
            <span className="font-semibold">Material exception present.</span> A
            Corrective Action Plan will be required for this engagement. (The CAP
            document itself is produced separately.)
          </p>
        </motion.div>
      )}
    </motion.div>
  )
}
