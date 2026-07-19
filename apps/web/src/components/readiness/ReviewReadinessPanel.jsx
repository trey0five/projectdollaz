// ─────────────────────────────────────────────────────────────────────────────
// ReviewReadinessPanel — the Florida scholarship AUP self-check, redesigned as a
// GUIDED WIZARD. A first-time user should immediately understand "am I ready, and
// what do I do next?" The flow follows the natural order: enter data → reconcile →
// review findings → resolve exceptions → checklist & export. A flashy hero shows
// the $250k verdict + progress ring + one next-action CTA; a stepper lets you
// move freely (all readiness data is editable anytime). Each step reuses its
// existing self-contained panel; only the active step renders.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileDown,
  PenLine,
  Scale,
  ShieldCheck,
  Wrench,
} from 'lucide-react'
import { useSchools } from '../../context/SchoolContext.jsx'
import { useBilling } from '../../context/BillingContext.jsx'
import { usePersistence } from '../../context/PersistenceContext.jsx'
import { useCompliance, useComplianceInputs } from '../../hooks/useCompliance.js'
import { useCorrectiveActionPlan } from '../../hooks/useCorrectiveActionPlan.js'
import { useChecklist } from '../../hooks/useChecklist.js'
import { useReconciliation } from '../../hooks/useReconciliation.js'
import { sectionTitle } from '../../lib/complianceMeta.js'
import MetricSection from '../analytics/MetricSection.jsx'
import EntitlementPausedPanel from '../analytics/EntitlementPausedPanel.jsx'
import ContextBar from '../analytics/ContextBar.jsx'
import { HeadlineSkeleton, MetricCardSkeleton } from '../analytics/skeletons.jsx'
import DisclaimerBanner from './DisclaimerBanner.jsx'
import ReadinessSummary from './ReadinessSummary.jsx'
import ComplianceIntakePanel from './ComplianceIntakePanel.jsx'
import ScholarshipReconciliationSection from './reconciliation/ScholarshipReconciliationSection.jsx'
import CorrectiveActionPlanSection from './cap/CorrectiveActionPlanSection.jsx'
import YearEndChecklistSection from './checklist/YearEndChecklistSection.jsx'
import RuleRow from './RuleRow.jsx'
import BackLink from '../ui/BackLink.jsx'
import ReadinessWizardHero from './wizard/ReadinessWizardHero.jsx'
import ReadinessStepper from './wizard/ReadinessStepper.jsx'

// ── Step catalog. `key` also selects the panel; `title`/`why` drive the intro. ──
const STEPS = [
  {
    key: 'intake',
    label: 'Your numbers',
    hint: 'Enter & attest',
    Icon: PenLine,
    title: 'Enter your numbers',
    why: 'The $250k trigger, your program tiers, and a few Yes/No attestations. Every readiness check below is computed from what you enter here.',
  },
  {
    key: 'reconciliation',
    label: 'Reconcile',
    hint: 'Match funds',
    Icon: Scale,
    title: 'Reconcile your scholarships',
    why: 'Upload the Step Up For Students disbursement detail and match it against the scholarship revenue recorded on your books.',
  },
  {
    key: 'findings',
    label: 'Readiness',
    hint: 'Review findings',
    Icon: ShieldCheck,
    title: 'Review your readiness',
    why: 'How each AUP procedure looks against your data. Green passes; amber and red need attention before your CPA engagement.',
  },
  {
    key: 'cap',
    label: 'Corrective',
    hint: 'Resolve issues',
    Icon: Wrench,
    title: 'Resolve exceptions',
    why: 'For anything reportable or material, record a corrective action plan your CPA can rely on.',
  },
  {
    key: 'checklist',
    label: 'Checklist',
    hint: 'Attest & export',
    Icon: ClipboardCheck,
    title: 'Complete the checklist & export',
    why: 'Attest the remaining procedures, gather the supporting documents, then export the workpapers packet for your CPA.',
  },
]
const STEP_ORDER = STEPS.map((s) => s.key)

// Intake is "complete" when every REQUIRED input is answered (null = unanswered).
// Some fields only apply conditionally (see the compliance ruleset).
function intakeComplete(inputs) {
  if (!inputs) return false
  const answered = (v) => v !== null && v !== undefined && v !== ''
  if (!answered(inputs.scholarshipFundsReceived)) return false
  if (!answered(inputs.yearsInOperation)) return false
  const core = [
    'fundsAtInsuredInstitution',
    'avgDailyBalanceOver250k',
    'reconciledWithin60Days',
    'reconciliationIndependentlyReviewed',
    'doeStatusApproved',
  ]
  for (const k of core) if (inputs[k] === null || inputs[k] === undefined) return false
  if (inputs.avgDailyBalanceOver250k === true && inputs.bankRatingReviewedTopTwo == null) return false
  if (Number(inputs.yearsInOperation) < 3 && inputs.suretyBondPosted == null) return false
  if ((inputs.programs || []).includes('FES_UA') && inputs.fesuaAnyAccountOver50k == null) return false
  return true
}

function PageHeader() {
  return (
    <div className="mb-5">
      <BackLink className="mb-4" />
      <div className="flex items-center gap-2.5">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-gradient text-white shadow-glow">
          <ShieldCheck size={22} />
        </span>
        <div>
          <h1 className="font-serif text-xl font-semibold text-navy sm:text-2xl">Review Readiness</h1>
          <p className="text-[15px] text-muted">
            A guided self-check against the Florida scholarship AUP — before your CPA engagement.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function ReviewReadinessPanel() {
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null
  const reduce = useReducedMotion()
  const { loading: billingLoading, entitled } = useBilling()
  const { periods, hydrating } = usePersistence()

  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'

  const savedPeriods = useMemo(() => (periods || []).filter((p) => p.hasSnapshot), [periods])

  const [selectedPeriodId, setSelectedPeriodId] = useState(null)
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      if (savedPeriods.length === 0) {
        setSelectedPeriodId((cur) => (cur === null ? cur : null))
      } else {
        setSelectedPeriodId((cur) => (savedPeriods.some((p) => p.id === cur) ? cur : savedPeriods[0].id))
      }
    })
    return () => {
      cancelled = true
    }
  }, [savedPeriods])

  const {
    data,
    sections,
    summary,
    loading: complianceLoading,
    notEntitled: complianceBlocked,
    reload,
  } = useCompliance(schoolId, selectedPeriodId)

  const {
    inputs,
    loading: inputsLoading,
    notEntitled: inputsBlocked,
    reload: reloadInputs,
  } = useComplianceInputs(schoolId, selectedPeriodId)

  const notEntitled = complianceBlocked || inputsBlocked

  // Progress signals for step-gating (self-fetching status hooks).
  const { summary: capSummary } = useCorrectiveActionPlan(schoolId, selectedPeriodId)
  const { rollup: checklistRollup } = useChecklist(schoolId, selectedPeriodId)
  const { result: reconResult } = useReconciliation(schoolId, selectedPeriodId)

  // ── Active step. Resets to the first step when the period changes (render-time
  //    adjustment per React docs — avoids a cascading effect). ──
  const [step, setStep] = useState('intake')
  const [prevPeriodId, setPrevPeriodId] = useState(selectedPeriodId)
  if (selectedPeriodId !== prevPeriodId) {
    setPrevPeriodId(selectedPeriodId)
    setStep('intake')
  }

  // ── Entitlement gate ───────────────────────────────────────────────────────
  if (!billingLoading && (!entitled || notEntitled)) {
    return (
      <div className="mx-auto max-w-page px-4 py-8 sm:px-10">
        <PageHeader />
        <EntitlementPausedPanel />
      </div>
    )
  }

  const initialLoading = billingLoading || hydrating

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!initialLoading && savedPeriods.length === 0) {
    return (
      <div className="mx-auto max-w-page px-4 py-8 sm:px-10">
        <PageHeader />
        <div className="card-soft border-dashed px-6 py-14 text-center">
          <p className="font-serif text-lg italic text-muted">No saved statements yet.</p>
          <p className="mt-1 text-[15px] text-muted">
            Generate and save a period on the dashboard to begin your readiness check.
          </p>
          <Link to="/app" className="btn-primary mt-6">
            Go to dashboard
          </Link>
        </div>
      </div>
    )
  }

  const showSkeleton = initialLoading || ((complianceLoading || inputsLoading) && !data)

  // ── Derived readiness state (only meaningful once data is present) ──────────
  const counts = summary?.counts ?? {}
  const hasFigure =
    inputs?.scholarshipFundsReceived !== null && inputs?.scholarshipFundsReceived !== undefined
  const requiresAup = Boolean(summary?.requiresAup)

  const capNoExceptions = (capSummary?.materialCount ?? 0) + (capSummary?.reportableCount ?? 0) === 0
  const doneMap = {
    intake: intakeComplete(inputs),
    reconciliation: reconResult?.status === 'matched',
    findings: (counts.needs_data ?? 0) === 0 && intakeComplete(inputs),
    cap:
      capNoExceptions ||
      ((capSummary?.openCount ?? 0) === 0 && (capSummary?.inProgressCount ?? 0) === 0),
    checklist: (checklistRollup?.pctComplete ?? 0) === 100,
  }
  const doneCount = STEP_ORDER.filter((k) => doneMap[k]).length
  const allDone = doneCount === STEP_ORDER.length
  const nextIncomplete = STEP_ORDER.find((k) => !doneMap[k]) || null

  const stepMeta = STEPS.map((s) => ({ ...s, done: doneMap[s.key] }))
  const activeIdx = STEP_ORDER.indexOf(step)
  const activeStep = STEPS[activeIdx] ?? STEPS[0]

  const openExport = () => {
    if (selectedPeriodId) window.open(`/readiness/workpapers/print?period=${selectedPeriodId}`, '_blank')
  }
  const goNextIncomplete = () => {
    if (allDone) openExport()
    else if (nextIncomplete) setStep(nextIncomplete)
  }
  const nextIncompleteTitle = nextIncomplete
    ? STEPS.find((s) => s.key === nextIncomplete)?.title
    : null

  const panelMotion = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -8 },
      }

  return (
    <div className="mx-auto max-w-page px-4 py-8 sm:px-10">
      <PageHeader />

      {!showSkeleton && savedPeriods.length > 0 && (
        <div className="mb-4">
          <ContextBar
            periods={savedPeriods}
            activePeriodId={selectedPeriodId}
            onSelectPeriod={setSelectedPeriodId}
          />
        </div>
      )}

      {showSkeleton ? (
        <div className="space-y-6">
          <HeadlineSkeleton />
          <div className="grid grid-cols-1 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <MetricCardSkeleton key={i} />
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── HERO: verdict + progress + next action ── */}
          <ReadinessWizardHero
            hasFigure={hasFigure}
            requiresAup={requiresAup}
            scholarshipFunds={inputs?.scholarshipFundsReceived}
            doneCount={doneCount}
            totalSteps={STEP_ORDER.length}
            allDone={allDone}
            nextLabel={nextIncompleteTitle ? `Continue — ${nextIncompleteTitle}` : 'Review'}
            onNext={goNextIncomplete}
            rulesetVersion={data?.rulesetVersion}
            statuteYear={data?.statuteYear}
          />

          <DisclaimerBanner />

          {/* ── STEPPER ── */}
          <div className="sticky top-2 z-10">
            <ReadinessStepper
              steps={stepMeta}
              current={step}
              onGoTo={setStep}
              panelId="readiness-wizard-panel"
            />
          </div>

          {/* ── ACTIVE STEP ── */}
          <div id="readiness-wizard-panel" role="tabpanel" aria-labelledby={`readiness-tab-${step}`}>
            {/* Step intro */}
            <div className="mb-4">
              <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#2563eb]">
                Step {activeIdx + 1} of {STEP_ORDER.length}
                {doneMap[step] ? ' · Complete' : ''}
              </p>
              <h2 className="mt-1 font-serif text-[24px] font-semibold text-navy sm:text-[28px]">
                {activeStep.title}
              </h2>
              <p className="mt-1 max-w-2xl text-[15px] leading-relaxed text-muted">{activeStep.why}</p>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={panelMotion.initial}
                animate={panelMotion.animate}
                exit={panelMotion.exit}
                transition={{ duration: reduce ? 0.15 : 0.25 }}
              >
                {step === 'intake' && (
                  <ComplianceIntakePanel
                    schoolId={schoolId}
                    periodId={selectedPeriodId}
                    periodLabel={data?.label}
                    inputs={inputs}
                    loading={inputsLoading}
                    canEdit={canEdit}
                    reloadInputs={reloadInputs}
                    onSaved={reload}
                  />
                )}

                {step === 'reconciliation' && selectedPeriodId && (
                  <ScholarshipReconciliationSection
                    schoolId={schoolId}
                    periodId={selectedPeriodId}
                    canEdit={canEdit}
                    onRecordedChanged={async () => {
                      await reloadInputs()
                      await reload()
                    }}
                  />
                )}

                {step === 'findings' && (
                  <div className="space-y-6">
                    <ReadinessSummary summary={summary} />
                    {sections.map((group) => (
                      <MetricSection
                        key={group.section}
                        title={`${group.section} · ${sectionTitle(group.section)}`}
                        subtitle={`${group.findings.length} ${group.findings.length === 1 ? 'check' : 'checks'}`}
                      >
                        <div className="space-y-3">
                          {group.findings.map((f, i) => (
                            <RuleRow key={f.id} finding={f} index={i} />
                          ))}
                        </div>
                      </MetricSection>
                    ))}
                  </div>
                )}

                {step === 'cap' && selectedPeriodId && (
                  <div className="space-y-4">
                    {capNoExceptions && (
                      <div className="flex items-start gap-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 px-4 py-3">
                        <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
                        <p className="text-[15px] text-emerald-800">
                          <span className="font-semibold">No exceptions to correct.</span> Nothing
                          you entered is reportable or material — there's no corrective action plan
                          required for this engagement.
                        </p>
                      </div>
                    )}
                    <CorrectiveActionPlanSection
                      schoolId={schoolId}
                      periodId={selectedPeriodId}
                      canEdit={canEdit}
                    />
                  </div>
                )}

                {step === 'checklist' && selectedPeriodId && (
                  <div className="space-y-5">
                    <YearEndChecklistSection
                      schoolId={schoolId}
                      periodId={selectedPeriodId}
                      canEdit={canEdit}
                    />
                    {/* Finish line: the workpapers export, spotlighted once everything
                        is complete. */}
                    <div
                      className={`flex flex-col items-start gap-3 rounded-2xl border-2 p-5 sm:flex-row sm:items-center sm:justify-between ${
                        allDone ? 'border-emerald-200 bg-emerald-50' : 'border-rule bg-white'
                      }`}
                    >
                      <div>
                        <p className="font-serif text-lg font-semibold text-navy">
                          {allDone ? 'You’re ready for your CPA.' : 'Export the workpapers packet'}
                        </p>
                        <p className="mt-0.5 text-[14px] text-muted">
                          A single print/PDF bundle of your inputs, findings, reconciliation, CAP,
                          and checklist — hand it to your engaged CPA.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={openExport}
                        className="btn-primary inline-flex shrink-0 items-center gap-2"
                      >
                        <FileDown size={16} /> Export workpapers
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {/* ── Back / Next nav ── */}
            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => activeIdx > 0 && setStep(STEP_ORDER[activeIdx - 1])}
                disabled={activeIdx === 0}
                className="btn-ghost inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowLeft size={15} /> Back
              </button>
              {activeIdx < STEP_ORDER.length - 1 ? (
                <motion.button
                  type="button"
                  whileTap={reduce ? undefined : { scale: 0.97 }}
                  onClick={() => setStep(STEP_ORDER[activeIdx + 1])}
                  className="btn-primary inline-flex items-center gap-2"
                >
                  Next — {STEPS[activeIdx + 1].label} <ArrowRight size={15} />
                </motion.button>
              ) : (
                <motion.button
                  type="button"
                  whileTap={reduce ? undefined : { scale: 0.97 }}
                  onClick={openExport}
                  className="btn-primary inline-flex items-center gap-2"
                >
                  <FileDown size={15} /> Export workpapers
                </motion.button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
