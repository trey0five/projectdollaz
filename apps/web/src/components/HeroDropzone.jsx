import { useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
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
      aria-label="Drop trial balances here or press Enter to browse"
      onClick={openDialog}
      onKeyDown={onKeyDown}
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      className="group flex cursor-pointer flex-col items-center gap-5 rounded-2xl border-2 border-dashed border-gold/60 bg-section px-5 py-10 text-center outline-none transition-all hover:border-gold hover:shadow-glow focus-visible:border-gold focus-visible:shadow-glow sm:px-8 sm:py-16"
    >
      <motion.span
        className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-glow"
        animate={reduce ? undefined : { y: [0, -10, 0] }}
        transition={reduce ? undefined : { duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <UploadCloud size={36} />
      </motion.span>

      <div>
        <h2 className="font-serif text-xl font-semibold text-navy sm:text-2xl">
          Start with this year’s trial balance
        </h2>
        <p className="mx-auto mt-2 max-w-md font-serif text-base italic text-muted">
          Drop it here — that’s all you need to preview statements. You can add last
          year’s files afterward. Accepts .xlsx, .xls, and .csv.
        </p>
      </div>

      <button
        type="button"
        className="btn-primary"
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
