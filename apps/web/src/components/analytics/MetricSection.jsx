import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { Section } from '../ui/surface/index.js'

/**
 * A grouped dashboard section (Phase 4D → Premium UI P3): a `Section` label row
 * whose aside is a collapse toggle (height-animated, reduced-motion gated). The
 * content is whatever the parent passes (a metric grid, donuts, a checklist).
 */
export default function MetricSection({ title, subtitle, children, defaultOpen = true }) {
  const reduce = useReducedMotion()
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Section
      label={title}
      aside={
        <>
          {subtitle ? <span>{subtitle}</span> : null}
          <button type="button" onClick={() => setOpen((v) => !v)} className="btn btn-quiet btn-sm" aria-expanded={open}>
            {open ? 'Hide' : 'Show'}
            <ChevronDown size={14} className={`transition-transform duration-200 ${open ? '' : '-rotate-90'}`} aria-hidden="true" />
          </button>
        </>
      }
    >
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
    </Section>
  )
}
