// ─────────────────────────────────────────────────────────────────────────────
// AddDataWizard — the ONE reusable Choose → Enter/Upload → Confirm frame, driven
// entirely by a module config (wizardConfigs). It is CHROME: it mounts existing
// importers (embed) or launches existing *FormModals (modal); it never rebuilds
// one. The module hue appears only as 2px rules + icon strokes; framer motion is
// gated by reduced-motion; the steps are an ARIA tablist with focus + a polite
// live region.
//
// Step model:
//   choose  — WizardChoose Tile grid (auto-advanced when one option / a deep link)
//   work    — embed: the importer + a Done footer;  modal: launch the *FormModal
//   confirm — WizardConfirm success (Add another / Done), or the Penny-handoff note
//
// A modal option advances to Confirm only when its onSave resolved (savedRef, set
// via markSaved); a plain cancel (onClose without a save) returns to Choose.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft, CalendarClock, CheckCircle2 } from 'lucide-react'
import WizardStepper from './WizardStepper.jsx'
import WizardChoose from './WizardChoose.jsx'
import WizardConfirm from './WizardConfirm.jsx'
import RecordFlow from '../recordwizard/RecordFlow.jsx'
import FlowConfirm from '../recordwizard/FlowConfirm.jsx'
import { wizardModuleLabel } from './wizardConfigs.jsx'
import { moduleTabs } from '../module/moduleAnatomy.js'
import PageHeader from '../ui/surface/PageHeader.jsx'
import Panel from '../ui/surface/Panel.jsx'
import Button from '../ui/surface/Button.jsx'
import { hueTriple } from '../ui/surface/Tile.jsx'

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
    // A module may open straight on one option (Finance opens on the upload
    // sorter, #43); Choose stays one "Options" click away.
    if (config.defaultOption && options.some((o) => o.key === config.defaultOption)) {
      return options.find((o) => o.key === config.defaultOption)
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
  // A year other than the page's, picked from inside an embed (the upload
  // sorter's "Replace" / "Manage months" in Already on file). Cleared whenever
  // the person leaves the option. An id that isn't a known period is ignored.
  const [periodOverride, setPeriodOverride] = useState(null)

  const option = useMemo(
    () => options.find((o) => o.key === optionKey) || null,
    [options, optionKey],
  )

  // ctx handed to the render functions, with reduced-motion folded in (the modal
  // forms read ctx.reduce). onSaved fires the parent refresh + penny:data-changed.
  const ov = periodOverride ? (ctx.periods || []).find((p) => p.id === periodOverride) ?? null : null
  const fullCtx = useMemo(
    () => ({ ...ctx, ...(ov ? { periodId: ov.id, periodLabel: ov.label, periodOverride: ov } : {}), reduce }),
    [ctx, ov, reduce],
  )

  // ── Option selection ──────────────────────────────────────────────────────
  const chooseOption = (key) => {
    setFlowResult(null)
    flowGuardRef.current = null
    setPeriodOverride(null)
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

  // Cross-option jump from inside an embed (e.g. TB → Monthly). `opts.periodId`
  // opens the option on that year instead of the page's.
  const goToOption = (key, opts = null) => {
    setFlowResult(null)
    flowGuardRef.current = null
    const opt = options.find((o) => o.key === key)
    if (!opt) return
    setOptionKey(key)
    savedRef.current = false
    setStep(opt.kind === 'handoff' ? 'confirm' : 'work')
    setPeriodOverride(opts?.periodId ?? null)
  }

  const backToChoose = () => {
    setFlowResult(null)
    flowGuardRef.current = null
    setPeriodOverride(null)
    savedRef.current = false
    // Keep the single-option selected so the one card still reads naturally.
    if (options.length > 1) setOptionKey(null)
    setStep('choose')
  }

  // ── Overview escape hatch ─────────────────────────────────────────────────
  // A single-option module auto-skips Choose on the way IN, so its back button
  // must not land on a pointless one-card Choose on the way OUT — it goes to
  // the module Overview instead (clearing ?tab= via the pathname, the exact URL
  // model ModuleTabs reads). Multi-option modules keep Choose as the back stop
  // and get an explicit "Back to overview" link ON the Choose screen. This is
  // user-clicked navigation, not the post-save auto-navigation the AddDataTab
  // contract forbids.
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const soleOption = options.length === 1
  const backToOverview = () => navigate(pathname)
  const leaveWork = soleOption ? backToOverview : backToChoose

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
      leaveWork()
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

  // AN EMBED THAT FINISHES ITSELF (config `ownFinish: true` — Finance's trial
  // balance). Owner, 2026-10-15: "when I select I'm done … it takes me to a
  // redundant screen making me press done again. when I press done it gives me
  // half the overview screen." So this skips Step 3 entirely: refresh, then the
  // module OVERVIEW (the full page — not the Records/Workspaces tab).
  const finishToOverview = () => {
    fullCtx.onSaved?.()
    setFlowResult(null)
    flowGuardRef.current = null
    setPeriodOverride(null)
    savedRef.current = false
    setOptionKey(null)
    setStep('choose')
    navigate(pathname)
    // Land on the overview's HEADLINE, not 350–450px down where the step was.
    scrollToTop()
  }

  const addAnother = () => {
    setFlowResult(null)
    flowGuardRef.current = null
    savedRef.current = false
    setOptionKey(null)
    setStep('choose')
  }

  // "I'm done" — the END of the task, not a reset of the form.
  //
  // This used to drop the user back on the Choose screen, i.e. the Add-data
  // chooser they had just finished with. Reported from production after a roster
  // upload: "it takes me back to add data instead of the records screen to see
  // the newly added roster." That reading is correct — the one thing a person
  // wants after saving is to SEE the thing they saved, and the wizard instead
  // offered to start again.
  //
  // So it lands on the module's Records register when the module has one, and on
  // the module Overview when it does not (HR and Planning have no register — the
  // same predicate ModuleCtas uses to decide whether to render a Records button
  // at all, so the two cannot disagree). "Add another" is unchanged and remains
  // the way back to Choose.
  //
  // ON THE OLD "we must NOT navigate (ENG-C1 owns tab routing)" NOTE THAT USED TO
  // SIT HERE: that contract belongs to AddDataTab, and it forbids navigating ON
  // SAVE — an importer must not yank the page out from under a save it just
  // completed. This is a user CLICKING "I'm done" on a Confirm screen a step
  // later, which is the same class of action as the Records pill in ModuleCtas,
  // and it uses the identical `?tab=records` URL model so the two cannot
  // disagree about where Records lives.
  /**
   * Leave for the module OVERVIEW rather than its records tab, and — when the
   * host offered one (finance) — replay the celebration on arrival.
   *
   * `finish` is unchanged and still goes to records: this is an additional door,
   * not a redefinition of that one. A user who has just handed over their books
   * wants to see what those books now SAY, and the records tab is a filing
   * cabinet.
   */
  const seeResult = () => {
    setFlowResult(null)
    flowGuardRef.current = null
    savedRef.current = false
    setOptionKey(null)
    setStep('choose')
    navigate(pathname)
    ctx?.onLitUp?.()
  }

  const finish = () => {
    setFlowResult(null)
    flowGuardRef.current = null
    savedRef.current = false
    setOptionKey(null)
    setStep('choose')
    // `config.module`, NOT a bare `module`: there is no `module` binding in this
    // component, and in the browser it resolves to undefined rather than throwing
    // — so the guard would have been silently false and this would have sent
    // every module to its Overview, quietly failing the exact bug it fixes.
    const key = config.module
    // A module whose numbers ARE its overview (finance: `finishTo: 'overview'`)
    // lands there — its Records tab is only the Workspaces doors, "half the
    // overview" in the owner's words.
    if (config.finishTo === 'overview') {
      navigate(pathname)
      scrollToTop()
      return
    }
    navigate(key && moduleTabs(key).includes('records') ? `${pathname}?tab=records` : pathname)
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
    step === 'work' && option?.kind === 'embed' && option.needsPeriod && !fullCtx.periodId

  // Step-aware meta line under the title (the visible twin of the live region).
  // An option that finishes itself has no Done step (no Step 3 screen).
  const skipDone = step === 'work' && !!option?.ownFinish
  const stepCount = (soleOption ? 2 : 3) - (skipDone ? 1 : 0)
  const meta =
    step === 'choose'
      ? `Step 1 of 3 · Choose what to add`
      : step === 'work'
        ? `Step ${soleOption ? 1 : 2} of ${stepCount} · ${option?.label ?? 'Add'}`
        : `Step ${soleOption ? 2 : 3} of ${soleOption ? 2 : 3} · Done`

  const swap = {
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: reduce ? { opacity: 0 } : { opacity: 0, y: -4 },
    transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
  }

  return (
    // Premium UI P4 (plan sketch 5): PageHeader "MODULE · ADD DATA" with the
    // stepper as a 2px progress rule ON its bottom hairline; Choose = Tiles on
    // the ground; Add + Done = ONE Panel with the actions on a hairline footer.
    // `--c-module` is pinned to the config hue so every rule/stroke below agrees.
    <section
      aria-label={`Add ${moduleLabel} data`}
      className="mx-auto max-w-page px-4 pb-12 sm:px-10"
      style={{ '--c-module': hueTriple(hue) }}
    >
      <PageHeader
        eyebrow={`${moduleLabel} · Add data`}
        title={wizardTitle(config, moduleLabel)}
        meta={meta}
      >
        <WizardStepper
          current={step}
          panelId={PANEL_ID}
          skipChoose={soleOption}
          skipDone={skipDone}
          bare={step === 'work' && option?.kind === 'flow'}
          onGoTo={(s) => guardedLeave(() => setStep(s))}
        />
      </PageHeader>

      {/* Polite live region — announces the active step for screen readers. */}
      <p className="sr-only" aria-live="polite">
        {`Step ${STEP_INDEX[step] + 1} of ${skipDone ? 2 : 3}: ${stepName}`}
      </p>

      <div
        id={PANEL_ID}
        role="tabpanel"
        aria-labelledby={`wiz-tab-${step}`}
        tabIndex={-1}
        className="mt-6 outline-none"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={`${step}:${optionKey ?? ''}`} {...swap}>
            {step === 'choose' && (
              <>
                <h3 ref={headingRef} tabIndex={-1} className="sr-only">
                  Choose what to add for {moduleLabel}
                </h3>
                {/* No second "Back to overview" link here: the breadcrumb above
                    (Dashboard › Module › Add data) already is the way home, and
                    the audit named the duplicate as an amateur tell. */}
                <WizardChoose options={options} hue={hue} onChoose={chooseOption} />
              </>
            )}

            {step === 'work' &&
              option &&
              (option.kind === 'flow' ? (
                // A record flow is its OWN Panel (contextual back, step rule,
                // batch strip, hairline footer) — no second chrome around it.
                <RecordFlow
                  key={option.key}
                  flow={option.flow}
                  title={option.label}
                  subtitle={option.blurb}
                  ctx={fullCtx}
                  exitLabel={soleOption ? `${moduleLabel} overview` : 'options'}
                  onDone={(result) => {
                    setFlowResult(result)
                    setStep('confirm')
                  }}
                  onCancel={leaveWork}
                  goToOption={goToOption}
                  registerGuard={(fn) => {
                    flowGuardRef.current = fn
                  }}
                />
              ) : (
                <Panel
                  padded={false}
                  footer={
                    // An embed with its own finish (ownFinish) has no footer:
                    // one finishing action on screen, not two.
                    option.kind === 'embed' && !needsPeriodBlocked && !option.ownFinish ? (
                      <>
                        <Button variant="quiet" onClick={leaveWork} className="mr-auto">
                          {soleOption ? 'Back to overview' : 'Back'}
                        </Button>
                        <Button variant="primary" icon={<CheckCircle2 size={15} />} onClick={embedDone}>
                          I’m done
                        </Button>
                      </>
                    ) : null
                  }
                >
                  {/* Work header (also the focus + label target behind any overlay). */}
                  <div className="panel-head">
                    <div className="flex min-w-0 items-center gap-3">
                      <button
                        type="button"
                        onClick={() => guardedLeave(leaveWork)}
                        className="back-link shrink-0"
                      >
                        <ChevronLeft size={15} aria-hidden="true" />
                        {soleOption ? `${moduleLabel} overview` : 'Options'}
                      </button>
                      <span className="h-4 w-px shrink-0 bg-hair" aria-hidden="true" />
                      <h3
                        ref={headingRef}
                        tabIndex={-1}
                        className="panel-title min-w-0 outline-none"
                      >
                        {option.label}
                      </h3>
                    </div>
                  </div>

                  {needsPeriodBlocked ? (
                    <NoPeriodNote />
                  ) : option.kind === 'modal' ? (
                    <>
                      {/* Context behind the *FormModal overlay it portals on top. */}
                      <div className="panel-body">
                        <p className="text-[14px] text-ink2">Fill in the form to continue.</p>
                      </div>
                      <WizardSlot
                        render={option.renderModal}
                        ctx={fullCtx}
                        extra={{ onClose: modalOnClose, markSaved }}
                      />
                    </>
                  ) : option.flush ? (
                    // A flush importer (config `flush: true`) brings its own
                    // horizontal padding + hairlines — no second inset around it.
                    <WizardSlot render={option.renderEmbed} ctx={fullCtx} extra={{ goToOption, finishToOverview }} />
                  ) : (
                    <div className="panel-body">
                      <WizardSlot
                        render={option.renderEmbed}
                        ctx={fullCtx}
                        extra={{ goToOption, finishToOverview }}
                      />
                    </div>
                  )}
                </Panel>
              ))}

            {step === 'confirm' && (
              <>
                <h3 ref={headingRef} tabIndex={-1} className="sr-only">
                  Done
                </h3>
                {flowResult ? (
                  <FlowConfirm
                    result={flowResult}
                    moduleLabel={moduleLabel}
                    onAddAnother={addAnother}
                    onDone={finish}
                  />
                ) : (
                  <WizardConfirm
                    option={option}
                    moduleLabel={moduleLabel}
                    onAddAnother={addAnother}
                    onDone={finish}
                    // Only where the host can actually show a result.
                    onSeeResult={ctx?.onLitUp ? seeResult : null}
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

/**
 * After a finish that changes the page under the person, start at the top —
 * the window and the app's scrolling <main>, once now and once after the new
 * tab has painted (the overview mounts a frame later).
 */
export function scrollToTop() {
  const go = () => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    } catch {
      /* jsdom */
    }
    for (const el of document.querySelectorAll('main, [data-scroll-root]')) {
      if (el.scrollTop) el.scrollTop = 0
    }
  }
  go()
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(go))
}

// The PageHeader title. A config may name its own; otherwise "numbers" wording
// is kept for the modules that genuinely take numbers in (finance, enrollment)
// and every record module reads as what it is — adding records.
const NUMBER_MODULES = new Set(['finance', 'enrollment'])
function wizardTitle(config, moduleLabel) {
  if (config.title) return config.title
  const m = moduleLabel.toLowerCase()
  return NUMBER_MODULES.has(config.module) ? `Get your ${m} numbers in` : `Add ${m} records`
}

// Renders a config render-prop as a child element. The indirection matters: the
// ref-closured callbacks (onClose/markSaved/goToOption) reach the render fn as
// ELEMENT PROPS here rather than as arguments to a function the parent calls
// during its own render — so they never trip "ref accessed during render".
function WizardSlot({ render, ctx, extra }) {
  return render(ctx, extra)
}

function NoPeriodNote() {
  return (
    <div className="panel-body flex items-start gap-3.5">
      <span className="tone-hue mt-1 shrink-0" aria-hidden="true">
        <CalendarClock size={22} strokeWidth={1.6} />
      </span>
      <div className="min-w-0">
        <h4 className="font-serif text-title font-medium text-ink">Add a reporting period first</h4>
        <p className="mt-1 max-w-[60ch] text-[14px] leading-[22px] text-ink2">
          This step needs a reporting period to attach to. Add a trial balance first — we’ll create the
          period and you can come back here.
        </p>
      </div>
    </div>
  )
}
