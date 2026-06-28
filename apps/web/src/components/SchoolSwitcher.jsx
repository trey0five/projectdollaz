// Compact school switcher for the TopBar. Lists the user's schools (from
// SchoolContext) and lets them switch the active one, which re-feeds the
// client-side report preview. Single-school users see a static label.
import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Check, Building2 } from 'lucide-react'
import { useSchools } from '../context/SchoolContext.jsx'

export default function SchoolSwitcher() {
  const { schools, activeSchool, setActiveSchool } = useSchools()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  if (!activeSchool) return null

  if (schools.length <= 1) {
    return (
      <span className="hidden items-center gap-2 text-[16px] text-white/75 sm:flex">
        <Building2 size={15} className="text-gold-light" />
        {activeSchool.name}
      </span>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border-2 border-white/20 px-3 py-2 text-[15px] font-semibold text-white/80 transition-all hover:border-gold/60 hover:text-white"
      >
        <Building2 size={15} className="text-gold-light" />
        <span className="max-w-[96px] truncate sm:max-w-[180px]">{activeSchool.name}</span>
        <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-gold/30 bg-cream py-1 shadow-login"
          >
            {schools.map((s) => {
              const active = s.id === activeSchool.id
              return (
                <li key={s.id}>
                  <button
                    onClick={() => {
                      setActiveSchool(s.id)
                      setOpen(false)
                    }}
                    className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-[16px] transition-colors hover:bg-gold/10 ${
                      active ? 'font-semibold text-navy' : 'text-ink'
                    }`}
                  >
                    <span className="truncate">{s.name}</span>
                    {active && <Check size={16} className="text-gold" />}
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
