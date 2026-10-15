import { motion } from 'framer-motion'
import { Calendar, Check, History, Minus, PencilLine } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'

function SlotChip({ label, entry }) {
  const present = !!entry
  const fromHistory = !!entry?.fromHistory
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[14px] font-semibold ${
        fromHistory
          ? 'bg-ink/[0.04] text-ink2'
          : present
            ? 'bg-white text-ink'
            : 'bg-ground text-ink2/60'
      }`}
      title={fromHistory ? 'from saved history' : present ? 'loaded' : 'not provided'}
    >
      {fromHistory ? (
        <History size={12} />
      ) : present ? (
        <Check size={12} />
      ) : (
        <Minus size={12} />
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
      className="flex w-full overflow-hidden"
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
        className="group flex w-full cursor-pointer flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-[8px] border border-hair/[0.18] bg-white px-4 py-2.5  outline-none transition-all hover:border-hair/[0.3] hover: focus-visible:border-[#2563EB] focus-visible: sm:h-[52px]"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <SlotChip label="CY" entry={byRole.cy} />
          <SlotChip label="PY" entry={byRole.py} />
          <SlotChip label="Audited" entry={byRole.audit} />
          {shortDateLabel && (
            <>
              <span aria-hidden className="mx-1 hidden h-4 w-px bg-rule sm:inline-block" />
              <span className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-ink">
                <Calendar size={13} className="text-ink2" /> {shortDateLabel}
              </span>
            </>
          )}
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-hair bg-ink/[0.02] px-3 py-1.5 text-[13px] font-semibold uppercase tracking-[0.1em] text-ink2 transition-colors group-hover:border-hair/[0.3] group-hover:bg-ink/[0.04]">
          <PencilLine size={13} /> Edit
        </span>
      </div>
    </motion.div>
  )
}
