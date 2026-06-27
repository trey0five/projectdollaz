// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — Board Report builder. A 5-step wizard that consumes the server-
// assembled BoardReportBundle (sharedShapes) VERBATIM — the web layer does ZERO
// financial math. It only collects edits (per-line variance explanations, the
// MD&A narrative, branding/title/committee) and persists them via the PUT; numbers
// always come from the assemble GET.
//
// React-Compiler / hooks safety:
//   • ONE useReducer holds all editable draft state (step, settings, explanations,
//     mda). Steps are rendered by render-HELPER functions (no nested component
//     defs) so hooks order is stable.
//   • The bundle's editable fields are synced into the draft via the established
//     render-time sync-on-key pattern (keyed on periodId + a load token), never a
//     setState-in-effect.
//   • Editable state autosaves (debounced PUT) via useAutosave; explanations are
//     DEEP-merged per category server-side so a single line's edit never clobbers
//     siblings. A refresh re-pulls assemble, which already reflects saved edits.
// ─────────────────────────────────────────────────────────────────────────────
import { useReducer } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { useBoardReport } from '../../../hooks/useBoardReport.js'
import { useAutosave } from '../../../hooks/useAutosave.js'
import { useBilling } from '../../../context/BillingContext.jsx'
import EntitlementPausedPanel from '../../analytics/EntitlementPausedPanel.jsx'
import Step1Period from './steps/Step1Period.jsx'
import Step2Confirm from './steps/Step2Confirm.jsx'
import Step3Variance from './steps/Step3Variance.jsx'
import Step4Branding from './steps/Step4Branding.jsx'
import Step5Generate from './steps/Step5Generate.jsx'

const STEPS = [
  { id: 1, label: 'Period' },
  { id: 2, label: 'Confirm' },
  { id: 3, label: 'Variance & MD&A' },
  { id: 4, label: 'Branding' },
  { id: 5, label: 'Generate' },
]

const initialDraft = {
  step: 1,
  periodId: null,
  granularity: 'annual',
  // Monthly read-state (NBOA MTD/YTD view). null = annual / no month chosen. Like
  // granularity, this is READ state — excluded from dirtySignal/editablePayload so
  // it never triggers autosave traffic.
  monthKey: null,
  // Editable BoardReport state (synced from the bundle on load).
  reportTitle: '',
  committeeName: '',
  mdaText: '',
  mdaSource: null,
  explanations: { revenue: {}, expense: {} },
  // Sync bookkeeping (render-time sync-on-key).
  syncedKey: null,
  // The dirty-signal captured at the last sync/save. Autosave only fires when the
  // live signal diverges from this, so merely OPENING the wizard never PUTs.
  syncedSignal: null,
}

function reducer(state, action) {
  switch (action.type) {
    case 'setStep':
      return { ...state, step: action.step }
    case 'setPeriod':
      // New period -> jump to step 1's selection, reset sync so the next bundle
      // hydrates. The chosen month belongs to the old period's loaded snapshots,
      // so clear it (the picker re-lists this period's months).
      return { ...state, periodId: action.periodId, monthKey: null, syncedKey: null }
    case 'sync': {
      // Render-time hydrate from a freshly-assembled bundle (sync-on-key).
      const next = {
        ...state,
        syncedKey: action.key,
        reportTitle: action.reportTitle,
        committeeName: action.committeeName,
        mdaText: action.mdaText,
        mdaSource: action.mdaSource,
        explanations: action.explanations,
      }
      // Baseline the autosave signal so opening the wizard (no edits) never PUTs.
      return { ...next, syncedSignal: dirtySignal(next) }
    }
    case 'setField':
      return { ...state, [action.field]: action.value }
    case 'setExplanation': {
      const { categoryType, key, text } = action
      return {
        ...state,
        explanations: {
          ...state.explanations,
          [categoryType]: { ...(state.explanations[categoryType] || {}), [key]: text },
        },
      }
    }
    case 'setMda':
      return { ...state, mdaText: action.text, mdaSource: action.source }
    case 'saved':
      // After a successful PUT: adopt the server's authoritative mdaSource (it
      // forces 'user' whenever mdaText is set) so the badge reflects persisted
      // state immediately, and re-baseline the signal so a clean draft is quiet.
      return {
        ...state,
        mdaSource: action.mdaSource ?? state.mdaSource,
        syncedSignal: action.savedSignal ?? state.syncedSignal,
      }
    default:
      return state
  }
}

// The change-signal that drives autosave. EXCLUDES mdaSource on purpose: the
// server derives it from mdaText (forces 'user' when text is present), so the
// post-save mdaSource sync must NOT read as a fresh edit and re-fire the PUT.
function dirtySignal(d) {
  return JSON.stringify({
    reportTitle: d.reportTitle?.trim() ? d.reportTitle.trim() : null,
    committeeName: d.committeeName?.trim() ? d.committeeName.trim() : null,
    mdaText: d.mdaText?.trim() ? d.mdaText : null,
    explanations: d.explanations,
  })
}

// Editable fields the autosave PUT sends. Numbers are NEVER part of this.
function editablePayload(d) {
  return {
    reportTitle: d.reportTitle?.trim() ? d.reportTitle.trim() : null,
    committeeName: d.committeeName?.trim() ? d.committeeName.trim() : null,
    mdaText: d.mdaText?.trim() ? d.mdaText : null,
    mdaSource: d.mdaSource || undefined,
    explanations: d.explanations,
  }
}

export default function BoardReportWizard({ schoolId, school, periods, initialPeriodId }) {
  const { isOwner } = useBilling()
  const canEdit = school?.role === 'owner' || school?.role === 'accountant'

  const [draft, dispatch] = useReducer(reducer, initialDraft, (init) => ({
    ...init,
    periodId: initialPeriodId ?? null,
  }))

  const { data, loading, monthError, notEntitled, save } = useBoardReport(
    schoolId,
    draft.periodId,
    draft.granularity,
    draft.monthKey,
  )

  // ── Render-time sync-on-key: fold the bundle's editable fields into the draft
  // exactly once per (period + granularity + month + load). No setState-in-effect.
  // Including granularity/monthKey in the key re-hydrates when the user switches
  // month so saved annual explanations don't leak into a monthly view. ─────────
  const loadKey = data
    ? `${data.periodId}:${data.granularity ?? 'annual'}:${data.monthKey ?? ''}`
    : null
  if (data && draft.syncedKey !== loadKey) {
    const expl = { revenue: {}, expense: {} }
    for (const r of data.operations?.revenue || []) {
      if (r.explanation) expl.revenue[r.key] = r.explanation
    }
    for (const r of data.operations?.expense || []) {
      if (r.explanation) expl.expense[r.key] = r.explanation
    }
    dispatch({
      type: 'sync',
      key: loadKey,
      reportTitle: data.settings?.reportTitle ?? '',
      committeeName: data.settings?.committeeName ?? school?.defaultCommittee ?? '',
      mdaText: data.mda?.text ?? '',
      mdaSource: data.mda?.source ?? null,
      explanations: expl,
    })
  }

  // ── Debounced autosave of editable state (PUT) ──────────────────────────────
  const signal = dirtySignal(draft)
  const synced = data && draft.syncedKey === loadKey
  const { saving, error: saveError, saveNow } = useAutosave({
    enabled: canEdit && !!schoolId && !!draft.periodId && synced,
    // Dirty only once the draft actually diverges from the synced baseline, so
    // opening the wizard with no edits never writes an empty row + audit entry.
    dirty: synced && signal !== draft.syncedSignal,
    signal,
    delay: 900,
    save: async () => {
      const savedSignal = dirtySignal(draft)
      const row = await save(editablePayload(draft))
      dispatch({ type: 'saved', mdaSource: row?.mdaSource, savedSignal })
    },
  })

  if (notEntitled) {
    return <EntitlementPausedPanel />
  }

  const step = draft.step
  const ctx = {
    schoolId,
    school,
    periods,
    draft,
    data,
    loading,
    monthError,
    canEdit,
    isOwner,
    saving,
    saveError,
    saveNow,
    dispatch,
    save,
    goTo: (s) => dispatch({ type: 'setStep', step: s }),
  }

  return (
    <div className="card-vital overflow-hidden p-0">
      {renderRail(step, ctx)}
      <div className="px-5 py-6 sm:px-7">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -18 }}
            transition={{ duration: 0.22 }}
          >
            {renderStep(step, ctx)}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

// ── Render-helpers (NOT nested component defs) ────────────────────────────────

function renderRail(step, ctx) {
  return (
    <div className="border-b border-rule/60 bg-navy-gradient px-5 py-4 sm:px-7">
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => {
          const done = s.id < step
          const active = s.id === step
          const reachable = ctx.data || s.id === 1
          return (
            <div key={s.id} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && ctx.goTo(s.id)}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-[12px] font-bold transition-all ${
                  active
                    ? 'border-gold bg-gold text-navy'
                    : done
                      ? 'border-gold/60 bg-gold/20 text-gold-light'
                      : 'border-white/25 text-white/60'
                } ${reachable ? '' : 'cursor-not-allowed opacity-50'}`}
                title={s.label}
              >
                {done ? <Check size={15} /> : s.id}
              </button>
              <span
                className={`hidden text-[11px] font-semibold uppercase tracking-[0.08em] sm:inline ${
                  active ? 'text-gold-light' : 'text-white/55'
                }`}
              >
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <span
                  className={`mx-1 hidden h-0.5 flex-1 rounded-full sm:block ${
                    done ? 'bg-gold/50' : 'bg-white/15'
                  }`}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function renderStep(step, ctx) {
  switch (step) {
    case 1:
      return <Step1Period ctx={ctx} />
    case 2:
      return <Step2Confirm ctx={ctx} />
    case 3:
      return <Step3Variance ctx={ctx} />
    case 4:
      return <Step4Branding ctx={ctx} />
    case 5:
      return <Step5Generate ctx={ctx} />
    default:
      return null
  }
}
