import { motion, useReducedMotion } from 'framer-motion'
import { Sparkles } from 'lucide-react'

/**
 * Forward-compatible "coming soon" placeholder (Phase 4B operational metrics,
 * Phase 5 benchmarking). Reuses the EmptySlotCard dashed-gold vocabulary +
 * pulse-ring so the layout visibly drops 4B/5 in without a rebuild — distinct
 * from the muted "unavailable" state so users read it as roadmap, not broken.
 */
export default function ReservedSlotCard({ title, subtitle, phase }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      className="relative flex min-h-[180px] flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-gold/60 bg-section px-5 py-7 text-center"
    >
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gold-gradient text-white shadow-glow ${
          reduce ? '' : 'animate-pulse-ring'
        }`}
      >
        <Sparkles size={20} />
      </span>
      <p className="font-serif text-base font-semibold text-navy">{title}</p>
      <span className="inline-flex items-center rounded-full border-2 border-gold bg-[#fff8e6] px-2.5 py-0.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#7a5e00]">
        {phase}
      </span>
      <p className="text-[14px] italic text-muted">{subtitle}</p>
    </motion.div>
  )
}
