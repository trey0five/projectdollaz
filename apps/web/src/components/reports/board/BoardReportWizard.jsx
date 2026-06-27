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
  // Editable BoardReport state (synced from the bundle on load).
  reportTitle: '',
  committeeName: '',
  mdaText: '',
  mdaSource: null,
  explanations: { revenue: {}, expense: {} },
  // Sync bookkeeping (render-time sync-on-key).
  syncedKey: null,
}

function reducer(state, action) {
  switch (action.type) {
    case 'setStep':
      return { ...state, step: action.step }
    case 'setPeriod':
      // New period -> jump to step 1's selection, reset sync so the next bundle hydrates.
      return { ...state, periodId: action.periodId, syncedKey: null }
    case 'sync':
      // Render-time hydrate from a freshly-assembled bundle (sync-on-key).
      return {
        ...state,
        syncedKey: action.key,
        reportTitle: action.reportTitle,
        committeeName: action.committeeName,
        mdaText: action.mdaText,
        mdaSource: action.mdaSource,
        explanations: action.explanations,
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
    default:
      return state
  }
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

  const { data, loading, notEntitled, save } = useBoardReport(schoolId, draft.periodId)

  // ── Render-time sync-on-key: fold the bundle's editable fields into the draft
  // exactly once per (period + load). No setState-in-effect. ──────────────────
  const loadKey = data ? `${data.periodId}` : null
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
  const signal = JSON.stringify(editablePayload(draft))
  const synced = data && draft.syncedKey === loadKey
  const { saving, error: saveError, saveNow } = useAutosave({
    enabled: canEdit && !!schoolId && !!draft.periodId && synced,
    dirty: synced,
    signal,
    delay: 900,
    save: async () => {
      await save(editablePayload(draft))
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
