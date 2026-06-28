import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'

/**
 * A grouped dashboard section (Phase 4D): a serif section header with a chevron
 * that collapses/expands its content (height-animated, reduced-motion gated). The
 * content is whatever the parent passes (a metric grid, donuts, etc).
 */
export default function MetricSection({ title, subtitle, children, defaultOpen = true }) {
  const reduce = useReducedMotion()
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mb-3 flex w-full items-center gap-2 text-left"
        aria-expanded={open}
      >
        <ChevronDown
          size={16}
          className={`text-gold transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
        />
        <h3 className="font-serif text-lg font-semibold text-navy">{title}</h3>
        {subtitle && <span className="text-[14px] text-muted">· {subtitle}</span>}
        <span className="ml-2 h-px flex-1 bg-rule/50" aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={reduce ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="pb-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
