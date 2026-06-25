// ─────────────────────────────────────────────────────────────────────────────
// BudgetWizard — the GUIDED, beginner-facing flow that fills the ONE budget for a
// (school, period). A thin linear sequencer over EXISTING pieces — it reuses, and
// never reinvents:
//   • DriverAssumptionsForm (one section per step, via its `sections` prop)
//   • computeDriverBudget (the only math) for the running mini-preview + Review
//   • DriverPreview for the friendly Review recap
//   • BudgetImport for the upload path (drop → preview → confirm PUT)
//   • seedAssumptions / toDriverPriorContext / programSplitSum / analyticsApi
//
// TWO PATHS, ONE DESTINATION (not one Review component):
//   • Upload path: hosts <BudgetImport>. BudgetSpreadPreview IS the review and its
//     Confirm IS the apply (it PUTs the spread). onImported → onApplied. There is
//     deliberately no driver-style Review for the upload path — an imported sheet
//     has accounts, not assumptions/KPIs, so forcing it through DriverPreview is
//     wrong. Both paths just END at the same place (the shell shows BudgetSummary).
//   • Questions path: 5 driver steps → a real DriverPreview Review with an
//     "Apply this budget" button (analyticsApi.saveDriverBudget) → onApplied.
//
// React-Compiler safety:
//   • Step bodies are render-helper functions returning keyed JSX; every nested
//     component (steps chrome, MiniPreview) is module-scope.
//   • The ONLY setState-in-effect is the established microtask-deferred
//     sync-on-key re-seed (lifted verbatim from DriverModel) — it also resets the
//     path/step on a school/period switch so a stale upload step can't target the
//     wrong period.
//   • The preview is DERIVED via useMemo — no preview state, no setState in render.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, UploadCloud, ListChecks, ArrowLeft } from 'lucide-react'
import { computeDriverBudget } from '@finrep/analytics'
import { analyticsApi } from '../../../lib/api.js'
import DriverAssumptionsForm from '../DriverAssumptionsForm.jsx'
import DriverPreview from '../DriverPreview.jsx'
import BudgetImport from '../BudgetImport.jsx'
import { seedAssumptions, toDriverPriorContext, programSplitSum } from '../driverModel.js'
import { WizardProgress, MiniPreview, WizardStep, WizardNav, OverwriteNotice } from './WizardChrome.jsx'

// One topic per question step. `section` selects the matching DriverAssumptionsForm
// slice; `splitGate` marks the step whose Next is gated on the program split === 100.
const QUESTION_STEPS = [
  { key: 'students', section: 'enrollment', title: 'How many students?', hint: 'Enter how many students you expect in each grade. This sets your tuition.' },
  { key: 'tuition', section: 'tuition', title: 'Tuition prices', hint: 'Your yearly tuition by grade group, plus any extra per-student fees.' },
  { key: 'split', section: 'split', title: 'How tuition gets paid', hint: 'Split your tuition by who pays. These must add up to 100%.', splitGate: true },
  { key: 'staff', section: 'staffing', title: 'Staff & pay', hint: 'How many staff in each role and their average pay. We add benefits on top.' },
  { key: 'other', section: 'inflation', title: 'Everything else', hint: 'We grow all your other budget lines from last year by this amount.' },
]
const PROGRESS_LABELS = [...QUESTION_STEPS.map((s) => s.title.replace(/\?$/, '')), 'Review']
const REVIEW_IDX = QUESTION_STEPS.length

// Compute the preview defensively (mirrors DriverModel): if computeDriverBudget
// isn't a function in the consumed build, degrade to "preview pending".
function safeCompute(assumptions, prior) {
  if (typeof computeDriverBudget !== 'function') return null
  try {
    return computeDriverBudget(assumptions, prior)
  } catch {
    return null
  }
}

export default function BudgetWizard({
  schoolId,
  periodId,
  canEdit,
  budgetContext,
  savedAssumptions,
  // `budget` is part of the contract (the full saved record) but the wizard only
  // needs the slices the shell already derives for us — savedAssumptions (driver
  // round-trip) and priorSource (overwrite notice). Accepted, intentionally unused.
  // eslint-disable-next-line no-unused-vars
  budget,
  priorSource,
  onApplied,
}) {
  const [path, setPath] = useState(null) // null | 'upload' | 'questions'
  const [stepIdx, setStepIdx] = useState(0)

  // Assumptions: saved set round-trips first; else seed from prior-year context.
  // Re-seeded on key change / late-arriving data while pristine (sync-on-key).
  const [assumptions, setAssumptions] = useState(() => savedAssumptions ?? seedAssumptions(budgetContext))
  const touchedRef = useRef(false)
  const seedKeyRef = useRef(`${schoolId}:${periodId}`)

  useEffect(() => {
    let cancelled = false
    const key = `${schoolId}:${periodId}`
    Promise.resolve().then(() => {
      if (cancelled) return
      if (key !== seedKeyRef.current) {
        // School/period changed → reset the whole wizard for the new key so a
        // mid-flow switch can't carry answers or a stale upload step across.
        seedKeyRef.current = key
        touchedRef.current = false
        setAssumptions(savedAssumptions ?? seedAssumptions(budgetContext))
        setPath(null)
        setStepIdx(0)
      } else if (!touchedRef.current && (savedAssumptions || budgetContext)) {
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

  // Derived running preview — no effects, no stored preview state.
  const prior = useMemo(() => toDriverPriorContext(budgetContext), [budgetContext])
  const result = useMemo(() => safeCompute(assumptions, prior), [assumptions, prior])

  const splitOk = Math.abs(programSplitSum(assumptions.tuitionProgramSplit) - 100) < 0.01

  // Apply state machine (questions path) — same shape as DriverModel.
  const [applyState, setApplyState] = useState('idle') // idle | saving | success | error
  const [applyError, setApplyError] = useState('')

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
      const raw = e?.response?.data?.message
      const msg = Array.isArray(raw)
        ? raw.join('; ')
        : typeof raw === 'string'
          ? raw
          : 'Could not apply the budget. Please review the inputs and try again.'
      setApplyError(msg)
    }
  }, [schoolId, periodId, splitOk, assumptions, onApplied])

  const handleImported = useCallback(() => {
    if (onApplied) onApplied()
  }, [onApplied])

  // ── Navigation handlers ────────────────────────────────────────────────────
  const goBack = useCallback(() => {
    setStepIdx((i) => {
      if (i > 0) return i - 1
      setPath(null)
      return 0
    })
  }, [])
  const goNext = useCallback(() => setStepIdx((i) => i + 1), [])

  // ── Step 0: choose how to start ─────────────────────────────────────────────
  const renderStart = () => (
    <motion.div
      key="start"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-5"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-gradient text-gold-light">
          <Sparkles size={20} />
        </span>
        <div>
          <h3 className="font-serif text-lg font-semibold text-navy">Let&rsquo;s set up your budget</h3>
          <p className="text-[13px] text-muted">Pick how you&rsquo;d like to start — you can always switch.</p>
        </div>
      </div>

      {!canEdit && (
        <div className="card-soft border-dashed px-4 py-3 text-center">
          <p className="text-[13px] italic text-muted">
            Setting up a budget is available to owners and accountants. You can still explore below.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => {
            setPath('questions')
            setStepIdx(0)
          }}
          className="card-soft group flex flex-col items-start gap-3 p-5 text-left transition-shadow hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold-gradient text-white shadow-glow">
            <ListChecks size={24} />
          </span>
          <div>
            <p className="font-serif text-[16px] font-semibold text-navy">Answer a few questions</p>
            <p className="mt-0.5 text-[13px] text-muted">
              We&rsquo;ll ask about students, tuition, and staff, then calculate the budget for you. No
              spreadsheet needed.
            </p>
          </div>
        </button>

        <button
          type="button"
          disabled={!canEdit}
          onClick={() => {
            setPath('upload')
            setStepIdx(0)
          }}
          className="card-soft group flex flex-col items-start gap-3 p-5 text-left transition-shadow hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-navy-gradient text-gold-light">
            <UploadCloud size={24} />
          </span>
          <div>
            <p className="font-serif text-[16px] font-semibold text-navy">Upload what I have</p>
            <p className="mt-0.5 text-[13px] text-muted">
              Drop an .xlsx budget spreadsheet — monthly, annual-only, or just labels — and we&rsquo;ll
              pull in the numbers.
            </p>
          </div>
        </button>
      </div>
    </motion.div>
  )

  // ── Upload path ─────────────────────────────────────────────────────────────
  const renderUpload = () => (
    <motion.div
      key="upload"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-4"
    >
      <button type="button" onClick={() => setPath(null)} className="btn-ghost inline-flex items-center gap-2 text-[13px]">
        <ArrowLeft size={15} /> Start over
      </button>
      <div>
        <h3 className="font-serif text-lg font-semibold text-navy">Upload your budget spreadsheet</h3>
        <p className="text-[13px] text-muted">
          Confirming the preview below sets it as this period&rsquo;s budget.
        </p>
      </div>
      <OverwriteNotice priorSource={priorSource} nextKind="import" />
      <BudgetImport schoolId={schoolId} periodId={periodId} canEdit={canEdit} onImported={handleImported} />
    </motion.div>
  )

  // ── Questions path ──────────────────────────────────────────────────────────
  const renderQuestionStep = () => {
    const step = QUESTION_STEPS[stepIdx]
    return (
      <WizardStep
        title={step.title}
        hint={step.hint}
        preview={<MiniPreview result={result} />}
      >
        <DriverAssumptionsForm
          assumptions={assumptions}
          onChange={onAssumptionsChange}
          disabled={!canEdit}
          sections={[step.section]}
        />
        {step.splitGate && !splitOk && (
          <p className="text-[12px] font-medium text-amber-700">
            These need to add up to 100% before you can continue.
          </p>
        )}
        <WizardNav
          onBack={goBack}
          onNext={goNext}
          nextLabel={stepIdx === QUESTION_STEPS.length - 1 ? 'Review' : 'Next'}
          nextDisabled={step.splitGate && !splitOk}
        />
      </WizardStep>
    )
  }

  const renderReview = () => (
    <WizardStep
      title="Review your budget"
      hint="Here's what we calculated. Tweak any line, then apply it as this period's budget."
    >
      <OverwriteNotice priorSource={priorSource} nextKind="driver" />
      <DriverPreview
        result={result}
        overrides={assumptions.overrides}
        onOverrideChange={onOverridesChange}
        disabled={!canEdit}
      />
      <WizardNav
        onBack={goBack}
        onNext={onApply}
        nextLabel="Apply this budget"
        isApply
        nextDisabled={!canEdit || !splitOk || result == null || applyState === 'saving'}
        applyState={applyState}
        applyError={applyError}
        showApplyHint={!canEdit}
      />
    </WizardStep>
  )

  // ── Top-level render ────────────────────────────────────────────────────────
  if (path === null) return renderStart()
  if (path === 'upload') return renderUpload()

  // Questions path: progress rail + the active step (or Review).
  return (
    <div className="space-y-5">
      <div className="card-soft p-3.5">
        <WizardProgress steps={PROGRESS_LABELS} current={Math.min(stepIdx, REVIEW_IDX)} />
      </div>
      {stepIdx >= REVIEW_IDX ? renderReview() : renderQuestionStep()}
    </div>
  )
}
