// ─────────────────────────────────────────────────────────────────────────────
// Wizard chrome — module-scope presentational pieces shared by BudgetWizard:
// a progress rail, a step shell (title + body + optional mini-preview), and the
// Back/Next navigation bar. No state, no effects (React-Compiler safe).
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Loader2, CheckCircle2, AlertTriangle, Coins, Wallet, TrendingUp } from 'lucide-react'

// Whole-dollar with thousands separators; em dash for blank.
function dollar(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

// ── Progress rail ────────────────────────────────────────────────────────────
export function WizardProgress({ steps, current }) {
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <div key={`prog-${label}-${i}`} className="flex flex-1 flex-col gap-1">
            <div className="relative h-1.5 overflow-hidden rounded-full bg-rule/40">
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full bg-gold-gradient"
                initial={false}
                animate={{ width: done || active ? '100%' : '0%' }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <span
              className={`truncate text-[10.5px] font-semibold uppercase tracking-[0.04em] ${
                active ? 'text-navy' : done ? 'text-gold' : 'text-muted'
              }`}
            >
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Running mini-preview strip (3 KPIs) ──────────────────────────────────────
export function MiniPreview({ result }) {
  if (!result) {
    return (
      <div className="card-soft border-dashed px-4 py-3 text-center">
        <p className="text-[12.5px] italic text-muted">Preview pending…</p>
      </div>
    )
  }
  const k = result.kpis ?? {}
  const net = k.netIncome ?? 0
  const cards = [
    { icon: Coins, label: 'Money in', value: dollar(k.totalRevenue), tone: 'navy' },
    { icon: Wallet, label: 'Spending', value: dollar(k.totalExpense), tone: 'navy' },
    {
      icon: TrendingUp,
      label: 'Net',
      value: dollar(net),
      tone: net >= 0 ? 'positive' : 'negative',
    },
  ]
  return (
    <div className="grid grid-cols-3 gap-2">
      {cards.map((c) => {
        const Icon = c.icon
        const toneCls =
          c.tone === 'positive' ? 'text-emerald-600' : c.tone === 'negative' ? 'text-rose-600' : 'text-navy'
        return (
          <div key={`mini-${c.label}`} className="card-soft flex flex-col gap-0.5 p-2.5">
            <span className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-muted">
              <Icon size={12} className="text-gold" /> {c.label}
            </span>
            <span className={`font-serif text-[15px] font-semibold tabular-nums ${toneCls}`}>{c.value}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Step shell: title + hint + body, with optional running preview below ─────
export function WizardStep({ title, hint, children, preview }) {
  return (
    <motion.div
      key={`step-${title}`}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.22 }}
      className="space-y-4"
    >
      <div>
        <h3 className="font-serif text-lg font-semibold text-navy">{title}</h3>
        {hint && <p className="text-[13px] text-muted">{hint}</p>}
      </div>
      {children}
      {preview != null && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Budget so far</p>
          {preview}
        </div>
      )}
    </motion.div>
  )
}

// ── Back / Next (or Apply) navigation bar ────────────────────────────────────
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
    <div className="card-soft sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 border-gold/40 bg-white/95 p-3.5 shadow-glow backdrop-blur">
      <button type="button" onClick={onBack} className="btn-ghost inline-flex items-center gap-2">
        <ArrowLeft size={15} /> Back
      </button>
      <div className="flex items-center gap-3">
        {applyState === 'success' && (
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-emerald-600">
            <CheckCircle2 size={16} /> Applied.
          </span>
        )}
        {applyState === 'error' && (
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-rose-600">
            <AlertTriangle size={16} /> {applyError}
          </span>
        )}
        {showApplyHint && (
          <span className="text-[12px] italic text-muted">View-only — owner/accountant can apply.</span>
        )}
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={onNext}
          disabled={nextDisabled}
          className="btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {applyState === 'saving' ? (
            <>
              <Loader2 size={15} className="animate-spin" /> Applying…
            </>
          ) : (
            <>
              {nextLabel}
              {!isApply && <ArrowRight size={15} />}
            </>
          )}
        </motion.button>
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
    <div className="rounded-xl border border-amber-300 bg-amber-50/70 px-4 py-3">
      <p className="flex items-start gap-2 text-[12.5px] text-amber-800">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        <span>
          This replaces your current budget for this period, which was{' '}
          <strong>{what}</strong>.
        </span>
      </p>
    </div>
  )
}
