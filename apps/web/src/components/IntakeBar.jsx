import { useMemo, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ChevronUp, Plus } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import DragOverlay from './DragOverlay.jsx'
import HeroDropzone from './HeroDropzone.jsx'
import FileStatusCard from './FileStatusCard.jsx'
import PeriodControls from './PeriodControls.jsx'
import SummaryStrip from './SummaryStrip.jsx'
import ExportMenu from './ExportMenu.jsx'

const ACCEPT = '.xlsx,.xls,.csv'

const CONFLICT_COPY = {
  duplicate: (c) =>
    `Two files are set to ${c.role.toUpperCase()} — pick one role per file.`,
  unresolved: () => 'Some files need a role — confirm each via its chip.',
  'missing-current': () => 'Add or assign a Current-Year file to preview statements.',
  'ambiguous-period': () =>
    'Two files share the same period-end — set which is Current vs Prior via their chips.',
}

export default function IntakeBar() {
  const { files, intakeMode, conflicts, loadFiles, status, collapse } = useApp()
  const inputRef = useRef(null)

  // Which file ids need user attention: any file in a duplicate/unresolved
  // conflict, plus any low-confidence unconfirmed suggestion.
  const reviewIds = useMemo(() => {
    const ids = new Set()
    for (const c of conflicts) {
      if (
        c.kind === 'duplicate' ||
        c.kind === 'unresolved' ||
        c.kind === 'ambiguous-period'
      ) {
        c.fileIds.forEach((id) => ids.add(id))
      }
    }
    for (const f of files) {
      if (
        f.status === 'ready' &&
        !f.roleConfirmed &&
        (f.role === 'unknown' || (f.suggestion?.confidence ?? 0) < 0.5)
      ) {
        ids.add(f.id)
      }
    }
    return ids
  }, [files, conflicts])

  const onBrowse = (e) => {
    if (e.target.files?.length) loadFiles(e.target.files)
    e.target.value = ''
  }

  return (
    <section className="no-print relative border-b border-rule bg-section py-6 sm:py-7">
      <DragOverlay />

      <div className="mx-auto max-w-[980px] px-4 sm:px-10">
      <AnimatePresence mode="wait">
        {/* ── EMPTY ── */}
        {intakeMode === 'empty' && (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Export sits in its own right-aligned row so the dropzone can span
                the full column and stay centered (symmetric with the preview
                placeholder below). */}
            <div className="mb-3 flex justify-end">
              <ExportMenu />
            </div>
            <HeroDropzone />
          </motion.div>
        )}

        {/* ── COLLAPSED ── */}
        {intakeMode === 'collapsed' && (
          <motion.div
            key="collapsed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="flex-1">
              <SummaryStrip />
            </div>
            <div className="w-full sm:w-auto">
              <ExportMenu />
            </div>
          </motion.div>
        )}

        {/* ── REVIEW ── */}
        {intakeMode === 'review' && (
          <motion.div
            key="review"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="font-serif text-lg font-semibold text-navy sm:text-xl">
                Imported trial balances
              </h2>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="btn-ghost w-full justify-center sm:w-auto"
                >
                  <Plus size={16} /> Add files
                </button>
                <button
                  type="button"
                  onClick={collapse}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted transition-colors hover:text-navy sm:w-auto"
                >
                  <ChevronUp size={15} /> Collapse
                </button>
                <div className="w-full sm:w-auto">
                  <ExportMenu />
                </div>
              </div>
            </div>

            {/* conflict banners */}
            {conflicts.length > 0 && (
              <div className="mb-5 space-y-2">
                {conflicts.map((c, i) => (
                  <div
                    key={`${c.kind}-${i}`}
                    className="flex items-center gap-2 rounded-lg border border-l-4 border-[#e8c96a] border-l-gold bg-[#fff8e6] px-4 py-2.5 text-[13px] font-medium text-[#7a5e00]"
                  >
                    <AlertTriangle size={15} className="shrink-0" />
                    {CONFLICT_COPY[c.kind](c)}
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence mode="popLayout">
                {files.map((f) => (
                  <FileStatusCard key={f.id} file={f} needsReview={reviewIds.has(f.id)} />
                ))}
              </AnimatePresence>
            </div>

            <div className="mt-5">
              <PeriodControls />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={onBrowse}
      />

      {status && (
        <p aria-live="polite" className="mt-4 text-[13px] italic text-muted">
          {status}
        </p>
      )}
      </div>
    </section>
  )
}
