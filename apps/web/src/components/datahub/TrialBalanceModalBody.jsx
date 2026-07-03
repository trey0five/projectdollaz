import { useState } from 'react'
import { motion } from 'framer-motion'
import { FileSpreadsheet, Layers } from 'lucide-react'
import { AppProvider } from '../../context/AppContext.jsx'
import IntakeBar from '../IntakeBar.jsx'
import BulkYearsUploader from '../BulkYearsUploader.jsx'

const TABS = [
  { key: 'single', label: 'This year', Icon: FileSpreadsheet },
  { key: 'bulk', label: 'Add years', Icon: Layers },
]

/**
 * Body of the "Add your trial balances" modal. A navy/gold segmented control
 * toggles between:
 *   • single — today's full 3-slot intake (CY/PY/Audited, autosave), VERBATIM.
 *   • bulk   — the BulkYearsUploader (one file/sheet per year → the annual trend).
 * The two subtrees are MUTUALLY EXCLUSIVE: bulk mode never mounts AppProvider, so
 * the single-mode autosave debounce can never fire mid-bulk. Viewers (!canEdit)
 * see only the read-only single intake — the bulk tab is hidden entirely.
 */
export default function TrialBalanceModalBody({
  school,
  hydratedFiles,
  activePeriod,
  hydrationToken,
  canEdit,
  onOpenMonthly,
}) {
  const [mode, setMode] = useState('single')
  const active = canEdit ? mode : 'single'

  return (
    <div>
      {canEdit && (
        <div className="border-b border-rule/60 bg-white px-5 pt-3.5">
          <div className="inline-flex items-center gap-1 rounded-xl border border-gold/30 bg-section p-1">
            {TABS.map((t) => {
              const on = active === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setMode(t.key)}
                  className={`relative inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[14px] font-semibold transition-colors ${
                    on ? 'text-navy' : 'text-muted hover:text-navy'
                  }`}
                >
                  {on && (
                    <motion.span
                      layoutId="tb-mode-pill"
                      className="absolute inset-0 rounded-lg bg-gold-gradient shadow-glow"
                      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                    />
                  )}
                  <span className="relative flex items-center gap-1.5">
                    <t.Icon size={14} /> {t.label}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="mt-2 pb-3 text-[13.5px] text-muted">
            {active === 'bulk'
              ? 'Bring in several past years at once to build your year-over-year trend.'
              : 'Upload this year’s books (add last year & audited to unlock comparatives).'}
          </p>
        </div>
      )}

      {/* Single intake is CONDITIONALLY mounted (only while active) so its opt-in
          autosave never fires while the bulk tab is showing. Today's intake,
          standalone — upload CY/PY/Audited, assign roles, save. Saving bumps
          PersistenceContext's hydrationToken, which the hub watches to refresh the
          card status. Key unchanged so hydration remounts cleanly. */}
      {active === 'single' && (
        <AppProvider
          key={`tb-${school?.id ?? 'none'}:${hydrationToken}`}
          school={school}
          initialFiles={hydratedFiles || []}
          initialPeriod={activePeriod || null}
          readOnly={!canEdit}
          autoCollapse={false}
          autoSave
        >
          <IntakeBar />
        </AppProvider>
      )}

      {/* Bulk uploader stays ALWAYS mounted (visibility-toggled) so dropped/
          reviewed years survive a bulk→single→bulk toggle. It never mounts
          AppProvider, so keeping it alive can't trigger any autosave. Only for
          editors — viewers never see the bulk tab. */}
      {canEdit && (
        <div className={active === 'bulk' ? 'p-5' : 'hidden'}>
          <BulkYearsUploader canEdit={canEdit} onOpenMonthly={onOpenMonthly} />
        </div>
      )}
    </div>
  )
}
