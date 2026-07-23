// ─────────────────────────────────────────────────────────────────────────────
// RecordFlow — the multi-step, MULTI-ITEM "add records" experience mounted by
// AddDataWizard for kind:'flow' options, replacing the old single-record modal
// launch. One FlowDef (recordFlows.jsx) drives everything:
//
//   loaders/gate → tiny field steps (Basics → Details) → framework Review step
//   ⊕ Add & start another  — queue the draft as a chip and begin a fresh one
//   Save all N             — sequential submit engine, continue-on-error,
//                            per-item progress, retry ONLY failures (no dupes)
//
// It renders INSIDE the wizard's work card (the parent owns the outer header,
// stepper tablist and URL) and never navigates: onDone(result) hands the batch
// outcome up for the FlowConfirm step, onCancel() leaves, and registerGuard()
// gives the parent a "safe to leave?" hook that opens our own discard dialog.
// Directional slide transitions + the hue step rail + a celebration beat all
// stand down under reduced motion; focus + two live regions carry the whole
// journey for screen readers.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, ChevronRight, Loader2, Plus, RefreshCw, AlertCircle } from 'lucide-react'
import { hueRgba } from '../wizard/wizardConfigs.jsx'
import { apiErrorMessage } from '../../lib/api.js'
import { makeItemId } from './flowSchema.js'
import { validateStep, validateItem, isDirty, flowCount, submitQueue } from './flowRuntime.js'
import FlowStepRail from './FlowStepRail.jsx'
import FlowField from './FlowField.jsx'
import FlowBasket from './FlowBasket.jsx'
import FlowReview from './FlowReview.jsx'

// Directional slide (custom = dir); reduced motion crossfades opacity only.
const panelVariants = {
  enter: (dir) => ({ x: dir >= 0 ? 56 : -56, opacity: 0, scale: 0.985 }),
  center: { x: 0, opacity: 1, scale: 1 },
  exit: (dir) => ({ x: dir >= 0 ? -56 : 56, opacity: 0, scale: 0.985 }),
}
const reducedVariants = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
}

export default function RecordFlow({ flow, ctx, hue, onDone, onCancel, goToOption, registerGuard }) {
  const reduce = !!ctx.reduce
  const S = flow.steps.length // the framework-appended Review step's index

  // Stable per-mount id prefix for field ids (sanitized — useId's colons would
  // break the querySelector-based focus contract).
  const rawId = useId()
  const idBase = useMemo(() => `rf${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`, [rawId])

  // ── Loaders + gate ──────────────────────────────────────────────────────────
  const loaderKeys = useMemo(() => Object.keys(flow.loaders || {}), [flow])
  // No loaders → gate (if any) can be answered synchronously in the initializers.
  const initialGate = useMemo(
    () => (loaderKeys.length ? null : (flow.gate?.({}, ctx) ?? null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const [phase, setPhase] = useState(() =>
    initialGate ? 'gated' : loaderKeys.length ? 'loading' : 'editing',
  )
  const [gate, setGate] = useState(initialGate)
  const [data, setData] = useState({})
  const [loadErrors, setLoadErrors] = useState({})

  // ── Step machine + draft + basket ──────────────────────────────────────────
  const [stepIdx, setStepIdx] = useState(0)
  const [dir, setDir] = useState(1)
  const [values, setValues] = useState(() => ({ ...flow.defaults }))
  const [errors, setErrors] = useState({})
  const [showErrors, setShowErrors] = useState(false)
  const [finishNotice, setFinishNotice] = useState(false)
  const [basket, setBasket] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [guardOpen, setGuardOpen] = useState(false)
  const [submitNotice, setSubmitNotice] = useState(false)
  const [pulseKey, setPulseKey] = useState(0)
  const [celebrateN, setCelebrateN] = useState(0)
  const [politeMsg, setPoliteMsg] = useState('')
  const [assertiveMsg, setAssertiveMsg] = useState('')

  const rootRef = useRef(null)
  const retryBtnRef = useRef(null)
  const celebrateRef = useRef(null)
  const prevFocusRef = useRef(null)
  const noticeTimerRef = useRef(null)
  const resultRef = useRef(null)
  // Focus target consumed when the next step panel mounts (rAF-deferred so it
  // runs AFTER AddDataWizard's own heading-focus effect — the mount race).
  const pendingFocusRef = useRef({ type: 'firstField' })
  const basketRef = useRef(basket)
  useEffect(() => {
    basketRef.current = basket
  }, [basket])
  const phaseRef = useRef(phase)
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  const isReview = stepIdx === S
  const lastFieldStep = stepIdx === S - 1
  const submitting = phase === 'submitting'
  const dirty = isDirty(values, flow.defaults)
  // While a chip is being edited the draft IS a basket item — don't count twice.
  const unsavedCount =
    basket.filter((it) => it.status !== 'done').length + (dirty && !editingId ? 1 : 0)
  const errCount = basket.filter((it) => it.status === 'error').length
  const okCount = basket.filter((it) => it.status === 'done').length
  const remaining = basket.length - okCount
  const reviewN = basket.length + (!editingId && dirty ? 1 : 0)

  const itemLabelOf = (v) => flow.itemLabel(v) || `Untitled ${flow.noun}`

  // ── Fetch loaders ONCE on mount (allSettled — a rejection never throws) ────
  useEffect(() => {
    if (!loaderKeys.length) return undefined
    let alive = true
    const entries = Object.entries(flow.loaders)
    Promise.allSettled(entries.map(([, fn]) => fn(ctx))).then((results) => {
      if (!alive) return
      const d = {}
      const errs = {}
      results.forEach((r, i) => {
        const key = entries[i][0]
        if (r.status === 'fulfilled') d[key] = r.value
        else {
          d[key] = null
          errs[key] = true
        }
      })
      setData(d)
      setLoadErrors(errs)
      const g = flow.gate?.(d, ctx) ?? null
      if (g) {
        setGate(g)
        setPhase('gated')
      } else {
        setPhase('editing')
      }
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Leave guard — re-registered every render so the closure is never stale.
  // true = clean, caller may leave; false = we opened the discard dialog (or
  // flashed the "still saving" notice) and the caller must stay put.
  useEffect(() => {
    if (!registerGuard) return
    registerGuard(() => {
      if (phase === 'submitting') {
        flashNotice()
        return false
      }
      if (unsavedCount === 0) return true
      prevFocusRef.current = document.activeElement
      setGuardOpen(true)
      return false
    })
  })

  const flashNotice = () => {
    setSubmitNotice(true)
    setPoliteMsg('Hang on — still saving your items.')
    clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = setTimeout(() => setSubmitNotice(false), 2600)
  }
  useEffect(() => () => clearTimeout(noticeTimerRef.current), [])

  // ── Focus plumbing ─────────────────────────────────────────────────────────
  const focusByKey = (key) => rootRef.current?.querySelector(`#${idBase}-${key}`)?.focus()
  const consumePendingFocus = () => {
    const p = pendingFocusRef.current
    if (!p) return
    pendingFocusRef.current = null
    requestAnimationFrame(() => {
      const root = rootRef.current
      if (!root) return
      if (p.type === 'firstField') {
        root
          .querySelector(
            '[data-rf-fields] input, [data-rf-fields] select, [data-rf-fields] textarea, [data-rf-fields] button',
          )
          ?.focus()
      } else if (p.type === 'field') {
        root.querySelector(`#${idBase}-${p.key}`)?.focus()
      } else {
        root.querySelector('[data-rf-heading]')?.focus()
      }
    })
  }

  const announceStep = (idx) => {
    const name = idx === S ? 'Review' : flow.steps[idx].label
    setPoliteMsg(`${name}, step ${idx + 1} of ${S + 1} — ${flow.noun}`)
  }

  // ── Transitions (frozen semantics — see the spec's §2.1) ───────────────────
  const go = (idx, direction, focus = { type: 'heading' }) => {
    pendingFocusRef.current = focus
    setDir(direction)
    setStepIdx(idx)
    setErrors({})
    setShowErrors(false)
    setFinishNotice(false)
    announceStep(idx)
  }

  /** Jump to the first failing field step, surface its errors, focus the first
   *  invalid field. `notice` adds the "finish or discard" inline nudge. */
  const jumpToFail = (fail, notice = false) => {
    const step = flow.steps[fail.stepIdx]
    const firstKey = step.fields.find((f) => fail.errors[f.key])?.key
    const n = Object.keys(fail.errors).length
    setAssertiveMsg(`${n === 1 ? '1 field needs' : `${n} fields need`} attention on ${step.label}.`)
    if (fail.stepIdx !== stepIdx) {
      pendingFocusRef.current = { type: 'field', key: firstKey }
      setDir(fail.stepIdx < stepIdx ? -1 : 1)
      setStepIdx(fail.stepIdx)
      announceStep(fail.stepIdx)
    } else {
      requestAnimationFrame(() => focusByKey(firstKey))
    }
    setErrors(fail.errors)
    setShowErrors(true)
    setFinishNotice(notice)
  }

  const handleFieldChange = (key, val) => {
    setValues((v) => ({ ...v, [key]: val }))
    setErrors((e) => {
      if (!e[key]) return e
      const next = { ...e }
      delete next[key]
      return next
    })
    setFinishNotice(false)
  }

  const next = () => {
    const errs = validateStep(flow.steps[stepIdx], values, data)
    if (errs) {
      jumpToFail({ stepIdx, errors: errs })
      return
    }
    go(stepIdx + 1, 1)
  }

  /** Push the draft as a new queued item, or fold it back into the chip being
   *  edited (status returns to 'queued', any old error clears). */
  const queueDraft = () => {
    if (editingId) {
      const id = editingId
      setBasket((b) =>
        b.map((it) => (it.id === id ? { ...it, values, status: 'queued', error: undefined } : it)),
      )
    } else {
      setBasket((b) => [...b, { id: makeItemId(), values, status: 'queued' }])
    }
  }

  const addAndStartAnother = () => {
    const fail = validateItem(flow, values, data)
    if (fail) {
      jumpToFail(fail)
      return
    }
    const label = itemLabelOf(values)
    const n = basket.length + 1
    queueDraft()
    setPulseKey((k) => k + 1)
    setValues({ ...flow.defaults })
    setEditingId(null)
    go(0, 1, { type: 'firstField' }) // forward — queuing is progress
    setPoliteMsg(
      `Added “${label}”. ${flowCount(n, flow.noun, flow.nounPlural)} queued. Starting a new one.`,
    )
  }

  const updateInList = () => {
    const fail = validateItem(flow, values, data)
    if (fail) {
      jumpToFail(fail)
      return
    }
    const label = itemLabelOf(values)
    queueDraft()
    setValues({ ...flow.defaults })
    setEditingId(null)
    go(S, 1)
    setPoliteMsg(`Updated “${label}” in the list.`)
  }

  const reviewAndSave = () => {
    if (submitting) return
    if (editingId) {
      updateInList()
      return
    }
    if (!dirty) {
      if (basket.length > 0) go(S, 1)
      return // pristine + empty basket → the button is disabled anyway
    }
    const fail = validateItem(flow, values, data)
    if (fail) {
      // Never silently drop OR silently queue a half-done draft.
      jumpToFail(fail, true)
      return
    }
    const label = itemLabelOf(values)
    const n = basket.length + 1
    queueDraft()
    setPulseKey((k) => k + 1)
    setValues({ ...flow.defaults })
    go(S, 1)
    setPoliteMsg(`Added “${label}”. ${flowCount(n, flow.noun, flow.nounPlural)} queued.`)
  }

  /** The "Discard this item" escape hatch on the finish-or-discard notice. */
  const discardDraft = () => {
    setValues({ ...flow.defaults })
    setEditingId(null)
    setPoliteMsg('Item discarded.')
    if (basket.length > 0) go(S, 1)
    else if (stepIdx !== 0) go(0, -1, { type: 'firstField' })
    else {
      setErrors({})
      setShowErrors(false)
      setFinishNotice(false)
    }
  }

  const chipEdit = (id) => {
    if (phase !== 'editing') return
    const target = basketRef.current.find((it) => it.id === id)
    if (!target || target.status === 'done' || target.status === 'saving') return
    // A dirty draft is auto-queued first (valid) or blocks the switch (invalid).
    if (dirty) {
      const fail = validateItem(flow, values, data)
      if (fail) {
        jumpToFail(fail, true)
        return
      }
      queueDraft()
    }
    setValues({ ...target.values })
    setEditingId(id)
    go(0, -1)
    setPoliteMsg(
      `Editing “${itemLabelOf(target.values)}”. Make your changes, then update it in the list.`,
    )
  }

  const chipRemove = (id) => {
    if (submitting) return
    const target = basketRef.current.find((it) => it.id === id)
    if (!target) return
    const remainingItems = basketRef.current.filter((it) => it.id !== id)
    setBasket(remainingItems)
    const pristineAfter = editingId === id ? true : !dirty
    if (editingId === id) {
      setEditingId(null)
      setValues({ ...flow.defaults })
    }
    setPoliteMsg(
      `Removed “${itemLabelOf(target.values)}”. ${
        remainingItems.length
          ? `${flowCount(remainingItems.length, flow.noun, flow.nounPlural)} queued.`
          : 'Nothing queued.'
      }`,
    )
    // Review with an empty basket and a pristine draft → bounce back to Basics.
    if (stepIdx === S && remainingItems.length === 0 && pristineAfter) go(0, -1, { type: 'firstField' })
  }

  // ── Submit lifecycle (sequential, continue-on-error, retry skips 'done') ───
  const runSubmit = async (ids = null) => {
    if (phaseRef.current === 'submitting') return
    const all = basketRef.current
    const itemsToRun = ids ? all.filter((it) => ids.includes(it.id)) : all
    if (!itemsToRun.length) return
    setPhase('submitting')
    setGuardOpen(false)

    // Local mirrors — setState is async, the outcome math can't wait for it.
    const statuses = new Map(all.map((it) => [it.id, it.status]))
    const runErrors = new Map()
    const preDone = itemsToRun.filter((it) => it.status === 'done').length
    const total = itemsToRun.length - preDone
    let idx = 0

    await submitQueue(
      itemsToRun,
      (item) => flow.submit(ctx, flow.toBody(item.values, data), item.values),
      {
        onStart: (id) => {
          idx += 1
          statuses.set(id, 'saving')
          setBasket((b) =>
            b.map((it) => (it.id === id ? { ...it, status: 'saving', error: undefined } : it)),
          )
          setPoliteMsg(`Saving ${idx} of ${total}…`)
        },
        onResult: (id, r) => {
          statuses.set(id, r.ok ? 'done' : 'error')
          if (!r.ok) runErrors.set(id, r.error)
          setBasket((b) =>
            b.map((it) =>
              it.id === id
                ? { ...it, status: r.ok ? 'done' : 'error', error: r.ok ? undefined : r.error }
                : it,
            ),
          )
          const item = itemsToRun.find((it) => it.id === id)
          const label = item ? itemLabelOf(item.values) : ''
          setPoliteMsg(
            r.ok
              ? `Saving ${idx} of ${total}… “${label}” saved.`
              : `Saving ${idx} of ${total}… “${label}” didn’t save.`,
          )
        },
        onDone: ({ ok }) => {
          // Parent refresh fires ONCE per batch that saved ≥1 NEW item — never
          // per item, never on a total failure (retry batches included).
          const newlySaved = ok - preDone
          if (newlySaved > 0) ctx.onSaved?.()

          const okTotal = [...statuses.values()].filter((s) => s === 'done').length
          const errTotal = [...statuses.values()].filter((s) => s === 'error').length
          if (errTotal === 0) {
            setAssertiveMsg(`All ${okTotal} saved.`)
            resultRef.current = {
              ok: okTotal,
              failed: 0,
              noun: flow.noun,
              nounPlural: flow.nounPlural,
            }
            setCelebrateN(okTotal)
            setPhase('celebrating')
          } else {
            const failId = runErrors.keys().next().value
            const failItem = all.find((it) => it.id === failId)
            const detail = failItem
              ? ` — ${itemLabelOf(failItem.values)}: ${apiErrorMessage(runErrors.get(failId))}`
              : ''
            setAssertiveMsg(
              okTotal > 0
                ? `${okTotal} saved, ${errTotal} failed${detail}`
                : `None saved${detail}. Check the errors and retry.`,
            )
            setPhase('editing')
            requestAnimationFrame(() => retryBtnRef.current?.focus())
          }
        },
      },
    )
  }

  /** Partial-failure exit: keep what saved, report the rest to FlowConfirm. */
  const finishAnyway = () => {
    onDone({ ok: okCount, failed: errCount, noun: flow.noun, nounPlural: flow.nounPlural })
  }

  // ── Celebration dwell → onDone (all-success only) ──────────────────────────
  useEffect(() => {
    if (phase !== 'celebrating') return undefined
    const raf = requestAnimationFrame(() => celebrateRef.current?.focus())
    const t = setTimeout(() => onDone(resultRef.current), reduce ? 300 : 1100)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const back = () => {
    if (submitting) return
    if (stepIdx > 0) go(stepIdx - 1, -1)
    else attemptLeave()
  }
  const attemptLeave = () => {
    if (submitting) {
      flashNotice()
      return
    }
    if (unsavedCount === 0) {
      onCancel()
      return
    }
    prevFocusRef.current = document.activeElement
    setGuardOpen(true)
  }

  // Enter inside a field step's form submits the step's primary.
  const submitStep = () => {
    if (phase !== 'editing') return
    if (!lastFieldStep) {
      next()
      return
    }
    if (editingId) updateInList()
    else if (reviewN > 0) reviewAndSave()
  }

  // ── Shared hue button recipes (§4) ─────────────────────────────────────────
  const primaryBtn = {
    className:
      'inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[14px] font-bold uppercase tracking-[0.06em] text-white outline-none transition-all hover:-translate-y-0.5 focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0',
    style: {
      backgroundColor: hue,
      boxShadow: `0 6px 20px ${hueRgba(hue, 0.35)}`,
      '--tw-ring-color': hueRgba(hue, 0.5),
    },
  }
  const outlineBtn = {
    className:
      'inline-flex items-center gap-1.5 rounded-lg border-2 bg-white px-4 py-2 text-[14px] font-bold uppercase tracking-[0.06em] outline-none transition-colors focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
    style: { borderColor: hueRgba(hue, 0.4), color: hue, '--tw-ring-color': hueRgba(hue, 0.5) },
  }

  const railLabels = [...flow.steps.map((s) => s.label), 'Review']
  const Icon = flow.Icon

  return (
    <div ref={rootRef} className="relative">
      {/* Live regions — polite carries steps/queue/progress, assertive the
          batch outcome + validation summaries. */}
      <p className="sr-only" aria-live="polite">
        {politeMsg}
      </p>
      <p className="sr-only" aria-live="assertive">
        {assertiveMsg}
      </p>

      {phase === 'loading' ? (
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          {reduce ? null : <Loader2 size={22} className="animate-spin" style={{ color: hue }} />}
          <p className="text-[14px] font-medium text-muted">Getting things ready…</p>
        </div>
      ) : phase === 'gated' && gate ? (
        <div className="px-6 py-12 text-center">
          <span
            className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl"
            style={{ backgroundColor: hueRgba(hue, 0.12), color: hue }}
          >
            {Icon ? <Icon size={22} /> : <AlertCircle size={22} />}
          </span>
          <h4 className="font-serif text-lg font-semibold text-navy">{gate.title}</h4>
          <p className="mx-auto mt-1.5 max-w-md text-[15px] leading-relaxed text-muted">
            {gate.body}
          </p>
          {gate.action && (
            <button
              type="button"
              onClick={() => goToOption?.(gate.action.goToOptionKey)}
              {...primaryBtn}
              className={`${primaryBtn.className} mt-5`}
            >
              {gate.action.label}
            </button>
          )}
        </div>
      ) : (
        <>
          {/* 1 · Hue strip header: the inner micro rail + the queue badge. */}
          <div
            className="px-5 py-4"
            style={{ background: `linear-gradient(100deg, ${hueRgba(hue, 0.14)}, transparent 60%)` }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <FlowStepRail
                  labels={railLabels}
                  current={stepIdx}
                  hue={hue}
                  reduce={reduce}
                  disabled={phase !== 'editing'}
                  onGoTo={(i) => phase === 'editing' && go(i, -1)}
                />
              </div>
              {basket.length > 0 && (
                <motion.span
                  key={pulseKey}
                  initial={false}
                  animate={reduce ? undefined : { scale: [1, 1.18, 1] }}
                  transition={{ duration: 0.45 }}
                  className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold"
                  style={{ backgroundColor: hueRgba(hue, 0.12), color: hue }}
                >
                  {flowCount(basket.length, flow.noun, flow.nounPlural)} queued
                </motion.span>
              )}
            </div>
          </div>

          {/* 2 · The basket strip — OUTSIDE the transformed step panel. */}
          {basket.length > 0 && (
            <FlowBasket
              basket={basket}
              flow={flow}
              data={data}
              hue={hue}
              reduce={reduce}
              editingId={editingId}
              disabled={phase !== 'editing'}
              onEdit={chipEdit}
              onRemove={chipRemove}
            />
          )}

          {/* 3 · Animated step panel — a white card on the work card's bg-section. */}
          <div className="px-5 py-5">
            <AnimatePresence mode="wait" custom={dir} initial={false}>
              <motion.div
                key={stepIdx}
                custom={dir}
                variants={reduce ? reducedVariants : panelVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={
                  reduce ? { duration: 0.15 } : { duration: 0.32, ease: [0.22, 1, 0.36, 1] }
                }
              >
                <div className="rounded-xl border border-rule/60 bg-white p-5">
                  {isReview ? (
                    <FlowReview
                      basket={basket}
                      flow={flow}
                      data={data}
                      hue={hue}
                      submitting={submitting}
                      onEditItem={chipEdit}
                      onRemoveItem={chipRemove}
                      onRetryItem={(id) => runSubmit([id])}
                    />
                  ) : (
                    <FlowFieldStep
                      flow={flow}
                      step={flow.steps[stepIdx]}
                      values={values}
                      errors={errors}
                      showErrors={showErrors}
                      data={data}
                      loadErrors={loadErrors}
                      hue={hue}
                      reduce={reduce}
                      idBase={idBase}
                      finishNotice={finishNotice}
                      onChange={handleFieldChange}
                      onSkip={reviewAndSave}
                      onDiscardDraft={discardDraft}
                      onSubmitStep={submitStep}
                    />
                  )}
                </div>
                <PanelFocus onReady={consumePendingFocus} />
              </motion.div>
            </AnimatePresence>
          </div>

          {/* 4 · Footer — outside the animated panel so buttons never slide. */}
          <div className="flex items-center justify-between gap-3 border-t border-rule/60 bg-white px-5 py-3.5">
            <button
              type="button"
              onClick={back}
              disabled={submitting}
              className="text-[14px] font-semibold text-muted transition-colors hover:text-navy disabled:opacity-50"
            >
              Back
            </button>
            <div className="flex flex-wrap items-center justify-end gap-2.5">
              {!isReview && !lastFieldStep && (
                <button type="button" onClick={next} {...primaryBtn}>
                  Next <ChevronRight size={15} />
                </button>
              )}

              {lastFieldStep && editingId && (
                <button type="button" onClick={updateInList} {...primaryBtn}>
                  <Check size={15} /> Update in list
                </button>
              )}
              {lastFieldStep && !editingId && (
                <>
                  <button type="button" onClick={addAndStartAnother} {...outlineBtn}>
                    <Plus size={15} /> Add &amp; start another
                  </button>
                  <button
                    type="button"
                    onClick={reviewAndSave}
                    disabled={reviewN === 0}
                    {...primaryBtn}
                  >
                    Review &amp; save{reviewN > 0 ? ` (${reviewN})` : ''}
                  </button>
                </>
              )}

              {isReview &&
                (errCount > 0 ? (
                  <>
                    <button
                      type="button"
                      ref={retryBtnRef}
                      onClick={() => runSubmit()}
                      disabled={submitting}
                      {...outlineBtn}
                    >
                      <RefreshCw size={14} /> Retry failed ({errCount})
                    </button>
                    {okCount > 0 && (
                      <button type="button" onClick={finishAnyway} disabled={submitting} {...primaryBtn}>
                        Finish anyway — keep the {okCount} saved
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => runSubmit()}
                    disabled={submitting || remaining === 0}
                    {...primaryBtn}
                  >
                    {submitting
                      ? 'Saving…'
                      : okCount > 0
                        ? `Save the rest (${remaining})`
                        : `Save all ${basket.length}`}
                  </button>
                ))}
            </div>
          </div>
        </>
      )}

      {/* "Still saving" notice — flashed when a leave is attempted mid-batch. */}
      <AnimatePresence>
        {submitNotice && (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-40 flex justify-center">
            <motion.p
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-full bg-navy px-4 py-2 text-[13px] font-semibold text-white shadow-card"
            >
              Hang on — still saving your items.
            </motion.p>
          </div>
        )}
      </AnimatePresence>

      {/* Discard-guard dialog — inside the card, never fullscreen. */}
      {guardOpen && (
        <GuardDialog
          count={unsavedCount}
          noun={flow.noun}
          nounPlural={flow.nounPlural}
          hue={hue}
          reduce={reduce}
          onKeep={() => {
            setGuardOpen(false)
            requestAnimationFrame(() => prevFocusRef.current?.focus?.())
          }}
          onDiscard={onCancel}
        />
      )}

      {/* Celebration beat — success only; reduced motion gets a static check. */}
      {phase === 'celebrating' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-white/95">
          <span
            className="relative flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ backgroundColor: hueRgba(hue, 0.12), color: hue }}
          >
            {!reduce && (
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-2xl border-2"
                style={{ borderColor: hueRgba(hue, 0.5) }}
                initial={{ scale: 1, opacity: 0.9 }}
                animate={{ scale: 2.1, opacity: 0 }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
              />
            )}
            <motion.span
              initial={reduce ? false : { scale: 0.4 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
              className="flex"
            >
              <Check size={30} strokeWidth={3} />
            </motion.span>
          </span>
          <h4
            ref={celebrateRef}
            tabIndex={-1}
            className="font-serif text-xl font-semibold text-navy outline-none"
          >
            {flowCount(celebrateN, flow.noun, flow.nounPlural)} in ✨
          </h4>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FlowFieldStep — one field step's panel body: serif heading (+ ghost "Skip
// details" on optional steps), the finish-or-discard notice, the 2-col field
// grid, and the "More" fold expander. A REAL <form> so Enter submits the
// step's primary (the hidden submit button enables implicit submission).
// Module-scope so its fold state is a clean hook (no conditional hooks).
// ─────────────────────────────────────────────────────────────────────────────
function FlowFieldStep({
  flow,
  step,
  values,
  errors,
  showErrors,
  data,
  loadErrors,
  hue,
  reduce,
  idBase,
  finishNotice,
  onChange,
  onSkip,
  onDiscardDraft,
  onSubmitStep,
}) {
  const visible = step.fields.filter((f) => !f.showIf || f.showIf(values))
  const mainFields = visible.filter((f) => !f.fold)
  const foldFields = visible.filter((f) => f.fold)
  // Open "More" when a fold field already holds a value (e.g. chip editing).
  const [moreOpen, setMoreOpen] = useState(() =>
    foldFields.some((f) => values[f.key] !== flow.defaults[f.key]),
  )
  // A blocked attempt with a folded-field error must reveal the field.
  useEffect(() => {
    if (showErrors && foldFields.some((f) => errors[f.key])) setMoreOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showErrors, errors])

  const renderField = (f, i) => (
    <FlowField
      key={f.key}
      field={f}
      idBase={idBase}
      value={values[f.key]}
      values={values}
      data={data}
      loadErrors={loadErrors}
      error={showErrors ? errors[f.key] : undefined}
      hue={hue}
      reduce={reduce}
      index={i}
      onChange={onChange}
    />
  )

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmitStep()
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4
          data-rf-heading
          tabIndex={-1}
          className="font-serif text-[17px] font-semibold text-navy outline-none"
        >
          {step.title}
        </h4>
        {step.optional && (
          <button
            type="button"
            onClick={onSkip}
            className="text-[13px] font-semibold underline-offset-2 outline-none hover:underline focus-visible:underline"
            style={{ color: hue }}
          >
            Skip details →
          </button>
        )}
      </div>
      {step.blurb && <p className="mt-0.5 text-[13.5px] leading-snug text-muted">{step.blurb}</p>}

      {finishNotice && (
        <div
          className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3.5 py-2.5"
          style={{ borderColor: hueRgba(hue, 0.35), backgroundColor: hueRgba(hue, 0.06) }}
        >
          <p className="text-[13px] font-medium text-navy">
            Finish this one or discard it before reviewing.
          </p>
          <button
            type="button"
            onClick={onDiscardDraft}
            className="min-h-[44px] text-[13px] font-semibold text-muted transition-colors hover:text-danger"
          >
            Discard this item
          </button>
        </div>
      )}

      <div data-rf-fields className="mt-4 grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
        {mainFields.map(renderField)}
        {foldFields.length > 0 && (
          <div className="sm:col-span-2">
            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              aria-expanded={moreOpen}
              className="flex min-h-[44px] items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.1em] outline-none focus-visible:ring-2"
              style={{ color: hue, '--tw-ring-color': hueRgba(hue, 0.5) }}
            >
              <ChevronDown
                size={15}
                className={`transition-transform ${moreOpen ? 'rotate-180' : ''}`}
              />
              More
            </button>
            <AnimatePresence initial={false}>
              {moreOpen && (
                <motion.div
                  initial={reduce ? false : { height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 pt-1 sm:grid-cols-2">
                    {foldFields.map((f, i) => renderField(f, mainFields.length + i))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Hidden submit — makes Enter run the step's primary in a multi-input form. */}
      <button type="submit" className="hidden" tabIndex={-1} aria-hidden="true">
        Continue
      </button>
    </form>
  )
}

// Runs the pending-focus consumer once the (possibly animated-in) panel is in
// the DOM. rAF here + rAF in the consumer = safely after AddDataWizard's own
// heading-focus effect (parent effects fire after child effects on mount).
function PanelFocus({ onReady }) {
  const cbRef = useRef(onReady)
  cbRef.current = onReady
  useEffect(() => {
    const raf = requestAnimationFrame(() => cbRef.current())
    return () => cancelAnimationFrame(raf)
  }, [])
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// GuardDialog — the inline discard confirmation (role=alertdialog), absolutely
// positioned within the work card. Focus-trapped between its two buttons; Esc
// and "Keep editing" stay (the opener restores focus); "Discard" leaves via
// the parent's onCancel.
// ─────────────────────────────────────────────────────────────────────────────
function GuardDialog({ count, noun, nounPlural, hue, reduce, onKeep, onDiscard }) {
  const dialogId = useId()
  const boxRef = useRef(null)
  const keepRef = useRef(null)
  useEffect(() => {
    keepRef.current?.focus()
  }, [])

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onKeep()
      return
    }
    if (e.key !== 'Tab') return
    const els = boxRef.current?.querySelectorAll('button')
    if (!els?.length) return
    const first = els[0]
    const last = els[els.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-navy-deep/30 p-4 backdrop-blur-[2px]"
      onKeyDown={onKeyDown}
    >
      <motion.div
        ref={boxRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${dialogId}-t`}
        aria-describedby={`${dialogId}-b`}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 340, damping: 28 }}
        className="w-full max-w-sm rounded-2xl border-2 bg-white p-5 text-center shadow-card"
        style={{ borderColor: hueRgba(hue, 0.3) }}
      >
        <h4 id={`${dialogId}-t`} className="font-serif text-[17px] font-semibold text-navy">
          Discard this batch?
        </h4>
        <p id={`${dialogId}-b`} className="mt-1 text-[14px] leading-relaxed text-muted">
          You have {count} unsaved {count === 1 ? noun : nounPlural} — discard{' '}
          {count === 1 ? 'it' : 'them'}?
        </p>
        <div className="mt-4 flex items-center justify-center gap-2.5">
          <button
            type="button"
            ref={keepRef}
            onClick={onKeep}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[14px] font-bold uppercase tracking-[0.06em] text-white outline-none transition-all hover:-translate-y-0.5 focus-visible:ring-2"
            style={{
              backgroundColor: hue,
              boxShadow: `0 6px 20px ${hueRgba(hue, 0.35)}`,
              '--tw-ring-color': hueRgba(hue, 0.5),
            }}
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="min-h-[44px] rounded-lg px-3 text-[14px] font-semibold text-muted outline-none transition-colors hover:text-danger focus-visible:ring-2"
            style={{ '--tw-ring-color': hueRgba(hue, 0.5) }}
          >
            Discard
          </button>
        </div>
      </motion.div>
    </div>
  )
}
