import { useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import '../styles/pending/b2-finance.css'
import { UploadCloud } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'

const ACCEPT = '.xlsx,.xls,.csv'

/** Empty-state hero dropzone: keyboard-focusable, drop target + browse. */
export default function HeroDropzone() {
  const { loadFiles } = useApp()
  const reduce = useReducedMotion()
  const inputRef = useRef(null)

  const openDialog = () => inputRef.current?.click()

  const onChange = (e) => {
    if (e.target.files?.length) loadFiles(e.target.files)
    e.target.value = '' // allow re-dropping the same filename
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openDialog()
    }
  }

  const onDrop = (e) => {
    e.preventDefault()
    if (e.dataTransfer?.files?.length) loadFiles(e.dataTransfer.files)
  }

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.98 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 24 }}
      role="button"
      tabIndex={0}
      aria-label="Drop trial balances or QuickBooks reports here, or press Enter to browse"
      onClick={openDialog}
      onKeyDown={onKeyDown}
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      className="b2-drop gap-5 px-5 py-10 sm:px-8 sm:py-16"
    >
      {/* Static icon stroke (the old infinite bob is gone — motion is one-shot). */}
      <span className="b2-drop-icon">
        <UploadCloud size={36} aria-hidden="true" />
      </span>

      <div>
        <h2 className="font-serif text-title font-medium text-ink">
          Start with this year’s trial balance or QuickBooks reports
        </h2>
        <p className="mx-auto mt-2 max-w-md text-small text-ink2">
          Drop it here — or the Profit &amp; Loss and Balance Sheet exported from
          QuickBooks. That’s all you need to preview statements; you can add last
          year’s files afterward. Accepts .xlsx, .xls, and .csv.
        </p>
      </div>

      <button
        type="button"
        className="btn btn-primary"
        onClick={(e) => {
          e.stopPropagation()
          openDialog()
        }}
      >
        Browse files
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={onChange}
      />
    </motion.div>
  )
}
