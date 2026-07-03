import { motion, useReducedMotion } from 'framer-motion'
import { TrendingUp } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'

/**
 * Under the PY slot: opt in/out of also saving the Prior-Year file as its OWN
 * saved year (role cy) so the year-over-year trend lights up. Renders nothing
 * unless the caller can edit AND a PY promotion is genuinely available
 * (fresh upload, own end-date, not already a saved period). Default ON.
 */
export default function PromotePyToggle() {
  const { canEdit, promotePy, setPromotePy, pyPromotable, pyDetected } = useApp()
  const reduce = useReducedMotion()

  if (!canEdit || !pyPromotable) return null

  const fyLabel = pyDetected?.fiscalYear ?? pyDetected?.periodEndDate?.slice(0, 4) ?? ''

  return (
    <motion.label
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 0.8, 0.2, 1] }}
      htmlFor="promote-py-toggle"
      className="mt-2 flex cursor-pointer items-start gap-2.5 rounded-xl border-2 border-gold/30 bg-gold/5 px-3 py-2.5 transition-colors hover:border-gold/60"
    >
      <span className="mt-0.5 flex h-5 items-center">
        <input
          id="promote-py-toggle"
          type="checkbox"
          checked={promotePy}
          onChange={(e) => setPromotePy(e.target.checked)}
          className="h-4 w-4 cursor-pointer rounded border-gold/60 text-gold accent-gold focus-visible:ring-2 focus-visible:ring-gold/40"
        />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-[14px] font-bold text-navy">
          <TrendingUp size={13} className="shrink-0 text-gold" />
          Also save FY{fyLabel} as its own year
        </span>
        <span className="mt-0.5 block text-[13px] leading-snug text-muted">
          Adds last year as a saved period so your year-over-year trend lights up.
        </span>
      </span>
    </motion.label>
  )
}
