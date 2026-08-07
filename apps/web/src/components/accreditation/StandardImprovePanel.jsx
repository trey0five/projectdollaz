// ─────────────────────────────────────────────────────────────────────────────
// StandardImprovePanel — "COG-15 is Not started. What do I actually do?"
//
// The register showed a rating and a coverage chip and left it there. A row
// reading "Not started · No evidence · Not scored" states three problems and
// offers three icon buttons, none of which is the answer — and the reader is
// expected to know that a rating comes from the rubric, that "no evidence" means
// the evidence panel underneath, and that neither is the same as improvement
// work. That is product knowledge a head of school does not have and should not
// need.
//
// So clicking a standard opens the steps FOR THAT STANDARD, in the order they
// actually have to happen, with the ones already done marked as done:
//
//   1. score it on the rubric — the only thing that moves the rating;
//   2. attach evidence — what makes the score defensible rather than claimed;
//   3. plan the work — when the gap is real and needs more than a document.
//
// WHAT IT DOES NOT DO. It does not tell the school what score to give itself,
// does not estimate a lift, and does not adopt improvement work on the school's
// behalf. Those are judgements, and this panel's job is to remove confusion
// about the mechanism, not to make the judgement for anybody.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion'
import { X, Check } from 'lucide-react'
import RubricPicker from './RubricPicker.jsx'

/** One step. `done` renders it as history rather than as a thing still to do. */
function Step({ n, title, body, done, children }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
          done ? 'bg-emerald-100 text-emerald-700' : 'bg-navy text-white'
        }`}
      >
        {done ? <Check size={13} strokeWidth={3} /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-[14px] font-semibold ${done ? 'text-muted' : 'text-navy'}`}>{title}</p>
        {body ? <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{body}</p> : null}
        {children ? <div className="mt-2">{children}</div> : null}
      </div>
    </li>
  )
}

export default function StandardImprovePanel({
  open,
  standard,
  rubricLabels = null,
  canEdit = false,
  onRubric = null,
  onOpenImprovement = null,
  onClose,
  /**
   * THE ATTACH CONTROLS THEMSELVES, rendered inside step 2.
   *
   * The first cut had a button here that scrolled the page to the standard's row
   * and expanded it — which is to say, it told a school to attach evidence and
   * then took it to a chevron. The controls were real and had always worked; they
   * were simply somewhere the instruction did not go. A step that names a task
   * and then hands you a shortcut to somewhere else is worse than no step.
   *
   * So the page passes its EXISTING evidence panel in here. Not a copy — the same
   * component the expanded row renders, so there is exactly one attach flow in
   * this product and it cannot drift into two.
   */
  evidenceSlot = null,
}) {
  const reduce = useReducedMotion()
  if (!standard) return null

  const scored = standard.rubricScore != null
  const evidenced = (standard.evidenceCount ?? 0) > 0
  // An ASSURANCE gate has no rubric — it is a pass/fail evidence gate, and
  // offering a 1–4 picker for one would be a control that does nothing.
  const isAssurance = standard.isAssurance === true

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute inset-0 bg-navy/40 backdrop-blur-[2px]"
          />
          <motion.aside
            role="dialog"
            aria-label={`${standard.code} — how to improve this`}
            initial={reduce ? { opacity: 0 } : { x: 32, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { x: 32, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="relative z-10 flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-2xl"
          >
            <header className="sticky top-0 z-10 border-b border-rule/60 bg-white/95 px-6 py-4 backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="rounded-md border border-rule/70 bg-section px-2 py-0.5 text-[12px] font-semibold text-navy">
                    {standard.code}
                  </span>
                  <h2 className="mt-2 font-serif text-[19px] font-semibold leading-snug text-navy">
                    {standard.title}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="shrink-0 rounded-lg border border-rule/60 p-1.5 text-muted transition hover:text-navy"
                >
                  <X size={16} />
                </button>
              </div>
            </header>

            <div className="flex-1 px-6 py-5">
              <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">
                What raises this standard
              </p>
              <ol className="mt-3 space-y-4">
                {isAssurance ? (
                  <Step
                    n={1}
                    done={evidenced}
                    title="Attach the artifact"
                    body={
                      evidenced
                        ? 'This gate is satisfied — an artifact is attached.'
                        : 'This is an assurance gate: it is pass or fail on evidence, not a rubric score. One attached artifact settles it, and until then the gate blocks accreditation regardless of how well the rest scores.'
                    }
                  >
                    {evidenceSlot}
                  </Step>
                ) : (
                  <>
                    <Step
                      n={1}
                      done={scored}
                      title="Score it against the rubric"
                      body={
                        scored
                          ? 'Scored. Change it here if your own assessment has moved.'
                          : 'The rating comes from this score and nothing else — an unscored standard is not a zero, it is unanswered.'
                      }
                    >
                      {canEdit && onRubric ? (
                        <RubricPicker
                          value={standard.rubricScore ?? null}
                          labels={rubricLabels}
                          activeLabel={standard.rubricLabel ?? null}
                          onChange={(v) => onRubric(standard.id, v)}
                        />
                      ) : null}
                    </Step>
                    <Step
                      n={2}
                      done={evidenced}
                      title="Attach evidence"
                      body={
                        evidenced
                          ? `${standard.evidenceCount} attached. A visiting team reads these, not the score.`
                          : 'A score with nothing behind it is documented but not defensible — the two figures on your hero are exactly this difference. Attach a document you already hold, or pull one straight from your policies, minutes and board reports.'
                      }
                    >
                      {evidenceSlot}
                    </Step>
                    <Step
                      n={3}
                      title="Plan the work"
                      body="When the gap is real rather than undocumented, improvement work is where it gets an owner and a date."
                    >
                      {onOpenImprovement ? (
                        <button
                          type="button"
                          onClick={() => {
                            onOpenImprovement(standard)
                            onClose?.()
                          }}
                          className="rounded-lg border border-rule/70 bg-white px-3 py-1.5 text-[13px] font-semibold text-navy transition hover:border-navy/40"
                        >
                          Open improvement
                        </button>
                      ) : null}
                    </Step>
                  </>
                )}
              </ol>
            </div>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
