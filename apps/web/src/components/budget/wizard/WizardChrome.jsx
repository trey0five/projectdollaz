// ─────────────────────────────────────────────────────────────────────────────
// Wizard chrome — module-scope presentational pieces shared by BudgetWizard.
// Premium UI P4 (plan sketch 5): the progress is a row of 2px rules on the
// hairline with the step labels under them (not a card); a step renders inside
// ONE Panel (the only raised surface — it is a form), its running preview is a
// compact StatStrip, and Back / Next sit on the Panel's hairline foot. No
// state, no effects (React-Compiler safe).
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Panel, StatStrip, Stat, Button } from '../../ui/surface/index.js'
import '../../../styles/pending/b2-finance.css'

// Whole-dollar with thousands separators, accounting parentheses for a loss;
// em dash for blank.
function dollar(n) {
  if (n == null || Number.isNaN(n)) return '—'
  const s = `$${Math.abs(Number(n)).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  return Number(n) < 0 ? `(${s})` : s
}

// ── Progress rail: a 2px rule per step, filled up to the current step ────────
export function WizardProgress({ steps, current }) {
  const reduce = useReducedMotion()
  return (
    <ol className="b2-steps" aria-label="Setup progress">
      {steps.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={`prog-${label}-${i}`} className="b2-step" aria-current={active ? 'step' : undefined}>
            <span className="b2-step-rule">
              <motion.i
                initial={false}
                animate={{ scaleX: done || active ? 1 : 0 }}
                transition={{ duration: reduce ? 0 : 0.3 }}
              />
            </span>
            <span className="b2-step-label">
              <span className="tabular-nums">{i + 1}</span>
              {/* On a phone six labels cannot share a row — numbers only there;
                  the active step's title heads the Panel below anyway. */}
              <span className="hidden sm:inline"> {label}</span>
              <span className="sr-only sm:hidden"> {label}</span>
              {done ? <span className="sr-only"> (done)</span> : null}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

// ── Running mini-preview strip (3 figures) ───────────────────────────────────
export function MiniPreview({ result }) {
  if (!result) {
    return <p className="text-small italic text-ink2">Preview pending…</p>
  }
  const k = result.kpis ?? {}
  const net = k.netIncome ?? 0
  return (
    <StatStrip cols={3} className="stats-compact">
      <Stat label="Money in" value={dollar(k.totalRevenue)} />
      <Stat label="Spending" value={dollar(k.totalExpense)} />
      <Stat label="Net" value={dollar(net)} status={net >= 0 ? 'good' : 'risk'} />
    </StatStrip>
  )
}

// ── Step shell: ONE Panel — title + hint + body, the running preview, the nav ─
export function WizardStep({ title, hint, children, preview, nav }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      key={`step-${title}`}
      initial={reduce ? false : { opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.22 }}
    >
      <Panel footer={nav ?? null}>
        <div className="space-y-4">
          <div>
            <h3 className="font-serif text-title font-medium text-ink">{title}</h3>
            {hint && <p className="mt-1 text-small text-ink2">{hint}</p>}
          </div>
          {children}
          {preview != null && (
            <div className="border-t border-hair pt-3">
              <p className="toolbar-label">Budget so far</p>
              {preview}
            </div>
          )}
        </div>
      </Panel>
    </motion.div>
  )
}

// ── Back / Next (or Apply) navigation — rendered in the Panel's hairline foot ─
export function WizardNav({
  onBack,
  onNext,
  nextLabel = 'Next',
  nextDisabled = false,
  isApply = false,
  applyState = 'idle',
  applyError = '',
  showApplyHint = false,
}) {
  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-3">
      <Button variant="quiet" onClick={onBack} icon={<ArrowLeft size={14} />}>
        Back
      </Button>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {applyState === 'success' && (
          <span className="b2-callout py-1" data-tone="good" role="status">
            <CheckCircle2 size={14} aria-hidden="true" /> Applied.
          </span>
        )}
        {applyState === 'error' && (
          <span className="b2-callout py-1" data-tone="risk" role="alert">
            <AlertTriangle size={14} aria-hidden="true" /> {applyError}
          </span>
        )}
        {showApplyHint && (
          <span className="text-small italic text-ink2">View-only — owner/accountant can apply.</span>
        )}
        <Button variant="primary" onClick={onNext} disabled={nextDisabled}>
          {applyState === 'saving' ? (
            <>
              <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Applying…
            </>
          ) : (
            <>
              {nextLabel}
              {!isApply && <ArrowRight size={14} aria-hidden="true" />}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

// ── Overwrite notice (shown on terminal screens when replacing a budget) ─────
// Only warns when the budget would change SOURCE (e.g. import over a guided
// build, or vice-versa) — redoing the same kind isn't an alarming overwrite.
export function OverwriteNotice({ priorSource, nextKind }) {
  if (!priorSource || priorSource.kind === 'none' || priorSource.kind === nextKind) return null
  const what =
    priorSource.fileName != null
      ? `${priorSource.label} (${priorSource.fileName})`
      : priorSource.label
  return (
    <p className="b2-callout" data-tone="watch">
      <AlertTriangle size={14} aria-hidden="true" />
      <span>
        This replaces your current budget for this period, which was <strong>{what}</strong>.
      </span>
    </p>
  )
}
