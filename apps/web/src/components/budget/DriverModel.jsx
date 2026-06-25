// ─────────────────────────────────────────────────────────────────────────────
// Driver Model tab — assumptions in → computed category budget out, with a LIVE
// preview and an "Apply to budget" action that PUTs to the server (authoritative
// recompute) and refreshes the budget so the Monthly Spread / Budget-vs-Actual /
// Organizational Roll-up tabs reflect it.
//
// SINGLE SOURCE OF TRUTH for the math: computeDriverBudget from @finrep/analytics
// is imported and used for the live preview, so the on-screen numbers match what
// the server stores. We never duplicate the formula here.
//
// React-Compiler safety:
//   • subcomponents are module-scope (DriverAssumptionsForm / DriverPreview);
//     this file only uses render-HELPER functions returning keyed JSX.
//   • the preview is DERIVED at render via useMemo — no effects, no setState.
//   • assumptions are seeded from async budgetContext using the established
//     microtask-deferred sync-on-key pattern (mirrors BudgetPage's period sync):
//     a cancellable Promise.resolve().then(setState), never a synchronous
//     setState in the effect body.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Calculator, Sparkles, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import { computeDriverBudget } from '@finrep/analytics'
import { analyticsApi } from '../../lib/api.js'
import DriverAssumptionsForm from './DriverAssumptionsForm.jsx'
import DriverPreview from './DriverPreview.jsx'
import {
  seedAssumptions,
  toDriverPriorContext,
  programSplitSum,
} from './driverModel.js'

// Compute the preview defensively: computeDriverBudget is added to
// @finrep/analytics concurrently. If it is not yet a function in the consumed
// build, return null so the UI degrades to "preview pending" instead of throwing.
function safeCompute(assumptions, prior) {
  if (typeof computeDriverBudget !== 'function') return null
  try {
    return computeDriverBudget(assumptions, prior)
  } catch {
    return null
  }
}

export default function DriverModel({
  schoolId,
  periodId,
  canEdit,
  budgetContext,
  savedAssumptions,
  onApplied,
}) {
  // Initial assumptions: a previously-applied/saved set round-trips first; else
  // seed from prior-year context. Re-seeded when the school/period changes OR when
  // saved/context data first arrives for the current key (and the form is
  // pristine). Microtask-deferred setState (sync-on-key pattern).
  const initial = () => savedAssumptions ?? seedAssumptions(budgetContext)
  const [assumptions, setAssumptions] = useState(initial)
  const touchedRef = useRef(false)
  const seedKeyRef = useRef(`${schoolId}:${periodId}`)

  useEffect(() => {
    let cancelled = false
    const key = `${schoolId}:${periodId}`
    Promise.resolve().then(() => {
      if (cancelled) return
      if (key !== seedKeyRef.current) {
        // School/period changed → reset and seed fresh (saved wins if present).
        seedKeyRef.current = key
        touchedRef.current = false
        setAssumptions(savedAssumptions ?? seedAssumptions(budgetContext))
      } else if (!touchedRef.current && (savedAssumptions || budgetContext)) {
        // Saved assumptions / context arrived for the same key, form pristine → seed.
        setAssumptions(savedAssumptions ?? seedAssumptions(budgetContext))
      }
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, periodId, budgetContext, savedAssumptions])

  const onAssumptionsChange = useCallback((next) => {
    touchedRef.current = true
    setAssumptions(next)
  }, [])

  const onOverridesChange = useCallback((nextOverrides) => {
    touchedRef.current = true
    setAssumptions((cur) => ({ ...cur, overrides: nextOverrides }))
  }, [])

  // Narrow prior context once per context change; derive the live preview.
  const prior = useMemo(() => toDriverPriorContext(budgetContext), [budgetContext])
  const result = useMemo(() => safeCompute(assumptions, prior), [assumptions, prior])

  // Apply state machine.
  const [applyState, setApplyState] = useState('idle') // idle | saving | success | error
  const [applyError, setApplyError] = useState('')

  const splitSum = programSplitSum(assumptions.tuitionProgramSplit)
  const splitOk = Math.abs(splitSum - 100) < 0.01
  const canApply = canEdit && splitOk && result != null && applyState !== 'saving'

  const onApply = useCallback(async () => {
    if (!schoolId || !periodId || !splitOk) return
    setApplyState('saving')
    setApplyError('')
    try {
      await analyticsApi.saveDriverBudget(schoolId, periodId, { assumptions })
      setApplyState('success')
      if (onApplied) onApplied()
    } catch (e) {
      setApplyState('error')
      const msg =
        e?.response?.data?.message ??
        (Array.isArray(e?.response?.data?.message) ? e.response.data.message.join('; ') : null) ??
        'Could not apply the driver budget. Please review the inputs and try again.'
      setApplyError(typeof msg === 'string' ? msg : 'Could not apply the driver budget.')
    }
  }, [schoolId, periodId, splitOk, assumptions, onApplied])

  // ── Render helpers (NOT components) ─────────────────────────────────────────
  const renderApplyBar = () => (
    <div key="apply-bar" className="card-soft sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 border-gold/40 bg-white/95 p-4 shadow-glow backdrop-blur">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-gradient text-white">
          <Sparkles size={17} />
        </span>
        <div>
          <p className="font-serif text-[15px] font-semibold text-navy">Apply to budget</p>
          <p className="text-[12px] text-muted">
            Saves these numbers as this period&rsquo;s budget and updates the Monthly Spread,
            Budget vs. Actual, and Roll-up tabs.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {applyState === 'success' && (
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-emerald-600">
            <CheckCircle2 size={16} /> Applied — other tabs updated.
          </span>
        )}
        {applyState === 'error' && (
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-rose-600">
            <AlertTriangle size={16} /> {applyError}
          </span>
        )}
        {!canEdit && (
          <span className="text-[12px] italic text-muted">View-only — owner/accountant can apply.</span>
        )}
        <button
          type="button"
          onClick={onApply}
          disabled={!canApply}
          className="btn-primary flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {applyState === 'saving' ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Applying…
            </>
          ) : (
            'Apply to budget'
          )}
        </button>
      </div>
    </div>
  )

  return (
    <motion.div
      key="driver"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-5"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-gradient text-gold-light">
          <Calculator size={20} />
        </span>
        <div>
          <h3 className="font-serif text-lg font-semibold text-navy">Build your budget</h3>
          <p className="text-[13px] text-muted">
            Answer a few questions on the left and we&rsquo;ll calculate the budget on the right —
            no spreadsheet needed.
          </p>
        </div>
      </div>

      {/* Plain-language "how this works" — for non-accountants. */}
      <div className="card-soft border-gold/30 bg-gold/[0.05] p-4">
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-navy">
          How this works
        </p>
        <ol className="grid grid-cols-1 gap-2 text-[13px] text-ink sm:grid-cols-2">
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold-gradient text-[11px] font-bold text-white">1</span>
            Enter how many <strong>students</strong> per grade and your <strong>tuition prices</strong> — we add up your tuition.
          </li>
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold-gradient text-[11px] font-bold text-white">2</span>
            Add your <strong>staff counts and pay</strong> — we calculate salaries and benefits.
          </li>
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold-gradient text-[11px] font-bold text-white">3</span>
            Everything else <strong>grows from last year</strong> automatically (you can tweak any line).
          </li>
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold-gradient text-[11px] font-bold text-white">4</span>
            Hit <strong>Apply</strong> to set this period&rsquo;s budget — it flows into the other tabs.
          </li>
        </ol>
      </div>

      {result == null && (
        <div className="card-soft border-dashed border-amber-300 bg-amber-50/50 px-4 py-3">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-700">
            <AlertTriangle size={13} />
            Live preview pending — the compute engine is finishing integration. Your assumptions still
            apply server-side on save.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(340px,420px)_1fr]">
        <div>
          <DriverAssumptionsForm
            assumptions={assumptions}
            onChange={onAssumptionsChange}
            disabled={!canEdit}
          />
        </div>
        <div>
          <DriverPreview
            result={result}
            overrides={assumptions.overrides}
            onOverrideChange={onOverridesChange}
            disabled={!canEdit}
          />
        </div>
      </div>

      {renderApplyBar()}
    </motion.div>
  )
}
