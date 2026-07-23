// ─────────────────────────────────────────────────────────────────────────────
// AddDataWizard — the ONE reusable Choose → Enter/Upload → Confirm frame, driven
// entirely by a module config (wizardConfigs). It is CHROME: it mounts existing
// importers (embed) or launches existing *FormModals (modal); it never rebuilds
// one. Per-module hue strips the frame; framer motion is gated by reduced-motion;
// the steps are an ARIA tablist with focus + a polite live region.
//
// Step model:
//   choose  — WizardChoose card grid (auto-advanced when one option / a deep link)
//   work    — embed: the importer + a Done footer;  modal: launch the *FormModal
//   confirm — WizardConfirm success (Add another / Done), or the Penny-handoff note
//
// A modal option advances to Confirm only when its onSave resolved (savedRef, set
// via markSaved); a plain cancel (onClose without a save) returns to Choose.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronLeft, CalendarClock, CheckCircle2 } from 'lucide-react'
import WizardStepper from './WizardStepper.jsx'
import WizardChoose from './WizardChoose.jsx'
import WizardConfirm from './WizardConfirm.jsx'
import RecordFlow from '../recordwizard/RecordFlow.jsx'
import FlowConfirm from '../recordwizard/FlowConfirm.jsx'
import { hueRgba, wizardModuleLabel } from './wizardConfigs.jsx'

const PANEL_ID = 'wiz-panel'
const STEP_INDEX = { choose: 0, work: 1, confirm: 2 }

export default function AddDataWizard({ config, ctx, initialOption = null }) {
  const reduce = useReducedMotion()
  const hue = config.hue
  const options = config.options
  const moduleLabel = wizardModuleLabel(config.module)

  // Resolve the auto-advance target ONCE (deep-link ?add=, else a single-option
  // module). Computed in the useState initializers — the render-time idiom this
  // codebase uses instead of setState-in-effect.
  const resolveInitial = () => {
    if (initialOption && options.some((o) => o.key === initialOption)) {
      return options.find((o) => o.key === initialOption)
    }
    return options.length === 1 ? options[0] : null
  }
  const [step, setStep] = useState(() => {
    const o = resolveInitial()
    return o ? (o.kind === 'handoff' ? 'confirm' : 'work') : 'choose'
  })
  const [optionKey, setOptionKey] = useState(() => resolveInitial()?.key ?? null)
  const savedRef = useRef(false)
  const initHandoffRef = useRef(false)
  const headingRef = useRef(null)
  // kind:'flow' — the batch result FlowConfirm renders, and the leave guard the
  // mounted RecordFlow registers (returns false when it opened its own dialog).
  const [flowResult, setFlowResult] = useState(null)
  const flowGuardRef = useRef(null)

  const option = useMemo(
    () => options.find((o) => o.key === optionKey) || null,
    [options, optionKey],
  )

  // ctx handed to the render functions, with reduced-motion folded in (the modal
  // forms read ctx.reduce). onSaved fires the parent refresh + penny:data-changed.
  const fullCtx = useMemo(() => ({ ...ctx, reduce }), [ctx, reduce])

  // ── Option selection ──────────────────────────────────────────────────────
  const chooseOption = (key) => {
    setFlowResult(null)
    flowGuardRef.current = null
    const opt = options.find((o) => o.key === key)
    if (!opt) return
    setOptionKey(key)
    savedRef.current = false
    if (opt.kind === 'handoff') {
      opt.onHandoff?.(fullCtx)
      setStep('confirm')
    } else {
      setStep('work')
    }
  }

  // Cross-option jump from inside an embed (e.g. TB → Monthly).
  const goToOption = (key) => {
    setFlowResult(null)
    flowGuardRef.current = null
    const opt = options.find((o) => o.key === key)
    if (!opt) return
    setOptionKey(key)
    savedRef.current = false
    setStep(opt.kind === 'handoff' ? 'confirm' : 'work')
  }

  const backToChoose = () => {
    setFlowResult(null)
    flowGuardRef.current = null
    savedRef.current = false
    // Keep the single-option selected so the one card still reads naturally.
    if (options.length > 1) setOptionKey(null)
    setStep('choose')
  }

  // kind:'flow' leave guard — a mounted RecordFlow with queued/dirty work opens
  // its own discard dialog (guard fn returns false) instead of us navigating.
  const guardedLeave = (leave) => {
    if (step === 'work' && option?.kind === 'flow' && flowGuardRef.current && !flowGuardRef.current())
      return
    leave()
  }

  // Modal close: advance to Confirm iff a save happened, else treat as cancel.
  const modalOnClose = () => {
    if (savedRef.current) {
      savedRef.current = false
      setStep('confirm')
    } else {
      backToChoose()
    }
  }
  const markSaved = () => {
    savedRef.current = true
    fullCtx.onSaved?.()
  }

  const embedDone = () => {
    fullCtx.onSaved?.()
    setStep('confirm')
  }

  const addAnother = () => {
    setFlowResult(null)
    flowGuardRef.current = null
    savedRef.current = false
    setOptionKey(null)
    setStep('choose')
  }

  // Confirm "Done" — we must NOT navigate (ENG-C1 owns tab routing), so reset the
  // frame to a fresh Choose, ready for the next add.
  const finish = () => {
    setFlowResult(null)
    flowGuardRef.current = null
    savedRef.current = false
    setOptionKey(null)
    setStep('choose')
  }

  // ── Deep-link handoff: if we auto-landed on a handoff option's Confirm (e.g.
  // ?add=penny-draft), fire the hand-off side-effect ONCE on mount. (Clicks are
  // handled in chooseOption; the useState initializers can't run side-effects.)
  useEffect(() => {
    if (initHandoffRef.current) return
    initHandoffRef.current = true
    const o = options.find((x) => x.key === optionKey)
    if (step === 'confirm' && o?.kind === 'handoff') o.onHandoff?.(fullCtx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Focus the panel heading on every step change (keyboard/SR continuity). ──
  useEffect(() => {
    headingRef.current?.focus?.()
  }, [step, optionKey])

  const stepName =
    step === 'choose' ? 'Choose what to add' : step === 'work' ? option?.label ?? 'Add' : 'Done'

  const needsPeriodBlocked =
    step === 'work' && option?.kind === 'embed' && option.needsPeriod && !ctx.periodId

  return (
    <section aria-label={`Add ${moduleLabel} data`} className="mx-auto max-w-page">
      {/* Hue strip + header */}
      <div
        className="mb-5 rounded-2xl border-2 bg-white px-5 py-4 shadow-card"
        style={{ borderColor: hueRgba(hue, 0.22) }}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p
              className="text-[12px] font-bold uppercase tracking-[0.18em]"
              style={{ color: hue }}
            >
              {moduleLabel} · Add data
            </p>
            <h2 className="mt-0.5 font-serif text-lg font-semibold text-navy">
              Get your {moduleLabel.toLowerCase()} numbers in
            </h2>
          </div>
        </div>
        <WizardStepper
          current={step}
          hue={hue}
          panelId={PANEL_ID}
          onGoTo={(s) => guardedLeave(() => setStep(s))}
        />
      </div>

      {/* Polite live region — announces the active step for screen readers. */}
      <p className="sr-only" aria-live="polite">
        {`Step ${STEP_INDEX[step] + 1} of 3: ${stepName}`}
      </p>

      <div
        id={PANEL_ID}
        role="tabpanel"
        aria-labelledby={`wiz-tab-${step}`}
        tabIndex={-1}
        className="outline-none"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${step}:${optionKey ?? ''}`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: -16 }}
            transition={{ duration: 0.22 }}
          >
            {step === 'choose' && (
              <>
                <h3 ref={headingRef} tabIndex={-1} className="sr-only">
                  Choose what to add for {moduleLabel}
                </h3>
                <WizardChoose options={options} hue={hue} onChoose={chooseOption} />
              </>
            )}

            {step === 'work' && option && (
              <div
                className="overflow-hidden rounded-2xl border-2 bg-section"
                style={{ borderColor: hueRgba(hue, 0.22) }}
              >
                {/* Work header (also the focus + label target behind any overlay). */}
                <div className="flex items-center justify-between gap-3 border-b border-rule/60 bg-white px-5 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => guardedLeave(backToChoose)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted outline-none transition-colors hover:bg-section hover:text-navy focus-visible:ring-2"
                      style={{ '--tw-ring-color': hueRgba(hue, 0.5) }}
                      aria-label="Back to options"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <h3
                      ref={headingRef}
                      tabIndex={-1}
                      className="font-serif text-[17px] font-semibold text-navy outline-none"
                    >
                      {option.label}
                    </h3>
                  </div>
                </div>

                {needsPeriodBlocked ? (
                  <NoPeriodNote hue={hue} />
                ) : option.kind === 'flow' ? (
                  <RecordFlow
                    key={option.key}
                    flow={option.flow}
                    ctx={fullCtx}
                    hue={hue}
                    onDone={(result) => {
                      setFlowResult(result)
                      setStep('confirm')
                    }}
                    onCancel={backToChoose}
                    goToOption={goToOption}
                    registerGuard={(fn) => {
                      flowGuardRef.current = fn
                    }}
                  />
                ) : option.kind === 'modal' ? (
                  <>
                    {/* Context behind the *FormModal overlay it portals on top. */}
                    <div className="px-5 py-8 text-center">
                      <p className="text-[15px] text-muted">Fill in the form to continue.</p>
                    </div>
                    <WizardSlot
                      render={option.renderModal}
                      ctx={fullCtx}
                      extra={{ onClose: modalOnClose, markSaved }}
                    />
                  </>
                ) : (
                  <>
                    <div>
                      <WizardSlot
                        render={option.renderEmbed}
                        ctx={fullCtx}
                        extra={{ goToOption }}
                      />
                    </div>
                    {/* Embedded importers own their own save UI; this footer lets
                        the user declare they're finished → refresh + Confirm. */}
                    <div className="flex items-center justify-between gap-3 border-t border-rule/60 bg-white px-5 py-3.5">
                      <button
                        type="button"
                        onClick={backToChoose}
                        className="text-[14px] font-semibold text-muted transition-colors hover:text-navy"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={embedDone}
                        className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[14px] font-bold uppercase tracking-[0.06em] text-white shadow-glow transition-transform hover:-translate-y-0.5"
                        style={{ backgroundColor: hue }}
                      >
                        <CheckCircle2 size={15} /> I’m done
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {step === 'confirm' && (
              <>
                <h3 ref={headingRef} tabIndex={-1} className="sr-only">
                  Done
                </h3>
                {flowResult ? (
                  <FlowConfirm
                    result={flowResult}
                    hue={hue}
                    moduleLabel={moduleLabel}
                    onAddAnother={addAnother}
                    onDone={finish}
                  />
                ) : (
                  <WizardConfirm
                    option={option}
                    hue={hue}
                    moduleLabel={moduleLabel}
                    onAddAnother={addAnother}
                    onDone={finish}
                  />
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}

// Renders a config render-prop as a child element. The indirection matters: the
// ref-closured callbacks (onClose/markSaved/goToOption) reach the render fn as
// ELEMENT PROPS here rather than as arguments to a function the parent calls
// during its own render — so they never trip "ref accessed during render".
function WizardSlot({ render, ctx, extra }) {
  return render(ctx, extra)
}

function NoPeriodNote({ hue }) {
  return (
    <div className="px-6 py-10 text-center">
      <span
        className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl"
        style={{ backgroundColor: hueRgba(hue, 0.12), color: hue }}
      >
        <CalendarClock size={22} />
      </span>
      <h4 className="font-serif text-lg font-semibold text-navy">Add a reporting period first</h4>
      <p className="mx-auto mt-1.5 max-w-md text-[15px] leading-relaxed text-muted">
        This step needs a reporting period to attach to. Add a trial balance first — we’ll create the
        period and you can come back here.
      </p>
    </div>
  )
}
