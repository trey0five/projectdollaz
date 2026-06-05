import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, Sparkles } from 'lucide-react'

export const ROLE_OPTIONS = [
  { value: 'cy', label: 'Current Year' },
  { value: 'py', label: 'Prior Year' },
  { value: 'audit', label: 'Audited FY End' },
  { value: 'ignore', label: 'Ignore' },
]

const LABELS = {
  cy: 'Current Year',
  py: 'Prior Year',
  audit: 'Audited FY End',
  ignore: 'Ignore',
  unknown: 'Choose role',
}

/**
 * Editable role chip. Opens an accessible listbox (arrow keys / Enter /
 * Escape) to reassign the file's role. Shows an "auto-detected" sparkle
 * until the user confirms, and a duplicate/needs-review state when flagged.
 */
export default function RoleChip({ role, confirmed, needsReview, onChange }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const wrapRef = useRef(null)
  const btnRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const isUnknown = role === 'unknown'
  const showAuto = !confirmed && !isUnknown && !needsReview
  const label = LABELS[role] ?? LABELS.unknown

  const select = (value) => {
    onChange(value)
    setOpen(false)
    btnRef.current?.focus()
  }

  const onKeyDown = (e) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        setActive(Math.max(0, ROLE_OPTIONS.findIndex((o) => o.value === role)))
        setOpen(true)
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      btnRef.current?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (a + 1) % ROLE_OPTIONS.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (a - 1 + ROLE_OPTIONS.length) % ROLE_OPTIONS.length)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      select(ROLE_OPTIONS[active].value)
    }
  }

  const tone = needsReview || isUnknown
    ? 'border-gold bg-[#fff8e6] text-[#7a5e00] shadow-glow'
    : 'border-border bg-white text-navy hover:border-gold'

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] outline-none transition-all focus-visible:ring-2 focus-visible:ring-gold ${tone}`}
      >
        {showAuto && <Sparkles size={13} className="text-gold" aria-hidden />}
        <span>{label}</span>
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {showAuto && (
        <span className="sr-only">Auto-detected — confirm or change.</span>
      )}

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            tabIndex={-1}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 top-[calc(100%+6px)] z-50 min-w-[180px] overflow-hidden rounded-xl border-2 border-border bg-white shadow-lift"
          >
            {ROLE_OPTIONS.map((opt, i) => {
              const selected = opt.value === role
              return (
                <li
                  key={opt.value}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => select(opt.value)}
                  className={`flex cursor-pointer items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                    i === active ? 'bg-section text-navy' : 'text-ink'
                  }`}
                >
                  <span className="flex w-4 justify-center text-gold">
                    {selected && <Check size={15} />}
                  </span>
                  {opt.label}
                </li>
              )
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
