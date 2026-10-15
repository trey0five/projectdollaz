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
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  CloudUpload,
  FileDown,
  HandCoins,
  ListChecks,
  PenLine,
  Scale,
  ShieldCheck,
  Wrench,
  AlertTriangle,
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
import { HeadlineSkeleton, MetricCardSkeleton } from '../analytics/skeletons.jsx'
import DisclaimerBanner from './DisclaimerBanner.jsx'
import ReadinessSummary from './ReadinessSummary.jsx'
import ComplianceIntakePanel from './ComplianceIntakePanel.jsx'
import ScholarshipReconciliationSection from './reconciliation/ScholarshipReconciliationSection.jsx'
import CorrectiveActionPlanSection from './cap/CorrectiveActionPlanSection.jsx'
import YearEndChecklistSection from './checklist/YearEndChecklistSection.jsx'
import RuleRow from './RuleRow.jsx'
import { Button } from '../ui/surface/index.js'
import '../../styles/pending/b2-finance.css'
import ReadinessStepper from './wizard/ReadinessStepper.jsx'
import { useUiV2 } from '../../context/UiFlagContext.jsx'
import { addDataHref } from '../../lib/dataDestinations.js'
import {
  AuroraButton,
  AuroraEmpty,
  AuroraLightButton,
  AuroraSection,
  HowThisWorks,
  VerdictEm,
} from '../ui/aurora/index.js'
import {
  FinanceSubPage,
  FinanceSubBand,
  FinanceMore,
  FinancePeriodSwitch,
  yearName,
} from '../statements/financeSub.jsx'

// ── Step catalog. `key` also selects the panel; `title`/`why` drive the intro. ──
const STEPS = [
  {
    key: 'intake',
    label: 'Your numbers',
    hint: 'Enter & attest',
    Icon: PenLine,
    title: 'Enter your numbers',
    why: 'Scholarship funds, program tiers and a few Yes/No answers. Every check is worked out from these.',
  },
  {
    key: 'reconciliation',
    label: 'Reconcile',
    hint: 'Match funds',
    Icon: Scale,
    title: 'Reconcile your scholarships',
    why: 'Match the Step Up For Students payments to the scholarship income on your books.',
  },
  {
    key: 'findings',
    label: 'Readiness',
    hint: 'Review findings',
    Icon: ShieldCheck,
    title: 'Review your readiness',
    why: 'How each review step looks against your data. Amber and red need attention first.',
  },
  {
    key: 'cap',
    label: 'Corrective',
    hint: 'Fix what was found',
    Icon: Wrench,
    title: 'Fix what was found',
    why: 'For any serious finding or item to report, record how you will fix it.',
  },
  {
    key: 'checklist',
    label: 'Checklist',
    hint: 'Attest & export',
    Icon: ClipboardCheck,
    title: 'Finish the checklist and export',
    why: 'Confirm the last steps, gather documents, then export the packet for your CPA.',
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

const usd = (n) => `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

// The Readiness band for the early screens (gate, no saved year): title, one
// sentence, no figures.
function ReadinessBand({ verdict }) {
  return <FinanceSubBand eyebrow="Florida scholarship review" title="Readiness" verdict={verdict} />
}

export default function ReviewReadinessPanel() {
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null
  const reduce = useReducedMotion()
  const { loading: billingLoading, entitled } = useBilling()
  const { periods, hydrating } = usePersistence()

  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'
  const uiV2 = useUiV2()

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
      <FinanceSubPage crumb="Readiness">
        <ReadinessBand verdict="Readiness is paused on this plan." />
        <div className="mt-8">
          <EntitlementPausedPanel />
        </div>
      </FinanceSubPage>
    )
  }

  const initialLoading = billingLoading || hydrating

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!initialLoading && savedPeriods.length === 0) {
    return (
      <FinanceSubPage crumb="Readiness">
        <ReadinessBand verdict={<>Save a year&rsquo;s numbers to start your readiness check.</>} />
        <div className="mt-8">
          <AuroraEmpty
            icon={ShieldCheck}
            text="No saved statements yet."
            sub="Add a trial balance and save the year to begin."
            action={
              <AuroraLightButton to={addDataHref(uiV2, { add: 'tb' })} icon={<CloudUpload size={15} aria-hidden="true" />}>
                Add this year&rsquo;s numbers
              </AuroraLightButton>
            }
          />
        </div>
      </FinanceSubPage>
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

  // ── The band: ONE sentence from the $250k test, the next step as the button,
  //    the four figures that say how ready you are. ─────────────────────────
  const material = counts.material ?? 0
  const reportable = counts.reportable ?? 0
  const passCount = counts.pass ?? 0
  const totalChecks = Object.values(counts).reduce((a, n) => a + (Number(n) || 0), 0)
  // Checks that CAN pass: not-applicable ones never will, so they are not in
  // the "of N" — and a manual check is the school's own call, not a pass.
  const applicable = totalChecks - (Number(counts.not_applicable) || 0) - (Number(counts.manual) || 0)
  const needsData = Number(counts.needs_data) || 0
  const watching = Number(counts.watch) || 0
  // "Nothing serious found" is only true once every check has run on real
  // numbers: checks still waiting on data (or on watch) earn no Good pill.
  const selPeriod = savedPeriods.find((p) => p.id === selectedPeriodId) ?? null
  const periodName = selPeriod ? yearName(selPeriod.label) : null

  let verdict = null
  if (!showSkeleton) {
    if (!hasFigure) {
      verdict = <>Let&rsquo;s get you ready for the scholarship review. Start with your numbers.</>
    } else if (requiresAup) {
      verdict = (
        <>
          <VerdictEm>{usd(inputs.scholarshipFundsReceived)}</VerdictEm> received — over $250,000, so a CPA review (AUP)
          is required. <VerdictEm tone="watch">Report due September 15.</VerdictEm>
        </>
      )
    } else {
      verdict = (
        <>
          <VerdictEm>{usd(inputs.scholarshipFundsReceived)}</VerdictEm> received — $250,000 or less, so{' '}
          <VerdictEm tone="good">no CPA review is required</VerdictEm> this year.
        </>
      )
    }
  }

  const kpis = showSkeleton
    ? null
    : [
        {
          key: 'funds',
          icon: HandCoins,
          label: 'Scholarship funds',
          value: hasFigure ? usd(inputs.scholarshipFundsReceived) : null,
          caption: hasFigure
            ? requiresAup
              ? 'CPA review required' // the verdict line above already names the $250,000 line
              : 'At or under the $250,000 line'
            : 'Not entered yet',
          // The statute's $250,000 line is a real threshold. The pill keeps the
          // band's three words (Good / Watch); the caption says what it means.
          verdict: hasFigure ? (requiresAup ? 'watch' : 'good') : null,
        },
        {
          key: 'steps',
          icon: ListChecks,
          label: 'Steps done',
          value: `${doneCount} of ${STEP_ORDER.length}`,
          caption: allDone ? 'Ready to export' : nextIncompleteTitle ? `Next: ${STEPS.find((x) => x.key === nextIncomplete)?.label}` : null,
          verdict: allDone ? 'good' : null,
          verdictLabel: allDone ? 'Done' : null,
        },
        {
          key: 'pass',
          icon: CheckCircle2,
          label: 'Checks passing',
          value: applicable > 0 ? String(passCount) : null,
          caption: applicable > 0 ? `of ${applicable} that apply` : 'No checks yet',
        },
        {
          key: 'fix',
          icon: AlertTriangle,
          label: 'To fix',
          value: totalChecks ? String(material + reportable) : null,
          caption: totalChecks
            ? [material ? `${material} serious` : null, reportable ? `${reportable} to report` : null].filter(Boolean).join(' · ') ||
              (needsData ? `${needsData} still need${needsData === 1 ? 's' : ''} your numbers` : watching ? `${watching} to keep an eye on` : 'Nothing serious found')
            : null,
          // Serious finding → at risk; item to report → watch; none → good,
          // but ONLY when no check is still waiting on data or on watch (a
          // school that has not entered its numbers has not "passed"). No
          // checks → no pill.
          verdict: !totalChecks
            ? null
            : material
              ? 'risk'
              : reportable
                ? 'watch'
                : needsData === 0 && watching === 0
                  ? 'good'
                  : null,
        },
      ]

  return (
    <FinanceSubPage crumb="Readiness">
      <FinanceSubBand
        eyebrow={periodName ? `${periodName} · Florida scholarship review` : 'Florida scholarship review'}
        title="Readiness"
        verdict={verdict}
        actions={
          showSkeleton ? null : (
            <>
              <AuroraButton
                variant="primary"
                onClick={goNextIncomplete}
                icon={allDone ? <CheckCircle2 size={19} aria-hidden="true" /> : <ArrowRight size={19} aria-hidden="true" />}
              >
                {allDone ? 'Export workpapers for your CPA' : nextIncompleteTitle ? `Continue — ${nextIncompleteTitle}` : 'Review'}
              </AuroraButton>
              {!allDone ? (
                <AuroraButton onClick={openExport} icon={<FileDown size={19} aria-hidden="true" />}>
                  Export workpapers
                </AuroraButton>
              ) : null}
            </>
          )
        }
        aside={<FinancePeriodSwitch periods={savedPeriods} activeId={selectedPeriodId} onSelect={setSelectedPeriodId} />}
        kpis={kpis}
      />

      <DisclaimerBanner />

      {showSkeleton ? (
        <div className="mt-8 space-y-6">
          <HeadlineSkeleton />
          <div className="grid grid-cols-1 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <MetricCardSkeleton key={i} />
            ))}
          </div>
        </div>
      ) : (
        <AuroraSection
          icon={ShieldCheck}
          title="Your steps"
          subtitle="Five steps to be ready for your CPA"
          count={`${doneCount} of ${STEP_ORDER.length} done`}
        >
          {/* ── STEPPER ── */}
          <div className="sticky top-14 z-10 lg:top-0">
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
              <p className="pg-eyebrow tabular-nums">
                Step {activeIdx + 1} of {STEP_ORDER.length}
                {doneMap[step] ? ' · Complete' : ''}
              </p>
              <h2 className="font-serif text-title font-medium text-ink sm:text-[26px] sm:leading-[32px]">
                {activeStep.title}
              </h2>
              <p className="mt-1 max-w-2xl text-small leading-relaxed text-ink2">{activeStep.why}</p>
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
                        <div className="border-t border-hair">
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
                      <div className="b2-callout b2-good">
                        <CheckCircle2 size={14} aria-hidden="true" />
                        <p>
                          <span className="font-semibold">Nothing to fix.</span> No serious findings
                          or items to report, so no corrective action plan is needed.
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
                      className={`panel flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between ${
                        allDone ? 'panel-attention !border-l-good' : ''
                      }`}
                    >
                      <div>
                        <p className="text-heading font-semibold text-ink">
                          {allDone ? 'You’re ready for your CPA.' : 'Export the workpapers packet'}
                        </p>
                        <p className="mt-0.5 text-small text-ink2">
                          A single print/PDF bundle of your inputs, findings, reconciliation, CAP,
                          and checklist — hand it to your engaged CPA.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={openExport}
                        className="btn btn-primary shrink-0"
                      >
                        <FileDown size={14} aria-hidden="true" /> Export workpapers
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {/* ── Back / Next nav ── */}
            <div className="b2-actions mt-8">
              <Button
                variant="quiet"
                onClick={() => activeIdx > 0 && setStep(STEP_ORDER[activeIdx - 1])}
                disabled={activeIdx === 0}
                icon={<ArrowLeft size={14} />}
              >
                Back
              </Button>
              {activeIdx < STEP_ORDER.length - 1 ? (
                <Button variant="primary" onClick={() => setStep(STEP_ORDER[activeIdx + 1])}>
                  Next — {STEPS[activeIdx + 1].label} <ArrowRight size={14} aria-hidden="true" />
                </Button>
              ) : (
                <Button variant="primary" onClick={openExport} icon={<FileDown size={14} />}>
                  Export workpapers
                </Button>
              )}
            </div>
          </div>
        </AuroraSection>
      )}

      <FinanceMore current="readiness" />

      <HowThisWorks>
        <p>
          This mirrors the Step Up For Students AUP template and the governing Florida statutes so you can check
          yourself before your CPA engagement.
        </p>
        <p>
          It is not the official Agreed-Upon-Procedures report and not legal or audit advice. Your engaged CPA performs
          the official AUP.
        </p>
        <p>Schools that receive more than $250,000 in scholarship funds need a CPA review; the report is due September 15.</p>
        {data?.rulesetVersion ? (
          <p>
            Checks follow the FL scholarship AUP ruleset v{data.rulesetVersion} (statute {data.statuteYear}).
          </p>
        ) : null}
      </HowThisWorks>
    </FinanceSubPage>
  )
}
