import { motion, useReducedMotion } from 'framer-motion'
import { BookOpen } from 'lucide-react'
import StatusBadge from './StatusBadge.jsx'
import { complianceStatusMeta, KIND_LABELS } from '../../lib/complianceMeta.js'

/**
 * One finding row: status + title + detail line + a kind label
 * (auto/intake/checklist) and the statute citation. Premium UI P4: a RULED ROW
 * on the ground — the verdict is the 2px status rail on the left (health
 * palette) and the status Pill; no card per finding.
 */
export default function RuleRow({ finding, index = 0 }) {
  const reduce = useReducedMotion()
  const { palette, Icon } = complianceStatusMeta(finding.status)

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={reduce ? undefined : { duration: 0.24, delay: Math.min(index, 20) * 0.015 }}
      className="relative border-b border-hair py-3 pl-4"
    >
      <span className={`tone-${palette} absolute bottom-3 left-0 top-3 w-0.5 bg-current`} aria-hidden />
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <StatusBadge status={finding.status} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2">
          {KIND_LABELS[finding.kind] ?? finding.kind}
        </span>
      </div>
      <h4 className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">
        <Icon size={14} aria-hidden="true" className="shrink-0 text-ink2" />
        {finding.title}
      </h4>
      <p className="mt-0.5 max-w-4xl text-small leading-relaxed text-ink2">{finding.detail}</p>
      <p className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] text-ink2">
        <BookOpen size={12} aria-hidden="true" />
        <span className="font-mono">{finding.citation}</span>
      </p>
    </motion.div>
  )
}
