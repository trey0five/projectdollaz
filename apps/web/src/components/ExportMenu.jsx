import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Printer, FileSpreadsheet } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { downloadExcel } from '../lib/excel.js'

const OPTIONS = [
  { key: 'print', label: 'Print / PDF', icon: Printer },
  { key: 'soa', label: 'Excel — Statement of Activities', icon: FileSpreadsheet },
  { key: 'sfp', label: 'Excel — Statement of Fin. Position', icon: FileSpreadsheet },
  { key: 'both', label: 'Excel — Both Reports', icon: FileSpreadsheet },
  { key: 'scf', label: 'Excel — Cash Flows', icon: FileSpreadsheet },
  { key: 'all', label: 'Excel — All Three Reports', icon: FileSpreadsheet },
]

export default function ExportMenu() {
  const { reports, school, dateLabel, setStatus } = useApp()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  const handle = async (key) => {
    setOpen(false)
    if (key === 'print') {
      window.print()
      return
    }
    if (!reports) {
      setStatus('Drop a Current-Year trial balance to preview first.')
      return
    }
    try {
      setStatus('Building Excel file…')
      await downloadExcel(key, {
        soaResults: reports.soaResults,
        sfpResults: reports.sfpResults,
        scf: reports.scf,
        schoolName: school.name,
        dateLabel,
      })
      setStatus('✓ Excel file downloaded.')
    } catch (err) {
      setStatus(`Export failed: ${err.message}`)
    }
  }

  return (
    <div ref={wrapRef} className="relative inline-block w-full sm:w-auto">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn-ghost w-full justify-center sm:w-auto"
        disabled={!reports}
      >
        Export <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-[260px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border-2 border-border bg-white shadow-lift"
          >
            {OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => handle(opt.key)}
                className="flex w-full items-center gap-3 border-b border-rule px-5 py-3 text-left text-sm text-ink transition-colors last:border-b-0 hover:bg-section hover:text-navy"
              >
                <opt.icon size={17} className="shrink-0 text-gold" />
                {opt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
