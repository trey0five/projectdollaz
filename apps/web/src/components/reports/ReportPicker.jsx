// ─────────────────────────────────────────────────────────────
// Mobile report switcher: a full-width dropdown showing the current statement,
// tap to open a menu of all reports. Cleaner than a swipeable tab strip on
// phones, keeps the full label readable, and scales to any number of future
// reports. Desktop keeps the segmented tabs (this is rendered sm:hidden).
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Check } from 'lucide-react'

export default function ReportPicker({ tabs, value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const current = tabs.find((t) => t.key === value)

  return (
    <div ref={ref} className="relative flex-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold uppercase tracking-wide text-navy"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{current?.label}</span>
          {current?.badge}
        </span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-gold transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-x-2 top-[calc(100%+4px)] z-50 overflow-hidden rounded-xl border-2 border-border bg-white shadow-lift"
          >
            {tabs.map((t) => {
              const active = t.key === value
              return (
                <li key={t.key} role="option" aria-selected={active}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(t.key)
                      setOpen(false)
                    }}
                    className={`flex min-h-[44px] w-full items-center justify-between gap-2 border-b border-rule px-4 py-3 text-left text-sm last:border-b-0 ${
                      active ? 'bg-section font-semibold text-navy' : 'text-ink hover:bg-section/60'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{t.label}</span>
                      {t.badge}
                    </span>
                    {active && <Check size={16} className="shrink-0 text-gold" />}
                  </button>
                </li>
              )
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
