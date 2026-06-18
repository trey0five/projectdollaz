import { motion, useReducedMotion } from 'framer-motion'
import { BookOpen } from 'lucide-react'
import StatusBadge from './StatusBadge.jsx'
import { complianceStatusMeta, KIND_LABELS } from '../../lib/complianceMeta.js'

/**
 * One finding row: status badge + serif title + detail line + a kind chip
 * (auto/intake/checklist) and the statute citation. A status-colored left rail
 * (from the health palette) ties the row to its verdict.
 */
export default function RuleRow({ finding, index = 0 }) {
  const reduce = useReducedMotion()
  const { meta, Icon } = complianceStatusMeta(finding.status)

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduce
          ? undefined
          : { type: 'spring', stiffness: 260, damping: 22, delay: index * 0.04 }
      }
      className="card-soft relative overflow-hidden p-4 pl-5"
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${meta.rail}`} aria-hidden />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <StatusBadge status={finding.status} />
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-section px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
              {KIND_LABELS[finding.kind] ?? finding.kind}
            </span>
          </div>
          <h4 className="flex items-center gap-1.5 font-serif text-[15px] font-semibold text-navy">
            <Icon size={15} className={meta.text} />
            {finding.title}
          </h4>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">{finding.detail}</p>
        </div>
      </div>
      <p className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] text-muted/80">
        <BookOpen size={12} className="text-gold" />
        <span className="font-mono">{finding.citation}</span>
      </p>
    </motion.div>
  )
}
