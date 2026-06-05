import { motion } from 'framer-motion'
import { Check, Minus, PencilLine } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'

function SlotChip({ label, present }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[13px] font-semibold ${
        present ? 'text-navy' : 'text-muted/60'
      }`}
    >
      {present ? (
        <Check size={14} className="text-emerald-600" />
      ) : (
        <Minus size={14} className="text-muted/50" />
      )}
      {label}
    </span>
  )
}

/** Collapsed slim summary strip; click / Enter re-expands the intake. */
export default function SummaryStrip() {
  const { byRole, shortDateLabel, expand } = useApp()

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className="overflow-hidden"
    >
      <div
        role="button"
        tabIndex={0}
        onClick={expand}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            expand()
          }
        }}
        className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border-2 border-border bg-white px-5 py-3.5 shadow-card outline-none transition-all hover:border-gold hover:shadow-glow focus-visible:border-gold focus-visible:shadow-glow"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <SlotChip label="CY" present={!!byRole.cy} />
          <span className="text-muted/40">·</span>
          <SlotChip label="PY" present={!!byRole.py} />
          <span className="text-muted/40">·</span>
          <SlotChip label="Audited" present={!!byRole.audit} />
          <span className="text-muted/40">·</span>
          <span className="text-[13px] font-semibold text-navy">{shortDateLabel}</span>
        </div>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-semibold uppercase tracking-[0.1em] text-gold">
          <PencilLine size={14} /> Add / replace files
        </span>
      </div>
    </motion.div>
  )
}
