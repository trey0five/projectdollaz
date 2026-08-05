import { useState } from 'react'
import { motion } from 'framer-motion'
import { FileSpreadsheet, Layers, Plug } from 'lucide-react'
import { AppProvider } from '../../context/AppContext.jsx'
import IntakeBar from '../IntakeBar.jsx'
import IntakeConfirmBand from '../finance/IntakeConfirmBand.jsx'
import BulkYearsUploader from '../BulkYearsUploader.jsx'
import IntegrationsSection from '../settings/IntegrationsSection.jsx'

const TABS = [
  { key: 'single', label: 'This year', Icon: FileSpreadsheet },
  { key: 'bulk', label: 'Add years', Icon: Layers },
  { key: 'qbo', label: 'QuickBooks', Icon: Plug },
]

/**
 * Body of the "Add your trial balances" modal. A navy/gold segmented control
 * toggles between:
 *   • single — today's full 3-slot intake (CY/PY/Audited, autosave), VERBATIM.
 *   • bulk   — the BulkYearsUploader (one file/sheet per year → the annual trend).
 * The two subtrees are MUTUALLY EXCLUSIVE: bulk mode never mounts AppProvider, so
 * the single-mode autosave debounce can never fire mid-bulk. Viewers (!canEdit)
 * see only the read-only single intake — the bulk tab is hidden entirely.
 *
 * `initialTab` (AIC Phase E) lets a deep link land on a specific tab — today only
 * /data?open=trialBalances&intake=bulk, the CTA behind "N more rules unlock when
 * you add FY…" on /accreditation. It is ADVISORY and defaults to today's value:
 * an unknown key, or a viewer who may not use the bulk uploader at all, falls
 * straight back to 'single', so no caller can land this modal on a dead tab.
 */
export default function TrialBalanceModalBody({
  school,
  hydratedFiles,
  activePeriod,
  hydrationToken,
  canEdit,
  onOpenMonthly,
  initialTab = null,
  // OPTIONAL confirm gate. Provided ⇒ once this school has stored trial balances,
  // a band appears under the intake asking the user to look at what was saved and
  // agree with it, and confirming calls this. Absent ⇒ nothing renders, which is
  // how the ui.v1 Data hub keeps its exact previous behaviour: a confirm button
  // whose celebration lives on another page would be a dead control there.
  onConfirmed = null,
  // Fires on EITHER answer. The host needs this because "not quite" still ends
  // the checkpoint: on the first-run Finance screen the calm "your statements are
  // ready / see my overview" bar only appears once the band is answered, so
  // signalling nothing on dismiss left that user with the band gone and no way
  // out of first run.
  onAnswered = null,
  // Whether the saved trial balance actually produced statement figures. False
  // means the accounts have not been categorised yet, so the checkpoint asks
  // for that instead of offering a celebration over an empty statement.
  dataReady = true,
}) {
  const [mode, setMode] = useState(() =>
    TABS.some((t) => t.key === initialTab) ? initialTab : 'single',
  )
  const active = canEdit ? mode : 'single'
  // Which period the user has already answered for. Keyed by period id so saving
  // a SECOND year asks again — that upload lights up different things (year-over-
  // year columns) and deserves its own reward.
  const [answeredPeriodId, setAnsweredPeriodId] = useState(null)
  const showConfirm =
    typeof onConfirmed === 'function' &&
    canEdit &&
    active === 'single' &&
    !!activePeriod &&
    answeredPeriodId !== activePeriod.id &&
    (hydratedFiles || []).length > 0

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
              : active === 'qbo'
                ? 'Connect QuickBooks Online to sync your trial balance automatically — no more manual uploads.'
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

      {/* The checkpoint. Deliberately OUTSIDE AppProvider: it reports what is
          PERSISTED for the period, not what is sitting in the uploader, so it
          can never congratulate a user for a file that failed to save. */}
      {showConfirm && (
        <div className="px-5 pb-5">
          <IntakeConfirmBand
          dataReady={dataReady}
            period={activePeriod}
            files={hydratedFiles}
            onConfirm={() => {
              setAnsweredPeriodId(activePeriod.id)
              onConfirmed()
              onAnswered?.()
            }}
            onFix={() => {
              setAnsweredPeriodId(activePeriod.id)
              onAnswered?.()
            }}
            // The file cards own the review panel and live inside AppProvider,
            // which this band deliberately sits outside of — so the request
            // travels as an event rather than by threading state through the
            // boundary that keeps the band reading PERSISTED data.
            onCategorise={() => window.dispatchEvent(new CustomEvent('finrep:open-review'))}
          />
        </div>
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

      {/* QuickBooks — the FULL per-school QBO panel (the same one from Settings):
          connect, then pick a period and sync/import the trial balance right here.
          `embedded` hides the org console. Conditionally mounted; only for editors. */}
      {canEdit && active === 'qbo' && (
        <div className="p-5">
          <IntegrationsSection embedded />
        </div>
      )}
    </div>
  )
}
