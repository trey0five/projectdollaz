import { motion, useReducedMotion } from 'framer-motion'
import { ShieldAlert } from 'lucide-react'

/**
 * The highest-stakes framing element: a readiness pre-flag is NOT the official
 * AUP or legal/audit advice. Visually DISTINCT from the rule rows (gold left-rail,
 * informational — never a status pill) so a school can't mistake it for a verdict.
 */
export default function DisclaimerBanner() {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      className="card-soft flex items-start gap-3.5 border-l-4 border-gold bg-gold/[0.06] p-5"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold">
        <ShieldAlert size={20} />
      </span>
      <div>
        <h2 className="font-serif text-[16px] font-semibold text-navy">
          Readiness pre-flag — not the official AUP
        </h2>
        <p className="mt-1 text-[15px] leading-relaxed text-muted">
          This mirrors the Step Up For Students AUP template and the governing
          Florida statutes so you can self-check before your CPA engagement. It is{' '}
          <span className="font-semibold text-navy">not</span> the official
          Agreed-Upon-Procedures report and{' '}
          <span className="font-semibold text-navy">not</span> legal or audit
          advice. Your engaged CPA performs the official AUP.
        </p>
      </div>
    </motion.div>
  )
}
