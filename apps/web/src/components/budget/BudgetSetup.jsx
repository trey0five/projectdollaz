// BudgetSetup — the reusable BUDGET SETUP surface, lifted verbatim from the old
// Budget-page "Budget" tab so it can be embedded in the Data hub's Budget card.
//
// It owns the Guided/Advanced segmented control + the mode/guidedView state
// machine + renderGuided/renderAdvanced + the apply/import/clear/replace handlers
// + useBudget/useBudgetContext. It renders ONLY the setup surface (toggle + body)
// — no TopBar, no period selector, no tabs — so it drops cleanly into a modal.
//
// TOGGLE STATE MACHINE (React-Compiler safe — no setState in render/effect):
//   mode:       'guided' | 'advanced'          — the segmented control
//   guidedView: 'auto' | 'wizard'              — 'auto' DERIVES the effective view
//                                                 (summary when a budget exists,
//                                                 wizard otherwise). It only flips
//                                                 to 'wizard' from the Edit handler.
//   effectiveGuided is a PURE render derivation, never stored.
//
// After EVERY successful mutation (guided apply, advanced import, clear, replace-
// clear) we call the host's onSaved?.() in addition to our own reloadBudget(), so
// the embedding hub can re-pull its data-status and flip the Budget card to Done.
import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, Table2 } from 'lucide-react'
import MonthlySpreadGrid from './MonthlySpreadGrid.jsx'
import BudgetWizard from './wizard/BudgetWizard.jsx'
import BudgetImport from './BudgetImport.jsx'
import BudgetSummary from './BudgetSummary.jsx'
import { describeBudgetSource } from './budgetSource.js'
import { useBudget, useBudgetContext } from '../../hooks/useAnalytics.js'
import { analyticsApi } from '../../lib/api.js'

// Guided ⇄ Advanced segmented control options (module-scope so the React Compiler
// treats them as stable; the control itself is rendered via a render-helper).
const MODE_OPTIONS = [
  { id: 'guided', label: 'Guided', Icon: Sparkles },
  { id: 'advanced', label: 'Advanced', Icon: Table2 },
]

export default function BudgetSetup({ schoolId, periodId, canEdit, onSaved }) {
  // ── Budget surface state machine ────────────────────────────────────────────
  // `mode` is the Guided/Advanced segmented control. `guidedView` is 'auto'
  // (derive summary-vs-wizard from whether a budget exists) or 'wizard' (forced
  // open for an Edit). Both are read at render and set only from event handlers.
  const [mode, setMode] = useState('guided')
  const [guidedView, setGuidedView] = useState('auto')

  // Reset the surface to its default when the school/period changes (microtask-
  // deferred to satisfy the no-setState-in-effect rule). The wizard is
  // additionally keyed by school:period below to force a clean remount so no
  // in-flight answers carry across periods.
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      setMode('guided')
      setGuidedView('auto')
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, periodId])

  // Saved budget for the active school+period (the wizard, summary, spread all
  // derive from this).
  const { budget, loading: budgetLoading, reload: reloadBudget } = useBudget(
    schoolId,
    periodId,
  )
  const spread = budget?.lines?.spread ?? null

  // Prior actuals + enrollment/aid drivers — seeds the wizard's driver questions
  // (prefill) and feeds its live mini-preview.
  const { context: budgetContext } = useBudgetContext(schoolId, periodId)

  // The source of the currently-saved budget — passed to the wizard (overwrite
  // notice) and the spread grid (header badge). Memoized on the budget.
  const priorSource = useMemo(() => describeBudgetSource(budget), [budget])

  // Does a budget exist for this period? (drives the auto guided view + the
  // advanced empty note). A budget "exists" if it has a spread or rev/exp lines.
  const hasBudget = !!(
    budget?.lines &&
    (budget.lines.spread || budget.lines.revenue || budget.lines.expense)
  )

  // After a successful apply (driver save OR import confirm, fired by the
  // wizard), re-pull the saved budget and return to the auto guided view — which
  // now derives to the friendly summary, since hasBudget is true. onSaved?.()
  // also lets the host refresh its status.
  const onBudgetApplied = () => {
    reloadBudget()
    setGuidedView('auto')
    setMode('guided')
    onSaved?.()
  }

  // Import confirmed from the ADVANCED view — reload and STAY in Advanced so the
  // freshly imported spread grid renders.
  const onAdvancedImported = () => {
    reloadBudget()
    setGuidedView('auto')
    setMode('advanced')
    onSaved?.()
  }

  // Replace / redo setup: CLEARS the current period's budget immediately (lines +
  // totals → null), then opens the Guided wizard for a fresh start. Best-effort
  // wipe — if the clear request fails we still open the wizard.
  const onReplaceBudget = async () => {
    if (schoolId && periodId) {
      try {
        await analyticsApi.saveBudget(schoolId, periodId, {
          lines: null,
          totalRevenue: null,
          totalExpenses: null,
        })
        await reloadBudget()
        onSaved?.()
      } catch {
        /* best-effort — fall through and open the wizard anyway */
      }
    }
    setMode('guided')
    setGuidedView('wizard')
  }
  const onClearBudget = async () => {
    if (!schoolId || !periodId) return
    try {
      await analyticsApi.saveBudget(schoolId, periodId, {
        lines: null,
        totalRevenue: null,
        totalExpenses: null,
      })
      await reloadBudget()
      setMode('guided')
      setGuidedView('auto')
      onSaved?.()
    } catch {
      /* best-effort; the grid stays as-is on failure */
    }
  }

  // ── Render helpers (NOT components) ─────────────────────────────────────────

  // The Guided/Advanced segmented control.
  const renderModeToggle = () => (
    <div
      role="tablist"
      aria-label="Budget view mode"
      className="inline-flex items-center gap-1 rounded-2xl border border-gold/25 bg-navy-gradient p-1 shadow-navy-glow"
    >
      {MODE_OPTIONS.map((opt) => {
        const isActive = opt.id === mode
        const Icon = opt.Icon
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => setMode(opt.id)}
            className={`relative flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.1em] outline-none ring-gold/50 transition-colors focus-visible:ring-2 ${
              isActive ? 'text-navy' : 'text-white/70 hover:text-white'
            }`}
          >
            {isActive && (
              <motion.span
                layoutId="budget-mode-pill"
                className="absolute inset-0 rounded-xl bg-gold-gradient shadow-glow"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              <Icon size={14} />
              {opt.label}
            </span>
          </button>
        )
      })}
    </div>
  )

  // Advanced view body — the granular monthly spread (with a source badge), or a
  // short empty note pointing back to Guided when there's nothing to show.
  const renderAdvanced = () => {
    if (budgetLoading) {
      return (
        <div className="card-soft animate-pulse px-6 py-14 text-center">
          <p className="font-serif text-base italic text-muted">Loading the monthly spread…</p>
        </div>
      )
    }
    if (!spread) {
      // Advanced users can import a spreadsheet directly here — no detour through
      // Guided. On success we reload and STAY in Advanced so the fresh spread grid
      // appears. Read-only members get the pointer back to Guided instead.
      if (!canEdit) {
        return (
          <div className="card-soft border-dashed px-6 py-12 text-center">
            <p className="font-serif text-lg italic text-muted">
              No spreadsheet view for this budget yet.
            </p>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] text-muted">
              Importing a budget is available to owners and accountants.
            </p>
          </div>
        )
      }
      return (
        <div className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-serif text-lg font-semibold text-navy">Import a budget spreadsheet</h3>
            <button
              type="button"
              onClick={() => setMode('guided')}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted transition-colors hover:text-gold"
            >
              <Sparkles size={14} /> Prefer to answer a few questions? Go to Guided
            </button>
          </div>
          <BudgetImport
            schoolId={schoolId}
            periodId={periodId}
            canEdit={canEdit}
            onImported={onAdvancedImported}
          />
        </div>
      )
    }
    return (
      <MonthlySpreadGrid
        spread={spread}
        source={priorSource}
        onReimport={canEdit ? onReplaceBudget : undefined}
        onClear={canEdit ? onClearBudget : undefined}
      />
    )
  }

  // Guided view body — the friendly summary when a budget exists (unless an Edit
  // forced the wizard open), else the step-by-step wizard.
  const renderGuided = () => {
    if (budgetLoading) {
      return (
        <div className="card-soft animate-pulse px-6 py-14 text-center">
          <p className="font-serif text-base italic text-muted">Loading your budget…</p>
        </div>
      )
    }
    const effectiveGuided =
      guidedView === 'auto' ? (hasBudget ? 'summary' : 'wizard') : 'wizard'

    if (effectiveGuided === 'summary') {
      return (
        <BudgetSummary
          budget={budget}
          canEdit={canEdit}
          onEdit={onReplaceBudget}
          onViewAdvanced={() => setMode('advanced')}
        />
      )
    }
    return (
      <BudgetWizard
        key={`${schoolId}:${periodId}`}
        schoolId={schoolId}
        periodId={periodId}
        canEdit={canEdit}
        budgetContext={budgetContext}
        savedAssumptions={budget?.lines?.driverModel?.assumptions ?? null}
        budget={budget}
        priorSource={priorSource}
        onApplied={onBudgetApplied}
      />
    )
  }

  // Defensive guard — the hub also gates on periodId before mounting, but this is
  // belt-and-suspenders for a standalone use of the component.
  if (!periodId) {
    return (
      <div className="card-soft border-dashed px-6 py-14 text-center">
        <p className="font-serif text-lg italic text-muted">Select a period to set up its budget.</p>
      </div>
    )
  }

  return (
    <div id="budget-setup-panel" className="space-y-5">
      {/* id anchors Penny's "save your budget" glide. The actual save lives inside
          the wizard/import flow; the toggle row is the stable always-present anchor. */}
      <div id="budget-save-button" className="flex flex-wrap items-center justify-between gap-3">
        {renderModeToggle()}
        <p className="max-w-md text-[12px] text-muted">
          {mode === 'guided'
            ? 'A friendly, step-by-step setup — answer a few questions or upload what you have.'
            : 'The full accounts-by-month spread for accountants and power users.'}
        </p>
      </div>
      {mode === 'advanced' ? renderAdvanced() : renderGuided()}
    </div>
  )
}
